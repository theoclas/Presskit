import { Injectable } from '@nestjs/common';
import { todayBogota, type GenreCountDto, type PublicDjCardDto, type PublicDjProfileDto } from '@fersua/shared';
import { MediaUrlService } from '../media/media-url.service';
import { PrismaService } from '../prisma/prisma.service';
import { PublicProfileResolver } from './public-profile.resolver';
import { cardInclude, profileDetailInclude, type CardProfile, type ProfileDetail } from './public-profile.query';
import { mapCard, mapProfile, sortCardProfiles } from './public.mappers';

/** Tope del index: todas las tarjetas llegan en una respuesta y la web filtra en el navegador. */
export const INDEX_CAP = 500;

export type ProfileResult =
  | { kind: 'profile'; profile: ProfileDetail }
  | { kind: 'redirect'; slug: string }
  | { kind: 'none' };

@Injectable()
export class PublicService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: PublicProfileResolver,
    private readonly media: MediaUrlService,
  ) {}

  /** Perfiles visibles para el index, ya en el orden final. */
  async visibleCardProfiles(): Promise<CardProfile[]> {
    const rows = await this.prisma.djProfile.findMany({
      where: this.resolver.visibleWhere(),
      // Orden aproximado en SQL para que el tope corte por relevancia; el orden final
      // (con la próxima fecha, que no es una columna) se calcula en JS.
      orderBy: [{ featured: 'desc' }, { featuredRank: 'asc' }, { approvedAt: 'desc' }],
      take: INDEX_CAP,
      include: cardInclude(todayBogota()),
    });
    return sortCardProfiles(rows);
  }

  async listCards(): Promise<PublicDjCardDto[]> {
    const rows = await this.visibleCardProfiles();
    return rows.map((p) => mapCard(p, this.media));
  }

  /** Perfil visible por slug (una consulta en el caso normal) o la redirección de un slug viejo. */
  async findProfile(rawSlug: unknown): Promise<ProfileResult> {
    const slug = this.resolver.normalize(rawSlug);
    if (!slug) return { kind: 'none' };
    const profile = await this.prisma.djProfile.findFirst({
      where: this.resolver.whereSlug(slug),
      include: profileDetailInclude(todayBogota()),
    });
    if (profile) return { kind: 'profile', profile };
    const target = await this.resolver.redirectTarget(slug);
    return target ? { kind: 'redirect', slug: target } : { kind: 'none' };
  }

  toProfileDto(profile: ProfileDetail): PublicDjProfileDto {
    return mapProfile(profile, this.media);
  }

  /** Géneros activos con al menos un perfil visible, con el conteo para los chips del index. */
  async listGenres(): Promise<GenreCountDto[]> {
    const visible = this.resolver.visibleWhere();
    const rows = await this.prisma.genre.findMany({
      where: { isActive: true, profiles: { some: { profile: { is: visible } } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: {
        slug: true,
        name: true,
        _count: { select: { profiles: { where: { profile: { is: this.resolver.visibleWhere() } } } } },
      },
    });
    return rows.map((g) => ({ slug: g.slug, name: g.name, count: g._count.profiles }));
  }

  /** Slugs visibles para sitemap y JSON-LD del index. */
  async visibleSlugs(): Promise<{ slug: string; displayName: string; updatedAt: Date }[]> {
    return this.prisma.djProfile.findMany({
      where: this.resolver.visibleWhere(),
      orderBy: [{ featured: 'desc' }, { featuredRank: 'asc' }, { approvedAt: 'desc' }],
      take: INDEX_CAP,
      select: { slug: true, displayName: true, updatedAt: true },
    });
  }
}
