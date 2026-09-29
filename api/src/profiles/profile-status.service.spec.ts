import type { AppError } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import type { MediaService } from '../media/media.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EditorActor } from './editor-actor';
import { ProfileStatusService } from './profile-status.service';
import type { ProfileStore } from './profile-store.service';

const PID = 'cmprofile0000000000000001' as ScopedProfileId;
const admin: EditorActor = { id: 'cmadmin00000000000000001', username: 'fersua', asAdmin: true, ip: '127.0.0.1' };

function setup(profile: { status: string; legalInfo: { id: string } | null }, opts: { txFails?: boolean; updated?: number } = {}) {
  const tx = {
    djProfile: { updateMany: jest.fn().mockResolvedValue({ count: opts.updated ?? 1 }) },
    mediaAsset: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = { djProfile: { findUnique: jest.fn().mockResolvedValue(profile) } } as unknown as PrismaService;
  const undo = jest.fn().mockResolvedValue(undefined);
  const media = {
    moveProfileMedia: jest.fn().mockResolvedValue({ ids: ['m1', 'm2'], undo }),
    syncProfileMedia: jest.fn().mockResolvedValue(undefined),
  } as unknown as MediaService & { moveProfileMedia: jest.Mock; syncProfileMedia: jest.Mock };
  const store = {
    transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
      const out = await fn(tx);
      if (opts.txFails) throw new Error('deadlock simulado');
      return out;
    }),
    record: jest.fn().mockResolvedValue(undefined),
    status: jest.fn().mockResolvedValue(profile.status),
    loadEditor: jest.fn().mockResolvedValue({ id: PID }),
  } as unknown as ProfileStore & { record: jest.Mock };
  return { service: new ProfileStatusService(prisma, store, media), tx, media, undo, store };
}

