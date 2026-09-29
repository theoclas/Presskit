import type { MediaAsset } from '@prisma/client';
import type { AppConfig } from '../config/app-config.service';
import { MediaUrlService, parseVariants } from './media-url.service';

const config = { publicUrl: 'https://booking.fersuastudio.com' } as unknown as AppConfig;
const service = new MediaUrlService(config);

function asset(over: Partial<MediaAsset> = {}): MediaAsset {
  return {
    id: 'asset1',
    profileId: 'prof1',
    uploadedById: null,
    kind: 'HERO',
    storageKey: 'prof1/AbCdEfGh12345678',
    variants: [
      { w: 960, h: 540, bytes: 2000, file: '960.webp' },
      { w: 480, h: 270, bytes: 1000, file: '480.webp' },
    ],
    hasOg: true,
    width: 960,
    height: 540,
    bytesTotal: 3000,
    originalBytes: 9000,
    originalMime: 'image/jpeg',
    sha256: 'a'.repeat(64),
    isPublic: true,
    attachedAt: new Date(),
    createdAt: new Date(),
    ...over,
  };
}

describe('MediaUrlService', () => {
  it('arma ImageDto con URLs relativas /media ordenadas por ancho y og absoluto', () => {
    expect(service.toImageDto(asset(), 'Show de prueba')).toEqual({
      id: 'asset1',
      width: 960,
      height: 540,
      alt: 'Show de prueba',
      variants: [
        { w: 480, h: 270, url: '/media/prof1/AbCdEfGh12345678/480.webp' },
        { w: 960, h: 540, url: '/media/prof1/AbCdEfGh12345678/960.webp' },
      ],
      ogUrl: 'https://booking.fersuastudio.com/media/prof1/AbCdEfGh12345678/og.jpg',
    });
  });

  it('alt por defecto es null y sin og cuando no es HERO', () => {
    const dto = service.toImageDto(asset({ hasOg: false, kind: 'GALLERY' }));
    expect(dto?.alt).toBeNull();
    expect(dto?.ogUrl).toBeNull();
    expect(service.ogUrl(asset({ hasOg: false }))).toBeNull();
  });

  it('devuelve null para nada, para assets privados o con storageKey sospechoso', () => {
    expect(service.toImageDto(null)).toBeNull();
    expect(service.toImageDto(undefined)).toBeNull();
    expect(service.toImageDto(asset({ isPublic: false }))).toBeNull();
    expect(service.ogUrl(asset({ isPublic: false }))).toBeNull();
    expect(service.toImageDto(asset({ storageKey: '../etc/passwd' }))).toBeNull();
    expect(service.toImageDto(asset({ storageKey: 'a/b/c' }))).toBeNull();
    expect(service.toImageDto(asset({ variants: [] }))).toBeNull();
  });

  it('ignora variantes con nombres o medidas raras', () => {
    expect(
      parseVariants([
        { w: 480, h: 270, bytes: 1, file: '480.webp' },
        { w: 1, h: 1, file: '../../.env' },
        { w: 1, h: 1, file: 'og.jpg' },
        { w: '960', h: 540, file: '960.webp' },
        null,
        'x',
      ]),
    ).toEqual([{ w: 480, h: 270, bytes: 1, file: '480.webp' }]);
    expect(parseVariants({ not: 'an array' })).toEqual([]);
  });
});

