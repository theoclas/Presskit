import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { DiscloseDjResultDto, Paginated, TicketDto } from '@fersua/shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser, RequireStepUp, Roles } from '../../auth/decorators';
import { RequestContext } from '../../common/request-context';
import { toActor } from '../admin-actor';
import { ADMIN_MUTATION_THROTTLE, CuidPipe } from '../admin-common';
import { AdminOnlyGuard } from '../admin-only.guard';
import { AdminLegalService } from '../legal/admin-legal.service';
import { DiscloseDjBody, ListTicketsQuery, UpdateTicketBody } from './admin-tickets.dto';
import { AdminTicketsService } from './admin-tickets.service';

@Controller('admin/tickets')
@Roles('ADMIN')
@UseGuards(AdminOnlyGuard)
export class AdminTicketsController {
  constructor(
    private readonly tickets: AdminTicketsService,
    private readonly legal: AdminLegalService,
    private readonly requestContext: RequestContext,
  ) {}

  @Get()
  list(@Query() q: ListTicketsQuery): Promise<Paginated<TicketDto>> {
    return this.tickets.list(q);
  }

  @Get(':id')
  detail(@Param('id', CuidPipe) id: string): Promise<TicketDto> {
    return this.tickets.detail(id);
  }

  @Patch(':id')
  @Throttle(ADMIN_MUTATION_THROTTLE)
  update(
    @Param('id', CuidPipe) id: string,
    @Body() body: UpdateTicketBody,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<TicketDto> {
    return this.tickets.update(toActor(user, this.requestContext.ipHash(req)), id, body);
  }

  /**
   * Datos de identificación del DJ para responder una solicitud de datos (art. 53, M4). Con
   * step-up: entrega documento y dirección de una persona a un tercero.
   */
  @Post(':id/disclose-dj')
  @RequireStepUp()
  @HttpCode(200)
  @Throttle(ADMIN_MUTATION_THROTTLE)
  discloseDj(
    @Param('id', CuidPipe) id: string,
    // Solo se valida (confirmed: true): la casilla del admin es la constancia de la verificación.
    @Body() _body: DiscloseDjBody,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<DiscloseDjResultDto> {
    return this.legal.disclose(toActor(user, this.requestContext.ipHash(req)), id);
  }
}
