import type { MediaAsset, SocialLink } from '@prisma/client';
import {
  BOOKING_CONSENT_TEXT,
  CONSENT_VERSION,
  CONTACT_PORTAL_NOTICE,
  LEGAL_DOCS,
  SOCIAL_PLATFORMS,
  buildWaUrl,
  eventWhatsappText,
  formatShowDate,
  normalizeHttpsUrl,
  normalizeSocialUrl,
  normalizeWhatsappNumber,
  resolveFormFields,
  resolveTexts,
  type EventCtaType,
  type GenreDto,
  type ImageDto,
  type PageTexts,
  type PublicDjCardDto,
  type PublicDjProfileDto,
  type PublicEventDto,
  type SocialLinkDto,
} from '@fersua/shared';
import { dateOnlyFromDb } from './date-only';
import type { CardProfile, ProfileDetail } from './public-profile.query';

/**
 * Lo único que los mappers necesitan de MediaUrlService. Así se prueban sin Nest ni disco,
 * y las URLs de imágenes siguen saliendo de un solo lugar.
 */
export interface ImageMapper {
  toImageDto(asset: MediaAsset | null | undefined, alt?: string | null): ImageDto | null;
  ogUrl(asset: MediaAsset): string | null;
}

/** Número de WhatsApp re-normalizado al leer: si lo guardado ya no es válido, no se arma enlace. */
export function waNumberOf(raw: string | null | undefined): string | null {
  return raw ? normalizeWhatsappNumber(raw) : null;
}

export function mapGenres(rows: { genre: { slug: string; name: string } }[]): GenreDto[] {
  return rows.map((r) => ({ slug: r.genre.slug, name: r.genre.name }));
}

/**
 * Redes con la etiqueta del catálogo. La URL se vuelve a validar al publicar: si una fila
 * vieja o sembrada ya no cumple las reglas (https, host permitido), simplemente no sale.
 */
export function mapSocials(links: Pick<SocialLink, 'platform' | 'url' | 'label'>[]): SocialLinkDto[] {
  const out: SocialLinkDto[] = [];
  for (const link of links) {
    const def = SOCIAL_PLATFORMS[link.platform];
    if (!def) continue;
    const r = normalizeSocialUrl(link.platform, link.url);
    if (!r.ok) continue;
    out.push({ platform: link.platform, label: link.label?.trim() || def.label, url: r.url });
  }
  return out;
}

export interface EventCtaInput {
  ctaType: EventCtaType;
  ctaUrl: string | null;
  ctaLabel: string | null;
  title: string | null;
  venue: string;
}

/** Botón de cada fecha. WHATSAPP arma el texto en el servidor (nunca '{evento}' literal). */
export function buildEventCta(
  event: EventCtaInput,
  date: string,
  texts: PageTexts,
  waNumber: string | null,
): PublicEventDto['cta'] {
  const label = event.ctaLabel?.trim() || texts.eventCtaLabel;
  switch (event.ctaType) {
    case 'WHATSAPP': {
      if (!waNumber) return null;
      const text = eventWhatsappText(texts.eventWhatsappMessage, { title: event.title, venue: event.venue, date });
      return { type: 'WHATSAPP', label, url: buildWaUrl(waNumber, text) };
    }
    case 'URL': {
      if (!event.ctaUrl) return null;
      const r = normalizeHttpsUrl(event.ctaUrl);
      return r.ok ? { type: 'URL', label, url: r.url } : null;
    }
    default:
      return null;
  }
}

export function mapEvent(
  event: ProfileDetail['events'][number],
  texts: PageTexts,
  waNumber: string | null,
  images: ImageMapper,
): PublicEventDto {
  const date = dateOnlyFromDb(event.date);
  const dateLabel = formatShowDate(date);
  return {
    id: event.id,
    date,
    dateLabel,
    time: event.startTime ?? null,
    title: event.title ?? null,
    venue: event.venue,
    city: event.city ?? null,
    flyer: images.toImageDto(event.flyer, `Flyer: ${event.title?.trim() || event.venue} — ${dateLabel}`),
    cta: buildEventCta(event, date, texts, waNumber),
  };
}

