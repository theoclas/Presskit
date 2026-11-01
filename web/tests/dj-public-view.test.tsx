import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { macflyProfile } from '../src/dev-fixtures/macfly';
import { DjPublicView } from '../src/public/dj/DjPublicView';
import { HW_GALLERY_THUMBS, packBento } from '../src/public/dj/hyperwave/HyperwaveView';
import { nameSize } from '../src/public/dj/templateKit';

describe('DjPublicView', () => {
  afterEach(cleanup);

  it('pinta la plantilla con los datos del perfil', () => {
    const { container } = render(<DjPublicView dj={macflyProfile} />);
    expect(screen.getByRole('heading', { level: 1, name: macflyProfile.texts.heroTitle })).toBeTruthy();
    expect(container.querySelector('#artistas')).toBeTruthy();
    expect(container.querySelector('#fechas .shows')).toBeTruthy();
    // El formulario y el footer quedan dentro de .shell (arreglo del </div> suelto).
    expect(container.querySelector('.shell #booking')).toBeTruthy();
    expect(container.querySelector('.shell > footer')).toBeTruthy();
    expect(screen.getByText('Disponible')).toBeTruthy();
    const hero = screen.getByRole('link', { name: macflyProfile.texts.heroPrimaryCta });
    expect(hero.getAttribute('href')).toBe(macflyProfile.whatsapp.heroUrl);
  });

  it('las fotos de la galería no se cargan hasta abrir el módulo', () => {
    const { container } = render(<DjPublicView dj={macflyProfile} />);
    expect(container.querySelectorAll('.media-item img').length).toBe(0);
    const photos = screen.getByRole('button', { name: macflyProfile.texts.galleryButton });
    fireEvent.click(photos);
    expect(container.querySelector('#media-module')?.classList.contains('is-visible')).toBe(true);
    expect(container.querySelectorAll('.media-item img').length).toBe(2);
    expect(photos.getAttribute('aria-expanded')).toBe('true');
  });

  it('oculta las secciones apagadas o vacías', () => {
    const dj = {
      ...macflyProfile,
      members: [],
      show: { ...macflyProfile.show, gallery: false, rider: false, form: false, events: false },
    };
    const { container } = render(<DjPublicView dj={dj} />);
    expect(container.querySelector('#media-module')).toBeNull();
    expect(container.querySelector('.hero-mini')).toBeNull();
    expect(container.querySelector('#artistas')).toBeNull();
    expect(container.querySelector('#fechas')).toBeNull();
    expect(container.querySelector('#booking')).toBeNull();
    expect(screen.queryByRole('link', { name: macflyProfile.texts.navBooking })).toBeNull();
  });

  it('muestra el texto sin fechas cuando no hay próximas ni fila "Disponible"', () => {
    render(<DjPublicView dj={{ ...macflyProfile, events: [], show: { ...macflyProfile.show, openDateRow: false } }} />);
    expect(screen.getByText(macflyProfile.texts.eventsEmpty)).toBeTruthy();
  });

  it('con la fila "Disponible" no repite el texto de sin fechas (como la página original)', () => {
    render(<DjPublicView dj={{ ...macflyProfile, events: [] }} />);
    expect(screen.getByText('Disponible')).toBeTruthy();
    expect(screen.queryByText(macflyProfile.texts.eventsEmpty)).toBeNull();
  });

  it('cada integrante conserva el .pill-row vacío de la plantilla antes de sus redes', () => {
    const { container } = render(<DjPublicView dj={macflyProfile} />);
    const cards = container.querySelectorAll('.artist-card');
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      const row = card.querySelector('.pill-row');
      expect(row).toBeTruthy();
      expect(row!.childElementCount).toBe(0);
    }
  });

  it('el texto del DJ se pinta como texto, nunca como HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <DjPublicView dj={{ ...macflyProfile, displayName: evil, texts: { ...macflyProfile.texts, heroTitle: evil } }} />,
    );
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getAllByText(evil).length).toBeGreaterThan(0);
  });
});

