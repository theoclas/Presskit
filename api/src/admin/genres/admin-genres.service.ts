import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { GenreAdminDto } from '@fersua/shared';
import { AuditService } from '../../audit/audit.service';
import { Errors } from '../../common/errors';
import { PrismaService } from '../../prisma/prisma.service';
import { actorFields, type AdminActor } from '../admin-actor';
import type { CreateGenreBody, UpdateGenreBody } from './admin-genres.dto';
import { cleanGenreName, genreSlugBase, uniqueGenreSlug, type GenreNameError } from './genre-rules';

const genreSelect = {
  id: true,
  slug: true,
  name: true,
  isActive: true,
  sortOrder: true,
  _count: { select: { profiles: true } },
} satisfies Prisma.GenreSelect;

type GenreRow = Prisma.GenreGetPayload<{ select: typeof genreSelect }>;

function toGenreAdminDto(row: GenreRow): GenreAdminDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    profiles: row._count.profiles,
  };
}

const NAME_MESSAGES: Record<GenreNameError, string> = {
  REQUIRED: 'Escribe el nombre del género.',
  TOO_SHORT: 'El nombre es muy corto.',
  TOO_LONG: 'El nombre admite máximo 40 caracteres.',
  INVALID: 'El nombre debe tener letras o números.',
};

const NOT_FOUND = 'Género no encontrado.';
const IN_USE_MESSAGE = 'Este género está en uso en algún perfil. Desactívalo en lugar de borrarlo.';

/** Catálogo de géneros. El slug se fija al crear y no cambia al renombrar (filtros y enlaces). */
@Injectable()
export class AdminGenresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<GenreAdminDto[]> {
    const rows = await this.prisma.genre.findMany({
      select: genreSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toGenreAdminDto);
  }

  async create(actor: AdminActor, body: CreateGenreBody): Promise<GenreAdminDto> {
    const name = this.validName(body.name);
    await this.assertNameFree(name, null);

    const base = genreSlugBase(name);
    const similar = await this.prisma.genre.findMany({ where: { slug: { startsWith: base } }, select: { slug: true } });
    const slug = uniqueGenreSlug(base, new Set(similar.map((g) => g.slug)));
    // Al final de la lista, con saltos de 10 como la semilla (deja espacio para intercalar).
    const { _max } = await this.prisma.genre.aggregate({ _max: { sortOrder: true } });
    const sortOrder = Math.min((_max.sortOrder ?? 0) + 10, 99_999);

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.genre.create({ data: { name, slug, sortOrder }, select: genreSelect });
      await this.audit.record(
        { ...actorFields(actor), action: 'admin.genre.create', targetType: 'Genre', targetId: String(row.id), metadata: { slug } },
        tx,
      );
      return toGenreAdminDto(row);
    });
  }

  async update(actor: AdminActor, id: number, body: UpdateGenreBody): Promise<GenreAdminDto> {
    const current = await this.prisma.genre.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw Errors.notFound(NOT_FOUND);

    const data: Prisma.GenreUpdateInput = {};
    if (body.name !== undefined) {
      const name = this.validName(body.name);
      await this.assertNameFree(name, id);
      data.name = name;
    }
    if (body.isActive !== undefined) data.isActive = body.isActive;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    const fields = Object.keys(data);
    if (!fields.length) throw Errors.validation({ body: 'EMPTY' }, 'No enviaste ningún cambio.');

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.genre.update({ where: { id }, data, select: genreSelect });
      await this.audit.record(
        { ...actorFields(actor), action: 'admin.genre.update', targetType: 'Genre', targetId: String(id), metadata: { fields } },
        tx,
      );
      return toGenreAdminDto(row);
    });
  }

  /** Solo si ningún perfil lo usa (409 GENRE_IN_USE); si está en uso, se desactiva con PATCH. */
  async remove(actor: AdminActor, id: number): Promise<void> {
    const current = await this.prisma.genre.findUnique({ where: { id }, select: genreSelect });
    if (!current) throw Errors.notFound(NOT_FOUND);
    if (current._count.profiles > 0) throw Errors.conflict('GENRE_IN_USE', IN_USE_MESSAGE);
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.genre.delete({ where: { id } });
        await this.audit.record(
          { ...actorFields(actor), action: 'admin.genre.delete', targetType: 'Genre', targetId: String(id), metadata: { slug: current.slug } },
          tx,
        );
      });
    } catch (err) {
      // Un perfil lo eligió entre la lectura y el borrado: la FK (Restrict) lo impide.
      if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === 'P2003' || err.code === 'P2014')) {
        throw Errors.conflict('GENRE_IN_USE', IN_USE_MESSAGE);
      }
      throw err;
    }
  }

  private validName(raw: string): string {
    const { value, error } = cleanGenreName(raw);
    if (error) throw Errors.validation({ name: error }, NAME_MESSAGES[error]);
    return value;
  }

  /** La columna es única y sin distinguir mayúsculas ni tildes (collation de MySQL). */
  private async assertNameFree(name: string, exceptId: number | null): Promise<void> {
    const other = await this.prisma.genre.findFirst({
      where: { name, ...(exceptId !== null ? { id: { not: exceptId } } : {}) },
      select: { id: true },
    });
    if (other) throw Errors.conflict('GENRE_NAME_TAKEN', 'Ya existe un género con ese nombre.');
  }
}
