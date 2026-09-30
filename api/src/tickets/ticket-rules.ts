import { randomBytes } from 'node:crypto';
import {
  LIMITS,
  addBusinessDays,
  cleanText,
  containsCardNumber,
  isValidEmail,
  isValidPhone,
  isWellFormedText,
  normalizeEmail,
  PQRS_DEADLINE_BUSINESS_DAYS,
  type TicketType,
} from '@fersua/shared';

// Validación pura de un ticket (PQRS, reporte de perfil, solicitud de datos de un DJ).

export type TicketFieldError = 'REQUIRED' | 'TOO_SHORT' | 'TOO_LONG' | 'INVALID' | 'CARD_NUMBER' | 'NOT_FOUND';

/** Tipos que siempre se refieren a un perfil concreto. */
export const TICKET_TYPES_WITH_PROFILE: ReadonlySet<TicketType> = new Set<TicketType>(['REPORTE_PERFIL', 'SOLICITUD_DATOS_DJ']);

const MIN = { name: 2, subject: 3, message: 10 } as const;
const MESSAGE_MAX_LINES = 60;

/**
 * Topes diarios (ventana de 24 h, contados en la BD: sobreviven a reinicios, a diferencia del
 * throttler en memoria). Deberían vivir en LIMITS.ticket (shared).
 * Una PQRS tiene plazo legal: pasado un tope NUNCA se guarda en silencio. Quien la envía recibe
 * un 429 con el correo de contacto como alternativa (como antes de M4). Solo el honeypot se
 * guarda como spam, sin aviso al admin.
 * - perIp: tickets de esta IP que no son spam. El honeypot de un bot detrás de la misma IP (CGNAT,
 *   una oficina) no le cierra el paso a una persona real.
 * - total: de todas las IP, sin el spam.
 * - spamPerIp: honeypot de esta IP. Pasado este ya no se guarda (id falso): un solo bot no llena
 *   la bandeja de spam ni el techo.
 * - hardTotal (todo, spam incluido): techo contra una avalancha desde muchas IP. Pasado este ya
 *   no se guarda nada: 429 para una persona y un id falso para el honeypot.
 */
export const TICKET_DAILY_CAPS = { perIp: 10, total: 200, spamPerIp: 10, hardTotal: 1_000 } as const;

export interface TicketRecentCounts {
  /** De esta IP, sin el spam. */
  ip: number;
  /** De esta IP, solo el spam. */
  ipSpam: number;
  /** De todas las IP, sin el spam. */
  total: number;
  /** De todas las IP, spam incluido. */
  all: number;
}

/** CAP_HARD: el techo diario; CAP_SPAM_IP: demasiado honeypot desde una IP. */
export type TicketCapReason = 'CAP_IP' | 'CAP_TOTAL' | 'CAP_SPAM_IP' | 'CAP_HARD';

/**
 * Qué tope se pasó (null = el ticket se guarda). Con el honeypot lleno solo cuentan el techo y
 * el tope de spam por IP: los otros dos son para personas reales.
 */
export function ticketCapReached(honeypotFilled: boolean, counts: TicketRecentCounts): TicketCapReason | null {
  if (counts.all >= TICKET_DAILY_CAPS.hardTotal) return 'CAP_HARD';
  if (honeypotFilled) return counts.ipSpam >= TICKET_DAILY_CAPS.spamPerIp ? 'CAP_SPAM_IP' : null;
  if (counts.ip >= TICKET_DAILY_CAPS.perIp) return 'CAP_IP';
  if (counts.total >= TICKET_DAILY_CAPS.total) return 'CAP_TOTAL';
  return null;
}

/** Nombre de cada tipo en el aviso al admin (sin texto del público). */
export const TICKET_TYPE_LABELS: Record<TicketType, string> = {
  PQRS_CONSULTA: 'Consulta sobre datos personales',
  PQRS_RECLAMO: 'Reclamo sobre datos personales',
  REPORTE_PERFIL: 'Reporte de un perfil',
  SOLICITUD_DATOS_DJ: 'Solicitud de datos de un DJ (art. 53)',
};

const CUID_RANDOM_CHARS = 16;

/**
 * Id falso para el honeypot cuando ya no se guarda (topes de spam) con la forma de un cuid
 * de Prisma ('c' + 8 de fecha + 16 más, en base 36). Un 'c' + hex delataba al bot que cayó en
 * la trampa (los cuid reales traen g-z).
 */
export function fakeTicketId(now: number = Date.now(), bytes: Uint8Array = randomBytes(CUID_RANDOM_CHARS)): string {
  const time = now.toString(36).padStart(8, '0').slice(-8);
  const rest = Array.from(bytes.subarray(0, CUID_RANDOM_CHARS), (b) => (b % 36).toString(36)).join('');
  return `c${time}${rest}`;
}

export interface CleanTicket {
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
}

export interface TicketValidation {
  value: CleanTicket;
  errors: Record<string, TicketFieldError>;
}

function len(s: string): number {
  return [...s].length;
}

export function validateTicketFields(input: {
  name: string;
  email: string;
  phone?: string | null;
  subject: string;
  message: string;
}): TicketValidation {
  const errors: Record<string, TicketFieldError> = {};

  const name = cleanText(input.name);
  if (!name) errors.name = 'REQUIRED';
  else if (len(name) < MIN.name) errors.name = 'TOO_SHORT';
  else if (len(name) > LIMITS.ticket.nameMax) errors.name = 'TOO_LONG';

  const email = normalizeEmail(cleanText(input.email));
  if (!email) errors.email = 'REQUIRED';
  else if (!isValidEmail(email)) errors.email = 'INVALID';

  const phoneRaw = cleanText(input.phone ?? '');
  let phone: string | null = null;
  if (phoneRaw) {
    if (!isValidPhone(phoneRaw)) errors.phone = 'INVALID';
    else phone = phoneRaw;
  }

  const subject = cleanText(input.subject);
  if (!subject) errors.subject = 'REQUIRED';
  else if (len(subject) < MIN.subject) errors.subject = 'TOO_SHORT';
  else if (len(subject) > LIMITS.ticket.subjectMax) errors.subject = 'TOO_LONG';
  else if (containsCardNumber(subject)) errors.subject = 'CARD_NUMBER';

  const message = cleanText(input.message, { multiline: true, maxLines: MESSAGE_MAX_LINES });
  if (!message) errors.message = 'REQUIRED';
  else if (len(message) < MIN.message) errors.message = 'TOO_SHORT';
  else if (len(message) > LIMITS.ticket.messageMax) errors.message = 'TOO_LONG';
  else if (containsCardNumber(message)) errors.message = 'CARD_NUMBER';

  // Mitades sueltas de emojis ("\ud83d" es JSON válido): cleanText ya las quita, pero llegar
  // así es señal de un cliente que no es un navegador. Se rechaza en vez de guardar otra cosa.
  const raw = { name: input.name, email: input.email, phone: input.phone ?? '', subject: input.subject, message: input.message };
  for (const [key, v] of Object.entries(raw)) {
    if (typeof v === 'string' && !isWellFormedText(v)) errors[key] = 'INVALID';
  }

  return { value: { name, email, phone, subject, message }, errors };
}

/** Vencimiento legal en días hábiles (lunes a viernes sin festivos de Colombia). */
export function ticketDueDate(type: TicketType, today: string): string {
  return addBusinessDays(today, PQRS_DEADLINE_BUSINESS_DAYS[type]);
}