describe('DjPublicView con la plantilla Signal', () => {
  afterEach(cleanup);
  const signal = { ...macflyProfile, template: 'SIGNAL' as const };

  it('pinta Signal con el mismo contenido: nombre gigante, story, galería visible y formulario', () => {
    const { container } = render(<DjPublicView dj={signal} />);
    expect(container.querySelector('.djs')).toBeTruthy();
    expect(container.querySelector('.shell')).toBeNull();
    expect(screen.getByRole('heading', { level: 1, name: signal.displayName })).toBeTruthy();
    // El título de la portada pasa a encabezar la historia, con la descripción.
    expect(screen.getByRole('heading', { level: 2, name: signal.texts.heroTitle })).toBeTruthy();
    expect(container.querySelector('#story')?.textContent).toContain(signal.texts.heroSubtitle);
    // La galería se ve sin abrir un módulo; el rider es su propia lista.
    expect(container.querySelectorAll('#galeria .media-item img').length).toBe(signal.gallery.length);
    expect(container.querySelectorAll('#rider li').length).toBe(signal.riderItems.length);
    expect(container.querySelector('#artistas .artist-card')).toBeTruthy();
    expect(container.querySelector('#fechas .shows')).toBeTruthy();
    expect(container.querySelector('#booking form')).toBeTruthy();
    expect(container.querySelector('.hero-mini')).toBeNull();
    const wa = screen.getAllByRole('link', { name: signal.texts.heroPrimaryCta });
    expect(wa[0]!.getAttribute('href')).toBe(signal.whatsapp.heroUrl);
  });

  it('la franja y la etiqueta superior usan la ciudad y los géneros', () => {
    const { container } = render(<DjPublicView dj={signal} />);
    expect(container.querySelector('.sg-eyebrow')?.textContent).toBe(`${signal.texts.heroLabel} / Medellín`);
    const ticker = container.querySelector('.sg-ticker');
    expect(ticker?.getAttribute('aria-hidden')).toBe('true');
    expect(ticker?.textContent).toContain('Medellín');
    expect(ticker?.textContent).toContain('Tech House');
  });

  it('el menú del teléfono abre y cierra, y oculta lo que no hay', () => {
    const dj = { ...signal, members: [], show: { ...signal.show, events: false } };
    const { container } = render(<DjPublicView dj={dj} />);
    const toggle = screen.getByRole('button', { name: 'Abrir menú' });
    const menu = container.querySelector('#sg-menu') as HTMLElement;
    expect(menu.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(menu.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const labels = [...menu.querySelectorAll('a')].map((a) => a.textContent);
    expect(labels).not.toContain(dj.texts.navArtists);
    expect(labels).not.toContain(dj.texts.navEvents);
    expect(labels).toContain(dj.texts.navBooking);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu.hidden).toBe(true);
  });

  it('pone data-template en <html> mientras se ve y lo quita al salir', () => {
    const { unmount } = render(<DjPublicView dj={signal} />);
    expect(document.documentElement.dataset.template).toBe('SIGNAL');
    unmount();
    expect(document.documentElement.dataset.template).toBeUndefined();
  });

  it('sin descripción no hay sección story, y el texto del DJ nunca es HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const { container } = render(
      <DjPublicView dj={{ ...signal, displayName: evil, texts: { ...signal.texts, heroSubtitle: '' } }} />,
    );
    expect(container.querySelector('#story')).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getAllByText(evil).length).toBeGreaterThan(0);
  });

  it('el nombre gigante se achica según su largo', () => {
    expect(nameSize('Solomun')).toBe('xl');
    expect(nameSize('Mike Bran & Macfly')).toBe('l');
    expect(nameSize('Los del barrio sound system')).toBe('m');
    expect(nameSize('Un nombre artístico larguísimo de verdad')).toBe('s');
  });
});

