import { defaultFormConfig } from '@fersua/shared';
import type { AppError } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import type { MediaService } from '../media/media.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EditorActor } from './editor-actor';
import type { ProfileNotifier } from './profile-notifier.service';
import { ProfileStatusService } from './profile-status.service';
import type { ProfileStore } from './profile-store.service';

const PID = 'cmprofile0000000000000001' as ScopedProfileId;
const admin: EditorActor = { id: 'cmadmin00000000000000001', username: 'fersua', asAdmin: true, ip: '127.0.0.1' };

type ProfileRow = { status: string; legalInfo: { id: string } | null } & Record<string, unknown>;

function setup(
  profile: ProfileRow,
  opts: { txFails?: boolean; updated?: number; owner?: { email: string | null; emailVerifiedAt: Date | null } | null } = {},
) {
  const tx = {
    djProfile: { updateMany: jest.fn().mockResolvedValue({ count: opts.updated ?? 1 }) },
    mediaAsset: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
  };
  const prisma = {
    djProfile: { findUnique: jest.fn().mockResolvedValue(profile) },
    user: { findUnique: jest.fn().mockResolvedValue(opts.owner === undefined ? { email: 'dj@example.com', emailVerifiedAt: new Date() } : opts.owner) },
  } as unknown as PrismaService;
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
    loadEditor: jest.fn().mockResolvedValue({ id: PID, displayName: 'DJ Prueba', slug: 'dj-prueba' }),
  } as unknown as ProfileStore & { record: jest.Mock };
  const notifier = {
    profileSubmitted: jest.fn().mockResolvedValue(undefined),
    statusChanged: jest.fn().mockResolvedValue(undefined),
  } as unknown as ProfileNotifier & { profileSubmitted: jest.Mock; statusChanged: jest.Mock };
  return { service: new ProfileStatusService(prisma, store, media, notifier), tx, media, undo, store, notifier };
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

const owner: EditorActor = { id: 'cmowner00000000000000001', username: 'dj', asAdmin: false, ip: '127.0.0.1' };

/** Perfil completo según publishChecklist (formulario por defecto, un género, un integrante). */
function completeProfile(overrides: Record<string, unknown> = {}): ProfileRow {
  return {
    status: 'DRAFT',
    displayName: 'DJ Prueba',
    slug: 'dj-prueba',
    texts: { heroTitle: 'Techno en vivo' },
    heroImageId: 'hero1',
    whatsappNumber: null,
    bookingForm: defaultFormConfig(),
    legalInfo: { id: 'l1' },
    _count: { members: 1, genres: 1 },
    ...overrides,
  };
}

