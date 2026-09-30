import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  CONSENT_VERSION,
  PQRS_DEADLINE_BUSINESS_DAYS,
  todayBogota,
  type TicketSubmitResultDto,
  type TicketTokenDto,
  type TicketType,
} from '@fersua/shared';
import { Errors } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { AppConfig } from '../config/app-config.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnlyToDb } from '../public/date-only';
import { PublicProfileResolver } from '../public/public-profile.resolver';
import { isHoneypotFilled } from '../booking/booking-rules';
import { FormTokenError, FormTokenService } from '../booking/form-token.service';
import type { TicketSubmitBody } from './ticket-submit.dto';
import {
  TICKET_TYPES_WITH_PROFILE,
  TICKET_TYPE_LABELS,
  fakeTicketId,
  ticketCapReached,
  ticketDueDate,
  validateTicketFields,
  type TicketFieldError,
  type TicketRecentCounts,
} from './ticket-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Alcance fijo del token de tickets: el formulario es uno solo (el perfil va en el cuerpo). */
export const TICKET_TOKEN_SCOPE = 'tickets';

@Injectable()
export class TicketsService {
  private readonly log = new Logger('Tickets');

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PublicProfileResolver,
    private readonly requestContext: RequestContext,
    private readonly mail: MailService,
    private readonly config: AppConfig,
    private readonly tokens: FormTokenService,
  ) {}

  issueToken(): TicketTokenDto {
    return { token: this.tokens.issue('ticket', TICKET_TOKEN_SCOPE) };
  }

  async submit(body: TicketSubmitBody, req: Request): Promise<TicketSubmitResultDto> {
    // 1. Token: firma, propósito (un token de booking no sirve aquí) y edad (2 s – 2 h). El
    //    nonce se consume al guardar.
    const token = this.tokens.verify(body.token, 'ticket', TICKET_TOKEN_SCOPE);

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

    // 2. Topes diarios: una persona recibe 429 con el correo como alternativa (una PQRS nunca se
    //    guarda en silencio donde nadie la ve); el honeypot, un id falso sin guardar nada.
    const ipHash = this.requestContext.ipHash(req);
    const honeypot = isHoneypotFilled(body.hp_x7);
    const cap = ticketCapReached(honeypot, await this.recentCounts(ipHash));
    if (cap) {
      this.log.warn(`ticket.cap reason=${cap} type=${body.type}${honeypot ? ' honeypot' : ''}`);
      if (honeypot) return { id: fakeTicketId(), dueDate };
      throw Errors.tooMany(
        'Recibimos demasiadas solicitudes en las últimas 24 horas. Intenta más tarde o escríbenos al correo de contacto de la Política de datos.',
      );
    }
    // Solo el honeypot se guarda como spam: misma respuesta, sin aviso al admin.
    const spam = honeypot;

    // 3. Nonce de un solo uso + ticket, juntos: si falla el guardado, el token no queda quemado.
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.usedFormNonce.create({ data: { nonce: token.n, expiresAt: this.tokens.nonceExpiresAt(token) } });
        const created = await tx.ticket.create({
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
            isSpam: spam,
          },
          select: { id: true },
        });
        return created.id;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new FormTokenError('FORM_TOKEN_USED');
      }
      throw err;
    }

    // Sin datos personales en el log: id, tipo, slug y si fue spam.
    this.log.log(`ticket.created id=${id} type=${body.type}${profile ? ` profile=${profile.slug}` : ''}${spam ? ' spam=HONEYPOT' : ''}`);
    if (!spam) await this.notifyAdmin(id, body.type, dueDate);
    return { id, dueDate };
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

  /** Tickets de las últimas 24 h: de esta IP (sin spam y solo spam) y en total (sin spam y todo). */
  private async recentCounts(ipHash: string): Promise<TicketRecentCounts> {
    const since = new Date(Date.now() - DAY_MS);
    const [ip, ipSpam, total, all] = await Promise.all([
      this.prisma.ticket.count({ where: { ipHash, createdAt: { gte: since }, isSpam: false } }),
      this.prisma.ticket.count({ where: { ipHash, createdAt: { gte: since }, isSpam: true } }),
      this.prisma.ticket.count({ where: { createdAt: { gte: since }, isSpam: false } }),
      this.prisma.ticket.count({ where: { createdAt: { gte: since } } }),
    ]);
    return { ip, ipSpam, total, all };
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
