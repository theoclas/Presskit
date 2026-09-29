// Fechas de calendario como strings 'YYYY-MM-DD' en hora de Bogotá.
// Nunca `new Date('2026-11-14')`: eso se interpreta en UTC y en Colombia muestra el 13.

export const APP_TIME_ZONE = 'America/Bogota';
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function todayBogota(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  return parts; // en-CA ya produce YYYY-MM-DD
}

export function isValidDateOnly(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_ONLY_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function addDays(dateOnly: string, days: number): string {
  const [y, m, d] = dateOnly.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/** Diferencia en días entre dos fechas 'YYYY-MM-DD' (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number) as [number, number, number];
  const [by, bm, bd] = b.split('-').map(Number) as [number, number, number];
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * Suma días hábiles (lunes a viernes). No descuenta festivos colombianos:
 * sirve como aviso de vencimiento para PQRS, el admin decide con criterio.
 */
export function addBusinessDays(dateOnly: string, days: number): string {
  let current = dateOnly;
  let added = 0;
  while (added < days) {
    current = addDays(current, 1);
    const [y, m, d] = current.split('-').map(Number) as [number, number, number];
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return current;
}

const MONTHS_SHORT = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MONTHS_LONG = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** '2026-11-14' → '14 NOV' (como la plantilla original). */
export function formatShowDate(dateOnly: string): string {
  const [, m, d] = dateOnly.split('-');
  return `${d} ${MONTHS_SHORT[Number(m) - 1] ?? ''}`.trim();
}

/** '2026-11-14' → '14 de noviembre de 2026'. */
export function formatLongDate(dateOnly: string): string {
  const [y, m, d] = dateOnly.split('-');
  return `${Number(d)} de ${MONTHS_LONG[Number(m) - 1] ?? ''} de ${y}`;
}
