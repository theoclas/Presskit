import { DEFAULT_PALETTE } from '@fersua/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { prefetchDj, useDjCards } from '../../app/queries';
import { usePalette } from '../../lib/palette';
import { SITE_NAME, usePageTitle } from '../../lib/usePageTitle';
import { IMAGE_SIZES, ResponsiveImage } from '../components/ResponsiveImage';
import { SiteNav } from '../components/SiteNav';
import { DjCard } from '../index/DjCard';
import { filterCards, genreChips } from '../index/filters';
import { PublicShell } from '../layouts/PublicShell';

const SKELETONS = 6;

export function IndexPage() {
  usePalette(DEFAULT_PALETTE);
  usePageTitle(`${SITE_NAME} · Booking de DJs`);
  const queryClient = useQueryClient();
  const { data: cards, isPending, isError, error, refetch } = useDjCards();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const genre = params.get('genero') || null;

  const chips = useMemo(() => genreChips(cards ?? []), [cards]);
  const activeGenre = genre && chips.some((c) => c.slug === genre) ? genre : null;
  const visible = useMemo(() => filterCards(cards ?? [], q, activeGenre), [cards, q, activeGenre]);
  // El hero del index es horizontal: usa la foto del hero del destacado. El 4:5 de la tarjeta
  // recortado otra vez perdía el cartel y la cabina (y se repetía con la tarjeta de abajo).
  const featured = useMemo(() => {
    const card = (cards ?? []).find((c) => c.featured && (c.heroImage || c.cardImage));
    const image = card ? (card.heroImage ?? card.cardImage) : null;
    return card && image ? { displayName: card.displayName, image } : null;
  }, [cards]);

  // La búsqueda vive en la URL (?q=&genero=) para poder compartirla; replace para no llenar el historial.
  const updateParam = useCallback(
    (key: 'q' | 'genero', value: string | null) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (value) next.set(key, value);
          else next.delete(key);
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setParams],
  );
  const clearFilters = () => setParams({}, { replace: true, preventScrollReset: true });
  const onPrefetch = useCallback((slug: string) => prefetchDj(queryClient, slug), [queryClient]);

  return (
    <PublicShell nav={<SiteNav links={[{ href: '#djs', label: 'Artistas' }]} />}>
      <header className={featured ? 'hero index-hero' : 'hero hero--solo index-hero'}>
        <div className="hero-left">
          <div className="hero-label">Fersua Studio · Booking</div>
          <h1 className="hero-title">DJs para tu evento</h1>
          <p className="hero-sub">
            Encuentra DJs y dúos para tu club, festival o evento privado. Mira su agenda y envíales tu solicitud
            directamente.
          </p>
          <div className="hero-cta">
            <a className="btn btn-primary" href="#djs">
              Ver artistas
            </a>
          </div>
        </div>
        {featured ? (
          <div className="hero-right hero-right--single">
            <div className="hero-photo">
              <ResponsiveImage
                image={featured.image}
                sizes={IMAGE_SIZES.hero}
                alt={featured.image.alt || featured.displayName}
                priority
              />
              <div className="hero-photo-caption">
                <span>Destacado</span>
                <span>{featured.displayName}</span>
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <section id="djs" aria-labelledby="djs-title">
        <h2 className="sec-title" id="djs-title">
          Artistas
        </h2>
        <div className="sec-sub">
          {cards?.length
            ? `${cards.length} ${cards.length === 1 ? 'artista disponible' : 'artistas disponibles'} para booking.`
            : 'Artistas disponibles para booking.'}
        </div>

        {cards?.length ? (
          <div className="dj-filters">
            <div className="dj-search">
              <label htmlFor="dj-search" className="visually-hidden">
                Buscar DJs
              </label>
              <input
                id="dj-search"
                type="search"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                placeholder="Buscar por nombre, género o ciudad"
                maxLength={60}
                value={q}
                onChange={(e) => updateParam('q', e.target.value.slice(0, 60) || null)}
              />
            </div>
            {chips.length ? (
              <div className="genre-chips" role="group" aria-label="Filtrar por género">
                <button
                  type="button"
                  className="chip chip-btn"
                  aria-pressed={!activeGenre}
                  onClick={() => updateParam('genero', null)}
                >
                  Todos
                </button>
                {chips.map((c) => (
                  <button
                    type="button"
                    key={c.slug}
                    className="chip chip-btn"
                    aria-pressed={activeGenre === c.slug}
                    onClick={() => updateParam('genero', activeGenre === c.slug ? null : c.slug)}
                  >
                    {c.name}
                    <span className="chip-count" aria-hidden="true">
                      {c.count}
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {isPending ? (
          <ul className="dj-grid" aria-busy="true" aria-label="Cargando artistas">
            {Array.from({ length: SKELETONS }, (_, i) => (
              <li key={i} className="skel skel-card" />
            ))}
          </ul>
        ) : isError ? (
          <div className="index-state" role="alert">
            <p>{error instanceof Error ? error.message : 'No pudimos cargar los artistas.'}</p>
            <button type="button" className="btn btn-secondary" onClick={() => void refetch()}>
              Reintentar
            </button>
          </div>
        ) : !cards?.length ? (
          <div className="index-state">
            <p>Pronto verás aquí a nuestros artistas.</p>
          </div>
        ) : !visible.length ? (
          <div className="index-state" role="status">
            <p>No encontramos DJs con esos filtros.</p>
            <button type="button" className="btn btn-secondary" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
        ) : (
          <ul className="dj-grid">
            {visible.map((card) => (
              <li key={card.slug}>
                <DjCard card={card} onPrefetch={onPrefetch} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </PublicShell>
  );
}

export default IndexPage;
