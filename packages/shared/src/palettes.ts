import type { PaletteKey } from './enums';

// Paletas predefinidas. La web las aplica como variables CSS sobre la plantilla;
// SUNSET es la naranja/rosa de la página original de Mac Fly & Mike Bran.
export interface Palette {
  name: string;
  bg: string;
  bgSoft: string;
  card: string;
  muted: string;
  text: string;
  accent: string;
  accent2: string;
  border: string;
  /** Canales RGB separados por espacio, para rgb(var(--x-rgb) / .25). */
  accentRgb: string;
  accent2Rgb: string;
  surfaceRgb: string;
  lineRgb: string;
  textRgb: string;
  /** Texto sobre el degradado de acento (botón principal, pestaña activa). */
  onAccent: string;
  themeColor: string;
}

export const DEFAULT_PALETTE: PaletteKey = 'SUNSET';

export const PALETTES: Record<PaletteKey, Palette> = {
  SUNSET: {
    name: 'Sunset (naranja/rosa)',
    bg: '#020617',
    bgSoft: '#0b1120',
    card: 'rgba(15,23,42,.98)',
    muted: '#9ca3af',
    text: '#f9fafb',
    accent: '#f97316',
    accent2: '#ec4899',
    border: 'rgba(148,163,184,.55)',
    accentRgb: '249 115 22',
    accent2Rgb: '236 72 153',
    surfaceRgb: '15 23 42',
    lineRgb: '148 163 184',
    textRgb: '248 250 252',
    onAccent: '#ffffff',
    // El de la página original (barra del navegador en Android), no el color del fondo.
    themeColor: '#0f172a',
  },
  MIAMI: {
    name: 'Miami (rosa/violeta)',
    bg: '#0b0614',
    bgSoft: '#140b24',
    card: 'rgba(26,16,46,.98)',
    muted: '#a8a3c2',
    text: '#faf5ff',
    accent: '#ec4899',
    accent2: '#8b5cf6',
    border: 'rgba(167,139,250,.45)',
    accentRgb: '236 72 153',
    accent2Rgb: '139 92 246',
    surfaceRgb: '26 16 46',
    lineRgb: '167 139 250',
    textRgb: '250 245 255',
    onAccent: '#ffffff',
    themeColor: '#0b0614',
  },
  NEON: {
    name: 'Neón (cian/violeta)',
    bg: '#020617',
    bgSoft: '#0b1120',
    card: 'rgba(15,23,42,.98)',
    muted: '#9ca3af',
    text: '#f9fafb',
    accent: '#22d3ee',
    accent2: '#a855f7',
    border: 'rgba(148,163,184,.55)',
    accentRgb: '34 211 238',
    accent2Rgb: '168 85 247',
    surfaceRgb: '15 23 42',
    lineRgb: '148 163 184',
    textRgb: '248 250 252',
    onAccent: '#020617',
    themeColor: '#020617',
  },
  ACID: {
    name: 'Acid (lima/esmeralda)',
    bg: '#09090b',
    bgSoft: '#111113',
    card: 'rgba(24,24,27,.98)',
    muted: '#a1a1aa',
    text: '#fafafa',
    accent: '#a3e635',
    accent2: '#10b981',
    border: 'rgba(161,161,170,.5)',
    accentRgb: '163 230 53',
    accent2Rgb: '16 185 129',
    surfaceRgb: '24 24 27',
    lineRgb: '161 161 170',
    textRgb: '250 250 250',
    onAccent: '#09090b',
    themeColor: '#09090b',
  },
  INFERNO: {
    name: 'Inferno (rojo/ámbar)',
    bg: '#0a0a0a',
    bgSoft: '#141414',
    card: 'rgba(23,23,23,.98)',
    muted: '#a3a3a3',
    text: '#fafafa',
    accent: '#ef4444',
    accent2: '#f59e0b',
    border: 'rgba(163,163,163,.5)',
    accentRgb: '239 68 68',
    accent2Rgb: '245 158 11',
    surfaceRgb: '23 23 23',
    lineRgb: '163 163 163',
    textRgb: '250 250 250',
    onAccent: '#0a0a0a',
    themeColor: '#0a0a0a',
  },
  OCEAN: {
    name: 'Océano (azul/turquesa)',
    bg: '#020617',
    bgSoft: '#0a1628',
    card: 'rgba(15,23,42,.98)',
    muted: '#94a3b8',
    text: '#f8fafc',
    accent: '#3b82f6',
    accent2: '#14b8a6',
    border: 'rgba(148,163,184,.55)',
    accentRgb: '59 130 246',
    accent2Rgb: '20 184 166',
    surfaceRgb: '15 23 42',
    lineRgb: '148 163 184',
    textRgb: '248 250 252',
    onAccent: '#020617',
    themeColor: '#020617',
  },
  GOLD: {
    name: 'Oro (ámbar/dorado)',
    bg: '#0c0a09',
    bgSoft: '#1c1917',
    card: 'rgba(28,25,23,.98)',
    muted: '#a8a29e',
    text: '#fafaf9',
    accent: '#f59e0b',
    accent2: '#eab308',
    border: 'rgba(168,162,158,.5)',
    accentRgb: '245 158 11',
    accent2Rgb: '234 179 8',
    surfaceRgb: '28 25 23',
    lineRgb: '168 162 158',
    textRgb: '250 250 249',
    onAccent: '#0c0a09',
    themeColor: '#0c0a09',
  },
  MONO: {
    name: 'Mono (blanco/gris)',
    bg: '#000000',
    bgSoft: '#0a0a0a',
    card: 'rgba(23,23,23,.98)',
    muted: '#a3a3a3',
    text: '#fafafa',
    accent: '#fafafa',
    accent2: '#a3a3a3',
    border: 'rgba(163,163,163,.45)',
    accentRgb: '250 250 250',
    accent2Rgb: '163 163 163',
    surfaceRgb: '23 23 23',
    lineRgb: '163 163 163',
    textRgb: '250 250 250',
    onAccent: '#0a0a0a',
    themeColor: '#000000',
  },
};

/** Variables CSS de una paleta, para aplicarlas en un contenedor o en <html>. */
export function paletteCssVars(key: PaletteKey): Record<string, string> {
  const p = PALETTES[key] ?? PALETTES[DEFAULT_PALETTE];
  return {
    '--bg': p.bg,
    '--bg-soft': p.bgSoft,
    '--card': p.card,
    '--muted': p.muted,
    '--text': p.text,
    '--accent': p.accent,
    '--accent-2': p.accent2,
    '--border': p.border,
    '--accent-rgb': p.accentRgb,
    '--accent-2-rgb': p.accent2Rgb,
    '--surface-rgb': p.surfaceRgb,
    '--line-rgb': p.lineRgb,
    '--text-rgb': p.textRgb,
    '--on-accent': p.onAccent,
  };
}
