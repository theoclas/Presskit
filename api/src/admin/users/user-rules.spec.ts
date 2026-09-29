import { confirmMatches, targetError } from './user-rules';

describe('targetError', () => {
  const adminId = 'cadmin00000000000000000001';

  it('el admin no puede actuar sobre sí mismo', () => {
    expect(targetError(adminId, { id: adminId, role: 'ADMIN' })).toBe('CANNOT_TARGET_SELF');
  });

  it('ni sobre otra cuenta ADMIN', () => {
    expect(targetError(adminId, { id: 'cotro0000000000000000000001', role: 'ADMIN' })).toBe('CANNOT_TARGET_ADMIN');
  });

  it('sí sobre un USER', () => {
    expect(targetError(adminId, { id: 'cuser0000000000000000000001', role: 'USER' })).toBeNull();
  });

  it('"sí mismo" gana aunque el rol leído fuera USER (se compara por id)', () => {
    expect(targetError(adminId, { id: adminId, role: 'USER' })).toBe('CANNOT_TARGET_SELF');
  });
});

describe('confirmMatches', () => {
  it('acepta el usuario tal cual o con mayúsculas y espacios alrededor', () => {
    expect(confirmMatches('dj.prueba', 'dj.prueba')).toBe(true);
    expect(confirmMatches('  DJ.Prueba ', 'dj.prueba')).toBe(true);
  });

  it('rechaza cualquier otra cosa', () => {
    expect(confirmMatches('dj.prueb', 'dj.prueba')).toBe(false);
    expect(confirmMatches('', 'dj.prueba')).toBe(false);
    expect(confirmMatches('dj.prueba2', 'dj.prueba')).toBe(false);
  });
});
