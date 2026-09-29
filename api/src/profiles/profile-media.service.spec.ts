import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import type { MediaUrlService } from '../media/media-url.service';
import type { MediaService } from '../media/media.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EditorActor } from './editor-actor';
import { ProfileMediaService } from './profile-media.service';
import { usageDto } from './profile-rules';
import type { ProfileStore } from './profile-store.service';

const PID = 'cmprofile0000000000000001' as ScopedProfileId;
const actor: EditorActor = { id: 'cmowner00000000000000001', username: 'dj', asAdmin: false, ip: null };
const MB = 1024 * 1024;
const file = { buffer: Buffer.from('imagen'), size: 6 } as Express.Multer.File;

function setup(usages: { assets: number; bytes: number }[], statuses: string[] = ['DRAFT', 'DRAFT']) {
  const asset = { id: 'cmasset00000000000000001', isPublic: false, bytesTotal: 2 * MB, storageKey: `${PID}/Key` };
  const media = {
    ingest: jest.fn().mockResolvedValue(asset),
    remove: jest.fn().mockResolvedValue(undefined),
    setPublic: jest.fn().mockResolvedValue(undefined),
  } as unknown as MediaService & { ingest: jest.Mock; remove: jest.Mock; setPublic: jest.Mock };
  const usage = jest.fn();
  for (const u of usages) usage.mockResolvedValueOnce(usageDto('DRAFT', u.assets, u.bytes));
  const status = jest.fn();
  for (const s of statuses) status.mockResolvedValueOnce(s);
  const store = {
    status,
    usage,
    transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
    record: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProfileStore;
  const urls = { toEditorAssetDto: jest.fn((a: { id: string; isPublic: boolean }) => ({ id: a.id, isPublic: a.isPublic })) };
  const service = new ProfileMediaService({} as PrismaService, store, media, urls as unknown as MediaUrlService);
  return { service, media };
}

describe('ProfileMediaService.upload: cuota', () => {
  it('lleno antes de procesar → 409 QUOTA_EXCEEDED sin gastar sharp', async () => {
    const { service, media } = setup([{ assets: 20, bytes: 0 }]);
    await expect(service.upload(PID, actor, 'GALLERY', file)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(media.ingest).not.toHaveBeenCalled();
  });

  it('se pasa con el tamaño real → borra lo que acaba de guardar y 409', async () => {
    const { service, media } = setup([
      { assets: 10, bytes: 24 * MB },
      { assets: 11, bytes: 26 * MB },
    ]);
    await expect(service.upload(PID, actor, 'GALLERY', file)).rejects.toMatchObject({ code: 'QUOTA_EXCEEDED' });
    expect(media.ingest).toHaveBeenCalledWith(expect.objectContaining({ isPublic: false, profileId: PID, kind: 'GALLERY' }));
    expect(media.remove).toHaveBeenCalledTimes(1);
  });

  it('sin archivo → 400 FILE_REQUIRED', async () => {
    const { service } = setup([]);
    await expect(service.upload(PID, actor, 'HERO', undefined)).rejects.toMatchObject({ code: 'FILE_REQUIRED' });
  });

  it('si el perfil se aprobó mientras se procesaba, la foto pasa a pública', async () => {
    const { service, media } = setup(
      [
        { assets: 0, bytes: 0 },
        { assets: 1, bytes: 2 * MB },
      ],
      ['PENDING_REVIEW', 'APPROVED'],
    );
    const dto = await service.upload(PID, actor, 'HERO', file);
    expect(media.setPublic).toHaveBeenCalledWith(expect.objectContaining({ id: 'cmasset00000000000000001' }), true);
    expect(dto).toMatchObject({ isPublic: true });
  });
});
