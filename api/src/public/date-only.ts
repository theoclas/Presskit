import { isValidDateOnly } from '@fersua/shared';

// Columnas @db.Date: Prisma las devuelve como medianoche UTC. Se leen y escriben siempre
// en UTC para que '2026-11-14' no se convierta en el 13 por la zona horaria del servidor.

/** Date de una columna @db.Date → 'YYYY-MM-DD'. */
export function dateOnlyFromDb(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 'YYYY-MM-DD' → Date para comparar o guardar en una columna @db.Date. */
export function dateOnlyToDb(dateOnly: string): Date {
  if (!isValidDateOnly(dateOnly)) throw new Error('Fecha inválida');
  return new Date(`${dateOnly}T00:00:00.000Z`);
}
