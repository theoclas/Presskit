import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { macflyProfile } from '../src/dev-fixtures/macfly';
import { DjPublicView } from '../src/public/dj/DjPublicView';
import { nameSize } from '../src/public/dj/signal/SignalView';

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
