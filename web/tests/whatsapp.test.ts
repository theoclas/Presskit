import { afterEach, describe, expect, it, vi } from 'vitest';
import { isInAppBrowser, isWhatsappUrl, openWhatsApp } from '../src/lib/whatsapp';

describe('openWhatsApp', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    'https://evil.example.com/?u=https://wa.me/573001234567',
    'http://wa.me/573001234567',
    'javascript:alert(1)',
    'https://wa.me.evil.com/573001234567',
    'https://wa.me/573001234567#x',
    'https://wa.me/abc',
    '',
  ])('rechaza %s sin abrir nada', (url) => {
    const open = vi.spyOn(window, 'open');
    expect(openWhatsApp(url)).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('abre una URL de wa.me válida en otra pestaña', () => {
    const win = { opener: {} as unknown } as Window;
    const open = vi.spyOn(window, 'open').mockReturnValue(win);
    const url = 'https://wa.me/573505209860?text=Hola%20quiero%20booking';
    expect(openWhatsApp(url)).toBe(true);
    expect(open).toHaveBeenCalledWith(url, '_blank');
    expect(win.opener).toBeNull();
  });

  it('valida con WA_URL_RE', () => {
    expect(isWhatsappUrl('https://wa.me/573505209860')).toBe(true);
    expect(isWhatsappUrl('https://wa.me/573505209860?text=a%20b')).toBe(true);
    expect(isWhatsappUrl(null)).toBe(false);
  });

  it('detecta los navegadores internos de Instagram y Facebook', () => {
    expect(isInAppBrowser('Mozilla/5.0 (iPhone) Instagram 300.0')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 [FBAN/FBIOS;FBAV/400.0]')).toBe(true);
    expect(isInAppBrowser('Mozilla/5.0 (Windows NT 10.0) Chrome/130')).toBe(false);
  });
});
