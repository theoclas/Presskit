import { Injectable } from '@nestjs/common';
import { LIMITS, type EditorGalleryItemDto } from '@fersua/shared';
import { Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { MediaUrlService } from '../media/media-url.service';
import { PrismaService } from '../prisma/prisma.service';
import type { GalleryAddBody } from './dto/content.dto';
import type { EditorActor } from './editor-actor';
import { galleryInclude, toEditorGalleryItemDto } from './editor.mappers';
import { FieldCheck } from './field-check';
import { assertSameSet } from './profile-members.service';
import { ProfileStore, type AssetFiles } from './profile-store.service';

const itemNotFound = () => Errors.notFound('Foto no encontrada.');

@Injectable()
export class ProfileGalleryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
    private readonly urls: MediaUrlService,
  ) {}

  async list(profileId: ScopedProfileId): Promise<EditorGalleryItemDto[]> {
    const rows = await this.prisma.galleryItem.findMany({
      where: { profileId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: galleryInclude,
    });
    const now = Date.now();
    return rows.map((g) => toEditorGalleryItemDto(g, this.urls, now)).filter((g): g is EditorGalleryItemDto => g !== null);
  }

  async add(profileId: ScopedProfileId, actor: EditorActor, body: GalleryAddBody): Promise<EditorGalleryItemDto> {
    const check = new FieldCheck();
    const alt = check.optText('alt', body.alt, LIMITS.gallery.altMax);
    check.assert();

    const id = await this.store.transaction(async (tx) => {
      const count = await tx.galleryItem.count({ where: { profileId } });
      if (count >= LIMITS.gallery.max) {
        throw Errors.conflict('GALLERY_LIMIT', `La galería admite máximo ${LIMITS.gallery.max} fotos.`);
      }
      await this.store.requireAsset(tx, profileId, body.mediaId, 'GALLERY', 'mediaId');
      const used = await tx.galleryItem.findFirst({ where: { mediaId: body.mediaId, profileId }, select: { id: true } });
      if (used) throw Errors.conflict('MEDIA_IN_USE', 'Esa foto ya está en la galería.');
      const last = await tx.galleryItem.aggregate({ where: { profileId }, _max: { sortOrder: true } });
      const item = await tx.galleryItem.create({
        data: { profileId, mediaId: body.mediaId, alt, sortOrder: (last._max.sortOrder ?? -1) + 1 },
        select: { id: true },
      });
      await this.store.attach(tx, [body.mediaId]);
      await this.store.record(tx, profileId, actor, 'gallery.add', { targetType: 'GalleryItem', targetId: item.id });
      return item.id;
    });
    return this.get(profileId, id);
  }

  async setAlt(profileId: ScopedProfileId, actor: EditorActor, id: string, rawAlt: string | null): Promise<EditorGalleryItemDto> {
    const check = new FieldCheck();
    const alt = check.optText('alt', rawAlt, LIMITS.gallery.altMax);
    check.assert();
    await this.store.transaction(async (tx) => {
      const { count } = await tx.galleryItem.updateMany({ where: { id, profileId }, data: { alt } });
      if (!count) throw itemNotFound();
      await this.store.record(tx, profileId, actor, 'gallery.update', { targetType: 'GalleryItem', targetId: id, fields: ['alt'] });
    });
    return this.get(profileId, id);
  }

  /** Quita la foto de la galería y borra la imagen (no queda ocupando cuota). */
  async remove(profileId: ScopedProfileId, actor: EditorActor, id: string): Promise<void> {
    const current = await this.prisma.galleryItem.findFirst({ where: { id, profileId }, select: { mediaId: true } });
    if (!current) throw itemNotFound();
    let released: AssetFiles[] = [];
    await this.store.transaction(async (tx) => {
      const { count } = await tx.galleryItem.deleteMany({ where: { id, profileId } });
      if (!count) throw itemNotFound();
      released = await this.store.releaseAssets(tx, profileId, [current.mediaId]);
      await this.store.record(tx, profileId, actor, 'gallery.delete', { targetType: 'GalleryItem', targetId: id });
    });
    await this.store.removeFiles(released);
  }

  async reorder(profileId: ScopedProfileId, actor: EditorActor, ids: string[]): Promise<EditorGalleryItemDto[]> {
    await this.store.transaction(async (tx) => {
      const existing = await tx.galleryItem.findMany({ where: { profileId }, select: { id: true } });
      assertSameSet(ids, existing.map((g) => g.id));
      for (const [i, itemId] of ids.entries()) {
        await tx.galleryItem.updateMany({ where: { id: itemId, profileId }, data: { sortOrder: i } });
      }
      await this.store.record(tx, profileId, actor, 'gallery.order', { fields: ['sortOrder'] });
    });
    return this.list(profileId);
  }

  private async get(profileId: ScopedProfileId, id: string): Promise<EditorGalleryItemDto> {
    const row = await this.prisma.galleryItem.findFirst({ where: { id, profileId }, include: galleryInclude });
    const dto = row ? toEditorGalleryItemDto(row, this.urls, Date.now()) : null;
    if (!dto) throw itemNotFound();
    return dto;
  }
}
