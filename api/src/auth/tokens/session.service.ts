import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type RevokeReason, type UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AuditService } from '../../audit/audit.service';
import { randomToken, sha256Hex } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { REFRESH_GRACE_MS, REFRESH_MAX_RACES, SESSION_TTL } from '../auth.constants';
import { BoundedMap } from '../bounded-map';
import { isWellFormedRefreshToken } from './auth-cookies';
import { TokenService } from './token.service';

type Tx = Prisma.TransactionClient | PrismaService;

export interface SessionMeta {
  ipHash: string | null;
  userAgent: string | null;
}

export interface IssuedSession {
  userId: string;
  familyId: string;
  accessToken: string;
  refreshToken: string;
  /** Vence por inactividad (fecha de la cookie). */
  expiresAt: Date;
  /** Vida absoluta de la sesión. */
  familyExpiresAt: Date;
}

export type RotateResult =
  | ({ kind: 'ok' } & IssuedSession)
  | { kind: 'invalid' }
  /** Otra pestaña ya rotó este token hace menos de 10 s: el navegador tiene la cookie nueva. */
  | { kind: 'race' };

class RotationRace extends Error {}

/**
 * Sesiones = familias de refresh tokens. Solo se guarda el SHA-256 del token; cada uso lo
 * rota, y presentar uno ya rotado fuera de la gracia revoca la familia entera (robo).
 */
