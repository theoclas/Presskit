import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import type { ProfileStatus } from '@fersua/shared';
import { AuditService } from '../audit/audit.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  DRAFT_DELETE_DAYS,
  DRAFT_WARN_DAYS,
  REJECTED_DELETE_DAYS,
  UNVERIFIED_USER_DAYS,
  daysBefore,
  draftAction,
  rejectedExpired,
  unverifiedUserExpired,
} from './owner-rules';
import { ProfileNotifier, ownerRecipientOf } from './profile-notifier.service';

/** Acciones de auditoría del job (sin actor: las hace el sistema). */
export const PURGE_ACTIONS = {
  draftWarned: 'system.profile.draft_warned',
  draftPurged: 'system.profile.draft_purged',
  rejectedPurged: 'system.profile.rejected_purged',
  userPurged: 'system.user.unverified_purged',
} as const;

/** Filas por corrida y tipo: si hay más, siguen al día siguiente (el job es idempotente). */
const BATCH = 200;

export interface PurgeSummary {
  draftsWarned: number;
  draftsPurged: number;
  rejectedPurged: number;
  usersPurged: number;
}

const ownerSelect = { email: true, emailVerifiedAt: true, role: true, status: true } as const;

/**
 * Purgas de M3 (docs/api-m3.md, "Tareas programadas"; H3 y M12 de la crítica de seguridad).
 * Cada día a las 04:50 de Bogotá:
 * - Borradores con dueño: aviso `draft-expiring` a los 21 días sin actividad (una vez por racha)
 *   y borrado del perfil a los 30 (media incluida; el usuario no).
 * - Rechazados con dueño sin actividad en 30 días: se borra el perfil.
 * - Cuentas USER que se registraron solas y no verificaron el correo en 14 días, sin perfil o con
 *   perfil DRAFT: se borra la cuenta y su borrador.
 * Nunca toca perfiles APPROVED, SUSPENDED ni PENDING_REVIEW, perfiles sin dueño (los arma el
 * admin), cuentas ADMIN ni cuentas que el admin creó o administró (p. ej. les cambió el correo).
 * Cada borrado relee y BLOQUEA la fila (SELECT … FOR UPDATE) con las mismas condiciones antes de
 * borrar: si el DJ editó o verificó justo antes, no se borra nada. Los archivos se borran después
 * del commit. Todo queda auditado sin datos personales.
 */
