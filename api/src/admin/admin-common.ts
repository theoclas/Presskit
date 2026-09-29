import { Injectable, type PipeTransform } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import { LIMITS, addDays, isValidDateOnly, isWellFormedText } from '@fersua/shared';
import { Errors } from '../common/errors';

// Piezas comunes de los controladores del admin: paginación, rangos de fechas e ids en la ruta.

// Los mismos topes que usa la web (shared): una sola fuente.
export const PAGE_SIZE_DEFAULT = LIMITS.admin.pageSizeDefault;
export const PAGE_SIZE_MAX = LIMITS.admin.pageSizeMax;

/** Mutaciones del admin: 60/min por IP y ruta (las lecturas usan el límite general). */
export const ADMIN_MUTATION_THROTTLE = { default: { limit: 60, ttl: 60_000 } };

export class PageQuery {
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
  @Max(PAGE_SIZE_MAX)
  pageSize?: number;
}

export interface PageArgs {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
}

export function pageArgs(q: PageQuery): PageArgs {
  const page = q.page ?? 1;
  const pageSize = q.pageSize ?? PAGE_SIZE_DEFAULT;
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Filtro from/to por fecha de calendario de Bogotá (ambos inclusive). */
export class DateRangeQuery extends PageQuery {
  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  from?: string;

  @IsOptional()
  @IsString()
  @Matches(DATE_ONLY_PATTERN)
  to?: string;
}

/**
 * Colombia no tiene horario de verano desde 1993: medianoche en Bogotá es siempre 05:00 UTC.
 * Por eso basta con el desfase fijo, sin librería de zonas horarias.
 */
export function bogotaDayStart(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000-05:00`);
}

/** { gte, lt } sobre un DateTime a partir de from/to 'YYYY-MM-DD'; null si no hay filtro. */
export function createdAtRange(q: { from?: string; to?: string }): { gte?: Date; lt?: Date } | null {
  const errors: Record<string, string> = {};
  if (q.from !== undefined && !isValidDateOnly(q.from)) errors.from = 'INVALID';
  if (q.to !== undefined && !isValidDateOnly(q.to)) errors.to = 'INVALID';
  if (Object.keys(errors).length) throw Errors.validation(errors);
  if (q.from === undefined && q.to === undefined) return null;
  return {
    ...(q.from !== undefined ? { gte: bogotaDayStart(q.from) } : {}),
    // "to" es inclusive: todo lo anterior al inicio del día siguiente.
    ...(q.to !== undefined ? { lt: bogotaDayStart(addDays(q.to, 1)) } : {}),
  };
}

/** Texto de búsqueda: recortado, sin mitades de emoji; '' se trata como "sin filtro". */
export function searchTerm(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const term = raw.trim();
  if (!term) return null;
  if (!isWellFormedText(term)) throw Errors.validation({ q: 'INVALID' });
  return term;
}

/** Tope grueso del texto de búsqueda en la query. */
export const SEARCH_MAX = 100;

const CUID_RE = /^[a-z0-9]{20,32}$/;

/**
 * Id tipo cuid en la ruta. Un id con otra forma nunca existe: 404 igual que uno que no está,
 * así el cliente recibe un solo tipo de error.
 */
@Injectable()
export class CuidPipe implements PipeTransform<unknown, string> {
  transform(value: unknown): string {
    if (typeof value !== 'string' || !CUID_RE.test(value)) throw Errors.notFound();
    return value;
  }
}

export function isCuid(value: unknown): value is string {
  return typeof value === 'string' && CUID_RE.test(value);
}

/**
 * Id numérico (géneros) en la ruta; 404 si no tiene forma de id. Puede llegar ya como número:
 * el ValidationPipe global (transform) corre antes que los pipes del parámetro.
 */
@Injectable()
export class IntIdPipe implements PipeTransform<unknown, number> {
  transform(value: unknown): number {
    const raw = typeof value === 'number' ? String(value) : value;
    if (typeof raw !== 'string' || !/^[1-9]\d{0,8}$/.test(raw)) throw Errors.notFound();
    return Number(raw);
  }
}

/** Fecha-hora opcional → ISO 8601 o null. */
export function isoOrNull(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}
