import { Injectable, Logger } from '@nestjs/common';
import type { EmailTokenType, Prisma, UserRole, UserStatus } from '@prisma/client';
import { LIMITS, normalizeEmail } from '@fersua/shared';
import { hmacHex, randomToken, safeEqual, sha256Hex } from '../../common/crypto';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';

type Tx = Prisma.TransactionClient | PrismaService;

/** Vigencia de cada tipo (LIMITS.retention): verificar el correo 48 h, restablecer 30 min. */
export const EMAIL_TOKEN_TTL_MS: Record<EmailTokenType, number> = {
  EMAIL_VERIFY: LIMITS.retention.verifyTokenHours * 60 * 60 * 1000,
  PASSWORD_RESET: LIMITS.retention.resetTokenMinutes * 60 * 1000,
};

/** Las filas vencidas se guardan un día más (los topes por usuario miran las últimas 24 h). */
const PURGE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * `<32 bytes aleatorios><16 bytes de HMAC>` en base64url, sin separador: 43 + 22 = 65
 * caracteres [A-Za-z0-9_-] (la web valida el fragmento #t= con ese alfabeto).
 */
const RANDOM_LEN = 43;
const EMAIL_TOKEN_RE = /^[A-Za-z0-9_-]{65}$/;

export function isWellFormedEmailToken(raw: unknown): raw is string {
  return typeof raw === 'string' && EMAIL_TOKEN_RE.test(raw);
}

/** Dueño del token tal como está HOY en la BD. */
export interface EmailTokenUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
}

export interface ValidEmailToken {
  id: string;
  user: EmailTokenUser;
}

/**
 * Tokens de un solo uso que viajan por correo (verificar el correo y restablecer la contraseña).
 * - En la BD solo va el SHA-256 del token; el token en claro sale una vez, en el enlace.
 * - Emitir uno nuevo anula los anteriores del mismo tipo que sigan sin usar.
 * - Consumir es un compare-and-set: de dos peticiones con el mismo token, solo una gana.
 * - Va atado al correo al que se envió: la segunda parte es un HMAC de (token, usuario, correo).
 *   Si el admin cambia o quita el correo, los enlaces que llegaron al buzón anterior dejan de
 *   servir sin tener que acordarse de borrarlos (ni verifican el correo nuevo ni restablecen).
 */
@Injectable()
export class EmailTokenService {
  private readonly log = new Logger('EmailTokens');
  private readonly bindKey: string;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfig,
  ) {
    this.bindKey = hmacHex(config.jwtAccessSecret, 'fersua:email-token');
  }

  /** Emite un token nuevo para `user.email` y anula los anteriores del mismo tipo. */
  async issue(
    user: { id: string; email: string },
    type: EmailTokenType,
    opts: { ipHash?: string | null; now?: Date } = {},
    tx: Tx = this.prisma,
  ): Promise<string> {
    const now = opts.now ?? new Date();
    await this.invalidate(user.id, type, tx, now);
    const random = randomToken(32);
    const token = `${random}${this.bind(random, user.id, user.email)}`;
    await tx.emailToken.create({
      data: {
        userId: user.id,
        type,
        tokenHash: sha256Hex(token),
        expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL_MS[type]),
        requestIpHash: opts.ipHash ?? null,
      },
    });
    return token;
  }

  /** Cuántos se emitieron desde `since` (usados o no): topes por usuario. */
  countSince(userId: string, type: EmailTokenType, since: Date): Promise<number> {
    return this.prisma.emailToken.count({ where: { userId, type, createdAt: { gt: since } } });
  }

  /**
   * El token si existe, es de este tipo, no se usó, no venció y sigue atado al correo actual
   * del usuario. No lo consume: así una contraseña débil no quema el enlace.
   */
  async find(raw: unknown, type: EmailTokenType, now = new Date()): Promise<ValidEmailToken | null> {
    if (!isWellFormedEmailToken(raw)) return null;
    const row = await this.prisma.emailToken.findUnique({
      where: { tokenHash: sha256Hex(raw) },
      select: {
        id: true,
        type: true,
        expiresAt: true,
        usedAt: true,
        user: { select: { id: true, username: true, email: true, role: true, status: true, emailVerifiedAt: true } },
      },
    });
    if (!row || row.type !== type || row.usedAt || row.expiresAt.getTime() <= now.getTime()) return null;
    const { email } = row.user;
    const random = raw.slice(0, RANDOM_LEN);
    const tag = raw.slice(RANDOM_LEN);
    if (!email || !safeEqual(tag, this.bind(random, row.user.id, email))) return null;
    return { id: row.id, user: { ...row.user, email } };
  }

  /** Marca el token como usado si nadie lo usó antes. true = esta petición ganó. */
  async consume(id: string, tx: Tx = this.prisma, now = new Date()): Promise<boolean> {
    const res = await tx.emailToken.updateMany({
      where: { id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    return res.count === 1;
  }

  /** Anula los tokens sin usar del usuario (de un tipo o de todos). Las filas quedan para los topes. */
  async invalidate(userId: string, type: EmailTokenType | null, tx: Tx = this.prisma, now = new Date()): Promise<number> {
    const res = await tx.emailToken.updateMany({
      where: { userId, usedAt: null, ...(type ? { type } : {}) },
      data: { usedAt: now },
    });
    return res.count;
  }

  /** Borra los que vencieron hace más de un día (todos vencen en 48 h como mucho). */
  async purgeExpired(now = new Date()): Promise<number> {
    const res = await this.prisma.emailToken.deleteMany({ where: { expiresAt: { lt: new Date(now.getTime() - PURGE_AFTER_MS) } } });
    if (res.count) this.log.log(`tokens de correo purgados: ${res.count}`);
    return res.count;
  }

  private bind(random: string, userId: string, email: string): string {
    return Buffer.from(hmacHex(this.bindKey, `${random}|${userId}|${normalizeEmail(email)}`), 'hex')
      .subarray(0, 16)
      .toString('base64url');
  }
}
