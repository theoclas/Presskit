// Codificadores por contexto para el HTML que arma el servidor (shell SEO y sitemap).
// Todo texto que venga de un DJ pasa por uno de estos antes de tocar el HTML.

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Texto o valor de atributo HTML (siempre entre comillas dobles). */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** XML del sitemap: mismas cinco entidades. */
export const escapeXml = escapeHtml;

// Construidas con fromCharCode: un U+2028 literal en el código fuente rompe el parser.
const LINE_SEP_RE = new RegExp(String.fromCharCode(0x2028), 'g');
const PARA_SEP_RE = new RegExp(String.fromCharCode(0x2029), 'g');

/**
 * JSON dentro de <script type="application/ld+json">. JSON.stringify no escapa '<', así que
 * un texto con '</script>' cerraría la etiqueta; U+2028/U+2029 rompen parsers viejos.
 */
export function jsonForScript(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(LINE_SEP_RE, '\\u2028')
    .replace(PARA_SEP_RE, '\\u2029');
}

/** Una sola línea, sin espacios repetidos (para title y description). */
export function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Recorta por puntos de código (no parte emojis) y agrega '…' si hizo falta. */
export function truncate(value: string, max: number): string {
  const chars = [...value];
  if (chars.length <= max) return value;
  return `${chars.slice(0, Math.max(0, max - 1)).join('').trimEnd()}…`;
}
