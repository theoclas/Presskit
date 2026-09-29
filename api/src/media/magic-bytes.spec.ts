import sharp from 'sharp';
import { sniffImageType } from './magic-bytes';

const solid = (w = 32, h = 32) => sharp({ create: { width: w, height: h, channels: 3, background: '#ff6600' } });

describe('sniffImageType', () => {
  it('reconoce JPEG, PNG y WebP reales', async () => {
    expect(sniffImageType(await solid().jpeg().toBuffer())).toBe('jpeg');
    expect(sniffImageType(await solid().png().toBuffer())).toBe('png');
    expect(sniffImageType(await solid().webp().toBuffer())).toBe('webp');
  });

  it('rechaza GIF, TIFF, AVIF/HEIC, SVG, PDF y texto', async () => {
    expect(sniffImageType(await solid().gif().toBuffer())).toBeNull();
    expect(sniffImageType(await solid().tiff().toBuffer())).toBeNull();
    // Contenedor ISO-BMFF (ftyp) de HEIC/AVIF, construido a mano.
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic\0\0\0\0mif1heic', 'latin1')]);
    expect(sniffImageType(heic)).toBeNull();
    const avif = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from('ftypavif\0\0\0\0avifmif1miaf', 'latin1')]);
    expect(sniffImageType(avif)).toBeNull();
    expect(sniffImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))).toBeNull();
    expect(sniffImageType(Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj'))).toBeNull();
    expect(sniffImageType(Buffer.from('<?php echo "hola"; ?> esto no es una foto'))).toBeNull();
  });

  it('rechaza un RIFF que no es WebP (WAV/AVI)', () => {
    const wav = Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00', 'latin1');
    expect(sniffImageType(wav)).toBeNull();
  });

  it('rechaza buffers vacíos o demasiado cortos', () => {
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
  });
});
