// e2e del lado del dueño (M3): onboarding, disponibilidad de slug, géneros, envío a revisión y
// retiro, bloqueo de subidas sin correo verificado, bandeja de solicitudes (con IDOR entre
// dueños), avisos por correo y purgas programadas. Corre contra la BD de desarrollo/CI con
// usuarios y perfiles desechables (nombres únicos por corrida; contraseñas que no se escriben
// en ningún lado) y los borra al final. Si el API de Mailpit está disponible (desarrollo), los
// correos se buscan ahí; si no (CI solo publica el SMTP), se verifican con un espía de MailService.
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import sharp from 'sharp';
import request from 'supertest';
import { LEGAL_DOCS, addDays, defaultFormConfig, todayBogota } from '@fersua/shared';
import { AppModule } from '../src/app.module';
import { PasswordHasher } from '../src/auth/password/password-hasher.service';
import { SessionService } from '../src/auth/tokens/session.service';
import { BookingTokenService } from '../src/booking/booking-token.service';
import { AppConfig } from '../src/config/app-config.service';
import { MailService } from '../src/mail/mail.service';
import { MediaService } from '../src/media/media.service';
import { StorageService } from '../src/media/storage.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { OwnerPurgeJob, PURGE_ACTIONS } from '../src/profiles/owner-purge.job';

const run = randomBytes(4).toString('hex');
const SLUG_A = `e2e-oa-${run}`;
const SLUG_B = `e2e-ob-${run}`;
const MAILPIT = process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025';
const DAY = 86_400_000;

interface MailpitMessage {
  ID: string;
  Subject: string;
  To: { Address: string }[];
  Snippet: string;
}

