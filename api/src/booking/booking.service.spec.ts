import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { LIMITS, WA_URL_RE, todayBogota } from '@fersua/shared';
import type { AppConfig } from '../config/app-config.service';
import type { RequestContext } from '../common/request-context';
import type { PrismaService } from '../prisma/prisma.service';
import { PublicProfileResolver } from '../public/public-profile.resolver';
import type { BookingNotifyService } from './booking-notify.service';
import { BookingTokenService } from './booking-token.service';
import { BookingService } from './booking.service';

const PROFILE = {
  id: 'prof1',
  slug: 'dj-prueba',
  displayName: 'DJ Prueba',
  texts: { bookingTitle: 'Solicitud de booking' },
  bookingForm: [
    { key: 'fullName', required: true },
    { key: 'email1', required: true },
    { key: 'message', required: false },
  ],
  formEnabled: true,
  formOpenWhatsapp: true,
  whatsappNumber: '573001112233',
};

const config = {
  bookingFormSecret: 'test-secret-0123456789abcdef-0123456789',
  publicUrl: 'https://booking.example.test',
} as unknown as AppConfig;

function setup(counts: { ipProfile: number; ip: number; profile: number }, opts: { nonceUsed?: boolean } = {}) {
  const created: Record<string, unknown>[] = [];
  const nonces = new Set<string>();
  const tx = {
    usedFormNonce: {
      create: jest.fn(async ({ data }: { data: { nonce: string } }) => {
        if (opts.nonceUsed || nonces.has(data.nonce)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
        }
        nonces.add(data.nonce);
      }),
    },
    bookingRequest: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `req${created.length}` };
      }),
    },
  };
  const prisma = {
    djProfile: { findFirst: jest.fn(async () => PROFILE) },
    bookingRequest: {
      // Orden de las consultas en recentCounts: ip+perfil, ip, perfil.
      count: jest
        .fn()
        .mockResolvedValueOnce(counts.ipProfile)
        .mockResolvedValueOnce(counts.ip)
        .mockResolvedValueOnce(counts.profile),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;
  const tokens = new BookingTokenService(config);
  const resolver = new PublicProfileResolver(prisma);
  const ctx = { ipHash: () => 'a'.repeat(64) } as unknown as RequestContext;
  const notify = { newBooking: jest.fn(async () => undefined) };
  const service = new BookingService(prisma, resolver, tokens, ctx, config, notify as unknown as BookingNotifyService);
  // Token emitido hace 5 s para pasar el tiempo mínimo.
  const token = tokens.issue(PROFILE.slug, Date.now() - 5_000);
  return { service, created, token, tx, notify };
}

const req = { ip: '203.0.113.7', headers: {} } as unknown as Request;
const fields = { fullName: 'Ana Pérez', email1: 'ANA@correo.com', message: 'Fiesta el sábado' };

describe('BookingService.submit', () => {
  it('guarda una solicitud normal con estado NEW y devuelve el enlace de WhatsApp', async () => {
    const { service, created, token, notify } = setup({ ipProfile: 0, ip: 0, profile: 0 });
    const res = await service.submit('DJ-Prueba', { fields, consent: true, token }, req);
    expect(res.id).toBe('req1');
    expect(res.whatsappUrl).toMatch(WA_URL_RE);
    expect(decodeURIComponent(res.whatsappUrl!.split('?text=')[1]!)).toContain('https://booking.example.test/dj-prueba');
    expect(created[0]).toMatchObject({
      status: 'NEW',
      contactName: 'Ana Pérez',
      contactEmail: 'ana@correo.com',
      consentVersion: expect.any(String),
      ipHash: 'a'.repeat(64),
    });
    // Aviso al DJ (M3): id, perfil y el nombre tal como quedó guardado (la plantilla lo sanea).
    expect(notify.newBooking).toHaveBeenCalledWith('req1', 'prof1', 'Ana Pérez');
  });

  it('pasado el tope por IP y perfil, guarda como SPAM y responde igual (sin 429)', async () => {
    const { service, created, token } = setup({ ipProfile: LIMITS.booking.perIpPerProfilePerDay, ip: 0, profile: 0 });
    const res = await service.submit('dj-prueba', { fields, consent: true, token }, req);
    expect(res.whatsappUrl).toMatch(WA_URL_RE);
    expect(created[0]).toMatchObject({ status: 'SPAM' });
  });

  it('pasado el tope diario del perfil, SPAM', async () => {
    const { service, created, token } = setup({ ipProfile: 0, ip: 0, profile: LIMITS.booking.perProfilePerDay });
    await service.submit('dj-prueba', { fields, consent: true, token }, req);
    expect(created[0]).toMatchObject({ status: 'SPAM' });
  });

  it('honeypot lleno: SPAM con respuesta normal (incluye whatsappUrl)', async () => {
    const { service, created, token, notify } = setup({ ipProfile: 0, ip: 0, profile: 0 });
    const res = await service.submit('dj-prueba', { fields, consent: true, token, hp_x7: 'http://spam.example' }, req);
    expect(res.whatsappUrl).toMatch(WA_URL_RE);
    expect(created[0]).toMatchObject({ status: 'SPAM' });
    // El spam nunca le escribe al DJ.
    expect(notify.newBooking).not.toHaveBeenCalled();
  });

  it('un token reutilizado da 400 FORM_TOKEN_USED', async () => {
    const { service, token } = setup({ ipProfile: 0, ip: 0, profile: 0 }, { nonceUsed: true });
    await expect(service.submit('dj-prueba', { fields, consent: true, token }, req)).rejects.toMatchObject({
      response: { code: 'FORM_TOKEN_USED' },
    });
  });

  it('campos inválidos: 400 con detalle por campo y el nonce NO se consume', async () => {
    const { service, token, tx } = setup({ ipProfile: 0, ip: 0, profile: 0 });
    await expect(
      service.submit('dj-prueba', { fields: { fullName: 'Ana', email1: 'no-es-correo', budget: 'x' }, consent: true, token }, req),
    ).rejects.toMatchObject({ response: { code: 'VALIDATION_FAILED', details: { email1: 'INVALID', budget: 'NOT_ALLOWED' } } });
    expect(tx.usedFormNonce.create).not.toHaveBeenCalled();
  });

  it('la fecha del evento se valida contra hoy en Bogotá', async () => {
    const { service, token } = setup({ ipProfile: 0, ip: 0, profile: 0 });
    // El formulario de prueba no tiene eventDate: enviarlo es NOT_ALLOWED (nunca se ignora).
    await expect(
      service.submit('dj-prueba', { fields: { ...fields, eventDate: todayBogota() }, consent: true, token }, req),
    ).rejects.toMatchObject({ response: { details: { eventDate: 'NOT_ALLOWED' } } });
  });
});
