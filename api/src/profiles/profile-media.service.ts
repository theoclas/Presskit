import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { MediaAssetDto, MediaKind } from '@fersua/shared';
import { AppError, Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { MediaUrlService } from '../media/media-url.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import type { EditorActor } from './editor-actor';
import { mediaPublicFor, quotaError, quotaFor } from './profile-rules';
import { ProfileStore, UNREFERENCED } from './profile-store.service';

export const quotaExceeded = (status: Parameters<typeof quotaFor>[0]) => {
  const q = quotaFor(status);
  return new AppError(
    HttpStatus.CONFLICT,
    'QUOTA_EXCEEDED',
    `Llegaste al límite de fotos de tu perfil (${q.assets} archivos o ${Math.round(q.bytes / 1024 / 1024)} MB). Borra alguna para subir otra.`,
  );
};

@Injectable()
export class ProfileMediaService {
  private readonly logger = new Logger(ProfileMediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
    private readonly media: MediaService,
    private readonly urls: MediaUrlService,
  ) {}

  /**
   * Sube una imagen: cuota (antes y después de procesar), pipeline de sharp (magic bytes,
   * decodificación segura, WebP sin metadatos) y escritura atómica. Queda huérfana
   * (attachedAt NULL) hasta que el editor la enlace; si no, el job horario la borra a las 24 h.
   */
  async upload(profileId: ScopedProfileId, actor: EditorActor, kind: MediaKind, file: Express.Multer.File | undefined): Promise<MediaAssetDto> {
    if (!file || !Buffer.isBuffer(file.buffer) || file.buffer.length === 0) {
      throw Errors.badRequest('FILE_REQUIRED', 'Selecciona una imagen para subir.');
    }
    const status = await this.store.status(profileId);
    const before = await this.store.usage(profileId, status);
    if (quotaError(status, before, 0, 1)) throw quotaExceeded(status);

    // Los perfiles sin aprobar guardan en private/ (se ven solo con URL firmada).
    let asset = await this.media.ingest({
      buffer: file.buffer,
      kind,
      profileId,
      uploadedById: actor.id,
      isPublic: mediaPublicFor(status),
    });

    try {
      // Segundo chequeo con el tamaño real: dos subidas simultáneas pudieron pasar el primero.
      // `after` ya incluye esta imagen.
      const after = await this.store.usage(profileId, status);
      if (quotaError(status, after, 0, 0)) throw quotaExceeded(status);
      // Si el perfil se aprobó o suspendió mientras se procesaba, la foto va al lado correcto.
      const nowStatus = await this.store.status(profileId);
      if (mediaPublicFor(nowStatus) !== asset.isPublic) {
        await this.media.setPublic(asset, mediaPublicFor(nowStatus));
        asset = { ...asset, isPublic: mediaPublicFor(nowStatus) };
      }
      await this.store.transaction((tx) =>
        this.store.record(tx, profileId, actor, 'media.upload', { targetType: 'MediaAsset', targetId: asset.id, meta: { kind } }),
      );
    } catch (err) {
      await this.media.remove(asset).catch((e: unknown) => this.logger.error(`No se pudo deshacer la subida ${asset.id}: ${String(e)}`));
      throw err;
    }

    const dto = this.urls.toEditorAssetDto(asset);
    if (!dto) throw Errors.unavailable('UPLOAD_FAILED', 'No pudimos guardar la imagen. Intenta de nuevo.');
    return dto;
  }

  /** Borra una imagen que ninguna página usa. Si está en uso: 409 (primero quítala de donde esté). */
  async remove(profileId: ScopedProfileId, actor: EditorActor, id: string): Promise<void> {
    const asset = await this.prisma.mediaAsset.findFirst({ where: { id, profileId }, select: { id: true, storageKey: true, isPublic: true } });
    if (!asset) throw Errors.notFound('Imagen no encontrada.');
    await this.store.transaction(async (tx) => {
      const { count } = await tx.mediaAsset.deleteMany({ where: { AND: [{ id, profileId }, UNREFERENCED] } });
      if (!count) throw Errors.conflict('MEDIA_IN_USE', 'Esta imagen está en uso. Quítala primero de donde aparece.');
      await this.store.record(tx, profileId, actor, 'media.delete', { targetType: 'MediaAsset', targetId: id });
    });
    await this.media.removeFiles(asset);
  }
}
