import {
  PAGE_TEXT_SLOTS,
  defaultFormConfig,
  type EditorEventDto,
  type EditorGalleryItemDto,
  type EditorMemberDto,
  type EditorProfileDto,
  type EditorSocialLinkDto,
  type FormFieldConfig,
  type LegalInfoDto,
  type MediaUsageDto,
  type PageTexts,
} from '@fersua/shared';
import type { DjLegalInfo, Prisma, SocialLink } from '@prisma/client';
import type { MediaUrlService } from '../media/media-url.service';
import { dateOnlyFromDb } from '../public/date-only';
import { publishChecklist } from './profile-rules';

// Forma de los datos del editor (dueño o admin). A diferencia de la vista pública, trae todo:
// fechas ocultas, géneros inactivos ya elegidos, imágenes privadas (con URL firmada).

export function editorProfileInclude() {
  return {
    user: { select: { id: true, username: true, status: true } },
    heroImage: true,
    cardImage: true,
    genres: { orderBy: { sortOrder: 'asc' }, include: { genre: { select: { id: true, slug: true, name: true, isActive: true } } } },
    socialLinks: { where: { memberId: null }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    members: {
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: { photo: true, socialLinks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] } },
    },
    gallery: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { media: true } },
    riderItems: { orderBy: { sortOrder: 'asc' } },
    legalInfo: { select: { id: true } },
  } satisfies Prisma.DjProfileInclude;
}

export type EditorProfile = Prisma.DjProfileGetPayload<{ include: ReturnType<typeof editorProfileInclude> }>;

export const memberInclude = {
  photo: true,
  socialLinks: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
} satisfies Prisma.MemberInclude;
export type EditorMemberRow = Prisma.MemberGetPayload<{ include: typeof memberInclude }>;

export const eventInclude = { flyer: true } satisfies Prisma.EventInclude;
export type EditorEventRow = Prisma.EventGetPayload<{ include: typeof eventInclude }>;

export const galleryInclude = { media: true } satisfies Prisma.GalleryItemInclude;
export type EditorGalleryRow = Prisma.GalleryItemGetPayload<{ include: typeof galleryInclude }>;

/** Solo las claves del catálogo con valor string: lo guardado, sin valores por defecto. */
export function storedTexts(raw: unknown): Partial<PageTexts> {
  const src = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const out: Record<string, string> = {};
  for (const slot of PAGE_TEXT_SLOTS) {
    if (!Object.prototype.hasOwnProperty.call(src, slot.key)) continue;
    const v = src[slot.key];
    if (typeof v === 'string') out[slot.key] = v;
  }
  return out as Partial<PageTexts>;
}

/** Configuración guardada del formulario (la de por defecto si la fila está vacía o rota). */
export function storedForm(raw: unknown): FormFieldConfig[] {
  if (!Array.isArray(raw)) return defaultFormConfig();
  return raw
    .filter((f): f is Record<string, unknown> => !!f && typeof f === 'object' && typeof (f as { key?: unknown }).key === 'string')
    .map((f) => ({
      key: f.key as string,
      required: f.required === true,
      label: typeof f.label === 'string' ? f.label : null,
      placeholder: typeof f.placeholder === 'string' ? f.placeholder : null,
    }));
}

export function toEditorSocialDto(link: Pick<SocialLink, 'id' | 'platform' | 'url' | 'label'>): EditorSocialLinkDto {
  return { id: link.id, platform: link.platform, url: link.url, label: link.label ?? null };
}

export function toEditorMemberDto(m: EditorMemberRow, urls: MediaUrlService, nowMs: number): EditorMemberDto {
  return {
    id: m.id,
    name: m.name,
    role: m.role ?? null,
    description: m.description ?? null,
    photo: urls.toEditorAssetDto(m.photo, nowMs),
    socials: m.socialLinks.map(toEditorSocialDto),
    sortOrder: m.sortOrder,
  };
}

