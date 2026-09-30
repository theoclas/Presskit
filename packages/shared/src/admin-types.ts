// Contrato de auth, panel y admin (M2/M3). El api produce estas formas; la web las consume.
// Las rutas están en docs/api-m2.md. Todas las fechas-hora van en ISO 8601; las fechas de
// calendario en 'YYYY-MM-DD' (Bogotá).

import type {
  BookingStatus,
  DocType,
  EventCtaType,
  MediaKind,
  PaletteKey,
  ProfileStatus,
  SocialPlatform,
  TicketStatus,
  TicketType,
  UserRole,
  UserStatus,
} from './enums';
import type { FormFieldConfig } from './form-config';
import type { ImageDto } from './media';
import type { PageTexts } from './text-slots';

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

// ---------------------------------------------------------------- auth

export interface MeDto {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
  mustChangePassword: boolean;
  mfaEnabled: boolean;
  /** Perfil DJ propio (solo USER). */
  profile: { id: string; slug: string; status: ProfileStatus } | null;
  /** Versión de términos aceptada; si difiere de LEGAL_DOCS.artistTerms.version, hay que re-aceptar. */
  termsVersion: string | null;
  /** Versión aceptada de la Política de Tratamiento de Datos (M3). */
  privacyVersion?: string | null;
  /** true si los términos o la política aceptados no son los vigentes (M3: la web pide re-aceptar). */
  termsOutdated?: boolean;
}

export interface LoginInput {
  username: string;
  password: string;
}

/** Login correcto sin 2FA, o 2FA ya verificado. */
export interface SessionDto {
  accessToken: string;
  /** Segundos de vida del access token. */
  expiresIn: number;
  user: MeDto;
}

/** Login del admin: falta el segundo paso con el código TOTP (o un código de recuperación). */
export interface MfaChallengeDto {
  mfaRequired: true;
  mfaToken: string;
}

export type LoginResultDto = SessionDto | MfaChallengeDto;

