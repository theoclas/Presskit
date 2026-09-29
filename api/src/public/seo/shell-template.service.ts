import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const CACHE_MS = 60_000;
const MAX_TEMPLATE_BYTES = 512 * 1024;

/**
 * Plantilla mínima para cuando no existe el build de la web (desarrollo con Vite, pruebas).
 * Tiene los mismos marcadores y atributos que web/index.html.
 */
export const FALLBACK_TEMPLATE = `<!doctype html>
<html lang="es-CO" data-palette="SUNSET" data-surface="public">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!--app-head:start--><title>Fersua Studio · Booking de DJs</title><!--app-head:end-->
</head>
<body>
<div id="root"></div>
</body>
</html>
`;

/** Lee el index.html compilado de la web (SHELL_TEMPLATE) y lo guarda 60 s en memoria. */
@Injectable()
export class ShellTemplateService {
  private readonly log = new Logger('ShellTemplate');
  private cache: { html: string; at: number } | null = null;
  private warnedFallback = false;

  constructor(private readonly config: ConfigService) {}

  async get(): Promise<string> {
    const now = Date.now();
    if (this.cache && now - this.cache.at < CACHE_MS) return this.cache.html;
    const html = await this.load();
    this.cache = { html, at: now };
    return html;
  }

  private async load(): Promise<string> {
    const file = resolve(process.cwd(), this.config.get<string>('SHELL_TEMPLATE') ?? '../web/dist/index.html');
    try {
      const html = await readFile(file, 'utf8');
      if (html.length > MAX_TEMPLATE_BYTES || !/<\/head>/i.test(html)) throw new Error('plantilla inválida');
      this.warnedFallback = false;
      return html;
    } catch {
      // En desarrollo es normal (la web corre con Vite): se avisa una sola vez, sin la ruta completa.
      if (!this.warnedFallback) {
        this.log.warn('No se encontró el index.html de la web; se usa la plantilla mínima.');
        this.warnedFallback = true;
      }
      return FALLBACK_TEMPLATE;
    }
  }
}
