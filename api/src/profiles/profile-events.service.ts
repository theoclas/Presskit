import { Injectable } from '@nestjs/common';
import { LIMITS, normalizeHttpsUrl, todayBogota, type EditorEventDto, type EventCtaType } from '@fersua/shared';
import type { Prisma } from '@prisma/client';
import { Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { MediaUrlService } from '../media/media-url.service';
import { PrismaService } from '../prisma/prisma.service';
import { dateOnlyFromDb, dateOnlyToDb } from '../public/date-only';
import type { EventCreateBody, EventUpdateBody } from './dto/content.dto';
import type { EditorActor } from './editor-actor';
import { eventInclude, toEditorEventDto } from './editor.mappers';
import { FieldCheck } from './field-check';
import { checkEventDate } from './profile-rules';
import { ProfileStore, type AssetFiles, type Tx } from './profile-store.service';

const E = LIMITS.events;
const eventNotFound = () => Errors.notFound('Fecha no encontrada.');

const DATE_MESSAGES: Record<string, string> = {
  PAST: 'La fecha no puede ser anterior a hoy.',
  TOO_FAR: `La fecha puede estar máximo ${E.maxDaysAhead} días adelante.`,
};

/** URL del botón: obligatoria y https con host público cuando el tipo es URL; si no, null. */
function ctaUrlFor(check: FieldCheck, type: EventCtaType, raw: string | null | undefined): string | null {
  if (type !== 'URL') return null;
  if (!raw || !raw.trim()) {
    check.fail('ctaUrl', 'REQUIRED');
    return null;
  }
  const r = normalizeHttpsUrl(raw);
  if (!r.ok) {
    check.fail('ctaUrl', r.error);
    return null;
  }
  return r.url;
}

@Injectable()
export class ProfileEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
    private readonly urls: MediaUrlService,
  ) {}

  /** Próximas (desde hoy, ascendente) o pasadas (descendente). Incluye las ocultas. */
  async list(profileId: ScopedProfileId, scope: 'upcoming' | 'past' = 'upcoming'): Promise<EditorEventDto[]> {
    const today = todayBogota();
    const todayDb = dateOnlyToDb(today);
    const past = scope === 'past';
    const rows = await this.prisma.event.findMany({
      where: { profileId, date: past ? { lt: todayDb } : { gte: todayDb } },
      orderBy: past ? [{ date: 'desc' }, { startTime: 'desc' }] : [{ date: 'asc' }, { startTime: 'asc' }],
      take: E.storedMax,
      include: eventInclude,
    });
    const now = Date.now();
    return rows.map((e) => toEditorEventDto(e, today, this.urls, now));
  }

  async create(profileId: ScopedProfileId, actor: EditorActor, body: EventCreateBody): Promise<EditorEventDto> {
    const today = todayBogota();
    const check = new FieldCheck();
    const dateError = checkEventDate(body.date, today, actor.asAdmin);
    if (dateError) check.fail('date', dateError);
    const title = check.optText('title', body.title, E.titleMax);
    const venue = check.text('venue', body.venue, E.venueMax);
    const city = check.optText('city', body.city, E.cityMax);
    const ctaLabel = check.optText('ctaLabel', body.ctaLabel, E.ctaLabelMax);
    const ctaUrl = ctaUrlFor(check, body.ctaType, body.ctaUrl);
    check.assert(dateError ? DATE_MESSAGES[dateError] : undefined);

    const id = await this.store.transaction(async (tx) => {
      await this.checkLimits(tx, profileId, body.date >= today, true);
      if (body.flyerId) await this.requireFreeFlyer(tx, profileId, body.flyerId, null);
      const event = await tx.event.create({
        data: {
          profileId,
          date: dateOnlyToDb(body.date),
          startTime: body.startTime ?? null,
          title,
          venue,
          city,
          flyerId: body.flyerId ?? null,
          ctaType: body.ctaType,
          ctaUrl,
          ctaLabel,
          isHidden: body.isHidden ?? false,
        },
        select: { id: true },
      });
      await this.store.attach(tx, [body.flyerId]);
      await this.store.record(tx, profileId, actor, 'event.create', { targetType: 'Event', targetId: event.id });
      return event.id;
    });
    return this.get(profileId, id);
  }

  async update(profileId: ScopedProfileId, actor: EditorActor, id: string, body: EventUpdateBody): Promise<EditorEventDto> {
    const current = await this.prisma.event.findFirst({ where: { id, profileId } });
    if (!current) throw eventNotFound();
    const today = todayBogota();
    const currentDate = dateOnlyFromDb(current.date);

    const check = new FieldCheck();
    const data: Prisma.EventUncheckedUpdateManyInput = {};
    const changed: string[] = [];
    const set = <K extends keyof Prisma.EventUncheckedUpdateManyInput>(
      field: string,
      key: K,
      value: Prisma.EventUncheckedUpdateManyInput[K],
      before: unknown,
    ) => {
      if (value === before) return;
      data[key] = value;
      changed.push(field);
    };

    let dateError: string | null = null;
    // Solo se valida la fecha si cambia: corregir el lugar de una fecha ya pasada sigue permitido.
    const dateChange = body.date !== undefined && body.date !== currentDate;
    if (dateChange) {
      dateError = checkEventDate(body.date, today, actor.asAdmin);
      if (dateError) check.fail('date', dateError);
      else {
        data.date = dateOnlyToDb(body.date!);
        changed.push('date');
      }
    }
    if (body.startTime !== undefined) set('startTime', 'startTime', body.startTime ?? null, current.startTime);
    if (body.title !== undefined) set('title', 'title', check.optText('title', body.title, E.titleMax), current.title);
    if (body.venue !== undefined) set('venue', 'venue', check.text('venue', body.venue, E.venueMax), current.venue);
    if (body.city !== undefined) set('city', 'city', check.optText('city', body.city, E.cityMax), current.city);
    if (body.ctaLabel !== undefined) set('ctaLabel', 'ctaLabel', check.optText('ctaLabel', body.ctaLabel, E.ctaLabelMax), current.ctaLabel);
    if (body.isHidden !== undefined) set('isHidden', 'isHidden', body.isHidden, current.isHidden);
    if (body.ctaType !== undefined || body.ctaUrl !== undefined) {
      const type = body.ctaType ?? current.ctaType;
      set('ctaType', 'ctaType', type, current.ctaType);
      set('ctaUrl', 'ctaUrl', ctaUrlFor(check, type, body.ctaUrl !== undefined ? body.ctaUrl : current.ctaUrl), current.ctaUrl);
    }
    check.assert(dateError ? DATE_MESSAGES[dateError] : undefined);

    const flyerChange = body.flyerId !== undefined && body.flyerId !== current.flyerId;
    if (!changed.length && !flyerChange) return this.get(profileId, id);

    let released: AssetFiles[] = [];
    await this.store.transaction(async (tx) => {
      // Una fecha pasada que se mueve al futuro ocupa un cupo de "próximas".
      if (dateChange && currentDate < today && body.date! >= today) await this.checkLimits(tx, profileId, true, false);
      if (flyerChange) {
        if (body.flyerId) await this.requireFreeFlyer(tx, profileId, body.flyerId, id);
        data.flyerId = body.flyerId ?? null;
        changed.push('flyer');
      }
      const { count } = await tx.event.updateMany({ where: { id, profileId }, data });
      if (!count) throw eventNotFound();
      if (flyerChange) {
        await this.store.attach(tx, [body.flyerId]);
        released = await this.store.releaseAssets(tx, profileId, [current.flyerId]);
      }
      await this.store.record(tx, profileId, actor, 'event.update', { targetType: 'Event', targetId: id, fields: changed });
    });
    await this.store.removeFiles(released);
    return this.get(profileId, id);
  }

  async remove(profileId: ScopedProfileId, actor: EditorActor, id: string): Promise<void> {
    const current = await this.prisma.event.findFirst({ where: { id, profileId }, select: { flyerId: true } });
    if (!current) throw eventNotFound();
    let released: AssetFiles[] = [];
    await this.store.transaction(async (tx) => {
      const { count } = await tx.event.deleteMany({ where: { id, profileId } });
      if (!count) throw eventNotFound();
      released = await this.store.releaseAssets(tx, profileId, [current.flyerId]);
      await this.store.record(tx, profileId, actor, 'event.delete', { targetType: 'Event', targetId: id });
    });
    await this.store.removeFiles(released);
  }

  private async get(profileId: ScopedProfileId, id: string): Promise<EditorEventDto> {
    const row = await this.prisma.event.findFirst({ where: { id, profileId }, include: eventInclude });
    if (!row) throw eventNotFound();
    return toEditorEventDto(row, todayBogota(), this.urls, Date.now());
  }

  /** Topes: 30 próximas (incluye ocultas) y 100 guardadas en total. */
  private async checkLimits(tx: Tx, profileId: string, upcoming: boolean, adding: boolean): Promise<void> {
    if (adding) {
      const total = await tx.event.count({ where: { profileId } });
      if (total >= E.storedMax) {
        throw Errors.conflict('EVENTS_LIMIT', `Puedes guardar máximo ${E.storedMax} fechas. Borra algunas del archivo.`);
      }
    }
    if (upcoming) {
      const next = await tx.event.count({ where: { profileId, date: { gte: dateOnlyToDb(todayBogota()) } } });
      if (next >= E.upcomingMax) {
        throw Errors.conflict('EVENTS_UPCOMING_LIMIT', `Puedes tener máximo ${E.upcomingMax} fechas próximas.`);
      }
    }
  }

  /** Flyer del mismo perfil, kind FLYER y que no use otra fecha. */
  private async requireFreeFlyer(tx: Tx, profileId: string, flyerId: string, eventId: string | null): Promise<void> {
    await this.store.requireAsset(tx, profileId, flyerId, 'FLYER', 'flyerId');
    const other = await tx.event.findFirst({ where: { profileId, flyerId, ...(eventId ? { NOT: { id: eventId } } : {}) }, select: { id: true } });
    if (other) throw Errors.conflict('MEDIA_IN_USE', 'Ese flyer ya está en otra fecha.');
  }
}
