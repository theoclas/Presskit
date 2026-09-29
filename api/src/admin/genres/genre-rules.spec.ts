import { cleanGenreName, genreSlugBase, uniqueGenreSlug } from './genre-rules';

describe('genreSlugBase', () => {
  it('coincide con el catálogo inicial', () => {
    expect(genreSlugBase('Tech House')).toBe('tech-house');
    expect(genreSlugBase('Jackin & Funky')).toBe('jackin-funky');
    expect(genreSlugBase('Reggaetón')).toBe('reggaeton');
    expect(genreSlugBase('Electrónica')).toBe('electronica');
    expect(genreSlugBase('Disco / Nu Disco')).toBe('disco-nu-disco');
  });

  it('queda vacío si no hay letras ni números latinos', () => {
    expect(genreSlugBase('🎧 🎧')).toBe('');
    expect(genreSlugBase('---')).toBe('');
  });

  it('máximo 40 caracteres, sin guion al final', () => {
    const slug = genreSlugBase('Muy Largo '.repeat(10));
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug).not.toMatch(/-$/);
  });
});

describe('uniqueGenreSlug', () => {
  it('usa la base si está libre y numera si no', () => {
    expect(uniqueGenreSlug('techno', new Set())).toBe('techno');
    expect(uniqueGenreSlug('techno', new Set(['techno']))).toBe('techno-2');
    expect(uniqueGenreSlug('techno', new Set(['techno', 'techno-2']))).toBe('techno-3');
  });

  it('recorta la base para que el sufijo quepa en 40', () => {
    const base = 'a'.repeat(40);
    const slug = uniqueGenreSlug(base, new Set([base]));
    expect(slug).toBe(`${'a'.repeat(38)}-2`);
    expect(slug.length).toBe(40);
  });
});

describe('cleanGenreName', () => {
  it('limpia espacios e invisibles', () => {
    expect(cleanGenreName('  Afro​   House ')).toEqual({ value: 'Afro House', error: null });
  });

  it('errores de longitud y forma', () => {
    expect(cleanGenreName('   ').error).toBe('REQUIRED');
    expect(cleanGenreName('A').error).toBe('TOO_SHORT');
    expect(cleanGenreName('x'.repeat(41)).error).toBe('TOO_LONG');
    expect(cleanGenreName('🎧🎧').error).toBe('INVALID');
    expect(cleanGenreName('Techno \ud83d').error).toBe('INVALID');
  });
});
