import type { Prisma } from '@prisma/client';
import type { MeDto } from '@fersua/shared';
import { isTermsOutdated } from './terms';

/** Campos que necesita MeDto; el mismo select sirve para login, refresh y /auth/me. */
export const ME_SELECT = {
  id: true,
  username: true,
  email: true,
  emailVerifiedAt: true,
  role: true,
  mustChangePassword: true,
  mfaEnabledAt: true,
  termsVersion: true,
  privacyVersion: true,
  profile: { select: { id: true, slug: true, status: true } },
} satisfies Prisma.UserSelect;

export type MeRow = Prisma.UserGetPayload<{ select: typeof ME_SELECT }>;

export function toMeDto(u: MeRow): MeDto {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    emailVerified: u.emailVerifiedAt !== null,
    role: u.role,
    mustChangePassword: u.mustChangePassword,
    mfaEnabled: u.mfaEnabledAt !== null,
    // El admin no es dueño de perfiles: aunque la BD tuviera uno, no se expone como suyo.
    profile: u.role === 'USER' && u.profile ? { id: u.profile.id, slug: u.profile.slug, status: u.profile.status } : null,
    termsVersion: u.termsVersion,
    privacyVersion: u.privacyVersion,
    // M3: la web muestra la re-aceptación (y el TermsGuard frena /api/me/**) mientras sea true.
    termsOutdated: isTermsOutdated(u),
  };
}
