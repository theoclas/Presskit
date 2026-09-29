import type { Prisma } from '@prisma/client';
import { LIMITS } from '@fersua/shared';
import { dateOnlyToDb } from './date-only';

// Qué se carga de la BD para cada vista pública. Los `take` repiten los límites de shared
// como defensa: aunque la BD tuviera más filas, la respuesta nunca crece sin control.

const genresInclude = {
  where: { genre: { is: { isActive: true } } },
  orderBy: { sortOrder: 'asc' },
  take: LIMITS.genres.perProfileMax,
  include: { genre: true },
} satisfies Prisma.DjProfile$genresArgs;

/** Próximas fechas: desde hoy (Bogotá), no ocultas. */
function upcomingEventsWhere(today: string): Prisma.EventWhereInput {
  return { isHidden: false, date: { gte: dateOnlyToDb(today) } };
}

export function cardInclude(today: string) {
  return {
    cardImage: true,
    heroImage: true,
    genres: genresInclude,
    events: {
      where: upcomingEventsWhere(today),
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 1,
      select: { date: true, venue: true },
    },
  } satisfies Prisma.DjProfileInclude;
}

export type CardProfile = Prisma.DjProfileGetPayload<{ include: ReturnType<typeof cardInclude> }>;

export function profileDetailInclude(today: string) {
  return {
    heroImage: true,
    genres: genresInclude,
    members: {
      orderBy: { sortOrder: 'asc' },
      take: LIMITS.members.max,
      include: {
        photo: true,
        socialLinks: { orderBy: { sortOrder: 'asc' }, take: LIMITS.social.perMemberMax },
      },
    },
    socialLinks: { where: { memberId: null }, orderBy: { sortOrder: 'asc' }, take: LIMITS.social.perProfileMax },
    gallery: { orderBy: { sortOrder: 'asc' }, take: LIMITS.gallery.max, include: { media: true } },
    riderItems: { orderBy: { sortOrder: 'asc' }, take: LIMITS.rider.max },
    events: {
      where: upcomingEventsWhere(today),
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: LIMITS.events.upcomingMax,
      include: { flyer: true },
    },
  } satisfies Prisma.DjProfileInclude;
}

export type ProfileDetail = Prisma.DjProfileGetPayload<{ include: ReturnType<typeof profileDetailInclude> }>;
export type ProfileEvent = ProfileDetail['events'][number];
