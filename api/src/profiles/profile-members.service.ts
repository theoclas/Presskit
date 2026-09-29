import { Injectable } from '@nestjs/common';
import { LIMITS, type EditorMemberDto } from '@fersua/shared';
import type { Prisma } from '@prisma/client';
import { Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { MediaUrlService } from '../media/media-url.service';
import { PrismaService } from '../prisma/prisma.service';
import type { MemberCreateBody, MemberUpdateBody } from './dto/content.dto';
import type { SocialLinkBody } from './dto/editor.dto';
import type { EditorActor } from './editor-actor';
import { memberInclude, toEditorMemberDto } from './editor.mappers';
import { FieldCheck } from './field-check';
import { normalizeLinks } from './profile-rules';
import { ProfileStore, type AssetFiles, type Tx } from './profile-store.service';

const memberNotFound = () => Errors.notFound('Integrante no encontrado.');

/** Valida que `ids` sea exactamente el conjunto actual (mismo tamaño, sin extraños). */
export function assertSameSet(ids: readonly string[], existing: readonly string[]): void {
  const have = new Set(existing);
  if (ids.length !== have.size || ids.some((id) => !have.has(id))) {
    throw Errors.validation({ ids: 'MISMATCH' }, 'La lista no coincide con los elementos actuales. Recarga e intenta de nuevo.');
  }
}

@Injectable()
export class ProfileMembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
    private readonly urls: MediaUrlService,
  ) {}

  async list(profileId: ScopedProfileId): Promise<EditorMemberDto[]> {
    const rows = await this.prisma.member.findMany({
      where: { profileId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
      include: memberInclude,
    });
    const now = Date.now();
    return rows.map((m) => toEditorMemberDto(m, this.urls, now));
  }

  async create(profileId: ScopedProfileId, actor: EditorActor, body: MemberCreateBody): Promise<EditorMemberDto> {
    const check = new FieldCheck();
    const name = check.text('name', body.name, LIMITS.members.nameMax);
    const role = check.optText('role', body.role, LIMITS.members.roleMax);
    const description = check.optText('description', body.description, LIMITS.members.descriptionMax);
    check.assert();

    const id = await this.store.transaction(async (tx) => {
      const count = await tx.member.count({ where: { profileId } });
      if (count >= LIMITS.members.max) {
        throw Errors.conflict('MEMBERS_LIMIT', `Puedes tener máximo ${LIMITS.members.max} integrantes.`);
      }
      if (body.photoId) await this.requireFreePhoto(tx, profileId, body.photoId, null);
      const last = await tx.member.aggregate({ where: { profileId }, _max: { sortOrder: true } });
      const member = await tx.member.create({
        data: {
          profileId,
          name,
          role,
          description,
          photoId: body.photoId ?? null,
          sortOrder: (last._max.sortOrder ?? -1) + 1,
        },
        select: { id: true },
      });
      await this.store.attach(tx, [body.photoId]);
      await this.store.record(tx, profileId, actor, 'member.create', { targetType: 'Member', targetId: member.id });
      return member.id;
    });
    return this.get(profileId, id);
  }

  async update(profileId: ScopedProfileId, actor: EditorActor, id: string, body: MemberUpdateBody): Promise<EditorMemberDto> {
    const current = await this.prisma.member.findFirst({ where: { id, profileId } });
    if (!current) throw memberNotFound();

    const check = new FieldCheck();
    const data: Prisma.MemberUncheckedUpdateInput = {};
    const changed: string[] = [];
    if (body.name !== undefined) {
      const name = check.text('name', body.name, LIMITS.members.nameMax);
      if (name !== current.name) {
        data.name = name;
        changed.push('name');
      }
    }
    if (body.role !== undefined) {
      const role = check.optText('role', body.role, LIMITS.members.roleMax);
      if (role !== current.role) {
        data.role = role;
        changed.push('role');
      }
    }
    if (body.description !== undefined) {
      const description = check.optText('description', body.description, LIMITS.members.descriptionMax);
      if (description !== current.description) {
        data.description = description;
        changed.push('description');
      }
    }
    check.assert();
    const photoChange = body.photoId !== undefined && body.photoId !== current.photoId;
    if (!changed.length && !photoChange) return this.get(profileId, id);

    let released: AssetFiles[] = [];
    await this.store.transaction(async (tx) => {
      if (photoChange) {
        if (body.photoId) await this.requireFreePhoto(tx, profileId, body.photoId, id);
        data.photoId = body.photoId ?? null;
        changed.push('photo');
      }
      await this.updateScoped(tx, profileId, id, data);
      if (photoChange) {
        await this.store.attach(tx, [body.photoId]);
        released = await this.store.releaseAssets(tx, profileId, [current.photoId]);
      }
      await this.store.record(tx, profileId, actor, 'member.update', { targetType: 'Member', targetId: id, fields: changed });
    });
    await this.store.removeFiles(released);
    return this.get(profileId, id);
  }

  async remove(profileId: ScopedProfileId, actor: EditorActor, id: string): Promise<void> {
    const current = await this.prisma.member.findFirst({ where: { id, profileId }, select: { id: true, photoId: true } });
    if (!current) throw memberNotFound();
    let released: AssetFiles[] = [];
    await this.store.transaction(async (tx) => {
      // Sus redes se van en cascada; la foto se borra aparte (no debe seguir ocupando cuota).
      const { count } = await tx.member.deleteMany({ where: { id, profileId } });
      if (!count) throw memberNotFound();
      released = await this.store.releaseAssets(tx, profileId, [current.photoId]);
      await this.store.record(tx, profileId, actor, 'member.delete', { targetType: 'Member', targetId: id });
    });
    await this.store.removeFiles(released);
  }

  async reorder(profileId: ScopedProfileId, actor: EditorActor, ids: string[]): Promise<EditorMemberDto[]> {
    await this.store.transaction(async (tx) => {
      const existing = await tx.member.findMany({ where: { profileId }, select: { id: true } });
      assertSameSet(ids, existing.map((m) => m.id));
      for (const [i, memberId] of ids.entries()) {
        await tx.member.updateMany({ where: { id: memberId, profileId }, data: { sortOrder: i } });
      }
      await this.store.record(tx, profileId, actor, 'member.order', { fields: ['sortOrder'] });
    });
    return this.list(profileId);
  }

  async setSocials(profileId: ScopedProfileId, actor: EditorActor, id: string, links: SocialLinkBody[]): Promise<EditorMemberDto> {
    const check = new FieldCheck();
    const clean = normalizeLinks(links, LIMITS.social.perMemberMax, check);
    check.assert('Revisa los enlaces: alguno no es válido o está repetido.');
    await this.store.transaction(async (tx) => {
      const member = await tx.member.findFirst({ where: { id, profileId }, select: { id: true } });
      if (!member) throw memberNotFound();
      // profileId y memberId salen del alcance autorizado y de la fila verificada, nunca del cuerpo.
      await tx.socialLink.deleteMany({ where: { profileId, memberId: member.id } });
      if (clean.length) {
        await tx.socialLink.createMany({
          data: clean.map((l, i) => ({ profileId, memberId: member.id, platform: l.platform, url: l.url, label: l.label, sortOrder: i })),
        });
      }
      await this.store.record(tx, profileId, actor, 'member.socials', { targetType: 'Member', targetId: id, fields: ['socials'] });
    });
    return this.get(profileId, id);
  }

  private async get(profileId: ScopedProfileId, id: string): Promise<EditorMemberDto> {
    const row = await this.prisma.member.findFirst({ where: { id, profileId }, include: memberInclude });
    if (!row) throw memberNotFound();
    return toEditorMemberDto(row, this.urls, Date.now());
  }

  /** Foto del mismo perfil, kind MEMBER y que no sea la de otro integrante. */
  private async requireFreePhoto(tx: Tx, profileId: string, photoId: string, memberId: string | null): Promise<void> {
    await this.store.requireAsset(tx, profileId, photoId, 'MEMBER', 'photoId');
    const other = await tx.member.findFirst({
      where: { profileId, photoId, ...(memberId ? { NOT: { id: memberId } } : {}) },
      select: { id: true },
    });
    if (other) throw Errors.conflict('MEDIA_IN_USE', 'Esa foto ya es de otro integrante.');
  }

  /** update con alcance: updateMany admite { id, profileId } (update solo acepta campos únicos). */
  private async updateScoped(tx: Tx, profileId: string, id: string, data: Prisma.MemberUncheckedUpdateInput): Promise<void> {
    const { count } = await tx.member.updateMany({ where: { id, profileId }, data: data as Prisma.MemberUncheckedUpdateManyInput });
    if (!count) throw memberNotFound();
  }
}
