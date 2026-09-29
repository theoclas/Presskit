import type { SocialPlatform } from '@fersua/shared';
import {
  siApplemusic,
  siBandcamp,
  siBeatport,
  siFacebook,
  siInstagram,
  siLinktree,
  siMixcloud,
  siSoundcloud,
  siSpotify,
  siThreads,
  siTiktok,
  siTwitch,
  siWhatsapp,
  siX,
  siYoutube,
} from 'simple-icons';

// Íconos de Simple Icons (CC0). Solo se importan los de la lista fija de plataformas.
// Resident Advisor no está en Simple Icons y el sitio web usa un globo genérico.
const GLOBE =
  'M12 0a12 12 0 1 0 0 24 12 12 0 0 0 0-24Zm7.93 7h-3.2a18.6 18.6 0 0 0-1.53-4.8A10.04 10.04 0 0 1 19.93 7ZM12 2.04c.9 1.2 1.9 3.02 2.46 4.96H9.54C10.1 5.06 11.1 3.24 12 2.04ZM2.26 14a9.9 9.9 0 0 1 0-4h3.6a20.4 20.4 0 0 0 0 4h-3.6Zm.81 2h3.2c.36 1.72.9 3.36 1.53 4.8A10.04 10.04 0 0 1 3.07 16Zm3.2-9h-3.2A10.04 10.04 0 0 1 7.8 2.2 18.6 18.6 0 0 0 6.27 7ZM12 21.96c-.9-1.2-1.9-3.02-2.46-4.96h4.92c-.56 1.94-1.56 3.76-2.46 4.96ZM14.8 15H9.2a18.3 18.3 0 0 1 0-6h5.6a18.3 18.3 0 0 1 0 6Zm.4 5.8c.63-1.44 1.17-3.08 1.53-4.8h3.2a10.04 10.04 0 0 1-4.73 4.8ZM18.14 14a20.4 20.4 0 0 0 0-4h3.6a9.9 9.9 0 0 1 0 4h-3.6Z';
const RA =
  'M3 3h18v18H3V3Zm3 4v10h2.4v-3.6h1.2L11.8 17h2.8l-2.5-3.9A3.2 3.2 0 0 0 10.2 7H6Zm2.4 2.1h1.7a1.2 1.2 0 0 1 0 2.4H8.4V9.1ZM15.6 7l-1.1 3h2.2l1.4 4.1V17H20V7h-4.4Z';

const PATHS: Record<SocialPlatform, string> = {
  INSTAGRAM: siInstagram.path,
  SOUNDCLOUD: siSoundcloud.path,
  SPOTIFY: siSpotify.path,
  TIKTOK: siTiktok.path,
  YOUTUBE: siYoutube.path,
  FACEBOOK: siFacebook.path,
  BEATPORT: siBeatport.path,
  MIXCLOUD: siMixcloud.path,
  RESIDENT_ADVISOR: RA,
  X: siX.path,
  WHATSAPP: siWhatsapp.path,
  APPLE_MUSIC: siApplemusic.path,
  BANDCAMP: siBandcamp.path,
  TWITCH: siTwitch.path,
  THREADS: siThreads.path,
  LINKTREE: siLinktree.path,
  WEBSITE: GLOBE,
};

/**
 * Decorativo: el enlace siempre lleva su texto visible, así que el ícono va oculto al lector.
 * `size` (px) es para fuera de la página pública (el editor), donde no aplica el CSS de .djp.
 */
export function SocialIcon({ platform, size }: { platform: SocialPlatform; size?: number }) {
  const d = PATHS[platform] ?? GLOBE;
  return (
    <svg
      className="si"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      {...(size ? { width: size, height: size, fill: 'currentColor', style: { flex: 'none' } } : {})}
    >
      <path d={d} />
    </svg>
  );
}
