import type { TicketStatus, TicketType } from '@prisma/client';
import { AppError } from '../../common/errors';
import {
  assertDisclosable,
  disclosureTemplate,
  legalPurgeAt,
  legalRecordStateWhere,
  toLegalRecordDetail,
  toLegalRecordListItem,
  type LegalRecordDetailRow,
} from './legal-record-view';

const base: LegalRecordDetailRow = {
  id: 'clegal0000000000000000001',
  profileId: 'cprofile00000000000000001',
  profile: { id: 'cprofile00000000000000001', slug: 'dj-uno', displayName: 'DJ Uno', status: 'APPROVED' },
  legalName: 'Persona Uno',
  closedAt: null,
  closedProfileSlug: null,
  closedDisplayName: null,
  createdAt: new Date('2026-01-10T15:00:00.000Z'),
  updatedAt: new Date('2026-02-10T15:00:00.000Z'),
  docType: 'CC',
  docNumber: '1023456781',
  address: 'Calle 1 # 2-3, Medellín',
  phones: ['3001234567', 42, '6041234567'],
};

const closed: LegalRecordDetailRow = {
  ...base,
  profileId: null,
  profile: null,
  closedAt: new Date('2026-03-31T12:00:00.000Z'),
  closedProfileSlug: 'dj-viejo',
  closedDisplayName: 'DJ Viejo',
};

function codeOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
}

describe('lista y detalle de registros del art. 53', () => {
  it('la fila de la lista no trae documento, dirección ni teléfonos', () => {
    const item = toLegalRecordListItem(base);
    expect(item).toEqual({
      id: base.id,
      state: 'active',
      profileId: base.profileId,
      slug: 'dj-uno',
      displayName: 'DJ Uno',
      profileStatus: 'APPROVED',
      legalName: 'Persona Uno',
      closedAt: null,
      purgeAt: null,
      createdAt: '2026-01-10T15:00:00.000Z',
      updatedAt: '2026-02-10T15:00:00.000Z',
    });
    const json = JSON.stringify(item);
    expect(json).not.toContain('1023456781');
    expect(json).not.toContain('Calle 1');
    expect(json).not.toContain('3001234567');
  });

  it('un registro conservado usa el slug y el nombre del momento del borrado y dice cuándo se purga', () => {
    const item = toLegalRecordListItem(closed);
    expect(item).toMatchObject({
      state: 'closed',
      profileId: null,
      slug: 'dj-viejo',
      displayName: 'DJ Viejo',
      profileStatus: null,
      closedAt: '2026-03-31T12:00:00.000Z',
      purgeAt: '2027-03-31T12:00:00.000Z',
    });
  });

  it('el detalle trae los datos completos y descarta teléfonos que no son texto', () => {
    const dto = toLegalRecordDetail(base);
    expect(dto).toMatchObject({ docType: 'CC', docNumber: '1023456781', address: 'Calle 1 # 2-3, Medellín' });
    expect(dto.phones).toEqual(['3001234567', '6041234567']);
  });

  it('purgeAt coincide con el corte de la purga (12 meses en UTC)', () => {
    expect(legalPurgeAt(new Date('2026-01-31T00:00:00.000Z')).toISOString()).toBe('2027-01-31T00:00:00.000Z');
    expect(legalPurgeAt(new Date('2026-09-30T23:59:59.000Z'), 1).toISOString()).toBe('2026-10-30T23:59:59.000Z');
  });

  it('filtro por estado', () => {
    expect(legalRecordStateWhere('active')).toEqual({ profileId: { not: null } });
    expect(legalRecordStateWhere('closed')).toEqual({ profileId: null });
    expect(legalRecordStateWhere(undefined)).toEqual({});
  });
});

describe('assertDisclosable (entrega de datos del DJ)', () => {
  const ok = { type: 'SOLICITUD_DATOS_DJ' as TicketType, status: 'OPEN' as TicketStatus, isSpam: false };

  it('solo una solicitud de datos, no spam y no rechazada', () => {
    for (const status of ['OPEN', 'IN_PROGRESS', 'RESOLVED'] as TicketStatus[]) {
      expect(codeOf(() => assertDisclosable({ ...ok, status }))).toBeNull();
    }
    for (const type of ['PQRS_CONSULTA', 'PQRS_RECLAMO', 'REPORTE_PERFIL'] as TicketType[]) {
      expect(codeOf(() => assertDisclosable({ ...ok, type }))).toBe('TICKET_NOT_DATA_REQUEST');
    }
    expect(codeOf(() => assertDisclosable({ ...ok, isSpam: true }))).toBe('TICKET_IS_SPAM');
    expect(codeOf(() => assertDisclosable({ ...ok, status: 'REJECTED' }))).toBe('TICKET_REJECTED');
  });
});

describe('disclosureTemplate', () => {
  it('texto en español con los datos de identificación, el radicado y la página del DJ', () => {
    const text = disclosureTemplate({
      requesterName: 'Ana Pérez',
      ticketId: 'cticket000000000000000001',
      record: toLegalRecordDetail(base),
      publicUrl: 'https://booking.fersuastudio.com/',
    });
    expect(text.startsWith('Hola, Ana Pérez:\n')).toBe(true);
    expect(text).toContain('radicado cticket000000000000000001');
    expect(text).toContain('artículo 53 de la Ley 1480 de 2011');
    expect(text).toContain('DJ Uno (su página es https://booking.fersuastudio.com/dj-uno)');
    expect(text).toContain('- Nombre o razón social: Persona Uno');
    expect(text).toContain('- Documento de identificación: Cédula de ciudadanía 1023456781');
    expect(text).toContain('- Dirección: Calle 1 # 2-3, Medellín');
    expect(text).toContain('- Teléfonos: 3001234567 / 6041234567');
    expect(text).toContain('www.sic.gov.co');
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it('perfil borrado: lo dice, y un solo teléfono va en singular', () => {
    const text = disclosureTemplate({
      requesterName: 'Ana',
      ticketId: 'cticket000000000000000002',
      record: toLegalRecordDetail({ ...closed, docType: 'NIT', docNumber: '900123456', phones: ['3001234567'] }),
      publicUrl: 'https://fersuastudio.com',
    });
    expect(text).toContain('DJ Viejo, cuya página (https://fersuastudio.com/dj-viejo) ya no está publicada en Fersua Studio');
    expect(text).toContain('- Documento de identificación: NIT 900123456');
    expect(text).toContain('- Teléfono: 3001234567');
  });
});