describe('DjPublicView con la plantilla Neon Groove', () => {
  afterEach(cleanup);
  const soundcloud = { platform: 'SOUNDCLOUD' as const, label: 'SoundCloud', url: 'https://soundcloud.com/macflymikebran' };
  const groove = { ...macflyProfile, template: 'GROOVE' as const, socials: [soundcloud] };
  const manyEvents = Array.from({ length: 5 }, (_, i) => ({ ...macflyProfile.events[0]!, id: `e${i}`, venue: `Club ${i}` }));

  it('pinta Groove con el mismo contenido: nombre con el «&» de acento, biografía, fechas y formulario', () => {
    const { container } = render(<DjPublicView dj={groove} />);
    expect(container.querySelector('.djg')).toBeTruthy();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe(groove.displayName);
    expect(h1.querySelector('.gv-amp')?.textContent).toBe('&');
    expect(container.querySelector('.gv-eyebrow')?.textContent).toBe(`${groove.texts.heroTitle} · Medellín`);
    expect(screen.getByRole('heading', { level: 2, name: groove.texts.bioTitle })).toBeTruthy();
    expect(container.querySelector('#bio')?.textContent).toContain(groove.texts.heroSubtitle);
    expect(container.querySelector('.gv-dates #fechas .shows')).toBeTruthy();
    expect(container.querySelectorAll('#galeria .media-item img').length).toBe(groove.gallery.length);
    expect(container.querySelectorAll('#rider li').length).toBe(groove.riderItems.length);
    expect(container.querySelector('#booking form')).toBeTruthy();
  });

  it('«Escuchar ahora» abre la red de música del perfil; sin ella, el segundo botón es WhatsApp', () => {
    render(<DjPublicView dj={groove} />);
    const listen = screen.getByRole('link', { name: groove.texts.listenCta });
    expect(listen.getAttribute('href')).toBe(soundcloud.url);
    expect(listen.getAttribute('target')).toBe('_blank');
    cleanup();
    render(<DjPublicView dj={{ ...groove, socials: [] }} />);
    expect(screen.queryByRole('link', { name: groove.texts.listenCta })).toBeNull();
    const wa = screen.getAllByRole('link', { name: groove.texts.heroPrimaryCta });
    expect(wa[0]!.getAttribute('href')).toBe(groove.whatsapp.heroUrl);
  });

  it('el botón principal va al formulario; sin formulario, a WhatsApp', () => {
    const { container } = render(<DjPublicView dj={groove} />);
    expect(container.querySelector('.gv-btn--primary')?.getAttribute('href')).toBe('#booking');
    cleanup();
    const noForm = render(<DjPublicView dj={{ ...groove, show: { ...groove.show, form: false } }} />);
    expect(noForm.container.querySelector('.gv-btn--primary')?.getAttribute('href')).toBe(groove.whatsapp.heroUrl);
  });

  it('con más de 3 fechas, la tarjeta se resume y «Ver las N fechas» la despliega', () => {
    const { container } = render(<DjPublicView dj={{ ...groove, events: manyEvents }} />);
    const card = container.querySelector('.gv-dates')!;
    const more = screen.getByRole('button', { name: 'Ver las 5 fechas' });
    expect(card.classList.contains('is-expanded')).toBe(false);
    fireEvent.click(more);
    expect(card.classList.contains('is-expanded')).toBe(true);
    expect(more.getAttribute('aria-expanded')).toBe('true');
    expect(more.textContent).toBe('Ver menos');
  });

  it('los accesos rápidos solo enlazan lo que existe', () => {
    const { container } = render(<DjPublicView dj={{ ...groove, socials: [], show: { ...groove.show, rider: false } }} />);
    const tiles = [...container.querySelectorAll('.gv-tile')].map((a) => a.getAttribute('href'));
    expect(tiles).toEqual(['#bio', '#galeria']);
  });

  it('pone data-template en <html> y el texto del DJ nunca es HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const { container, unmount } = render(
      <DjPublicView dj={{ ...groove, displayName: `${evil} & co`, texts: { ...groove.texts, heroSubtitle: evil } }} />,
    );
    expect(document.documentElement.dataset.template).toBe('GROOVE');
    expect(container.querySelector('img[src="x"]')).toBeNull();
    unmount();
    expect(document.documentElement.dataset.template).toBeUndefined();
  });
});

