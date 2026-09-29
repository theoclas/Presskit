import { Body, Controller, Get, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { Paginated, TicketDto } from '@fersua/shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser, Roles } from '../../auth/decorators';
import { RequestContext } from '../../common/request-context';
import { toActor } from '../admin-actor';
import { ADMIN_MUTATION_THROTTLE, CuidPipe } from '../admin-common';
import { AdminOnlyGuard } from '../admin-only.guard';
import { ListTicketsQuery, UpdateTicketBody } from './admin-tickets.dto';
import { AdminTicketsService } from './admin-tickets.service';

@Controller('admin/tickets')
@Roles('ADMIN')
@UseGuards(AdminOnlyGuard)
export class AdminTicketsController {
  constructor(
    private readonly tickets: AdminTicketsService,
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
}
