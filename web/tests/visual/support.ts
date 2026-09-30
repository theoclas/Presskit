import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

// Api simulado para las capturas: el perfil de Mac Fly sale de la semilla
// (api/src/cli/seed-data/macfly.ts) con la misma forma que arma api/src/public/public.mappers.ts,
// y las fotos son versiones chicas de api/seed-assets (una por imagen, para cualquier ancho).

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

/** Las 9 fechas de la semilla (nov 2025 – ene 2026) quedan como próximas, igual que en la página original. */
export const FROZEN_NOW = new Date('2025-11-01T12:00:00-05:00');

export const DJ_PATH = '/macfly-mike-bran';

export const VIEWPORTS = {
  movil: { width: 390, height: 844 },
  escritorio: { width: 1280, height: 800 },
} as const;

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
}

const NOT_FOUND = { statusCode: 404, code: 'NOT_FOUND', message: 'No encontrado.' };

/** Intercepta /api y /media; cualquier otra petición a internet se corta (capturas sin red). */
export async function mockApi(page: Page): Promise<void> {
  const profile = fixture('macfly-profile.json');
  const cards = fixture('djs.json');
  const genres = fixture('genres.json');

  await page.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => route.abort());

  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/public/djs') return route.fulfill({ json: cards });
    if (path === '/api/public/genres') return route.fulfill({ json: genres });
    if (path === `/api/public/djs${DJ_PATH}`) return route.fulfill({ json: profile });
    if (path === `/api/public/djs${DJ_PATH}/booking-token`) return route.fulfill({ json: { token: 'fixture.token' } });
    return route.fulfill({ status: 404, json: NOT_FOUND });
  });

  await page.route('**/media/**', (route) => {
    const m = /^\/media\/fixture\/([a-z0-9-]+)\/\d+\.webp$/.exec(new URL(route.request().url()).pathname);
    const file = m ? join(FIXTURES, 'media', `${m[1]}.webp`) : null;
    if (!file || !existsSync(file)) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ path: file, contentType: 'image/webp' });
  });
}

/** Espera fuentes e imágenes (también las diferidas) para que la captura sea estable. */
export async function settle(page: Page): Promise<void> {
  await page.evaluate(async () => {
    for (const img of Array.from(document.images)) img.loading = 'eager';
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.images).map((img) =>
        img.complete
          ? img.decode().catch(() => undefined)
          : new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true });
              img.addEventListener('error', () => resolve(), { once: true });
            }),
      ),
    );
  });
}
