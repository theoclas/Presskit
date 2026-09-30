import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios';
import { describe, expect, it } from 'vitest';
import {
  SLUG_TAKEN_MESSAGE,
  availabilityProblem,
  cleanSlugInput,
  displayNameProblem,
  effectiveSlug,
  slugAlternatives,
  slugProblem,
} from '../src/panel/onboarding';
import { canSubmit, checklistItems, missingLabels, statusBanner, submitProblem } from '../src/panel/status';

// Reglas del panel del DJ sin montar React: onboarding, estado, checklist y errores de envío.

function apiFail(status: number, data: unknown): AxiosError {
  const config = { headers: {} } as InternalAxiosRequestConfig;
  const response: AxiosResponse = { data, status, statusText: String(status), headers: {}, config, request: {} };
  return new AxiosError(`HTTP ${status}`, AxiosError.ERR_BAD_REQUEST, config, {}, response);
}

describe('onboarding: nombre y dirección', () => {
  it('sugiere la dirección desde el nombre hasta que la escriba a mano', () => {
    expect(effectiveSlug('Mike Bran & Macfly', '', false)).toBe('mike-bran-y-macfly');
    expect(effectiveSlug('   ', '', false)).toBe('');
    expect(effectiveSlug('Mike Bran', 'otra-cosa', true)).toBe('otra-cosa');
    expect(effectiveSlug('Mike Bran', '  Con-Mayus ', true)).toBe('con-mayus');
  });

  it('limpia lo que escribe: minúsculas y espacios como guiones', () => {
    expect(cleanSlugInput('DJ Ana María')).toBe('dj-ana-maría');
  });

  it('valida el formato y las reservadas antes de preguntar al api', () => {
    expect(slugProblem('')).toMatch(/Elige la dirección/);
    expect(slugProblem('ab')).toMatch(/de 3 a 40/);
    expect(slugProblem('dj--ana')).toMatch(/de 3 a 40/);
    expect(slugProblem('12345')).toMatch(/de 3 a 40/);
    expect(slugProblem('admin')).toMatch(/reservada/);
    expect(slugProblem('admin-panel')).toMatch(/reservada/);
    expect(slugProblem('panel')).toMatch(/reservada/);
    expect(slugProblem('dj-ana')).toBeNull();
  });

  it('nombre artístico de 2 a 60 caracteres', () => {
    expect(displayNameProblem('')).toMatch(/Escribe/);
    expect(displayNameProblem(' a ')).toMatch(/Mínimo 2/);
    expect(displayNameProblem('x'.repeat(61))).toMatch(/Máximo 60/);
    expect(displayNameProblem('DJ Ana')).toBeNull();
  });

  it('traduce la respuesta de disponibilidad', () => {
    expect(availabilityProblem({ available: true })).toBeNull();
    expect(availabilityProblem({ available: false, reason: 'TAKEN' })).toBe(SLUG_TAKEN_MESSAGE);
    expect(availabilityProblem({ available: false, reason: 'RESERVED' })).toMatch(/reservada/);
    expect(availabilityProblem({ available: false, reason: 'FORMAT' })).toMatch(/de 3 a 40/);
  });

  it('propone alternativas válidas cuando está ocupada', () => {
    expect(slugAlternatives('dj-ana')).toEqual(['dj-ana-dj', 'dj-dj-ana', 'dj-ana-music']);
    expect(slugAlternatives('ana-dj')).toEqual(['dj-ana', 'ana-music']);
    for (const s of slugAlternatives('x'.repeat(39))) expect(slugProblem(s)).toBeNull();
  });
});

describe('estado del perfil', () => {
  it('etiquetas en español y el motivo solo en rechazado o suspendido', () => {
    expect(statusBanner({ status: 'DRAFT', statusReason: null }).label).toBe('Borrador');
    expect(statusBanner({ status: 'PENDING_REVIEW', statusReason: null }).label).toBe('En revisión');
    const approved = statusBanner({ status: 'APPROVED', statusReason: 'viejo' });
    expect(approved.label).toBe('Aprobado');
    expect(approved.type).toBe('success');
    expect(approved.reason).toBeNull();
    const rejected = statusBanner({ status: 'REJECTED', statusReason: '  Falta una foto de portada nítida.  ' });
    expect(rejected.label).toBe('Rechazado');
    expect(rejected.type).toBe('error');
    expect(rejected.reason).toBe('Falta una foto de portada nítida.');
    const suspended = statusBanner({ status: 'SUSPENDED', statusReason: 'Contenido reportado.' });
    expect(suspended.label).toBe('Suspendido');
    expect(suspended.reason).toBe('Contenido reportado.');
  });

  it('borrador y rechazado avisan que se borran por inactividad', () => {
    expect(statusBanner({ status: 'DRAFT', statusReason: null }).description).toContain('Si no la editas en 30 días, se borra');
    expect(statusBanner({ status: 'REJECTED', statusReason: null }).description).toContain('Si no lo cambias en 30 días, se borra');
    expect(statusBanner({ status: 'APPROVED', statusReason: null }).description).not.toContain('se borra');
  });

  it('solo se envía desde borrador o rechazado', () => {
    expect(canSubmit('DRAFT')).toBe(true);
    expect(canSubmit('REJECTED')).toBe(true);
    expect(canSubmit('PENDING_REVIEW')).toBe(false);
    expect(canSubmit('APPROVED')).toBe(false);
    expect(canSubmit('SUSPENDED')).toBe(false);
  });
});

