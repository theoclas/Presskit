import { DEFAULT_PALETTE, OG_IMAGE, PALETTES, PALETTE_KEYS, type PaletteKey } from '@fersua/shared';
import { escapeHtml, jsonForScript, oneLine, truncate } from './html';

// Arma el bloque <head> del shell SEO y lo inyecta en la plantilla de la web.
// Regla de oro: cada valor pasa por escapeHtml o jsonForScript, y los reemplazos en la
// plantilla usan una FUNCIÓN (con un string, '$&' o "$'" en un texto del DJ se interpretarían).

export const SITE_NAME = 'Fersua Studio';
export const INDEX_TITLE = 'Fersua Studio · Booking de DJs';
export const INDEX_DESCRIPTION =
  'Encuentra DJs, mira sus próximas fechas y envía tu solicitud de booking directamente a cada artista.';
export const NOT_FOUND_TITLE = 'Página no encontrada · Fersua Studio';
export const TITLE_MAX = 70;
export const DESCRIPTION_MAX = 155;

const HEAD_START = '<!--app-head:start-->';
const HEAD_END = '<!--app-head:end-->';
const HEAD_BLOCK_RE = /<!--app-head:start-->[\s\S]*?<!--app-head:end-->/;
const PALETTE_ATTR_RE = /(<html\b[^>]*?\sdata-palette=")[^"]*(")/i;

export interface OgImage {
  url: string;
  width: number;
  height: number;
  alt?: string | null;
}

export interface HeadMeta {
  title: string;
  description: string;
  robots: string;
  canonical?: string | null;
  themeColor?: string;
  og?: {
    type: 'website' | 'profile';
    title: string;
    description: string;
    url: string;
    image?: OgImage | null;
  } | null;
  jsonLd?: unknown;
}

/** Valor del meta robots según el flag global y si la página se debe indexar. */
export function robotsValue(seoIndexable: boolean, pageIndexable: boolean): string {
  if (!seoIndexable) return 'noindex, nofollow';
  return pageIndexable ? 'index, follow, max-image-preview:large' : 'noindex';
}

export function themeColorOf(palette: PaletteKey): string {
  return (PALETTES[palette] ?? PALETTES[DEFAULT_PALETTE]).themeColor;
}

/** '{displayName} — Booking | Fersua Studio', recortando el nombre si se pasa de 70. */
export function profileTitle(displayName: string): string {
  const suffix = ' — Booking | Fersua Studio';
  const name = oneLine(displayName);
  const room = TITLE_MAX - [...suffix].length;
  return `${truncate(name, room)}${suffix}`;
}

export function metaDescription(...candidates: (string | null | undefined)[]): string {
  const first = candidates.map((c) => oneLine(c ?? '')).find((c) => c.length > 0);
  return truncate(first ?? INDEX_DESCRIPTION, DESCRIPTION_MAX);
}

export function renderHead(meta: HeadMeta): string {
  const e = escapeHtml;
  const tags: string[] = [
    `<title>${e(truncate(oneLine(meta.title), TITLE_MAX))}</title>`,
    `<meta name="description" content="${e(meta.description)}">`,
    `<meta name="robots" content="${e(meta.robots)}">`,
  ];
  if (meta.canonical) tags.push(`<link rel="canonical" href="${e(meta.canonical)}">`);
  if (meta.themeColor) tags.push(`<meta name="theme-color" content="${e(meta.themeColor)}">`);
  if (meta.og) {
    const og = meta.og;
    tags.push(
      `<meta property="og:type" content="${e(og.type)}">`,
      `<meta property="og:site_name" content="${e(SITE_NAME)}">`,
      `<meta property="og:locale" content="es_CO">`,
      `<meta property="og:title" content="${e(og.title)}">`,
      `<meta property="og:description" content="${e(og.description)}">`,
      `<meta property="og:url" content="${e(og.url)}">`,
    );
    if (og.image) {
      tags.push(
        `<meta property="og:image" content="${e(og.image.url)}">`,
        `<meta property="og:image:type" content="image/jpeg">`,
        `<meta property="og:image:width" content="${og.image.width}">`,
        `<meta property="og:image:height" content="${og.image.height}">`,
      );
      if (og.image.alt) tags.push(`<meta property="og:image:alt" content="${e(oneLine(og.image.alt))}">`);
      tags.push(`<meta name="twitter:card" content="summary_large_image">`);
    } else {
      tags.push(`<meta name="twitter:card" content="summary">`);
    }
  }
  if (meta.jsonLd) tags.push(`<script type="application/ld+json">${jsonForScript(meta.jsonLd)}</script>`);
  return tags.join('\n');
}

/**
 * Pone el head en la plantilla (entre los marcadores) y la paleta en <html data-palette>.
 * Si la plantilla no trae marcadores, el bloque va antes de </head>.
 */
export function injectHead(template: string, head: string, palette: PaletteKey): string {
  const block = `${HEAD_START}\n${head}\n${HEAD_END}`;
  let out = HEAD_BLOCK_RE.test(template)
    ? template.replace(HEAD_BLOCK_RE, () => block)
    : template.replace(/<\/head>/i, () => `${block}\n</head>`);
  const safePalette = (PALETTE_KEYS as readonly string[]).includes(palette) ? palette : DEFAULT_PALETTE;
  out = out.replace(PALETTE_ATTR_RE, (_m, before: string, after: string) => `${before}${safePalette}${after}`);
  return out;
}

// ---------------------------------------------------------------------------
// Páginas concretas

export interface SeoContext {
  publicUrl: string;
  seoIndexable: boolean;
}

/** Head por defecto: rutas de la app (200) y 404. Nunca indexable. */
export function defaultHead(ctx: SeoContext, kind: 'app' | 'notFound'): HeadMeta {
  return {
    title: kind === 'notFound' ? NOT_FOUND_TITLE : INDEX_TITLE,
    description: INDEX_DESCRIPTION,
    robots: robotsValue(ctx.seoIndexable, false),
    themeColor: themeColorOf(DEFAULT_PALETTE),
  };
}

/** Página fija de la plataforma (documentos legales, reportar). */
export interface StaticPageSeo {
  /** Ruta canónica: '/privacidad'. */
  path: string;
  title: string;
  description: string;
  indexable: boolean;
}

/** Head de una página legal: su propio título y descripción (antes salía el del index). */
export function staticPageHead(ctx: SeoContext, page: StaticPageSeo): HeadMeta {
  const url = `${ctx.publicUrl}${page.path}`;
  const title = `${page.title} · ${SITE_NAME}`;
  const description = metaDescription(page.description);
  return {
    title,
    description,
    robots: robotsValue(ctx.seoIndexable, page.indexable),
    canonical: url,
    themeColor: themeColorOf(DEFAULT_PALETTE),
    og: { type: 'website', title, description, url, image: null },
  };
}

export interface IndexSeoInput {
  djs: { slug: string; displayName: string }[];
  ogImageUrl: string | null;
}

export function indexHead(ctx: SeoContext, input: IndexSeoInput): HeadMeta {
  const url = `${ctx.publicUrl}/`;
  return {
    title: INDEX_TITLE,
    description: INDEX_DESCRIPTION,
    robots: robotsValue(ctx.seoIndexable, true),
    canonical: url,
    themeColor: themeColorOf(DEFAULT_PALETTE),
    og: {
      type: 'website',
      title: INDEX_TITLE,
      description: INDEX_DESCRIPTION,
      url,
      image: input.ogImageUrl ? { url: input.ogImageUrl, width: OG_IMAGE.width, height: OG_IMAGE.height } : null,
    },
    jsonLd: {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'Organization', '@id': `${url}#org`, name: SITE_NAME, url },
        {
          '@type': 'ItemList',
          name: 'DJs en Fersua Studio',
          itemListElement: input.djs.slice(0, 100).map((dj, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${ctx.publicUrl}/${dj.slug}`,
            name: dj.displayName,
          })),
        },
      ],
    },
  };
}

export interface ProfileSeoInput {
  slug: string;
  displayName: string;
  palette: PaletteKey;
  seoDescription: string | null;
  heroSubtitle: string | null;
  tagline: string | null;
  ogImageUrl: string | null;
  heroAlt: string | null;
  genres: string[];
  members: string[];
  sameAs: string[];
  publicPhone: string | null;
  publicEmail: string | null;
  events: { name: string; date: string; time: string | null; venue: string; city: string | null; url: string | null }[];
}

export function profileHead(ctx: SeoContext, p: ProfileSeoInput): HeadMeta {
  const url = `${ctx.publicUrl}/${p.slug}`;
  const title = profileTitle(p.displayName);
  const description = metaDescription(p.seoDescription, p.heroSubtitle, p.tagline, `Booking de ${p.displayName}.`);
  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: p.displayName,
    url,
    description,
  };
  if (p.ogImageUrl) jsonLd.image = p.ogImageUrl;
  if (p.genres.length) jsonLd.genre = p.genres;
  if (p.members.length) jsonLd.member = p.members.map((name) => ({ '@type': 'Person', name }));
  if (p.sameAs.length) jsonLd.sameAs = p.sameAs;
  if (p.publicPhone || p.publicEmail) {
    jsonLd.contactPoint = {
      '@type': 'ContactPoint',
      contactType: 'booking',
      ...(p.publicPhone ? { telephone: p.publicPhone } : {}),
      ...(p.publicEmail ? { email: p.publicEmail } : {}),
    };
  }
  if (p.events.length) {
    jsonLd.event = p.events.map((ev) => ({
      '@type': 'MusicEvent',
      name: ev.name,
      // Colombia no tiene horario de verano: -05:00 fijo.
      startDate: ev.time ? `${ev.date}T${ev.time}:00-05:00` : ev.date,
      location: { '@type': 'Place', name: ev.venue, ...(ev.city ? { address: ev.city } : {}) },
      performer: { '@type': 'MusicGroup', name: p.displayName, url },
      ...(ev.url ? { url: ev.url } : {}),
    }));
  }

  return {
    title,
    description,
    robots: robotsValue(ctx.seoIndexable, true),
    canonical: url,
    themeColor: themeColorOf(p.palette),
    og: {
      type: 'profile',
      title,
      description,
      url,
      image: p.ogImageUrl
        ? { url: p.ogImageUrl, width: OG_IMAGE.width, height: OG_IMAGE.height, alt: p.heroAlt }
        : null,
    },
    jsonLd,
  };
}