@Injectable()
export class SessionService {
  private readonly log = new Logger('Sessions');
  /** Respuestas REFRESH_RACE por familia (en memoria; la ventana es de segundos). */
  private readonly races = new BoundedMap<string, number>(10_000, 60_000);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /** Abre una sesión nueva (login, MFA, cambio de contraseña). */
  async create(user: { id: string; role: UserRole; tokenVersion: number }, meta: SessionMeta, tx: Tx = this.prisma): Promise<IssuedSession> {
    const now = Date.now();
    const ttl = SESSION_TTL[user.role];
    const familyId = randomBytes(15).toString('hex');
    const refreshToken = randomToken(32);
    const familyExpiresAt = new Date(now + ttl.absoluteMs);
    const expiresAt = new Date(Math.min(now + ttl.idleMs, familyExpiresAt.getTime()));
    await tx.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: sha256Hex(refreshToken),
        expiresAt,
        familyExpiresAt,
        userAgent: meta.userAgent,
        ipHash: meta.ipHash,
      },
    });
    const accessToken = this.tokens.signAccess({ sub: user.id, tv: user.tokenVersion, sid: familyId });
    return { userId: user.id, familyId, accessToken, refreshToken, expiresAt, familyExpiresAt };
  }

  /** Rota el refresh token: compare-and-set dentro de una transacción. */
  async rotate(raw: string | null, meta: SessionMeta): Promise<RotateResult> {
    if (!isWellFormedRefreshToken(raw)) return { kind: 'invalid' };
    const row = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256Hex(raw) },
      select: {
        id: true,
        familyId: true,
        expiresAt: true,
        familyExpiresAt: true,
        replacedAt: true,
        replacedById: true,
        revokedAt: true,
        user: { select: { id: true, username: true, role: true, status: true, tokenVersion: true } },
      },
    });
    if (!row || row.revokedAt) return { kind: 'invalid' };
    const now = new Date();

    if (row.replacedAt) {
      // ¿El sucesor ya se usó? Entonces no es otra pestaña: alguien más tiene la cookie.
      let successorUsed = false;
      if (row.replacedById) {
        const next = await this.prisma.refreshToken.findUnique({
          where: { id: row.replacedById },
          select: { replacedAt: true },
        });
        successorUsed = !!next?.replacedAt;
      }
      if (now.getTime() - row.replacedAt.getTime() > REFRESH_GRACE_MS || successorUsed) {
        await this.revokeFamily(row.familyId, 'REUSE_DETECTED');
        await this.audit.record({
          actorId: row.user.id,
          actorUsername: row.user.username,
          action: 'security.refresh_reuse',
          targetType: 'User',
          targetId: row.user.id,
          metadata: { reason: successorUsed ? 'successor_used' : 'after_grace' },
          ipHash: meta.ipHash,
        });
        return { kind: 'invalid' };
      }
      const races = (this.races.get(row.familyId) ?? 0) + 1;
      this.races.set(row.familyId, races);
      if (races > REFRESH_MAX_RACES) {
        await this.revokeFamily(row.familyId, 'REUSE_DETECTED');
        await this.audit.record({
          actorId: row.user.id,
          actorUsername: row.user.username,
          action: 'security.refresh_reuse',
          targetType: 'User',
          targetId: row.user.id,
          metadata: { reason: 'race_limit' },
          ipHash: meta.ipHash,
        });
        return { kind: 'invalid' };
      }
      return { kind: 'race' };
    }

    if (row.expiresAt <= now || row.familyExpiresAt <= now) {
      await this.revokeFamily(row.familyId, 'EXPIRED');
      return { kind: 'invalid' };
    }
    if (row.user.status !== 'ACTIVE') {
      await this.revokeFamily(row.familyId, 'ADMIN_ACTION');
      return { kind: 'invalid' };
    }

    const ttl = SESSION_TTL[row.user.role];
    const refreshToken = randomToken(32);
    const expiresAt = new Date(Math.min(now.getTime() + ttl.idleMs, row.familyExpiresAt.getTime()));
    try {
      await this.prisma.$transaction(async (tx) => {
        const next = await tx.refreshToken.create({
          data: {
            userId: row.user.id,
            familyId: row.familyId,
            tokenHash: sha256Hex(refreshToken),
            expiresAt,
            familyExpiresAt: row.familyExpiresAt,
            userAgent: meta.userAgent,
            ipHash: meta.ipHash,
          },
          select: { id: true },
        });
        // Solo gana quien encuentre la fila sin reemplazar ni revocar.
        const cas = await tx.refreshToken.updateMany({
          where: { id: row.id, replacedAt: null, revokedAt: null },
          data: { replacedAt: now, replacedById: next.id, lastUsedAt: now },
        });
        if (cas.count !== 1) throw new RotationRace();
      });
    } catch (err) {
      if (err instanceof RotationRace) return { kind: 'race' };
      throw err;
    }

    const accessToken = this.tokens.signAccess({ sub: row.user.id, tv: row.user.tokenVersion, sid: row.familyId });
    return {
      kind: 'ok',
      userId: row.user.id,
      familyId: row.familyId,
      accessToken,
      refreshToken,
      expiresAt,
      familyExpiresAt: row.familyExpiresAt,
    };
  }

  /** Cierra la sesión de este token (logout). Silencioso si no existe. */
  async revokeByToken(raw: string | null, reason: RevokeReason): Promise<void> {
    if (!isWellFormedRefreshToken(raw)) return;
    const row = await this.prisma.refreshToken.findUnique({ where: { tokenHash: sha256Hex(raw) }, select: { familyId: true } });
    if (row) await this.revokeFamily(row.familyId, reason);
  }

  async revokeFamily(familyId: string, reason: RevokeReason, tx: Tx = this.prisma): Promise<number> {
    const res = await tx.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return res.count;
  }

  /**
   * Revoca todas las sesiones del usuario. Quien lo llame debe subir también tokenVersion
   * (en la misma transacción) para que los access tokens emitidos mueran ya.
   */
  async revokeAllForUser(userId: string, reason: RevokeReason, tx: Tx = this.prisma): Promise<number> {
    const res = await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    return res.count;
  }

  /** Borra filas que ya no sirven ni para detectar reutilización. */
  async purgeExpired(now = new Date()): Promise<number> {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const res = await this.prisma.refreshToken.deleteMany({
      where: {
        OR: [{ familyExpiresAt: { lt: weekAgo } }, { expiresAt: { lt: weekAgo } }, { revokedAt: { lt: weekAgo } }],
      },
    });
    if (res.count) this.log.log(`refresh tokens purgados: ${res.count}`);
    return res.count;
  }

  sweepMemory(): void {
    this.races.sweep();
  }
}
