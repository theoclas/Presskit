import { validatePassword } from '@fersua/shared';
import {
  TEMP_PASSWORD_ALPHABET,
  TEMP_PASSWORD_BITS,
  TEMP_PASSWORD_LENGTH,
  generateTemporaryPassword,
  temporaryPasswordExpiry,
} from './temp-password';

describe('generateTemporaryPassword', () => {
  it('16 caracteres, solo del alfabeto sin ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateTemporaryPassword();
      expect(pw).toHaveLength(TEMP_PASSWORD_LENGTH);
      for (const ch of pw) expect(TEMP_PASSWORD_ALPHABET).toContain(ch);
      expect(pw).not.toMatch(/[0O1lIo]/);
    }
  });

  it('el alfabeto no tiene repetidos ni caracteres ambiguos', () => {
    expect(new Set(TEMP_PASSWORD_ALPHABET).size).toBe(TEMP_PASSWORD_ALPHABET.length);
    expect(TEMP_PASSWORD_ALPHABET).not.toMatch(/[0O1lIo]/);
    expect(TEMP_PASSWORD_ALPHABET).toHaveLength(54);
  });

  it('entropía de al menos 90 bits', () => {
    expect(TEMP_PASSWORD_BITS).toBeGreaterThanOrEqual(90);
  });

  it('no se repite y usa todo el alfabeto de forma pareja', () => {
    const seen = new Set<string>();
    const counts = new Map<string, number>();
    const N = 2000;
    for (let i = 0; i < N; i++) {
      const pw = generateTemporaryPassword();
      seen.add(pw);
      for (const ch of pw) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    }
    expect(seen.size).toBe(N);
    expect(counts.size).toBe(TEMP_PASSWORD_ALPHABET.length);
    // 32.000 caracteres / 54 ≈ 593 por símbolo. Margen amplio para que la prueba no sea frágil.
    const expected = (N * TEMP_PASSWORD_LENGTH) / TEMP_PASSWORD_ALPHABET.length;
    for (const c of counts.values()) {
      expect(c).toBeGreaterThan(expected * 0.7);
      expect(c).toBeLessThan(expected * 1.3);
    }
  });

  it('siempre pasa la política de contraseñas del login', () => {
    for (let i = 0; i < 200; i++) {
      expect(validatePassword(generateTemporaryPassword({ username: 'dj.prueba' }), { username: 'dj.prueba' })).toBeNull();
    }
  });

  it('descarta un intento que no pasa la política y vuelve a generar', () => {
    // Fuente falsa: primero 16 veces el índice 0 ('A' repetida: TOO_SIMPLE), luego una secuencia variada.
    let calls = 0;
    const random = (max: number) => (calls++ < TEMP_PASSWORD_LENGTH ? 0 : calls % max);
    const pw = generateTemporaryPassword({ random });
    expect(pw).not.toBe('A'.repeat(TEMP_PASSWORD_LENGTH));
    expect(validatePassword(pw)).toBeNull();
  });

  it('falla en lugar de devolver algo débil si la fuente está rota', () => {
    expect(() => generateTemporaryPassword({ random: () => 0 })).toThrow();
  });
});

describe('temporaryPasswordExpiry', () => {
  it('vence a las 72 horas', () => {
    const now = new Date('2026-09-29T12:00:00.000Z');
    expect(temporaryPasswordExpiry(now).toISOString()).toBe('2026-10-02T12:00:00.000Z');
  });
});
