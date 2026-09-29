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

/** 0 = domingo … 6 = sábado. */
export function dayOfWeek(dateOnly: string): number {
  const [y, m, d] = dateOnly.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Domingo de Pascua (algoritmo gregoriano anónimo de Meeus/Jones/Butcher). */
export function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** El mismo día si es lunes; si no, el lunes siguiente (Ley 51 de 1983, "Ley Emiliani"). */
function nextMonday(dateOnly: string): string {
  const dow = dayOfWeek(dateOnly);
  return dow === 1 ? dateOnly : addDays(dateOnly, (8 - dow) % 7);
}

const holidayCache = new Map<number, ReadonlySet<string>>();

/**
 * Festivos de Colombia de un año: los fijos, los que se trasladan al lunes (Ley 51 de 1983) y
 * los que dependen de la Pascua (Jueves y Viernes Santo fijos; Ascensión, Corpus Christi y
 * Sagrado Corazón trasladados al lunes). Calculados, sin tabla que haya que actualizar.
 */
export function colombianHolidays(year: number): ReadonlySet<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const ymd = (m: number, d: number) => `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const easter = easterSunday(year);
  const days = [
    // Fijos
    ymd(1, 1), // Año Nuevo
    ymd(5, 1), // Día del Trabajo
    ymd(7, 20), // Independencia
    ymd(8, 7), // Batalla de Boyacá
    ymd(12, 8), // Inmaculada Concepción
    ymd(12, 25), // Navidad
    // Trasladables al lunes
    nextMonday(ymd(1, 6)), // Reyes Magos
    nextMonday(ymd(3, 19)), // San José
    nextMonday(ymd(6, 29)), // San Pedro y San Pablo
    nextMonday(ymd(8, 15)), // Asunción
    nextMonday(ymd(10, 12)), // Día de la Raza
    nextMonday(ymd(11, 1)), // Todos los Santos
    nextMonday(ymd(11, 11)), // Independencia de Cartagena
    // Según la Pascua
    addDays(easter, -3), // Jueves Santo
    addDays(easter, -2), // Viernes Santo
    addDays(easter, 43), // Ascensión (jueves +39, al lunes)
    addDays(easter, 64), // Corpus Christi (jueves +60, al lunes)
    addDays(easter, 71), // Sagrado Corazón (viernes +68, al lunes)
  ];
  const set: ReadonlySet<string> = new Set(days);
  holidayCache.set(year, set);
  return set;
}

/** Día hábil en Colombia: lunes a viernes que no sea festivo. */
export function isBusinessDay(dateOnly: string): boolean {
  const dow = dayOfWeek(dateOnly);
  if (dow === 0 || dow === 6) return false;
  return !colombianHolidays(Number(dateOnly.slice(0, 4))).has(dateOnly);
}

/**
 * Suma días hábiles (lunes a viernes sin festivos de Colombia): es como se cuentan los plazos
 * de las PQRS (Ley 1581, arts. 14 y 15).
 */
export function addBusinessDays(dateOnly: string, days: number): string {
  let current = dateOnly;
  let added = 0;
  while (added < days) {
    current = addDays(current, 1);
    if (isBusinessDay(current)) added++;
  }
  return current;
}

/** Días hábiles en [start, end): `end` excluido. 0 si end <= start. */
export function businessDaysInRange(start: string, end: string): number {
  let count = 0;
  for (let d = start; d < end; d = addDays(d, 1)) if (isBusinessDay(d)) count++;
  return count;
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
