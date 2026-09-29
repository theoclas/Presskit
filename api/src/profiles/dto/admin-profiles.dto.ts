import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf } from 'class-validator';
import { LIMITS, PROFILE_STATUSES, type ProfileStatus } from '@fersua/shared';
import { ID_RE, RAW_TEXT_MAX } from './editor.dto';

// Cuerpos y query del ciclo de vida de perfiles (/api/admin/profiles, solo ADMIN).

export class AdminProfilesQuery {
  @IsOptional()
  @IsIn(PROFILE_STATUSES)
  status?: ProfileStatus;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  q?: string;

  /** El parser de query es 'simple': llega como texto. */
  @IsOptional()
  @IsIn(['true', 'false'])
  featured?: 'true' | 'false';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10_000)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(LIMITS.admin.pageSizeMax)
  pageSize?: number;
}

export class CreateProfileBody {
  @IsString()
  @MaxLength(80)
  slug!: string;

  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  displayName!: string;

  @IsOptional()
  @IsString()
  @Matches(ID_RE)
  userId?: string | null;
}

/** Motivo de rechazo o suspensión: se muestra al DJ. 10-500 caracteres después de limpiar. */
export class ReasonBody {
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  reason!: string;
}

export class FeatureBody {
  @IsBoolean()
  featured!: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(999)
  featuredRank?: number;
}

/** { userId } obligatorio: id de un usuario USER sin perfil, o null para dejarlo sin dueño. */
export class OwnerBody {
  @ValidateIf((_: object, v: unknown) => v !== null)
  @IsString()
  @Matches(ID_RE)
  userId!: string | null;
}

/** Hay que escribir el slug actual para confirmar el borrado. */
export class DeleteProfileBody {
  @IsString()
  @MaxLength(80)
  confirm!: string;
}
