import { MEDIA_VARIANTS } from '@fersua/shared';
import sharp from 'sharp';
import * as zlib from 'node:zlib';
import { AppError } from '../common/errors';
import { ImagePipelineService, planVariants } from './image-pipeline.service';

const solid = (w: number, h: number, channels: 3 | 4 = 3) =>
  sharp({ create: { width: w, height: h, channels, background: { r: 255, g: 102, b: 0, alpha: 1 } } });

/** Cambia el ancho/alto declarados en el IHDR de un PNG (con su CRC) sin tocar los píxeles. */
function patchPngDimensions(png: Buffer, width: number, height: number): Buffer {
  const out = Buffer.from(png);
  // Firma (8) + largo (4) + "IHDR" (4) → datos del IHDR desde el byte 16.
  expect(out.toString('latin1', 12, 16)).toBe('IHDR');
  out.writeUInt32BE(width, 16);
  out.writeUInt32BE(height, 20);
  out.writeUInt32BE(zlib.crc32(out.subarray(12, 29)) >>> 0, 29);
  return out;
}

async function expectCode(p: Promise<unknown>, code: string): Promise<void> {
  await expect(p).rejects.toBeInstanceOf(AppError);
  await p.catch((e: AppError) => expect((e.getResponse() as { code: string }).code).toBe(code));
}

describe('ImagePipelineService', () => {
  const pipeline = new ImagePipelineService();

  it('genera variantes WebP sin agrandar y con el ancho del original como tope', async () => {
    const src = await solid(1300, 900).jpeg().toBuffer();
    const out = await pipeline.process(src, 'GALLERY');
    expect(out.format).toBe('jpeg');
    expect(out.mime).toBe('image/jpeg');
    expect(out.variants.map((v) => v.w)).toEqual([480, 960, 1300]);
    for (const v of out.variants) {
      const meta = await sharp(v.data).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(v.w);
      expect(v.file).toBe(`${v.w}.webp`);
    }
    expect(out.og).toBeNull();
  });

  it('quita EXIF (incluido GPS) y aplica la orientación', async () => {
    // 600x300 con Orientation=6: la foto "real" es vertical, 300x600.
    const src = await solid(600, 300)
      .withExif({
        IFD0: { Artist: 'Fernando', Copyright: 'privado' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '6/1 15/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '75/1 34/1 0/1' },
      })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const inMeta = await sharp(src).metadata();
    expect(inMeta.exif).toBeDefined();
    expect(inMeta.orientation).toBe(6);

    const out = await pipeline.process(src, 'HERO');
    expect(out.sourceWidth).toBe(300);
    expect(out.sourceHeight).toBe(600);
    for (const f of [...out.variants, out.og!]) {
      const meta = await sharp(f.data).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(meta.icc).toBeUndefined();
      expect(meta.orientation).toBeUndefined();
      expect(f.data.includes(Buffer.from('Fernando'))).toBe(false);
    }
    expect(out.variants[0]).toMatchObject({ w: 300, h: 600 });
  });

  it('HERO produce og.jpg de 1200x630 exactos', async () => {
    const out = await pipeline.process(await solid(2000, 1500).png().toBuffer(), 'HERO');
    expect(out.og).not.toBeNull();
    const meta = await sharp(out.og!.data).metadata();
    expect(meta.format).toBe('jpeg');
    expect([meta.width, meta.height]).toEqual([1200, 630]);
    expect(out.og!.file).toBe('og.jpg');
  });

  it('CARD recorta a 4:5', async () => {
    const out = await pipeline.process(await solid(1600, 900).webp().toBuffer(), 'CARD');
    expect(out.variants.map((v) => [v.w, v.h])).toEqual([
      [400, 500],
      [720, 900],
    ]);
  });

  it('rechaza un archivo de texto renombrado a .jpg', async () => {
    const fake = Buffer.from('Esto es texto plano que alguien renombró a foto.jpg\n'.repeat(20));
    await expectCode(pipeline.process(fake, 'GALLERY'), 'UNSUPPORTED_IMAGE');
  });

  it('rechaza SVG aunque sharp sepa leerlo', async () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><script>alert(1)</script><rect width="400" height="400"/></svg>',
    );
    await expectCode(pipeline.process(svg, 'GALLERY'), 'UNSUPPORTED_IMAGE');
  });

  it('rechaza GIF (animado o no)', async () => {
    await expectCode(pipeline.process(await solid(400, 400).gif().toBuffer(), 'GALLERY'), 'UNSUPPORTED_IMAGE');
  });

  it('rechaza un PNG que declara dimensiones gigantes (bomba de descompresión)', async () => {
    const png = await solid(300, 300).png().toBuffer();
    const bomb = patchPngDimensions(png, 100_000, 100_000);
    await expectCode(pipeline.process(bomb, 'GALLERY'), 'IMAGE_TOO_LARGE');
  });

  it('rechaza un JPEG con cabecera válida y contenido basura', async () => {
    const jpeg = await solid(400, 400).jpeg().toBuffer();
    const broken = Buffer.concat([jpeg.subarray(0, 40), Buffer.alloc(2000, 0x41)]);
    await expectCode(pipeline.process(broken, 'GALLERY'), 'INVALID_IMAGE');
  });

  it('rechaza un políglota: magic bytes de PNG delante de un JPEG', async () => {
    const jpeg = await solid(400, 400).jpeg().toBuffer();
    const polyglot = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), jpeg]);
    await expect(pipeline.process(polyglot, 'GALLERY')).rejects.toBeInstanceOf(AppError);
  });

  it('rechaza imágenes con un lado menor al mínimo', async () => {
    await expectCode(pipeline.process(await solid(1000, 150).jpeg().toBuffer(), 'GALLERY'), 'IMAGE_TOO_SMALL');
  });

  it('rechaza archivos de más de 10 MB sin decodificarlos', async () => {
    const jpeg = await solid(300, 300).jpeg().toBuffer();
    const huge = Buffer.concat([jpeg, Buffer.alloc(10 * 1024 * 1024)]);
    await expectCode(pipeline.process(huge, 'GALLERY'), 'IMAGE_TOO_LARGE');
  });
});

describe('planVariants', () => {
  it('nunca pide anchos mayores al original', () => {
    expect(planVariants(MEDIA_VARIANTS.HERO, 3000, 2000).map((v) => v.width)).toEqual([480, 960, 1440]);
    expect(planVariants(MEDIA_VARIANTS.HERO, 1000, 800).map((v) => v.width)).toEqual([480, 960]);
    expect(planVariants(MEDIA_VARIANTS.FLYER, 899, 1599).map((v) => v.width)).toEqual([540, 899]);
    expect(planVariants(MEDIA_VARIANTS.MEMBER, 300, 300).map((v) => v.width)).toEqual([240, 300]);
    expect(planVariants(MEDIA_VARIANTS.GALLERY, 320, 900).map((v) => v.width)).toEqual([320]);
  });

  it('CARD: el recuadro 4:5 cabe dentro del original', () => {
    for (const [w, h] of [
      [4000, 3000],
      [300, 2000],
      [900, 400],
    ] as const) {
      for (const v of planVariants(MEDIA_VARIANTS.CARD, w, h)) {
        expect(v.width).toBeLessThanOrEqual(w);
        expect(v.height!).toBeLessThanOrEqual(h + 1);
        expect(Math.abs(v.height! / v.width - 1.25)).toBeLessThan(0.01);
      }
    }
  });
});
