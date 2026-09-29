// e2e del editor de perfiles [me|adm], subidas, vista previa firmada y ciclo de vida del admin,
// contra la BD de desarrollo/CI. Crea usuarios y perfiles desechables (nombres únicos por
// corrida, contraseñas aleatorias que no se escriben en ningún lado) y los borra al final.
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { LIMITS, addDays, defaultFormConfig, todayBogota } from '@fersua/shared';
import { AppModule } from '../src/app.module';
import { PasswordHasher } from '../src/auth/password/password-hasher.service';
import { SessionService } from '../src/auth/tokens/session.service';
import { TokenService } from '../src/auth/tokens/token.service';
import { MediaService } from '../src/media/media.service';
import { StorageService } from '../src/media/storage.service';
import { PrismaService } from '../src/prisma/prisma.service';

const run = randomBytes(4).toString('hex');
const SLUG_A = `e2e-pa-${run}`;
const SLUG_B = `e2e-pb-${run}`;

describe('Editor de perfiles y admin de perfiles (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: ReturnType<INestApplication['getHttpServer']>;

  const userIds: string[] = [];
  const profileIds: string[] = [];
  let profileA = '';
  let profileB = '';
  let tokenA = '';
  let tokenB = '';
  let tokenC = '';
  let tokenAdmin = '';
  let stepUp = '';
  let userC = '';
  let jpeg: Buffer;

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token: string) => request(server).get(path).set(as(token));
  const send = (method: 'post' | 'patch' | 'put' | 'delete', path: string, token: string, body?: object) =>
    request(server)[method](path).set(as(token)).send(body);

  async function createUser(role: 'USER' | 'ADMIN'): Promise<{ id: string; username: string; password: string }> {
    const username = `e2e${role === 'ADMIN' ? 'adm' : 'dj'}${randomBytes(4).toString('hex')}`;
    const password = randomBytes(18).toString('base64url');
    const user = await prisma.user.create({
      data: { username, role, passwordHash: await app.get(PasswordHasher).hash(password) },
    });
    userIds.push(user.id);
    return { id: user.id, username, password };
  }

  async function login(u: { username: string; password: string }): Promise<string> {
    const res = await request(server).post('/api/auth/login').send({ username: u.username, password: u.password }).expect(200);
    expect(typeof res.body.accessToken).toBe('string');
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    // Lo mismo que main.ts para lo que estas rutas usan.
    nest.set('query parser', 'simple');
    nest.setGlobalPrefix('api');
    nest.use(cookieParser());
    nest.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        transform: true,
        validationError: { target: false, value: false },
      }),
    );
    await nest.init();
    app = nest;
    server = app.getHttpServer();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService);

    jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#cc3366' } }).jpeg().toBuffer();

    const a = await createUser('USER');
    const b = await createUser('USER');
    const c = await createUser('USER');
    const admin = await createUser('ADMIN');
    userC = c.id;
    const base = { texts: {}, bookingForm: defaultFormConfig() as never, status: 'DRAFT' as const };
    profileA = (await prisma.djProfile.create({ data: { ...base, slug: SLUG_A, displayName: 'E2E A', userId: a.id } })).id;
    profileB = (await prisma.djProfile.create({ data: { ...base, slug: SLUG_B, displayName: 'E2E B', userId: b.id } })).id;
    profileIds.push(profileA, profileB);

    // Los DJ entran por el login real. El admin necesita TOTP para loguearse, así que su
    // sesión se abre con el mismo SessionService que usa el login (fila de refresh real).
    tokenA = await login(a);
    tokenB = await login(b);
    tokenC = await login(c);
    const sessions = app.get(SessionService);
    const adminSession = await sessions.create({ id: admin.id, role: 'ADMIN', tokenVersion: 0 }, { ipHash: null, userAgent: null });
    tokenAdmin = adminSession.accessToken;
    stepUp = app.get(TokenService).signStepUp({ sub: admin.id, sid: adminSession.familyId });
  });

  afterAll(async () => {
    if (prisma) {
      const extra = await prisma.djProfile.findMany({ where: { OR: [{ slug: { startsWith: `e2e-` , endsWith: run } }, { userId: { in: userIds } }] }, select: { id: true } });
      const ids = [...new Set([...profileIds, ...extra.map((p) => p.id)])];
      const media = app.get(MediaService);
      for (const id of ids) {
        const exists = await prisma.djProfile.findUnique({ where: { id }, select: { id: true } });
        if (exists) {
          await prisma.$transaction(async (tx) => {
            await media.removeAllForProfile(id, tx);
            await tx.djProfile.delete({ where: { id } });
          });
        }
        await media.removeProfileFiles(id);
      }
      // Registros del art. 53 que quedaron retenidos al borrar perfiles de esta corrida.
      await prisma.djLegalInfo.deleteMany({ where: { profileId: null, closedProfileSlug: { endsWith: run } } });
      await prisma.auditLog.deleteMany({ where: { OR: [{ profileId: { in: ids } }, { actorId: { in: userIds } }] } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    await app?.close();
  });

  // ------------------------------------------------------------------ alcance y roles

  it('el dueño lee su perfil; sin perfil → 404; roles cruzados → 403', async () => {
    const res = await get('/api/me/profile', tokenA).expect(200);
    expect(res.body).toMatchObject({ id: profileA, slug: SLUG_A, status: 'DRAFT', hasLegalInfo: false, owner: { username: expect.any(String) } });
    expect(res.body.usage).toEqual({ assets: 0, bytes: 0, maxAssets: 20, maxBytes: 25 * 1024 * 1024 });
    expect(res.headers['cache-control']).toBe('no-store');

    // Sin perfil: 404 con código propio en cualquier ruta /me/** y sin datos de nadie.
    const none = await get('/api/me/profile', tokenC).expect(404);
    expect(none.body).toEqual({ statusCode: 404, code: 'NO_PROFILE', message: expect.any(String) });
    expect((await get('/api/me/profile/members', tokenC).expect(404)).body.code).toBe('NO_PROFILE');
    await get('/api/me/profile', tokenAdmin).expect(403);
    // Un id de otro perfil en el panel del admin sigue siendo el 404 genérico.
    expect((await get('/api/admin/profiles/noexistenoexistenoexiste', tokenAdmin).expect(404)).body.code).toBe('NOT_FOUND');
    await get(`/api/admin/profiles/${profileA}`, tokenA).expect(403);
    await get('/api/admin/profiles', tokenA).expect(403);
    await request(server).get('/api/me/profile').expect(401);
    await get('/api/admin/profiles/noexiste', tokenAdmin).expect(404);
  });

  it('asignación masiva: status/featured/userId en el PATCH → 400; el PATCH válido guarda y audita solo nombres', async () => {
    for (const body of [{ status: 'APPROVED' }, { featured: true }, { userId: userC }, { slug: 'otro' }, { show: { gallery: true, profileId: profileB } }]) {
      const r = await send('patch', '/api/me/profile', tokenA, body).expect(400);
      expect(r.body.code).toBe('VALIDATION_FAILED');
    }
    const res = await send('patch', '/api/me/profile', tokenA, {
      displayName: '  E2E   A  ',
      whatsappNumber: '+57 300 111 2233',
      texts: { heroTitle: 'Hola​ mundo', navTag: '' },
      show: { gallery: false },
    }).expect(200);
    expect(res.body).toMatchObject({ displayName: 'E2E A', whatsappNumber: '573001112233', texts: { heroTitle: 'Hola mundo' } });
    expect(res.body.show.gallery).toBe(false);
    const bad = await send('patch', '/api/me/profile', tokenA, { texts: { inventada: 'x', heroTitle: 'y'.repeat(61) } }).expect(400);
    expect(bad.body.details).toEqual({ 'texts.inventada': 'UNKNOWN_KEY', 'texts.heroTitle': 'TOO_LONG' });

    const log = await prisma.auditLog.findFirst({ where: { profileId: profileA, action: 'profile.update' }, orderBy: { id: 'desc' } });
    expect(log?.metadata).toEqual({ fields: expect.arrayContaining(['whatsappNumber', 'texts.heroTitle', 'show.gallery']) });
    expect(JSON.stringify(log?.metadata)).not.toContain('573001112233');
  });

  it('inyección anidada: profileId/memberId/id dentro de arreglos → 400', async () => {
    await send('put', '/api/me/profile/rider', tokenA, { items: [{ name: 'x', profileId: profileB }] }).expect(400);
    await send('put', '/api/me/profile/socials', tokenA, { links: [{ platform: 'INSTAGRAM', url: '@x', memberId: 'cmxxxxxxxxxxxxxxxxxxxxxxx' }] }).expect(400);
    await send('put', '/api/me/profile/booking-form', tokenA, { fields: [{ key: 'fullName', required: true, id: 1 }] }).expect(400);
    await send('put', '/api/me/profile/rider', tokenA, { items: ['texto suelto'] }).expect(400);
    const ok = await send('put', '/api/me/profile/rider', tokenA, { items: [{ name: 'CDJ-3000 x2', note: null }] }).expect(200);
    expect(ok.body.riderItems).toEqual([{ id: expect.any(String), name: 'CDJ-3000 x2', note: null }]);
    expect(await prisma.riderItem.count({ where: { profileId: profileB } })).toBe(0);
  });

  it('redes: normaliza y rechaza hosts ajenos y duplicados', async () => {
    const ok = await send('put', '/api/me/profile/socials', tokenA, {
      links: [
        { platform: 'INSTAGRAM', url: '@e2e.dj' },
        { platform: 'WEBSITE', url: 'e2e-dj.com?utm_source=x' },
      ],
    }).expect(200);
    expect(ok.body.socials.map((s: { url: string }) => s.url)).toEqual(['https://www.instagram.com/e2e.dj/', 'https://e2e-dj.com/']);
    const bad = await send('put', '/api/me/profile/socials', tokenA, {
      links: [
        { platform: 'INSTAGRAM', url: 'https://evil.com/x' },
        { platform: 'TIKTOK', url: '@a' },
        { platform: 'TIKTOK', url: '@b' },
      ],
    }).expect(400);
    expect(bad.body.details).toEqual({ 'links[0].url': 'HOST_NOT_ALLOWED', 'links[2].platform': 'DUPLICATE_PLATFORM' });
  });

  // ------------------------------------------------------------------ media

  let galleryAsset = '';
  let galleryItem = '';

  it('sube un JPEG válido (privado, URL firmada) y rechaza un texto renombrado a .jpg con 415', async () => {
    const res = await request(server)
      .post('/api/me/profile/media')
      .set(as(tokenA))
      .field('kind', 'GALLERY')
      .attach('file', jpeg, { filename: 'foto.jpg', contentType: 'image/jpeg' })
      .expect(201);
    expect(res.body).toMatchObject({ kind: 'GALLERY', isPublic: false, width: 640, height: 480 });
    galleryAsset = res.body.id;
    const url: string = res.body.variants[0].url;
    expect(url).toMatch(/^\/api\/media\/preview\/[a-z0-9]+\/\d+\.webp\?exp=\d+&sig=[0-9a-f]{64}$/);

    const img = await request(server).get(url).expect(200);
    expect(img.headers['content-type']).toBe('image/webp');
    expect(img.headers['cache-control']).toBe('private, no-store');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    const tampered = url.replace(/sig=([0-9a-f])/, (_m, c: string) => `sig=${c === '0' ? '1' : '0'}`);
    await request(server).get(tampered).expect(404);
    await request(server).get(url.replace(/\/\d+\.webp/, '/og.jpg')).expect(404);

    const fake = await request(server)
      .post('/api/me/profile/media')
      .set(as(tokenA))
      .field('kind', 'GALLERY')
      .attach('file', Buffer.from('hola, esto es texto plano y no una imagen JPEG'), { filename: 'foto.jpg', contentType: 'image/jpeg' })
      .expect(415);
    expect(fake.body.code).toBe('UNSUPPORTED_IMAGE');

    await request(server).post('/api/me/profile/media').set(as(tokenA)).field('kind', 'LOGO').attach('file', jpeg, 'f.jpg').expect(400);
    await request(server).post('/api/me/profile/media').set(as(tokenA)).field('kind', 'HERO').expect(400);
    const big = await request(server)
      .post('/api/me/profile/media')
      .set(as(tokenA))
      .field('kind', 'GALLERY')
      .attach('file', Buffer.alloc(LIMITS.upload.maxBytes + 1, 0xff), { filename: 'grande.jpg', contentType: 'image/jpeg' });
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('IMAGE_TOO_LARGE');
    // Content-Length imposible: 413 antes de leer el cuerpo (no llega a multer).
    const declared = await request(server)
      .post('/api/me/profile/media')
      .set(as(tokenA))
      .field('kind', 'GALLERY')
      .attach('file', Buffer.alloc(LIMITS.upload.maxBytes + 256 * 1024, 0xff), { filename: 'enorme.jpg', contentType: 'image/jpeg' });
    expect(declared.status).toBe(413);
    expect(declared.body.code).toBe('IMAGE_TOO_LARGE');
    // Nada de lo rechazado quedó guardado.
    expect(await prisma.mediaAsset.count({ where: { profileId: profileA } })).toBe(1);
  });

  it('cuota llena: 409 QUOTA_EXCEEDED antes de leer y procesar el archivo', async () => {
    const fakes = Array.from({ length: LIMITS.upload.quotaUnapproved.assets }, (_, i) => ({
      profileId: profileB,
      kind: 'GALLERY' as const,
      storageKey: `${profileB}/cuota${run}${i}`,
      variants: [],
      width: 10,
      height: 10,
      bytesTotal: 1,
      originalBytes: 1,
      originalMime: 'image/jpeg',
      sha256: '0'.repeat(64),
      attachedAt: new Date(),
    }));
    await prisma.mediaAsset.createMany({ data: fakes });
    try {
      const full = await request(server)
        .post('/api/me/profile/media')
        .set(as(tokenB))
        .field('kind', 'GALLERY')
        .attach('file', jpeg, { filename: 'foto.jpg', contentType: 'image/jpeg' })
        .expect(409);
      expect(full.body.code).toBe('QUOTA_EXCEEDED');
    } finally {
      await prisma.mediaAsset.deleteMany({ where: { storageKey: { in: fakes.map((x) => x.storageKey) } } });
    }
  });

  it('foto de integrante: solo MEMBER del mismo perfil y no la de otro integrante', async () => {
    const up = await request(server)
      .post('/api/me/profile/media')
      .set(as(tokenA))
      .field('kind', 'MEMBER')
      .attach('file', jpeg, { filename: 'm.jpg', contentType: 'image/jpeg' })
      .expect(201);
    const wrongKind = await send('post', '/api/me/profile/members', tokenA, { name: 'X', photoId: galleryAsset }).expect(400);
    expect(wrongKind.body.details).toEqual({ photoId: 'INVALID_IMAGE' });
    const m1 = await send('post', '/api/me/profile/members', tokenA, { name: 'Con foto', photoId: up.body.id }).expect(201);
    expect(m1.body.photo).toMatchObject({ id: up.body.id, kind: 'MEMBER', isPublic: false });
    const dup = await send('post', '/api/me/profile/members', tokenA, { name: 'Copia', photoId: up.body.id }).expect(409);
    expect(dup.body.code).toBe('MEDIA_IN_USE');
    // Quitar al integrante borra también su foto (no queda ocupando cuota).
    await send('delete', `/api/me/profile/members/${m1.body.id}`, tokenA).expect(204);
    expect(await prisma.mediaAsset.findUnique({ where: { id: up.body.id } })).toBeNull();
  });

  it('galería + IDOR: B no ve ni toca la galería, media, integrantes ni fechas de A (404)', async () => {
    const item = await send('post', '/api/me/profile/gallery', tokenA, { mediaId: galleryAsset, alt: 'Show' }).expect(201);
    galleryItem = item.body.id;
    const member = await send('post', '/api/me/profile/members', tokenA, { name: 'Mike' }).expect(201);
    const event = await send('post', '/api/me/profile/events', tokenA, {
      date: addDays(todayBogota(), 10),
      venue: 'Club E2E',
      ctaType: 'URL',
      ctaUrl: 'tickets.e2e-dj.com/x?fbclid=1',
    }).expect(201);
    expect(event.body).toMatchObject({ ctaUrl: 'https://tickets.e2e-dj.com/x', isPast: false });

    expect((await get('/api/me/profile/gallery', tokenB).expect(200)).body).toEqual([]);
    await send('patch', `/api/me/profile/gallery/${galleryItem}`, tokenB, { alt: 'mío' }).expect(404);
    await send('delete', `/api/me/profile/gallery/${galleryItem}`, tokenB).expect(404);
    await send('delete', `/api/me/profile/media/${galleryAsset}`, tokenB).expect(404);
    const steal = await send('post', '/api/me/profile/gallery', tokenB, { mediaId: galleryAsset }).expect(400);
    expect(steal.body.details).toEqual({ mediaId: 'INVALID_IMAGE' });
    await send('patch', `/api/me/profile/members/${member.body.id}`, tokenB, { name: 'x' }).expect(404);
    await send('delete', `/api/me/profile/members/${member.body.id}`, tokenB).expect(404);
    await send('put', `/api/me/profile/members/${member.body.id}/socials`, tokenB, { links: [] }).expect(404);
    await send('put', '/api/me/profile/members/order', tokenB, { ids: [member.body.id] }).expect(400);
    await send('patch', `/api/me/profile/events/${event.body.id}`, tokenB, { venue: 'x' }).expect(404);
    await send('delete', `/api/me/profile/events/${event.body.id}`, tokenB).expect(404);

    // Nada de A cambió.
    expect(await prisma.galleryItem.findUnique({ where: { id: galleryItem } })).toMatchObject({ alt: 'Show', profileId: profileA });
    expect(await prisma.member.findUnique({ where: { id: member.body.id } })).toMatchObject({ name: 'Mike' });
    // En uso → 409.
    const inUse = await send('delete', `/api/me/profile/media/${galleryAsset}`, tokenA).expect(409);
    expect(inUse.body.code).toBe('MEDIA_IN_USE');
  });

  it('fechas: el dueño no puede cargar fechas pasadas; el admin sí', async () => {
    const past = addDays(todayBogota(), -3);
    const r = await send('post', '/api/me/profile/events', tokenA, { date: past, venue: 'Viejo', ctaType: 'NONE' }).expect(400);
    expect(r.body.details).toEqual({ date: 'PAST' });
    await send('post', '/api/me/profile/events', tokenA, { date: addDays(todayBogota(), 731), venue: 'Lejos', ctaType: 'NONE' }).expect(400);
    const ok = await send('post', `/api/admin/profiles/${profileA}/events`, tokenAdmin, { date: past, venue: 'Archivo', ctaType: 'NONE' }).expect(201);
    expect(ok.body.isPast).toBe(true);
    const list = await get('/api/me/profile/events?scope=past', tokenA).expect(200);
    expect(list.body.map((e: { venue: string }) => e.venue)).toEqual(['Archivo']);
    await get('/api/me/profile/events?scope=todas', tokenA).expect(400);
  });

  it('el admin edita cualquier perfil por /api/admin/profiles/:id/... y queda auditado como admin', async () => {
    const res = await send('patch', `/api/admin/profiles/${profileB}`, tokenAdmin, { tagline: 'Editado por el admin' }).expect(200);
    expect(res.body).toMatchObject({ id: profileB, tagline: 'Editado por el admin' });
    await send('put', `/api/admin/profiles/${profileB}/rider`, tokenAdmin, { items: [{ name: 'Mixer' }] }).expect(200);
    const log = await prisma.auditLog.findFirst({ where: { profileId: profileB, action: 'admin.profile.update' } });
    expect(log).toMatchObject({ actorUsername: expect.stringMatching(/^e2eadm/), metadata: { fields: ['tagline'] } });
    const preview = await get(`/api/admin/profiles/${profileA}/preview`, tokenAdmin).expect(200);
    expect(preview.body.preview).toEqual({ status: 'DRAFT' });
    expect(preview.body.gallery[0].variants[0].url).toMatch(/^\/api\/media\/preview\//);
  });

  it('slug: el viejo queda como redirección y el nuevo no puede ser de otro', async () => {
    const newSlug = `e2e-pa2-${run}`;
    const res = await send('put', '/api/me/profile/slug', tokenA, { slug: newSlug }).expect(200);
    expect(res.body.slug).toBe(newSlug);
    expect(await prisma.slugRedirect.findUnique({ where: { fromSlug: SLUG_A } })).toMatchObject({ profileId: profileA });
    const taken = await send('put', '/api/me/profile/slug', tokenA, { slug: SLUG_B }).expect(409);
    expect(taken.body.code).toBe('SLUG_TAKEN');
    await send('put', '/api/me/profile/slug', tokenB, { slug: SLUG_A }).expect(409);
  });

  // ------------------------------------------------------------------ ciclo de vida

  it('aprobar exige el registro legal; al aprobar la media pasa a pública y al suspender vuelve a privada', async () => {
    const noLegal = await send('post', `/api/admin/profiles/${profileA}/approve`, tokenAdmin).expect(409);
    expect(noLegal.body.code).toBe('LEGAL_INFO_REQUIRED');

    const legal = await send('put', '/api/me/profile/legal-info', tokenA, {
      legalName: 'Persona de Prueba',
      docType: 'CC',
      docNumber: '1.023.456.789',
      address: 'Calle 1 # 2-3, Medellín',
      phones: ['+57 300 111 2233'],
    }).expect(200);
    expect(legal.body).toMatchObject({ docNumber: '1023456789', phones: ['+57 300 111 2233'] });
    expect((await get('/api/me/profile/legal-info', tokenB).expect(200)).body.updatedAt).toBeNull();
    // El dueño leyendo lo suyo no se audita; cada lectura del admin sí (sin los valores).
    expect(await prisma.auditLog.count({ where: { profileId: profileA, action: { endsWith: 'legal_info_view' } } })).toBe(0);
    await get(`/api/admin/profiles/${profileA}/legal-info`, tokenAdmin).expect(200);
    const view = await prisma.auditLog.findFirst({ where: { profileId: profileA, action: 'admin.profile.legal_info_view' } });
    expect(view).toMatchObject({ targetType: 'DjLegalInfo', metadata: null });

    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: galleryAsset } });
    expect(existsSync(storage.assetDir(asset.storageKey, false))).toBe(true);

    const approved = await send('post', `/api/admin/profiles/${profileA}/approve`, tokenAdmin).expect(200);
    expect(approved.body).toMatchObject({ status: 'APPROVED', hasLegalInfo: true, approvedAt: expect.any(String) });
    expect(await prisma.mediaAsset.findUniqueOrThrow({ where: { id: galleryAsset } })).toMatchObject({ isPublic: true });
    expect(existsSync(storage.assetDir(asset.storageKey, true))).toBe(true);
    expect(existsSync(storage.assetDir(asset.storageKey, false))).toBe(false);

    const pub = await request(server).get(`/api/public/djs/${approved.body.slug}`).expect(200);
    expect(pub.body.gallery[0].variants[0].url).toMatch(/^\/media\//);
    await send('post', `/api/admin/profiles/${profileA}/approve`, tokenAdmin).expect(409);

    await send('post', `/api/admin/profiles/${profileA}/suspend`, tokenAdmin, { reason: 'corto' }).expect(400);
    const suspended = await send('post', `/api/admin/profiles/${profileA}/suspend`, tokenAdmin, { reason: 'Revisión por un reporte recibido.' }).expect(200);
    expect(suspended.body).toMatchObject({ status: 'SUSPENDED', statusReason: 'Revisión por un reporte recibido.' });
    expect(await prisma.mediaAsset.findUniqueOrThrow({ where: { id: galleryAsset } })).toMatchObject({ isPublic: false });
    expect(existsSync(storage.assetDir(asset.storageKey, false))).toBe(true);
    await request(server).get(`/api/public/djs/${approved.body.slug}`).expect(404);

    const back = await send('post', `/api/admin/profiles/${profileA}/reinstate`, tokenAdmin).expect(200);
    expect(back.body).toMatchObject({ status: 'APPROVED', statusReason: null });
  });

  it('el dueño envía a revisión solo con el perfil completo', async () => {
    const r = await send('post', '/api/me/profile/submit', tokenB).expect(409);
    expect(r.body.code).toBe('PROFILE_INCOMPLETE');
    expect(r.body.details).toMatchObject({ heroImage: 'REQUIRED', genres: 'REQUIRED', members: 'REQUIRED', legalInfo: 'REQUIRED' });
    // Enviar a revisión no existe en el montaje del admin.
    await send('post', `/api/admin/profiles/${profileB}/submit`, tokenAdmin).expect(404);
  });

  it('lista, crea, destaca y asigna dueño (con step-up); sin step-up → 403', async () => {
    const list = await get(`/api/admin/profiles?q=${run}&pageSize=50`, tokenAdmin).expect(200);
    const slugs = list.body.items.map((i: { slug: string }) => i.slug);
    expect(slugs).toEqual(expect.arrayContaining([SLUG_B]));
    expect(list.body).toMatchObject({ page: 1, pageSize: 50, total: expect.any(Number) });
    const a = list.body.items.find((i: { id: string }) => i.id === profileA);
    expect(a).toMatchObject({ status: 'APPROVED', hasLegalInfo: true, newBookings: 0, nextEventDate: addDays(todayBogota(), 10) });
    await get('/api/admin/profiles?status=NOPE', tokenAdmin).expect(400);

    const created = await send('post', '/api/admin/profiles', tokenAdmin, { slug: `e2e-pc-${run}`, displayName: 'E2E C' }).expect(201);
    expect(created.body).toMatchObject({ status: 'DRAFT', owner: null, texts: {} });
    profileIds.push(created.body.id);
    await send('post', '/api/admin/profiles', tokenAdmin, { slug: SLUG_A, displayName: 'Dup' }).expect(409);
    await send('post', '/api/admin/profiles', tokenAdmin, { slug: 'admin', displayName: 'Reservado' }).expect(400);

    const feat = await send('patch', `/api/admin/profiles/${created.body.id}/feature`, tokenAdmin, { featured: true, featuredRank: 5 }).expect(200);
    expect(feat.body).toMatchObject({ featured: true, featuredRank: 5 });

    const noStepUp = await send('patch', `/api/admin/profiles/${created.body.id}/owner`, tokenAdmin, { userId: userC }).expect(403);
    expect(noStepUp.body.code).toBe('STEP_UP_REQUIRED');
    // Una cuenta suspendida no puede recibir un perfil (lo dejaría oculto sin aviso).
    const suspendedUser = await createUser('USER');
    await prisma.user.update({ where: { id: suspendedUser.id }, data: { status: 'SUSPENDED' } });
    const notEligible = await request(server)
      .patch(`/api/admin/profiles/${created.body.id}/owner`)
      .set(as(tokenAdmin))
      .set('X-Step-Up', stepUp)
      .send({ userId: suspendedUser.id })
      .expect(409);
    expect(notEligible.body.code).toBe('USER_NOT_ELIGIBLE');
    const owned = await request(server)
      .patch(`/api/admin/profiles/${created.body.id}/owner`)
      .set(as(tokenAdmin))
      .set('X-Step-Up', stepUp)
      .send({ userId: userC })
      .expect(200);
    expect(owned.body.owner).toMatchObject({ id: userC });
    // El nuevo dueño lo ve de inmediato (el guard relee el perfil de la BD).
    expect((await get('/api/me/profile', tokenC).expect(200)).body.id).toBe(created.body.id);
    // Un usuario que ya tiene perfil no puede recibir otro.
    const busy = await request(server)
      .patch(`/api/admin/profiles/${profileB}/owner`)
      .set(as(tokenAdmin))
      .set('X-Step-Up', stepUp)
      .send({ userId: userC })
      .expect(409);
    expect(busy.body.code).toBe('USER_NOT_ELIGIBLE');
  });

  it('borrar exige step-up y el slug escrito; borra filas y carpetas', async () => {
    await send('delete', `/api/admin/profiles/${profileA}`, tokenAdmin, { confirm: 'x' }).expect(403);
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: galleryAsset } });
    const current = await prisma.djProfile.findUniqueOrThrow({ where: { id: profileA }, select: { slug: true } });
    const del = (confirm: string) =>
      request(server).delete(`/api/admin/profiles/${profileA}`).set(as(tokenAdmin)).set('X-Step-Up', stepUp).send({ confirm });
    expect((await del('otro').expect(400)).body.code).toBe('CONFIRM_MISMATCH');
    // Con un reporte abierto sobre el perfil no se borra: primero se atiende.
    const report = await prisma.ticket.create({
      data: {
        type: 'REPORTE_PERFIL',
        profileId: profileA,
        profileSlug: current.slug,
        name: 'Persona E2E',
        email: 'persona@example.test',
        subject: 'Reporte e2e',
        message: 'Mensaje de prueba del reporte.',
        consentAt: new Date(),
        consentVersion: '2026-09',
        ipHash: 'c'.repeat(64),
        dueAt: new Date(`${addDays(todayBogota(), 15)}T00:00:00.000Z`),
      },
    });
    try {
      expect((await del(current.slug).expect(409)).body.code).toBe('PROFILE_HAS_OPEN_TICKETS');
      await prisma.ticket.update({ where: { id: report.id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
      await del(current.slug).expect(204);
    } finally {
      await prisma.ticket.delete({ where: { id: report.id } }).catch(() => undefined);
    }
    // El registro del art. 53 se conserva sin perfil, con el slug y el nombre, para la purga a los 12 meses.
    const kept = await prisma.djLegalInfo.findFirst({ where: { closedProfileSlug: current.slug } });
    expect(kept).toMatchObject({ profileId: null, closedDisplayName: 'E2E A', docNumber: '1023456789', closedAt: expect.any(Date) });
    await prisma.djLegalInfo.delete({ where: { id: kept!.id } });
    expect(await prisma.djProfile.findUnique({ where: { id: profileA } })).toBeNull();
    expect(await prisma.mediaAsset.findUnique({ where: { id: galleryAsset } })).toBeNull();
    expect(await prisma.slugRedirect.findUnique({ where: { fromSlug: SLUG_A } })).toBeNull();
    expect(existsSync(storage.assetDir(asset.storageKey, true))).toBe(false);
    expect(existsSync(storage.assetDir(asset.storageKey, false))).toBe(false);
    expect(await prisma.auditLog.findFirst({ where: { profileId: profileA, action: 'admin.profile.delete' } })).not.toBeNull();
    // El dueño se quedó sin perfil.
    await get('/api/me/profile', tokenA).expect(404);
  });
});
