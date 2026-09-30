import { LIMITS, addDays, defaultFormConfig } from '@fersua/shared';
import { FieldCheck } from './field-check';
import {
  canTransition,
  checkEventDate,
  normalizeDocNumber,
  normalizeLinks,
  publishChecklist,
  quotaError,
  keepsRedirects,
  redirectsToEvict,
  slugCooldownUntil,
  usageDto,
  type ChecklistInput,
} from './profile-rules';

describe('normalizeLinks (redes)', () => {
  it('normaliza @usuario y quita rastreo; conserva el orden', () => {
    const check = new FieldCheck();
    const out = normalizeLinks(
      [
        { platform: 'INSTAGRAM', url: '@mikebran' },
        { platform: 'SOUNDCLOUD', url: 'http://soundcloud.com/macfly?utm_source=x&si=abc', label: '  Sets  ' },
      ],
      LIMITS.social.perProfileMax,
      check,
    );
    expect(check.ok).toBe(true);
    expect(out).toEqual([
      { platform: 'INSTAGRAM', url: 'https://www.instagram.com/mikebran/', label: null },
      { platform: 'SOUNDCLOUD', url: 'https://soundcloud.com/macfly', label: 'Sets' },
    ]);
  });

  it('una por red, salvo sitio web (máx. 2); URLs repetidas no', () => {
    const check = new FieldCheck();
    const out = normalizeLinks(
      [
        { platform: 'INSTAGRAM', url: '@a' },
        { platform: 'INSTAGRAM', url: '@b' },
        { platform: 'WEBSITE', url: 'https://uno.com' },
        { platform: 'WEBSITE', url: 'https://dos.com' },
        { platform: 'WEBSITE', url: 'https://tres.com' },
      ],
      10,
      check,
    );
    expect(out.map((l) => l.url)).toEqual(['https://www.instagram.com/a/', 'https://uno.com/', 'https://dos.com/']);
    expect(check.errors).toEqual({ 'links[1].platform': 'DUPLICATE_PLATFORM', 'links[4].platform': 'DUPLICATE_PLATFORM' });

    const dup = new FieldCheck();
    normalizeLinks([{ platform: 'WEBSITE', url: 'uno.com' }, { platform: 'WEBSITE', url: 'https://uno.com/' }], 10, dup);
    expect(dup.errors).toEqual({ 'links[1].url': 'DUPLICATE_URL' });
  });

  it('rechaza hosts de otra red, http a IPs, javascript: y etiquetas largas', () => {
    const check = new FieldCheck();
    normalizeLinks(
      [
        { platform: 'INSTAGRAM', url: 'https://evil.com/mikebran' },
        { platform: 'WEBSITE', url: 'http://127.0.0.1/admin' },
        { platform: 'WEBSITE', url: 'javascript:alert(1)' },
        { platform: 'SPOTIFY', url: 'https://open.spotify.com/artist/1', label: 'x'.repeat(LIMITS.social.labelMax + 1) },
      ],
      10,
      check,
    );
    expect(check.errors).toEqual({
      'links[0].url': 'HOST_NOT_ALLOWED',
      'links[1].url': 'HOST_NOT_ALLOWED',
      'links[2].url': 'INVALID_URL',
      'links[3].label': 'TOO_LONG',
    });
  });

  it('más enlaces que el máximo: error de lista y se ignoran los sobrantes', () => {
    const check = new FieldCheck();
    const out = normalizeLinks(
      [
        { platform: 'INSTAGRAM', url: '@a' },
        { platform: 'TIKTOK', url: '@a' },
      ],
      1,
      check,
    );
    expect(out).toHaveLength(1);
    expect(check.errors).toEqual({ links: 'TOO_MANY' });
  });
});