describe('ProfileStatusService (dueño, M3)', () => {
  it('enviar sin correo verificado → 403 EMAIL_NOT_VERIFIED, antes que cualquier otro faltante', async () => {
    for (const ownerRow of [null, { email: null, emailVerifiedAt: null }, { email: 'dj@example.com', emailVerifiedAt: null }]) {
      const { service, media, notifier } = setup(completeProfile({ legalInfo: null, heroImageId: null }), { owner: ownerRow });
      const err = (await service.submit(PID, owner).catch((e: unknown) => e)) as AppError;
      expect(err.getStatus()).toBe(403);
      expect(err.code).toBe('EMAIL_NOT_VERIFIED');
      expect(media.moveProfileMedia).not.toHaveBeenCalled();
      expect(notifier.profileSubmitted).not.toHaveBeenCalled();
    }
  });

  it('enviar sin registro legal → 409 LEGAL_INFO_REQUIRED; con otros faltantes → 409 PROFILE_INCOMPLETE con el detalle', async () => {
    const noLegal = setup(completeProfile({ legalInfo: null, heroImageId: null }));
    const legalErr = (await noLegal.service.submit(PID, owner).catch((e: unknown) => e)) as AppError;
    expect(legalErr.getStatus()).toBe(409);
    expect(legalErr.code).toBe('LEGAL_INFO_REQUIRED');

    const incomplete = setup(completeProfile({ texts: {}, heroImageId: null, _count: { members: 0, genres: 0 } }));
    const err = (await incomplete.service.submit(PID, owner).catch((e: unknown) => e)) as AppError;
    expect(err.getStatus()).toBe(409);
    expect(err.code).toBe('PROFILE_INCOMPLETE');
    // El título de la portada de la plantilla no cuenta: el DJ tiene que escribir el suyo.
    expect(err.details).toEqual({ 'texts.heroTitle': 'REQUIRED', heroImage: 'REQUIRED', genres: 'REQUIRED', members: 'REQUIRED' });
    expect(incomplete.media.moveProfileMedia).not.toHaveBeenCalled();
  });

  it('enviar desde un estado que no lo permite → 409 INVALID_TRANSITION', async () => {
    for (const status of ['PENDING_REVIEW', 'APPROVED', 'SUSPENDED']) {
      const { service } = setup(completeProfile({ status }));
      await expect(service.submit(PID, owner)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
    }
  });

  it('enviar completo: DRAFT → PENDING_REVIEW, audita profile.submit y avisa al admin', async () => {
    const { service, tx, store, notifier, media } = setup(completeProfile({ status: 'REJECTED' }));
    await service.submit(PID, owner);
    expect(media.moveProfileMedia).toHaveBeenCalledWith(PID, false);
    const call = tx.djProfile.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: PID, status: { in: ['DRAFT', 'REJECTED'] } });
    expect(call.data).toMatchObject({ status: 'PENDING_REVIEW', statusReason: null, submittedAt: expect.any(Date) });
    expect(store.record).toHaveBeenCalledWith(tx, PID, owner, 'submit', { meta: { from: 'REJECTED', to: 'PENDING_REVIEW' } });
    expect(notifier.profileSubmitted).toHaveBeenCalledWith(PID, { displayName: 'DJ Prueba', slug: 'dj-prueba' });
  });

  it('retirar: solo desde PENDING_REVIEW, vuelve a DRAFT y limpia submittedAt', async () => {
    const { service, tx, store } = setup({ status: 'PENDING_REVIEW', legalInfo: null });
    await service.withdraw(PID, owner);
    const call = tx.djProfile.updateMany.mock.calls[0]![0];
    expect(call.where).toEqual({ id: PID, status: { in: ['PENDING_REVIEW'] } });
    expect(call.data).toEqual({ submittedAt: null, status: 'DRAFT' });
    expect(store.record).toHaveBeenCalledWith(tx, PID, owner, 'withdraw', { meta: { from: 'PENDING_REVIEW', to: 'DRAFT' } });

    for (const status of ['DRAFT', 'REJECTED', 'APPROVED', 'SUSPENDED']) {
      const other = setup({ status, legalInfo: null });
      await expect(other.service.withdraw(PID, owner)).rejects.toMatchObject({ code: 'INVALID_TRANSITION' });
      expect(other.tx.djProfile.updateMany).not.toHaveBeenCalled();
    }
  });

  it('aprobar, rechazar, suspender y reactivar avisan al dueño después del commit (con el motivo limpio)', async () => {
    const approved = setup({ status: 'PENDING_REVIEW', legalInfo: { id: 'l1' } });
    await approved.service.approve(PID, admin);
    expect(approved.notifier.statusChanged).toHaveBeenCalledWith(PID, 'approve', null);

    const rejected = setup({ status: 'PENDING_REVIEW', legalInfo: null });
    await rejected.service.reject(PID, admin, '  Falta   una foto de portada.  ');
    expect(rejected.notifier.statusChanged).toHaveBeenCalledWith(PID, 'reject', 'Falta una foto de portada.');

    const suspended = setup({ status: 'APPROVED', legalInfo: null });
    await suspended.service.suspend(PID, admin, 'Contenido reportado por un tercero.');
    expect(suspended.notifier.statusChanged).toHaveBeenCalledWith(PID, 'suspend', 'Contenido reportado por un tercero.');

    const back = setup({ status: 'SUSPENDED', legalInfo: { id: 'l1' } });
    await back.service.reinstate(PID, admin);
    expect(back.notifier.statusChanged).toHaveBeenCalledWith(PID, 'reinstate', null);

    // Si la transacción falla, no hay aviso.
    const failed = setup({ status: 'PENDING_REVIEW', legalInfo: { id: 'l1' } }, { txFails: true });
    await expect(failed.service.approve(PID, admin)).rejects.toThrow('deadlock simulado');
    expect(failed.notifier.statusChanged).not.toHaveBeenCalled();
  });

  it('borrar la cuenta dueña (suspensión automática) no le escribe a nadie', async () => {
    const { service, notifier } = setup({ status: 'APPROVED', legalInfo: null });
    await service.suspendForOwnerRemoval(PID, admin, async () => undefined);
    expect(notifier.statusChanged).not.toHaveBeenCalled();
  });
});
