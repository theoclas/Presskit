import { Injectable, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { CONSENT_VERSION, PQRS_DEADLINE_BUSINESS_DAYS, todayBogota, type TicketSubmitResultDto, type TicketType } from '@fersua/shared';
import { Errors } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { AppConfig } from '../config/app-config.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnlyToDb } from '../public/date-only';
import { PublicProfileResolver } from '../public/public-profile.resolver';
import { isHoneypotFilled } from '../booking/booking-rules';
import type { TicketSubmitBody } from './ticket-submit.dto';
import {
  TICKET_TYPES_WITH_PROFILE,
  TICKET_TYPE_LABELS,
  fakeTicketId,
  ticketCapExceeded,
  ticketDueDate,
  validateTicketFields,
  type TicketFieldError,
} from './ticket-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class TicketsService {
  private readonly log = new Logger('Tickets');

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PublicProfileResolver,
    private readonly requestContext: RequestContext,
    private readonly mail: MailService,
    private readonly config: AppConfig,
  ) {}

  async submit(body: TicketSubmitBody, req: Request): Promise<TicketSubmitResultDto> {
    if (body.consent !== true) {
      throw Errors.validation({ consent: 'REQUIRED' }, 'Debes autorizar el tratamiento de tus datos.');
    }

    const { value, errors } = validateTicketFields(body);
    const allErrors: Record<string, TicketFieldError> = { ...errors };

    // El perfil se resuelve con la misma regla pública (acepta slugs viejos). Solo se guarda
    // si está visible: no se pueden abrir tickets sobre perfiles ocultos para sondear si existen.
    const needsProfile = TICKET_TYPES_WITH_PROFILE.has(body.type);
    const rawSlug = body.profileSlug?.trim() ?? '';
    const profile = rawSlug ? await this.visibleProfile(rawSlug) : null;
    if (needsProfile && !profile) allErrors.profileSlug = rawSlug ? 'NOT_FOUND' : 'REQUIRED';

    if (Object.keys(allErrors).length) throw Errors.validation(allErrors);

    const today = todayBogota();
    const dueDate = ticketDueDate(body.type, today);

    // Honeypot: respuesta idéntica (id con forma de cuid), pero no se guarda nada ni se avisa:
    // Ticket no tiene estado SPAM. Pendiente (M4): token HMAC con tiempo mínimo de llenado,
    // como el del formulario de booking. Mientras tanto, los avisos al admin los acotan los
    // topes diarios de tickets y el cupo de correo por destinatario.
    if (isHoneypotFilled(body.hp_x7)) {
      this.log.log(`ticket.honeypot type=${body.type}`);
      return { id: fakeTicketId(), dueDate };
    }

    const ipHash = this.requestContext.ipHash(req);
    if (ticketCapExceeded(await this.recentCounts(ipHash))) {
      this.log.warn(`ticket.cap type=${body.type}`);
      throw Errors.tooMany(
        'Recibimos demasiadas solicitudes en las últimas 24 horas. Intenta más tarde o escríbenos al correo de contacto de la Política de datos.',
      );
    }

    const created = await this.prisma.ticket.create({
      data: {
        type: body.type,
        profileId: profile?.id ?? null,
        profileSlug: profile?.slug ?? null,
        name: value.name,
        email: value.email,
        phone: value.phone,
        subject: value.subject,
        message: value.message,
        consentAt: new Date(),
        consentVersion: CONSENT_VERSION,
        ipHash,
        dueAt: dateOnlyToDb(dueDate),
      },
      select: { id: true },
    });

    // Sin datos personales en el log.
    this.log.log(`ticket.created id=${created.id} type=${body.type}${profile ? ` profile=${profile.slug}` : ''}`);
    await this.notifyAdmin(created.id, body.type, dueDate);
    return { id: created.id, dueDate };
  }

  /**
   * Aviso al admin: una PQRS tiene plazo legal y la insignia del panel no basta si nadie entra.
   * Solo tipo, radicado y vencimiento (nunca el texto del público). Va a ADMIN_NOTIFY_EMAIL o,
   * si no hay, al correo del admin. Un fallo aquí nunca tumba el envío del ticket.
   */
  private async notifyAdmin(ticketId: string, type: TicketType, dueDate: string): Promise<void> {
    try {
      const to =
        this.config.adminNotifyEmail ??
        (await this.prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { email: true }, orderBy: { createdAt: 'asc' } }))?.email;
      this.mail.send(to, 'admin-new-ticket', {
        typeLabel: TICKET_TYPE_LABELS[type],
        ticketId,
        dueDate,
        businessDays: PQRS_DEADLINE_BUSINESS_DAYS[type],
      });
    } catch (err) {
      this.log.warn(`aviso de ticket no enviado: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`);
    }
  }

  /** Tickets de las últimas 24 h: de esta IP y en total. */
  private async recentCounts(ipHash: string): Promise<{ ip: number; total: number }> {
    const since = new Date(Date.now() - DAY_MS);
    const [ip, total] = await Promise.all([
      this.prisma.ticket.count({ where: { ipHash, createdAt: { gte: since } } }),
      this.prisma.ticket.count({ where: { createdAt: { gte: since } } }),
    ]);
    return { ip, total };
  }

  private async visibleProfile(raw: string): Promise<{ id: string; slug: string } | null> {
    const found = await this.resolver.lookup(raw);
    if (found.kind === 'profile') return { id: found.id, slug: found.slug };
    if (found.kind === 'redirect') {
      return this.prisma.djProfile.findFirst({ where: this.resolver.whereSlug(found.slug), select: { id: true, slug: true } });
    }
    return null;
  }
}
