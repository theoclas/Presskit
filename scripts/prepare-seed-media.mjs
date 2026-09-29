#!/usr/bin/env node
// Prepara las fotos de la semilla de Mike Bran & Macfly a partir del sitio viejo (public_html).
// Se corre UNA vez en el PC de Fernando y el resultado se versiona en api/seed-assets/.
//
//   node scripts/prepare-seed-media.mjs [--src ../public_html]
//
// Cada foto: se orienta según EXIF, se reduce a 2560 px de lado mayor, se guarda como JPEG
// q85 (mozjpeg) y se le quitan TODOS los metadatos. photo-1 trae EXIF de iPhone que puede
// incluir GPS, y lo que entra a git se queda en el historial para siempre.
// public_html solo se lee: este script nunca escribe ahí.

import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// sharp vive en api/node_modules (o en el node_modules raíz si npm lo subió).
function loadSharp() {
  for (const base of [path.join(repoRoot, 'api', 'package.json'), path.join(repoRoot, 'package.json')]) {
    try {
      return createRequire(base)('sharp');
    } catch {
      // probar el siguiente
    }
  }
  console.error('No encontré sharp. Ejecuta "npm install" en la raíz del repo.');
  process.exit(1);
}

function parseArgs(argv) {
  const args = { src: path.resolve(repoRoot, '..', 'public_html') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--src' && argv[i + 1]) args.src = path.resolve(argv[++i]);
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log('Uso: node scripts/prepare-seed-media.mjs [--src <carpeta public_html>]');
      process.exit(0);
    } else {
      console.error(`Argumento desconocido: ${argv[i]}`);
      process.exit(1);
    }
  }
  return args;
}

const FLYERS = 'Eventos/MacflyMikeBran/IMG';

// nombre lógico → archivo de origen (relativo a public_html) y nombre ASCII de salida.
const ITEMS = [
  { name: 'hero', src: 'img/header.JPEG', out: 'hero.jpg' },
  { name: 'member-mikebran', src: 'img/Mikebran.jpg', out: 'member-mikebran.jpg' },
  { name: 'member-macfly', src: 'img/Macfly.jpg', out: 'member-macfly.jpg' },
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ name: `gallery-${n}`, src: `img/photo-${n}.jpg`, out: `gallery-${n}.jpg` })),
  // 27 y 29 de noviembre no tienen flyer en el sitio viejo.
  { name: 'flyer-2025-11-14', src: `${FLYERS}/14 Nov.jpg`, out: 'flyer-2025-11-14.jpg' },
  { name: 'flyer-2025-11-16', src: `${FLYERS}/16 Nov.jpg`, out: 'flyer-2025-11-16.jpg' },
  { name: 'flyer-2025-11-30', src: `${FLYERS}/30 Nov.jpg`, out: 'flyer-2025-11-30.jpg' },
  { name: 'flyer-2025-12-19', src: `${FLYERS}/Viuz 19.jpg`, out: 'flyer-2025-12-19.jpg' },
  { name: 'flyer-2025-12-26', src: `${FLYERS}/Baren 26 DIC.png`, out: 'flyer-2025-12-26.jpg' },
  { name: 'flyer-2026-01-24', src: `${FLYERS}/Viuz24012025.jpg`, out: 'flyer-2026-01-24.jpg' },
  { name: 'flyer-2026-01-25', src: `${FLYERS}/Sonorama25012025.jpg`, out: 'flyer-2026-01-25.jpg' },
];

// La tarjeta del index usa la misma foto del hero; el api la recorta a 4:5 al importarla.
const ALIASES = { card: 'hero' };

const MAX_EDGE = 2560;

async function main() {
  const { src } = parseArgs(process.argv.slice(2));
  const sharp = loadSharp();
  sharp.cache(false);

  if (!existsSync(src) || !statSync(src).isDirectory()) {
    console.error(`No existe la carpeta de origen: ${src}`);
    process.exit(1);
  }
  const outDir = path.join(repoRoot, 'api', 'seed-assets', 'macfly-mike-bran');
  mkdirSync(outDir, { recursive: true });
  // Se regenera todo: fuera los .jpg viejos para no dejar archivos huérfanos versionados.
  for (const f of readdirSync(outDir)) {
    if (f.endsWith('.jpg') || f === 'manifest.json') unlinkSync(path.join(outDir, f));
  }

  const files = {};
  const details = [];
  let totalIn = 0;
  let totalOut = 0;

  for (const item of ITEMS) {
    const input = path.join(src, item.src);
    if (!existsSync(input)) {
      console.error(`Falta el archivo de origen: ${item.src}`);
      process.exit(1);
    }
    const inBytes = statSync(input).size;
    // Fuente local y conocida (fotos de 24 MP de cámara): sin límite de píxeles aquí.
    const { data, info } = await sharp(input, { limitInputPixels: false, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#000000' })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    const meta = await sharp(data).metadata();
    if (meta.exif || meta.xmp || meta.iptc || meta.icc) {
      console.error(`La salida de ${item.src} todavía trae metadatos; se aborta.`);
      process.exit(1);
    }

    writeFileSync(path.join(outDir, item.out), data);
    files[item.name] = item.out;
    details.push({
      name: item.name,
      file: item.out,
      source: item.src,
      width: info.width,
      height: info.height,
      bytes: data.length,
      sha256: createHash('sha256').update(data).digest('hex'),
    });
    totalIn += inBytes;
    totalOut += data.length;
    console.log(
      `${item.out.padEnd(24)} ${String(info.width).padStart(4)}x${String(info.height).padEnd(4)} ` +
        `${(inBytes / 1024).toFixed(0).padStart(6)} KB → ${(data.length / 1024).toFixed(0).padStart(5)} KB`,
    );
  }
  for (const [alias, target] of Object.entries(ALIASES)) files[alias] = files[target];

  const manifest = {
    version: 1,
    profile: 'macfly-mike-bran',
    note: 'Generado por scripts/prepare-seed-media.mjs. JPEG q85, máx. 2560 px, sin metadatos.',
    files,
    details,
  };
  writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `\n${ITEMS.length} archivos en ${path.relative(repoRoot, outDir)}: ` +
      `${(totalIn / 1024 / 1024).toFixed(1)} MB de origen → ${(totalOut / 1024 / 1024).toFixed(1)} MB`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
