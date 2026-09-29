import { decideShellPath, slugLocation } from './path-decision';

describe('decideShellPath', () => {
  it('/ es el index', () => {
    expect(decideShellPath('/')).toEqual({ kind: 'index' });
  });

  it.each([
    '//evil.com',
    '/%2F%2Fevil.com',
    '/\\evil.com',
    '/evil.com',
    '/%2e%2e/etc/passwd',
    '/../etc/passwd',
    'https://evil.com',
    'evil',
    '',
    '/a b',
    '/slug?x=1',
    '/slug#frag',
    `/${'a'.repeat(61)}`,
    `/${'a'.repeat(301)}`,
  ])('%p no es un slug ni redirige (404)', (path) => {
    expect(decideShellPath(path)).toEqual({ kind: 'notFound' });
  });

  it.each([undefined, null, 42, ['/', '/x'], { path: '/' }])('entrada no string %p → 404', (path) => {
    expect(decideShellPath(path)).toEqual({ kind: 'notFound' });
  });

  it('slug canónico', () => {
    expect(decideShellPath('/macfly-mike-bran')).toEqual({ kind: 'segment', slug: 'macfly-mike-bran', canonical: true });
  });

  it.each([
    ['/MacflyMikebran', 'macflymikebran'],
    ['/MacflyMikebran.html', 'macflymikebran'],
    ['/macflymikebran.html', 'macflymikebran'],
    ['/macfly-mike-bran/', 'macfly-mike-bran'],
    ['/MACFLY-MIKE-BRAN.html/', 'macfly-mike-bran'],
  ])('%p no es canónico: se normaliza a %p', (path, slug) => {
    expect(decideShellPath(path)).toEqual({ kind: 'segment', slug, canonical: false });
  });

  it('/index.html → /', () => {
    expect(decideShellPath('/index.html')).toEqual({ kind: 'redirect', location: '/' });
    expect(decideShellPath('/INDEX.HTML')).toEqual({ kind: 'redirect', location: '/' });
  });

  it('rutas reservadas de un segmento llegan como segment (el servicio decide 200 noindex)', () => {
    expect(decideShellPath('/login')).toEqual({ kind: 'segment', slug: 'login', canonical: true });
    expect(decideShellPath('/Privacidad')).toEqual({ kind: 'segment', slug: 'privacidad', canonical: false });
  });

  it('subrutas de la SPA y /_preview son app', () => {
    expect(decideShellPath('/panel/perfil')).toEqual({ kind: 'app' });
    expect(decideShellPath('/admin/profiles/abc123/fotos')).toEqual({ kind: 'app' });
    expect(decideShellPath('/_preview')).toEqual({ kind: 'app' });
  });

  it('subrutas de algo que no es de la app → 404', () => {
    expect(decideShellPath('/macfly-mike-bran/fechas')).toEqual({ kind: 'notFound' });
    expect(decideShellPath('/Panel/perfil')).toEqual({ kind: 'notFound' });
  });
});

describe('slugLocation', () => {
  it('siempre relativo y de un solo segmento', () => {
    expect(slugLocation('macfly-mike-bran')).toBe('/macfly-mike-bran');
  });

  it.each(['/evil.com', 'evil.com', '', 'A', 'a/b', 'a\\b'])('se niega a armar %p', (slug) => {
    expect(() => slugLocation(slug)).toThrow();
  });
});
