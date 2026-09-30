import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { DRAFT_NOTICE_DAYS } from './owner-rules';

/** Ventana del aviso al admin por perfil enviado a revisión. */
const SUBMIT_MAIL_WINDOW_MS = 24 * 3_600_000;

/** Cambios de estado que se le avisan al dueño (reactivar vuelve a APPROVED: mismo aviso que aprobar). */
export type OwnerStatusMail = 'approve' | 'reject' | 'suspend' | 'reinstate';

/** Dueño al que se le puede escribir: cuenta USER activa con el correo verificado (M6: nunca a un correo sin probar). */
export interface OwnerRecipient {
  email: string;
}

type OwnerRow = { email: string | null; emailVerifiedAt: Date | null; role: string; status: string } | null | undefined;

/** null si el dueño no puede recibir avisos (sin dueño, admin, suspendido, sin correo o sin verificar). */
export function ownerRecipientOf(user: OwnerRow): OwnerRecipient | null {
  if (!user || user.role !== 'USER' || user.status !== 'ACTIVE' || !user.email || !user.emailVerifiedAt) return null;
  return { email: user.email };
}

/**
 * Correos del ciclo de vida del perfil (docs/api-m3.md, "Correos"). Nunca lanzan ni frenan la
 * operación principal: MailService encola y cualquier fallo de consulta se registra sin datos
 * personales. Nunca llevan texto del público; el motivo del admin lo limpia y escapa la plantilla.
 */
@Injectable()
export class ProfileNotifier {
  private readonly log = new Logger('ProfileNotifier');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  /**
   * Al admin: un perfil entró a revisión. A ADMIN_NOTIFY_EMAIL o, si no hay, al correo del admin.
   * Uno por perfil cada 24 h: un DJ que envía y retira en bucle no puede gastar el cupo diario
   * de avisos del buzón del admin (que también lleva los de PQRS, con plazo legal). El envío
   * ya quedó auditado (profile.submit) antes de llegar aquí.
   */
  async profileSubmitted(profileId: string, profile: { displayName: string; slug: string }, now: Date = new Date()): Promise<void> {
    try {
      const recent = await this.prisma.auditLog.count({
        where: { action: 'profile.submit', profileId, createdAt: { gte: new Date(now.getTime() - SUBMIT_MAIL_WINDOW_MS) } },
      });
      if (recent > 1) return;
      const to =
        this.config.adminNotifyEmail ??
        (await this.prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { email: true }, orderBy: { createdAt: 'asc' } }))?.email;
      this.mail.send(to, 'profile-submitted-admin', { displayName: profile.displayName, slug: profile.slug });
    } catch (err) {
      this.warn('profile-submitted-admin', err);
    }
  }

  /** Al dueño: aprobado (o reactivado), rechazado o suspendido, con el motivo del admin. */
  async statusChanged(profileId: string, action: OwnerStatusMail, reason: string | null): Promise<void> {
    try {
      const row = await this.prisma.djProfile.findUnique({
        where: { id: profileId },
        select: { slug: true, user: { select: { email: true, emailVerifiedAt: true, role: true, status: true } } },
      });
      const to = ownerRecipientOf(row?.user);
      if (!row || !to) return;
      switch (action) {
        case 'approve':
        case 'reinstate':
          this.mail.send(to.email, 'profile-approved', { slug: row.slug });
          return;
        case 'reject':
          this.mail.send(to.email, 'profile-rejected', { reason: reason ?? '' });
          return;
        case 'suspend':
          this.mail.send(to.email, 'profile-suspended', { reason: reason ?? '' });
          return;
      }
    } catch (err) {
      this.warn(`estado ${action}`, err);
    }
  }

  /** Al dueño: su borrador se borrará en 9 días. true si quedó encolado (solo entonces se audita el aviso). */
  draftExpiring(to: OwnerRecipient): boolean {
    try {
      return this.mail.send(to.email, 'draft-expiring', { daysLeft: DRAFT_NOTICE_DAYS });
    } catch (err) {
      this.warn('draft-expiring', err);
      return false;
    }
  }

  private warn(what: string, err: unknown): void {
    this.log.warn(`aviso ${what} no enviado: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`);
  }
}
