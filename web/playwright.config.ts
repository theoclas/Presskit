import { defineConfig } from '@playwright/test';

// Regresión visual de las páginas públicas (npm run test:visual). Corre sobre el build servido
// por `vite preview` y con el api simulado (page.route + fixtures), así no necesita la BD ni el
// api. No es parte de `npm test`: una CI sin navegadores sigue pasando.
//
// Las capturas de referencia llevan la plataforma en el nombre (el texto se dibuja distinto en
// Windows y en Linux). Para regenerarlas: npm run test:visual -w web -- --update-snapshots

const PORT = 5190;

export default defineConfig({
  testDir: './tests/visual',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: './test-results',
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}',
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02, animations: 'disabled', caret: 'hide', scale: 'css' },
  },
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    colorScheme: 'dark',
    deviceScaleFactor: 1,
    serviceWorkers: 'block',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // Puerto propio (no el 5180 del desarrollo) para no chocar con un `npm run dev` abierto.
    command: `npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${PORT}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
