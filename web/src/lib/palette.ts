import { DEFAULT_PALETTE, PALETTE_KEYS, PALETTES, paletteCssVars, type PaletteKey } from '@fersua/shared';
import { useLayoutEffect } from 'react';

export function isPaletteKey(v: unknown): v is PaletteKey {
  return typeof v === 'string' && (PALETTE_KEYS as readonly string[]).includes(v);
}

/** Pone la paleta en un elemento raíz: data-palette + variables en línea. Devuelve la aplicada. */
export function applyPaletteTo(root: HTMLElement, key: unknown): PaletteKey {
  const palette = isPaletteKey(key) ? key : DEFAULT_PALETTE;
  root.dataset.palette = palette;
  for (const [name, value] of Object.entries(paletteCssVars(palette))) {
    root.style.setProperty(name, value);
  }
  return palette;
}

/** Pone la paleta en <html>: data-palette + variables en línea + theme-color. */
export function applyPalette(key: unknown): void {
  if (typeof document === 'undefined') return;
  const palette = applyPaletteTo(document.documentElement, key);
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = PALETTES[palette].themeColor;
}

/** Cada página pública fija su paleta: la del DJ o la de Fersua (SUNSET). */
export function usePalette(key: PaletteKey | undefined | null): void {
  useLayoutEffect(() => {
    applyPalette(key ?? DEFAULT_PALETTE);
  }, [key]);
}
