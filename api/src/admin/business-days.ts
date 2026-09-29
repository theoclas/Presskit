import { addDays, businessDaysInRange } from '@fersua/shared';

// Días hábiles para los vencimientos de tickets: lunes a viernes sin festivos de Colombia, con
// la misma regla que addBusinessDays de shared (que fija el vencimiento al crear el ticket).

/** Días hábiles en [start, end): `end` excluido. 0 si end <= start. */
export function weekdaysInRange(start: string, end: string): number {
  return businessDaysInRange(start, end);
}

/**
 * Días hábiles que quedan desde `today` hasta `due` (ambos 'YYYY-MM-DD', Bogotá).
 * - Vence hoy → 0 (último día).
 * - Vence más adelante → hábiles en (today, due]: es el inverso de addBusinessDays.
 * - Ya venció → negativo: -(hábiles en [due, today)), mínimo -1 para que "vencido" nunca
 *   se lea como 0 aunque el vencimiento cayera en fin de semana o festivo.
 */
export function businessDaysLeft(today: string, due: string): number {
  if (due >= today) return businessDaysInRange(addDays(today, 1), addDays(due, 1));
  return -Math.max(1, businessDaysInRange(due, today));
}
