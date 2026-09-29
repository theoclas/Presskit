import type { PublicDjCardDto } from '@fersua/shared';
import { describe, expect, it } from 'vitest';
import { macflyCard } from '../src/dev-fixtures/macfly';
import { filterCards, genreChips } from '../src/public/index/filters';

const other: PublicDjCardDto = {
  ...macflyCard,
  slug: 'dj-bogota',
  displayName: 'Sofía Ramírez',
  tagline: null,
  city: 'Bogotá',
  featured: false,
  genres: [{ slug: 'techno', name: 'Techno' }],
};

describe('filtros del index', () => {
  const cards = [macflyCard, other];

  it('busca sin importar tildes ni mayúsculas', () => {
    expect(filterCards(cards, 'sofia', null).map((c) => c.slug)).toEqual(['dj-bogota']);
    expect(filterCards(cards, 'BOGOTÁ', null).map((c) => c.slug)).toEqual(['dj-bogota']);
    expect(filterCards(cards, 'medellin', null).map((c) => c.slug)).toEqual(['macfly-mike-bran']);
    expect(filterCards(cards, 'tech house', null).map((c) => c.slug)).toEqual(['macfly-mike-bran']);
  });

  it('filtra por género y conserva el orden del api', () => {
    expect(filterCards(cards, '', 'techno').map((c) => c.slug)).toEqual(['dj-bogota']);
    expect(filterCards(cards, '', null).map((c) => c.slug)).toEqual(['macfly-mike-bran', 'dj-bogota']);
  });

  it('arma los chips de género con su conteo', () => {
    const chips = genreChips(cards);
    expect(chips).toHaveLength(5);
    expect(chips.find((c) => c.slug === 'techno')?.count).toBe(1);
  });
});
