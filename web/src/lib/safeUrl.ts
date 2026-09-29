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

/**
 * Foto de un perfil sin aprobar (editor y /_preview): URL firmada que arma solo el api,
 * /api/media/preview/<assetId>/<archivo>?exp=&sig=. Mismas formas que valida el api
 * (media-url.service.ts): id cuid, variante webp u og.jpg, exp en segundos y HMAC hex.
 */
const PREVIEW_IMAGE_RE = /^\/api\/media\/preview\/[a-z0-9]{20,32}\/(?:\d{1,5}\.webp|og\.jpg)\?exp=\d{9,11}&sig=[0-9a-f]{64}$/;

/** Imágenes: solo rutas propias /media/..., la vista previa firmada del api o https. */
export function safeImageUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  if (/^\/media\/[A-Za-z0-9._/-]+$/.test(url) && !url.includes('..')) return url;
  if (PREVIEW_IMAGE_RE.test(url)) return url;
  return safeHttpsUrl(url);
}

/** rel para cualquier enlace externo puesto por un DJ. */
export const EXTERNAL_REL = 'noopener noreferrer nofollow ugc';
