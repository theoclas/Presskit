import type { AppConfig } from '../../config/app-config.service';
import type { MediaUrlService } from '../../media/media-url.service';
import type { ProfileDetail } from '../public-profile.query';
import type { ProfileResult, PublicService } from '../public.service';
import { FALLBACK_TEMPLATE, type ShellTemplateService } from './shell-template.service';
import { ShellService } from './shell.service';

function fakeProfile(overrides: Partial<ProfileDetail> = {}): ProfileDetail {
  return {
    id: 'p1',
    slug: 'macfly-mike-bran',
    displayName: 'Mike Bran & Macfly',
    tagline: null,
    seoDescription: 'Booking oficial de Mike Bran & Macfly — DJs.',
    city: 'Medellín',
    countryCode: 'CO',
    whatsappNumber: '573505209860',
    publicEmail: null,
    publicPhone: '+573505209860',
    palette: 'SUNSET',
    texts: {},
    bookingForm: [],
    showGallery: true,
    showRider: true,
    showEvents: true,
    showOpenDateRow: true,
    formEnabled: true,
    formOpenWhatsapp: true,
    notifyByEmail: true,
    heroImageId: null,
    heroImage: null,
    cardImageId: null,
    status: 'APPROVED',
    featured: true,
    featuredRank: 1,
    updatedAt: new Date('2026-09-28T12:00:00Z'),
    genres: [],
    members: [],
    socialLinks: [],
    gallery: [],
    riderItems: [],
    events: [],
    ...overrides,
  } as unknown as ProfileDetail;
}

/** BD simulada: un perfil visible y un slug viejo que apunta a él. */
function setup(seoIndexable = true) {
  const profile = fakeProfile();
  const publicService = {
    findProfile: jest.fn(async (slug: string): Promise<ProfileResult> => {
      if (slug === 'macfly-mike-bran') return { kind: 'profile', profile };
      if (slug === 'macflymikebran') return { kind: 'redirect', slug: 'macfly-mike-bran' };
      return { kind: 'none' };
    }),
    visibleCardProfiles: jest.fn(async () => []),
  } as unknown as PublicService;
  const media = { toImageDto: () => null, ogUrl: () => null } as unknown as MediaUrlService;
  const template = { get: async () => FALLBACK_TEMPLATE } as unknown as ShellTemplateService;
  const config = { publicUrl: 'https://booking.fersuastudio.com', seoIndexable } as unknown as AppConfig;
  return { shell: new ShellService(publicService, media, template, config), publicService };
}

describe('ShellService.render — redirecciones', () => {
  it.each([
    ['/MacflyMikebran', '/macfly-mike-bran'],
    ['/MacflyMikebran.html', '/macfly-mike-bran'],
    ['/macflymikebran', '/macfly-mike-bran'],
    ['/MACFLY-MIKE-BRAN', '/macfly-mike-bran'],
    ['/macfly-mike-bran/', '/macfly-mike-bran'],
    ['/Login', '/login'],
    ['/Desconocido.html', '/desconocido'],
    ['/index.html', '/'],
  ])('%p → 301 %p (Location relativo, en un salto)', async (path, location) => {
    const { shell } = setup();
    expect(await shell.render(path)).toEqual({ status: 301, location });
  });

  it.each(['//evil.com', '/%2F%2Fevil.com', '/\\evil.com', '//Evil.com/', '/evil.com'])(
    '%p → 404 sin redirigir ni tocar la BD',
    async (path) => {
      const { shell, publicService } = setup();
      const res = await shell.render(path);
      expect(res.status).toBe(404);
      expect(publicService.findProfile).not.toHaveBeenCalled();
    },
  );
});

describe('ShellService.render — páginas', () => {
  it('perfil visible → 200 con el head del perfil', async () => {
    const { shell } = setup();
    const res = await shell.render('/macfly-mike-bran');
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.indexable).toBe(true);
    expect(res.html).toContain('<title>Mike Bran &amp; Macfly — Booking | Fersua Studio</title>');
    expect(res.html).toContain('<link rel="canonical" href="https://booking.fersuastudio.com/macfly-mike-bran">');
    expect(res.html).toContain('"@type":"MusicGroup"');
    expect(res.html).toContain('"telephone":"+573505209860"');
  });

  it.each(['/login', '/panel/perfil', '/_preview', '/admin'])('ruta de la app %p → 200 noindex', async (path) => {
    const { shell, publicService } = setup();
    const res = await shell.render(path);
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.indexable).toBe(false);
    expect(res.html).toContain('<meta name="robots" content="noindex">');
    expect(publicService.findProfile).not.toHaveBeenCalled();
  });

  it('documento legal → 200 con su propio título, canonical e indexable', async () => {
    const { shell, publicService } = setup();
    const res = await shell.render('/privacidad');
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.indexable).toBe(true);
    expect(res.html).toContain('<title>Política de Tratamiento de Datos Personales · Fersua Studio</title>');
    expect(res.html).toContain('<link rel="canonical" href="https://booking.fersuastudio.com/privacidad">');
    expect(res.html).toContain('<meta name="robots" content="index, follow, max-image-preview:large">');
    expect(publicService.findProfile).not.toHaveBeenCalled();
  });

  it('/reportar → título propio pero noindex (es un formulario)', async () => {
    const { shell } = setup();
    const res = await shell.render('/reportar');
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.indexable).toBe(false);
    expect(res.html).toContain('<title>Reportar contenido · Fersua Studio</title>');
    expect(res.html).toContain('<meta name="robots" content="noindex">');
  });

  it('slug desconocido en minúscula → 404 noindex', async () => {
    const { shell } = setup();
    const res = await shell.render('/no-existe');
    expect(res.status).toBe(404);
    if (res.status !== 404) return;
    expect(res.html).toContain('<meta name="robots" content="noindex">');
    expect(res.html).toContain('Página no encontrada');
  });

  it('index → 200 indexable', async () => {
    const { shell } = setup();
    const res = await shell.render('/');
    expect(res.status).toBe(200);
    if (res.status !== 200) return;
    expect(res.html).toContain('"@type":"ItemList"');
  });

  it('SEO_INDEXABLE=false → todo noindex, nofollow', async () => {
    const { shell } = setup(false);
    for (const path of ['/', '/macfly-mike-bran', '/login']) {
      const res = await shell.render(path);
      if (res.status === 301) throw new Error('no debía redirigir');
      expect(res.indexable).toBe(false);
      expect(res.html).toContain('<meta name="robots" content="noindex, nofollow">');
    }
  });
});
