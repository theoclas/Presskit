import { HttpStatus } from '@nestjs/common';
import type { UserRole } from '@prisma/client';
import { LIMITS, PASSWORD_ERROR_MESSAGES, normalizePassword, validatePassword, type PasswordError } from '@fersua/shared';
import { AppError } from '../../common/errors';

/** Mínimo según el rol: el admin necesita 12 (plan aprobado), los DJs 10. */
export function passwordMinLength(role: UserRole): number {
  return role === 'ADMIN' ? LIMITS.user.adminPasswordMin : LIMITS.user.passwordMin;
}

/** Error de política de la contraseña nueva, o null si pasa. */
export function checkNewPassword(password: string, opts: { username: string; role: UserRole }): PasswordError | null {
  return validatePassword(password, { username: opts.username, minLength: passwordMinLength(opts.role) });
}

export function passwordErrorMessage(err: PasswordError, role: UserRole): string {
  if (err === 'TOO_SHORT') return `Usa al menos ${passwordMinLength(role)} caracteres.`;
  return PASSWORD_ERROR_MESSAGES[err];
}

/** 400 PASSWORD_WEAK con details.newPassword = código (TOO_SHORT, TOO_COMMON…) para la web. */
export function weakPasswordError(err: PasswordError, role: UserRole): AppError {
  return new AppError(HttpStatus.BAD_REQUEST, 'PASSWORD_WEAK', passwordErrorMessage(err, role), { newPassword: err });
}

/** Mismas contraseñas después de NFKC (la forma en que se hashean). */
export function samePassword(a: string, b: string): boolean {
  return normalizePassword(a) === normalizePassword(b);
}

/** Más de 128 caracteres después de normalizar: ni se intenta verificar. */
export function passwordTooLong(password: string): boolean {
  return [...normalizePassword(password)].length > LIMITS.user.passwordMax;
}
