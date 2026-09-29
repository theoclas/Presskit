import { Equals, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TICKET_TYPES, type TicketSubmitDto, type TicketType } from '@fersua/shared';

/**
 * Cuerpo de POST /api/public/tickets. Los MaxLength de aquí son un corte grueso (texto crudo);
 * los límites reales de LIMITS.ticket se aplican después de cleanText en TicketsService.
 */
export class TicketSubmitBody implements TicketSubmitDto {
  @IsIn(TICKET_TYPES)
  type!: TicketType;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(320)
  email!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  profileSlug?: string;

  @IsString()
  @MaxLength(300)
  subject!: string;

  @IsString()
  @MaxLength(4_000)
  message!: string;

  @Equals(true, { message: 'Debes autorizar el tratamiento de tus datos.' })
  consent!: true;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  hp_x7?: string;
}