describe('checkEventDate', () => {
  const today = '2026-09-29';

  it('hoy y hasta +730 días; formato y calendario válidos', () => {
    expect(checkEventDate(today, today, false)).toBeNull();
    expect(checkEventDate(addDays(today, LIMITS.events.maxDaysAhead), today, false)).toBeNull();
    expect(checkEventDate(addDays(today, LIMITS.events.maxDaysAhead + 1), today, false)).toBe('TOO_FAR');
    expect(checkEventDate('2026-02-30', today, false)).toBe('INVALID');
    expect(checkEventDate('29/09/2026', today, false)).toBe('INVALID');
    expect(checkEventDate(undefined, today, true)).toBe('INVALID');
  });

  it('el dueño no puede poner fechas pasadas; el admin sí (hasta 10 años)', () => {
    expect(checkEventDate('2026-09-28', today, false)).toBe('PAST');
    expect(checkEventDate('2026-09-28', today, true)).toBeNull();
    expect(checkEventDate('2016-01-01', today, true)).toBe('TOO_OLD');
    expect(checkEventDate(addDays(today, LIMITS.events.maxDaysAhead + 1), today, true)).toBe('TOO_FAR');
  });
});

describe('slug: cooldown y redirecciones', () => {
  const now = new Date('2026-09-29T12:00:00Z');
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);

  it('el dueño aprobado espera 30 días desde el último cambio; el admin nunca', () => {
    const recent = { status: 'APPROVED' as const, slugChangedAt: daysAgo(10) };
    expect(slugCooldownUntil(recent, false, now)?.toISOString()).toBe(new Date(daysAgo(10).getTime() + 30 * 86_400_000).toISOString());
    expect(slugCooldownUntil(recent, true, now)).toBeNull();
    expect(slugCooldownUntil({ status: 'APPROVED', slugChangedAt: daysAgo(31) }, false, now)).toBeNull();
    expect(slugCooldownUntil({ status: 'APPROVED', slugChangedAt: null }, false, now)).toBeNull();
    // Antes de aprobarse la dirección no es pública: puede cambiarla cuando quiera.
    expect(slugCooldownUntil({ status: 'DRAFT', slugChangedAt: daysAgo(1) }, false, now)).toBeNull();
  });

  it('deja solo las 5 redirecciones más nuevas', () => {
    const rows = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((s, i) => ({ fromSlug: s, createdAt: daysAgo(10 - i) }));
    expect(redirectsToEvict(rows).sort()).toEqual(['a', 'b']);
    expect(redirectsToEvict(rows.slice(0, 5))).toEqual([]);
  });
});

describe('estado y cuota', () => {
  it('transiciones permitidas', () => {
    expect(canTransition('submit', 'DRAFT')).toBe(true);
    expect(canTransition('submit', 'REJECTED')).toBe(true);
    expect(canTransition('submit', 'APPROVED')).toBe(false);
    expect(canTransition('approve', 'PENDING_REVIEW')).toBe(true);
    expect(canTransition('approve', 'DRAFT')).toBe(true);
    expect(canTransition('approve', 'SUSPENDED')).toBe(false);
    expect(canTransition('approve', 'APPROVED')).toBe(false);
    expect(canTransition('reject', 'PENDING_REVIEW')).toBe(true);
    expect(canTransition('reject', 'APPROVED')).toBe(false);
    expect(canTransition('suspend', 'APPROVED')).toBe(true);
    // Suspender un borrador y "reactivarlo" lo aprobaría sin revisión.
    expect(canTransition('suspend', 'DRAFT')).toBe(false);
    expect(canTransition('reinstate', 'SUSPENDED')).toBe(true);
    expect(canTransition('reinstate', 'REJECTED')).toBe(false);
  });

  it('cuota de 20 archivos / 25 MB sin aprobar y 100 / 100 MB aprobado', () => {
    const MB = 1024 * 1024;
    expect(quotaError('DRAFT', { assets: 19, bytes: 0 }, 0, 1)).toBeNull();
    expect(quotaError('DRAFT', { assets: 20, bytes: 0 }, 0, 1)).toBe('ASSETS');
    expect(quotaError('PENDING_REVIEW', { assets: 1, bytes: 25 * MB }, 1, 0)).toBe('BYTES');
    expect(quotaError('APPROVED', { assets: 20, bytes: 25 * MB }, 1, 1)).toBeNull();
    expect(quotaError('APPROVED', { assets: 100, bytes: 0 }, 0, 1)).toBe('ASSETS');
    // Suspendido vuelve a la cuota chica.
    expect(quotaError('SUSPENDED', { assets: 20, bytes: 0 }, 0, 1)).toBe('ASSETS');
    expect(usageDto('APPROVED', 3, 10)).toEqual({ assets: 3, bytes: 10, maxAssets: 100, maxBytes: 100 * MB });
  });
});

