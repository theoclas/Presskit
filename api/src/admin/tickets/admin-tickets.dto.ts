import { Equals, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import {
  TICKET_STATUSES,
  TICKET_TYPES,
  type DiscloseDjInput,
  type TicketStatus,
  type TicketType,
  type UpdateTicketInput,
} from '@fersua/shared';
import { PageQuery } from '../admin-common';

export class ListTicketsQuery extends PageQuery {
  @IsOptional()
  @IsIn(TICKET_STATUSES)
  status?: TicketStatus;

  @IsOptional()
  @IsIn(TICKET_TYPES)
  type?: TicketType;

  /** Sin el filtro (o 'false') se listan los que no son spam; 'true' muestra solo el spam. */
  @IsOptional()
  @IsIn(['true', 'false'])
  spam?: 'true' | 'false';
}

/**
 * Entrega de los datos del DJ (art. 53): el admin confirma que verificó que quien pide contrató
 * al DJ (docs/diseno/11 §5.1). Sin la casilla no hay entrega.
 */
export class DiscloseDjBody implements DiscloseDjInput {
  @Equals(true, { message: 'Confirma que verificaste que quien pide contrató al DJ.' })
  confirmed!: true;
}

export class UpdateTicketBody implements UpdateTicketInput {
  @IsIn(TICKET_STATUSES)
  status!: TicketStatus;

  /** Corte grueso sobre el texto crudo; el límite real (3000) se aplica después de limpiar. */
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  resolution?: string | null;

  @IsOptional()
  @IsBoolean()
  isSpam?: boolean;
}
