import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import type { BookingDetailDto, BookingListItemDto, Paginated } from '@fersua/shared';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser, Roles } from '../../auth/decorators';
import { RequestContext } from '../../common/request-context';
import { toActor } from '../admin-actor';
import { ADMIN_MUTATION_THROTTLE, CuidPipe } from '../admin-common';
import { AdminOnlyGuard } from '../admin-only.guard';
import { ListBookingsQuery, UpdateBookingBody } from './admin-bookings.dto';
import { AdminBookingsService } from './admin-bookings.service';

@Controller('admin/bookings')
@Roles('ADMIN')
@UseGuards(AdminOnlyGuard)
export class AdminBookingsController {
  constructor(
    private readonly bookings: AdminBookingsService,
    private readonly requestContext: RequestContext,
  ) {}

  @Get()
  list(@Query() q: ListBookingsQuery): Promise<Paginated<BookingListItemDto>> {
    return this.bookings.list(q);
  }

  @Get(':id')
  detail(@Param('id', CuidPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: Request): Promise<BookingDetailDto> {
    return this.bookings.detail(toActor(user, this.requestContext.ipHash(req)), id);
  }

  @Patch(':id')
  @Throttle(ADMIN_MUTATION_THROTTLE)
  update(
    @Param('id', CuidPipe) id: string,
    @Body() body: UpdateBookingBody,
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
  ): Promise<BookingDetailDto> {
    return this.bookings.updateStatus(toActor(user, this.requestContext.ipHash(req)), id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @Throttle(ADMIN_MUTATION_THROTTLE)
  remove(@Param('id', CuidPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: Request): Promise<void> {
    return this.bookings.remove(toActor(user, this.requestContext.ipHash(req)), id);
  }
}
