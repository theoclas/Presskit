import { LIMITS, canTransition, type EditorProfileDto, type ProfileStatus } from '@fersua/shared';
import { apiError } from '../lib/http';
import { panelErrorMessage } from './errors';

// Estado del perfil y lista para enviar a revisión, en palabras del DJ.

export const STATUS_LABELS: Record<ProfileStatus, string> = {
  DRAFT: 'Borrador',
  PENDING_REVIEW: 'En revisión',
  APPROVED: 'Aprobado',
  REJECTED: 'Rechazado',
  SUSPENDED: 'Suspendido',
};

export const STATUS_COLORS: Record<ProfileStatus, string> = {
  DRAFT: 'default',
  PENDING_REVIEW: 'gold',
  APPROVED: 'green',
  REJECTED: 'red',
  SUSPENDED: 'volcano',
};

export interface StatusBanner {
  type: 'info' | 'warning' | 'success' | 'error';
  label: string;
  title: string;
  description: string;
  /** Motivo que escribió el admin (rechazo o suspensión). Texto plano. */
  reason: string | null;
}

export function statusBanner(p: Pick<EditorProfileDto, 'status' | 'statusReason'>): StatusBanner {
  const label = STATUS_LABELS[p.status];
  const reason = p.statusReason?.trim() || null;
  switch (p.status) {
    case 'DRAFT':
      return {
        type: 'info',
        label,
        title: 'Borrador: tu página todavía no es pública',
        description: `Complétala con la lista de abajo y envíala a revisión. Mientras tanto, usa «Vista previa» para ver cómo va. Si no la editas en ${LIMITS.retention.draftIdleDays} días, se borra (te avisamos antes por correo).`,
        reason: null,
      };
    case 'PENDING_REVIEW':
      return {
        type: 'warning',
        label,
        title: 'En revisión: el equipo de Fersua Studio está revisando tu perfil',
        description: 'Te avisaremos por correo cuando lo revisemos. Si necesitas cambiar algo antes, puedes retirarlo de revisión.',
        reason: null,
      };
    case 'APPROVED':
      return {
        type: 'success',
        label,
        title: 'Aprobado: tu página está publicada',
        description: 'Lo que guardes en el editor se publica al instante.',
        reason: null,
      };
    case 'REJECTED':
      return {
        type: 'error',
        label,
        title: 'Rechazado: tu perfil necesita cambios',
        description: `Revisa el motivo, haz los cambios y vuelve a enviarlo a revisión. Si no lo cambias en ${LIMITS.retention.rejectedIdleDays} días, se borra (tu cuenta no).`,
        reason,
      };
    case 'SUSPENDED':
      return {
        type: 'error',
        label,
        title: 'Suspendido: tu página no se ve en público',
        description: 'Si crees que es un error o quieres saber qué hacer, escríbenos desde PQRS.',
        reason,
      };
  }
}

export interface ChecklistItem {
  key: string;
  label: string;
  done: boolean;
  /** Sección del panel donde se completa (null si no aplica, p. ej. confirmar el correo). */
  to: string | null;
  hint?: string;
}

interface ChecklistDef {
  key: string;
  label: string;
  to: string | null;
  hint?: string;
}

/** Claves de publishMissing (api: publishChecklist) + el correo confirmado. Orden de la lista. */
export const CHECKLIST: readonly ChecklistDef[] = [
  {
    key: 'emailVerified',
    label: 'Confirma tu correo',
    to: null,
    hint: 'Abre el enlace que te enviamos. Si no te llegó, pide otro en el aviso de arriba.',
  },
  { key: 'displayName', label: 'Escribe tu nombre artístico', to: '/panel/perfil' },
  { key: 'slug', label: 'Elige una dirección válida para tu página', to: '/panel/perfil' },
  { key: 'texts.heroTitle', label: 'Escribe el título de la portada', to: '/panel/perfil' },
  { key: 'heroImage', label: 'Sube la foto principal (portada)', to: '/panel/fotos' },
  {
    key: 'genres',
    label: LIMITS.genres.perProfileMin === 1 ? 'Elige al menos un género' : `Elige al menos ${LIMITS.genres.perProfileMin} géneros`,
    to: '/panel/perfil',
  },
  { key: 'members', label: 'Agrega al menos un integrante', to: '/panel/integrantes' },
  { key: 'bookingForm', label: 'Revisa el formulario de solicitud', to: '/panel/formulario' },
  {
    key: 'contact',
    label: 'Agrega un canal de contacto',
    to: '/panel/perfil',
    hint: 'Tu número de WhatsApp, o pide correo o teléfono como obligatorio en el formulario.',
  },
  {
    key: 'legalInfo',
    label: 'Completa tus datos legales (art. 53 Ley 1480)',
    to: '/panel/legal',
    hint: 'Solo los ve el administrador; no salen en tu página.',
  },
];

