import { describe, expect, it } from 'vitest';
import {
  API_ROUTES,
  APP_TOP_LEVEL_ROUTES,
  AUTH_HEADERS,
  PROFILE_STATUSES,
  PROFILE_STATUS_ACTIONS,
  STATUS_TRANSITIONS,
  canTransition,
  normalizeDocNumber,
  BOOKING_FIELD_CATALOGUE,
  PAGE_TEXT_SLOTS,
  PALETTES,
  PALETTE_KEYS,
  RESERVED_SLUGS,
  SOCIAL_PLATFORMS,
  SOCIAL_PLATFORM_KEYS,
  addBusinessDays,
  businessDaysInRange,
  colombianHolidays,
  easterSunday,
  isBusinessDay,
  buildBookingSummary,
  buildWaUrl,
  cleanText,
  containsCardNumber,
  defaultFormConfig,
  eventWhatsappText,
  fillEventMessage,
  formatShowDate,
  isLabelAllowed,
  isSafeNextPath,
  isValidDateOnly,
  isValidPhone,
  isWellFormedText,
  LIMITS,
  normalizeSocialUrl,
  sliceText,
  toWellFormedText,
  resolveFormFields,
  resolveTexts,
  suggestSlug,
  todayBogota,
  validateBookingSubmission,
  validateFormConfig,
  validatePassword,
  validateSlug,
  validateTexts,
  validateUsername,
} from '../src';

describe('slugs', () => {
  it('acepta slugs válidos y rechaza formato inválido', () => {
    expect(validateSlug('macfly-mike-bran')).toBeNull();
    expect(validateSlug('ab')).toBe('FORMAT');
    expect(validateSlug('Mayus')).toBe('FORMAT');
    expect(validateSlug('doble--guion')).toBe('FORMAT');
    expect(validateSlug('-inicio')).toBe('FORMAT');
    expect(validateSlug('12345')).toBe('FORMAT');
  });
  it('reserva todas las rutas de la app y prefijos', () => {
    for (const r of APP_TOP_LEVEL_ROUTES) expect(RESERVED_SLUGS.has(r)).toBe(true);
    expect(validateSlug('admin')).toBe('RESERVED');
    expect(validateSlug('admin-panel')).toBe('RESERVED');
    expect(validateSlug('allset')).toBe('RESERVED');
    expect(validateSlug('diannmakinne')).toBeNull();
  });
  it('sugiere slugs sin tildes ni símbolos', () => {
    expect(suggestSlug('Mike Bran & Macfly')).toBe('mike-bran-y-macfly');
    expect(suggestSlug('Dj Ñandú')).toBe('dj-nandu');
  });
});

describe('usuarios y contraseñas', () => {
  it('valida usuarios', () => {
    expect(validateUsername('Fersua')).toBe('RESERVED');
    expect(validateUsername('Fersua', { allowReserved: true })).toBeNull();
    expect(validateUsername('mike.bran')).toBeNull();
    expect(validateUsername('mike..bran')).toBe('FORMAT');
    expect(validateUsername('a')).toBe('FORMAT');
  });
  it('aplica la política de contraseñas', () => {
    expect(validatePassword('corta')).toBe('TOO_SHORT');
    expect(validatePassword('password123')).toBe('TOO_COMMON');
    expect(validatePassword('mikebran-segura-2026', { username: 'mikebran' })).toBe('CONTAINS_USERNAME');
    expect(validatePassword('aaaaaaaaaaaa')).toBe('TOO_SIMPLE');
    expect(validatePassword('Luna-sobre-Medellin7')).toBeNull();
    expect(validatePassword('Luna-Medellin7', { minLength: 16 })).toBe('TOO_SHORT');
  });
});

