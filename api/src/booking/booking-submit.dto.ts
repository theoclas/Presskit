import { Equals, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { BookingSubmitDto } from '@fersua/shared';

/**
 * Cuerpo de POST /api/public/djs/:slug/booking-requests. `fields` NO se valida anidado aquí:
 * sus claves y valores los revisan checkFieldsShape y validateBookingSubmission (shared).
 */
export class BookingSubmitBody implements BookingSubmitDto {
  @IsObject()
  fields!: Record<string, string>;

  @Equals(true, { message: 'Debes autorizar el tratamiento de tus datos.' })
  consent!: true;

  @IsString()
  @MaxLength(300)
  token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  hp_x7?: string;
}
