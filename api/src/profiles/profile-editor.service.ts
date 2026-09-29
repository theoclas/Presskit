import { HttpStatus, Injectable } from '@nestjs/common';
import {
  LIMITS,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizeSlug,
  normalizeWhatsappNumber,
  todayBogota,
  validateFormConfig,
  validateSlug,
  validateTexts,
  type EditorProfileDto,
  type PublicDjProfileDto,
} from '@fersua/shared';
import { Prisma } from '@prisma/client';
import { AppError, Errors } from '../common/errors';
import type { ScopedProfileId } from '../common/scope/profile-scope.guard';
import { MediaUrlService } from '../media/media-url.service';
import { PrismaService } from '../prisma/prisma.service';
import { profileDetailInclude } from '../public/public-profile.query';
import { mapProfile } from '../public/public.mappers';
import type {
  BookingFormBody,
  RiderItemBody,
  SocialLinkBody,
  UpdateProfileBody,
} from './dto/editor.dto';
import type { EditorActor } from './editor-actor';
import { storedTexts } from './editor.mappers';
import { FieldCheck } from './field-check';
import { normalizeLinks, redirectsToEvict, slugCooldownUntil } from './profile-rules';
import { ProfileStore, type AssetFiles } from './profile-store.service';

const SHOW_COLUMNS = {
  gallery: 'showGallery',
  rider: 'showRider',
  events: 'showEvents',
  openDateRow: 'showOpenDateRow',
  form: 'formEnabled',
} as const;

export const slugTaken = () => Errors.conflict('SLUG_TAKEN', 'Esa dirección ya está en uso. Prueba con otra.');

/** Valida formato y palabras reservadas. Devuelve el slug normalizado. */
export function checkSlugFormat(raw: string): string {
  const slug = normalizeSlug(raw);
  const err = validateSlug(slug);
  if (err === 'RESERVED') throw Errors.validation({ slug: 'RESERVED' }, 'Esa dirección está reservada. Prueba con otra.');
  if (err) {
    throw Errors.validation(
      { slug: 'FORMAT' },
      'La dirección debe tener de 3 a 40 caracteres: minúsculas, números y guiones (sin guiones al inicio o al final).',
    );
  }
  return slug;
}

