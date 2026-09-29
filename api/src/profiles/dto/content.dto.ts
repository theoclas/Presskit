import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { EVENT_CTA_TYPES, MEDIA_KINDS, type EventCtaType, type EventInput, type MediaKind, type MemberInput } from '@fersua/shared';
import { ID_RE, RAW_TEXT_MAX } from './editor.dto';

const present = (_: object, v: unknown) => v !== undefined;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// ------------------------------------------------------------------ integrantes

export class MemberCreateBody implements MemberInput {
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  role?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  description?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ID_RE)
  photoId?: string | null;
}

/** PATCH parcial: lo que no llega no se toca; null borra (salvo el nombre, que es obligatorio). */
export class MemberUpdateBody implements Partial<MemberInput> {
  @ValidateIf(present)
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  role?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  description?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ID_RE)
  photoId?: string | null;
}

/** Orden completo: exactamente los ids existentes, en el orden nuevo. */
export class OrderBody {
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsString({ each: true })
  @Matches(ID_RE, { each: true })
  ids!: string[];
}

// ------------------------------------------------------------------ fechas

export class EventCreateBody implements EventInput {
  @IsString()
  @Matches(DATE_RE)
  date!: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_RE)
  startTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  title?: string | null;

  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  venue!: string;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  city?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ID_RE)
  flyerId?: string | null;

  @IsIn(EVENT_CTA_TYPES)
  ctaType!: EventCtaType;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  ctaUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  ctaLabel?: string | null;

  @ValidateIf(present)
  @IsBoolean()
  isHidden?: boolean;
}

export class EventUpdateBody implements Partial<EventInput> {
  @ValidateIf(present)
  @IsString()
  @Matches(DATE_RE)
  date?: string;

  @IsOptional()
  @IsString()
  @Matches(TIME_RE)
  startTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  title?: string | null;

  @ValidateIf(present)
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  venue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  city?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ID_RE)
  flyerId?: string | null;

  @ValidateIf(present)
  @IsIn(EVENT_CTA_TYPES)
  ctaType?: EventCtaType;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  ctaUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  ctaLabel?: string | null;

  @ValidateIf(present)
  @IsBoolean()
  isHidden?: boolean;
}

export class EventsQuery {
  @IsOptional()
  @IsIn(['upcoming', 'past'])
  scope?: 'upcoming' | 'past';
}

// ------------------------------------------------------------------ galería y media

export class GalleryAddBody {
  @IsString()
  @Matches(ID_RE)
  mediaId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  alt?: string | null;
}

/** { alt } obligatorio: string o null (null/'' = sin texto alternativo propio). */
export class GalleryAltBody {
  @ValidateIf((_: object, v: unknown) => v !== null)
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  alt!: string | null;
}

/** Campos de texto del multipart de POST .../media (el archivo va aparte, en "file"). */
export class UploadMediaBody {
  @IsIn(MEDIA_KINDS)
  kind!: MediaKind;
}
