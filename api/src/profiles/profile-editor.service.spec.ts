import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import type { MediaUrlService } from '../media/media-url.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { EditorActor } from './editor-actor';
import { ProfileEditorService } from './profile-editor.service';
import type { ProfileStore } from './profile-store.service';

const PID = 'cmprofile0000000000000001' as ScopedProfileId;
const owner: EditorActor = { id: 'cmowner00000000000000001', username: 'dj', asAdmin: false, ip: null };
const admin: EditorActor = { ...owner, id: 'cmadmin00000000000000001', asAdmin: true };

/** BD en memoria con lo justo para setSlug: perfiles por slug y SlugRedirect. */
function fakeDb(profile: { slug: string; status: string; slugChangedAt: Date | null }, others: string[] = []) {
  const redirects = new Map<string, { fromSlug: string; profileId: string; createdAt: Date }>();
  const state = { ...profile };
  const tx = {
    djProfile: {
      findUnique: jest.fn(async ({ where }: { where: { slug?: string } }) =>
        where.slug && (others.includes(where.slug) || where.slug === state.slug) ? { id: 'x' } : null,
      ),
      update: jest.fn(async ({ data }: { data: { slug: string; slugChangedAt: Date } }) => {
        state.slug = data.slug;
        state.slugChangedAt = data.slugChangedAt;
      }),
    },
    slugRedirect: {
      findUnique: jest.fn(async ({ where }: { where: { fromSlug: string } }) => redirects.get(where.fromSlug) ?? null),
      create: jest.fn(async ({ data }: { data: { fromSlug: string; profileId: string; createdAt: Date } }) => {
        redirects.set(data.fromSlug, { ...data });
      }),
      delete: jest.fn(async ({ where }: { where: { fromSlug: string } }) => redirects.delete(where.fromSlug)),
      findMany: jest.fn(async ({ where }: { where: { profileId: string } }) => [...redirects.values()].filter((r) => r.profileId === where.profileId)),
      deleteMany: jest.fn(async ({ where }: { where: { fromSlug: { in: string[] } } }) => {
        for (const s of where.fromSlug.in) redirects.delete(s);
      }),
    },
  };
  const prisma = { djProfile: { findUnique: jest.fn(async () => ({ ...state })) } } as unknown as PrismaService;
  const store = {
    transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
    record: jest.fn().mockResolvedValue(undefined),
    loadEditor: jest.fn(async () => ({ slug: state.slug })),
  } as unknown as ProfileStore & { record: jest.Mock };
  const service = new ProfileEditorService(prisma, store, {} as MediaUrlService);
  return { service, redirects, state, store };
}

describe('ProfileEditorService.setSlug', () => {
  it('el slug viejo queda como redirección y se audita', async () => {
    const { service, redirects, state, store } = fakeDb({ slug: 'dj-viejo', status: 'DRAFT', slugChangedAt: null });
    await expect(service.setSlug(PID, owner, '  DJ-Nuevo ')).resolves.toEqual({ slug: 'dj-nuevo' });
    expect(state.slug).toBe('dj-nuevo');
    expect(redirects.get('dj-viejo')?.profileId).toBe(PID);
    expect(store.record).toHaveBeenCalledWith(expect.anything(), PID, owner, 'slug', { fields: ['slug'] });
  });

  it('guarda máximo 5 redirecciones: la más vieja se libera', async () => {
    const { service, redirects } = fakeDb({ slug: 's-0', status: 'DRAFT', slugChangedAt: null });
    for (let i = 1; i <= 7; i++) {
      await service.setSlug(PID, owner, `s-${i}`);
      // createdAt distinto en cada vuelta (los Date del mismo milisegundo empatarían).
      for (const r of redirects.values()) r.createdAt = new Date(r.createdAt.getTime() - 1000);
    }
    expect([...redirects.keys()].sort()).toEqual(['s-2', 's-3', 's-4', 's-5', 's-6']);
  });

  it('volver a un slug propio anterior lo saca de las redirecciones', async () => {
    const { service, redirects } = fakeDb({ slug: 'uno-dj', status: 'DRAFT', slugChangedAt: null });
    await service.setSlug(PID, owner, 'dos-dj');
    await service.setSlug(PID, owner, 'uno-dj');
    expect([...redirects.keys()]).toEqual(['dos-dj']);
  });

  it('tomado por otro perfil o por una redirección ajena → 409 SLUG_TAKEN', async () => {
    const a = fakeDb({ slug: 'mio-dj', status: 'DRAFT', slugChangedAt: null }, ['ajeno-dj']);
    await expect(a.service.setSlug(PID, owner, 'ajeno-dj')).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
    a.redirects.set('viejo-ajeno', { fromSlug: 'viejo-ajeno', profileId: 'otro', createdAt: new Date() });
    await expect(a.service.setSlug(PID, owner, 'viejo-ajeno')).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
  });

  it('formato y reservados → 400 con el código en details', async () => {
    const { service } = fakeDb({ slug: 'mio-dj', status: 'DRAFT', slugChangedAt: null });
    await expect(service.setSlug(PID, owner, 'admin-x')).rejects.toMatchObject({ details: { slug: 'RESERVED' } });
    await expect(service.setSlug(PID, owner, 'a--b')).rejects.toMatchObject({ details: { slug: 'FORMAT' } });
  });

  it('dueño aprobado: 1 cambio cada 30 días (409 SLUG_COOLDOWN con availableAt); el admin sin límite', async () => {
    const changed = new Date(Date.now() - 5 * 86_400_000);
    const a = fakeDb({ slug: 'aprobado-dj', status: 'APPROVED', slugChangedAt: changed });
    await expect(a.service.setSlug(PID, owner, 'otro-dj')).rejects.toMatchObject({
      code: 'SLUG_COOLDOWN',
      details: { availableAt: new Date(changed.getTime() + 30 * 86_400_000).toISOString() },
    });
    await expect(a.service.setSlug(PID, admin, 'otro-dj')).resolves.toEqual({ slug: 'otro-dj' });
  });
});
