import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { AppError } from '../common/errors';
import type { AppConfig } from '../config/app-config.service';
import { StorageService, safeJoin } from './storage.service';

describe('safeJoin (guardia de path traversal)', () => {
  const root = path.resolve(tmpdir(), 'fersua-root');

  it('acepta segmentos simples dentro de la raíz', () => {
    expect(safeJoin(root, 'abc', 'KEY_x-1', '480.webp')).toBe(path.join(root, 'abc', 'KEY_x-1', '480.webp'));
  });

  it.each([
    ['..'],
    ['.'],
    ['../etc'],
    ['a/../../b'],
    ['..\\..\\windows'],
    ['/etc/passwd'],
    ['C:\\Windows'],
    ['nul\0byte'],
    [''],
  ])('rechaza %j', (seg) => {
    expect(() => safeJoin(root, 'perfil', seg)).toThrow();
  });
});

describe('StorageService', () => {
  let dir: string;
  let storage: StorageService;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'fersua-media-'));
    storage = new StorageService({ uploadDir: dir } as unknown as AppConfig);
    storage.minFreeBytes = 0;
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const files = [
    { file: '480.webp', data: Buffer.from('a') },
    { file: 'og.jpg', data: Buffer.from('b') },
  ];

  it('escribe de forma atómica en public/<perfil>/<clave> y no deja restos en .tmp', async () => {
    await storage.writeAsset('prof1/KeyAbc_123', true, files);
    expect(readFileSync(path.join(dir, 'public', 'prof1', 'KeyAbc_123', '480.webp'), 'utf8')).toBe('a');
    expect(readFileSync(path.join(dir, 'public', 'prof1', 'KeyAbc_123', 'og.jpg'), 'utf8')).toBe('b');
    expect(existsSync(path.join(dir, 'private', 'prof1'))).toBe(false);
    expect(await storage.sweepTmp(0)).toBe(0);
  });

  it('los privados van a private/ y se pueden mover a public/', async () => {
    await storage.writeAsset('prof1/KeyPriv', false, files);
    expect(existsSync(path.join(dir, 'private', 'prof1', 'KeyPriv', '480.webp'))).toBe(true);
    await storage.moveAsset('prof1/KeyPriv', false, true);
    expect(existsSync(path.join(dir, 'private', 'prof1', 'KeyPriv'))).toBe(false);
    expect(existsSync(path.join(dir, 'public', 'prof1', 'KeyPriv', 'og.jpg'))).toBe(true);
  });

  it('rechaza storageKeys y nombres de archivo peligrosos', async () => {
    for (const key of ['../x', 'a/../../b', 'a/b/c', 'a\\b', '/abs', 'a/.env']) {
      await expect(storage.writeAsset(key, true, files)).rejects.toThrow();
      expect(() => storage.assetDir(key, true)).toThrow();
    }
    for (const file of ['../../.env', 'x.json', '.env', 'a/480.webp', '480.webp.php']) {
      await expect(storage.writeAsset('prof1/KeyOk', true, [{ file, data: Buffer.from('x') }])).rejects.toThrow();
    }
    expect(existsSync(path.join(dir, '.env'))).toBe(false);
  });

  it('borra un asset y todas las carpetas de un perfil', async () => {
    await storage.writeAsset('prof2/K1', true, files);
    await storage.writeAsset('prof2/K2', false, files);
    await storage.deleteAsset('prof2/K1', true);
    expect(existsSync(path.join(dir, 'public', 'prof2', 'K1'))).toBe(false);
    await storage.deleteProfileFolders('prof2');
    expect(existsSync(path.join(dir, 'private', 'prof2'))).toBe(false);
    await expect(storage.deleteProfileFolders('..')).rejects.toThrow();
  });

  it('se niega a escribir con poco disco libre (503 STORAGE_FULL)', async () => {
    storage.minFreeBytes = Number.MAX_SAFE_INTEGER;
    const err = await storage.writeAsset('prof1/KeyFull', true, files).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).getStatus()).toBe(503);
    expect(((err as AppError).getResponse() as { code: string }).code).toBe('STORAGE_FULL');
    expect(existsSync(path.join(dir, 'public', 'prof1', 'KeyFull'))).toBe(false);
  });

  it('limpia en .tmp solo lo viejo', async () => {
    mkdirSync(path.join(dir, '.tmp'), { recursive: true });
    const old = path.join(dir, '.tmp', 'w-viejo');
    const fresh = path.join(dir, '.tmp', 'w-nuevo');
    writeFileSync(old, 'x');
    writeFileSync(fresh, 'y');
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    utimesSync(old, twoHoursAgo, twoHoursAgo);
    expect(await storage.sweepTmp(60 * 60 * 1000)).toBe(1);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(fresh)).toBe(true);
  });
});
