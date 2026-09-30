import { Prisma } from '@prisma/client';
import { defaultFormConfig } from '@fersua/shared';
import type { AppError } from '../common/errors';
import type { PrismaService } from '../prisma/prisma.service';
import type { EditorActor } from './editor-actor';
import { OwnerOnboardingService } from './owner-onboarding.service';
import type { ProfileStore } from './profile-store.service';

const actor: EditorActor = { id: 'cmowner00000000000000001', username: 'dj', asAdmin: false, ip: '127.0.0.1' };

function setup(opts: { user?: unknown; slugOwner?: unknown; redirect?: unknown; createError?: unknown } = {}) {
  const tx = {
    user: { findUnique: jest.fn().mockResolvedValue(opts.user === undefined ? { role: 'USER', status: 'ACTIVE', profile: null } : opts.user) },
    djProfile: {
      findUnique: jest.fn().mockResolvedValue(opts.slugOwner ?? null),
      create: jest.fn(async () => {
        if (opts.createError) throw opts.createError;
        return { id: 'cmprofile0000000000000001' };
      }),
    },
    slugRedirect: { findUnique: jest.fn().mockResolvedValue(opts.redirect ?? null) },
  };
  const store = {
    transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    record: jest.fn().mockResolvedValue(undefined),
    loadEditor: jest.fn().mockResolvedValue({ id: 'cmprofile0000000000000001' }),
  } as unknown as ProfileStore & { record: jest.Mock };
  const prisma = {
    djProfile: { findUnique: jest.fn().mockResolvedValue(opts.slugOwner ?? null) },
    slugRedirect: { findUnique: jest.fn().mockResolvedValue(opts.redirect ?? null) },
    genre: { findMany: jest.fn().mockResolvedValue([{ id: 1, slug: 'house', name: 'House' }]) },
  } as unknown as PrismaService & { genre: { findMany: jest.Mock } };
  return { service: new OwnerOnboardingService(prisma, store), tx, store, prisma };
}

const p2002 = (target: string) =>
  new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test', meta: { target } });

describe('OwnerOnboardingService.create', () => {
  it('crea el perfil en DRAFT, con el dueño del token, textos vacíos y el formulario por defecto; audita profile.create', async () => {
    const { service, tx, store } = setup();
    await service.create(actor, { displayName: '  DJ   Nuevo ', slug: ' DJ-Nuevo ' }, false);
    expect(tx.djProfile.create).toHaveBeenCalledWith({
      data: { slug: 'dj-nuevo', displayName: 'DJ Nuevo', userId: actor.id, status: 'DRAFT', texts: {}, bookingForm: defaultFormConfig() },
      select: { id: true },
    });
    expect(store.record).toHaveBeenCalledWith(tx, 'cmprofile0000000000000001', actor, 'create', { fields: ['slug', 'displayName'] });
  });

  it('ya tiene perfil → 409 PROFILE_EXISTS antes de validar el cuerpo', async () => {
    const { service, tx } = setup();
    await expect(service.create(actor, { displayName: 'x', slug: '-' }, true)).rejects.toMatchObject({ code: 'PROFILE_EXISTS' });
    expect(tx.djProfile.create).not.toHaveBeenCalled();
    // Y si el token era viejo, lo decide la relectura dentro de la transacción.
    const race = setup({ user: { role: 'USER', status: 'ACTIVE', profile: { id: 'otro' } } });
    await expect(race.service.create(actor, { displayName: 'DJ Nuevo', slug: 'dj-nuevo' }, false)).rejects.toMatchObject({
      code: 'PROFILE_EXISTS',
    });
  });

  it('slug reservado o mal formado → 400 con el campo; nombre corto → 400', async () => {
    const { service } = setup();
    const reserved = (await service.create(actor, { displayName: 'DJ Nuevo', slug: 'admin' }, false).catch((e: unknown) => e)) as AppError;
    expect(reserved.details).toEqual({ slug: 'RESERVED' });
    const format = (await service.create(actor, { displayName: 'DJ Nuevo', slug: 'a' }, false).catch((e: unknown) => e)) as AppError;
    expect(format.details).toEqual({ slug: 'FORMAT' });
    const name = (await service.create(actor, { displayName: ' x ', slug: 'dj-nuevo' }, false).catch((e: unknown) => e)) as AppError;
    expect(name.details).toEqual({ displayName: 'TOO_SHORT' });
  });

  it('slug de otro perfil o de una redirección → 409 SLUG_TAKEN', async () => {
    await expect(setup({ slugOwner: { id: 'p1' } }).service.create(actor, { displayName: 'DJ Nuevo', slug: 'dj-nuevo' }, false)).rejects.toMatchObject({
      code: 'SLUG_TAKEN',
    });
    await expect(
      setup({ redirect: { profileId: 'p1' } }).service.create(actor, { displayName: 'DJ Nuevo', slug: 'dj-nuevo' }, false),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('carreras contra los índices únicos: userId → PROFILE_EXISTS; slug → SLUG_TAKEN', async () => {
    await expect(
      setup({ createError: p2002('DjProfile_userId_key') }).service.create(actor, { displayName: 'DJ Nuevo', slug: 'dj-nuevo' }, false),
    ).rejects.toMatchObject({ code: 'PROFILE_EXISTS' });
    await expect(
      setup({ createError: p2002('DjProfile_slug_key') }).service.create(actor, { displayName: 'DJ Nuevo', slug: 'dj-nuevo' }, false),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('una cuenta que no es USER activa no crea perfiles (403)', async () => {
    const { service } = setup({ user: { role: 'ADMIN', status: 'ACTIVE', profile: null } });
    await expect(service.create(actor, { displayName: 'DJ Nuevo', slug: 'dj-nuevo' }, false)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

describe('OwnerOnboardingService.slugAvailability y genres', () => {
  it('normaliza y consulta perfiles y redirecciones solo si el formato es válido', async () => {
    const { service, prisma } = setup({ slugOwner: { id: 'p1' } });
    expect(await service.slugAvailability(' DJ-Nuevo ', null)).toEqual({ available: false, reason: 'TAKEN' });
    expect(await service.slugAvailability('DJ-Nuevo', 'p1')).toEqual({ available: true });
    const calls = (prisma.djProfile.findUnique as jest.Mock).mock.calls.length;
    expect(await service.slugAvailability('no válido', null)).toEqual({ available: false, reason: 'FORMAT' });
    expect((prisma.djProfile.findUnique as jest.Mock).mock.calls.length).toBe(calls);
  });

  it('géneros activos, en orden del catálogo, solo id/slug/nombre', async () => {
    const { service, prisma } = setup();
    expect(await service.genres()).toEqual([{ id: 1, slug: 'house', name: 'House' }]);
    expect(prisma.genre.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: { id: true, slug: true, name: true },
    });
  });
});
