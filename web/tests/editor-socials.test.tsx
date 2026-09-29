import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  checkSocialInput,
  SocialLinksEditor,
  validateSocialRows,
  type SocialRow,
} from '../src/editor-kit/SocialLinksEditor';

beforeAll(() => {
  if (!window.matchMedia) {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }),
    });
  }
});

// AntD deja timers cortos (errores del Form, botones): se dejan correr antes de desmontar el entorno.
afterEach(async () => {
  cleanup();
  await new Promise((r) => setTimeout(r, 30));
});

const row = (platform: SocialRow['platform'], url: string, uid = `u-${url}`): SocialRow => ({ uid, platform, url, label: '' });

describe('checkSocialInput', () => {
  it.each([
    ['https://evil.com/macfly'],
    ['https://instagram.com.evil.com/macfly'],
    ['https://evilinstagram.com/macfly'],
    ['https://user:pass@instagram.com/macfly'],
    ['https://instagram.com:8443/macfly'],
    ['javascript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['https://127.0.0.1/x'],
  ])('rechaza %s para Instagram', (url) => {
    const r = checkSocialInput('INSTAGRAM', url);
    expect(r.ok).toBe(false);
  });

  it('explica que el enlace no es de esa red', () => {
    expect(checkSocialInput('INSTAGRAM', 'https://evil.com/macfly')).toEqual({
      ok: false,
      message: 'Ese enlace no es de esta red social.',
    });
  });

  it('el sitio web tampoco acepta hosts locales ni IPs', () => {
    expect(checkSocialInput('WEBSITE', 'http://localhost:3000').ok).toBe(false);
    expect(checkSocialInput('WEBSITE', 'https://10.0.0.1/admin').ok).toBe(false);
    expect(checkSocialInput('WEBSITE', 'https://macfly.co')).toEqual({ ok: true, url: 'https://macfly.co/' });
  });

  it('convierte @usuario y quita parámetros de rastreo', () => {
    expect(checkSocialInput('INSTAGRAM', '@macflymikebran')).toEqual({
      ok: true,
      url: 'https://www.instagram.com/macflymikebran/',
    });
    expect(checkSocialInput('SOUNDCLOUD', 'http://soundcloud.com/macfly?utm_source=x&si=abc')).toEqual({
      ok: true,
      url: 'https://soundcloud.com/macfly',
    });
  });

  it('pide elegir la red y escribir algo', () => {
    expect(checkSocialInput(null, 'https://instagram.com/x')).toEqual({ ok: false, message: 'Elige la red social.' });
    expect(checkSocialInput('INSTAGRAM', '   ').ok).toBe(false);
  });
});

describe('validateSocialRows', () => {
  it('devuelve solo enlaces normalizados y marca las filas malas', () => {
    const rows = [row('INSTAGRAM', '@macfly', 'a'), row('TIKTOK', 'https://evil.com/x', 'b')];
    const r = validateSocialRows(rows, 10);
    expect(r.links).toEqual([{ platform: 'INSTAGRAM', url: 'https://www.instagram.com/macfly/', label: null }]);
    expect(Object.keys(r.errors)).toEqual(['b']);
  });

  it('una fila por red (el sitio web admite 2) y sin enlaces repetidos', () => {
    const dupPlatform = validateSocialRows([row('INSTAGRAM', '@a', 'a'), row('INSTAGRAM', '@b', 'b')], 10);
    expect(dupPlatform.errors.b).toBe('Esta red ya está en la lista.');
    const websites = validateSocialRows([row('WEBSITE', 'https://a.co', 'a'), row('WEBSITE', 'https://b.co', 'b')], 10);
    expect(websites.errors).toEqual({});
    const dupUrl = validateSocialRows([row('WEBSITE', 'https://a.co', 'a'), row('WEBSITE', 'https://a.co/', 'b')], 10);
    expect(dupUrl.errors.b).toBe('Este enlace está repetido.');
  });

  it('respeta el máximo', () => {
    const rows = [row('INSTAGRAM', '@a', 'a'), row('TIKTOK', '@b', 'b')];
    expect(validateSocialRows(rows, 1).errors.b).toBe('Máximo 1 redes.');
  });
});

describe('SocialLinksEditor', () => {
  it('muestra el error en vivo para un host que no es de la red', () => {
    render(<SocialLinksEditor value={[row('INSTAGRAM', 'https://instagram.evil.com/macfly')]} onChange={vi.fn()} />);
    expect(screen.getByText('Ese enlace no es de esta red social.')).toBeTruthy();
  });

  it('muestra cómo quedará guardado un @usuario válido', () => {
    render(<SocialLinksEditor value={[row('TIKTOK', '@macfly')]} onChange={vi.fn()} />);
    expect(screen.getByText('Se guardará como: https://www.tiktok.com/@macfly')).toBeTruthy();
  });

  it('deshabilita «Agregar red» al llegar al máximo', () => {
    render(<SocialLinksEditor value={[row('INSTAGRAM', '@a', 'a')]} onChange={vi.fn()} max={1} />);
    const add = screen.getByRole('button', { name: /Agregar red/ });
    expect((add as HTMLButtonElement).disabled).toBe(true);
  });
});
