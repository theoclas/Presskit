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

// La misma semilla con la plantilla Signal y su paleta (la franja animada queda quieta: animations).
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`página del DJ, plantilla Signal · ${name} ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.unrouteAll();
    await mockApi(page, { template: 'SIGNAL', palette: 'SIGNAL' });
    await page.setViewportSize(viewport);
    await page.goto(DJ_PATH);
    await expect(page.locator('#booking-form')).toBeAttached();
    await expect(page.locator('.djs')).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`dj-signal-${name}.png`, { fullPage: true });
  });
}

// Neon Groove con dos redes del perfil (SoundCloud da el botón «Escuchar ahora» y los íconos del menú).
const GROOVE_PATCH = {
  template: 'GROOVE',
  palette: 'GROOVE',
  socials: [
    { platform: 'INSTAGRAM', label: 'Instagram', url: 'https://www.instagram.com/macflymikebran/' },
    { platform: 'SOUNDCLOUD', label: 'SoundCloud', url: 'https://soundcloud.com/macflymikebran' },
  ],
};

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`página del DJ, plantilla Neon Groove · ${name} ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.unrouteAll();
    await mockApi(page, GROOVE_PATCH);
    await page.setViewportSize(viewport);
    await page.goto(DJ_PATH);
    await expect(page.locator('#booking-form')).toBeAttached();
    await expect(page.locator('.djg')).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`dj-groove-${name}.png`, { fullPage: true });
  });
}

// Editorial Noir (la clara) con las mismas redes: «Escuchar ahora» y la sección de música.
for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`página del DJ, plantilla Editorial Noir · ${name} ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.unrouteAll();
    await mockApi(page, { ...GROOVE_PATCH, template: 'NOIR', palette: 'NOIR' });
    await page.setViewportSize(viewport);
    await page.goto(DJ_PATH);
    await expect(page.locator('#booking-form')).toBeAttached();
    await expect(page.locator('.djn')).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot(`dj-noir-${name}.png`, { fullPage: true });
  });
}

test('index · movil 390x844', async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.movil);
  await page.goto('/');
  await expect(page.getByText('Mike Bran & Macfly').first()).toBeVisible();
  await settle(page);
  await expect(page).toHaveScreenshot('index-movil.png', { fullPage: true });
});
