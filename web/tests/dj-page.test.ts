import { describe, expect, it } from 'vitest';
import { hashTargetId, normalizeSlugParam } from '../src/public/pages/DjPage';

describe('DjPage', () => {
  it('un #hash con escapes rotos no lanza (antes tumbaba la página entera)', () => {
    expect(hashTargetId('#%E0')).toBeNull();
    expect(hashTargetId('#%')).toBeNull();
    expect(hashTargetId('')).toBeNull();
    expect(hashTargetId('#')).toBeNull();
  });

  it('solo acepta ids simples', () => {
    expect(hashTargetId('#fechas')).toBe('fechas');
    expect(hashTargetId('#booking')).toBe('booking');
    expect(hashTargetId('#a%20b')).toBeNull();
    expect(hashTargetId('#<img>')).toBeNull();
  });

  it('normaliza el slug de la URL vieja', () => {
    expect(normalizeSlugParam('MacflyMikebran.html')).toBe('macflymikebran');
  });
});
