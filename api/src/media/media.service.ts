import { Injectable, Logger } from '@nestjs/common';
import type { MediaKind } from '@fersua/shared';
import { Prisma, type MediaAsset } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ImagePipelineService } from './image-pipeline.service';
import type { StoredVariant } from './media-url.service';
import { StorageService } from './storage.service';

type Tx = Prisma.TransactionClient | PrismaService;

export interface IngestInput {
  buffer: Buffer;
  kind: MediaKind;
  profileId: string;
  uploadedById?: string | null;
  /** true solo si el perfil está APPROVED: los demás van a private/ (M3). */
  isPublic: boolean;
}

const PROFILE_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Clave aleatoria de 16 caracteres [A-Za-z0-9_-] (96 bits): nombre de carpeta imposible de
 * adivinar. Empieza siempre por letra o número para que un "rm"/"ls" en el VPS no la lea
 * como una opción.
 */
export function newMediaKey(): string {
  for (;;) {
    const key = randomBytes(12).toString('base64url').replace(/[^A-Za-z0-9_-]/g, '');
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{15}$/.test(key)) return key;
  }
}

/**
 * Punto de entrada único para guardar imágenes: lo usan la seed y (desde M2/M3) el
 * controlador de subidas. Procesa, escribe en disco y crea la fila MediaAsset.
 * El asset queda "huérfano" (attachedAt NULL) hasta que alguien lo enlace con attach();
 * si nunca se enlaza, el job horario lo borra a las 24 h.
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: ImagePipelineService,
    private readonly storage: StorageService,
  ) {}

  async ingest(input: IngestInput): Promise<MediaAsset> {
    if (!PROFILE_ID_RE.test(input.profileId)) throw new Error('profileId inválido');
    const processed = await this.pipeline.process(input.buffer, input.kind);

    const storageKey = `${input.profileId}/${newMediaKey()}`;
    const files = processed.og ? [...processed.variants, processed.og] : processed.variants;
    await this.storage.writeAsset(storageKey, input.isPublic, files);

    const variants: StoredVariant[] = processed.variants.map((v) => ({
      w: v.w,
      h: v.h,
      bytes: v.data.length,
      file: v.file,
    }));
    // Las dimensiones guardadas son las de la variante más grande: es la proporción que
    // realmente se sirve (CARD sale recortada a 4:5) y evita saltos de layout en la web.
    const largest = processed.variants[processed.variants.length - 1]!;
    try {
      return await this.prisma.mediaAsset.create({
        data: {
          profileId: input.profileId,
          uploadedById: input.uploadedById ?? null,
          kind: input.kind,
          storageKey,
          variants: variants as unknown as Prisma.InputJsonValue,
          hasOg: processed.og !== null,
          width: largest.w,
          height: largest.h,
          bytesTotal: files.reduce((sum, f) => sum + f.data.length, 0),
          originalBytes: input.buffer.length,
          originalMime: processed.mime,
          sha256: createHash('sha256').update(input.buffer).digest('hex'),
          isPublic: input.isPublic,
        },
      });
    } catch (err) {
      // Sin fila no hay forma de encontrar los archivos después: se borran ya.
      await this.storage.deleteAsset(storageKey, input.isPublic).catch((e: unknown) => {
        this.logger.error(`No se pudieron borrar los archivos de ${storageKey}: ${String(e)}`);
      });
      throw err;
    }
  }

  /** Marca assets como enlazados (ya no son huérfanos). Se llama dentro de la misma transacción. */
  async attach(ids: string[], tx: Tx = this.prisma, at: Date = new Date()): Promise<void> {
    if (!ids.length) return;
    await tx.mediaAsset.updateMany({ where: { id: { in: ids } }, data: { attachedAt: at } });
  }

  /** Borra la fila y después los archivos. Si falla el disco, el archivo queda sin fila pero invisible. */
  async remove(asset: Pick<MediaAsset, 'id' | 'storageKey' | 'isPublic'>, tx: Tx = this.prisma): Promise<void> {
    await tx.mediaAsset.delete({ where: { id: asset.id } });
    await this.removeFiles(asset);
  }

  async removeFiles(asset: Pick<MediaAsset, 'storageKey' | 'isPublic'>): Promise<void> {
    await this.storage.deleteAsset(asset.storageKey, asset.isPublic).catch((e: unknown) => {
      this.logger.error(`No se pudieron borrar los archivos de ${asset.storageKey}: ${String(e)}`);
    });
  }

  /**
   * Borra las filas de media de un perfil. Primero suelta hero/card para no depender del orden
   * en que MySQL resuelve las cascadas circulares perfil ↔ asset. Las carpetas se borran
   * aparte, con removeProfileFiles(), DESPUÉS del commit (si la transacción falla, siguen ahí).
   */
  async removeAllForProfile(profileId: string, tx: Tx = this.prisma): Promise<number> {
    await tx.djProfile.updateMany({ where: { id: profileId }, data: { heroImageId: null, cardImageId: null } });
    const { count } = await tx.mediaAsset.deleteMany({ where: { profileId } });
    return count;
  }

  async removeProfileFiles(profileId: string): Promise<void> {
    await this.storage.deleteProfileFolders(profileId);
  }

  /** Mueve los archivos entre private/ y public/ y actualiza la fila (aprobación, M3). */
  async setPublic(asset: Pick<MediaAsset, 'id' | 'storageKey' | 'isPublic'>, isPublic: boolean): Promise<void> {
    if (asset.isPublic === isPublic) return;
    await this.storage.moveAsset(asset.storageKey, asset.isPublic, isPublic);
    try {
      await this.prisma.mediaAsset.update({ where: { id: asset.id }, data: { isPublic } });
    } catch (err) {
      await this.storage.moveAsset(asset.storageKey, isPublic, asset.isPublic).catch(() => undefined);
      throw err;
    }
  }
}
