import { LIMITS, cleanText } from '@fersua/shared';
import { Errors } from '../common/errors';

/**
 * Junta los errores de validación de un cuerpo para responder un solo 400 con todos los campos
 * (`details: { campo: CODIGO }`). Nunca guarda los valores recibidos, solo el nombre y el código.
 */
export class FieldCheck {
  readonly errors: Record<string, string> = {};

  /** Texto obligatorio: limpio (cleanText) y entre min y max caracteres (por code point). */
  text(field: string, raw: unknown, max: number, min = 1, multiline = false): string {
    const value = clean(raw, multiline);
    const len = [...value].length;
    if (!value) this.fail(field, 'REQUIRED');
    else if (len < min) this.fail(field, 'TOO_SHORT');
    else if (len > max) this.fail(field, 'TOO_LONG');
    return value;
  }

  /** Texto opcional: null, undefined o vacío después de limpiar → null. */
  optText(field: string, raw: unknown, max: number, multiline = false): string | null {
    if (raw === null || raw === undefined) return null;
    const value = clean(raw, multiline);
    if (!value) return null;
    if ([...value].length > max) this.fail(field, 'TOO_LONG');
    return value;
  }

  fail(field: string, code: string): void {
    if (!Object.prototype.hasOwnProperty.call(this.errors, field)) this.errors[field] = code;
  }

  get ok(): boolean {
    return Object.keys(this.errors).length === 0;
  }

  /** Lanza 400 VALIDATION_FAILED si hubo algún error. */
  assert(message?: string): void {
    if (!this.ok) throw Errors.validation({ ...this.errors }, message);
  }
}

function clean(raw: unknown, multiline: boolean): string {
  return cleanText(raw, multiline ? { multiline: true, maxLines: LIMITS.texts.multilineMaxLines } : {});
}
