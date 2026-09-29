import { Injectable } from '@nestjs/common';
import {
  LIMITS,
  cleanText,
  defaultFormConfig,
  normalizeSlug,
  todayBogota,
  type AdminProfileListItemDto,
  type EditorProfileDto,
  type Paginated,
} from '@fersua/shared';
import { Prisma } from '@prisma/client';
import { Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { MediaUrlService } from '../media/media-url.service';
import { MediaService } from '../media/media.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnlyFromDb, dateOnlyToDb } from '../public/date-only';
import type { AdminProfilesQuery, CreateProfileBody, FeatureBody } from './dto/admin-profiles.dto';
import type { EditorActor } from './editor-actor';
import { FieldCheck } from './field-check';
import { checkSlugFormat, slugTaken } from './profile-editor.service';
import { ProfileStore, type Tx } from './profile-store.service';

const DEFAULT_PAGE_SIZE = 20;

const userNotEligible = () =>
  Errors.conflict('USER_NOT_ELIGIBLE', 'Ese usuario no puede recibir el perfil: debe ser un DJ activo (no admin) sin perfil asignado.');

/** Tickets que se refieren a este perfil y hay que poder atender antes de borrarlo. */
const PROFILE_TICKET_TYPES = ['REPORTE_PERFIL', 'SOLICITUD_DATOS_DJ'] as const;

function listInclude(today: string) {
  return {
    cardImage: true,
    heroImage: true,
    user: { select: { id: true, username: true, status: true } },
    legalInfo: { select: { id: true } },
    events: {
      where: { isHidden: false, date: { gte: dateOnlyToDb(today) } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 1,
      select: { date: true },
    },
    _count: { select: { bookings: { where: { status: 'NEW' } } } },
  } satisfies Prisma.DjProfileInclude;
}

/** Ciclo de vida de perfiles desde el admin (crear, destacar, dueño, borrar). */
@Injectable()
export class AdminProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
    private readonly media: MediaService,
    private readonly urls: MediaUrlService,
  ) {}

  /** El id de la URL, verificado contra la BD. Solo lo llama el controlador de admin (rol ADMIN). */
  async requireProfile(id: string): Promise<ScopedProfileId> {
    const row = await this.prisma.djProfile.findUnique({ where: { id }, select: { id: true } });
    if (!row) throw Errors.notFound('Perfil no encontrado.');
    return row.id as ScopedProfileId;
  }

  async list(query: AdminProfilesQuery): Promise<Paginated<AdminProfileListItemDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const where: Prisma.DjProfileWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.featured) where.featured = query.featured === 'true';
    const q = query.q ? cleanText(query.q).slice(0, 60) : '';
    if (q) {
      // La collation utf8mb4_unicode_ci ya compara sin mayúsculas ni tildes.
      where.OR = [
        { slug: { contains: q.toLowerCase() } },
        { displayName: { contains: q } },
        { user: { is: { username: { contains: q.toLowerCase() } } } },
      ];
    }
    const today = todayBogota();
    const [total, rows] = await this.prisma.$transaction([
      this.prisma.djProfile.count({ where }),
      this.prisma.djProfile.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: listInclude(today),
      }),
    ]);
    const now = Date.now();
    const items: AdminProfileListItemDto[] = rows.map((p) => ({
      id: p.id,
      slug: p.slug,
      displayName: p.displayName,
      status: p.status,
      featured: p.featured,
      featuredRank: p.featuredRank,
      // Firmada si es privada: el admin ve la miniatura de perfiles aún sin aprobar.
      cardImage: this.urls.toPreviewImageDto(p.cardImage ?? p.heroImage, `Foto de ${p.displayName}`, now),
      owner: p.user ? { id: p.user.id, username: p.user.username, status: p.user.status } : null,
      nextEventDate: p.events[0] ? dateOnlyFromDb(p.events[0].date) : null,
      newBookings: p._count.bookings,
      hasLegalInfo: p.legalInfo !== null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
    return { items, page, pageSize, total };
  }

  /** Perfil nuevo en DRAFT, con textos vacíos (valores por defecto) y el formulario por defecto. */
  async create(actor: EditorActor, body: CreateProfileBody): Promise<EditorProfileDto> {
    const slug = checkSlugFormat(body.slug);
    const check = new FieldCheck();
    const displayName = check.text('displayName', body.displayName, LIMITS.profile.displayNameMax, LIMITS.profile.displayNameMin);
    check.assert();

    let id: string;
    try {
      id = await this.store.transaction(async (tx) => {
        await this.assertSlugFree(tx, slug);
        if (body.userId) await this.assertEligibleUser(tx, body.userId);
        const profile = await tx.djProfile.create({
          data: {
            slug,
            displayName,
            userId: body.userId ?? null,
            status: 'DRAFT',
            texts: {},
            bookingForm: defaultFormConfig() as unknown as Prisma.InputJsonValue,
          },
          select: { id: true },
        });
        await this.store.record(tx, profile.id, actor, 'create', { meta: { withOwner: Boolean(body.userId) } });
        return profile.id;
      });
    } catch (err) {
      throw mapUniqueError(err);
    }
    return this.store.loadEditor(id as ScopedProfileId);
  }

  async setFeatured(profileId: ScopedProfileId, actor: EditorActor, body: FeatureBody): Promise<EditorProfileDto> {
    await this.store.transaction(async (tx) => {
      const data: Prisma.DjProfileUpdateInput = { featured: body.featured };
      const fields = ['featured'];
      if (body.featuredRank !== undefined) {
        data.featuredRank = body.featuredRank;
        fields.push('featuredRank');
      }
      await tx.djProfile.update({ where: { id: profileId }, data });
      await this.store.record(tx, profileId, actor, 'feature', { fields });
    });
    return this.store.loadEditor(profileId);
  }

  /**
   * Asigna o quita el dueño (con step-up). Solo a usuarios USER sin perfil. El dueño anterior
   * pierde el acceso en su siguiente petición: el guard relee su perfil de la BD cada vez.
   */
  async setOwner(profileId: ScopedProfileId, actor: EditorActor, userId: string | null): Promise<EditorProfileDto> {
    try {
      await this.store.transaction(async (tx) => {
        const current = await tx.djProfile.findUnique({ where: { id: profileId }, select: { userId: true } });
        if (!current) throw Errors.notFound('Perfil no encontrado.');
        if (current.userId === userId) return;
        if (userId) await this.assertEligibleUser(tx, userId);
        await tx.djProfile.update({ where: { id: profileId }, data: { userId } });
        await this.store.record(tx, profileId, actor, 'owner', { fields: ['owner'], meta: { assigned: userId !== null } });
      });
    } catch (err) {
      throw mapUniqueError(err);
    }
    return this.store.loadEditor(profileId);
  }

  /**
   * Borra el perfil y todo lo suyo (con step-up y el slug escrito como confirmación). Orden fijo
   * por la referencia circular perfil ↔ media: soltar hero/card, borrar filas de media y el
   * perfil (cascada: integrantes, redes, galería, rider, fechas, solicitudes, redirecciones)
   * en una transacción, y SOLO después del commit borrar las carpetas en disco.
   * - No se puede con un reporte o una solicitud de datos (art. 53) abiertos sobre el perfil:
   *   primero se atienden (después no habría perfil al que referirse).
   * - El registro del art. 53 NO se borra: queda sin perfil, con el slug y el nombre de ese
   *   momento, y el job de retención lo purga a los 12 meses (docs/diseno/11 §5).
   */
  async remove(profileId: ScopedProfileId, actor: EditorActor, confirm: string): Promise<void> {
    const p = await this.prisma.djProfile.findUnique({ where: { id: profileId }, select: { slug: true, displayName: true } });
    if (!p) throw Errors.notFound('Perfil no encontrado.');
    if (normalizeSlug(confirm) !== p.slug) {
      throw Errors.badRequest('CONFIRM_MISMATCH', 'Escribe la dirección exacta del perfil para confirmar el borrado.');
    }
    const openTickets = await this.prisma.ticket.count({
      where: { profileId, type: { in: [...PROFILE_TICKET_TYPES] }, status: { in: ['OPEN', 'IN_PROGRESS'] } },
    });
    if (openTickets) {
      throw Errors.conflict(
        'PROFILE_HAS_OPEN_TICKETS',
        'Este perfil tiene reportes o solicitudes de datos (art. 53) sin cerrar. Atiéndelos en «PQRS y reportes» antes de borrarlo.',
      );
    }
    await this.store.transaction(async (tx) => {
      // Primero el registro legal: se desprende del perfil (si no, la FK lo dejaría huérfano sin fecha de cierre).
      const legal = await tx.djLegalInfo.updateMany({
        where: { profileId },
        data: { profileId: null, closedAt: new Date(), closedProfileSlug: p.slug, closedDisplayName: p.displayName },
      });
      const bookings = await tx.bookingRequest.count({ where: { profileId } });
      const media = await this.media.removeAllForProfile(profileId, tx);
      await tx.djProfile.delete({ where: { id: profileId } });
      // La auditoría no tiene FK: sobrevive al borrado.
      await this.store.record(tx, profileId, actor, 'delete', {
        touch: false,
        meta: { slug: p.slug, media, bookings, legalInfoRetained: legal.count > 0 },
      });
    });
    await this.media.removeProfileFiles(profileId);
  }

  private async assertSlugFree(tx: Tx, slug: string): Promise<void> {
    const [profile, redirect] = await Promise.all([
      tx.djProfile.findUnique({ where: { slug }, select: { id: true } }),
      tx.slugRedirect.findUnique({ where: { fromSlug: slug }, select: { profileId: true } }),
    ]);
    if (profile || redirect) throw slugTaken();
  }

  /** Solo un DJ activo sin perfil: con la cuenta suspendida, un perfil aprobado dejaría de verse sin aviso. */
  private async assertEligibleUser(tx: Tx, userId: string): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { role: true, status: true, profile: { select: { id: true } } },
    });
    if (!user) throw Errors.notFound('Usuario no encontrado.');
    if (user.role !== 'USER' || user.status !== 'ACTIVE' || user.profile) throw userNotEligible();
  }
}

/** Carreras contra los índices únicos: slug tomado o usuario que ya recibió otro perfil. */
function mapUniqueError(err: unknown): unknown {
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = JSON.stringify(err.meta?.target ?? '');
    return target.includes('userId') ? userNotEligible() : slugTaken();
  }
  return err;
}
