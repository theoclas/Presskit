import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { LegalRecordState } from '@fersua/shared';
import { PageQuery, SEARCH_MAX } from '../admin-common';

const LEGAL_RECORD_STATES: readonly LegalRecordState[] = ['active', 'closed'];

export class ListLegalRecordsQuery extends PageQuery {
  /** Sin el filtro, los dos. */
  @IsOptional()
  @IsIn(LEGAL_RECORD_STATES)
  state?: LegalRecordState;

  /** Busca en el nombre o razón social y en el slug y el nombre del perfil (nunca en el documento). */
  @IsOptional()
  @IsString()
  @MaxLength(SEARCH_MAX)
  q?: string;
}
