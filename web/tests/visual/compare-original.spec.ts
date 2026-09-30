import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';
import { DJ_PATH, FROZEN_NOW, VIEWPORTS, mockApi, settle } from './support';

// Comparación única para Fernando: la página original (public_html/MacflyMikebran.html) y la
// nueva, a los mismos anchos, en docs/visual/. No es una prueba: solo corre si se le pasa la ruta.
//   FERSUA_ORIGINAL_HTML=C:/Fernando/Desarrollo/hostinger/public_html/MacflyMikebran.html \
//     npx playwright test compare-original   (desde web/, con el build hecho)

const ORIGINAL = process.env.FERSUA_ORIGINAL_HTML;
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../docs/visual');

test.skip(!ORIGINAL, 'Solo a mano: define FERSUA_ORIGINAL_HTML con la ruta de MacflyMikebran.html');

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`original vs. nueva · ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);

    // La original tal cual (con su Inter de Google Fonts, como la veía el público).
    await page.goto(pathToFileURL(ORIGINAL ?? '').href);
    await settle(page);
    await page.screenshot({ path: join(OUT, `original-${name}.png`), fullPage: true, animations: 'disabled' });

    // La nueva, con el mismo contenido (semilla) y sin red.
    await page.clock.setFixedTime(FROZEN_NOW);
    await mockApi(page);
    await page.goto(DJ_PATH);
    await expect(page.getByText('Ramasound Garden').first()).toBeVisible();
    await settle(page);
    await page.screenshot({ path: join(OUT, `nueva-${name}.png`), fullPage: true, animations: 'disabled' });
  });
}
