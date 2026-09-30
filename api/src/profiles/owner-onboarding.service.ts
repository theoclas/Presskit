import { Injectable } from '@nestjs/common';
import {
  LIMITS,
  defaultFormConfig,
  normalizeSlug,
  type EditorProfileDto,
  type OwnerGenreDto,
  type SlugAvailabilityDto,
} from '@fersua/shared';
import { Prisma } from '@prisma/client';
import { Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { PrismaService } from '../prisma/prisma.service';
import type { OnboardingBody } from './dto/owner.dto';
import type { EditorActor } from './editor-actor';
import { FieldCheck } from './field-check';
import { slugAvailability } from './owner-rules';
import { checkSlugFormat, slugTaken } from './profile-editor.service';
import { ProfileStore } from './profile-store.service';

export const profileExists = () => Errors.conflict('PROFILE_EXISTS', 'Ya tienes un perfil DJ. Cada cuenta puede tener uno solo.');

/**
 * Primer paso del DJ que se registró (docs/api-m3.md, "Onboarding"): crear su perfil, consultar
 * si una dirección está libre y la lista de géneros para el editor. Estas rutas no pasan por
 * ProfileScopeGuard (el usuario todavía no tiene perfil); el rol USER lo exigen @Roles y el
 * RolesGuard por prefijo (/api/me/**).
 */
@Injectable()
export class OwnerOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
  ) {}

  /**
   * Crea el perfil del dueño en DRAFT, con textos vacíos (valores por defecto) y el formulario
   * por defecto. No exige correo verificado: eso se pide para subir fotos y para enviar.
   * 409 PROFILE_EXISTS si ya tiene uno (también si dos peticiones compiten: índice único userId).
   */
  async create(actor: EditorActor, body: OnboardingBody, hasProfile: boolean): Promise<EditorProfileDto> {
    // Primero lo que ya se sabe (JwtAuthGuard releyó el perfil de la BD): un segundo onboarding
    // es 409 aunque el cuerpo traiga otra cosa mal.
    if (hasProfile) throw profileExists();
    const slug = checkSlugFormat(body.slug);
    const check = new FieldCheck();
    const displayName = check.text('displayName', body.displayName, LIMITS.profile.displayNameMax, LIMITS.profile.displayNameMin);
    check.assert();

    let id: string;
    try {
      id = await this.store.transaction(async (tx) => {
        // El rol y el perfil se releen dentro de la transacción: nunca se confía en el token.
        const user = await tx.user.findUnique({ where: { id: actor.id }, select: { role: true, status: true, profile: { select: { id: true } } } });
        if (!user || user.role !== 'USER' || user.status !== 'ACTIVE') throw Errors.forbidden();
        if (user.profile) throw profileExists();
        const [profile, redirect] = await Promise.all([
          tx.djProfile.findUnique({ where: { slug }, select: { id: true } }),
          tx.slugRedirect.findUnique({ where: { fromSlug: slug }, select: { profileId: true } }),
        ]);
        if (profile || redirect) throw slugTaken();
        // Campos uno por uno: el DTO nunca se esparce hacia Prisma.
        const created = await tx.djProfile.create({
          data: {
            slug,
            displayName,
            userId: actor.id,
            status: 'DRAFT',
            texts: {},
            bookingForm: defaultFormConfig() as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        await this.store.record(tx, created.id, actor, 'create', { fields: ['slug', 'displayName'] });
        return created.id;
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = JSON.stringify(err.meta?.target ?? '');
        throw target.includes('userId') ? profileExists() : slugTaken();
      }
      throw err;
    }
    return this.store.loadEditor(id as ScopedProfileId);
  }

  /** ¿Está libre la dirección? Su propio slug (o una redirección suya) cuenta como libre. */
  async slugAvailability(raw: string, ownProfileId: string | null): Promise<SlugAvailabilityDto> {
    const slug = normalizeSlug(raw);
    const format = slugAvailability(slug, { profileId: null, redirectProfileId: null }, ownProfileId);
    if (!format.available) return format;
    const [profile, redirect] = await Promise.all([
      this.prisma.djProfile.findUnique({ where: { slug }, select: { id: true } }),
      this.prisma.slugRedirect.findUnique({ where: { fromSlug: slug }, select: { profileId: true } }),
    ]);
    return slugAvailability(slug, { profileId: profile?.id ?? null, redirectProfileId: redirect?.profileId ?? null }, ownProfileId);
  }

  /** Géneros activos para el selector del editor del dueño, en el orden del catálogo. */
  async genres(): Promise<OwnerGenreDto[]> {
    const rows = await this.prisma.genre.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      select: { id: true, slug: true, name: true },
    });
    return rows.map((g) => ({ id: g.id, slug: g.slug, name: g.name }));
  }
}
