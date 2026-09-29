import { LIMITS } from '@fersua/shared';
import { AppError } from '../common/errors';
import { MULTIPART_OVERHEAD_BYTES, UPLOAD_SLOTS, UploadGate, declaredLengthTooLarge, mapUploadError } from './upload.interceptor';

describe('mapUploadError', () => {
  const codeOf = (e: Error) => (e as AppError).code;
  const statusOf = (e: Error) => (e as AppError).getStatus();

  it('archivo grande → 413 IMAGE_TOO_LARGE (sin el mensaje en inglés de multer)', () => {
    const e = mapUploadError({ code: 'LIMIT_FILE_SIZE', message: 'File too large' });
    expect(statusOf(e)).toBe(413);
    expect(codeOf(e)).toBe('IMAGE_TOO_LARGE');
  });

  it('otros límites de multer o multipart roto → 400 UPLOAD_INVALID', () => {
    for (const err of [{ code: 'LIMIT_FILE_COUNT' }, { code: 'LIMIT_UNEXPECTED_FILE' }, { code: 'LIMIT_FIELD_COUNT' }, new Error('Unexpected end of form')]) {
      const e = mapUploadError(err);
      expect(statusOf(e)).toBe(400);
      expect(codeOf(e)).toBe('UPLOAD_INVALID');
    }
  });
});

describe('antes de leer el cuerpo', () => {
  it('Content-Length imposible → se rechaza sin leer; sin cabecera decide multer', () => {
    const len = (v?: string) => ({ headers: v === undefined ? {} : { 'content-length': v } });
    expect(declaredLengthTooLarge(len(String(LIMITS.upload.maxBytes)))).toBe(false);
    expect(declaredLengthTooLarge(len(String(LIMITS.upload.maxBytes + MULTIPART_OVERHEAD_BYTES)))).toBe(false);
    expect(declaredLengthTooLarge(len(String(LIMITS.upload.maxBytes + MULTIPART_OVERHEAD_BYTES + 1)))).toBe(true);
    expect(declaredLengthTooLarge(len())).toBe(false);
    expect(declaredLengthTooLarge(len('basura'))).toBe(false);
  });

  it(`UploadGate: ${UPLOAD_SLOTS.global} en total y ${UPLOAD_SLOTS.perUser} por usuario; liberar es idempotente`, () => {
    const gate = new UploadGate();
    const a1 = gate.tryEnter('a');
    const a2 = gate.tryEnter('a');
    expect(a1).not.toBeNull();
    expect(a2).not.toBeNull();
    // Una sola cuenta no ocupa todos los cupos.
    expect(gate.tryEnter('a')).toBeNull();
    const b1 = gate.tryEnter('b');
    expect(b1).not.toBeNull();
    // Lleno en total.
    expect(gate.tryEnter('c')).toBeNull();
    a1!();
    a1!();
    expect(gate.inFlight).toBe(2);
    expect(gate.tryEnter('c')).not.toBeNull();
    expect(gate.tryEnter('a')).toBeNull();
  });
});