describe('checklist para enviar a revisión', () => {
  it('marca lo que falta según publishMissing, el registro legal y el correo', () => {
    const items = checklistItems({ publishMissing: ['heroImage', 'members', 'legalInfo'], hasLegalInfo: false }, false);
    const byKey = Object.fromEntries(items.map((i) => [i.key, i]));
    expect(byKey.emailVerified?.done).toBe(false);
    expect(byKey.heroImage?.done).toBe(false);
    expect(byKey.heroImage?.to).toBe('/panel/fotos');
    expect(byKey.members?.to).toBe('/panel/integrantes');
    expect(byKey.legalInfo?.done).toBe(false);
    expect(byKey.legalInfo?.to).toBe('/panel/legal');
    expect(byKey.displayName?.done).toBe(true);
    expect(byKey.contact?.done).toBe(true);
    expect(items.some((i) => i.key === 'other')).toBe(false);
  });

  it('completo con el correo confirmado y los datos legales', () => {
    const items = checklistItems({ publishMissing: [], hasLegalInfo: true }, true);
    expect(items.every((i) => i.done)).toBe(true);
  });

  it('sin registro legal aunque publishMissing no lo diga, y claves nuevas como «otro dato»', () => {
    const items = checklistItems({ publishMissing: ['somethingNew'], hasLegalInfo: false }, true);
    expect(items.find((i) => i.key === 'legalInfo')?.done).toBe(false);
    expect(items.at(-1)).toMatchObject({ key: 'other', done: false });
  });
});

describe('errores de «Enviar a revisión»', () => {
  it('PROFILE_INCOMPLETE lista lo que falta en el orden del resumen', () => {
    const p = submitProblem(
      apiFail(409, {
        statusCode: 409,
        code: 'PROFILE_INCOMPLETE',
        message: 'Completa tu perfil antes de enviarlo a revisión.',
        details: { heroImage: 'REQUIRED', 'texts.heroTitle': 'REQUIRED', futureKey: 'REQUIRED' },
      }),
    );
    expect(p.code).toBe('PROFILE_INCOMPLETE');
    expect(p.title).toMatch(/Te falta completar/);
    expect(p.items).toEqual([
      'Escribe el título de la portada',
      'Sube la foto principal (portada)',
      'Hay otro dato pendiente en tu perfil',
    ]);
  });

  it('PROFILE_INCOMPLETE sin detalles da un mensaje general', () => {
    const p = submitProblem(apiFail(409, { statusCode: 409, code: 'PROFILE_INCOMPLETE', message: 'x' }));
    expect(p.items).toEqual([]);
    expect(p.title).toMatch(/Completa tu perfil/);
  });

  it('EMAIL_NOT_VERIFIED pide confirmar el correo', () => {
    const p = submitProblem(apiFail(403, { statusCode: 403, code: 'EMAIL_NOT_VERIFIED', message: 'x' }));
    expect(p.title).toMatch(/Confirma tu correo/);
    expect(p.items[0]).toMatch(/Reenviar correo/);
  });

  it('LEGAL_INFO_REQUIRED manda a Datos legales', () => {
    const p = submitProblem(apiFail(409, { statusCode: 409, code: 'LEGAL_INFO_REQUIRED', message: 'x' }));
    expect(p.title).toMatch(/datos legales/);
    expect(p.link).toEqual({ to: '/panel/legal', label: 'Ir a Datos legales' });
  });

  it('otros errores usan el mensaje del panel', () => {
    expect(submitProblem(apiFail(429, 'Too many')).title).toMatch(/Demasiados intentos/);
    expect(submitProblem(new Error('x')).title).toMatch(/inesperado/);
  });

  it('missingLabels ignora detalles vacíos', () => {
    expect(missingLabels(undefined)).toEqual([]);
    expect(missingLabels({ legalInfo: 'REQUIRED', displayName: 'REQUIRED' })).toEqual([
      'Escribe tu nombre artístico',
      'Completa tus datos legales (art. 53 Ley 1480)',
    ]);
  });
});
