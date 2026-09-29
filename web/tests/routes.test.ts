import { APP_TOP_LEVEL_ROUTES, RESERVED_SLUGS, validateSlug } from '@fersua/shared';
import { describe, expect, it } from 'vitest';
import { routes, topLevelStaticSegments } from '../src/routes';

describe('rutas de primer nivel', () => {
  const segments = topLevelStaticSegments(routes);

  it('cada ruta estática de primer nivel está en RESERVED_SLUGS (ningún DJ puede tomarla)', () => {
    expect(segments.length).toBeGreaterThan(0);
    for (const s of segments) {
      expect(RESERVED_SLUGS.has(s), `"${s}" no está reservada`).toBe(true);
      expect(validateSlug(s)).not.toBeNull();
    }
  });

  it('coinciden exactamente con APP_TOP_LEVEL_ROUTES de shared', () => {
    expect([...segments].sort()).toEqual([...APP_TOP_LEVEL_ROUTES].sort());
  });

  it('/:slug y el comodín existen después de las rutas estáticas', () => {
    const children = routes[0]?.children ?? [];
    const paths = children.map((r) => r.path);
    expect(paths).toContain(':slug');
    expect(paths.indexOf('*')).toBe(paths.length - 1);
  });
});
