import { HttpStatus, Injectable } from '@nestjs/common';
import { LIMITS, type EditorProfileDto } from '@fersua/shared';
import type { Prisma } from '@prisma/client';
import { AppError, Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import type { EditorActor } from './editor-actor';
import { FieldCheck } from './field-check';
import { STATUS_TRANSITIONS, canTransition, mediaPublicFor, publishChecklist, type StatusAction } from './profile-rules';
import { ProfileStore, type Tx } from './profile-store.service';

export const invalidTransition = () =>
  Errors.conflict('INVALID_TRANSITION', 'Esta acción no se puede hacer con el perfil en su estado actual.');

export const legalInfoRequired = () =>
  Errors.conflict(
    'LEGAL_INFO_REQUIRED',
    'Falta el registro legal del artista (nombre, documento, dirección y teléfono). Complétalo antes de aprobar.',
  );

/** Motivo que queda en un perfil aprobado cuya cuenta dueña se borró (lo ve el admin). */
export const OWNER_REMOVED_REASON = 'La cuenta del dueño se eliminó. Reactiva el perfil si la página debe seguir publicada.';

/**
 * Cambios de estado del perfil. Todos siguen el mismo orden para que archivos y BD no queden
 * desalineados: 1) mover en disco la media al lado que corresponde (pública solo si queda
 * APPROVED), 2) en UNA transacción cambiar el estado (condicionado al estado de origen) y las
 * filas isPublic, y auditar; 3) si la transacción falla, devolver los archivos.
 */
@Injectable()
export class ProfileStatusService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
    private readonly media: MediaService,
  ) {}

  /** El dueño envía a revisión (DRAFT/REJECTED → PENDING_REVIEW) si el perfil está completo. */
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
    const missing = publishChecklist({
      displayName: p.displayName,
      slug: p.slug,
      texts: p.texts,
      heroImageId: p.heroImageId,
      activeGenres: p._count.genres,
      members: p._count.members,
      whatsappNumber: p.whatsappNumber,
      bookingForm: p.bookingForm,
      hasLegalInfo: p.legalInfo !== null,
    });
    if (Object.keys(missing).length) {
      throw new AppError(HttpStatus.CONFLICT, 'PROFILE_INCOMPLETE', 'Completa tu perfil antes de enviarlo a revisión.', missing);
    }
    return this.apply(profileId, actor, 'submit', p.status, { submittedAt: new Date(), statusReason: null });
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
    return this.apply(profileId, actor, 'approve', p.status, {
      approvedAt: now,
      approvedById: actor.id,
      reviewedAt: now,
      statusReason: null,
    });
  }

  async reject(profileId: ScopedProfileId, actor: EditorActor, rawReason: string): Promise<EditorProfileDto> {
    const reason = cleanReason(rawReason);
    const from = await this.store.status(profileId);
    if (!canTransition('reject', from)) throw invalidTransition();
    return this.apply(profileId, actor, 'reject', from, { statusReason: reason, reviewedAt: new Date() });
  }

  /** Suspender oculta la página al instante y devuelve su media a private/. */
  async suspend(profileId: ScopedProfileId, actor: EditorActor, rawReason: string): Promise<EditorProfileDto> {
    const reason = cleanReason(rawReason);
    const from = await this.store.status(profileId);
    if (!canTransition('suspend', from)) throw invalidTransition();
    return this.apply(profileId, actor, 'suspend', from, { statusReason: reason, reviewedAt: new Date() });
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
    return this.apply(profileId, actor, 'reinstate', p.status, { statusReason: null, reviewedAt: new Date() });
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
    await this.transition(profileId, actor, 'suspend', from, { statusReason: OWNER_REMOVED_REASON, reviewedAt: new Date() }, work);
    return true;
  }

  private async apply(
    profileId: ScopedProfileId,
    actor: EditorActor,
    action: StatusAction,
    from: string,
    data: Prisma.DjProfileUncheckedUpdateManyInput,
  ): Promise<EditorProfileDto> {
    await this.transition(profileId, actor, action, from, data);
    return this.store.loadEditor(profileId);
  }

  private async transition(
    profileId: string,
    actor: EditorActor,
    action: StatusAction,
    from: string,
    data: Prisma.DjProfileUncheckedUpdateManyInput,
    extra?: (tx: Tx) => Promise<void>,
  ): Promise<void> {
    const rule = STATUS_TRANSITIONS[action];
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
