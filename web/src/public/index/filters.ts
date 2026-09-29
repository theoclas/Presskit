import { foldText, type PublicDjCardDto } from '@fersua/shared';

export interface GenreChip {
  slug: string;
  name: string;
  count: number;
}

/** Géneros presentes en las tarjetas, del más usado al menos usado. */
export function genreChips(cards: PublicDjCardDto[]): GenreChip[] {
  const map = new Map<string, GenreChip>();
  for (const card of cards) {
    for (const g of card.genres) {
      const chip = map.get(g.slug);
      if (chip) chip.count++;
      else map.set(g.slug, { slug: g.slug, name: g.name, count: 1 });
    }
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

/**
 * Filtro en el navegador (todas las tarjetas llegan en una sola respuesta).
 * Ignora tildes y mayúsculas; conserva el orden que manda el api (destacados primero).
 */
export function filterCards(cards: PublicDjCardDto[], query: string, genre: string | null): PublicDjCardDto[] {
  const q = foldText(query);
  return cards.filter((c) => {
    if (genre && !c.genres.some((g) => g.slug === genre)) return false;
    if (!q) return true;
    const haystack = foldText([c.displayName, c.tagline, c.city, ...c.genres.map((g) => g.name)].filter(Boolean).join(' '));
    return haystack.includes(q);
  });
}