@Injectable()
export class ProfileEditorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly store: ProfileStore,
    private readonly urls: MediaUrlService,
  ) {}

  get(profileId: ScopedProfileId): Promise<EditorProfileDto> {
    return this.store.loadEditor(profileId);
  }

  /** Página pública tal como se vería, en cualquier estado; imágenes privadas con URL firmada. */
  async preview(profileId: ScopedProfileId): Promise<PublicDjProfileDto> {
    const profile = await this.prisma.djProfile.findUnique({
      where: { id: profileId },
      include: profileDetailInclude(todayBogota()),
    });
    if (!profile) throw Errors.notFound('Perfil no encontrado.');
    return { ...mapProfile(profile, this.urls.previewMapper()), preview: { status: profile.status } };
  }

  async update(profileId: ScopedProfileId, actor: EditorActor, body: UpdateProfileBody): Promise<EditorProfileDto> {
    const current = await this.prisma.djProfile.findUnique({ where: { id: profileId } });
    if (!current) throw Errors.notFound('Perfil no encontrado.');

    const check = new FieldCheck();
    const data: Prisma.DjProfileUncheckedUpdateInput = {};
    const changed: string[] = [];
    const set = <K extends keyof Prisma.DjProfileUncheckedUpdateInput>(
      field: string,
      key: K,
      value: Prisma.DjProfileUncheckedUpdateInput[K],
      before: unknown,
    ) => {
      if (value === before) return;
      data[key] = value;
      changed.push(field);
    };
    const P = LIMITS.profile;

    // Se copian los campos uno por uno: el DTO nunca se esparce hacia Prisma.
    if (body.displayName !== undefined) {
      set('displayName', 'displayName', check.text('displayName', body.displayName, P.displayNameMax, P.displayNameMin), current.displayName);
    }
    if (body.tagline !== undefined) set('tagline', 'tagline', check.optText('tagline', body.tagline, P.taglineMax), current.tagline);
    if (body.seoDescription !== undefined) {
      set('seoDescription', 'seoDescription', check.optText('seoDescription', body.seoDescription, P.seoDescriptionMax), current.seoDescription);
    }
    if (body.city !== undefined) set('city', 'city', check.optText('city', body.city, P.cityMax), current.city);

    if (body.whatsappNumber !== undefined) {
      let wa: string | null = null;
      if (body.whatsappNumber !== null && body.whatsappNumber.trim()) {
        wa = normalizeWhatsappNumber(body.whatsappNumber);
        if (!wa) check.fail('whatsappNumber', 'INVALID');
      }
      set('whatsappNumber', 'whatsappNumber', wa, current.whatsappNumber);
    }
    if (body.publicEmail !== undefined) {
      let email: string | null = null;
      if (body.publicEmail !== null && body.publicEmail.trim()) {
        email = normalizeEmail(body.publicEmail);
        if (!isValidEmail(email)) check.fail('publicEmail', 'INVALID');
      }
      set('publicEmail', 'publicEmail', email, current.publicEmail);
    }
    if (body.publicPhone !== undefined) {
      const phone = check.optText('publicPhone', body.publicPhone, LIMITS.legalInfo.phoneMax);
      if (phone && !isValidPhone(phone)) check.fail('publicPhone', 'INVALID');
      set('publicPhone', 'publicPhone', phone, current.publicPhone);
    }
    if (body.palette !== undefined) set('palette', 'palette', body.palette, current.palette);

    if (body.texts !== undefined) {
      const { texts, errors } = validateTexts(body.texts);
      for (const [key, code] of Object.entries(errors)) check.fail(`texts.${key}`, code);
      // Parche sobre lo guardado: '' devuelve la clave a su valor por defecto.
      const next: Record<string, string> = { ...storedTexts(current.texts) };
      const textChanges: string[] = [];
      for (const [key, value] of Object.entries(texts as Record<string, string>)) {
        if (value === '') {
          if (key in next) {
            delete next[key];
            textChanges.push(`texts.${key}`);
          }
        } else if (next[key] !== value) {
          next[key] = value;
          textChanges.push(`texts.${key}`);
        }
      }
      if (textChanges.length) {
        data.texts = next as Prisma.InputJsonValue;
        changed.push(...textChanges);
      }
    }

    if (body.show !== undefined) {
      for (const [key, column] of Object.entries(SHOW_COLUMNS) as [keyof typeof SHOW_COLUMNS, (typeof SHOW_COLUMNS)[keyof typeof SHOW_COLUMNS]][]) {
        const value = body.show[key];
        if (value !== undefined) set(`show.${key}`, column, value, current[column]);
      }
    }
    if (body.formOpenWhatsapp !== undefined) set('formOpenWhatsapp', 'formOpenWhatsapp', body.formOpenWhatsapp, current.formOpenWhatsapp);
    if (body.notifyByEmail !== undefined) set('notifyByEmail', 'notifyByEmail', body.notifyByEmail, current.notifyByEmail);
    check.assert();

    const heroChange = body.heroImageId !== undefined && body.heroImageId !== current.heroImageId;
    const cardChange = body.cardImageId !== undefined && body.cardImageId !== current.cardImageId;
    if (!changed.length && !heroChange && !cardChange) return this.store.loadEditor(profileId);

    let released: AssetFiles[] = [];
    await this.store.transaction(async (tx) => {
      if (heroChange) {
        if (body.heroImageId) await this.store.requireAsset(tx, profileId, body.heroImageId, 'HERO', 'heroImageId');
        data.heroImageId = body.heroImageId ?? null;
        changed.push('heroImage');
      }
      if (cardChange) {
        if (body.cardImageId) await this.store.requireAsset(tx, profileId, body.cardImageId, 'CARD', 'cardImageId');
        data.cardImageId = body.cardImageId ?? null;
        changed.push('cardImage');
      }
      await tx.djProfile.update({ where: { id: profileId }, data });
      await this.store.attach(tx, [heroChange ? body.heroImageId : null, cardChange ? body.cardImageId : null]);
      released = await this.store.releaseAssets(tx, profileId, [
        heroChange ? current.heroImageId : null,
        cardChange ? current.cardImageId : null,
      ]);
      await this.store.record(tx, profileId, actor, 'update', { fields: changed });
    });
    await this.store.removeFiles(released);
    return this.store.loadEditor(profileId);
  }

  /**
   * Cambia la dirección pública. El slug viejo queda como SlugRedirect (301), con un máximo de
   * 5 por perfil. El dueño de un perfil aprobado puede cambiarla una vez cada 30 días.
   */
  async setSlug(profileId: ScopedProfileId, actor: EditorActor, raw: string): Promise<EditorProfileDto> {
    const slug = checkSlugFormat(raw);
    const current = await this.prisma.djProfile.findUnique({
      where: { id: profileId },
      select: { slug: true, status: true, slugChangedAt: true },
    });
    if (!current) throw Errors.notFound('Perfil no encontrado.');
    if (current.slug === slug) return this.store.loadEditor(profileId);

    const now = new Date();
    const until = slugCooldownUntil(current, actor.asAdmin, now);
    if (until) {
      throw new AppError(
        HttpStatus.CONFLICT,
        'SLUG_COOLDOWN',
        'Ya cambiaste la dirección hace poco. Podrás cambiarla de nuevo 30 días después del último cambio.',
        { availableAt: until.toISOString() },
      );
    }

    try {
      await this.store.transaction(async (tx) => {
        const owner = await tx.djProfile.findUnique({ where: { slug }, select: { id: true } });
        if (owner) throw slugTaken();
        const redirect = await tx.slugRedirect.findUnique({ where: { fromSlug: slug } });
        if (redirect && redirect.profileId !== profileId) throw slugTaken();
        // Volver a un slug propio anterior: deja de ser redirección.
        if (redirect) await tx.slugRedirect.delete({ where: { fromSlug: slug } });

        await tx.djProfile.update({ where: { id: profileId }, data: { slug, slugChangedAt: now } });
        const old = await tx.slugRedirect.findUnique({ where: { fromSlug: current.slug } });
        if (!old) await tx.slugRedirect.create({ data: { fromSlug: current.slug, profileId, createdAt: now } });

        const all = await tx.slugRedirect.findMany({ where: { profileId }, select: { fromSlug: true, createdAt: true } });
        const evict = redirectsToEvict(all);
        if (evict.length) await tx.slugRedirect.deleteMany({ where: { profileId, fromSlug: { in: evict } } });
        await this.store.record(tx, profileId, actor, 'slug', { fields: ['slug'] });
      });
    } catch (err) {
      // Dos cambios simultáneos al mismo slug: lo decide el índice único.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw slugTaken();
      throw err;
    }
    return this.store.loadEditor(profileId);
  }

  async setGenres(profileId: ScopedProfileId, actor: EditorActor, genreIds: number[]): Promise<EditorProfileDto> {
    const found = await this.prisma.genre.findMany({ where: { id: { in: genreIds }, isActive: true }, select: { id: true } });
    if (found.length !== genreIds.length) {
      throw Errors.validation({ genreIds: 'INVALID' }, 'Algún género no existe o ya no está disponible.');
    }
    await this.store.transaction(async (tx) => {
      await tx.profileGenre.deleteMany({ where: { profileId } });
      await tx.profileGenre.createMany({ data: genreIds.map((genreId, i) => ({ profileId, genreId, sortOrder: i })) });
      await this.store.record(tx, profileId, actor, 'genres', { fields: ['genres'] });
    });
    return this.store.loadEditor(profileId);
  }

  /** Redes del perfil (no las de los integrantes). Reemplaza la lista; orden = orden del arreglo. */
  async setSocials(profileId: ScopedProfileId, actor: EditorActor, links: SocialLinkBody[]): Promise<EditorProfileDto> {
    const check = new FieldCheck();
    const clean = normalizeLinks(links, LIMITS.social.perProfileMax, check);
    check.assert('Revisa los enlaces: alguno no es válido o está repetido.');
    await this.store.transaction(async (tx) => {
      await tx.socialLink.deleteMany({ where: { profileId, memberId: null } });
      if (clean.length) {
        await tx.socialLink.createMany({
          data: clean.map((l, i) => ({ profileId, memberId: null, platform: l.platform, url: l.url, label: l.label, sortOrder: i })),
        });
      }
      await this.store.record(tx, profileId, actor, 'socials', { fields: ['socials'] });
    });
    return this.store.loadEditor(profileId);
  }

  async setRider(profileId: ScopedProfileId, actor: EditorActor, items: RiderItemBody[]): Promise<EditorProfileDto> {
    const check = new FieldCheck();
    const clean = items.map((item, i) => ({
      name: check.text(`items[${i}].name`, item.name, LIMITS.rider.nameMax),
      note: check.optText(`items[${i}].note`, item.note, LIMITS.rider.noteMax),
    }));
    check.assert();
    await this.store.transaction(async (tx) => {
      await tx.riderItem.deleteMany({ where: { profileId } });
      if (clean.length) {
        await tx.riderItem.createMany({ data: clean.map((r, i) => ({ profileId, name: r.name, note: r.note, sortOrder: i })) });
      }
      await this.store.record(tx, profileId, actor, 'rider', { fields: ['rider'] });
    });
    return this.store.loadEditor(profileId);
  }

  async setBookingForm(profileId: ScopedProfileId, actor: EditorActor, body: BookingFormBody): Promise<EditorProfileDto> {
    // Se copia cada campo: validateFormConfig solo lee key/required/label/placeholder.
    const input = body.fields.map((f) => ({ key: f.key, required: f.required, label: f.label ?? null, placeholder: f.placeholder ?? null }));
    const { config, errors } = validateFormConfig(input);
    if (errors.length) {
      const details: Record<string, string> = {};
      for (const e of errors) {
        const key = e.index >= 0 ? `fields[${e.index}]` : 'fields';
        if (!(key in details)) details[key] = e.error;
      }
      throw Errors.validation(details, 'Revisa el formulario: el nombre y un contacto (correo o teléfono) deben ser obligatorios.');
    }
    await this.store.transaction(async (tx) => {
      await tx.djProfile.update({ where: { id: profileId }, data: { bookingForm: config as unknown as Prisma.InputJsonValue } });
      await this.store.record(tx, profileId, actor, 'booking_form', { fields: ['bookingForm'] });
    });
    return this.store.loadEditor(profileId);
  }
}