export function toEditorEventDto(e: EditorEventRow, today: string, urls: MediaUrlService, nowMs: number): EditorEventDto {
  const date = dateOnlyFromDb(e.date);
  return {
    id: e.id,
    date,
    startTime: e.startTime ?? null,
    title: e.title ?? null,
    venue: e.venue,
    city: e.city ?? null,
    flyer: urls.toEditorAssetDto(e.flyer, nowMs),
    ctaType: e.ctaType,
    ctaUrl: e.ctaUrl ?? null,
    ctaLabel: e.ctaLabel ?? null,
    isHidden: e.isHidden,
    isPast: date < today,
  };
}

/** null si la imagen de la fila no se puede mostrar (fila rara): el ítem se omite. */
export function toEditorGalleryItemDto(g: EditorGalleryRow, urls: MediaUrlService, nowMs: number): EditorGalleryItemDto | null {
  const image = urls.toEditorAssetDto(g.media, nowMs);
  if (!image) return null;
  return { id: g.id, image, alt: g.alt ?? null, sortOrder: g.sortOrder };
}

export function toEditorProfileDto(
  p: EditorProfile,
  usage: MediaUsageDto,
  urls: MediaUrlService,
  nowMs: number = Date.now(),
): EditorProfileDto {
  return {
    id: p.id,
    slug: p.slug,
    status: p.status,
    statusReason: p.statusReason ?? null,
    displayName: p.displayName,
    tagline: p.tagline ?? null,
    seoDescription: p.seoDescription ?? null,
    city: p.city ?? null,
    whatsappNumber: p.whatsappNumber ?? null,
    publicEmail: p.publicEmail ?? null,
    publicPhone: p.publicPhone ?? null,
    palette: p.palette,
    texts: storedTexts(p.texts),
    bookingForm: storedForm(p.bookingForm),
    show: {
      gallery: p.showGallery,
      rider: p.showRider,
      events: p.showEvents,
      openDateRow: p.showOpenDateRow,
      form: p.formEnabled,
    },
    formOpenWhatsapp: p.formOpenWhatsapp,
    notifyByEmail: p.notifyByEmail,
    heroImage: urls.toEditorAssetDto(p.heroImage, nowMs),
    cardImage: urls.toEditorAssetDto(p.cardImage, nowMs),
    genres: p.genres.map((g) => ({ id: g.genre.id, slug: g.genre.slug, name: g.genre.name })),
    socials: p.socialLinks.map(toEditorSocialDto),
    members: p.members.map((m) => toEditorMemberDto(m, urls, nowMs)),
    gallery: p.gallery
      .map((g) => toEditorGalleryItemDto(g, urls, nowMs))
      .filter((g): g is EditorGalleryItemDto => g !== null),
    riderItems: p.riderItems.map((r) => ({ id: r.id, name: r.name, note: r.note ?? null })),
    featured: p.featured,
    featuredRank: p.featuredRank,
    owner: p.user ? { id: p.user.id, username: p.user.username, status: p.user.status } : null,
    hasLegalInfo: p.legalInfo !== null,
    publishMissing: Object.keys(
      publishChecklist({
        displayName: p.displayName,
        slug: p.slug,
        texts: p.texts,
        heroImageId: p.heroImageId,
        activeGenres: p.genres.filter((g) => g.genre.isActive).length,
        members: p.members.length,
        whatsappNumber: p.whatsappNumber,
        bookingForm: p.bookingForm,
        hasLegalInfo: p.legalInfo !== null,
      }),
    ),
    usage,
    submittedAt: p.submittedAt?.toISOString() ?? null,
    approvedAt: p.approvedAt?.toISOString() ?? null,
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function toLegalInfoDto(row: DjLegalInfo | null): LegalInfoDto {
  if (!row) return { legalName: '', docType: 'CC', docNumber: '', address: '', phones: [], updatedAt: null };
  const phones = Array.isArray(row.phones) ? row.phones.filter((p): p is string => typeof p === 'string') : [];
  return {
    legalName: row.legalName,
    docType: row.docType,
    docNumber: row.docNumber,
    address: row.address,
    phones,
    updatedAt: row.updatedAt.toISOString(),
  };
}
