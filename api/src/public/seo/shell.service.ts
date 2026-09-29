import { Injectable } from '@nestjs/common';
import { DEFAULT_PALETTE, LEGAL_DOCS, type PaletteKey } from '@fersua/shared';
import { AppConfig } from '../../config/app-config.service';
import { MediaUrlService } from '../../media/media-url.service';
import type { ProfileDetail } from '../public-profile.query';
import { mapProfile } from '../public.mappers';
import { PublicService } from '../public.service';
import {
  defaultHead,
  indexHead,
  injectHead,
  profileHead,
  renderHead,
  staticPageHead,
  type HeadMeta,
  type ProfileSeoInput,
  type SeoContext,
  type StaticPageSeo,
} from './head-builder';
import { APP_ROUTES, decideShellPath, slugLocation } from './path-decision';
import { ShellTemplateService } from './shell-template.service';

export type ShellResult =
  | { status: 200 | 404; html: string; indexable: boolean }
  | { status: 301; location: string };

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Páginas legales con head propio (título y descripción reales en buscadores y vistas
 * previas). Los documentos se pueden indexar; el formulario de reporte no. Login, registro,
 * panel, admin y _preview siguen con el head genérico y noindex.
 */
const STATIC_PAGES: ReadonlyMap<string, StaticPageSeo> = new Map(
  (
    [
      [LEGAL_DOCS.privacy, 'Cómo Fersua Studio recoge, usa y protege tus datos personales, y cómo ejercer tus derechos de habeas data.', true],
      [LEGAL_DOCS.terms, 'Condiciones de uso de Fersua Studio, el portal de contacto entre organizadores de eventos y DJs.', true],
      [LEGAL_DOCS.artistTerms, 'Condiciones para los artistas que publican su página de booking en Fersua Studio.', true],
      [LEGAL_DOCS.pqrs, 'Envía una petición, queja, reclamo o solicitud sobre tus datos personales a Fersua Studio.', true],
      [{ path: '/reportar', title: 'Reportar contenido' }, 'Reporta un perfil o contenido de Fersua Studio que infrinja la ley o nuestros términos.', false],
    ] as const
  ).map(([doc, description, indexable]): [string, StaticPageSeo] => [
    doc.path.slice(1),
    { path: doc.path, title: doc.title, description, indexable },
  ]),
);

/**
 * GET /api/public/shell?path=… — el edge lo usa para / y /<slug>. Devuelve la página de la
 * SPA con title, description, Open Graph y JSON-LD reales (vistas previas de WhatsApp e
 * Instagram), o la redirección 301 relativa que corresponda.
 */
@Injectable()
export class ShellService {
  constructor(
    private readonly publicService: PublicService,
    private readonly media: MediaUrlService,
    private readonly template: ShellTemplateService,
    private readonly config: AppConfig,
  ) {}

  private ctx(): SeoContext {
    return { publicUrl: this.config.publicUrl, seoIndexable: this.config.seoIndexable };
  }

  async render(rawPath: unknown): Promise<ShellResult> {
    const decision = decideShellPath(rawPath);
    switch (decision.kind) {
      case 'index':
        return this.page(200, await this.buildIndexHead(), DEFAULT_PALETTE, true);
      case 'redirect':
        return { status: 301, location: decision.location };
      case 'app':
        return this.page(200, defaultHead(this.ctx(), 'app'), DEFAULT_PALETTE, false);
      case 'notFound':
        return this.notFound();
      case 'segment': {
        const { slug, canonical } = decision;
        if (APP_ROUTES.has(slug)) {
          if (!canonical) return { status: 301, location: slugLocation(slug) };
          const staticPage = STATIC_PAGES.get(slug);
          return staticPage
            ? this.page(200, staticPageHead(this.ctx(), staticPage), DEFAULT_PALETTE, staticPage.indexable)
            : this.page(200, defaultHead(this.ctx(), 'app'), DEFAULT_PALETTE, false);
        }
        const found = await this.publicService.findProfile(slug);
        if (found.kind === 'profile') {
          if (!canonical || found.profile.slug !== slug) return { status: 301, location: slugLocation(found.profile.slug) };
          return this.page(200, profileHead(this.ctx(), this.seoInput(found.profile)), found.profile.palette, true);
        }
        if (found.kind === 'redirect') return { status: 301, location: slugLocation(found.slug) };
        // Mayúsculas o .html en un slug desconocido: igual se normaliza (la siguiente carga da 404).
        return canonical ? this.notFound() : { status: 301, location: slugLocation(slug) };
      }
    }
  }

  private async notFound(): Promise<ShellResult> {
    return this.page(404, defaultHead(this.ctx(), 'notFound'), DEFAULT_PALETTE, false);
  }

  private async page(status: 200 | 404, head: HeadMeta, palette: PaletteKey, indexable: boolean): Promise<ShellResult> {
    const html = injectHead(await this.template.get(), renderHead(head), palette);
    return { status, html, indexable: indexable && this.config.seoIndexable };
  }

  private async buildIndexHead(): Promise<HeadMeta> {
    const profiles = await this.publicService.visibleCardProfiles();
    // La imagen para compartir el index sale del primer destacado que tenga JPEG de OG.
    const withOg = profiles.find((p) => p.featured && p.heroImage?.hasOg);
    const ogImageUrl = withOg?.heroImage ? this.media.ogUrl(withOg.heroImage) : null;
    return indexHead(this.ctx(), {
      djs: profiles.map((p) => ({ slug: p.slug, displayName: p.displayName })),
      ogImageUrl,
    });
  }

  /** Datos del perfil para el head. Reutiliza el mapper público: mismas reglas de URLs y fechas. */
  seoInput(profile: ProfileDetail): ProfileSeoInput {
    const dto = mapProfile(profile, this.media);
    return {
      slug: profile.slug,
      displayName: profile.displayName,
      palette: profile.palette,
      seoDescription: profile.seoDescription ?? null,
      heroSubtitle: dto.texts.heroSubtitle || null,
      tagline: profile.tagline ?? null,
      ogImageUrl: profile.heroImage ? this.media.ogUrl(profile.heroImage) : null,
      heroAlt: dto.texts.heroPhotoAlt || null,
      genres: dto.genres.map((g) => g.name),
      members: dto.members.map((m) => m.name),
      // WhatsApp no es un perfil público de la banda: no va en sameAs.
      sameAs: dto.socials.filter((s) => s.platform !== 'WHATSAPP').map((s) => s.url),
      publicPhone: profile.publicPhone ?? null,
      publicEmail: profile.publicEmail ?? null,
      events: dto.show.events
        ? dto.events.map((e) => ({
            name: e.title?.trim() || `${profile.displayName} en ${e.venue}`,
            date: e.date,
            time: e.time && TIME_RE.test(e.time) ? e.time : null,
            venue: e.venue,
            city: e.city,
            url: e.cta?.type === 'URL' ? e.cta.url : null,
          }))
        : [],
    };
  }
}