describe('publishChecklist', () => {
  const complete: ChecklistInput = {
    displayName: 'DJ Prueba',
    slug: 'dj-prueba',
    texts: {},
    heroImageId: 'hero1',
    activeGenres: 1,
    members: 1,
    whatsappNumber: null,
    bookingForm: defaultFormConfig(),
    hasLegalInfo: true,
  };

  it('completo → sin faltantes (el título del hero tiene valor por defecto)', () => {
    expect(publishChecklist(complete)).toEqual({});
  });

  it('lista cada faltante, incluido el registro legal', () => {
    expect(
      publishChecklist({ ...complete, heroImageId: null, activeGenres: 0, members: 0, hasLegalInfo: false, slug: 'admin' }),
    ).toEqual({ heroImage: 'REQUIRED', genres: 'REQUIRED', members: 'REQUIRED', legalInfo: 'REQUIRED', slug: 'INVALID' });
  });

  it('formulario roto: inválido y sin contacto si tampoco hay WhatsApp', () => {
    const noContact = [{ key: 'fullName', required: true }];
    expect(publishChecklist({ ...complete, bookingForm: noContact })).toEqual({ bookingForm: 'INVALID', contact: 'REQUIRED' });
    expect(publishChecklist({ ...complete, bookingForm: noContact, whatsappNumber: '573001112233' })).toEqual({ bookingForm: 'INVALID' });
  });

  it('perfil con dueño: el título de la portada tiene que ser suyo, no el de la plantilla', () => {
    expect(publishChecklist({ ...complete, ownHeroTitleRequired: true })).toEqual({ 'texts.heroTitle': 'REQUIRED' });
    expect(publishChecklist({ ...complete, ownHeroTitleRequired: true, texts: { heroTitle: '   ' } })).toEqual({ 'texts.heroTitle': 'REQUIRED' });
    expect(publishChecklist({ ...complete, ownHeroTitleRequired: true, texts: { heroTitle: 'Techno en vivo' } })).toEqual({});
  });
});

describe('keepsRedirects', () => {
  it('solo un perfil que ya se publicó conserva sus slugs viejos', () => {
    const at = new Date('2026-09-01T00:00:00Z');
    expect(keepsRedirects({ status: 'APPROVED', approvedAt: at })).toBe(true);
    expect(keepsRedirects({ status: 'SUSPENDED', approvedAt: at })).toBe(true);
    // El seed o datos viejos sin fecha: el estado basta.
    expect(keepsRedirects({ status: 'APPROVED', approvedAt: null })).toBe(true);
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'REJECTED'] as const) {
      expect(keepsRedirects({ status, approvedAt: null })).toBe(false);
    }
  });
});

describe('normalizeDocNumber', () => {
  it('quita puntos, guiones y espacios; CC y NIT solo dígitos', () => {
    expect(normalizeDocNumber('CC', '1.023.456.789')).toBe('1023456789');
    expect(normalizeDocNumber('NIT', '900.123.456-7')).toBe('9001234567');
    expect(normalizeDocNumber('CC', 'AB123456')).toBeNull();
    expect(normalizeDocNumber('PASAPORTE', 'ab 123456')).toBe('AB123456');
    expect(normalizeDocNumber('CE', '12')).toBeNull();
    expect(normalizeDocNumber('CC', '1'.repeat(21))).toBeNull();
    expect(normalizeDocNumber('CC', 123 as unknown as string)).toBeNull();
  });
});
