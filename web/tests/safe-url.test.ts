import { describe, expect, it } from 'vitest';
import { editorImageUrl } from '../src/editor-kit/media';
import { safeHttpsUrl, safeImageUrl } from '../src/lib/safeUrl';

// Forma exacta de las URLs que arma MediaUrlService.previewUrl en el api.
const SIG = 'a'.repeat(64);
const PREVIEW = `/api/media/preview/cmumwdn8700030h30byzfj11x/960.webp?exp=1790000000&sig=${SIG}`;

describe('safeImageUrl', () => {
  it('acepta /media/... y https', () => {
    expect(safeImageUrl('/media/abc/def/480.webp')).toBe('/media/abc/def/480.webp');
    expect(safeImageUrl('https://cdn.example.com/x.webp')).toBe('https://cdn.example.com/x.webp');
  });

  it('acepta la vista previa firmada del api (fotos de perfiles sin aprobar en /_preview)', () => {
    expect(safeImageUrl(PREVIEW)).toBe(PREVIEW);
    const og = `/api/media/preview/cmumwdn8700030h30byzfj11x/og.jpg?exp=1790000000&sig=${SIG}`;
    expect(safeImageUrl(og)).toBe(og);
    expect(editorImageUrl(PREVIEW)).toBe(PREVIEW);
  });

  it('rechaza variantes de la vista previa que el api nunca arma', () => {
    expect(safeImageUrl(PREVIEW.replace('960.webp', '960.svg'))).toBeNull();
    expect(safeImageUrl(PREVIEW.replace('cmumwdn8700030h30byzfj11x', '../../etc'))).toBeNull();
    expect(safeImageUrl(`${PREVIEW}&x=1`)).toBeNull();
    expect(safeImageUrl(PREVIEW.replace(SIG, 'A'.repeat(64)))).toBeNull();
    expect(safeImageUrl(`//evil.example${PREVIEW}`)).toBeNull();
  });

  it('rechaza esquemas peligrosos y rutas con ..', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeNull();
    expect(safeImageUrl('data:image/svg+xml,<svg/>')).toBeNull();
    expect(safeImageUrl('http://example.com/x.webp')).toBeNull();
    expect(safeImageUrl('/media/../api/admin')).toBeNull();
    expect(safeHttpsUrl('https://user:pw@example.com/')).toBeNull();
  });
});
