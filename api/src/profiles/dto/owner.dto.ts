import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { BOOKING_STATUSES, LIMITS, type BookingStatus, type OnboardingInput } from '@fersua/shared';
import { RAW_TEXT_MAX } from './editor.dto';

// Cuerpos y queries del lado del dueño (M3). Como en el editor, los MaxLength son un corte grueso
// sobre el texto crudo; las reglas reales (validateSlug, LIMITS) se aplican en los servicios.

/** POST /me/profile: nombre artístico y dirección. Nada más (ni estado, ni dueño, ni textos). */
export class OnboardingBody implements OnboardingInput {
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  displayName!: string;

  @IsString()
  @MaxLength(80)
  slug!: string;
}

/** GET /me/profile/slug-availability?slug= */
export class SlugAvailabilityQuery {
  @IsString()
  @MaxLength(80)
  slug!: string;
}

/** GET /me/profile/bookings?status=&page=&pageSize= */
export class OwnerBookingsQuery {
  /** Sin status se listan todas menos SPAM; status=SPAM muestra solo el spam. */
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: BookingStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITS.booking.inboxPageSizeMax)
  pageSize?: number;
}

/** PATCH /me/profile/bookings/:id */
export class UpdateOwnerBookingBody {
  @IsIn(BOOKING_STATUSES)
  status!: BookingStatus;
}