describe('redes sociales', () => {
  it('normaliza y quita rastreo', () => {
    const r = normalizeSocialUrl(
      'SOUNDCLOUD',
      'https://soundcloud.com/macfly-mike-bran/track?ref=clipboard&p=a&c=0&si=abc&utm_source=clipboard',
    );
    expect(r).toEqual({ ok: true, url: 'https://soundcloud.com/macfly-mike-bran/track' });
  });
  it('acepta @usuario donde aplica', () => {
    expect(normalizeSocialUrl('INSTAGRAM', '@mikebran_')).toEqual({ ok: true, url: 'https://www.instagram.com/mikebran_/' });
  });
  it('rechaza hosts ajenos y esquemas peligrosos', () => {
    expect(normalizeSocialUrl('INSTAGRAM', 'https://evil.com/x').ok).toBe(false);
    expect(normalizeSocialUrl('WEBSITE', 'javascript:alert(1)').ok).toBe(false);
    expect(normalizeSocialUrl('WEBSITE', 'https://127.0.0.1/x').ok).toBe(false);
    expect(normalizeSocialUrl('WEBSITE', 'https://user:pw@site.com').ok).toBe(false);
    expect(normalizeSocialUrl('WEBSITE', 'http://mi-sitio.co').ok).toBe(true);
  });
  it('el catálogo coincide con el enum', () => {
    expect(Object.keys(SOCIAL_PLATFORMS).sort()).toEqual([...SOCIAL_PLATFORM_KEYS].sort());
    expect(Object.keys(PALETTES).sort()).toEqual([...PALETTE_KEYS].sort());
  });
});

