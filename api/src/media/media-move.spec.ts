import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import type { AppConfig } from '../config/app-config.service';
import type { ImagePipelineService } from './image-pipeline.service';
import { MediaService } from './media.service';
import { StorageService } from './storage.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('MediaService.moveProfileMedia (aprobar / suspender)', () => {
  let dir: string;
  let storage: StorageService;
  let rows: { id: string; storageKey: string }[];
  let media: MediaService;

  const files = [{ file: '480.webp', data: Buffer.from('x') }];
  const at = (key: string, isPublic: boolean) => existsSync(path.join(dir, isPublic ? 'public' : 'private', ...key.split('/')));

  beforeEach(async () => {
    dir = mkdtempSync(path.join(tmpdir(), 'fersua-move-'));
    storage = new StorageService({ uploadDir: dir } as unknown as AppConfig);
    storage.minFreeBytes = 0;
    rows = [
      { id: 'a1', storageKey: 'prof1/KeyOne' },
      { id: 'a2', storageKey: 'prof1/KeyTwo' },
      { id: 'a3', storageKey: 'prof1/KeyThree' },
    ];
    for (const r of rows) await storage.writeAsset(r.storageKey, false, files);
    const prisma = { mediaAsset: { findMany: jest.fn().mockResolvedValue(rows) } } as unknown as PrismaService;
    media = new MediaService(prisma, {} as ImagePipelineService, storage);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    rmSync(dir, { recursive: true, force: true });
  });

  it('mueve todo a public/ y undo() lo devuelve a private/', async () => {
    const move = await media.moveProfileMedia('prof1', true);
    expect(move.ids).toEqual(['a1', 'a2', 'a3']);
    for (const r of rows) expect([at(r.storageKey, true), at(r.storageKey, false)]).toEqual([true, false]);
    await move.undo();
    for (const r of rows) expect([at(r.storageKey, true), at(r.storageKey, false)]).toEqual([false, true]);
  });

  it('si un movimiento falla a mitad, deshace los anteriores y lanza', async () => {
    const real = storage.moveAsset.bind(storage);
    jest.spyOn(storage, 'moveAsset').mockImplementation(async (key, from, to) => {
      if (key === 'prof1/KeyTwo' && to) throw new Error('EIO simulado');
      return real(key, from, to);
    });
    await expect(media.moveProfileMedia('prof1', true)).rejects.toThrow('EIO simulado');
    for (const r of rows) expect([at(r.storageKey, true), at(r.storageKey, false)]).toEqual([false, true]);
  });

  it('tolera un corte anterior: lo que ya estaba en destino solo se marca, y sin archivos no falla', async () => {
    await storage.moveAsset('prof1/KeyOne', false, true);
    await storage.deleteAsset('prof1/KeyThree', false);
    const move = await media.moveProfileMedia('prof1', true);
    expect(move.ids).toEqual(['a1', 'a2', 'a3']);
    expect(at('prof1/KeyOne', true)).toBe(true);
    expect(at('prof1/KeyTwo', true)).toBe(true);
    // undo solo devuelve lo que ESTA llamada movió.
    await move.undo();
    expect(at('prof1/KeyOne', true)).toBe(true);
    expect(at('prof1/KeyTwo', false)).toBe(true);
  });
});
