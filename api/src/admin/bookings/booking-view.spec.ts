import { payloadFields, statusChange, toBookingDetail } from './booking-view';

describe('payloadFields', () => {
  it('devuelve las filas bien formadas y descarta el resto', () => {
    expect(
      payloadFields([
        { key: 'name', label: 'Nombre', value: 'Ana' },
        { key: 'budget', label: 'Presupuesto', value: 5 },
        null,
        'texto',
        { key: 'city', label: 'Ciudad', value: 'Medellín', extra: 'x' },
      ]),
    ).toEqual([
      { key: 'name', label: 'Nombre', value: 'Ana' },
      { key: 'city', label: 'Ciudad', value: 'Medellín' },
    ]);
  });

  it('un payload que no es lista da []', () => {
    expect(payloadFields({ name: 'Ana' })).toEqual([]);
    expect(payloadFields(null)).toEqual([]);
  });
});

describe('statusChange', () => {
  const now = new Date('2026-09-29T12:00:00.000Z');
  const earlier = new Date('2026-09-20T12:00:00.000Z');

  it('NEW vuelve a sin leer', () => {
    expect(statusChange('NEW', { readAt: earlier, archivedAt: earlier }, now)).toEqual({ status: 'NEW', readAt: null, archivedAt: null });
  });

  it('READ marca leída una sola vez y saca del archivo', () => {
    expect(statusChange('READ', { readAt: null, archivedAt: earlier }, now)).toEqual({ status: 'READ', readAt: now, archivedAt: null });
    expect(statusChange('READ', { readAt: earlier, archivedAt: null }, now).readAt).toBe(earlier);
  });

  it('ARCHIVED: leída y archivada, sin pisar fechas previas', () => {
    expect(statusChange('ARCHIVED', { readAt: null, archivedAt: null }, now)).toEqual({ status: 'ARCHIVED', readAt: now, archivedAt: now });
    expect(statusChange('ARCHIVED', { readAt: earlier, archivedAt: earlier }, now)).toEqual({
      status: 'ARCHIVED',
      readAt: earlier,
      archivedAt: earlier,
    });
  });

  it('SPAM: leída y fuera del archivo', () => {
    expect(statusChange('SPAM', { readAt: null, archivedAt: earlier }, now)).toEqual({ status: 'SPAM', readAt: now, archivedAt: null });
  });
});

describe('toBookingDetail', () => {
  it('fechas de calendario sin corrimiento y fechas-hora en ISO', () => {
    const dto = toBookingDetail({
      id: 'cbooking00000000000000001',
      profile: { id: 'cprofile00000000000000001', slug: 'dj-uno', displayName: 'DJ Uno' },
      contactName: 'Ana',
      contactEmail: null,
      contactPhone: '3001234567',
      eventDate: new Date('2026-11-14T00:00:00.000Z'),
      status: 'NEW',
      createdAt: new Date('2026-09-29T12:00:00.000Z'),
      payload: [{ key: 'name', label: 'Nombre', value: 'Ana' }],
      consentAt: new Date('2026-09-29T12:00:00.000Z'),
      consentVersion: '2026-09',
      readAt: null,
    });
    expect(dto.eventDate).toBe('2026-11-14');
    expect(dto.fields).toEqual([{ key: 'name', label: 'Nombre', value: 'Ana' }]);
    expect(dto.readAt).toBeNull();
    expect(dto.createdAt).toBe('2026-09-29T12:00:00.000Z');
  });
});