describe('ProfileStatusService', () => {
  it('aprobar sin registro legal → 409 LEGAL_INFO_REQUIRED y no mueve nada', async () => {
    const { service, media } = setup({ status: 'PENDING_REVIEW', legalInfo: null });
    await expect(service.approve(PID, admin)).rejects.toMatchObject({ code: 'LEGAL_INFO_REQUIRED' });
    expect(media.moveProfileMedia).not.toHaveBeenCalled();
  });

  it('aprobar: mueve la media a public/, cambia estado e isPublic en una transacción y audita', async () => {
    const { service, tx, media, undo, store } = setup({ status: 'PENDING_REVIEW', legalInfo: { id: 'l1' } });
    await service.approve(PID, admin);
    expect(media.moveProfileMedia).toHaveBeenCalledWith(PID, true);
    const call = tx.djProfile.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: PID, status: { in: ['DRAFT', 'PENDING_REVIEW', 'REJECTED'] }, legalInfo: { isNot: null } });
    expect(call.data).toMatchObject({ status: 'APPROVED', approvedById: admin.id, statusReason: null });
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['m1', 'm2'] }, profileId: PID }, data: { isPublic: true } });
    expect(store.record).toHaveBeenCalledWith(tx, PID, admin, 'approve', { meta: { from: 'PENDING_REVIEW', to: 'APPROVED' } });
    expect(undo).not.toHaveBeenCalled();
    expect(media.syncProfileMedia).toHaveBeenCalledWith(PID, true);
  });

  it('si la transacción falla, devuelve los archivos (undo) y propaga el error', async () => {
    const { service, undo, media } = setup({ status: 'PENDING_REVIEW', legalInfo: { id: 'l1' } }, { txFails: true });
    await expect(service.approve(PID, admin)).rejects.toThrow('deadlock simulado');
    expect(undo).toHaveBeenCalledTimes(1);
    expect(media.syncProfileMedia).not.toHaveBeenCalled();
  });

  it('si otra petición cambió el estado entre la lectura y la escritura → 409 y undo', async () => {
    const { service, undo } = setup({ status: 'PENDING_REVIEW', legalInfo: { id: 'l1' } }, { updated: 0 });
    await expect(service.approve(PID, admin)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('aprobar algo ya aprobado o suspendido → 409 INVALID_TRANSITION', async () => {
    for (const status of ['APPROVED', 'SUSPENDED']) {
      const { service } = setup({ status, legalInfo: { id: 'l1' } });
      await expect(service.approve(PID, admin)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    }
  });

  it('suspender pasa la media a private/ y guarda el motivo limpio', async () => {
    const { service, tx, media } = setup({ status: 'APPROVED', legalInfo: null });
    await service.suspend(PID, admin, '  Contenido   reportado por un tercero.  ');
    expect(media.moveProfileMedia).toHaveBeenCalledWith(PID, false);
    expect(tx.djProfile.updateMany.mock.calls[0]![0].data).toMatchObject({
      status: 'SUSPENDED',
      statusReason: 'Contenido reportado por un tercero.',
    });
    expect(tx.mediaAsset.updateMany.mock.calls[0]![0].data).toEqual({ isPublic: false });
  });

  it('motivo de menos de 10 caracteres → 400', async () => {
    const { service } = setup({ status: 'PENDING_REVIEW', legalInfo: null });
    const err = (await service.reject(PID, admin, 'corto').catch((e: unknown) => e)) as AppError;
    expect(err.getStatus()).toBe(400);
    expect(err.details).toEqual({ reason: 'TOO_SHORT' });
  });

  it('reactivar exige el registro legal, como aprobar: vuelve a ser público', async () => {
    const without = setup({ status: 'SUSPENDED', legalInfo: null });
    await expect(without.service.reinstate(PID, admin)).rejects.toMatchObject({ code: 'LEGAL_INFO_REQUIRED' });
    expect(without.media.moveProfileMedia).not.toHaveBeenCalled();

    const { service, tx, media } = setup({ status: 'SUSPENDED', legalInfo: { id: 'l1' } });
    await service.reinstate(PID, admin);
    expect(media.moveProfileMedia).toHaveBeenCalledWith(PID, true);
    expect(tx.djProfile.updateMany.mock.calls[0]![0].where).toEqual({
      id: PID,
      status: { in: ['SUSPENDED'] },
      legalInfo: { isNot: null },
    });
  });

  it('borrar la cuenta dueña de un perfil aprobado lo suspende en la misma transacción', async () => {
    const { service, tx, media, store } = setup({ status: 'APPROVED', legalInfo: null });
    const work = jest.fn(async (t: unknown) => {
      expect(t).toBe(tx);
    });
    await expect(service.suspendForOwnerRemoval(PID, admin, work)).resolves.toBe(true);
    expect(media.moveProfileMedia).toHaveBeenCalledWith(PID, false);
    expect(tx.djProfile.updateMany.mock.calls[0]![0].data).toMatchObject({ status: 'SUSPENDED' });
    expect(work).toHaveBeenCalledTimes(1);
    expect(store.record).toHaveBeenCalledWith(tx, PID, admin, 'suspend', { meta: { from: 'APPROVED', to: 'SUSPENDED' } });
  });

  it('si el borrado de la cuenta falla, el perfil no queda suspendido (undo de archivos)', async () => {
    const { service, undo } = setup({ status: 'APPROVED', legalInfo: null });
    await expect(
      service.suspendForOwnerRemoval(PID, admin, async () => {
        throw new Error('FK');
      }),
    ).rejects.toThrow('FK');
    expect(undo).toHaveBeenCalledTimes(1);
  });

  it('perfil no aprobado: solo corre el borrado, sin cambiar el estado', async () => {
    const { service, tx, media } = setup({ status: 'DRAFT', legalInfo: null });
    const work = jest.fn(async () => undefined);
    await expect(service.suspendForOwnerRemoval(PID, admin, work)).resolves.toBe(false);
    expect(work).toHaveBeenCalledWith(tx);
    expect(media.moveProfileMedia).not.toHaveBeenCalled();
    expect(tx.djProfile.updateMany).not.toHaveBeenCalled();
  });
});