const OTHER_ITEM: ChecklistDef = { key: 'other', label: 'Hay otro dato pendiente en tu perfil', to: '/panel/perfil' };

/** Lista completa (hecho / pendiente) para el resumen. */
export function checklistItems(
  profile: Pick<EditorProfileDto, 'publishMissing' | 'hasLegalInfo'>,
  emailVerified: boolean,
): ChecklistItem[] {
  const missing = new Set(profile.publishMissing ?? []);
  const items: ChecklistItem[] = CHECKLIST.map((def) => {
    let done: boolean;
    if (def.key === 'emailVerified') done = emailVerified;
    else if (def.key === 'legalInfo') done = profile.hasLegalInfo && !missing.has('legalInfo');
    else done = !missing.has(def.key);
    return { ...def, done };
  });
  const known = new Set(CHECKLIST.map((d) => d.key));
  if ([...missing].some((k) => !known.has(k))) items.push({ ...OTHER_ITEM, done: false });
  return items;
}

/** Etiquetas de lo que falta a partir de `details` de un 409 PROFILE_INCOMPLETE ({ clave: código }). */
export function missingLabels(details: Record<string, string> | undefined): string[] {
  if (!details) return [];
  const out: string[] = [];
  let other = false;
  for (const key of Object.keys(details)) {
    const def = CHECKLIST.find((d) => d.key === key);
    if (def) out.push(def.label);
    else other = true;
  }
  // En el orden de la lista del resumen.
  out.sort((a, b) => CHECKLIST.findIndex((d) => d.label === a) - CHECKLIST.findIndex((d) => d.label === b));
  if (other) out.push(OTHER_ITEM.label);
  return out;
}

export interface SubmitProblem {
  code: string;
  title: string;
  items: string[];
  link?: { to: string; label: string };
}

/** Error de «Enviar a revisión» -> qué decirle al DJ y a dónde mandarlo. */
export function submitProblem(e: unknown): SubmitProblem {
  const err = apiError(e);
  switch (err.code) {
    case 'EMAIL_NOT_VERIFIED':
      return {
        code: err.code,
        title: 'Confirma tu correo antes de enviar tu perfil a revisión.',
        items: ['Abre el enlace que te enviamos. Si no te llegó, pide otro con «Reenviar correo» en el aviso de arriba.'],
      };
    case 'LEGAL_INFO_REQUIRED':
      return {
        code: err.code,
        title: 'Completa tus datos legales antes de enviar tu perfil a revisión.',
        items: ['Son obligatorios por el art. 53 de la Ley 1480. Solo los ve el administrador.'],
        link: { to: '/panel/legal', label: 'Ir a Datos legales' },
      };
    case 'PROFILE_INCOMPLETE': {
      const items = missingLabels(err.details);
      return {
        code: err.code,
        title: items.length ? 'Te falta completar esto antes de enviar tu perfil:' : 'Completa tu perfil antes de enviarlo a revisión.',
        items,
      };
    }
    case 'INVALID_TRANSITION':
      return {
        code: err.code,
        title: 'Tu perfil ya no está en un estado que se pueda enviar. Recargamos su estado actual.',
        items: [],
      };
    default:
      return { code: err.code, title: panelErrorMessage(e), items: [] };
  }
}

/** Solo se envía desde borrador o rechazado (la misma tabla de transiciones que usa el api). */
export function canSubmit(status: ProfileStatus): boolean {
  return canTransition('submit', status);
}
