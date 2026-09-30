import type { AuditService } from '../../audit/audit.service';
import { AppError } from '../../common/errors';
import type { AppConfig } from '../../config/app-config.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AdminActor } from '../admin-actor';
import { AdminLegalService } from './admin-legal.service';
import type { LegalRecordDetailRow } from './legal-record-view';

const actor: AdminActor = { id: 'cadmin000000000000000001', username: 'fersua', ipHash: null };
const createdAt = new Date('2026-09-01T12:00:00.000Z');

const record: LegalRecordDetailRow = {
  id: 'clegal0000000000000000001',
  profileId: 'cprofile00000000000000001',
  profile: { id: 'cprofile00000000000000001', slug: 'dj-uno', displayName: 'DJ Uno', status: 'APPROVED' },
  legalName: 'Persona Uno',
  closedAt: null,
  closedProfileSlug: null,
  closedDisplayName: null,
  createdAt,
  updatedAt: createdAt,
  docType: 'CC',
  docNumber: '1023456781',
  address: 'Calle 1 # 2-3, Medellín',
  phones: ['3001234567'],
};

interface TicketRow {
  id: string;
  type: string;
  status: string;
  isSpam: boolean;
  profileId: string | null;
  profileSlug: string | null;
  name: string;
  email: string;
  createdAt: Date;
}

function setup(ticket: TicketRow | null, found: LegalRecordDetailRow | null = record, matches = 1) {
  const tx = {
    ticket: { findUnique: jest.fn(async () => ticket), update: jest.fn(async () => ({})) },
    djLegalInfo: { findUnique: jest.fn(async () => found), findFirst: jest.fn(async () => found) },
    bookingRequest: { count: jest.fn(async () => matches) },
  };
  const prisma = { $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)) } as unknown as PrismaService;
  const audit = { record: jest.fn(async (_entry: unknown, _tx?: unknown) => undefined) };
  const service = new AdminLegalService(prisma, audit as unknown as AuditService, { publicUrl: 'https://booking.example.test' } as AppConfig);
  return { service, tx, audit };
}

const dataRequest = (over: Partial<TicketRow> = {}): TicketRow => ({
  id: 'cticket000000000000000001',
  type: 'SOLICITUD_DATOS_DJ',
  status: 'OPEN',
  isSpam: false,
  profileId: record.profileId,
  profileSlug: 'dj-uno',
  name: 'Ana Pérez',
  email: 'ana@correo.com',
  createdAt,
  ...over,
});

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
}

describe('AdminLegalService.disclose', () => {
  it('entrega el registro del perfil, pasa el ticket a IN_PROGRESS y audita sin datos personales', async () => {
    const { service, tx, audit } = setup(dataRequest());
    const res = await service.disclose(actor, 'cticket000000000000000001');
    expect(res.record).toMatchObject({ id: record.id, state: 'active', docNumber: '1023456781' });
    expect(res.responseTemplate).toContain('Cédula de ciudadanía 1023456781');
    expect(res.responseTemplate).toContain('https://booking.example.test/dj-uno');
    expect(tx.djLegalInfo.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { profileId: record.profileId } }));
    expect(tx.ticket.update).toHaveBeenCalledWith({ where: { id: 'cticket000000000000000001' }, data: { status: 'IN_PROGRESS', handledById: actor.id } });

    const actions = audit.record.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toEqual(['admin.ticket.update', 'admin.legal.disclose']);
    const disclose = audit.record.mock.calls[1]![0] as { targetId: string; metadata: unknown };
    expect(disclose.targetId).toBe(record.id);
    expect(disclose.metadata).toEqual({ ticketId: 'cticket000000000000000001', state: 'active', verifiedBy: 'email-match', matchingBookings: 1 });
    expect(tx.bookingRequest.count).toHaveBeenCalledWith({ where: { profileId: record.profileId, contactEmail: 'ana@correo.com' } });
    const auditJson = JSON.stringify(audit.record.mock.calls);
    for (const personal of ['1023456781', 'Calle 1', '3001234567', 'Persona Uno', 'Ana Pérez', 'ana@correo.com']) expect(auditJson).not.toContain(personal);
  });

  it('sin solicitudes de booking con ese correo: se entrega (el admin confirmó) y la auditoría dice «manual»', async () => {
    const { service, audit } = setup(dataRequest(), record, 0);
    await service.disclose(actor, 'cticket000000000000000001');
    const disclose = audit.record.mock.calls.find((c) => (c[0] as { action: string }).action === 'admin.legal.disclose')![0] as { metadata: unknown };
    expect(disclose.metadata).toMatchObject({ verifiedBy: 'manual', matchingBookings: 0 });
  });

  it('un ticket ya en trámite o resuelto no cambia de estado', async () => {
    for (const status of ['IN_PROGRESS', 'RESOLVED']) {
      const { service, tx, audit } = setup(dataRequest({ status }));
      await service.disclose(actor, 'cticket000000000000000001');
      expect(tx.ticket.update).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledTimes(1);
    }
  });

  it('perfil ya borrado: 409 sin buscar por slug (un slug liberado pudo ser de otro DJ)', async () => {
    const closed = { ...record, profileId: null, profile: null, closedAt: new Date('2026-09-10T00:00:00.000Z'), closedProfileSlug: 'dj-uno', closedDisplayName: 'DJ Uno' };
    const { service, tx, audit } = setup(dataRequest({ profileId: null }), closed);
    const err = await service.disclose(actor, 'cticket000000000000000001').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err).toMatchObject({ code: 'LEGAL_RECORD_MISSING', message: expect.stringContaining('Registros legales') });
    expect(tx.djLegalInfo.findUnique).not.toHaveBeenCalled();
    expect(tx.djLegalInfo.findFirst).not.toHaveBeenCalled();
    expect(tx.ticket.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('409 sin registro, con otro tipo de ticket, spam o rechazado; 404 si no existe', async () => {
    const missing = setup(dataRequest(), null);
    expect(await codeOf(missing.service.disclose(actor, 'x'))).toBe('LEGAL_RECORD_MISSING');
    expect(missing.tx.ticket.update).not.toHaveBeenCalled();
    expect(missing.audit.record).not.toHaveBeenCalled();

    const noSlug = setup(dataRequest({ profileId: null, profileSlug: null }));
    expect(await codeOf(noSlug.service.disclose(actor, 'x'))).toBe('LEGAL_RECORD_MISSING');

    const wrongType = setup(dataRequest({ type: 'REPORTE_PERFIL' }));
    expect(await codeOf(wrongType.service.disclose(actor, 'x'))).toBe('TICKET_NOT_DATA_REQUEST');
    expect(wrongType.tx.djLegalInfo.findUnique).not.toHaveBeenCalled();

    expect(await codeOf(setup(dataRequest({ isSpam: true })).service.disclose(actor, 'x'))).toBe('TICKET_IS_SPAM');
    expect(await codeOf(setup(dataRequest({ status: 'REJECTED' })).service.disclose(actor, 'x'))).toBe('TICKET_REJECTED');
    expect(await codeOf(setup(null).service.disclose(actor, 'x'))).toBe('NOT_FOUND');
  });
});
