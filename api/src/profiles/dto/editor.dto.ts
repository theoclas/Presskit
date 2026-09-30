import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  DOC_TYPES,
  LIMITS,
  PALETTE_KEYS,
  SOCIAL_PLATFORM_KEYS,
  type DocType,
  type FormFieldConfig,
  type LegalInfoInput,
  type PaletteKey,
  type RiderItemInput,
  type SocialLinkInput,
  type SocialPlatform,
  type UpdateProfileInput,
} from '@fersua/shared';

// Cuerpos del editor de perfil. Los MaxLength de aquí son un corte grueso sobre el texto crudo;
// los límites reales (LIMITS) se aplican después de cleanText en los servicios. Ningún DTO
// tiene status, userId, profileId, featured ni ids de filas hijas: forbidNonWhitelisted los
// rechaza con 400, también dentro de los arreglos (@ValidateNested + @Type).

/** Tope crudo para textos cortos (antes de limpiar invisibles y espacios). */
export const RAW_TEXT_MAX = 2_000;
/** Ids cuid de filas propias (MediaAsset, Member, Event, GalleryItem, User). */
export const ID_RE = /^[a-z0-9]{20,32}$/;

const present = (_: object, v: unknown) => v !== undefined;

export class ShowBody {
  @IsOptional()
  @IsBoolean()
  gallery?: boolean;

  @IsOptional()
  @IsBoolean()
  rider?: boolean;

  @IsOptional()
  @IsBoolean()
  events?: boolean;

  @IsOptional()
  @IsBoolean()
  openDateRow?: boolean;

  @IsOptional()
  @IsBoolean()
  form?: boolean;
}

export class UpdateProfileBody implements UpdateProfileInput {
  @ValidateIf(present)
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  tagline?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  seoDescription?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  city?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  whatsappNumber?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  publicEmail?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  publicPhone?: string | null;

  @ValidateIf(present)
  @IsIn(PALETTE_KEYS)
  palette?: PaletteKey;

  /** Se valida con validateTexts (shared): solo claves de PAGE_TEXT_SLOTS. */
  @ValidateIf(present)
  @IsObject()
  texts?: Record<string, string>;

  @ValidateIf(present)
  @IsObject()
  @ValidateNested()
  @Type(() => ShowBody)
  show?: ShowBody;

  @ValidateIf(present)
  @IsBoolean()
  formOpenWhatsapp?: boolean;

  @ValidateIf(present)
  @IsBoolean()
  notifyByEmail?: boolean;

  @IsOptional()
  @IsString()
  @Matches(ID_RE)
  heroImageId?: string | null;

  @IsOptional()
  @IsString()
  @Matches(ID_RE)
  cardImageId?: string | null;
}

export class SlugBody {
  @IsString()
  @MaxLength(80)
  slug!: string;
}

export class GenresBody {
  @IsArray()
  @ArrayMinSize(LIMITS.genres.perProfileMin)
  @ArrayMaxSize(LIMITS.genres.perProfileMax)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2_147_483_647, { each: true })
  genreIds!: number[];
}

export class SocialLinkBody implements SocialLinkInput {
  @IsIn(SOCIAL_PLATFORM_KEYS)
  platform!: SocialPlatform;

  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  label?: string | null;
}

export class SocialsBody {
  @IsArray()
  @ArrayMaxSize(LIMITS.social.perProfileMax)
  @ValidateNested({ each: true })
  @Type(() => SocialLinkBody)
  links!: SocialLinkBody[];
}

export class MemberSocialsBody {
  @IsArray()
  @ArrayMaxSize(LIMITS.social.perMemberMax)
  @ValidateNested({ each: true })
  @Type(() => SocialLinkBody)
  links!: SocialLinkBody[];
}

export class RiderItemBody implements RiderItemInput {
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  note?: string | null;
}

export class RiderBody {
  @IsArray()
  @ArrayMaxSize(LIMITS.rider.max)
  @ValidateNested({ each: true })
  @Type(() => RiderItemBody)
  items!: RiderItemBody[];
}

export class FormFieldBody implements FormFieldConfig {
  @IsString()
  @MaxLength(40)
  key!: string;

  @IsBoolean()
  required!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  label?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  placeholder?: string | null;
}

export class BookingFormBody {
  /** El tope real (LIMITS.form.activeFieldsMax) lo aplica validateFormConfig con su código. */
  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => FormFieldBody)
  fields!: FormFieldBody[];
}

export class LegalInfoBody implements LegalInfoInput {
  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  legalName!: string;

  @IsIn(DOC_TYPES)
  docType!: DocType;

  @IsString()
  @MaxLength(60)
  docNumber!: string;

  @IsString()
  @MaxLength(RAW_TEXT_MAX)
  address!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(LIMITS.legalInfo.phonesMax)
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  phones!: string[];

  /** Declaración de veracidad del dueño (obligatoria en /me/profile; el servicio exige true). */
  @IsOptional()
  @IsBoolean()
  truthful?: true;
}
