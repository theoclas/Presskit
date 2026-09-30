import { HttpStatus, Injectable } from '@nestjs/common';
import { LIMITS, type EditorProfileDto, type ProfileStatus } from '@fersua/shared';
import type { Prisma } from '@prisma/client';
import { AppError, Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import type { EditorActor } from './editor-actor';
import { FieldCheck } from './field-check';
import { OWNER_TRANSITIONS, submitBlocker, type OwnerAction } from './owner-rules';
import { ProfileNotifier, type OwnerStatusMail } from './profile-notifier.service';
import { STATUS_TRANSITIONS, canTransition, mediaPublicFor, publishChecklist, type StatusAction } from './profile-rules';
import { ProfileStore, type Tx } from './profile-store.service';

type TransitionRule = { readonly from: readonly ProfileStatus[]; readonly to: ProfileStatus };

export const invalidTransition = () =>
  Errors.conflict('INVALID_TRANSITION', 'Esta acción no se puede hacer con el perfil en su estado actual.');

export const legalInfoRequired = () =>
  Errors.conflict(
    'LEGAL_INFO_REQUIRED',
    'Falta el registro legal del artista (nombre, documento, dirección y teléfono). Complétalo antes de aprobar.',
  );

export const emailNotVerified = () =>
  Errors.forbidden('EMAIL_NOT_VERIFIED', 'Primero confirma tu correo con el enlace que te enviamos. Si no te llegó, pide otro desde tu panel.');

const ownerLegalInfoRequired = () =>
  Errors.conflict(
    'LEGAL_INFO_REQUIRED',
    'Completa tus datos legales (nombre, documento, dirección y teléfono) antes de enviar tu perfil a revisión.',
  );

/** Motivo que queda en un perfil aprobado cuya cuenta dueña se borró (lo ve el admin). */
export const OWNER_REMOVED_REASON = 'La cuenta del dueño se eliminó. Reactiva el perfil si la página debe seguir publicada.';

/**
 * Cambios de estado del perfil. Todos siguen el mismo orden para que archivos y BD no queden
 * desalineados: 1) mover en disco la media al lado que corresponde (pública solo si queda
 * APPROVED), 2) en UNA transacción cambiar el estado (condicionado al estado de origen) y las
 * filas isPublic, y auditar; 3) si la transacción falla, devolver los archivos.
 * Después del commit se avisa por correo (al admin al enviar; al dueño al aprobar, rechazar,
 * suspender o reactivar), sin esperar ni fallar por el correo.
 */
@Injectable()
export class ProfileStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
    private readonly media: MediaService,
    private readonly notifier: ProfileNotifier,
  ) {}

  /**
   * El dueño envía a revisión (DRAFT/REJECTED → PENDING_REVIEW). Exige, en este orden, correo
   * verificado (403 EMAIL_NOT_VERIFIED), registro legal (409 LEGAL_INFO_REQUIRED) y el resto
   * del checklist (409 PROFILE_INCOMPLETE con los faltantes en `details`). Avisa al admin.
   */
  async submit(profileId: ScopedProfileId, actor: EditorActor): Promise<EditorProfileDto> {
    const p = await this.prisma.djProfile.findUnique({
      where: { id: profileId },
      select: {
        status: true,
        displayName: true,
        slug: true,
        texts: true,
        heroImageId: true,
        whatsappNumber: true,
        bookingForm: true,
        legalInfo: { select: { id: true } },
        _count: { select: { members: true, genres: { where: { genre: { is: { isActive: true } } } } } },
      },
    });
    if (!p) throw Errors.notFound('Perfil no encontrado.');
    if (!canTransition('submit', p.status)) throw invalidTransition();
    // El correo es el de la cuenta del actor: el dueño, ya atado a este perfil por ProfileScopeGuard.
    const owner = await this.prisma.user.findUnique({ where: { id: actor.id }, select: { email: true, emailVerifiedAt: true } });
    const missing = publishChecklist({
      displayName: p.displayName,
      slug: p.slug,
      texts: p.texts,
      // Solo el dueño envía a revisión: el título de la portada tiene que ser suyo.
      ownHeroTitleRequired: true,
      heroImageId: p.heroImageId,
      activeGenres: p._count.genres,
      members: p._count.members,
      whatsappNumber: p.whatsappNumber,
      bookingForm: p.bookingForm,
      hasLegalInfo: p.legalInfo !== null,
    });
    const block = submitBlocker({ emailVerified: Boolean(owner?.email && owner.emailVerifiedAt), missing });
    if (block?.code === 'EMAIL_NOT_VERIFIED') throw emailNotVerified();
    if (block?.code === 'LEGAL_INFO_REQUIRED') throw ownerLegalInfoRequired();
    if (block?.code === 'PROFILE_INCOMPLETE') {
      throw new AppError(HttpStatus.CONFLICT, 'PROFILE_INCOMPLETE', 'Completa tu perfil antes de enviarlo a revisión.', block.missing);
    }
    const dto = await this.apply(profileId, actor, 'submit', p.status, { submittedAt: new Date(), statusReason: null });
    void this.notifier.profileSubmitted(profileId, { displayName: dto.displayName, slug: dto.slug });
    return dto;
  }

  /** El dueño retira su perfil de la revisión (PENDING_REVIEW → DRAFT) para seguir editándolo. */
  async withdraw(profileId: ScopedProfileId, actor: EditorActor): Promise<EditorProfileDto> {
    const from = await this.store.status(profileId);
    if (!ownerCanTransition('withdraw', from)) throw invalidTransition();
    await this.transition(profileId, actor, 'withdraw', OWNER_TRANSITIONS.withdraw, from, { submittedAt: null });
    return this.store.loadEditor(profileId);
  }

  /** Solo con el registro legal (art. 53): la página queda pública. */
  async approve(profileId: ScopedProfileId, actor: EditorActor): Promise<EditorProfileDto> {
    const p = await this.prisma.djProfile.findUnique({
      where: { id: profileId },
      select: { status: true, legalInfo: { select: { id: true } } },
    });
    if (!p) throw Errors.notFound('Perfil no encontrado.');
    if (!canTransition('approve', p.status)) throw invalidTransition();
    if (!p.legalInfo) throw legalInfoRequired();
    const now = new Date();
    const dto = await this.apply(profileId, actor, 'approve', p.status, {
      approvedAt: now,
      approvedById: actor.id,
      reviewedAt: now,
      statusReason: null,
    });
    this.notifyOwner(profileId, 'approve', null);
    return dto;
  }

  async reject(profileId: ScopedProfileId, actor: EditorActor, rawReason: string): Promise<EditorProfileDto> {
    const reason = cleanReason(rawReason);
    const from = await this.store.status(profileId);
    if (!canTransition('reject', from)) throw invalidTransition();
    const dto = await this.apply(profileId, actor, 'reject', from, { statusReason: reason, reviewedAt: new Date() });
    this.notifyOwner(profileId, 'reject', reason);
    return dto;
  }

  /** Suspender oculta la página al instante y devuelve su media a private/. */
  async suspend(profileId: ScopedProfileId, actor: EditorActor, rawReason: string): Promise<EditorProfileDto> {
    const reason = cleanReason(rawReason);
    const from = await this.store.status(profileId);
    if (!canTransition('suspend', from)) throw invalidTransition();
    const dto = await this.apply(profileId, actor, 'suspend', from, { statusReason: reason, reviewedAt: new Date() });
    this.notifyOwner(profileId, 'suspend', reason);
    return dto;
  }

  /**
   * SUSPENDED → APPROVED. Vuelve a ser público, así que exige el registro legal igual que
   * aprobar: un perfil aprobado sin él (p. ej. la semilla) no se "lava" suspendiendo y reactivando.
   */
  async reinstate(profileId: ScopedProfileId, actor: EditorActor): Promise<EditorProfileDto> {
    const p = await this.prisma.djProfile.findUnique({
      where: { id: profileId },
      select: { status: true, legalInfo: { select: { id: true } } },
    });
    if (!p) throw Errors.notFound('Perfil no encontrado.');
    if (!canTransition('reinstate', p.status)) throw invalidTransition();
    if (!p.legalInfo) throw legalInfoRequired();
    const dto = await this.apply(profileId, actor, 'reinstate', p.status, { statusReason: null, reviewedAt: new Date() });
    this.notifyOwner(profileId, 'reinstate', null);
    return dto;
  }

  /**
   * Corre `work` (borrar la cuenta del dueño) en una transacción y, si el perfil está APPROVED,
   * lo suspende en esa MISMA transacción: un perfil aprobado sin dueño es público, así que sin
   * esto borrar la cuenta publicaría (o volvería a publicar) la página. Si algo falla, no pasa
   * ninguna de las dos cosas. Devuelve true si suspendió.
   */
  async suspendForOwnerRemoval(profileId: string, actor: EditorActor, work: (tx: Tx) => Promise<void>): Promise<boolean> {
    const from = await this.store.status(profileId);
    if (!canTransition('suspend', from)) {
      await this.store.transaction(work);
      return false;
    }
    await this.transition(
      profileId,
      actor,
      'suspend',
      STATUS_TRANSITIONS.suspend,
      from,
      { statusReason: OWNER_REMOVED_REASON, reviewedAt: new Date() },
      work,
    );
    return true;
  }

  private async apply(
    profileId: ScopedProfileId,
    actor: EditorActor,
    action: StatusAction,
    from: string,
    data: Prisma.DjProfileUncheckedUpdateManyInput,
  ): Promise<EditorProfileDto> {
    await this.transition(profileId, actor, action, STATUS_TRANSITIONS[action], from, data);
    return this.store.loadEditor(profileId);
  }

  /** Aviso al dueño después del commit; nunca frena ni hace fallar la acción del admin. */
  private notifyOwner(profileId: string, action: OwnerStatusMail, reason: string | null): void {
    void this.notifier.statusChanged(profileId, action, reason);
  }

  private async transition(
    profileId: string,
    actor: EditorActor,
    action: StatusAction | OwnerAction,
    rule: TransitionRule,
    from: string,
    data: Prisma.DjProfileUncheckedUpdateManyInput,
    extra?: (tx: Tx) => Promise<void>,
  ): Promise<void> {
    const toPublic = mediaPublicFor(rule.to);
    const move = await this.media.moveProfileMedia(profileId, toPublic);
    try {
      await this.store.transaction(async (tx) => {
        // Condicionado al estado de origen (y al registro legal al hacerse público): si otra
        // petición cambió el perfil entre la lectura y aquí, no se pisa.
        const where: Prisma.DjProfileWhereInput = { id: profileId, status: { in: [...rule.from] } };
        const needsLegal = action === 'approve' || action === 'reinstate';
        if (needsLegal) where.legalInfo = { isNot: null };
        const { count } = await tx.djProfile.updateMany({ where, data: { ...data, status: rule.to } });
        if (!count) throw needsLegal ? invalidTransitionOrLegal() : invalidTransition();
        if (move.ids.length) {
          await tx.mediaAsset.updateMany({ where: { id: { in: move.ids }, profileId }, data: { isPublic: toPublic } });
        }
        await this.store.record(tx, profileId, actor, action, { meta: { from, to: rule.to } });
        if (extra) await extra(tx);
      });
    } catch (err) {
      await move.undo();
      throw err;
    }
    await this.media.syncProfileMedia(profileId, toPublic);
  }
}

function ownerCanTransition(action: OwnerAction, from: ProfileStatus): boolean {
  return OWNER_TRANSITIONS[action].from.includes(from);
}

function invalidTransitionOrLegal() {
  return Errors.conflict('INVALID_TRANSITION', 'El perfil cambió mientras lo publicabas. Recarga e intenta de nuevo.');
}

/** Motivo visible para el DJ: 10-500 caracteres después de limpiar. */
function cleanReason(raw: string): string {
  const check = new FieldCheck();
  const reason = check.text('reason', raw, LIMITS.profile.statusReasonMax, LIMITS.profile.statusReasonMin, true);
  check.assert('El motivo debe tener entre 10 y 500 caracteres.');
  return reason;
}
