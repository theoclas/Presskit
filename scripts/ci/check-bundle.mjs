#!/usr/bin/env node
// El bundle público (lo que carga index.html: entrada + modulepreload) no debe traer las
// librerías del panel (antd, axios, dayjs). Van solo en los chunks diferidos de /panel y
// /admin; si se cuelan en la carga inicial, la página de cada DJ se vuelve pesada en móvil.
// Uso: npm run build -w web && npm run ci:bundle

import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = resolve(root, 'web/dist');
const indexPath = resolve(dist, 'index.html');
if (!existsSync(indexPath)) {
  console.error('check-bundle: web/dist/index.html no existe; corre antes `npm run build -w web`');
  process.exit(1);
}

const html = readFileSync(indexPath, 'utf8');
const initial = [...html.matchAll(/(?:src|href)="\/(assets\/[^"]+\.js)"/g)].map((m) => m[1]);
if (!initial.length) {
  console.error('check-bundle: no encontré scripts en index.html');
  process.exit(1);
}

const FORBIDDEN = /\b(antd|axios|dayjs)\b|rc-(field-form|picker|table)/;
const bad = [];
for (const rel of new Set(initial)) {
  const m = FORBIDDEN.exec(readFileSync(resolve(dist, rel), 'utf8'));
  if (m) bad.push(`${rel} (${m[0]})`);
}
if (bad.length) {
  console.error(`check-bundle: el bundle público carga librerías del panel:\n  - ${bad.join('\n  - ')}`);
  process.exit(1);
}
console.log(`check-bundle: OK (${initial.length} archivos de la carga inicial)`);
