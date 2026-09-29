import { describe, expect, it } from 'vitest';
import { docNumberProblem } from '../src/editor-kit/sections/LegalInfoSection';

// El editor decide con normalizeDocNumber de shared, la misma función que usa el api.
describe('docNumberProblem (registro del art. 53)', () => {
  it('acepta los formatos que guarda el api', () => {
    expect(docNumberProblem('NIT', '900.123.456-7')).toBeNull();
    expect(docNumberProblem('CC', '1.023.456.789')).toBeNull();
    expect(docNumberProblem('CE', 'ab 12345')).toBeNull();
    expect(docNumberProblem('PASAPORTE', 'AB123456')).toBeNull();
  });

  it('explica por qué no sirve', () => {
    expect(docNumberProblem('CC', '   ')).toBe('Escribe el número de documento.');
    expect(docNumberProblem('CC', 'AB1234')).toMatch(/Solo números/);
    expect(docNumberProblem('CE', '12')).toMatch(/Solo letras y números/);
    expect(docNumberProblem('CC', '1'.repeat(21))).toBe('Máximo 20 caracteres.');
  });
});