describe('Dueño de perfil: onboarding, revisión, bandeja, avisos y purgas (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let origin = '';
  let sendSpy: jest.SpyInstance;
  let mailpit = false;
  let jpeg: Buffer;

  const userIds: string[] = [];
  const mailpitIds: string[] = [];
  const emails: Record<'A' | 'B', string> = { A: `owner-a.${run}@example.com`, B: `owner-b.${run}@example.com` };
  let userA = '';
  let userB = '';
  let tokenA = '';
  let tokenB = '';
  let tokenC = '';
  let tokenAdmin = '';
  let profileA = '';
  let profileB = '';

  const as = (token: string) => ({ Authorization: `Bearer ${token}` });
  const get = (path: string, token: string) => request(server).get(path).set(as(token));
  // Cada mutación con su propia IP: los límites por IP (onboarding, envío) no son lo que se prueba aquí.
  const send = (method: 'post' | 'patch' | 'put' | 'delete', path: string, token: string, body?: object) =>
    request(server)[method](path).set(as(token)).set('Origin', origin).set('X-Forwarded-For', nextIp()).send(body);
  const upload = (path: string, token: string, kind = 'HERO') =>
    request(server)
      .post(path)
      .set(as(token))
      .set('Origin', origin)
      .set('X-Forwarded-For', nextIp())
      .field('kind', kind)
      .attach('file', jpeg, { filename: 'foto.jpg', contentType: 'image/jpeg' });

  let seq = 0;
  async function createUser(opts: {
    role?: 'USER' | 'ADMIN';
    email?: string | null;
    verified?: boolean;
    createdAt?: Date;
    terms?: boolean;
  } = {}): Promise<string> {
    const username = `e2eow${run}${++seq}`;
    const password = randomBytes(18).toString('base64url');
    const terms = opts.terms === false || opts.role === 'ADMIN'
      ? {}
      : {
          termsVersion: LEGAL_DOCS.artistTerms.version,
          termsAcceptedAt: new Date(),
          privacyVersion: LEGAL_DOCS.privacy.version,
          privacyAcceptedAt: new Date(),
          ageConfirmedAt: new Date(),
        };
    const user = await prisma.user.create({
      data: {
        username,
        role: opts.role ?? 'USER',
        email: opts.email ?? null,
        emailVerifiedAt: opts.verified ? new Date() : null,
        passwordHash: await app.get(PasswordHasher).hash(password),
        ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
        ...terms,
      },
      select: { id: true },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function session(userId: string, role: 'USER' | 'ADMIN'): Promise<string> {
    const s = await app.get(SessionService).create({ id: userId, role, tokenVersion: 0 }, { ipHash: null, userAgent: null });
    return s.accessToken;
  }

  let ipSeq = 0;
  /** IP distinta por envío: el formulario público cuenta topes por IP (se guardaría como SPAM). */
  function nextIp(): string {
    const r = randomBytes(2);
    return `10.${r[0]}.${r[1]}.${(++ipSeq % 250) + 1}`;
  }

  function submitBooking(slug: string, fields: Record<string, string>, extra: Record<string, unknown> = {}) {
    // Token emitido hace 5 s: pasa el tiempo mínimo de llenado sin dormir la prueba.
    const token = app.get(BookingTokenService).issue(slug, Date.now() - 5_000);
    return request(server)
      .post(`/api/public/djs/${slug}/booking-requests`)
      .set('Origin', origin)
      .set('X-Forwarded-For', nextIp())
      .send({ fields, consent: true, token, ...extra });
  }

  function mailCalls(template: string): unknown[][] {
    return sendSpy.mock.calls.filter((c) => c[1] === template);
  }

  /** Los avisos salen después de responder (en segundo plano): se espera hasta 2 s a que aparezcan. */
  async function waitForCalls(template: string, match: (c: unknown[]) => boolean): Promise<unknown[][]> {
    for (let i = 0; i < 40; i++) {
      const hits = mailCalls(template).filter(match);
      if (hits.length) return hits;
      await new Promise((r) => setTimeout(r, 50));
    }
    return [];
  }

  async function mailpitSearch(query: string): Promise<MailpitMessage[]> {
    const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(query)}&limit=50`);
    if (!res.ok) return [];
    const body = (await res.json()) as { messages?: MailpitMessage[] };
    return body.messages ?? [];
  }

  /** Espera un correo en Mailpit (la cola de MailService es asíncrona). */
  async function waitForMail(query: string, match: (m: MailpitMessage) => boolean): Promise<MailpitMessage> {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const hit = (await mailpitSearch(query)).find(match);
      if (hit) {
        mailpitIds.push(hit.ID);
        return hit;
      }
      if (Date.now() > deadline) throw new Error(`no llegó el correo esperado (${query})`);
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    nest.set('query parser', 'simple');
    // X-Forwarded-For solo para dar una IP distinta a cada envío del formulario público.
    nest.set('trust proxy', true);
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
    origin = app.get(AppConfig).publicUrl;

    try {
      mailpit = (await fetch(`${MAILPIT}/api/v1/info`, { signal: AbortSignal.timeout(1_500) })).ok;
    } catch {
      mailpit = false;
    }
    const mail = app.get(MailService);
    // Sin el API de Mailpit no hay dónde leer: nada sale por SMTP y se verifica con el espía.
    if (!mailpit) mail.setTransportForTesting({ sendMail: async () => ({}) });
    sendSpy = jest.spyOn(mail, 'send');

    jpeg = await sharp({ create: { width: 640, height: 480, channels: 3, background: '#3366cc' } }).jpeg().toBuffer();

    userA = await createUser({ email: emails.A });
    userB = await createUser({ email: emails.B });
    const userC = await createUser({ email: `owner-c.${run}@example.com`, verified: true });
    const admin = await createUser({ role: 'ADMIN' });
    tokenA = await session(userA, 'USER');
    tokenB = await session(userB, 'USER');
    tokenC = await session(userC, 'USER');
    tokenAdmin = await session(admin, 'ADMIN');
  });

  afterAll(async () => {
    if (prisma) {
      const profiles = await prisma.djProfile.findMany({
        where: { OR: [{ slug: { startsWith: 'e2e-o', endsWith: run } }, { userId: { in: userIds } }] },
        select: { id: true },
      });
      const ids = profiles.map((p) => p.id);
      const media = app.get(MediaService);
      // Sin esto, el registro legal quedaría huérfano (profileId NULL sin closedAt) para siempre.
      await prisma.djLegalInfo.deleteMany({ where: { profileId: { in: ids } } });
      for (const id of ids) {
        await prisma.$transaction(async (tx) => {
          await media.removeAllForProfile(id, tx);
          await tx.djProfile.deleteMany({ where: { id } });
        });
        await media.removeProfileFiles(id);
      }
      const touched = [...ids, ...purgedProfileIds];
      await prisma.auditLog.deleteMany({
        where: { OR: [{ profileId: { in: touched } }, { actorId: { in: userIds } }, { targetId: { in: [...userIds, ...touched] } }] },
      });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    if (mailpit) {
      // Todo correo de esta corrida lleva el sufijo en el destinatario o el slug en el texto.
      await app.get(MailService).drainForTesting();
      await new Promise((r) => setTimeout(r, 300));
      const ours = await mailpitSearch(run).catch(() => [] as MailpitMessage[]);
      const ids = [...new Set([...mailpitIds, ...ours.map((m) => m.ID)])];
      if (ids.length) {
        await fetch(`${MAILPIT}/api/v1/messages`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ IDs: ids }),
        }).catch(() => undefined);
      }
    }
    await app?.close();
  });

  const purgedProfileIds: string[] = [];

  // ------------------------------------------------------------------ onboarding

  it('sin perfil: NO_PROFILE en el editor; géneros activos y disponibilidad de slug', async () => {
    expect((await get('/api/me/profile', tokenA).expect(404)).body.code).toBe('NO_PROFILE');
    expect((await get('/api/me/profile/bookings', tokenA).expect(404)).body.code).toBe('NO_PROFILE');

    const genres = await get('/api/me/genres', tokenA).expect(200);
    expect(Array.isArray(genres.body)).toBe(true);
    expect(genres.body.length).toBeGreaterThan(0);
    expect(Object.keys(genres.body[0]).sort()).toEqual(['id', 'name', 'slug']);
    const active = await prisma.genre.count({ where: { isActive: true } });
    expect(genres.body).toHaveLength(active);

    const avail = (slug: string, token = tokenA) => get(`/api/me/profile/slug-availability?slug=${encodeURIComponent(slug)}`, token).expect(200);
    expect((await avail(SLUG_A)).body).toEqual({ available: true });
    expect((await avail('admin')).body).toEqual({ available: false, reason: 'RESERVED' });
    expect((await avail('mi slug')).body).toEqual({ available: false, reason: 'FORMAT' });
    expect((await avail('macfly-mike-bran')).body).toEqual({ available: false, reason: 'TAKEN' });
    await get('/api/me/profile/slug-availability', tokenA).expect(400);

    // Solo USER: el admin no usa estas rutas (y sin sesión, 401).
    await get('/api/me/genres', tokenAdmin).expect(403);
    await send('post', '/api/me/profile', tokenAdmin, { displayName: 'Admin', slug: `e2e-oz-${run}` }).expect(403);
    await request(server).get('/api/me/genres').expect(401);
  });

  it('onboarding: crea el perfil en DRAFT (sin correo verificado) y el editor lo lee; el segundo es 409', async () => {
    // Asignación masiva: nada fuera de { displayName, slug }.
    for (const extra of [{ status: 'APPROVED' }, { userId: userB }, { texts: { heroTitle: 'x' } }]) {
      await send('post', '/api/me/profile', tokenA, { displayName: 'E2E A', slug: SLUG_A, ...extra }).expect(400);
    }
    const res = await send('post', '/api/me/profile', tokenA, { displayName: '  E2E   Dueño A ', slug: `  ${SLUG_A.toUpperCase()} ` }).expect(201);
    profileA = res.body.id;
    expect(res.body).toMatchObject({
      slug: SLUG_A,
      displayName: 'E2E Dueño A',
      status: 'DRAFT',
      texts: {},
      bookingForm: defaultFormConfig().map((f) => ({ ...f, label: null, placeholder: null })),
      owner: { id: userA },
      hasLegalInfo: false,
      notifyByEmail: true,
    });
    expect(res.body.publishMissing).toEqual(expect.arrayContaining(['heroImage', 'genres', 'members', 'legalInfo']));
    const log = await prisma.auditLog.findFirst({ where: { profileId: profileA, action: 'profile.create' } });
    expect(log).toMatchObject({ actorId: userA, targetType: 'DjProfile' });

    expect((await get('/api/me/profile', tokenA).expect(200)).body.id).toBe(profileA);
    const again = await send('post', '/api/me/profile', tokenA, { displayName: 'Otra', slug: `e2e-ox-${run}` }).expect(409);
    expect(again.body.code).toBe('PROFILE_EXISTS');
    // Su propio slug le aparece libre; a otro, tomado.
    expect((await get(`/api/me/profile/slug-availability?slug=${SLUG_A}`, tokenA).expect(200)).body).toEqual({ available: true });
    expect((await get(`/api/me/profile/slug-availability?slug=${SLUG_A}`, tokenC).expect(200)).body).toEqual({ available: false, reason: 'TAKEN' });
  });

  it('onboarding: slug tomado (perfil o redirección) → 409; reservado o mal formado → 400', async () => {
    const taken = await send('post', '/api/me/profile', tokenC, { displayName: 'E2E C', slug: SLUG_A }).expect(409);
    expect(taken.body.code).toBe('SLUG_TAKEN');
    const oldSlug = `e2e-oo-${run}`;
    await prisma.slugRedirect.create({ data: { fromSlug: oldSlug, profileId: profileA } });
    expect((await send('post', '/api/me/profile', tokenC, { displayName: 'E2E C', slug: oldSlug }).expect(409)).body.code).toBe('SLUG_TAKEN');
    expect((await get(`/api/me/profile/slug-availability?slug=${oldSlug}`, tokenC).expect(200)).body.reason).toBe('TAKEN');
    const reserved = await send('post', '/api/me/profile', tokenC, { displayName: 'E2E C', slug: 'panel' }).expect(400);
    expect(reserved.body.details).toEqual({ slug: 'RESERVED' });
    const bad = await send('post', '/api/me/profile', tokenC, { displayName: 'E2E C', slug: '-mal-' }).expect(400);
    expect(bad.body.details).toEqual({ slug: 'FORMAT' });
    const shortName = await send('post', '/api/me/profile', tokenC, { displayName: 'x', slug: `e2e-oc-${run}` }).expect(400);
    expect(shortName.body.details).toEqual({ displayName: 'TOO_SHORT' });
    // Nada de eso le creó un perfil.
    expect((await get('/api/me/profile', tokenC).expect(404)).body.code).toBe('NO_PROFILE');
  });

  // ------------------------------------------------------------------ subidas

  it('el dueño no sube fotos hasta verificar su correo; el admin sí puede en su montaje', async () => {
    const blocked = await upload('/api/me/profile/media', tokenA).expect(403);
    expect(blocked.body).toEqual({ statusCode: 403, code: 'EMAIL_NOT_VERIFIED', message: expect.any(String) });
    expect(await prisma.mediaAsset.count({ where: { profileId: profileA } })).toBe(0);

    await upload(`/api/admin/profiles/${profileA}/media`, tokenAdmin).expect(201);

    await prisma.user.update({ where: { id: userA }, data: { emailVerifiedAt: new Date() } });
    const ok = await upload('/api/me/profile/media', tokenA).expect(201);
    expect(ok.body).toMatchObject({ id: expect.any(String), kind: 'HERO' });
    expect(await prisma.mediaAsset.count({ where: { profileId: profileA } })).toBe(2);
  });

  // ------------------------------------------------------------------ enviar a revisión

  it('enviar a revisión: sin correo verificado → 403; sin registro legal → 409; incompleto → 409 con detalle', async () => {
    const created = await send('post', '/api/me/profile', tokenB, { displayName: 'E2E Dueño B', slug: SLUG_B }).expect(201);
    profileB = created.body.id;

    const unverified = await send('post', '/api/me/profile/submit', tokenB).expect(403);
    expect(unverified.body.code).toBe('EMAIL_NOT_VERIFIED');

    await prisma.user.update({ where: { id: userB }, data: { emailVerifiedAt: new Date() } });
    const noLegal = await send('post', '/api/me/profile/submit', tokenB).expect(409);
    expect(noLegal.body.code).toBe('LEGAL_INFO_REQUIRED');

    await send('put', '/api/me/profile/legal-info', tokenB, {
      legalName: 'Persona de Prueba B',
      docType: 'CC',
      docNumber: '1.023.456.780',
      address: 'Calle 1 # 2-3, Medellín',
      phones: ['+57 300 111 2233'],
    }).expect(200);
    const incomplete = await send('post', '/api/me/profile/submit', tokenB).expect(409);
    expect(incomplete.body.code).toBe('PROFILE_INCOMPLETE');
    expect(incomplete.body.details).toEqual({ heroImage: 'REQUIRED', genres: 'REQUIRED', members: 'REQUIRED' });
    expect((await get('/api/me/profile', tokenB).expect(200)).body.status).toBe('DRAFT');
  });

  it('enviar completo → PENDING_REVIEW y aviso al admin; retirar → DRAFT (una sola vez)', async () => {
    const hero = await upload('/api/me/profile/media', tokenB).expect(201);
    await send('patch', '/api/me/profile', tokenB, { heroImageId: hero.body.id }).expect(200);
    const genre = await prisma.genre.findFirstOrThrow({ where: { isActive: true }, select: { id: true } });
    await send('put', '/api/me/profile/genres', tokenB, { genreIds: [genre.id] }).expect(200);
    await send('post', '/api/me/profile/members', tokenB, { name: 'Integrante B' }).expect(201);
    expect((await get('/api/me/profile', tokenB).expect(200)).body.publishMissing).toEqual([]);

    const sent = await send('post', '/api/me/profile/submit', tokenB).expect(200);
    expect(sent.body).toMatchObject({ status: 'PENDING_REVIEW', submittedAt: expect.any(String) });
    expect(await prisma.auditLog.count({ where: { profileId: profileB, action: 'profile.submit', actorId: userB } })).toBe(1);
    const toAdmin = await waitForCalls('profile-submitted-admin', (c) => (c[2] as { slug: string }).slug === SLUG_B);
    expect(toAdmin).toEqual([[expect.anything(), 'profile-submitted-admin', { displayName: 'E2E Dueño B', slug: SLUG_B }]]);
    if (mailpit) await waitForMail(SLUG_B, (m) => m.Subject === 'Perfil enviado a revisión');

    // Ya en revisión: enviar otra vez no cabe.
    expect((await send('post', '/api/me/profile/submit', tokenB).expect(409)).body.code).toBe('INVALID_TRANSITION');

    const back = await send('post', '/api/me/profile/withdraw', tokenB).expect(200);
    expect(back.body).toMatchObject({ status: 'DRAFT', submittedAt: null });
    expect(await prisma.auditLog.count({ where: { profileId: profileB, action: 'profile.withdraw' } })).toBe(1);
    expect((await send('post', '/api/me/profile/withdraw', tokenB).expect(409)).body.code).toBe('INVALID_TRANSITION');
    // Retirar y enviar no existen en el montaje del admin.
    await send('post', `/api/admin/profiles/${profileB}/withdraw`, tokenAdmin).expect(404);

    expect((await send('post', '/api/me/profile/submit', tokenB).expect(200)).body.status).toBe('PENDING_REVIEW');
    // Reenviar el mismo día no le vuelve a escribir al admin (enviar y retirar en bucle no llena su buzón).
    await new Promise((r) => setTimeout(r, 300));
    expect(mailCalls('profile-submitted-admin').filter((c) => (c[2] as { slug: string }).slug === SLUG_B)).toHaveLength(1);
  });

  // ------------------------------------------------------------------ aprobación y avisos al dueño

  it('el admin aprueba → correo profile-approved al dueño (verificado)', async () => {
    const approved = await send('post', `/api/admin/profiles/${profileB}/approve`, tokenAdmin).expect(200);
    expect(approved.body.status).toBe('APPROVED');
    const calls = () => mailCalls('profile-approved').filter((c) => c[0] === emails.B);
    for (let i = 0; i < 40 && !calls().length; i++) await new Promise((r) => setTimeout(r, 50));
    expect(calls()).toEqual([[emails.B, 'profile-approved', { slug: SLUG_B }]]);
    if (mailpit) await waitForMail(`to:"${emails.B}"`, (m) => m.Subject === '¡Tu página de booking fue aprobada!');
  });

  // ------------------------------------------------------------------ solicitudes

  let bookingB = '';

  it('una solicitud a la página aprobada avisa al dueño (booking-new-owner); el spam no', async () => {
    const ok = await submitBooking(SLUG_B, { fullName: 'Ana María Pérez', email1: 'ana.e2e@example.com', city: 'Medellín' }).expect(201);
    bookingB = ok.body.id;
    expect(await prisma.bookingRequest.findUnique({ where: { id: bookingB }, select: { status: true } })).toEqual({ status: 'NEW' });
    const calls = () => mailCalls('booking-new-owner').filter((c) => c[0] === emails.B);
    for (let i = 0; i < 40 && !calls().length; i++) await new Promise((r) => setTimeout(r, 50));
    expect(calls()).toEqual([[emails.B, 'booking-new-owner', { requesterName: 'Ana María Pérez' }]]);
    if (mailpit) {
      const msg = await waitForMail(`to:"${emails.B}"`, (m) => m.Subject === 'Tienes una nueva solicitud de booking');
      // Sin datos de contacto del solicitante en el correo: solo el nombre saneado.
      expect(msg.Snippet).toContain('Ana María Pérez');
      expect(msg.Snippet).not.toContain('ana.e2e@example.com');
    }

    // Honeypot lleno: se guarda como SPAM y no le escribe al DJ.
    const spam = await submitBooking(SLUG_B, { fullName: 'Robot', email1: 'bot.e2e@example.com' }, { hp_x7: 'x' }).expect(201);
    expect(await prisma.bookingRequest.findUnique({ where: { id: spam.body.id }, select: { status: true } })).toEqual({ status: 'SPAM' });
    // Con los avisos apagados tampoco.
    await send('patch', '/api/me/profile', tokenB, { notifyByEmail: false }).expect(200);
    await submitBooking(SLUG_B, { fullName: 'Sin Aviso', email1: 'quiet.e2e@example.com' }).expect(201);
    await new Promise((r) => setTimeout(r, 300));
    expect(calls()).toHaveLength(1);
    await send('patch', '/api/me/profile', tokenB, { notifyByEmail: true }).expect(200);
  });

  it('bandeja del dueño: lista sin spam, no leídas, detalle que marca leída, estados y borrado', async () => {
    const list = await get('/api/me/profile/bookings', tokenB).expect(200);
    expect(list.body).toMatchObject({ page: 1, pageSize: 20, total: 2 });
    expect(list.body.items.map((i: { status: string }) => i.status)).toEqual(['NEW', 'NEW']);
    expect(list.body.items[0].profile).toEqual({ id: profileB, slug: SLUG_B, displayName: 'E2E Dueño B' });
    expect((await get('/api/me/profile/bookings?status=SPAM', tokenB).expect(200)).body.total).toBe(1);
    await get('/api/me/profile/bookings?status=NOPE', tokenB).expect(400);
    await get('/api/me/profile/bookings?pageSize=500', tokenB).expect(400);
    expect((await get('/api/me/profile/bookings/unread-count', tokenB).expect(200)).body).toEqual({ count: 2 });

    const detail = await get(`/api/me/profile/bookings/${bookingB}`, tokenB).expect(200);
    expect(detail.body).toMatchObject({
      id: bookingB,
      status: 'READ',
      contactName: 'Ana María Pérez',
      readAt: expect.any(String),
      consentVersion: LEGAL_DOCS.privacy.version,
    });
    expect(detail.body.fields).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'fullName', value: 'Ana María Pérez' })]));
    expect((await get('/api/me/profile/bookings/unread-count', tokenB).expect(200)).body).toEqual({ count: 1 });
    // Abrirla otra vez no cambia nada; el dueño leyendo lo suyo no se audita.
    expect((await get(`/api/me/profile/bookings/${bookingB}`, tokenB).expect(200)).body.readAt).toBe(detail.body.readAt);
    expect(await prisma.auditLog.count({ where: { targetId: bookingB, action: { contains: 'view' } } })).toBe(0);

    const archived = await send('patch', `/api/me/profile/bookings/${bookingB}`, tokenB, { status: 'ARCHIVED' }).expect(200);
    expect(archived.body).toMatchObject({ status: 'ARCHIVED', readAt: detail.body.readAt });
    await send('patch', `/api/me/profile/bookings/${bookingB}`, tokenB, { status: 'DELETED' }).expect(400);
    await send('patch', `/api/me/profile/bookings/${bookingB}`, tokenB, { status: 'READ', profileId: profileA }).expect(400);
    expect((await get('/api/me/profile/bookings?status=ARCHIVED', tokenB).expect(200)).body.total).toBe(1);
    const log = await prisma.auditLog.findFirst({ where: { targetId: bookingB, action: 'profile.booking.status' } });
    expect(log).toMatchObject({ actorId: userB, profileId: profileB, metadata: { from: 'READ', to: 'ARCHIVED' } });
  });

  it('IDOR: el dueño A no ve ni toca solicitudes, integrantes, fechas ni fotos del dueño B (404)', async () => {
    const memberB = await prisma.member.findFirstOrThrow({ where: { profileId: profileB }, select: { id: true } });
    const mediaB = await prisma.mediaAsset.findFirstOrThrow({ where: { profileId: profileB }, select: { id: true } });
    const eventB = await send('post', '/api/me/profile/events', tokenB, { date: addDays(todayBogota(), 20), venue: 'Club B', ctaType: 'NONE' }).expect(201);

    expect((await get('/api/me/profile/bookings', tokenA).expect(200)).body).toMatchObject({ total: 0, items: [] });
    expect((await get('/api/me/profile/bookings/unread-count', tokenA).expect(200)).body).toEqual({ count: 0 });
    const notFound = await get(`/api/me/profile/bookings/${bookingB}`, tokenA).expect(404);
    expect(notFound.body.code).toBe('NOT_FOUND');
    await send('patch', `/api/me/profile/bookings/${bookingB}`, tokenA, { status: 'SPAM' }).expect(404);
    await send('delete', `/api/me/profile/bookings/${bookingB}`, tokenA).expect(404);
    await send('patch', `/api/me/profile/members/${memberB.id}`, tokenA, { name: 'Hackeado' }).expect(404);
    await send('delete', `/api/me/profile/members/${memberB.id}`, tokenA).expect(404);
    await send('patch', `/api/me/profile/events/${eventB.body.id}`, tokenA, { venue: 'Hackeado' }).expect(404);
    await send('delete', `/api/me/profile/events/${eventB.body.id}`, tokenA).expect(404);
    await send('delete', `/api/me/profile/media/${mediaB.id}`, tokenA).expect(404);
    await get('/api/me/profile/bookings/no-es-un-id', tokenA).expect(404);

    expect(await prisma.bookingRequest.findUnique({ where: { id: bookingB }, select: { status: true } })).toEqual({ status: 'ARCHIVED' });
    expect(await prisma.member.findUnique({ where: { id: memberB.id }, select: { name: true } })).toEqual({ name: 'Integrante B' });
    expect(await prisma.event.findUnique({ where: { id: eventB.body.id }, select: { venue: true } })).toEqual({ venue: 'Club B' });
    expect(await prisma.mediaAsset.count({ where: { id: mediaB.id } })).toBe(1);

    // Sin perfil → NO_PROFILE; el admin no usa la bandeja del dueño.
    expect((await get('/api/me/profile/bookings/unread-count', tokenC).expect(404)).body.code).toBe('NO_PROFILE');
    await get('/api/me/profile/bookings', tokenAdmin).expect(403);

    // El dueño B sí borra la suya.
    await send('delete', `/api/me/profile/bookings/${bookingB}`, tokenB).expect(204);
    await get(`/api/me/profile/bookings/${bookingB}`, tokenB).expect(404);
    expect(await prisma.auditLog.count({ where: { targetId: bookingB, action: 'profile.booking.delete' } })).toBe(1);
  });

  it('suspender avisa al dueño con el motivo; un dueño sin correo verificado no recibe avisos', async () => {
    await send('post', `/api/admin/profiles/${profileB}/suspend`, tokenAdmin, { reason: 'Revisión por un reporte recibido.' }).expect(200);
    const calls = () => mailCalls('profile-suspended').filter((c) => c[0] === emails.B);
    for (let i = 0; i < 40 && !calls().length; i++) await new Promise((r) => setTimeout(r, 50));
    expect(calls()).toEqual([[emails.B, 'profile-suspended', { reason: 'Revisión por un reporte recibido.' }]]);

    // A pierde la verificación (p. ej. el admin le cambió el correo): aprobar no le escribe.
    await prisma.user.update({ where: { id: userA }, data: { emailVerifiedAt: null } });
    await send('put', '/api/me/profile/legal-info', tokenA, {
      legalName: 'Persona de Prueba A',
      docType: 'CC',
      docNumber: '1.023.456.781',
      address: 'Calle 1 # 2-3, Medellín',
      phones: ['+57 300 111 2234'],
    }).expect(200);
    await send('post', `/api/admin/profiles/${profileA}/approve`, tokenAdmin).expect(200);
    await new Promise((r) => setTimeout(r, 300));
    expect(sendSpy.mock.calls.filter((c) => c[0] === emails.A)).toHaveLength(0);
  });

  // ------------------------------------------------------------------ purgas

  it('purgas: aviso a los 21 días, borrado de borradores y rechazados a los 30, cuentas sin verificar a los 14', async () => {
    const now = Date.now();
    const ago = (days: number) => new Date(now - days * DAY);
    const base = { texts: {}, bookingForm: defaultFormConfig() as never };
    const mk = async (tag: string, data: { userId: string | null; status: 'DRAFT' | 'REJECTED' | 'PENDING_REVIEW' | 'APPROVED'; idle: number }) =>
      (
        await prisma.djProfile.create({
          data: { ...base, slug: `e2e-op${tag}-${run}`, displayName: `E2E Purga ${tag}`, userId: data.userId, status: data.status, lastActivityAt: ago(data.idle) },
          select: { id: true },
        })
      ).id;

    // Cuentas sin verificar (registradas solas: ageConfirmedAt) de 15 días.
    const lonely = await createUser({ email: `purge-d.${run}@example.com`, createdAt: ago(15) });
    const withDraft = await createUser({ email: `purge-e.${run}@example.com`, createdAt: ago(15) });
    const draftE = await mk('e', { userId: withDraft, status: 'DRAFT', idle: 15 });
    const pending = await createUser({ email: `purge-i.${run}@example.com`, createdAt: ago(15) });
    const pendingI = await mk('i', { userId: pending, status: 'PENDING_REVIEW', idle: 15 });
    const fresh = await createUser({ email: `purge-f2.${run}@example.com`, createdAt: ago(13) });
    const byAdmin = await createUser({ email: `purge-j.${run}@example.com`, createdAt: ago(15), terms: false });
    await prisma.auditLog.create({ data: { action: 'admin.user.create', targetType: 'User', targetId: byAdmin } });

    // Borradores y rechazados con dueño verificado.
    const warnUser = await createUser({ email: `purge-w.${run}@example.com`, verified: true });
    const draftW = await mk('w', { userId: warnUser, status: 'DRAFT', idle: 22 });
    const oldUser = await createUser({ email: `purge-g.${run}@example.com`, verified: true });
    const draftG = await mk('g', { userId: oldUser, status: 'DRAFT', idle: 31 });
    await prisma.auditLog.create({ data: { action: PURGE_ACTIONS.draftWarned, targetType: 'DjProfile', targetId: draftG, profileId: draftG, createdAt: ago(10) } });
    const assetG = await app.get(MediaService).ingest({ buffer: jpeg, kind: 'GALLERY', profileId: draftG, isPublic: false });
    const lateUser = await createUser({ email: `purge-l.${run}@example.com`, verified: true });
    const draftL = await mk('l', { userId: lateUser, status: 'DRAFT', idle: 40 });
    const rejUser = await createUser({ email: `purge-h.${run}@example.com`, verified: true });
    const rejectedH = await mk('h', { userId: rejUser, status: 'REJECTED', idle: 31 });
    const rejYoung = await mk('r', { userId: await createUser({ email: `purge-r.${run}@example.com`, verified: true }), status: 'REJECTED', idle: 29 });
    const approvedK = await mk('k', { userId: await createUser({ email: `purge-k.${run}@example.com`, verified: true }), status: 'APPROVED', idle: 400 });
    const orphanDraft = await mk('o', { userId: null, status: 'DRAFT', idle: 60 });
    purgedProfileIds.push(draftE, draftG, rejectedH);

    const job = app.get(OwnerPurgeJob);
    const summary = await job.run();
    expect(summary.draftsWarned).toBeGreaterThanOrEqual(2);

    // Cuentas: se borran las registradas solas sin verificar (sin perfil o con borrador).
    expect(await prisma.user.count({ where: { id: { in: [lonely, withDraft] } } })).toBe(0);
    expect(await prisma.djProfile.count({ where: { id: draftE } })).toBe(0);
    expect(await prisma.user.count({ where: { id: { in: [pending, fresh, byAdmin] } } })).toBe(3);
    expect(await prisma.djProfile.count({ where: { id: pendingI } })).toBe(1);
    expect(await prisma.auditLog.count({ where: { action: PURGE_ACTIONS.userPurged, targetId: { in: [lonely, withDraft] } } })).toBe(2);

    // Día 22: aviso (una vez) y nada más.
    expect(await prisma.djProfile.count({ where: { id: draftW } })).toBe(1);
    expect(mailCalls('draft-expiring').filter((c) => c[0] === `purge-w.${run}@example.com`)).toEqual([
      [`purge-w.${run}@example.com`, 'draft-expiring', { daysLeft: 9 }],
    ]);
    expect(await prisma.auditLog.count({ where: { action: PURGE_ACTIONS.draftWarned, profileId: draftW } })).toBe(1);

    // Día 31 con aviso de hace 10 días: se borra el perfil (y sus archivos), no el usuario.
    expect(await prisma.djProfile.count({ where: { id: draftG } })).toBe(0);
    expect(await prisma.user.count({ where: { id: oldUser } })).toBe(1);
    expect(existsSync(storage.assetDir(assetG.storageKey, false))).toBe(false);
    expect(await prisma.auditLog.count({ where: { action: PURGE_ACTIONS.draftPurged, profileId: draftG } })).toBe(1);

    // Día 40 sin aviso previo: primero el aviso; el borrado espera sus 9 días.
    expect(await prisma.djProfile.count({ where: { id: draftL } })).toBe(1);
    expect(mailCalls('draft-expiring').filter((c) => c[0] === `purge-l.${run}@example.com`)).toHaveLength(1);

    // Rechazado de 31 días: borrado; de 29, no. Aprobado viejo y borrador sin dueño: intactos.
    expect(await prisma.djProfile.count({ where: { id: rejectedH } })).toBe(0);
    expect(await prisma.user.count({ where: { id: rejUser } })).toBe(1);
    expect(await prisma.djProfile.count({ where: { id: { in: [rejYoung, approvedK, orphanDraft] } } })).toBe(3);

    // Idempotente: una segunda corrida no repite avisos ni borra más.
    await job.run();
    expect(await prisma.auditLog.count({ where: { action: PURGE_ACTIONS.draftWarned, profileId: { in: [draftW, draftL] } } })).toBe(2);
    expect(await prisma.djProfile.count({ where: { id: { in: [draftW, draftL, rejYoung, approvedK, orphanDraft, pendingI] } } })).toBe(6);
  });
});
