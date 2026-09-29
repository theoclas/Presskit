import type { PublicEventDto } from '@fersua/shared';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShowItem } from '../src/public/dj/ShowItem';

const base: PublicEventDto = {
  id: 'e1',
  date: '2026-11-14',
  dateLabel: '14 NOV',
  time: null,
  title: null,
  venue: 'Ramasound Garden',
  city: null,
  flyer: null,
  cta: { type: 'WHATSAPP', label: 'Book', url: 'https://wa.me/573505209860?text=Hola' },
};

describe('ShowItem', () => {
  afterEach(cleanup);

  it('muestra la fecha corta y la completa para lectores de pantalla', () => {
    render(<ShowItem event={base} ctaLabel="Book" />);
    expect(screen.getByText('14 NOV').getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('14 de noviembre de 2026')).toBeTruthy();
    expect(screen.getByText('Ramasound Garden')).toBeTruthy();
  });

  it('arma la fecha corta desde YYYY-MM-DD sin correrse un día (sin new Date)', () => {
    render(<ShowItem event={{ ...base, date: '2026-01-01', dateLabel: '' }} ctaLabel="Book" />);
    expect(screen.getByText('01 ENE')).toBeTruthy();
    expect(screen.getByText('1 de enero de 2026')).toBeTruthy();
  });

  it('sin flyer, el botón va directo al CTA con rel seguro', () => {
    render(<ShowItem event={base} ctaLabel="Book" />);
    const link = screen.getByRole('link', { name: 'Book' });
    expect(link.getAttribute('href')).toBe(base.cta!.url);
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('target')).toBe('_blank');
  });

  it('no pinta un CTA que no sea wa.me o https', () => {
    render(<ShowItem event={{ ...base, cta: { type: 'URL', label: 'Info', url: 'javascript:alert(1)' } }} ctaLabel="Book" />);
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('con flyer, "Book" abre el flyer', () => {
    const onOpen = vi.fn();
    const flyer = { id: 'f1', width: 1080, height: 1920, variants: [{ w: 540, h: 960, url: '/media/p/f1/540.webp' }] };
    render(<ShowItem event={{ ...base, flyer }} ctaLabel="Book" onOpenFlyer={onOpen} />);
    fireEvent.click(screen.getByRole('button', { name: 'Book' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
