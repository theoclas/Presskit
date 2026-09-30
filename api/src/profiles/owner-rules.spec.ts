import {
  DRAFT_NOTICE_DAYS,
  OWNER_TRANSITIONS,
  daysBefore,
  draftAction,
  rejectedExpired,
  slugAvailability,
  submitBlocker,
  unverifiedUserExpired,
  type UnverifiedCandidate,
} from './owner-rules';

const DAY = 86_400_000;
const NOW = new Date('2026-09-29T09:40:00.000Z');
const ago = (days: number, extraMs = 0) => new Date(NOW.getTime() - days * DAY - extraMs);

describe('submitBlocker', () => {
  it('sin correo verificado gana sobre cualquier faltante', () => {
    expect(submitBlocker({ emailVerified: false, missing: {} })).toEqual({ code: 'EMAIL_NOT_VERIFIED' });
    expect(submitBlocker({ emailVerified: false, missing: { legalInfo: 'REQUIRED', heroImage: 'REQUIRED' } })).toEqual({
      code: 'EMAIL_NOT_VERIFIED',
    });
  });

  it('después, el registro legal (aunque falten otras cosas)', () => {
    expect(submitBlocker({ emailVerified: true, missing: { legalInfo: 'REQUIRED' } })).toEqual({ code: 'LEGAL_INFO_REQUIRED' });
    expect(submitBlocker({ emailVerified: true, missing: { legalInfo: 'REQUIRED', members: 'REQUIRED' } })).toEqual({
      code: 'LEGAL_INFO_REQUIRED',
    });
  });

  it('por último el resto del checklist, con los faltantes', () => {
    expect(submitBlocker({ emailVerified: true, missing: { heroImage: 'REQUIRED', bookingForm: 'INVALID' } })).toEqual({
      code: 'PROFILE_INCOMPLETE',
      missing: { heroImage: 'REQUIRED', bookingForm: 'INVALID' },
    });
  });

  it('todo listo → null', () => {
    expect(submitBlocker({ emailVerified: true, missing: {} })).toBeNull();
  });
});

describe('OWNER_TRANSITIONS', () => {
  it('retirar solo desde PENDING_REVIEW y vuelve a DRAFT', () => {
    expect(OWNER_TRANSITIONS.withdraw).toEqual({ from: ['PENDING_REVIEW'], to: 'DRAFT' });
  });
});

describe('slugAvailability (onboarding y editor)', () => {
  const free = { profileId: null, redirectProfileId: null };

  it('formato y reservadas', () => {
    expect(slugAvailability('a', free, null)).toEqual({ available: false, reason: 'FORMAT' });
    expect(slugAvailability('Mi-DJ', free, null)).toEqual({ available: false, reason: 'FORMAT' });
    expect(slugAvailability('dj--doble', free, null)).toEqual({ available: false, reason: 'FORMAT' });
    expect(slugAvailability('admin', free, null)).toEqual({ available: false, reason: 'RESERVED' });
    expect(slugAvailability('panel', free, null)).toEqual({ available: false, reason: 'RESERVED' });
    expect(slugAvailability('fersua-dj', free, null)).toEqual({ available: false, reason: 'RESERVED' });
  });

  it('tomado por otro perfil o por una redirección de otro perfil', () => {
    expect(slugAvailability('dj-nuevo', { profileId: 'p1', redirectProfileId: null }, null)).toEqual({ available: false, reason: 'TAKEN' });
    expect(slugAvailability('dj-nuevo', { profileId: null, redirectProfileId: 'p1' }, null)).toEqual({ available: false, reason: 'TAKEN' });
    expect(slugAvailability('dj-nuevo', { profileId: 'p1', redirectProfileId: null }, 'p2')).toEqual({ available: false, reason: 'TAKEN' });
  });

  it('libre, o propio (su slug actual o una redirección suya)', () => {
    expect(slugAvailability('dj-nuevo', free, null)).toEqual({ available: true });
    expect(slugAvailability('dj-nuevo', { profileId: 'p2', redirectProfileId: null }, 'p2')).toEqual({ available: true });
    expect(slugAvailability('dj-nuevo', { profileId: null, redirectProfileId: 'p2' }, 'p2')).toEqual({ available: true });
  });
});

