import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { TICKET_STATUSES, TICKET_TYPES, type TicketStatus, type TicketType, type UpdateTicketInput } from '@fersua/shared';
import { PageQuery } from '../admin-common';

export class ListTicketsQuery extends PageQuery {
  @IsOptional()
  @IsIn(TICKET_STATUSES)
  status?: TicketStatus;

  @IsOptional()
  @IsIn(TICKET_TYPES)
  type?: TicketType;
}

export class UpdateTicketBody implements UpdateTicketInput {
  @IsIn(TICKET_STATUSES)
  status!: TicketStatus;

  /** Corte grueso sobre el texto crudo; el límite real (3000) se aplica después de limpiar. */
  @IsOptional()
  @IsString()
  @MaxLength(4_000)
  resolution?: string | null;
}
