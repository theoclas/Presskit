import { LIMITS } from '@fersua/shared';
import type { AppConfig } from '../config/app-config.service';
import { hmacHex } from '../common/crypto';
import { FormTokenError, FormTokenService } from './form-token.service';

const SECRET = 'test-secret-0123456789abcdef-0123456789';

function service(secret = SECRET) {
  return new FormTokenService({ bookingFormSecret: secret } as unknown as AppConfig);
}

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof FormTokenError) return (err.getResponse() as { code: string }).code;
    throw err;
  }
}

/** Firma a mano un payload arbitrario con el mismo esquema del servicio. */
function signed(payload: unknown, svc = service()): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${(svc as unknown as { sign(b: string): string }).sign(body)}`;
}

describe('FormTokenService', () => {
  const t0 = 1_800_000_000_000;
  const okAge = t0 + LIMITS.booking.tokenMinAgeMs + 1_000;

  it('emite un token que verifica con el mismo propósito y alcance pasado el tiempo mínimo', () => {
    const svc = service();
    const token = svc.issue('booking', 'macfly-mike-bran', t0);
    const payload = svc.verify(token, 'booking', 'macfly-mike-bran', okAge);
    expect(payload).toMatchObject({ p: 'booking', s: 'macfly-mike-bran', iat: t0 });
    expect(payload.n).toMatch(/^[0-9a-f]{32}$/);
    expect(svc.nonceExpiresAt(payload).getTime()).toBe(t0 + LIMITS.booking.tokenMaxAgeMs);
  });

  it('cada token trae un nonce distinto', () => {
    const svc = service();
    const a = svc.verify(svc.issue('ticket', 'tickets', t0), 'ticket', 'tickets', okAge);
    const b = svc.verify(svc.issue('ticket', 'tickets', t0), 'ticket', 'tickets', okAge);
    expect(a.n).not.toBe(b.n);
  });

  it('un token de booking no sirve para tickets ni al revés (aunque el alcance coincida)', () => {
    const svc = service();
    const booking = svc.issue('booking', 'tickets', t0);
    const ticket = svc.issue('ticket', 'tickets', t0);
    expect(codeOf(() => svc.verify(booking, 'ticket', 'tickets', okAge))).toBe('FORM_TOKEN_INVALID');
    expect(codeOf(() => svc.verify(ticket, 'booking', 'tickets', okAge))).toBe('FORM_TOKEN_INVALID');
    expect(codeOf(() => svc.verify(ticket, 'ticket', 'tickets', okAge))).toBeNull();
  });

  it('rechaza los tokens v1 (sin propósito) y los que traen un propósito desconocido', () => {
    const svc = service();
    // Formato v1: {s, iat, n} firmado con el prefijo de booking.
    const body = Buffer.from(JSON.stringify({ s: 'dj-uno', iat: t0, n: 'a'.repeat(32) })).toString('base64url');
    const v1 = `${body}.${hmacHex(SECRET, `booking-form.v1.${body}`)}`;
    expect(codeOf(() => svc.verify(v1, 'booking', 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');
    // Bien firmado con el esquema v2 pero sin propósito, o con otro.
    expect(codeOf(() => svc.verify(signed({ s: 'dj-uno', iat: t0, n: 'a'.repeat(32) }), 'booking', 'dj-uno', okAge))).toBe(
      'FORM_TOKEN_INVALID',
    );
    expect(codeOf(() => svc.verify(signed({ p: 'admin', s: 'dj-uno', iat: t0, n: 'a'.repeat(32) }), 'booking', 'dj-uno', okAge))).toBe(
      'FORM_TOKEN_INVALID',
    );
  });

  it('rechaza un token enviado demasiado rápido (bots)', () => {
    const svc = service();
    expect(codeOf(() => svc.verify(svc.issue('booking', 'dj-uno', t0), 'booking', 'dj-uno', t0 + 500))).toBe('FORM_TOO_FAST');
    expect(codeOf(() => svc.verify(svc.issue('ticket', 'tickets', t0), 'ticket', 'tickets', t0 + 500))).toBe('FORM_TOO_FAST');
  });

  it('rechaza un token vencido (más de 2 h)', () => {
    const svc = service();
    const late = t0 + LIMITS.booking.tokenMaxAgeMs + 1;
    expect(codeOf(() => svc.verify(svc.issue('booking', 'dj-uno', t0), 'booking', 'dj-uno', late))).toBe('FORM_EXPIRED');
    expect(codeOf(() => svc.verify(svc.issue('ticket', 'tickets', t0), 'ticket', 'tickets', late))).toBe('FORM_EXPIRED');
  });

  it('rechaza un token de otro perfil', () => {
    const svc = service();
    const token = svc.issue('booking', 'dj-uno', t0);
    expect(codeOf(() => svc.verify(token, 'booking', 'dj-dos', okAge))).toBe('FORM_TOKEN_INVALID');
  });

  it('rechaza un token alterado (payload o firma)', () => {
    const svc = service();
    const token = svc.issue('booking', 'dj-uno', t0);
    const [body, sig] = token.split('.') as [string, string];

    // Payload cambiado (iat viejo para saltarse el tiempo mínimo, o el propósito) con la firma original.
    const forged = Buffer.from(JSON.stringify({ p: 'booking', s: 'dj-uno', iat: t0 - 10_000, n: 'a'.repeat(32) })).toString('base64url');
    expect(codeOf(() => svc.verify(`${forged}.${sig}`, 'booking', 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');
    const repurposed = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, 'base64url').toString()), p: 'ticket' })).toString(
      'base64url',
    );
    expect(codeOf(() => svc.verify(`${repurposed}.${sig}`, 'ticket', 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');

    // Firma cambiada en un carácter.
    const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    expect(codeOf(() => svc.verify(`${body}.${flipped}`, 'booking', 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');

    // Firmado con otro secreto.
    const other = service('otro-secreto-distinto-0123456789abcdef').issue('booking', 'dj-uno', t0);
    expect(codeOf(() => svc.verify(other, 'booking', 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');
  });

  it('rechaza basura sin lanzar errores inesperados', () => {
    const svc = service();
    for (const junk of [undefined, null, 42, '', '.', 'abc', 'abc.def', `${'x'.repeat(301)}`, 'e30.' + '0'.repeat(64)]) {
      expect(codeOf(() => svc.verify(junk, 'booking', 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');
      expect(codeOf(() => svc.verify(junk, 'ticket', 'tickets', okAge))).toBe('FORM_TOKEN_INVALID');
    }
  });

  it('un token bien firmado pero con nonce inválido no pasa', () => {
    const svc = service();
    expect(codeOf(() => svc.verify(signed({ p: 'booking', s: 'dj-uno', iat: t0, n: 'corto' }), 'booking', 'dj-uno', okAge))).toBe(
      'FORM_TOKEN_INVALID',
    );
  });
});
