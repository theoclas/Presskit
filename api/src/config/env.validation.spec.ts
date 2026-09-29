import { productionSecretProblems, weakSecretReason } from './env.validation';

// Valores con la forma de los que genera scripts/init-env.sh (hex aleatorio), fijos para la prueba.
const hex = (seed: number, len: number) =>
  Array.from({ length: len }, (_, i) => ((seed * 7 + i * 13 + ((i * i) % 5)) % 16).toString(16)).join('');

describe('secretos de producción', () => {
  it('rechaza los valores de api/.env.example y las claves sin azar', () => {
    expect(weakSecretReason('dev-access-secret-change-me-dev-access-secret-change-me-0000000000')).toBe('es un valor de ejemplo');
    expect(weakSecretReason('0'.repeat(64))).toBe('no parece aleatorio');
    expect(weakSecretReason('abababababababababababababababab')).toBe('no parece aleatorio');
    expect(weakSecretReason(hex(1, 96))).toBeNull();
  });

  it('exige que los cuatro secretos sean distintos', () => {
    const ok = {
      JWT_ACCESS_SECRET: hex(1, 96),
      BOOKING_FORM_SECRET: hex(2, 96),
      IP_HASH_SECRET: hex(3, 96),
      MFA_ENC_KEY: hex(4, 64),
    };
    expect(productionSecretProblems(ok)).toEqual([]);
    expect(productionSecretProblems({ ...ok, IP_HASH_SECRET: ok.JWT_ACCESS_SECRET })).toEqual([
      'IP_HASH_SECRET es igual a JWT_ACCESS_SECRET',
    ]);
    expect(productionSecretProblems({ ...ok, MFA_ENC_KEY: '0'.repeat(64) })).toEqual(['MFA_ENC_KEY no parece aleatorio']);
  });
});
