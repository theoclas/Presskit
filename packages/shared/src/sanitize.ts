// Limpieza de texto libre. Todo lo que escribe un usuario pasa por aquí antes de guardarse.
// La web lo pinta siempre como texto (React escapa); esto quita lo que no se ve pero engaña.

// Controles (salvo \n y \t), zero-width y overrides bidireccionales.
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0008\u000B-\u001F\u007F​-‏‪-‮⁠-⁤⁦-⁩﻿]/g;

export interface CleanTextOptions {
  multiline?: boolean;
  maxLines?: number;
}

export function cleanText(input: unknown, opts: CleanTextOptions = {}): string {
  if (typeof input !== 'string') return '';
  let s = input.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, ' ').replace(INVISIBLE, '');
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
