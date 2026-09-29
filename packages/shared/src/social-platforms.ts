import type { SocialPlatform } from './enums';
import { LIMITS } from './limits';

interface PlatformDef {
  label: string;
  /** '*' = cualquier dominio público (sitio web). */
  hosts: readonly string[] | '*';
  hostSuffix?: string;
  /** Si se escribe '@usuario', cómo se arma la URL. */
  handleUrl?: (handle: string) => string;
  pathPattern?: RegExp;
  extraStrip?: readonly string[];
}

export const SOCIAL_PLATFORMS: Record<SocialPlatform, PlatformDef> = {
  INSTAGRAM: {
    label: 'Instagram',
    hosts: ['instagram.com', 'www.instagram.com'],
    handleUrl: (h) => `https://www.instagram.com/${h}/`,
  },
  SOUNDCLOUD: {
    label: 'SoundCloud',
    hosts: ['soundcloud.com', 'www.soundcloud.com', 'm.soundcloud.com', 'on.soundcloud.com'],
    handleUrl: (h) => `https://soundcloud.com/${h}`,
    extraStrip: ['p', 'c'],
  },
  SPOTIFY: { label: 'Spotify', hosts: ['open.spotify.com', 'spotify.link'] },
  TIKTOK: {
    label: 'TikTok',
    hosts: ['tiktok.com', 'www.tiktok.com', 'vm.tiktok.com'],
    handleUrl: (h) => `https://www.tiktok.com/@${h}`,
  },
  YOUTUBE: {
    label: 'YouTube',
    hosts: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be'],
  },
  FACEBOOK: { label: 'Facebook', hosts: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.me', 'fb.com'] },
  BEATPORT: { label: 'Beatport', hosts: ['beatport.com', 'www.beatport.com'] },
  MIXCLOUD: { label: 'Mixcloud', hosts: ['mixcloud.com', 'www.mixcloud.com', 'm.mixcloud.com'] },
  RESIDENT_ADVISOR: {
    label: 'Resident Advisor',
    hosts: ['ra.co', 'www.ra.co', 'residentadvisor.net', 'www.residentadvisor.net'],
  },
  X: {
    label: 'X',
    hosts: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
    handleUrl: (h) => `https://x.com/${h}`,
  },
  WHATSAPP: { label: 'WhatsApp', hosts: ['wa.me'], pathPattern: /^\/\d{8,15}$/ },
  APPLE_MUSIC: { label: 'Apple Music', hosts: ['music.apple.com'] },
  BANDCAMP: { label: 'Bandcamp', hosts: ['bandcamp.com'], hostSuffix: '.bandcamp.com' },
  TWITCH: { label: 'Twitch', hosts: ['twitch.tv', 'www.twitch.tv'], handleUrl: (h) => `https://www.twitch.tv/${h}` },
  THREADS: {
    label: 'Threads',
    hosts: ['threads.net', 'www.threads.net', 'threads.com', 'www.threads.com'],
    handleUrl: (h) => `https://www.threads.com/@${h}`,
  },
  LINKTREE: { label: 'Linktree', hosts: ['linktr.ee'], handleUrl: (h) => `https://linktr.ee/${h}` },
  WEBSITE: { label: 'Sitio web', hosts: '*' },
};

const TRACKING_PARAMS = ['si', 'igsh', 'igshid', 'fbclid', 'gclid', 'ref', 'ref_src', 'feature', 'share', 'mibextid'];
const HANDLE_RE = /^@?([A-Za-z0-9._-]{1,40})$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

export type SocialUrlError = 'INVALID_URL' | 'HOST_NOT_ALLOWED' | 'NOT_HTTPS' | 'TOO_LONG';

export type SocialUrlResult = { ok: true; url: string } | { ok: false; error: SocialUrlError };

/** Hostname público: sin IP literal, sin localhost, con TLD. */
export function isPublicHostname(host: string): boolean {
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return false;
  if (IPV4_RE.test(host) || host.includes(':') || host.startsWith('[')) return false;
  return /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host);
}

/**
 * Normaliza y valida una URL de red social. Acepta '@usuario' en las redes que lo permiten.
 * Siempre devuelve https, sin puerto, sin credenciales y sin parámetros de rastreo.
 */
export function normalizeSocialUrl(platform: SocialPlatform, raw: string): SocialUrlResult {
  const def = SOCIAL_PLATFORMS[platform];
  let input = raw.trim();
  if (!input) return { ok: false, error: 'INVALID_URL' };

  const handle = HANDLE_RE.exec(input);
  if (handle && def.handleUrl && !input.includes('.')) {
    input = def.handleUrl(handle[1]!);
  } else if (handle && def.handleUrl && input.startsWith('@')) {
    input = def.handleUrl(handle[1]!);
  }

  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) input = `https://${input}`;

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return { ok: false, error: 'INVALID_URL' };
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:') return { ok: false, error: 'NOT_HTTPS' };
  if (url.username || url.password || url.port) return { ok: false, error: 'INVALID_URL' };

  const host = url.hostname.toLowerCase();
  if (!isPublicHostname(host)) return { ok: false, error: 'HOST_NOT_ALLOWED' };
  if (def.hosts !== '*') {
    const allowed = def.hosts.includes(host) || (def.hostSuffix ? host.endsWith(def.hostSuffix) : false);
    if (!allowed) return { ok: false, error: 'HOST_NOT_ALLOWED' };
  }
  if (def.pathPattern && !def.pathPattern.test(url.pathname)) return { ok: false, error: 'INVALID_URL' };

  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || TRACKING_PARAMS.includes(key) || def.extraStrip?.includes(key)) {
      url.searchParams.delete(key);
    }
  }
  url.hash = '';
  url.hostname = host;
  const out = url.toString();
  if (out.length > LIMITS.social.urlMax) return { ok: false, error: 'TOO_LONG' };
  return { ok: true, url: out };
}

/** URL https genérica (enlaces de boletas, sitio web del evento). */
export function normalizeHttpsUrl(raw: string, maxLen: number = LIMITS.events.ctaUrlMax): SocialUrlResult {
  const r = normalizeSocialUrl('WEBSITE', raw);
  if (r.ok && r.url.length > maxLen) return { ok: false, error: 'TOO_LONG' };
  return r;
}
