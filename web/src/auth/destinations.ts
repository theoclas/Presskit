import { isSafeNextPath, type MeDto } from '@fersua/shared';

/** Inicio de cada rol: el admin va a /admin y el DJ a su panel. */
export function homeFor(user: Pick<MeDto, 'role'>): string {
  return user.role === 'ADMIN' ? '/admin' : '/panel';
}

/** `next` solo se respeta si es una ruta interna segura del área de ese rol. */
export function safeNextFor(user: Pick<MeDto, 'role'>, next: string | null | undefined): string | null {
  if (!isSafeNextPath(next)) return null;
  const home = homeFor(user);
  return next === home || next.startsWith(`${home}/`) ? next : null;
}

/** A dónde ir después de ingresar (o de cambiar la contraseña temporal). */
export function destinationAfterLogin(user: Pick<MeDto, 'role' | 'mustChangePassword'>, next: string | null | undefined): string {
  if (user.mustChangePassword) {
    return isSafeNextPath(next) ? `/cambiar-clave?next=${encodeURIComponent(next)}` : '/cambiar-clave';
  }
  return safeNextFor(user, next) ?? homeFor(user);
}
