import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { AdminLegalRecordDto, AdminLegalRecordListItemDto, Paginated } from '@fersua/shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser, RequireStepUp, Roles } from '../../auth/decorators';
import { RequestContext } from '../../common/request-context';
import { toActor } from '../admin-actor';
import { CuidPipe } from '../admin-common';
import { AdminOnlyGuard } from '../admin-only.guard';
import { ListLegalRecordsQuery } from './admin-legal.dto';
import { AdminLegalService } from './admin-legal.service';

/**
 * Registros del art. 53 (M4). La entrega de datos a un solicitante está en
 * POST /api/admin/tickets/:id/disclose-dj (con step-up), junto a la bandeja de tickets.
 */
@Controller('admin/legal-records')
@Roles('ADMIN')
@UseGuards(AdminOnlyGuard)
export class AdminLegalController {
  constructor(
    private readonly legal: AdminLegalService,
    private readonly requestContext: RequestContext,
  ) {}

  @Get()
  list(@Query() q: ListLegalRecordsQuery): Promise<Paginated<AdminLegalRecordListItemDto>> {
    return this.legal.list(q);
  }

  /**
   * Documento, dirección y teléfonos de una persona: con step-up, igual que la entrega a un
   * solicitante. Una sesión robada (o un XSS en el admin) no puede leer los registros en lote.
   */
  @Get(':id')
  @RequireStepUp()
  @Throttle({ default: { limit: 30, ttl: 600_000 } })
  detail(@Param('id', CuidPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: Request): Promise<AdminLegalRecordDto> {
    return this.legal.detail(toActor(user, this.requestContext.ipHash(req)), id);
  }
}