describe('draftAction (borradores inactivos)', () => {
  const base = { warnedAt: null, canMail: true };

  it('menos de 21 días: nada', () => {
    expect(draftAction({ ...base, lastActivityAt: ago(20) }, NOW)).toBe('none');
    expect(draftAction({ ...base, lastActivityAt: ago(21, -60_000) }, NOW)).toBe('none');
  });

  it('día 21: aviso una sola vez por racha', () => {
    expect(draftAction({ ...base, lastActivityAt: ago(21) }, NOW)).toBe('warn');
    expect(draftAction({ lastActivityAt: ago(25), warnedAt: ago(4), canMail: true }, NOW)).toBe('none');
    // Un aviso anterior a la última edición no cuenta: empezó otra racha.
    expect(draftAction({ lastActivityAt: ago(22), warnedAt: ago(40), canMail: true }, NOW)).toBe('warn');
  });

  it('día 30 con el aviso de hace 9 días: se borra (con holgura por la hora del job)', () => {
    expect(draftAction({ lastActivityAt: ago(30), warnedAt: ago(DRAFT_NOTICE_DAYS), canMail: true }, NOW)).toBe('delete');
    expect(draftAction({ lastActivityAt: ago(30), warnedAt: ago(DRAFT_NOTICE_DAYS, -5 * 60_000), canMail: true }, NOW)).toBe('delete');
  });

  it('día 30 sin aviso previo pudiendo avisar: primero el aviso, y el borrado espera los 9 días', () => {
    expect(draftAction({ ...base, lastActivityAt: ago(45) }, NOW)).toBe('warn');
    expect(draftAction({ lastActivityAt: ago(45), warnedAt: ago(2), canMail: true }, NOW)).toBe('wait');
    expect(draftAction({ lastActivityAt: ago(45), warnedAt: ago(9), canMail: true }, NOW)).toBe('delete');
  });

  it('sin correo verificado no hay a quién avisar: se borra a los 30 días', () => {
    expect(draftAction({ lastActivityAt: ago(25), warnedAt: null, canMail: false }, NOW)).toBe('none');
    expect(draftAction({ lastActivityAt: ago(30), warnedAt: null, canMail: false }, NOW)).toBe('delete');
  });
});

describe('rejectedExpired', () => {
  it('solo REJECTED y con 30 días sin actividad', () => {
    expect(rejectedExpired({ status: 'REJECTED', lastActivityAt: ago(30) }, NOW)).toBe(true);
    expect(rejectedExpired({ status: 'REJECTED', lastActivityAt: ago(29) }, NOW)).toBe(false);
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SUSPENDED'] as const) {
      expect(rejectedExpired({ status, lastActivityAt: ago(400) }, NOW)).toBe(false);
    }
  });
});

describe('unverifiedUserExpired', () => {
  const user: UnverifiedCandidate = {
    role: 'USER',
    email: 'dj@example.com',
    emailVerifiedAt: null,
    createdAt: ago(14),
    managedByAdmin: false,
    profileStatus: null,
  };

  it('registrado solo, sin verificar, 14 días, sin perfil o con borrador → se borra', () => {
    expect(unverifiedUserExpired(user, NOW)).toBe(true);
    expect(unverifiedUserExpired({ ...user, profileStatus: 'DRAFT' }, NOW)).toBe(true);
  });

  it('antes de 14 días, verificado o sin correo → no', () => {
    expect(unverifiedUserExpired({ ...user, createdAt: ago(13) }, NOW)).toBe(false);
    expect(unverifiedUserExpired({ ...user, emailVerifiedAt: ago(1) }, NOW)).toBe(false);
    expect(unverifiedUserExpired({ ...user, email: null }, NOW)).toBe(false);
  });

  it('nunca el admin, ni cuentas que administra el admin, ni perfiles que no son borrador', () => {
    expect(unverifiedUserExpired({ ...user, role: 'ADMIN' }, NOW)).toBe(false);
    expect(unverifiedUserExpired({ ...user, managedByAdmin: true }, NOW)).toBe(false);
    for (const profileStatus of ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'] as const) {
      expect(unverifiedUserExpired({ ...user, profileStatus }, NOW)).toBe(false);
    }
  });
});

describe('daysBefore', () => {
  it('resta días exactos', () => {
    expect(daysBefore(NOW, 14).toISOString()).toBe('2026-09-15T09:40:00.000Z');
  });
});
