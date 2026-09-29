import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { DateRangeQuery } from '../admin-common';

export class ListAuditLogsQuery extends DateRangeQuery {
  /**
   * Acción exacta ('admin.user.create') o prefijo terminado en '.' o '*' ('admin.user.',
   * 'admin.*'). Mismo alfabeto que las acciones que se escriben.
   */
  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9_.]{1,48}\*?$/)
  action?: string;

  /** Usuario del actor (como se guardó al auditar; 'cli' para la consola). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  actor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^[a-z0-9]{20,32}$/)
  profileId?: string;
}
