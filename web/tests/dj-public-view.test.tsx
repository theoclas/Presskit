import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { macflyProfile } from '../src/dev-fixtures/macfly';
import { DjPublicView } from '../src/public/dj/DjPublicView';

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
