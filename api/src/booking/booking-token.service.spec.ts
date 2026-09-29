import { LIMITS } from '@fersua/shared';
import type { AppConfig } from '../config/app-config.service';
import { BookingTokenService, FormTokenError } from './booking-token.service';

function service(secret = 'test-secret-0123456789abcdef-0123456789') {
  return new BookingTokenService({ bookingFormSecret: secret } as unknown as AppConfig);
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

describe('BookingTokenService', () => {
  const t0 = 1_800_000_000_000;
  const okAge = t0 + LIMITS.booking.tokenMinAgeMs + 1_000;

  it('emite un token que verifica con el mismo slug pasado el tiempo mínimo', () => {
    const svc = service();
    const token = svc.issue('macfly-mike-bran', t0);
    const payload = svc.verify(token, 'macfly-mike-bran', okAge);
    expect(payload.s).toBe('macfly-mike-bran');
    expect(payload.iat).toBe(t0);
    expect(payload.n).toMatch(/^[0-9a-f]{32}$/);
    expect(svc.nonceExpiresAt(payload).getTime()).toBe(t0 + LIMITS.booking.tokenMaxAgeMs);
  });

  it('cada token trae un nonce distinto', () => {
    const svc = service();
    const a = svc.verify(svc.issue('dj-uno', t0), 'dj-uno', okAge);
    const b = svc.verify(svc.issue('dj-uno', t0), 'dj-uno', okAge);
    expect(a.n).not.toBe(b.n);
  });

  it('rechaza un token enviado demasiado rápido (bots)', () => {
    const svc = service();
    const token = svc.issue('dj-uno', t0);
    expect(codeOf(() => svc.verify(token, 'dj-uno', t0 + 500))).toBe('FORM_TOO_FAST');
  });

  it('rechaza un token vencido (más de 2 h)', () => {
    const svc = service();
    const token = svc.issue('dj-uno', t0);
    expect(codeOf(() => svc.verify(token, 'dj-uno', t0 + LIMITS.booking.tokenMaxAgeMs + 1))).toBe('FORM_EXPIRED');
  });

  it('rechaza un token de otro perfil', () => {
    const svc = service();
    const token = svc.issue('dj-uno', t0);
    expect(codeOf(() => svc.verify(token, 'dj-dos', okAge))).toBe('FORM_TOKEN_INVALID');
  });

  it('rechaza un token alterado (payload o firma)', () => {
    const svc = service();
    const token = svc.issue('dj-uno', t0);
    const [body, sig] = token.split('.') as [string, string];

    // Payload cambiado (iat viejo para saltarse el tiempo mínimo) con la firma original.
    const forged = Buffer.from(JSON.stringify({ s: 'dj-uno', iat: t0 - 10_000, n: 'a'.repeat(32) })).toString('base64url');
    expect(codeOf(() => svc.verify(`${forged}.${sig}`, 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');

    // Firma cambiada en un carácter.
    const flipped = sig.slice(0, -1) + (sig.endsWith('0') ? '1' : '0');
    expect(codeOf(() => svc.verify(`${body}.${flipped}`, 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');

    // Firmado con otro secreto.
    const other = service('otro-secreto-distinto-0123456789abcdef').issue('dj-uno', t0);
    expect(codeOf(() => svc.verify(other, 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');
  });

  it('rechaza basura sin lanzar errores inesperados', () => {
    const svc = service();
    for (const junk of [undefined, null, 42, '', '.', 'abc', 'abc.def', `${'x'.repeat(301)}`, 'e30.' + '0'.repeat(64)]) {
      expect(codeOf(() => svc.verify(junk, 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');
    }
  });

  it('un token bien firmado pero con nonce inválido no pasa', () => {
    const svc = service();
    // Se firma a mano un payload con nonce corto usando el mismo esquema del servicio.
    const body = Buffer.from(JSON.stringify({ s: 'dj-uno', iat: t0, n: 'corto' })).toString('base64url');
    const sig = (svc as unknown as { sign(b: string): string }).sign(body);
    expect(codeOf(() => svc.verify(`${body}.${sig}`, 'dj-uno', okAge))).toBe('FORM_TOKEN_INVALID');
  });
});
