// Limpieza de texto libre. Todo lo que escribe un usuario pasa por aquí antes de guardarse.
// La web lo pinta siempre como texto (React escapa); esto quita lo que no se ve pero engaña.

// Controles (salvo \n y \t), zero-width y overrides bidireccionales.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

// Pares sustitutos UTF-16 (un emoji ocupa dos unidades). Va SIN la bandera `u` a propósito:
// así el regex ve unidades sueltas y distingue un par completo de una mitad huérfana.
// Sin lookbehind: Safari anterior a 16.4 no lo entiende y rompería todo el bundle público.
const SURROGATES = /[\uD800-\uDBFF][\uDC00-\uDFFF]|[\uD800-\uDFFF]/g;
const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;

/**
 * Quita las mitades sueltas de pares sustitutos (p. ej. el JSON válido "\ud83d"). MySQL/Prisma
 * rechazan la consulta y encodeURIComponent lanza URIError con ellas.
 */
export function toWellFormedText(input: string): string {
  return input.replace(SURROGATES, (m) => (m.length === 2 ? m : ''));
}

export function isWellFormedText(input: string): boolean {
  return toWellFormedText(input) === input;
}

/**
 * Corta a `max` unidades UTF-16 sin partir un emoji por la mitad. Un `slice` normal puede
 * dejar una mitad suelta al final, y eso rompe encodeURIComponent (enlaces de WhatsApp).
 */
export function sliceText(input: string, max: number): string {
  if (input.length <= max) return input;
  const cut = input.slice(0, Math.max(0, max));
  const last = cut.charCodeAt(cut.length - 1);
  return last >= HIGH_SURROGATE_MIN && last <= HIGH_SURROGATE_MAX ? cut.slice(0, -1) : cut;
}

export interface CleanTextOptions {
  multiline?: boolean;
  maxLines?: number;
}

export function cleanText(input: unknown, opts: CleanTextOptions = {}): string {
  if (typeof input !== 'string') return '';
  let s = toWellFormedText(input)
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(/\t/g, ' ')
    .replace(INVISIBLE, '');
  if (opts.multiline) {
    s = s
      .split('\n')
      .map((line) => line.replace(/ {2,}/g, ' ').trimEnd())
      .join('\n')
      .replace(/\n{3,}/g, '\n\n');
    if (opts.maxLines) {
      const lines = s.split('\n');
      if (lines.length > opts.maxLines) s = lines.slice(0, opts.maxLines).join('\n');
    }
  } else {
    s = s.replace(/\n+/g, ' ').replace(/ {2,}/g, ' ');
  }
  return s.trim();
}

/** Minúsculas y sin tildes, para búsquedas y comparaciones tolerantes. */
export function foldText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
