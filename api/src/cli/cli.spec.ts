import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { CliUsageError, parseArgs } from './args';
import { COMMANDS } from './commands';
import { buildPlan, loadAssets } from './commands/seed-macfly.command';
import { MACFLY_SEED } from './seed-data/macfly';

describe('parseArgs', () => {
  const spec = { assets: 'string', force: 'boolean' } as const;

  it('lee flags con espacio o con =', () => {
    expect(parseArgs(['--assets', './x', '--force'], spec).flags).toEqual({ assets: './x', force: true });
    expect(parseArgs(['--assets=./y'], spec).flags).toEqual({ assets: './y' });
  });

  it('falla con flags desconocidos o sin valor', () => {
    expect(() => parseArgs(['--forse'], spec)).toThrow(CliUsageError);
    expect(() => parseArgs(['--assets'], spec)).toThrow(CliUsageError);
    expect(() => parseArgs(['--force=true'], spec)).toThrow(CliUsageError);
    expect(() => parseArgs(['--__proto__'], spec)).toThrow(CliUsageError);
  });
});

describe('registro de comandos', () => {
  it('tiene nombres únicos grupo:accion', () => {
    const names = COMMANDS.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const n of names) expect(n).toMatch(/^[a-z]+:[a-z-]+$/);
    expect(names).toEqual(expect.arrayContaining(['seed:genres', 'seed:macfly']));
  });
});

describe('seed:macfly — plan', () => {
  const plan = buildPlan(MACFLY_SEED);

  it('los textos y el formulario pasan las validaciones compartidas', () => {
    expect(Object.keys(plan.texts).length).toBe(Object.keys(MACFLY_SEED.texts).length);
    expect(plan.bookingForm.map((f) => f.key)).toEqual(['fullName', 'email1', 'eventDate', 'city', 'message']);
  });

  it('limpia el rastreo de las URLs de SoundCloud', () => {
    const urls = plan.members.flatMap((m) => m.links.map((l) => l.url));
    expect(urls).toContain('https://soundcloud.com/macfly-mike-bran/grood-taste-dj-contest-district-2025');
    for (const u of urls) {
      expect(u).toMatch(/^https:\/\//);
      expect(u).not.toMatch(/utm_|[?&]si=|ref=/);
    }
  });

  it('las 9 fechas son pasadas (quedan como archivo)', () => {
    expect(MACFLY_SEED.events).toHaveLength(9);
    for (const e of MACFLY_SEED.events) expect(e.date < '2026-09-28').toBe(true);
    expect(MACFLY_SEED.events.filter((e) => !e.flyer).map((e) => e.date)).toEqual(['2025-11-27', '2025-11-29']);
  });

  it('pide exactamente las imágenes del manifest real', () => {
    const dir = path.resolve(__dirname, '../../seed-assets/macfly-mike-bran');
    const buffers = loadAssets(dir, plan.images);
    expect(buffers.size).toBe(plan.images.size);
    expect(buffers.get('card')).toBe(buffers.get('hero'));
  });

  it('loadAssets no sale de la carpeta aunque el manifest lo pida', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'fersua-seed-'));
    try {
      writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ files: { hero: '../../.env' } }));
      expect(() => loadAssets(dir, ['hero'])).toThrow(/manifest/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
