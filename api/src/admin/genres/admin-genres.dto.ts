import { IsBoolean, IsInt, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

/** Corte grueso sobre el texto crudo; los límites reales (2-40) se aplican después de limpiar. */
export class CreateGenreBody {
  @IsString()
  @MaxLength(120)
  name!: string;
}

/** Parche parcial. ValidateIf en vez de IsOptional: un null explícito es un 400, no "sin cambio". */
export class UpdateGenreBody {
  @ValidateIf((o: UpdateGenreBody) => o.name !== undefined)
  @IsString()
  @MaxLength(120)
  name?: string;

  @ValidateIf((o: UpdateGenreBody) => o.isActive !== undefined)
  @IsBoolean()
  isActive?: boolean;

  @ValidateIf((o: UpdateGenreBody) => o.sortOrder !== undefined)
  @IsInt()
  @Min(0)
  @Max(99_999)
  sortOrder?: number;
}