describe('textos de la página', () => {
  it('rellena valores por defecto', () => {
    const t = resolveTexts({ heroTitle: 'Hola' }, 'Mike Bran & Macfly');
    expect(t.heroTitle).toBe('Hola');
    expect(t.navTag).toBe('Booking');
    expect(t.footerText).toBe('Mike Bran & Macfly — Booking');
  });
  it('rechaza claves desconocidas, prototipos y placeholders no permitidos', () => {
    const r = validateTexts(JSON.parse('{"__proto__":{"x":1},"heroTitle":"ok","nope":"x","heroLabel":"{hack}"}'));
    expect(r.errors.nope).toBe('UNKNOWN_KEY');
    expect(r.errors.heroLabel).toBe('BAD_PLACEHOLDER');
    expect(r.texts.heroTitle).toBe('ok');
    expect(Object.getPrototypeOf(r.texts)).toBeNull();
  });
  it('limita longitudes', () => {
    const r = validateTexts({ heroTitle: 'x'.repeat(61) });
    expect(r.errors.heroTitle).toBe('TOO_LONG');
  });
  it('todas las claves son únicas', () => {
    const keys = PAGE_TEXT_SLOTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('formulario', () => {
  it('la configuración por defecto es válida', () => {
    expect(validateFormConfig(defaultFormConfig()).errors).toEqual([]);
  });
  it('exige nombre y un contacto obligatorio', () => {
    const r = validateFormConfig([{ key: 'email1', required: false }]);
    expect(r.errors.map((e) => e.error)).toEqual(expect.arrayContaining(['NAME_REQUIRED', 'CONTACT_REQUIRED']));
  });
  it('bloquea etiquetas para pedir datos sensibles', () => {
    expect(isLabelAllowed('Número de tarjeta')).toBe(false);
    expect(isLabelAllowed('Tu cédula')).toBe(false);
    expect(isLabelAllowed('Nombre y empresa / productora')).toBe(true);
    const r = validateFormConfig([
      { key: 'fullName', required: true },
      { key: 'email1', required: true, label: 'Contraseña de Instagram' },
    ]);
    expect(r.errors[0]?.error).toBe('LABEL_NOT_ALLOWED');
  });
  it('rechaza claves repetidas o fuera del catálogo', () => {
    const r = validateFormConfig([
      { key: 'fullName', required: true },
      { key: 'email1', required: true },
      { key: 'email1', required: true },
      { key: 'cedula', required: true },
    ]);
    expect(r.errors.map((e) => e.error)).toEqual(['DUPLICATE_KEY', 'UNKNOWN_KEY']);
  });
  it('el catálogo no tiene claves repetidas', () => {
    const keys = BOOKING_FIELD_CATALOGUE.map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('envío de booking', () => {
  const config = [
    { key: 'fullName', required: true },
    { key: 'email1', required: true },
    { key: 'eventDate', required: false },
    { key: 'budget', required: false },
    { key: 'message', required: false },
  ];
  const today = '2026-09-28';

  it('acepta un envío válido y normaliza', () => {
    const r = validateBookingSubmission(
      config,
      { fullName: '  Ana  Pérez ', email1: 'ANA@Mail.com', eventDate: '2026-11-14', budget: '1-3m', message: 'Hola\r\n\r\n\r\nfiesta' },
      today,
    );
    expect(r.errors).toEqual({});
    expect(r.values.find((v) => v.key === 'fullName')?.value).toBe('Ana Pérez');
    expect(r.values.find((v) => v.key === 'email1')?.value).toBe('ana@mail.com');
    expect(r.values.find((v) => v.key === 'message')?.value).toBe('Hola\n\nfiesta');
  });
  it('rechaza campos no activos, requeridos faltantes y fechas pasadas', () => {
    const r = validateBookingSubmission(config, { fullName: 'Ana', phone1: '3001234567', eventDate: '2026-01-01' }, today);
    expect(r.errors).toEqual({ phone1: 'NOT_ALLOWED', email1: 'REQUIRED', eventDate: 'OUT_OF_RANGE' });
  });
  it('rechaza opciones inventadas y números de tarjeta', () => {
    const r = validateBookingSubmission(
      config,
      { fullName: 'Ana', email1: 'a@b.co', budget: '999m', message: 'mi tarjeta 4111 1111 1111 1111' },
      today,
    );
    expect(r.errors.budget).toBe('INVALID');
    expect(r.errors.message).toBe('CARD_NUMBER');
  });
  it('luhn', () => {
    expect(containsCardNumber('4111111111111111')).toBe(true);
    expect(containsCardNumber('3001234567')).toBe(false);
  });
  it('teléfonos', () => {
    expect(isValidPhone('+57 300 123 4567')).toBe(true);
    expect(isValidPhone('(604) 555-1234')).toBe(true);
    expect(isValidPhone('123456')).toBe(false);
    expect(isValidPhone('+57 300 123 4567 8901 23')).toBe(false);
    expect(isValidPhone('300-abc-4567')).toBe(false);
  });
  it('los campos resueltos respetan el orden del DJ', () => {
    expect(resolveFormFields(config).map((f) => f.key)).toEqual(['fullName', 'email1', 'eventDate', 'budget', 'message']);
  });
});

describe('WhatsApp', () => {
  it('codifica el texto (& y # no cortan el mensaje)', () => {
    expect(buildWaUrl('573505209860', 'Hola & #1')).toBe('https://wa.me/573505209860?text=Hola%20%26%20%231');
  });
  it('reemplaza placeholders de evento y elimina los desconocidos', () => {
    expect(
      eventWhatsappText('Quiero ir a {evento} ({fecha}) {nombre del evento}', { venue: 'Viuz', date: '2026-11-27' }),
    ).toBe('Quiero ir a Viuz (27 de noviembre de 2026)');
  });
  it('arma el resumen de una solicitud', () => {
    const t = buildBookingSummary({
      title: 'Solicitud de booking',
      displayName: 'Mike Bran & Macfly',
      rows: [{ label: 'Nombre', value: 'Ana' }],
      pageUrl: 'https://fersuastudio.com/macfly-mike-bran',
    });
    expect(t).toContain('*Nombre:* Ana');
    expect(t).toContain('https://fersuastudio.com/macfly-mike-bran');
  });
  it('un emoji justo en el corte no rompe el enlace (sin mitades sueltas)', () => {
    const summary = buildBookingSummary({
      title: 'Solicitud de booking',
      displayName: 'Mike Bran & Macfly',
      // El emoji cae en las unidades 699-700: el corte de 700 lo partiría.
      rows: [{ label: 'Mensaje', value: `${'a'.repeat(699)}\u{1F600}b` }],
      pageUrl: 'https://fersuastudio.com/macfly-mike-bran',
    });
    expect(isWellFormedText(summary)).toBe(true);
    expect(() => buildWaUrl('573505209860', summary)).not.toThrow();
    // Corte total del mensaje en el mismo punto débil.
    const long = `${'x'.repeat(LIMITS.booking.whatsappMessageMax - 1)}\u{1F600}${'y'.repeat(50)}`;
    expect(() => buildWaUrl('573505209860', long)).not.toThrow();
    // Y aunque llegue una mitad suelta de otro lado, tampoco lanza.
    expect(buildWaUrl('573505209860', 'Hola \ud83d')).toBe('https://wa.me/573505209860?text=Hola');
  });
  it('los $ del nombre del evento no se interpretan como patrones de reemplazo', () => {
    expect(
      eventWhatsappText('Quiero ir a {evento} ({fecha})', { venue: "Club $& Bar $' x", date: '2026-11-14' }),
    ).toBe("Quiero ir a Club $& Bar $' x (14 de noviembre de 2026)");
    // Un {algo} escrito en el lugar tampoco se confunde con un placeholder de la plantilla.
    expect(fillEventMessage('Evento: {evento}', { evento: 'Fiesta {fecha}', fecha: 'X' })).toBe('Evento: Fiesta {fecha}');
  });
});

describe('texto bien formado', () => {
  it('cleanText quita mitades sueltas de emojis y conserva los completos', () => {
    expect(cleanText('Prueba \ud83d Uno \u{1F600}')).toBe('Prueba Uno \u{1F600}');
    expect(cleanText('\udc00x')).toBe('x');
    expect(isWellFormedText('ok \u{1F600}')).toBe(true);
    expect(isWellFormedText('mal \ud83d')).toBe(false);
    expect(toWellFormedText('a😀\ud83db')).toBe('a\u{1F600}b');
  });
  it('sliceText no parte un par sustituto', () => {
    expect(sliceText('ab\u{1F600}', 3)).toBe('ab');
    expect(sliceText('ab\u{1F600}', 4)).toBe('ab\u{1F600}');
    expect(sliceText('abc', 10)).toBe('abc');
  });
});

describe('fechas', () => {
  it('fecha de Bogotá y formatos', () => {
    // 2026-09-29 03:00 UTC = 2026-09-28 22:00 en Bogotá
    expect(todayBogota(new Date('2026-09-29T03:00:00Z'))).toBe('2026-09-28');
    expect(formatShowDate('2026-11-14')).toBe('14 NOV');
    expect(isValidDateOnly('2026-02-30')).toBe(false);
    expect(addBusinessDays('2026-09-25', 10)).toBe('2026-10-09');
  });

  it('Pascua', () => {
    expect(['2026', '2027', '2028', '2029', '2030'].map((y) => easterSunday(Number(y)))).toEqual([
      '2026-04-05',
      '2027-03-28',
      '2028-04-16',
      '2029-04-01',
      '2030-04-21',
    ]);
  });

  it('festivos de Colombia 2026 (calendario oficial: 18 días)', () => {
    expect([...colombianHolidays(2026)].sort()).toEqual([
      '2026-01-01',
      '2026-01-12',
      '2026-03-23',
      '2026-04-02',
      '2026-04-03',
      '2026-05-01',
      '2026-05-18',
      '2026-06-08',
      '2026-06-15',
      '2026-06-29',
      '2026-07-20',
      '2026-08-07',
      '2026-08-17',
      '2026-10-12',
      '2026-11-02',
      '2026-11-16',
      '2026-12-08',
      '2026-12-25',
    ]);
    // Ley Emiliani: el 12 de octubre de 2027 es martes y pasa al lunes 18.
    expect(colombianHolidays(2027).has('2027-10-18')).toBe(true);
    expect(colombianHolidays(2027).has('2027-10-12')).toBe(false);
  });

  it('días hábiles de las PQRS: sin fines de semana ni festivos', () => {
    expect(isBusinessDay('2026-10-12')).toBe(false); // Día de la Raza (lunes)
    expect(isBusinessDay('2026-10-13')).toBe(true);
    expect(isBusinessDay('2026-10-10')).toBe(false); // sábado
    // Desde el lunes 28 de sep. de 2026: el 12 de octubre no cuenta.
    expect(addBusinessDays('2026-09-28', 10)).toBe('2026-10-13');
    // Semana Santa 2027 (jueves 25 y viernes 26 de marzo) y San José (lunes 22).
    expect(addBusinessDays('2027-03-18', 3)).toBe('2027-03-24');
    expect(addBusinessDays('2027-03-24', 1)).toBe('2027-03-29');
    // Diciembre: 8 y 25 de 2026 (martes y viernes), y Año Nuevo 2027 (viernes).
    expect(addBusinessDays('2026-12-07', 1)).toBe('2026-12-09');
    expect(addBusinessDays('2026-12-24', 2)).toBe('2026-12-29');
    expect(addBusinessDays('2026-12-31', 1)).toBe('2027-01-04');
    expect(businessDaysInRange('2026-09-29', '2026-10-14')).toBe(10);
    expect(businessDaysInRange('2026-10-14', '2026-09-29')).toBe(0);
  });
});

describe('otros', () => {
  it('limpia texto invisible', () => {
    expect(cleanText('a​b‮c\u0000')).toBe('abc');
  });
  it('solo permite next internos', () => {
    expect(isSafeNextPath('/panel/fotos')).toBe(true);
    expect(isSafeNextPath('//evil.com')).toBe(false);
    expect(isSafeNextPath('https://evil.com')).toBe(false);
  });
});

describe('estados del perfil', () => {
  it('transiciones del admin y del dueño', () => {
    expect(canTransition('submit', 'DRAFT')).toBe(true);
    expect(canTransition('submit', 'APPROVED')).toBe(false);
    expect(canTransition('approve', 'DRAFT')).toBe(true);
    expect(canTransition('approve', 'SUSPENDED')).toBe(false);
    expect(canTransition('reject', 'PENDING_REVIEW')).toBe(true);
    expect(canTransition('suspend', 'DRAFT')).toBe(false);
    expect(canTransition('reinstate', 'SUSPENDED')).toBe(true);
  });
  it('cada acción parte de estados válidos y termina en uno válido', () => {
    for (const a of PROFILE_STATUS_ACTIONS) {
      const t = STATUS_TRANSITIONS[a];
      expect(PROFILE_STATUSES).toContain(t.to);
      for (const from of t.from) expect(PROFILE_STATUSES).toContain(from);
      expect(t.from).not.toContain(t.to);
    }
  });
});

describe('datos legales (art. 53)', () => {
  it('normaliza el número de documento según el tipo', () => {
    expect(normalizeDocNumber('CC', '1.023.456.789')).toBe('1023456789');
    expect(normalizeDocNumber('NIT', '900.123.456-7')).toBe('9001234567');
    expect(normalizeDocNumber('CE', 'ab 12345')).toBe('AB12345');
    expect(normalizeDocNumber('CC', 'AB1234')).toBeNull();
    expect(normalizeDocNumber('PASAPORTE', '12')).toBeNull();
    expect(normalizeDocNumber('CC', '1'.repeat(21))).toBeNull();
    expect(normalizeDocNumber('CC', 42)).toBeNull();
  });
});

describe('contrato de sesión', () => {
  it('rutas y cabeceras de auth', () => {
    expect(API_ROUTES.authMfa).toBe('/api/auth/mfa');
    expect(API_ROUTES.authStepUp).toBe('/api/auth/step-up');
    expect(API_ROUTES.authLogout).toBe('/api/auth/logout');
    expect(AUTH_HEADERS).toEqual({ xhrName: 'X-Requested-With', xhrValue: 'fersua', stepUp: 'X-Step-Up' });
    expect(LIMITS.admin.pageSizeMax).toBeGreaterThanOrEqual(LIMITS.admin.pageSizeDefault);
    expect(LIMITS.genres.nameMin).toBeLessThan(LIMITS.genres.nameMax);
  });
});