export interface MfaVerifyInput {
  mfaToken: string;
  /** 6 dígitos TOTP o un código de recuperación (XXXX-XXXX). */
  code: string;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

/** Confirmación reciente para acciones destructivas del admin. */
export interface StepUpInput {
  password: string;
  code: string;
}

export interface StepUpDto {
  /** Se envía en la cabecera X-Step-Up. Vale 5 minutos. */
  stepUpToken: string;
  expiresIn: number;
}

// ---------------------------------------------------------------- media

export interface MediaAssetDto extends ImageDto {
  kind: MediaKind;
  isPublic: boolean;
  bytesTotal: number;
  createdAt: string;
}

export interface MediaUsageDto {
  assets: number;
  bytes: number;
  maxAssets: number;
  maxBytes: number;
}

// ---------------------------------------------------------------- perfil (editor)

export interface EditorSocialLinkDto {
  id: string;
  platform: SocialPlatform;
  url: string;
  label: string | null;
}

export interface EditorMemberDto {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  photo: MediaAssetDto | null;
  socials: EditorSocialLinkDto[];
  sortOrder: number;
}

export interface EditorEventDto {
  id: string;
  date: string;
  startTime: string | null;
  title: string | null;
  venue: string;
  city: string | null;
  flyer: MediaAssetDto | null;
  ctaType: EventCtaType;
  ctaUrl: string | null;
  ctaLabel: string | null;
  isHidden: boolean;
  /** Calculado: fecha anterior a hoy (Bogotá). */
  isPast: boolean;
}

export interface EditorGalleryItemDto {
  id: string;
  image: MediaAssetDto;
  alt: string | null;
  sortOrder: number;
}

export interface EditorRiderItemDto {
  id: string;
  name: string;
  note: string | null;
}

/** Perfil completo tal como lo edita su dueño o el admin. */
export interface EditorProfileDto {
  id: string;
  slug: string;
  status: ProfileStatus;
  statusReason: string | null;
  displayName: string;
  tagline: string | null;
  seoDescription: string | null;
  city: string | null;
  whatsappNumber: string | null;
  publicEmail: string | null;
  publicPhone: string | null;
  palette: PaletteKey;
  /** Solo lo guardado (sin valores por defecto); la web los completa con resolveTexts. */
  texts: Partial<PageTexts>;
  bookingForm: FormFieldConfig[];
  show: { gallery: boolean; rider: boolean; events: boolean; openDateRow: boolean; form: boolean };
  formOpenWhatsapp: boolean;
  notifyByEmail: boolean;
  heroImage: MediaAssetDto | null;
  cardImage: MediaAssetDto | null;
  genres: { id: number; slug: string; name: string }[];
  socials: EditorSocialLinkDto[];
  members: EditorMemberDto[];
  gallery: EditorGalleryItemDto[];
  riderItems: EditorRiderItemDto[];
  featured: boolean;
  featuredRank: number;
  owner: { id: string; username: string; status: UserStatus } | null;
  hasLegalInfo: boolean;
  /**
   * Lo que falta de la lista para publicar (PUBLISH_CHECKLIST + registro legal): claves como
   * 'heroImage', 'genres', 'contact', 'legalInfo'. Vacío = completo. El admin puede aprobar
   * igual (salvo el registro legal); la web lo muestra como aviso.
   */
  publishMissing: string[];
  usage: MediaUsageDto;
  submittedAt: string | null;
  approvedAt: string | null;
  updatedAt: string;
}

/** Campos editables del perfil (PATCH parcial). Nunca incluye status, owner ni featured. */
export interface UpdateProfileInput {
  displayName?: string;
  tagline?: string | null;
  seoDescription?: string | null;
  city?: string | null;
  whatsappNumber?: string | null;
  publicEmail?: string | null;
  publicPhone?: string | null;
  palette?: PaletteKey;
  /** Parche de textos: solo claves de PAGE_TEXT_SLOTS; '' vuelve al valor por defecto. */
  texts?: Partial<Record<string, string>>;
  show?: Partial<EditorProfileDto['show']>;
  formOpenWhatsapp?: boolean;
  notifyByEmail?: boolean;
  heroImageId?: string | null;
  cardImageId?: string | null;
}

export interface SocialLinkInput {
  platform: SocialPlatform;
  url: string;
  label?: string | null;
}

export interface MemberInput {
  name: string;
  role?: string | null;
  description?: string | null;
  photoId?: string | null;
}

export interface EventInput {
  date: string;
  startTime?: string | null;
  title?: string | null;
  venue: string;
  city?: string | null;
  flyerId?: string | null;
  ctaType: EventCtaType;
  ctaUrl?: string | null;
  ctaLabel?: string | null;
  isHidden?: boolean;
}

export interface RiderItemInput {
  name: string;
  note?: string | null;
}

export interface LegalInfoDto {
  legalName: string;
  docType: DocType;
  docNumber: string;
  address: string;
  phones: string[];
  updatedAt: string | null;
}

export type LegalInfoInput = Omit<LegalInfoDto, 'updatedAt'>;

// ---------------------------------------------------------------- admin

export interface AdminProfileListItemDto {
  id: string;
  slug: string;
  displayName: string;
  status: ProfileStatus;
  featured: boolean;
  featuredRank: number;
  cardImage: ImageDto | null;
  /** Con la cuenta suspendida, un perfil aprobado no se ve en público. */
  owner: { id: string; username: string; status: UserStatus } | null;
  nextEventDate: string | null;
  newBookings: number;
  hasLegalInfo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminUserDto {
  id: string;
  username: string;
  email: string | null;
  emailVerified: boolean;
  role: UserRole;
  status: UserStatus;
  mustChangePassword: boolean;
  /** Vencimiento de la contraseña temporal pendiente (null si no hay una). */
  tempPasswordExpiresAt: string | null;
  lockedUntil: string | null;
  lastLoginAt: string | null;
  createdAt: string;
  profile: { id: string; slug: string; status: ProfileStatus } | null;
}

export interface CreateUserInput {
  username: string;
  email?: string | null;
}

/** PATCH /admin/users/:id (con step-up). null o '' quita el correo. */
export interface UpdateUserEmailInput {
  email: string | null;
}

/** Respuesta única: la contraseña temporal no se vuelve a mostrar. */
export interface TemporaryPasswordDto {
  userId: string;
  username: string;
  temporaryPassword: string;
  expiresAt: string;
}

export interface BookingListItemDto {
  id: string;
  profile: { id: string; slug: string; displayName: string };
  contactName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  eventDate: string | null;
  status: BookingStatus;
  createdAt: string;
}

export interface BookingDetailDto extends BookingListItemDto {
  fields: { key: string; label: string; value: string }[];
  consentAt: string;
  consentVersion: string;
  readAt: string | null;
}

export interface TicketDto {
  id: string;
  type: TicketType;
  status: TicketStatus;
  profile: { id: string; slug: string; displayName: string } | null;
  profileSlug: string | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  message: string;
  dueAt: string;
  /** Días hábiles restantes (negativo = vencido). */
  businessDaysLeft: number;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface UpdateTicketInput {
  status: TicketStatus;
  resolution?: string | null;
}

export interface AuditLogDto {
  id: string;
  actorUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  profileId: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface AdminStatsDto {
  profiles: Record<ProfileStatus, number>;
  pendingReview: number;
  bookingsLast30Days: number;
  newBookings: number;
  openTickets: number;
  overdueTickets: number;
  users: number;
  /** Perfiles públicos sin el registro del art. 53 (máx. 10), para avisar en el resumen. */
  approvedWithoutLegal: { id: string; slug: string; displayName: string }[];
}

export interface GenreAdminDto {
  id: number;
  slug: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  profiles: number;
}
