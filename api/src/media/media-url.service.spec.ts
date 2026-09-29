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
