import { addBusinessDays, addDays } from '@fersua/shared';
import { businessDaysLeft, weekdaysInRange } from './business-days';

// 2026-09-28 es lunes.
const MON = '2026-09-28';
const FRI = '2026-10-02';
const SAT = '2026-10-03';
const SUN = '2026-10-04';
const NEXT_MON = '2026-10-05';

describe('weekdaysInRange', () => {
  it('cuenta lunes a viernes con el final excluido', () => {
    expect(weekdaysInRange(MON, MON)).toBe(0);
    expect(weekdaysInRange(MON, addDays(MON, 1))).toBe(1);
    expect(weekdaysInRange(MON, SAT)).toBe(5);
    expect(weekdaysInRange(MON, NEXT_MON)).toBe(5);
    expect(weekdaysInRange(SAT, NEXT_MON)).toBe(0);
    expect(weekdaysInRange(FRI, NEXT_MON)).toBe(1);
  });

  it('semanas largas: descuenta los festivos de Colombia que caen entre semana', () => {
    // 10 semanas desde el 28 de sep. de 2026 = 50 días de semana, menos 12 oct., 2 nov. y 16 nov.
    expect(weekdaysInRange(MON, addDays(MON, 70))).toBe(47);
    // Hasta el jueves 10 de dic.: 53 días de semana, menos esos 3 y el 8 de dic.
    expect(weekdaysInRange(MON, addDays(MON, 73))).toBe(49);
    // Un año desde el 2 de oct. de 2026: 261 días de semana, menos 16 festivos entre semana.
    expect(weekdaysInRange(FRI, addDays(FRI, 365))).toBe(245);
  });

  it('rango invertido da 0', () => {
    expect(weekdaysInRange(NEXT_MON, MON)).toBe(0);
  });
});

describe('businessDaysLeft', () => {
  it('vence hoy → 0', () => {
    expect(businessDaysLeft(MON, MON)).toBe(0);
  });

  it('es el inverso de addBusinessDays desde cualquier día de la semana', () => {
    for (let offset = 0; offset < 7; offset++) {
      const today = addDays(MON, offset);
      for (let n = 1; n <= 30; n++) {
        expect(businessDaysLeft(today, addBusinessDays(today, n))).toBe(n);
      }
    }
  });

  it('plazos de PQRS: 10 y 15 hábiles desde un lunes (el 12 de octubre es festivo)', () => {
    expect(businessDaysLeft(MON, '2026-10-13')).toBe(10);
    expect(businessDaysLeft(MON, '2026-10-20')).toBe(15);
  });

  it('un festivo no descuenta días, igual que el fin de semana', () => {
    // Vence el martes 13 de oct.: el viernes 9 quedan 1 (el lunes 12 es festivo).
    expect(businessDaysLeft('2026-10-09', '2026-10-13')).toBe(1);
    expect(businessDaysLeft('2026-10-12', '2026-10-13')).toBe(1);
    // Venció el viernes 9: el martes 13 va 1 hábil de atraso, no 2.
    expect(businessDaysLeft('2026-10-13', '2026-10-09')).toBe(-1);
  });

  it('el fin de semana no descuenta días', () => {
    // Vence el lunes: el viernes quedan 1, el sábado y el domingo también 1.
    expect(businessDaysLeft(FRI, NEXT_MON)).toBe(1);
    expect(businessDaysLeft(SAT, NEXT_MON)).toBe(1);
    expect(businessDaysLeft(SUN, NEXT_MON)).toBe(1);
  });

  it('vencido → negativo, nunca 0', () => {
    // Venció el viernes: el sábado, el domingo y el lunes ya va 1 hábil de atraso.
    expect(businessDaysLeft(SAT, FRI)).toBe(-1);
    expect(businessDaysLeft(SUN, FRI)).toBe(-1);
    expect(businessDaysLeft(NEXT_MON, FRI)).toBe(-1);
    expect(businessDaysLeft(addDays(NEXT_MON, 1), FRI)).toBe(-2);
    // Vencimiento en fin de semana (no debería pasar): igual cuenta como vencido.
    expect(businessDaysLeft(SUN, SAT)).toBe(-1);
    expect(businessDaysLeft(NEXT_MON, MON)).toBe(-5);
  });
});