describe('opciones de las plantillas', () => {
  afterEach(cleanup);

  it('Signal viene en blanco y negro; con monoPhotos apagado muestra las fotos a color', () => {
    const { container } = render(<DjPublicView dj={{ ...macflyProfile, template: 'SIGNAL' }} />);
    expect(container.querySelector('.djs')?.classList.contains('djs--color')).toBe(false);
    cleanup();
    const color = render(<DjPublicView dj={{ ...macflyProfile, template: 'SIGNAL', monoPhotos: false }} />);
    expect(color.container.querySelector('.djs')?.classList.contains('djs--color')).toBe(true);
  });

  it('Neon Groove: portada dividida con la foto enmarcada y los géneros como pastillas', () => {
    const { container } = render(<DjPublicView dj={{ ...macflyProfile, template: 'GROOVE' }} />);
    expect(container.querySelector('.gv-hero-grid .gv-hero-text h1')).toBeTruthy();
    expect(container.querySelector('.gv-hero-grid .gv-hero-visual .gv-frame img')).toBeTruthy();
    const pills = [...container.querySelectorAll('.gv-genres li')].map((li) => li.textContent);
    expect(pills).toEqual(macflyProfile.genres.map((g) => g.name));
  });
});

describe('DjPublicView con la plantilla Editorial Noir', () => {
  afterEach(cleanup);
  const soundcloud = { platform: 'SOUNDCLOUD' as const, label: 'SoundCloud', url: 'https://soundcloud.com/macflymikebran' };
  const spotify = { platform: 'SPOTIFY' as const, label: 'Spotify', url: 'https://open.spotify.com/artist/abc' };
  const noir = { ...macflyProfile, template: 'NOIR' as const, socials: [spotify, soundcloud] };

  it('pinta Noir con el mismo contenido: nombre con el «&» pegado a la palabra siguiente, bio, galería, fechas y formulario', () => {
    const { container } = render(<DjPublicView dj={noir} />);
    expect(container.querySelector('.djn')).toBeTruthy();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.textContent).toBe(noir.displayName);
    expect(h1.querySelector('.nr-amp-group')?.textContent).toBe('& Macfly');
    expect(container.querySelector('.nr-subline')?.textContent).toBe(`${noir.texts.heroLabel} / ${noir.texts.heroTitle}`);
    expect(container.querySelector('#bio')?.textContent).toContain(noir.texts.heroSubtitle);
    expect(container.querySelectorAll('.nr-collage img').length).toBe(2);
    expect(container.querySelectorAll('#galeria .media-item img').length).toBe(noir.gallery.length);
    expect(container.querySelector('.nr-band #fechas .shows')).toBeTruthy();
    expect(container.querySelectorAll('#rider li').length).toBe(noir.riderItems.length);
    expect(container.querySelector('#booking form')).toBeTruthy();
  });

  it('la sección de música enlaza las plataformas en orden de preferencia; sin ellas no aparece', () => {
    const { container } = render(<DjPublicView dj={noir} />);
    const links = [...container.querySelectorAll('#musica .nr-music-link')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([soundcloud.url, spotify.url]);
    expect(screen.getByRole('link', { name: noir.texts.listenCta }).getAttribute('href')).toBe(soundcloud.url);
    cleanup();
    const none = render(<DjPublicView dj={{ ...noir, socials: [] }} />);
    expect(none.container.querySelector('#musica')).toBeNull();
    expect(screen.queryByRole('link', { name: noir.texts.listenCta })).toBeNull();
  });

  it('pone data-template en <html> y el texto del DJ nunca es HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const { container, unmount } = render(
      <DjPublicView dj={{ ...noir, displayName: `${evil} & co`, texts: { ...noir.texts, heroSubtitle: evil } }} />,
    );
    expect(document.documentElement.dataset.template).toBe('NOIR');
    expect(container.querySelector('img[src="x"]')).toBeNull();
    unmount();
    expect(document.documentElement.dataset.template).toBeUndefined();
  });
});