describe('MediaUrlService: vista previa firmada', () => {
  const signed = new MediaUrlService({
    publicUrl: 'https://booking.fersuastudio.com',
    bookingFormSecret: 's'.repeat(32),
  } as unknown as AppConfig);
  const ID = 'cmabcdefghij0123456789xyz';
  const NOW = Date.UTC(2026, 8, 29, 15, 7, 0);

  function parse(url: string) {
    const u = new URL(url, 'https://x.test');
    const [, , , , assetId, file] = u.pathname.split('/');
    return { path: u.pathname, assetId, file, exp: u.searchParams.get('exp')!, sig: u.searchParams.get('sig')! };
  }

  it('los privados salen con URL firmada relativa (variantes y og) y los públicos igual que siempre', () => {
    const dto = signed.toEditorAssetDto(asset({ id: ID, isPublic: false }), NOW)!;
    expect(dto.isPublic).toBe(false);
    expect(dto.kind).toBe('HERO');
    expect(dto.bytesTotal).toBe(3000);
    expect(dto.variants.map((v) => v.w)).toEqual([480, 960]);
    for (const v of dto.variants) {
      expect(v.url).toMatch(/^\/api\/media\/preview\/[a-z0-9]+\/\d+\.webp\?exp=\d+&sig=[0-9a-f]{64}$/);
      const p = parse(v.url);
      expect(signed.verifyPreview(p.assetId, p.file, p.exp, p.sig, NOW)).toBe(true);
    }
    expect(parse(dto.ogUrl!).file).toBe('og.jpg');
    // Nunca una ruta /media/ para un privado.
    expect(JSON.stringify(dto)).not.toContain('/media/prof1');

    const pub = signed.toEditorAssetDto(asset({ id: ID }), NOW)!;
    expect(pub.variants[0]!.url).toBe('/media/prof1/AbCdEfGh12345678/480.webp');
    // toImageDto (público) sigue sin mostrar privados.
    expect(signed.toImageDto(asset({ id: ID, isPublic: false }))).toBeNull();
  });

  it('la expiración queda entre 50 y 60 minutos y es estable dentro de un bloque de 10', () => {
    const a = parse(signed.previewUrl(ID, '480.webp', NOW));
    const b = parse(signed.previewUrl(ID, '480.webp', NOW + 60_000));
    expect(a.sig).toBe(b.sig);
    const left = Number(a.exp) - NOW / 1000;
    expect(left).toBeGreaterThan(50 * 60 - 1);
    expect(left).toBeLessThanOrEqual(60 * 60);
  });

  it('rechaza firmas alteradas, otro archivo, otro asset, vencidas o con vida > 1 h', () => {
    const p = parse(signed.previewUrl(ID, '480.webp', NOW));
    expect(signed.verifyPreview(ID, '960.webp', p.exp, p.sig, NOW)).toBe(false);
    expect(signed.verifyPreview('cmzzzzzzzzzz0123456789xyz', '480.webp', p.exp, p.sig, NOW)).toBe(false);
    expect(signed.verifyPreview(ID, '480.webp', String(Number(p.exp) + 600), p.sig, NOW)).toBe(false);
    const flipped = `${p.sig.slice(0, -1)}${p.sig.endsWith('0') ? '1' : '0'}`;
    expect(signed.verifyPreview(ID, '480.webp', p.exp, flipped, NOW)).toBe(false);
    expect(signed.verifyPreview(ID, '480.webp', p.exp, p.sig, Number(p.exp) * 1000 + 1)).toBe(false);
    // Una firma válida pero con exp a más de 1 h (p. ej. de un secreto filtrado) tampoco.
    expect(signed.verifyPreview(ID, '480.webp', p.exp, p.sig, NOW - 30 * 60_000)).toBe(false);
    for (const bad of ['../x', '480.png', 'og.jpeg', '']) {
      expect(signed.verifyPreview(ID, bad, p.exp, p.sig, NOW)).toBe(false);
    }
    expect(signed.verifyPreview(ID, '480.webp', [p.exp], p.sig, NOW)).toBe(false);
    expect(signed.verifyPreview(ID, '480.webp', p.exp, undefined, NOW)).toBe(false);
  });

  it('otro secreto no valida la firma', () => {
    const other = new MediaUrlService({ publicUrl: 'x', bookingFormSecret: 't'.repeat(32) } as unknown as AppConfig);
    const p = parse(signed.previewUrl(ID, '480.webp', NOW));
    expect(other.verifyPreview(ID, '480.webp', p.exp, p.sig, NOW)).toBe(false);
  });
});
