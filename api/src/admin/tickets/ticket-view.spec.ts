import { cleanResolution, splitPage, toTicketDto } from './ticket-view';

describe('splitPage (vencidos primero)', () => {
  it('página que cae entera en los vencidos', () => {
    expect(splitPage(0, 20, 50)).toEqual({ first: { skip: 0, take: 20 }, rest: null });
    expect(splitPage(20, 20, 50)).toEqual({ first: { skip: 20, take: 20 }, rest: null });
  });

  it('página que cruza el borde entre tramos', () => {
    expect(splitPage(40, 20, 50)).toEqual({ first: { skip: 40, take: 10 }, rest: { skip: 0, take: 10 } });
  });

  it('página que cae entera en el resto', () => {
    expect(splitPage(60, 20, 50)).toEqual({ first: null, rest: { skip: 10, take: 20 } });
  });

  it('sin vencidos', () => {
    expect(splitPage(0, 20, 0)).toEqual({ first: null, rest: { skip: 0, take: 20 } });
    expect(splitPage(40, 20, 0)).toEqual({ first: null, rest: { skip: 40, take: 20 } });
  });

  it('cubre la lista completa sin huecos ni repetidos', () => {
    const overdue = 7;
    const total = 23;
    const all = Array.from({ length: total }, (_, i) => i);
    for (const size of [1, 3, 5, 7, 10, 30]) {
      const seen: number[] = [];
      for (let skip = 0; skip < total; skip += size) {
        const { first, rest } = splitPage(skip, size, overdue);
        if (first) seen.push(...all.slice(0, overdue).slice(first.skip, first.skip + first.take));
        if (rest) seen.push(...all.slice(overdue).slice(rest.skip, rest.skip + rest.take));
      }
      expect(seen).toEqual(all);
    }
  });
});

describe('cleanResolution', () => {
  it('limpia y conserva los saltos de línea', () => {
    expect(cleanResolution('  Hola Ana,\r\n\r\n\r\nYa borramos tus datos.​  ')).toBe('Hola Ana,\n\nYa borramos tus datos.');
  });

  it("null o '' la borran", () => {
    expect(cleanResolution(null)).toBeNull();
    expect(cleanResolution('   ')).toBeNull();
  });

  it('máximo 3000 caracteres después de limpiar (los emojis cuentan como uno)', () => {
    expect(cleanResolution('🎧'.repeat(3000))).toHaveLength(6000);
    expect(() => cleanResolution('a'.repeat(3001))).toThrow();
  });

  it('rechaza mitades sueltas de emoji', () => {
    expect(() => cleanResolution('Respuesta \ud83d')).toThrow();
  });
});

describe('toTicketDto', () => {
  const base = {
    id: 'cticket000000000000000001',
    type: 'PQRS_CONSULTA' as const,
    profile: null,
    profileSlug: null,
    name: 'Ana',
    email: 'ana@correo.com',
    phone: null,
    subject: 'Consulta',
    message: 'Hola',
    // Vence el martes 13 de octubre de 2026 (10 hábiles desde el 28 de sep.; el 12 es festivo).
    dueAt: new Date('2026-10-13T00:00:00.000Z'),
    resolution: null,
    createdAt: new Date('2026-09-28T15:00:00.000Z'),
  };

  it('abierto: cuenta desde hoy en Bogotá', () => {
    // 2026-09-29 03:00 UTC es todavía el 28 en Bogotá (lunes): quedan 10 hábiles.
    const dto = toTicketDto({ ...base, status: 'OPEN', resolvedAt: null }, new Date('2026-09-29T03:00:00.000Z'));
    expect(dto.dueAt).toBe('2026-10-13');
    expect(dto.businessDaysLeft).toBe(10);
  });

  it('abierto y vencido: negativo', () => {
    const dto = toTicketDto({ ...base, status: 'IN_PROGRESS', resolvedAt: null }, new Date('2026-10-15T15:00:00.000Z'));
    expect(dto.businessDaysLeft).toBe(-2);
  });

  it('cerrado: se congela en el día en que se resolvió', () => {
    const resolvedAt = new Date('2026-10-09T15:00:00.000Z');
    const dto = toTicketDto({ ...base, status: 'RESOLVED', resolvedAt }, new Date('2027-01-01T15:00:00.000Z'));
    expect(dto.businessDaysLeft).toBe(1);
    expect(dto.resolvedAt).toBe(resolvedAt.toISOString());
  });
});
