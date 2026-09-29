// Defensa extra en el navegador: el api ya normaliza las URLs, pero nunca se pinta un href
// que no sea https (evita javascript:, data:, http: si algo se colara).

export function safeHttpsUrl(url: unknown): string | null {
  if (typeof url !== 'string' || url.length > 2048) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Imágenes: solo rutas propias /media/... o https. */
export function safeImageUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  if (/^\/media\/[A-Za-z0-9._/-]+$/.test(url) && !url.includes('..')) return url;
  return safeHttpsUrl(url);
}

/** rel para cualquier enlace externo puesto por un DJ. */
export const EXTERNAL_REL = 'noopener noreferrer nofollow ugc';
