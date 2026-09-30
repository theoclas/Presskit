import { expect, test } from '@playwright/test';
import { DJ_PATH, FROZEN_NOW, VIEWPORTS, mockApi, settle } from './support';

// Capturas de referencia de la página pública del DJ (móvil y escritorio) y del index (móvil).
// Un cambio de CSS o de estructura que mueva más del 2 % de los píxeles hace fallar la prueba.

test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(FROZEN_NOW);
  await mockApi(page);
});

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`página del DJ · ${name} ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto(DJ_PATH);
    await expect(page.locator('#booking-form')).toBeAttached();
    await expect(page.getByText('Ramasound Garden').first()).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`dj-${name}.png`, { fullPage: true });
  });
}

test('index · movil 390x844', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.movil);
  await page.goto('/');
  await expect(page.getByText('Mike Bran & Macfly').first()).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('index-movil.png', { fullPage: true });
});
