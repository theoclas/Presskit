import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  CONSENT_VERSION,
  buildBookingSummary,
  buildWaUrl,
  resolveTexts,
  todayBogota,
  validateBookingSubmission,
  type BookingSubmitResultDto,
  type BookingTokenDto,
} from '@fersua/shared';
import { AppConfig } from '../config/app-config.service';
import { Errors } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { PrismaService } from '../prisma/prisma.service';
import { PublicProfileResolver } from '../public/public-profile.resolver';
import { waNumberOf } from '../public/public.mappers';
import { BookingNotifyService } from './booking-notify.service';
import { FormTokenError, FormTokenService } from './form-token.service';
import type { BookingSubmitBody } from './booking-submit.dto';
import {
  checkFieldsShape,
  contactColumns,
  isHoneypotFilled,
  safeFieldErrors,
  spamReason,
  type RecentCounts,
} from './booking-rules';

const DAY_MS = 24 * 60 * 60 * 1000;

const formProfileSelect = {
  id: true,
  slug: true,
  displayName: true,
  texts: true,
  bookingForm: true,
  formEnabled: true,
  formOpenWhatsapp: true,
  whatsappNumber: true,
} satisfies Prisma.DjProfileSelect;

@Injectable()
export class BookingService {
  private readonly log = new Logger('Booking');

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PublicProfileResolver,
    private readonly tokens: FormTokenService,
    private readonly requestContext: RequestContext,
    private readonly config: AppConfig,
    private readonly notify: BookingNotifyService,
  ) {}

  /** Perfil visible con el formulario activo; si no, 404 (no se distingue para no revelar nada). */
  private async formProfile(rawSlug: string) {
    const slug = this.resolver.normalize(rawSlug);
    const profile = slug
      ? await this.prisma.djProfile.findFirst({ where: this.resolver.whereSlug(slug), select: formProfileSelect })
      : null;
    if (!profile || !profile.formEnabled) throw Errors.notFound('Este formulario no está disponible.');
    return profile;
  }

  async issueToken(rawSlug: string): Promise<BookingTokenDto> {
    const profile = await this.formProfile(rawSlug);
    return { token: this.tokens.issue('booking', profile.slug) };
  }

  async submit(rawSlug: string, body: BookingSubmitBody, req: Request): Promise<BookingSubmitResultDto> {
    const profile = await this.formProfile(rawSlug);

    // 1. Token: firma, propósito, slug y edad (2 s – 2 h). El nonce se consume al guardar.
    const token = this.tokens.verify(body.token, 'booking', profile.slug);

    // 2. Autorización de datos (Ley 1581): exactamente true.
    if (body.consent !== true) {
      throw Errors.validation({ consent: 'REQUIRED' }, 'Debes autorizar el tratamiento de tus datos.');
    }

    // 3. Campos contra el formulario del DJ (claves no activas = error, nunca se ignoran).
    const fields = checkFieldsShape(body.fields);
    const { values, errors } = validateBookingSubmission(profile.bookingForm, fields, todayBogota());
    if (Object.keys(errors).length) throw Errors.validation(safeFieldErrors(errors));

    // 4. Honeypot y topes: se guarda igual, como SPAM, con la respuesta de siempre.
    const ipHash = this.requestContext.ipHash(req);
    const honeypot = isHoneypotFilled(body.hp_x7);
    const counts = honeypot ? { ipProfile: 0, ip: 0, profile: 0 } : await this.recentCounts(profile.id, ipHash);
    const spam = spamReason(honeypot, counts);

    // 5. Nonce de un solo uso + solicitud, juntos: si falla el guardado, el token no queda quemado.
    const contact = contactColumns(values);
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.usedFormNonce.create({ data: { nonce: token.n, expiresAt: this.tokens.nonceExpiresAt(token) } });
        const created = await tx.bookingRequest.create({
          data: {
            profileId: profile.id,
            payload: values as unknown as Prisma.InputJsonValue,
            contactName: contact.contactName,
            contactEmail: contact.contactEmail,
            contactPhone: contact.contactPhone,
            eventDate: contact.eventDate,
            status: spam ? 'SPAM' : 'NEW',
            consentAt: new Date(),
            consentVersion: CONSENT_VERSION,
            ipHash,
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

    // Sin datos personales en el log: solo ids, slug y el motivo si fue SPAM.
    this.log.log(`booking.created id=${id} profile=${profile.slug}${spam ? ` spam=${spam}` : ''}`);

    // Aviso al DJ (M3) solo por solicitudes reales. En segundo plano: no demora ni puede tumbar
    // la respuesta (el servicio nunca lanza).
    if (!spam) void this.notify.newBooking(id, profile.id);

    // La solicitud ya está guardada y el nonce gastado: un fallo armando el enlace nunca puede
    // convertirse en un 500 (el visitante reintentaría y duplicaría la solicitud).
    let whatsappUrl: string | null = null;
    try {
      whatsappUrl = this.whatsappUrl(profile, values);
    } catch {
      this.log.warn(`booking.wa-url-failed id=${id}`);
    }
    return { id, whatsappUrl };
  }

  private whatsappUrl(
    profile: Prisma.DjProfileGetPayload<{ select: typeof formProfileSelect }>,
    values: { label: string; value: string }[],
  ): string | null {
    const wa = waNumberOf(profile.whatsappNumber);
    if (!profile.formOpenWhatsapp || !wa) return null;
    const texts = resolveTexts(profile.texts, profile.displayName);
    return buildWaUrl(
      wa,
      buildBookingSummary({
        title: texts.bookingTitle,
        displayName: profile.displayName,
        rows: values,
        pageUrl: `${this.config.publicUrl}/${profile.slug}`,
      }),
    );
  }

  /** Ventana móvil de 24 h. Por IP cuenta todo (incluido SPAM); por perfil, solo lo no-SPAM. */
  private async recentCounts(profileId: string, ipHash: string): Promise<RecentCounts> {
    const since = new Date(Date.now() - DAY_MS);
    const [ipProfile, ip, profile] = await Promise.all([
      this.prisma.bookingRequest.count({ where: { profileId, ipHash, createdAt: { gte: since } } }),
      this.prisma.bookingRequest.count({ where: { ipHash, createdAt: { gte: since } } }),
      this.prisma.bookingRequest.count({ where: { profileId, createdAt: { gte: since }, status: { not: 'SPAM' } } }),
    ]);
    return { ipProfile, ip, profile };
  }

  /** Los nonces solo sirven mientras el token podría ser válido (2 h); después se borran. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'purge-form-nonces' })
  async purgeExpiredNonces(): Promise<void> {
    try {
      const { count } = await this.prisma.usedFormNonce.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      if (count) this.log.log(`form-nonces.purged count=${count}`);
    } catch (err) {
      this.log.warn(`form-nonces.purge-failed ${err instanceof Error ? err.message.slice(0, 200) : 'error'}`);
    }
  }
}
