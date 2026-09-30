// e2e de la parte pública contra la BD de desarrollo/CI. No depende de la semilla: crea
// perfiles desechables con slugs únicos y los borra al final (en cascada: fechas, redirecciones).
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { WA_URL_RE, addDays, defaultFormConfig, todayBogota } from '@fersua/shared';
import { AppModule } from '../src/app.module';
import { FormTokenService } from '../src/booking/form-token.service';
import { AppConfig } from '../src/config/app-config.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { TICKET_TOKEN_SCOPE } from '../src/tickets/tickets.service';

const run = randomBytes(4).toString('hex');
const SLUG = `e2e-dj-${run}`;
const OLD_SLUG = `e2e-old-${run}`;
const HIDDEN_SLUG = `e2e-oculto-${run}`;
const DRAFT_SLUG = `e2e-borrador-${run}`;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('API pública (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let origin: string;
  const profileIds: string[] = [];
  let userId: string | null = null;
  const ticketIds: string[] = [];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    // Lo mismo que main.ts para lo que estas rutas usan.
    nest.set('query parser', 'simple');
    nest.setGlobalPrefix('api');
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
    prisma = app.get(PrismaService);
    origin = app.get(AppConfig).publicUrl;

    const today = todayBogota();
    const visible = await prisma.djProfile.create({
      data: {
        slug: SLUG,
        displayName: 'E2E DJ & "Amigos"',
        texts: { eventWhatsappMessage: 'Quiero ir a {evento} ({fecha}) {otro}' },
        bookingForm: defaultFormConfig() as never,
        whatsappNumber: '573001112233',
        status: 'APPROVED',
        approvedAt: new Date(),
        slugRedirects: { create: { fromSlug: OLD_SLUG } },
        events: {
          create: [
            { date: new Date(`${addDays(today, 10)}T00:00:00.000Z`), venue: 'Club & Bar #1', ctaType: 'WHATSAPP' },
            { date: new Date(`${addDays(today, 5)}T00:00:00.000Z`), venue: 'Oculto', isHidden: true },
            { date: new Date(`${addDays(today, -3)}T00:00:00.000Z`), venue: 'Pasado' },
          ],
        },
      },
    });
    profileIds.push(visible.id);

    // Aprobado pero con dueño suspendido: no debe verse en ningún lado.
    const user = await prisma.user.create({
      data: { username: `e2e${run}`, passwordHash: 'x', status: 'SUSPENDED' },
    });
    userId = user.id;
    const hidden = await prisma.djProfile.create({
      data: { slug: HIDDEN_SLUG, displayName: 'Oculto', texts: {}, bookingForm: [], status: 'APPROVED', userId: user.id },
    });
    const draft = await prisma.djProfile.create({
      data: { slug: DRAFT_SLUG, displayName: 'Borrador', texts: {}, bookingForm: [], status: 'DRAFT' },
    });
    profileIds.push(hidden.id, draft.id);
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.bookingRequest.deleteMany({ where: { profileId: { in: profileIds } } });
      await prisma.ticket.deleteMany({ where: { OR: [{ id: { in: ticketIds } }, { profileId: { in: profileIds } }] } });
      await prisma.djProfile.deleteMany({ where: { id: { in: profileIds } } });
      if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    }
    await app?.close();
  });

  it('GET /api/public/djs lista solo perfiles visibles, con la próxima fecha no oculta', async () => {
    const res = await request(app.getHttpServer()).get('/api/public/djs').expect(200);
    expect(res.headers['cache-control']).toContain('max-age=30');
    const slugs = (res.body as { slug: string }[]).map((c) => c.slug);
    expect(slugs).toContain(SLUG);
    expect(slugs).not.toContain(HIDDEN_SLUG);
    expect(slugs).not.toContain(DRAFT_SLUG);
    const card = (res.body as { slug: string; nextEvent: { venue: string } | null }[]).find((c) => c.slug === SLUG)!;
    expect(card.nextEvent?.venue).toBe('Club & Bar #1');
  });

  it('GET /api/public/djs/:slug arma el perfil con CTA de WhatsApp codificado', async () => {
    const res = await request(app.getHttpServer()).get(`/api/public/djs/${SLUG.toUpperCase()}`).expect(200);
    expect(res.body.slug).toBe(SLUG);
    expect(res.body.events).toHaveLength(1);
    const url: string = res.body.events[0].cta.url;
    expect(url).toMatch(WA_URL_RE);
    expect(decodeURIComponent(url.split('?text=')[1]!)).toMatch(/^Quiero ir a Club & Bar #1 \(\d+ de \w+ de \d{4}\)$/);
    expect(res.body.bookingForm.privacyUrl).toBe('/privacidad');
  });

  it('slug viejo → 301 relativo; ocultos y borradores → 404', async () => {
    const r = await request(app.getHttpServer()).get(`/api/public/djs/${OLD_SLUG}`).expect(301);
    expect(r.headers.location).toBe(`/api/public/djs/${SLUG}`);
    await request(app.getHttpServer()).get(`/api/public/djs/${HIDDEN_SLUG}`).expect(404);
    await request(app.getHttpServer()).get(`/api/public/djs/${DRAFT_SLUG}`).expect(404);
  });

  it('shell SEO: 200 para el perfil, 301 relativos y 404 sin redirección abierta', async () => {
    const server = app.getHttpServer();
    const page = await request(server).get('/api/public/shell').query({ path: `/${SLUG}` }).expect(200);
    expect(page.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(page.headers['cache-control']).toBe('no-cache');
    expect(page.text).toContain('<title>E2E DJ &amp; &quot;Amigos&quot; — Booking | Fersua Studio</title>');

    const upper = await request(server).get('/api/public/shell').query({ path: `/${SLUG.toUpperCase()}.html` }).expect(301);
    expect(upper.headers.location).toBe(`/${SLUG}`);
    const old = await request(server).get('/api/public/shell').query({ path: `/${OLD_SLUG}` }).expect(301);
    expect(old.headers.location).toBe(`/${SLUG}`);

    for (const path of ['//evil.com', '/%2F%2Fevil.com', '/\\evil.com', `/${HIDDEN_SLUG}`]) {
      const r = await request(server).get('/api/public/shell').query({ path });
      expect(r.status).toBe(404);
      expect(r.headers.location).toBeUndefined();
      expect(r.text).toContain('noindex');
    }
  });

  it('sitemap incluye solo los visibles y robots responde texto', async () => {
    const sm = await request(app.getHttpServer()).get('/api/public/sitemap.xml').expect(200);
    expect(sm.text).toContain(`${origin}/${SLUG}</loc>`);
    expect(sm.text).not.toContain(HIDDEN_SLUG);
    await request(app.getHttpServer()).get('/api/public/robots.txt').expect(200).expect('Content-Type', /text\/plain/);
  });

  it('booking: token → envío (201) → reutilizar el token da FORM_TOKEN_USED', async () => {
    const server = app.getHttpServer();
    const tokenRes = await request(server).get(`/api/public/djs/${SLUG}/booking-token`).expect(200);
    expect(tokenRes.headers['cache-control']).toBe('no-store');
    const token: string = tokenRes.body.token;

    const body = { fields: { fullName: 'Prueba e2e', email1: 'e2e@example.com', city: 'Medellín' }, consent: true, token };
    const fast = await request(server).post(`/api/public/djs/${SLUG}/booking-requests`).set('Origin', origin).send(body);
    expect(fast.status).toBe(400);
    expect(fast.body.code).toBe('FORM_TOO_FAST');

    await sleep(2_100);
    const ok = await request(server).post(`/api/public/djs/${SLUG}/booking-requests`).set('Origin', origin).send(body).expect(201);
    expect(ok.body.whatsappUrl).toMatch(WA_URL_RE);
    const stored = await prisma.bookingRequest.findUnique({ where: { id: ok.body.id } });
    expect(stored).toMatchObject({ status: 'NEW', contactEmail: 'e2e@example.com', profileId: profileIds[0] });

    const again = await request(server).post(`/api/public/djs/${SLUG}/booking-requests`).set('Origin', origin).send(body);
    expect(again.status).toBe(400);
    expect(again.body.code).toBe('FORM_TOKEN_USED');
  });

  it('el formulario de un perfil oculto no existe', async () => {
    await request(app.getHttpServer()).get(`/api/public/djs/${HIDDEN_SLUG}/booking-token`).expect(404);
  });

  it('tickets: reporte con slug viejo (201) y sobre un perfil oculto (400)', async () => {
    const server = app.getHttpServer();
    // Token del formulario (M4) emitido hace 5 s: pasa el tiempo mínimo sin dormir la prueba.
    const token = () => app.get(FormTokenService).issue('ticket', TICKET_TOKEN_SCOPE, Date.now() - 5_000);
    const base = {
      name: 'Prueba e2e',
      email: 'e2e@example.com',
      subject: 'Reporte de prueba',
      message: 'Mensaje de prueba del e2e, se borra solo.',
      consent: true,
    };
    const ok = await request(server)
      .post('/api/public/tickets')
      .set('Origin', origin)
      .send({ ...base, type: 'REPORTE_PERFIL', profileSlug: OLD_SLUG, token: token() })
      .expect(201);
    ticketIds.push(ok.body.id);
    expect(ok.body.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const stored = await prisma.ticket.findUnique({ where: { id: ok.body.id } });
    expect(stored).toMatchObject({ profileId: profileIds[0], profileSlug: SLUG, status: 'OPEN' });

    const hidden = await request(server)
      .post('/api/public/tickets')
      .set('Origin', origin)
      .send({ ...base, type: 'REPORTE_PERFIL', profileSlug: HIDDEN_SLUG, token: token() });
    expect(hidden.status).toBe(400);
    expect(hidden.body.details).toEqual({ profileSlug: 'NOT_FOUND' });
  });

  it('cuerpo demasiado grande o JSON roto → 413/400 en JSON, nunca 500', async () => {
    const server = app.getHttpServer();
    const big = await request(server)
      .post('/api/public/tickets')
      .set('Origin', origin)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ message: 'a'.repeat(200_000) }));
    expect(big.status).toBe(413);
    expect(big.body).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });

    const broken = await request(server)
      .post('/api/public/tickets')
      .set('Origin', origin)
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    expect(broken.status).toBe(400);
    expect(broken.body).toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('un slug con espacios alrededor no resuelve (no se escapa del límite del edge)', async () => {
    await request(app.getHttpServer()).get(`/api/public/djs/%20${SLUG}`).expect(404);
  });
});
