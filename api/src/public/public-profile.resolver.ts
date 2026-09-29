import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizeSlug } from '@fersua/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Forma de un slug que vale la pena buscar (slugs actuales y viejos de SlugRedirect). */
const LOOKUP_SLUG_RE = /^[a-z0-9-]{1,60}$/;

export type SlugLookup =
  | { kind: 'profile'; id: string; slug: string }
  | { kind: 'redirect'; slug: string }
  | { kind: 'none' };

/**
 * Única regla de visibilidad pública: status = APPROVED y (sin dueño o dueño ACTIVE).
 * Todos los endpoints públicos (listas, detalle, shell SEO, sitemap, booking y tickets)
 * pasan por aquí para que ninguno se salte la regla.
 */
@Injectable()
export class PublicProfileResolver {
  constructor(private readonly prisma: PrismaService) {}

  /** Objeto nuevo en cada llamada: Prisma no debe recibir el mismo objeto mutado entre consultas. */
  visibleWhere(): Prisma.DjProfileWhereInput {
    return {
      status: 'APPROVED',
      OR: [{ userId: null }, { user: { is: { status: 'ACTIVE' } } }],
    };
  }

  /** Where de un perfil visible por slug actual (ya normalizado). */
  whereSlug(slug: string): Prisma.DjProfileWhereInput {
    return { AND: [this.visibleWhere(), { slug }] };
  }

  /**
   * Minúsculas + formato. Devuelve null si ni siquiera parece un slug (no toca la BD).
   * Solo se tolera la diferencia de mayúsculas: con espacios alrededor ('%20slug') la URL
   * no coincide con las regex del edge y se escaparía del límite de formularios.
   */
  normalize(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw !== raw.trim()) return null;
    const slug = normalizeSlug(raw);
    return LOOKUP_SLUG_RE.test(slug) ? slug : null;
  }

  /**
   * Resuelve un slug: perfil visible, redirección (slug viejo de un perfil visible) o nada.
   * Una redirección a un perfil no visible se trata como inexistente: no revela que existe.
   */
  async lookup(raw: unknown): Promise<SlugLookup> {
    const slug = this.normalize(raw);
    if (!slug) return { kind: 'none' };

    const profile = await this.prisma.djProfile.findFirst({ where: this.whereSlug(slug), select: { id: true, slug: true } });
    if (profile) return { kind: 'profile', id: profile.id, slug: profile.slug };

    const target = await this.redirectTarget(slug);
    return target ? { kind: 'redirect', slug: target } : { kind: 'none' };
  }

  /** Slug actual de un perfil visible al que apunta un slug viejo (SlugRedirect), o null. */
  async redirectTarget(slug: string): Promise<string | null> {
    const target = await this.prisma.djProfile.findFirst({
      where: { AND: [this.visibleWhere(), { slugRedirects: { some: { fromSlug: slug } } }] },
      select: { slug: true },
    });
    return target?.slug ?? null;
  }
}
