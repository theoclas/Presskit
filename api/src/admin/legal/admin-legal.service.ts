import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { AdminLegalRecordDto, AdminLegalRecordListItemDto, DiscloseDjResultDto, Paginated } from '@fersua/shared';
import { AuditService } from '../../audit/audit.service';
import { Errors } from '../../common/errors';
import { AppConfig } from '../../config/app-config.service';
import { PrismaService } from '../../prisma/prisma.service';
import { actorFields, type AdminActor } from '../admin-actor';
import { pageArgs, searchTerm } from '../admin-common';
import type { ListLegalRecordsQuery } from './admin-legal.dto';
import {
  assertDisclosable,
  disclosureTemplate,
  legalRecordDetailSelect,
  legalRecordListSelect,
  legalRecordStateWhere,
  matchingBookingsWhere,
  toLegalRecordDetail,
  toLegalRecordListItem,
} from './legal-record-view';

const NOT_FOUND = 'Registro no encontrado.';
const VIEW_ACTION = 'admin.legal.view';
const VIEW_AUDIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Registros del art. 53 (M4): los de perfiles activos y los conservados 12 meses después de
 * borrar el perfil. La lista no trae datos de identificación; el detalle y la entrega a un
 * solicitante quedan en la auditoría, sin valores.
 */
@Injectable()
export class AdminLegalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
  ) {}

  /** Los cerrados primero (el más reciente arriba), luego los activos por última edición. */
  async list(q: ListLegalRecordsQuery): Promise<Paginated<AdminLegalRecordListItemDto>> {
    const { page, pageSize, skip, take } = pageArgs(q);
    const term = searchTerm(q.q);
    const where: Prisma.DjLegalInfoWhereInput = {
      ...legalRecordStateWhere(q.state),
      ...(term
        ? {
            OR: [
              { legalName: { contains: term } },
              { closedProfileSlug: { contains: term } },
              { closedDisplayName: { contains: term } },
              { profile: { is: { slug: { contains: term } } } },
              { profile: { is: { displayName: { contains: term } } } },
            ],
          }
        : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.djLegalInfo.count({ where }),
      this.prisma.djLegalInfo.findMany({
        where,
        select: legalRecordListSelect,
        orderBy: [{ closedAt: 'desc' }, { updatedAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
    ]);
    return { items: rows.map(toLegalRecordListItem), page, pageSize, total };
  }

  /**
   * Datos completos (documento, dirección, teléfonos): cada vista queda en la auditoría, sin
   * valores. Una fila por vista y no por cada refetch de la web: si el mismo admin ya lo vio
   * hace menos de 10 minutos, no se repite (igual que el detalle de una solicitud).
   */
  async detail(actor: AdminActor, id: string): Promise<AdminLegalRecordDto> {
    const row = await this.prisma.djLegalInfo.findUnique({ where: { id }, select: legalRecordDetailSelect });
    if (!row) throw Errors.notFound(NOT_FOUND);
    const dto = toLegalRecordDetail(row);
    const recent = await this.prisma.auditLog.findFirst({
      where: {
        action: VIEW_ACTION,
        targetType: 'DjLegalInfo',
        targetId: row.id,
        actorId: actor.id,
        createdAt: { gte: new Date(Date.now() - VIEW_AUDIT_WINDOW_MS) },
      },
      select: { id: true },
    });
    if (!recent) {
      await this.audit.record({
        ...actorFields(actor),
        action: VIEW_ACTION,
        targetType: 'DjLegalInfo',
        targetId: row.id,
        profileId: dto.profileId,
        metadata: { state: dto.state },
      });
    }
    return dto;
  }

  /**
   * Entrega de los datos del DJ a quien los pidió (art. 53 Ley 1480), con step-up en el
   * controlador. Solo en tickets SOLICITUD_DATOS_DJ cuyo perfil siga existiendo y tenga registro.
   * Pasa el ticket de OPEN a IN_PROGRESS y queda en la auditoría con el id del ticket (sin datos
   * personales). Cada llamada se audita: es una entrega de datos, no una vista.
   * Con el perfil ya borrado NO se busca el registro conservado por el slug: un slug liberado
   * puede haber sido de otro DJ después, y se entregarían los datos de otra persona. El admin lo
   * busca a mano en «Registros legales».
   * El controlador exige que el admin confirme la verificación (DiscloseDjBody); la auditoría
   * guarda si el correo coincidía con alguna solicitud de booking a ese DJ o se verificó a mano.
   */
  async disclose(actor: AdminActor, ticketId: string): Promise<DiscloseDjResultDto> {
    return this.prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id: ticketId },
        select: { id: true, type: true, status: true, isSpam: true, profileId: true, name: true, email: true },
      });
      if (!ticket) throw Errors.notFound('Ticket no encontrado.');
      assertDisclosable(ticket);

      const profileId = ticket.profileId;
      const row = profileId ? await tx.djLegalInfo.findUnique({ where: { profileId }, select: legalRecordDetailSelect }) : null;
      if (!row || !profileId) {
        throw Errors.conflict(
          'LEGAL_RECORD_MISSING',
          profileId
            ? 'El perfil de esta solicitud no tiene registro del art. 53. Responde que no hay datos o pídele al DJ que lo complete.'
            : 'El perfil de esta solicitud ya se borró. Busca su registro conservado en «Registros legales» y confirma que es el mismo DJ antes de entregarlo.',
        );
      }
      const record = toLegalRecordDetail(row);
      const matchingBookings = await tx.bookingRequest.count({ where: matchingBookingsWhere(profileId, ticket.email) });

      const markedInProgress = ticket.status === 'OPEN';
      if (markedInProgress) {
        await tx.ticket.update({ where: { id: ticket.id }, data: { status: 'IN_PROGRESS', handledById: actor.id } });
        await this.audit.record(
          {
            ...actorFields(actor),
            action: 'admin.ticket.update',
            targetType: 'Ticket',
            targetId: ticket.id,
            profileId: ticket.profileId,
            metadata: { from: 'OPEN', to: 'IN_PROGRESS', resolutionChanged: false },
          },
          tx,
        );
      }
      await this.audit.record(
        {
          ...actorFields(actor),
          action: 'admin.legal.disclose',
          targetType: 'DjLegalInfo',
          targetId: record.id,
          profileId: record.profileId,
          metadata: { ticketId: ticket.id, state: record.state, verifiedBy: matchingBookings > 0 ? 'email-match' : 'manual', matchingBookings },
        },
        tx,
      );

      return {
        record,
        responseTemplate: disclosureTemplate({ requesterName: ticket.name, ticketId: ticket.id, record, publicUrl: this.config.publicUrl }),
      };
    });
  }
}