@Injectable()
export class OwnerPurgeJob {
  private readonly log = new Logger('OwnerPurge');
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly media: MediaService,
    private readonly notifier: ProfileNotifier,
  ) {}

  @Cron('0 50 4 * * *', { name: 'owner-purge', timeZone: 'America/Bogota' })
  async run(at?: Date): Promise<PurgeSummary> {
    // El programador de cron puede pasar su propio argumento: solo se acepta una fecha.
    const now = at instanceof Date ? at : new Date();
    const summary: PurgeSummary = { draftsWarned: 0, draftsPurged: 0, rejectedPurged: 0, usersPurged: 0 };
    if (this.running) return summary;
    this.running = true;
    try {
      await this.step('borradores', () => this.drafts(now, summary));
      await this.step('rechazados', () => this.rejected(now, summary));
      await this.step('cuentas sin verificar', () => this.unverifiedUsers(now, summary));
      if (summary.draftsWarned || summary.draftsPurged || summary.rejectedPurged || summary.usersPurged) {
        this.log.log(
          `purga: avisos=${summary.draftsWarned} borradores=${summary.draftsPurged} rechazados=${summary.rejectedPurged} cuentas=${summary.usersPurged}`,
        );
      }
      return summary;
    } finally {
      this.running = false;
    }
  }

  /** Un paso que falla no frena los demás (se reintenta mañana). */
  private async step(what: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.log.error(`purga de ${what} falló: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`);
    }
  }

  private async drafts(now: Date, summary: PurgeSummary): Promise<void> {
    const rows = await this.prisma.djProfile.findMany({
      where: { status: 'DRAFT', user: { is: { role: 'USER' } }, lastActivityAt: { lt: daysBefore(now, DRAFT_WARN_DAYS) } },
      select: { id: true, lastActivityAt: true, user: { select: ownerSelect } },
      orderBy: { lastActivityAt: 'asc' },
      take: BATCH,
    });
    for (const p of rows) {
      // Último aviso de ESTA racha de inactividad (uno anterior a la última edición no cuenta).
      const warned = await this.prisma.auditLog.findFirst({
        where: { action: PURGE_ACTIONS.draftWarned, profileId: p.id, createdAt: { gte: p.lastActivityAt } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const to = ownerRecipientOf(p.user);
      const action = draftAction({ lastActivityAt: p.lastActivityAt, warnedAt: warned?.createdAt ?? null, canMail: to !== null }, now);
      if (action === 'warn' && to) {
        // Solo se audita (y cuenta como avisado) si el correo quedó encolado; si no, mañana otra vez.
        if (!this.notifier.draftExpiring(to)) continue;
        await this.audit.record({
          action: PURGE_ACTIONS.draftWarned,
          targetType: 'DjProfile',
          targetId: p.id,
          profileId: p.id,
          metadata: { idleDays: idleDays(p.lastActivityAt, now) },
        });
        summary.draftsWarned++;
      } else if (action === 'delete') {
        if (await this.removeProfile(p.id, 'DRAFT', daysBefore(now, DRAFT_DELETE_DAYS), PURGE_ACTIONS.draftPurged, now)) {
          summary.draftsPurged++;
        }
      }
    }
  }

  private async rejected(now: Date, summary: PurgeSummary): Promise<void> {
    const cutoff = daysBefore(now, REJECTED_DELETE_DAYS);
    const rows = await this.prisma.djProfile.findMany({
      where: { status: 'REJECTED', user: { is: { role: 'USER' } }, lastActivityAt: { lt: cutoff } },
      select: { id: true, status: true, lastActivityAt: true },
      orderBy: { lastActivityAt: 'asc' },
      take: BATCH,
    });
    for (const p of rows) {
      if (!rejectedExpired(p, now)) continue;
      if (await this.removeProfile(p.id, 'REJECTED', cutoff, PURGE_ACTIONS.rejectedPurged, now)) summary.rejectedPurged++;
    }
  }

  private async unverifiedUsers(now: Date, summary: PurgeSummary): Promise<void> {
    const cutoff = daysBefore(now, UNVERIFIED_USER_DAYS);
    const rows = await this.prisma.user.findMany({
      where: {
        role: 'USER',
        email: { not: null },
        emailVerifiedAt: null,
        createdAt: { lt: cutoff },
        OR: [{ profile: { is: null } }, { profile: { is: { status: 'DRAFT' } } }],
      },
      select: { id: true, role: true, email: true, emailVerifiedAt: true, createdAt: true, profile: { select: { status: true } } },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    });
    if (!rows.length) return;
    // Las cuentas que el admin creó (alta manual) o tocó (p. ej. les cambió el correo, que queda sin
    // verificar) no se purgan: las administra él.
    const byAdmin = await this.prisma.auditLog.findMany({
      where: { action: { startsWith: 'admin.user.' }, targetType: 'User', targetId: { in: rows.map((u) => u.id) } },
      select: { targetId: true },
    });
    const adminManaged = new Set(byAdmin.map((a) => a.targetId));
    for (const u of rows) {
      const expired = unverifiedUserExpired(
        {
          role: u.role,
          email: u.email,
          emailVerifiedAt: u.emailVerifiedAt,
          createdAt: u.createdAt,
          managedByAdmin: adminManaged.has(u.id),
          profileStatus: u.profile?.status ?? null,
        },
        now,
      );
      if (expired && (await this.removeUser(u.id, cutoff))) summary.usersPurged++;
    }
  }

  /**
   * Borra un perfil nunca publicado (DRAFT o REJECTED no vienen de APPROVED) con todo lo suyo.
   * Su registro del art. 53 también se borra: sin página pública no hubo a quién entregarlo
   * (a diferencia del borrado del admin, que lo conserva 12 meses). Devuelve true si borró.
   */
  private async removeProfile(profileId: string, status: ProfileStatus, idleBefore: Date, action: string, now: Date): Promise<boolean> {
    const media = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM DjProfile
          WHERE id = ${profileId} AND status = ${status} AND lastActivityAt < ${idleBefore} AND userId IS NOT NULL
          FOR UPDATE`;
        if (!locked.length) return null;
        const row = await tx.djProfile.findUnique({ where: { id: profileId }, select: { lastActivityAt: true } });
        await tx.djLegalInfo.deleteMany({ where: { profileId } });
        const count = await this.media.removeAllForProfile(profileId, tx);
        await tx.djProfile.delete({ where: { id: profileId } });
        await this.audit.record(
          {
            action,
            targetType: 'DjProfile',
            targetId: profileId,
            profileId,
            metadata: { status, media: count, idleDays: row ? idleDays(row.lastActivityAt, now) : null },
          },
          tx,
        );
        return count;
      },
      { timeout: 15_000, maxWait: 5_000 },
    );
    if (media === null) return false;
    await this.media.removeProfileFiles(profileId);
    return true;
  }

  /** Borra la cuenta sin verificar y, si lo tiene, su borrador. Devuelve true si borró. */
  private async removeUser(userId: string, createdBefore: Date): Promise<boolean> {
    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT id FROM User
          WHERE id = ${userId} AND role = 'USER' AND emailVerifiedAt IS NULL AND email IS NOT NULL AND createdAt < ${createdBefore}
          FOR UPDATE`;
        if (!locked.length) return null;
        const profiles = await tx.$queryRaw<{ id: string; status: string }[]>`
          SELECT id, status FROM DjProfile WHERE userId = ${userId} FOR UPDATE`;
        const profile = profiles[0];
        // Si entre la selección y aquí el perfil se envió a revisión (o cambió de estado), no se toca.
        if (profile && profile.status !== 'DRAFT') return null;
        let media = 0;
        if (profile) {
          await tx.djLegalInfo.deleteMany({ where: { profileId: profile.id } });
          media = await this.media.removeAllForProfile(profile.id, tx);
          await tx.djProfile.delete({ where: { id: profile.id } });
        }
        // Cascada: sesiones y tokens de correo. La auditoría queda (actorId pasa a NULL).
        await tx.user.delete({ where: { id: userId } });
        await this.audit.record(
          {
            action: PURGE_ACTIONS.userPurged,
            targetType: 'User',
            targetId: userId,
            profileId: profile?.id ?? null,
            metadata: { hadProfile: Boolean(profile), media },
          },
          tx,
        );
        return { profileId: profile?.id ?? null };
      },
      { timeout: 15_000, maxWait: 5_000 },
    );
    if (!result) return false;
    if (result.profileId) await this.media.removeProfileFiles(result.profileId);
    return true;
  }
}

function idleDays(lastActivityAt: Date, now: Date): number {
  return Math.floor((now.getTime() - lastActivityAt.getTime()) / 86_400_000);
}
