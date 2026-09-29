/// <reference types="vitest/config" />
import { PALETTE_KEYS, paletteCssVars } from '@fersua/shared';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// En desarrollo apunta al api local (127.0.0.1: el api de desarrollo solo escucha en loopback
// IPv4); FERSUA_API_TARGET permite usar otro (p. ej. un mock).
const API_TARGET = process.env.FERSUA_API_TARGET ?? 'http://127.0.0.1:4100';

/**
 * Genera el CSS de las 8 paletas desde @fersua/shared. Así el primer pintado ya usa la
 * paleta que el servidor escribió en <html data-palette> y nunca se desincroniza con shared.
 */
function palettesCss(): Plugin {
  const id = 'virtual:palettes.css';
  const resolved = `\0${id}`;
  return {
    name: 'fersua-palettes-css',
    resolveId(source) {
      return source === id ? resolved : null;
    },
    load(loadId) {
      if (loadId !== resolved) return null;
      return PALETTE_KEYS.map((key) => {
        const vars = Object.entries(paletteCssVars(key))
          .map(([k, v]) => `${k}:${v}`)
          .join(';');
        return `html[data-palette="${key}"]{${vars}}`;
      }).join('\n');
    },
  };
}

export default defineConfig({
  plugins: [react(), palettesCss()],
  server: {
    port: 5180,
    strictPort: true,
    // changeOrigin false: el api valida el Origin/Host reales del navegador.
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/media': { target: API_TARGET, changeOrigin: false },
    },
  },
  preview: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/media': { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    sourcemap: false,
    target: 'es2022',
    rollupOptions: {
      output: {
        manualChunks(id) {
          // React, router y TanStack cambian poco: van aparte para aprovechar la caché del navegador.
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler|cookie|set-cookie-parser|@tanstack)[\\/]/.test(id)) {
            return 'vendor';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    // Las pruebas del admin montan AntD en jsdom: algunas tardan ~4-5 s en un equipo normal y
    // más con la CPU ocupada (CI, build de Docker en paralelo). Con 5 s por defecto fallaban solas.
    testTimeout: 20_000,
  },
});
