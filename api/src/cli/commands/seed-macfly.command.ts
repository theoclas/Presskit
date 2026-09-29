import {
  LIMITS,
  PALETTE_KEYS,
  cleanText,
  isValidDateOnly,
  normalizeSocialUrl,
  normalizeWhatsappNumber,
  validateFormConfig,
  validateSlug,
  validateTexts,
  type FormFieldConfig,
  type MediaKind,
  type SocialPlatform,
} from '@fersua/shared';
import type { MediaAsset, Prisma } from '@prisma/client';
import { existsSync, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { AuditService } from '../../audit/audit.service';
import { MediaService } from '../../media/media.service';
import { safeJoin } from '../../media/storage.service';
import { PrismaService } from '../../prisma/prisma.service';
import type { CliCommand } from '../command';
import { MACFLY_SEED, type MacflySeed } from '../seed-data/macfly';

const DEFAULT_ASSETS = 'seed-assets/macfly-mike-bran';
const ASSET_FILE_RE = /^[a-z0-9-]{1,60}\.jpg$/;

interface Link {
  platform: SocialPlatform;
  url: string;
}

/** Todo validado y normalizado ANTES de tocar la BD o el disco. */
interface SeedPlan {
  seed: MacflySeed;
  texts: Record<string, string>;
  bookingForm: FormFieldConfig[];
  members: { name: string; role: string; description: string; photo: string; links: Link[] }[];
  profileLinks: Link[];
  images: Set<string>;
}

class SeedError extends Error {}

function text(value: string, max: number, what: string, min = 1): string {
  const v = cleanText(value);
  const len = [...v].length;
  if (len < min || len > max) throw new SeedError(`${what}: debe tener entre ${min} y ${max} caracteres (tiene ${len}).`);
  return v;
}

function link(platform: SocialPlatform, raw: string, where: string): Link {
  const r = normalizeSocialUrl(platform, raw);
  if (!r.ok) throw new SeedError(`${where}: URL de ${platform} inválida (${r.error}).`);
  return { platform, url: r.url };
}

export function buildPlan(seed: MacflySeed): SeedPlan {
  const p = seed.profile;
  const slugErr = validateSlug(p.slug);
  if (slugErr) throw new SeedError(`Slug "${p.slug}" inválido (${slugErr}).`);
  const legacyErr = validateSlug(p.legacySlug);
  if (legacyErr) throw new SeedError(`Slug heredado "${p.legacySlug}" inválido (${legacyErr}).`);
  text(p.displayName, LIMITS.profile.displayNameMax, 'displayName', LIMITS.profile.displayNameMin);
  text(p.tagline, LIMITS.profile.taglineMax, 'tagline');
  text(p.seoDescription, LIMITS.profile.seoDescriptionMax, 'seoDescription');
  text(p.city, LIMITS.profile.cityMax, 'city');
  if (normalizeWhatsappNumber(p.whatsappNumber) !== p.whatsappNumber) throw new SeedError('whatsappNumber inválido.');
  if (!/^\+\d{8,15}$/.test(p.publicPhone)) throw new SeedError('publicPhone inválido.');
  if (!PALETTE_KEYS.includes(p.palette)) throw new SeedError(`Paleta desconocida: ${p.palette}.`);

  const { texts, errors } = validateTexts(seed.texts);
  const textErrors = Object.entries(errors);
  if (textErrors.length) {
    throw new SeedError(`Textos inválidos: ${textErrors.map(([k, e]) => `${k}=${e}`).join(', ')}.`);
  }

  const form = validateFormConfig(seed.bookingForm);
  if (form.errors.length) {
    throw new SeedError(
      `Formulario inválido: ${form.errors.map((e) => `${e.key ?? `#${e.index}`}=${e.error}`).join(', ')}.`,
    );
  }

  if (seed.genres.length < LIMITS.genres.perProfileMin || seed.genres.length > LIMITS.genres.perProfileMax) {
    throw new SeedError('Cantidad de géneros fuera de límites.');
  }
  if (seed.rider.length > LIMITS.rider.max) throw new SeedError('Demasiados ítems de rider.');
  seed.rider.forEach((r, i) => text(r, LIMITS.rider.nameMax, `rider[${i}]`));
  if (seed.members.length > LIMITS.members.max) throw new SeedError('Demasiados integrantes.');
  if (seed.gallery.length > LIMITS.gallery.max) throw new SeedError('Demasiadas fotos en la galería.');
  seed.gallery.forEach((g, i) => text(g.alt, LIMITS.gallery.altMax, `gallery[${i}].alt`));
  if (seed.events.length > LIMITS.events.storedMax) throw new SeedError('Demasiadas fechas.');
  for (const e of seed.events) {
    if (!isValidDateOnly(e.date)) throw new SeedError(`Fecha inválida: ${e.date}.`);
    text(e.venue, LIMITS.events.venueMax, `evento ${e.date}`);
  }

  const members = seed.members.map((m, i) => {
    if (m.links.length > LIMITS.social.perMemberMax) throw new SeedError(`Integrante ${i}: demasiadas redes.`);
    return {
      name: text(m.name, LIMITS.members.nameMax, `members[${i}].name`),
      role: text(m.role, LIMITS.members.roleMax, `members[${i}].role`),
      description: text(m.description, LIMITS.members.descriptionMax, `members[${i}].description`),
      photo: m.photo,
      links: m.links.map((l) => link(l.platform, l.url, `members[${i}]`)),
    };
  });
  if (seed.profileLinks.length > LIMITS.social.perProfileMax) throw new SeedError('Demasiadas redes del perfil.');
  const profileLinks = seed.profileLinks.map((l) => link(l.platform, l.url, 'perfil'));

  const images = new Set<string>(['hero', 'card', ...seed.members.map((m) => m.photo), ...seed.gallery.map((g) => g.image)]);
  for (const e of seed.events) if (e.flyer) images.add(e.flyer);

  return { seed, texts: { ...texts } as Record<string, string>, bookingForm: form.config, members, profileLinks, images };
}

/** Lee manifest.json y los archivos que la seed necesita. Nada fuera de la carpeta de assets. */
export function loadAssets(dir: string, names: Iterable<string>): Map<string, Buffer> {
  const manifestPath = path.join(dir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new SeedError(`No encontré ${manifestPath}. Genera las fotos con: node scripts/prepare-seed-media.mjs`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { files?: Record<string, unknown> };
  const files = manifest.files && typeof manifest.files === 'object' ? manifest.files : {};
  const byFile = new Map<string, Buffer>();
  const out = new Map<string, Buffer>();
  for (const name of names) {
    const file = Object.prototype.hasOwnProperty.call(files, name) ? files[name] : undefined;
    if (typeof file !== 'string' || !ASSET_FILE_RE.test(file)) {
      throw new SeedError(`manifest.json no tiene un archivo válido para "${name}".`);
    }
    let buf = byFile.get(file);
    if (!buf) {
      const full = safeJoin(dir, file);
      if (!existsSync(full) || !statSync(full).isFile()) throw new SeedError(`Falta el archivo ${file}.`);
      buf = readFileSync(full);
      byFile.set(file, buf);
    }
    out.set(name, buf);
  }
  return out;
}

export const seedMacflyCommand: CliCommand = {
  name: 'seed:macfly',
  summary: 'Crea el perfil de Mike Bran & Macfly (idempotente; --force lo recrea)',
  usage: 'seed:macfly [--assets <dir>] [--force]',
  flags: { assets: 'string', force: 'boolean' },
  async run(app, args) {
    const prisma = app.get(PrismaService);
    const media = app.get(MediaService);
    const audit = app.get(AuditService);
    const force = args.flags.force === true;
    const assetsDir = path.resolve(typeof args.flags.assets === 'string' ? args.flags.assets : DEFAULT_ASSETS);

    // 1. Validar contenido, fotos y géneros antes de escribir nada.
    const plan = buildPlan(MACFLY_SEED);
    const { seed } = plan;
    const slug = seed.profile.slug;
    const buffers = loadAssets(assetsDir, plan.images);

    const genres = await prisma.genre.findMany({ where: { slug: { in: seed.genres } }, select: { id: true, slug: true } });
    const missing = seed.genres.filter((g) => !genres.some((x) => x.slug === g));
    if (missing.length) {
      throw new SeedError(`Faltan géneros (${missing.join(', ')}). Ejecuta primero: seed:genres`);
    }
    const genreIds = seed.genres.map((g) => genres.find((x) => x.slug === g)!.id);

    // 2. ¿Ya existe?
    const existing = await prisma.djProfile.findUnique({ where: { slug }, select: { id: true } });
    if (existing && !force) {
      console.log(`El perfil "${slug}" ya existe: no se toca nada. Usa --force para borrarlo y recrearlo.`);
      return;
    }
    for (const from of [seed.profile.legacySlug, slug]) {
      const redirect = await prisma.slugRedirect.findUnique({ where: { fromSlug: from } });
      if (redirect && redirect.profileId !== existing?.id) {
        throw new SeedError(`La redirección "${from}" pertenece a otro perfil. Revísala antes de sembrar.`);
      }
    }
    if (existing) {
      await prisma.$transaction(async (tx) => {
        await media.removeAllForProfile(existing.id, tx);
        await tx.djProfile.delete({ where: { id: existing.id } });
      });
      await media.removeProfileFiles(existing.id);
      console.log(`Perfil anterior "${slug}" borrado (--force).`);
    }

    // 3. Perfil base en DRAFT: no es público mientras se procesan las fotos.
    const p = seed.profile;
    const profile = await prisma.djProfile.create({
      data: {
        userId: null,
        slug,
        displayName: cleanText(p.displayName),
        tagline: cleanText(p.tagline),
        seoDescription: cleanText(p.seoDescription),
        city: cleanText(p.city),
        countryCode: p.countryCode,
        whatsappNumber: p.whatsappNumber,
        publicEmail: p.publicEmail,
        publicPhone: p.publicPhone,
        palette: p.palette,
        texts: plan.texts as Prisma.InputJsonValue,
        bookingForm: plan.bookingForm as unknown as Prisma.InputJsonValue,
        showGallery: true,
        showRider: true,
        showEvents: true,
        showOpenDateRow: true,
        formEnabled: true,
        formOpenWhatsapp: true,
        status: 'DRAFT',
        featured: p.featured,
        featuredRank: p.featuredRank,
      },
    });

    try {
      // 4. Fotos por el mismo pipeline que las subidas (WebP, sin EXIF). Públicas: el perfil
      //    queda APPROVED al final.
      const assets = new Map<string, MediaAsset>();
      const ingest = async (name: string, kind: MediaKind): Promise<MediaAsset> => {
        const asset = await media.ingest({ buffer: buffers.get(name)!, kind, profileId: profile.id, isPublic: true });
        assets.set(`${kind}:${name}`, asset);
        process.stdout.write('.');
        return asset;
      };
      process.stdout.write('Procesando fotos ');
      const hero = await ingest('hero', 'HERO');
      const card = await ingest('card', 'CARD');
      const memberPhotos: MediaAsset[] = [];
      for (const m of plan.members) memberPhotos.push(await ingest(m.photo, 'MEMBER'));
      const galleryAssets: MediaAsset[] = [];
      for (const g of seed.gallery) galleryAssets.push(await ingest(g.image, 'GALLERY'));
      const flyers = new Map<string, MediaAsset>();
      for (const e of seed.events) if (e.flyer) flyers.set(e.date, await ingest(e.flyer, 'FLYER'));
      process.stdout.write(` ${assets.size} listas\n`);

      // 5. Todo lo demás en una sola transacción: o queda completo o no queda.
      const now = new Date();
      await prisma.$transaction(
        async (tx) => {
          await tx.slugRedirect.create({ data: { fromSlug: p.legacySlug, profileId: profile.id } });
          await tx.profileGenre.createMany({
            data: genreIds.map((genreId, i) => ({ profileId: profile.id, genreId, sortOrder: i })),
          });
          await tx.riderItem.createMany({
            data: seed.rider.map((name, i) => ({ profileId: profile.id, name: cleanText(name), sortOrder: i })),
          });
          for (const [i, m] of plan.members.entries()) {
            const member = await tx.member.create({
              data: {
                profileId: profile.id,
                name: m.name,
                role: m.role,
                description: m.description,
                photoId: memberPhotos[i]!.id,
                sortOrder: i,
              },
            });
            await tx.socialLink.createMany({
              data: m.links.map((l, j) => ({
                profileId: profile.id,
                memberId: member.id,
                platform: l.platform,
                url: l.url,
                sortOrder: j,
              })),
            });
          }
          await tx.socialLink.createMany({
            data: plan.profileLinks.map((l, j) => ({ profileId: profile.id, platform: l.platform, url: l.url, sortOrder: j })),
          });
          await tx.galleryItem.createMany({
            data: seed.gallery.map((g, i) => ({
              profileId: profile.id,
              mediaId: galleryAssets[i]!.id,
              alt: cleanText(g.alt),
              sortOrder: i,
            })),
          });
          await tx.event.createMany({
            data: seed.events.map((e) => ({
              profileId: profile.id,
              date: new Date(`${e.date}T00:00:00.000Z`),
              venue: cleanText(e.venue),
              flyerId: flyers.get(e.date)?.id ?? null,
              ctaType: 'WHATSAPP' as const,
            })),
          });
          await media.attach(
            [...assets.values()].map((a) => a.id),
            tx,
            now,
          );
          await tx.djProfile.update({
            where: { id: profile.id },
            data: {
              heroImageId: hero.id,
              cardImageId: card.id,
              status: 'APPROVED',
              reviewedAt: now,
              approvedAt: now,
              lastActivityAt: now,
            },
          });
          await audit.record(
            {
              actorUsername: 'cli',
              action: 'seed.macfly',
              targetType: 'DjProfile',
              targetId: profile.id,
              profileId: profile.id,
              metadata: {
                slug,
                replaced: Boolean(existing),
                images: assets.size,
                events: seed.events.length,
                members: plan.members.length,
              },
            },
            tx,
          );
        },
        { timeout: 30_000, maxWait: 10_000 },
      );

      console.log(
        `Perfil "${slug}" creado (${profile.id}): APROBADO y destacado, sin dueño, redirección desde ` +
          `"${p.legacySlug}", ${plan.members.length} integrantes, ${seed.gallery.length} fotos de galería, ` +
          `${seed.events.length} fechas (archivo), ${assets.size} imágenes procesadas.`,
      );
    } catch (err) {
      // Deshacer a mano lo que quedó fuera de la transacción: el perfil DRAFT y los archivos.
      process.stdout.write('\n');
      await prisma
        .$transaction(async (tx) => {
          await media.removeAllForProfile(profile.id, tx);
          await tx.djProfile.delete({ where: { id: profile.id } });
        })
        .catch((e: unknown) => console.error(`No se pudo deshacer el perfil a medias: ${String(e)}`));
      await media.removeProfileFiles(profile.id).catch(() => undefined);
      throw err;
    }
  },
};
