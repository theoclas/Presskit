import { HttpException } from '@nestjs/common';
import { LIMITS } from '@fersua/shared';
import { checkFieldsShape, contactColumns, isHoneypotFilled, safeFieldErrors, spamReason } from './booking-rules';

function errorBody(fn: () => unknown): { status: number; code: string; details?: Record<string, string> } {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpException) {
      const body = err.getResponse() as { code: string; details?: Record<string, string> };
      return { status: err.getStatus(), code: body.code, details: body.details };
    }
    throw err;
  }
  throw new Error('no lanzó');
}

describe('spamReason (topes diarios → SPAM, nunca 429)', () => {
  const zero = { ipProfile: 0, ip: 0, profile: 0 };

  it('sin honeypot ni topes, la solicitud es normal', () => {
    expect(spamReason(false, zero)).toBeNull();
    expect(
      spamReason(false, {
        ipProfile: LIMITS.booking.perIpPerProfilePerDay - 1,
        ip: LIMITS.booking.perIpPerDay - 1,
        profile: LIMITS.booking.perProfilePerDay - 1,
      }),
    ).toBeNull();
  });

  it('el honeypot lleno siempre es SPAM', () => {
    expect(spamReason(true, zero)).toBe('HONEYPOT');
  });

  it('pasado cada tope, SPAM con su motivo', () => {
    expect(spamReason(false, { ...zero, ipProfile: LIMITS.booking.perIpPerProfilePerDay })).toBe('CAP_IP_PROFILE');
    expect(spamReason(false, { ...zero, ip: LIMITS.booking.perIpPerDay })).toBe('CAP_IP');
    expect(spamReason(false, { ...zero, profile: LIMITS.booking.perProfilePerDay })).toBe('CAP_PROFILE');
  });

  it('honeypot: solo cuenta si trae texto', () => {
    expect(isHoneypotFilled(undefined)).toBe(false);
    expect(isHoneypotFilled('')).toBe(false);
    expect(isHoneypotFilled('   ')).toBe(false);
    expect(isHoneypotFilled('http://spam')).toBe(true);
  });
});

describe('checkFieldsShape', () => {
  it('acepta un objeto plano de strings', () => {
    expect(checkFieldsShape({ fullName: 'Ana', email1: 'ana@correo.com' })).toEqual({
      fullName: 'Ana',
      email1: 'ana@correo.com',
    });
  });

  it('rechaza mitades sueltas de emojis con 400 (no un 500 de Prisma)', () => {
    expect(errorBody(() => checkFieldsShape({ message: 'Hola \ud83d' })).details).toEqual({ message: 'INVALID' });
    expect(checkFieldsShape({ message: 'Hola \u{1F3A7}' })).toEqual({ message: 'Hola \u{1F3A7}' });
  });

  it('rechaza arrays, null y valores que no son string', () => {
    expect(errorBody(() => checkFieldsShape(['a'])).code).toBe('VALIDATION_FAILED');
    expect(errorBody(() => checkFieldsShape(null)).code).toBe('VALIDATION_FAILED');
    expect(errorBody(() => checkFieldsShape({ fullName: { $gt: '' } })).details).toEqual({ fullName: 'INVALID' });
    expect(errorBody(() => checkFieldsShape({ attendees: 12 })).details).toEqual({ attendees: 'INVALID' });
  });

  it('rechaza más de 30 claves', () => {
    const many = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`k${i}`, 'x']));
    expect(errorBody(() => checkFieldsShape(many)).details).toEqual({ fields: 'TOO_MANY' });
  });

  it('rechaza cuerpos más grandes que payloadMaxBytes con 413', () => {
    const big = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`k${i}`, 'x'.repeat(4_000)]));
    const e = errorBody(() => checkFieldsShape(big));
    expect(e.status).toBe(413);
    expect(e.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('nunca refleja una clave arbitraria en los errores', () => {
    expect(errorBody(() => checkFieldsShape({ '<script>': 1 })).details).toEqual({ _: 'INVALID' });
    expect(safeFieldErrors({ fullName: 'REQUIRED', '"><img>': 'NOT_ALLOWED' })).toEqual({
      fullName: 'REQUIRED',
      _: 'NOT_ALLOWED',
    });
  });
});

describe('contactColumns', () => {
  it('llena las columnas desde los campos con destino de contacto', () => {
    const cols = contactColumns([
      { key: 'fullName', label: 'Nombre y empresa / productora', value: 'Ana Pérez' },
      { key: 'email1', label: 'Email', value: 'ana@correo.com' },
      { key: 'phone1', label: 'Teléfono', value: '+57 300 000 0000' },
      { key: 'eventDate', label: 'Fecha', value: '2026-11-14' },
      { key: 'city', label: 'Ciudad', value: 'Medellín' },
    ]);
    expect(cols.contactName).toBe('Ana Pérez');
    expect(cols.contactEmail).toBe('ana@correo.com');
    expect(cols.contactPhone).toBe('+57 300 000 0000');
    // Sin corrimiento de zona horaria: medianoche UTC del mismo día.
    expect(cols.eventDate?.toISOString()).toBe('2026-11-14T00:00:00.000Z');
  });

  it('los campos opcionales ausentes quedan en null', () => {
    const cols = contactColumns([{ key: 'fullName', label: 'Nombre', value: 'Ana' }]);
    expect(cols).toEqual({ contactName: 'Ana', contactEmail: null, contactPhone: null, eventDate: null });
  });
});