export function mapCard(profile: CardProfile, images: ImageMapper): PublicDjCardDto {
  const next = profile.events[0];
  const nextDate = next ? dateOnlyFromDb(next.date) : null;
  return {
    slug: profile.slug,
    displayName: profile.displayName,
    tagline: profile.tagline ?? null,
    city: profile.city ?? null,
    palette: profile.palette,
    featured: profile.featured,
    // Sin foto de tarjeta se usa la del hero: el index nunca queda con huecos si hay alguna foto.
    cardImage: images.toImageDto(profile.cardImage ?? profile.heroImage, `Foto de ${profile.displayName}`),
    // La foto horizontal solo viaja en los destacados: el hero del index la usa en vez de
    // recortar otra vez el 4:5 de la tarjeta. Los demás no la necesitan (respuesta más liviana).
    heroImage: profile.featured ? images.toImageDto(profile.heroImage, `Foto de ${profile.displayName}`) : null,
    genres: mapGenres(profile.genres),
    nextEvent: next && nextDate ? { date: nextDate, dateLabel: formatShowDate(nextDate), venue: next.venue } : null,
  };
}

type SortableCard = { featured: boolean; featuredRank: number; approvedAt: Date | null; events: { date: Date }[] };

function cmpNullable(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a === b) return 0;
  if (a === null) return 1; // nulos al final en ambos sentidos
  if (b === null) return -1;
  return (a - b) * dir;
}

/** Orden del index: destacados, featuredRank, próxima fecha (sin fecha al final), aprobados más recientes. */
export function sortCardProfiles<T extends SortableCard>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) =>
      Number(b.featured) - Number(a.featured) ||
      a.featuredRank - b.featuredRank ||
      cmpNullable(a.events[0]?.date.getTime() ?? null, b.events[0]?.date.getTime() ?? null, 1) ||
      cmpNullable(a.approvedAt?.getTime() ?? null, b.approvedAt?.getTime() ?? null, -1),
  );
}

export function mapProfile(profile: ProfileDetail, images: ImageMapper): PublicDjProfileDto {
  const texts = resolveTexts(profile.texts, profile.displayName);
  const wa = waNumberOf(profile.whatsappNumber);
  return {
    slug: profile.slug,
    displayName: profile.displayName,
    palette: profile.palette,
    texts,
    heroImage: images.toImageDto(profile.heroImage, texts.heroPhotoAlt),
    genres: mapGenres(profile.genres),
    socials: mapSocials(profile.socialLinks),
    members: profile.members.map((m) => ({
      id: m.id,
      name: m.name,
      role: m.role ?? null,
      description: m.description ?? null,
      photo: images.toImageDto(m.photo, m.name),
      socials: mapSocials(m.socialLinks),
    })),
    riderItems: profile.riderItems.map((r) => ({ name: r.name, note: r.note ?? null })),
    gallery: profile.gallery
      .map((g, i) => images.toImageDto(g.media, g.alt?.trim() || `${profile.displayName} — foto ${i + 1}`))
      .filter((img): img is ImageDto => img !== null),
    events: profile.events.map((e) => mapEvent(e, texts, wa, images)),
    show: {
      gallery: profile.showGallery,
      rider: profile.showRider,
      events: profile.showEvents,
      openDateRow: profile.showOpenDateRow,
      form: profile.formEnabled,
    },
    whatsapp: {
      heroUrl: wa ? buildWaUrl(wa, texts.heroWhatsappMessage) : null,
      openDateUrl: wa ? buildWaUrl(wa, texts.openDateWhatsappMessage) : null,
      bookingUrl: wa ? buildWaUrl(wa, texts.bookingWhatsappMessage) : null,
    },
    bookingForm: {
      fields: resolveFormFields(profile.bookingForm),
      consentText: BOOKING_CONSENT_TEXT,
      consentVersion: CONSENT_VERSION,
      privacyUrl: LEGAL_DOCS.privacy.path,
      portalNotice: CONTACT_PORTAL_NOTICE,
    },
    updatedAt: profile.updatedAt.toISOString(),
  };
}
