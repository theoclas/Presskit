import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { AuditLogDto, Paginated } from '@fersua/shared';
import { Roles } from '../../auth/decorators';
import { AdminOnlyGuard } from '../admin-only.guard';
import { ListAuditLogsQuery } from './admin-audit.dto';
import { AdminAuditService } from './admin-audit.service';

/** Solo lectura: la auditoría no se edita ni se borra desde el api. */
@Controller('admin/audit-logs')
@Roles('ADMIN')
@UseGuards(AdminOnlyGuard)
export class AdminAuditController {
  constructor(private readonly auditLogs: AdminAuditService) {}

  @Get()
  list(@Query() q: ListAuditLogsQuery): Promise<Paginated<AuditLogDto>> {
    return this.auditLogs.list(q);
  }
}
