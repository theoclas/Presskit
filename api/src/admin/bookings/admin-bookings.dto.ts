import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { BOOKING_STATUSES, type BookingStatus } from '@fersua/shared';
import { DateRangeQuery, SEARCH_MAX } from '../admin-common';

export class ListBookingsQuery extends DateRangeQuery {
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]{20,32}$/)
  profileId?: string;

  /** Sin status se listan todas menos SPAM; status=SPAM muestra solo el spam. */
  @IsOptional()
  @IsIn(BOOKING_STATUSES)
  status?: BookingStatus;

  /** Busca en nombre, correo y teléfono de contacto. */
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX)
  q?: string;
}

export class UpdateBookingBody {
  @IsIn(BOOKING_STATUSES)
  status!: BookingStatus;
}
