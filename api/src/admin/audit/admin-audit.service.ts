import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeUsername, type AuditLogDto, type Paginated } from '@fersua/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { createdAtRange, pageArgs } from '../admin-common';
import type { ListAuditLogsQuery } from './admin-audit.dto';

const auditSelect = {
  id: true,
  actorUsername: true,
  action: true,
  targetType: true,
  targetId: true,
  profileId: true,
  metadata: true,
  createdAt: true,
} satisfies Prisma.AuditLogSelect;

type AuditRow = Prisma.AuditLogGetPayload<{ select: typeof auditSelect }>;

/** Sin ipHash: es un HMAC que no le dice nada a una persona y no hace falta exponerlo. */
export function toAuditLogDto(row: AuditRow): AuditLogDto {
  return {
    id: row.id.toString(),
    actorUsername: row.actorUsername,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    profileId: row.profileId,
    metadata: row.metadata ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Filtro por acción: exacta, o prefijo si termina en '.' o '*'. */
export function actionFilter(action: string): Prisma.StringFilter<'AuditLog'> | string {
  if (action.endsWith('*')) return { startsWith: action.slice(0, -1) };
  if (action.endsWith('.')) return { startsWith: action };
  return action;
}

@Injectable()
export class AdminAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async list(q: ListAuditLogsQuery): Promise<Paginated<AuditLogDto>> {
    const { page, pageSize, skip, take } = pageArgs(q);
    const range = createdAtRange(q);
    const actor = q.actor !== undefined ? normalizeUsername(q.actor) : '';
    const where: Prisma.AuditLogWhereInput = {
      ...(q.action ? { action: actionFilter(q.action) } : {}),
      ...(actor ? { actorUsername: actor } : {}),
      ...(q.profileId ? { profileId: q.profileId } : {}),
      ...(range ? { createdAt: range } : {}),
    };
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      // El id autoincremental sigue el orden de inserción: más barato que ordenar por fecha.
      this.prisma.auditLog.findMany({ where, select: auditSelect, orderBy: { id: 'desc' }, skip, take }),
    ]);
    return { items: rows.map(toAuditLogDto), page, pageSize, total };
  }
}
