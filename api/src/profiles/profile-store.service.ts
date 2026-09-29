import { Injectable } from '@nestjs/common';
import type { EditorProfileDto, MediaKind, MediaUsageDto, ProfileStatus } from '@fersua/shared';
import type { MediaAsset, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { ipHash } from '../common/crypto';
import { Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { AppConfig } from '../config/app-config.service';
import { MediaUrlService } from '../media/media-url.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { auditAction, type EditorActor } from './editor-actor';
import { editorProfileInclude, toEditorProfileDto } from './editor.mappers';
import { usageDto } from './profile-rules';

export type Tx = Prisma.TransactionClient;

/** Archivos de un asset cuya fila ya se borró: se eliminan del disco después del commit. */
export type AssetFiles = Pick<MediaAsset, 'id' | 'storageKey' | 'isPublic'>;

/** Condición "ninguna página usa este asset" (todas las relaciones inversas vacías). */
export const UNREFERENCED: Prisma.MediaAssetWhereInput = {
  heroOf: { is: null },
  cardOf: { is: null },
  memberOf: { is: null },
  galleryOf: { is: null },
  flyerOf: { is: null },
};

export interface RecordOptions {
  targetType?: string;
  targetId?: string;
  /** Nombres de los campos cambiados (nunca valores). */
  fields?: string[];
  /** Datos no personales adicionales (estados, tipo de imagen). */
  meta?: Record<string, unknown>;
  /** false = no tocar la fila del perfil (p. ej. porque se acaba de borrar). */
  touch?: boolean;
}

/**
 * Piezas comunes de los servicios del editor. Todas reciben el id ya autorizado por
 * ProfileScopeGuard (ScopedProfileId) y consultan las filas hijas siempre con { id, profileId }.
 */
@Injectable()
export class ProfileStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly urls: MediaUrlService,
    private readonly media: MediaService,
  ) {}

  /** Transacción de edición (tiempos holgados: reordenar 24 fotos son 24 updates). */
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(fn, { timeout: 15_000, maxWait: 5_000 });
  }

  async loadEditor(profileId: ScopedProfileId): Promise<EditorProfileDto> {
    const profile = await this.prisma.djProfile.findUnique({ where: { id: profileId }, include: editorProfileInclude() });
    if (!profile) throw Errors.notFound('Perfil no encontrado.');
    const usage = await this.usage(profileId, profile.status);
    return toEditorProfileDto(profile, usage, this.urls);
  }

  async usage(profileId: string, status: ProfileStatus, tx: Tx | PrismaService = this.prisma): Promise<MediaUsageDto> {
    const agg = await tx.mediaAsset.aggregate({ where: { profileId }, _count: { _all: true }, _sum: { bytesTotal: true } });
    return usageDto(status, agg._count._all, agg._sum.bytesTotal ?? 0);
  }

  async status(profileId: string, tx: Tx | PrismaService = this.prisma): Promise<ProfileStatus> {
    const row = await tx.djProfile.findUnique({ where: { id: profileId }, select: { status: true } });
    if (!row) throw Errors.notFound('Perfil no encontrado.');
    return row.status;
  }

  /**
   * Toda mutación del editor: marca actividad del perfil (lastActivityAt, que también mueve
   * updatedAt) y deja el registro de auditoría en la MISMA transacción.
   */
  async record(tx: Tx, profileId: string, actor: EditorActor, what: string, opts: RecordOptions = {}): Promise<void> {
    if (opts.touch !== false) await tx.djProfile.update({ where: { id: profileId }, data: { lastActivityAt: new Date() } });
    const metadata: Record<string, unknown> = { ...(opts.meta ?? {}) };
    if (opts.fields) metadata.fields = opts.fields;
    await this.audit.record(
      {
        actorId: actor.id,
        actorUsername: actor.username,
        action: auditAction(actor, what),
        targetType: opts.targetType ?? 'DjProfile',
        targetId: opts.targetId ?? profileId,
        profileId,
        metadata: Object.keys(metadata).length ? metadata : null,
        ipHash: actor.ipHash !== undefined ? actor.ipHash : actor.ip ? ipHash(this.config.ipHashSecret, actor.ip) : null,
      },
      tx,
    );
  }

  /**
   * Un asset referenciado por el editor debe ser de ESTE perfil y del kind correcto. Si no,
   * 400 con el nombre del campo (no se distingue "no existe" de "es de otro": no filtra ids).
   */
  async requireAsset(tx: Tx, profileId: string, id: string, kind: MediaKind, field: string): Promise<MediaAsset> {
    const asset = await tx.mediaAsset.findFirst({ where: { id, profileId, kind } });
    if (!asset) throw Errors.validation({ [field]: 'INVALID_IMAGE' }, 'La imagen no existe o no es del tipo correcto.');
    return asset;
  }

  /** Marca como enlazados (ya no huérfanos para el job de limpieza). */
  async attach(tx: Tx, ids: (string | null | undefined)[]): Promise<void> {
    const list = ids.filter((id): id is string => typeof id === 'string');
    if (list.length) await this.media.attach(list, tx);
  }

  /**
   * Borra (dentro de la transacción) las filas de los assets que dejaron de usarse al
   * reemplazar o quitar una imagen. Devuelve sus archivos para borrarlos después del commit.
   * Así una foto reemplazada no sigue ocupando la cuota del DJ.
   */
  async releaseAssets(tx: Tx, profileId: string, ids: (string | null | undefined)[]): Promise<AssetFiles[]> {
    const list = [...new Set(ids.filter((id): id is string => typeof id === 'string'))];
    if (!list.length) return [];
    const rows = await tx.mediaAsset.findMany({
      where: { AND: [{ id: { in: list }, profileId }, UNREFERENCED] },
      select: { id: true, storageKey: true, isPublic: true },
    });
    if (rows.length) await tx.mediaAsset.deleteMany({ where: { id: { in: rows.map((r) => r.id) }, profileId } });
    return rows;
  }

  /** Después del commit: borra del disco. Nunca lanza (una carpeta huérfana no rompe nada). */
  async removeFiles(rows: AssetFiles[]): Promise<void> {
    for (const row of rows) await this.media.removeFiles(row);
  }
}
