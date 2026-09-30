import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { BookingDetailDto, BookingListItemDto, Paginated, UnreadCountDto } from '@fersua/shared';
import { Roles } from '../auth/decorators';
import { ProfileScopeGuard, ScopedProfile, type ScopedProfileId } from '../common/scope/profile-scope.guard';
import { OwnerBookingsQuery, UpdateOwnerBookingBody } from './dto/owner.dto';
import { Actor, ParseIdPipe, type EditorActor } from './editor-actor';
import { OwnerBookingsService } from './owner-bookings.service';

/** Mutaciones de la bandeja: 60/min por IP y ruta, como las del admin. */
const OWNER_INBOX_MUTATION_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

/**
 * Bandeja de solicitudes del dueño: /api/me/profile/bookings… Solo el montaje del dueño (el
 * admin tiene su bandeja global en /api/admin/bookings). ProfileScopeGuard fija el perfil.
 */
@Controller('me/profile/bookings')
@Roles('USER')
@UseGuards(ProfileScopeGuard)
export class OwnerBookingsController {
  constructor(private readonly bookings: OwnerBookingsService) {}

  @Get()
  list(@ScopedProfile() profileId: ScopedProfileId, @Query() query: OwnerBookingsQuery): Promise<Paginated<BookingListItemDto>> {
    return this.bookings.list(profileId, query);
  }

  // Antes de ':id' (orden de registro de rutas).
  @Get('unread-count')
  unreadCount(@ScopedProfile() profileId: ScopedProfileId): Promise<UnreadCountDto> {
    return this.bookings.unreadCount(profileId);
  }

  @Get(':id')
  detail(@ScopedProfile() profileId: ScopedProfileId, @Param('id', ParseIdPipe) id: string): Promise<BookingDetailDto> {
    return this.bookings.detail(profileId, id);
  }

  @Patch(':id')
  @Throttle(OWNER_INBOX_MUTATION_THROTTLE)
  update(
    @ScopedProfile() profileId: ScopedProfileId,
    @Actor() actor: EditorActor,
    @Param('id', ParseIdPipe) id: string,
    @Body() body: UpdateOwnerBookingBody,
  ): Promise<BookingDetailDto> {
    return this.bookings.updateStatus(profileId, actor, id, body);
  }

  /** Borrado suave e idempotente (M4): el admin la conserva, marcada, hasta la purga de 12 meses. */
  @Delete(':id')
  @HttpCode(204)
  @Throttle(OWNER_INBOX_MUTATION_THROTTLE)
  remove(@ScopedProfile() profileId: ScopedProfileId, @Actor() actor: EditorActor, @Param('id', ParseIdPipe) id: string): Promise<void> {
    return this.bookings.remove(profileId, actor, id);
  }
}