describe('DjPublicView con la plantilla Hyperwave (mosaico)', () => {
  afterEach(cleanup);
  const soundcloud = { platform: 'SOUNDCLOUD' as const, label: 'SoundCloud', url: 'https://soundcloud.com/macflymikebran' };
  const instagram = { platform: 'INSTAGRAM' as const, label: 'Instagram', url: 'https://www.instagram.com/macflymikebran/' };
  const hyper = { ...macflyProfile, template: 'HYPERWAVE' as const, socials: [instagram, soundcloud] };

  it('el mosaico nunca deja huecos: cada fila suma el ancho completo', () => {
    const rows = (spans: number[], cols: number) => {
      const sums: number[] = [];
      let acc = 0;
      for (const s of spans) {
        acc += s;
        if (acc === cols) {
          sums.push(acc);
          acc = 0;
        }
      }
      return { sums, rest: acc };
    };
    for (const input of [[5, 3, 4, 7, 5, 8, 4, 4, 12], [5, 3, 7, 5, 8, 4, 12], [5, 12], [7], [3, 3, 3], [8, 8, 8]]) {
      const out = packBento(input, 12);
      expect(rows(out, 12).rest).toBe(0);
      out.forEach((s, i) => expect(s).toBeGreaterThanOrEqual(Math.min(input[i]!, 12)));
    }
    expect(packBento([5, 3, 7, 5, 8, 4, 12], 12)).toEqual([5, 7, 7, 5, 8, 4, 12]);
    expect(packBento([1, 2, 1, 1], 2)).toEqual([2, 2, 1, 1]);
  });

  it('pinta todo en tarjetas: nombre, botones, bio, cifras, música, galería, fechas, artistas, rider, redes y formulario', () => {
    const { container } = render(<DjPublicView dj={hyper} />);
    expect(container.querySelector('.djh')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(hyper.displayName);
    for (const sel of ['.hw-photo', '.hw-name', '.hw-cta', '#bio', '.hw-stats', '#musica', '#galeria', '.hw-dates #fechas', '#artistas', '#rider', '.hw-socials', '#booking form']) {
      expect(container.querySelector(sel), sel).toBeTruthy();
    }
    // Cada celda lleva su ancho calculado.
    const cells = [...container.querySelectorAll<HTMLElement>('.hw-cell')];
    const total = cells.reduce((n, c) => n + Number(c.style.getPropertyValue('--span-lg')), 0);
    expect(total % 12).toBe(0);
    expect(screen.getByRole('link', { name: hyper.texts.listenCta }).getAttribute('href')).toBe(soundcloud.url);
  });

  it('la galería muestra 4 miniaturas, la última con «+N», y abre el visor', () => {
    const many = Array.from({ length: 7 }, (_, i) => ({ ...macflyProfile.gallery[0]!, id: `g${i}` }));
    const { container } = render(<DjPublicView dj={{ ...hyper, gallery: many }} />);
    const thumbs = container.querySelectorAll('.hw-thumb');
    expect(thumbs.length).toBe(HW_GALLERY_THUMBS);
    expect(container.querySelector('.hw-thumb-more')?.textContent).toBe('+3');
    fireEvent.click(thumbs[0]!);
    expect(container.querySelector('dialog.lightbox')).toBeTruthy();
  });

  it('sin redes ni galería, esas tarjetas no aparecen y el mosaico sigue completo', () => {
    const { container } = render(<DjPublicView dj={{ ...hyper, socials: [], show: { ...hyper.show, gallery: false } }} />);
    expect(container.querySelector('#musica')).toBeNull();
    expect(container.querySelector('.hw-socials')).toBeNull();
    expect(container.querySelector('#galeria')).toBeNull();
    const cells = [...container.querySelectorAll<HTMLElement>('.hw-cell')];
    expect(cells.reduce((n, c) => n + Number(c.style.getPropertyValue('--span-lg')), 0) % 12).toBe(0);
  });

  it('pone data-template en <html> y el texto del DJ nunca es HTML', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const { container, unmount } = render(<DjPublicView dj={{ ...hyper, displayName: evil, texts: { ...hyper.texts, heroSubtitle: evil } }} />);
    expect(document.documentElement.dataset.template).toBe('HYPERWAVE');
    expect(container.querySelector('img[src="x"]')).toBeNull();
    unmount();
    expect(document.documentElement.dataset.template).toBeUndefined();
  });
});
