// e2e del api de M4 contra la BD de desarrollo/CI: token del formulario de tickets, honeypot
// guardado como spam, topes diarios (429), borrado suave de solicitudes desde el panel del DJ,
// registros del art. 53 y entrega de los datos del DJ (disclose, con step-up). Crea usuarios,
// perfiles, registros legales, solicitudes y tickets desechables (sufijo aleatorio) y los borra
// al final. Las contraseñas y el secreto TOTP se generan en cada corrida y no se escriben.
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';

import { randomBytes } from 'node:crypto';
import { LEGAL_DOCS, defaultFormConfig, type TicketDto } from '@fersua/shared';
import { XHR_HEADER_VALUE } from '../src/auth/auth.constants';
import { currentTotp } from '../src/auth/mfa/totp';
import { FormTokenService } from '../src/booking/form-token.service';
import { ipHash } from '../src/common/crypto';
import { TICKET_DAILY_CAPS } from '../src/tickets/ticket-rules';
import { TICKET_TOKEN_SCOPE } from '../src/tickets/tickets.service';
import { TestUsers, createTestApp, nextIp, type TestApp, type TestUser } from './auth.e2e-helpers';

const run = randomBytes(4).toString('hex');
const SLUG = `e2e-m4-${run}`;
const SLUG_NOLEGAL = `e2e-m4-sin-${run}`;
const SLUG_GONE = `e2e-m4-borrado-${run}`;
const DOC_ACTIVE = `77${parseInt(run, 16).toString().padStart(10, '0').slice(0, 8)}`;
const DOC_CLOSED = `88${parseInt(run, 16).toString().padStart(10, '0').slice(0, 8)}`;
const DAY = 86_400_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('M4: tickets con token y spam, borrado suave, registros del art. 53 y disclose (e2e)', () => {
  let t: TestApp;
  let users: TestUsers;
  let owner: TestUser;
  let admin: TestUser;
  let ownerToken = '';
  let adminToken = '';
  let stepUpToken = '';
  let profileId = '';
  let noLegalProfileId = '';
  let activeRecordId = '';
  let closedRecordId = '';
  const ticketIds: string[] = [];
  const bookingIds: string[] = [];

  const tokens = () => t.app.get(FormTokenService);
  /** Token de tickets emitido hace 5 s (pasa el tiempo mínimo sin dormir la prueba). */
  const ticketToken = (ageMs = 5_000) => tokens().issue('ticket', TICKET_TOKEN_SCOPE, Date.now() - ageMs);

  const ticketBody = (token: string | undefined, extra: Record<string, unknown> = {}) => ({
    type: 'PQRS_CONSULTA',
    name: 'Persona E2E',
    email: `m4.${run}@example.com`,
    subject: 'Consulta de prueba M4',
    message: 'Mensaje de prueba del e2e de M4, se borra solo.',
    consent: true,
    ...(token === undefined ? {} : { token }),
    ...extra,
  });
  const postTicket = (body: object, ip = nextIp()) =>
    t.http.post('/api/public/tickets').set('Origin', t.origin).set('X-Forwarded-For', ip).send(body);

  const asAdmin = (req: ReturnType<TestApp['http']['get']>) =>
    req.set('Authorization', `Bearer ${adminToken}`).set('Origin', t.origin).set('X-Forwarded-For', nextIp());
  const asOwner = (req: ReturnType<TestApp['http']['get']>) =>
    req.set('Authorization', `Bearer ${ownerToken}`).set('Origin', t.origin).set('X-Forwarded-For', nextIp());
  const disclose = (ticketId: string, stepUp = true, body: object = { confirmed: true }) => {
    const req = asAdmin(t.http.post(`/api/admin/tickets/${ticketId}/disclose-dj`));
    return (stepUp ? req.set('X-Step-Up', stepUpToken) : req).send(body);
  };

  /** Ids de la bandeja de tickets del admin (todas las páginas). */
  async function adminTicketIds(query: Record<string, string> = {}): Promise<string[]> {
    const ids: string[] = [];
    for (let page = 1; page <= 50; page++) {
      const res = await asAdmin(t.http.get('/api/admin/tickets').query({ ...query, page, pageSize: 100 })).expect(200);
      ids.push(...(res.body.items as TicketDto[]).map((x) => x.id));
      if (ids.length >= res.body.total) break;
    }
    return ids;
  }

  async function createTicket(data: {
    type: 'PQRS_CONSULTA' | 'REPORTE_PERFIL' | 'SOLICITUD_DATOS_DJ';
    profileId?: string | null;
    profileSlug?: string | null;
    isSpam?: boolean;
    ipHash?: string;
    createdAt?: Date;
  }): Promise<string> {
    const row = await t.prisma.ticket.create({
      data: {
        type: data.type,
        profileId: data.profileId ?? null,
        profileSlug: data.profileSlug ?? null,
        name: 'Solicitante E2E',
        email: `m4.sol.${run}@example.com`,
        subject: `Ticket M4 ${run}`,
        message: 'Ticket de prueba del e2e de M4.',
        consentAt: new Date(),
        consentVersion: LEGAL_DOCS.privacy.version,
        ipHash: data.ipHash ?? 'c'.repeat(64),
        dueAt: new Date(Date.now() + 10 * DAY),
        isSpam: data.isSpam ?? false,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      },
      select: { id: true },
    });
    ticketIds.push(row.id);
    return row.id;
  }

  beforeAll(async () => {
    t = await createTestApp();
    users = new TestUsers(t.prisma, t.config);

    owner = await users.create();
    // El panel del DJ exige los documentos vigentes aceptados (TermsGuard).
    await t.prisma.user.update({
      where: { id: owner.id },
      data: {
        termsVersion: LEGAL_DOCS.artistTerms.version,
        termsAcceptedAt: new Date(),
        privacyVersion: LEGAL_DOCS.privacy.version,
        privacyAcceptedAt: new Date(),
        ageConfirmedAt: new Date(),
      },
    });
    ownerToken = await users.session(t.app, owner, 'USER');
    admin = await users.create({ role: 'ADMIN', mfa: true });
    adminToken = await users.session(t.app, admin, 'ADMIN');

    const profile = await t.prisma.djProfile.create({
      data: {
        slug: SLUG,
        displayName: `E2E M4 ${run}`,
        texts: {},
        bookingForm: defaultFormConfig() as never,
        status: 'APPROVED',
        approvedAt: new Date(),
        userId: owner.id,
        legalInfo: {
          create: {
            legalName: `Responsable Activo ${run}`,
            docType: 'CC',
            docNumber: DOC_ACTIVE,
            address: `Calle Activa ${run} # 1-2, Medellín`,
            phones: ['3001112233'],
          },
        },
      },
      select: { id: true, legalInfo: { select: { id: true } } },
    });
    profileId = profile.id;
    activeRecordId = profile.legalInfo!.id;

    noLegalProfileId = (
      await t.prisma.djProfile.create({
        data: { slug: SLUG_NOLEGAL, displayName: 'E2E M4 sin registro', texts: {}, bookingForm: [], status: 'APPROVED' },
        select: { id: true },
      })
    ).id;

    // Registro conservado de un perfil ya borrado (lo que deja AdminProfilesService.remove).
    closedRecordId = (
      await t.prisma.djLegalInfo.create({
        data: {
          profileId: null,
          legalName: `Responsable Cerrado ${run}`,
          docType: 'NIT',
          docNumber: DOC_CLOSED,
          address: `Carrera Cerrada ${run} # 3-4, Medellín`,
          phones: ['3004445566', '6041234567'],
          closedAt: new Date(),
          closedProfileSlug: SLUG_GONE,
          closedDisplayName: 'DJ Borrado E2E',
        },
        select: { id: true },
      })
    ).id;
  });

  afterAll(async () => {
    if (t) {
      const profileIds = [profileId, noLegalProfileId].filter(Boolean);
      await t.prisma.ticket.deleteMany({ where: { OR: [{ id: { in: ticketIds } }, { profileId: { in: profileIds } }] } });
      await t.prisma.bookingRequest.deleteMany({ where: { OR: [{ id: { in: bookingIds } }, { profileId: { in: profileIds } }] } });
      // Antes que los perfiles: la FK es SET NULL y dejaría los registros sueltos.
      await t.prisma.djLegalInfo.deleteMany({ where: { id: { in: [activeRecordId, closedRecordId].filter(Boolean) } } });
      await t.prisma.djProfile.deleteMany({ where: { id: { in: profileIds } } });
      await t.prisma.auditLog.deleteMany({ where: { profileId: { in: profileIds } } }).catch(() => undefined);
      await users?.cleanup();
      await t.app.close();
    }
  });

  describe('token del formulario de tickets', () => {
    it('GET /tickets/token: no-store y un token distinto cada vez', async () => {
      const a = await t.http.get('/api/public/tickets/token').set('X-Forwarded-For', nextIp()).expect(200);
      expect(a.headers['cache-control']).toBe('no-store');
      expect(typeof a.body.token).toBe('string');
      const b = await t.http.get('/api/public/tickets/token').set('X-Forwarded-For', nextIp()).expect(200);
      expect(b.body.token).not.toBe(a.body.token);
    });

    it('sin token, alterado o de booking: 400 y no se guarda nada', async () => {
      const before = await t.prisma.ticket.count({ where: { email: `m4.${run}@example.com` } });
      const missing = await postTicket(ticketBody(undefined)).expect(400);
      expect(missing.body.code).toBe('VALIDATION_FAILED');

      const good = ticketToken();
      const tampered = `${good.slice(0, -1)}${good.endsWith('0') ? '1' : '0'}`;
      expect((await postTicket(ticketBody(tampered)).expect(400)).body.code).toBe('FORM_TOKEN_INVALID');

      // Un token de booking (aunque sea válido para un perfil) no sirve para tickets...
      const booking = tokens().issue('booking', SLUG, Date.now() - 5_000);
      expect((await postTicket(ticketBody(booking)).expect(400)).body.code).toBe('FORM_TOKEN_INVALID');
      // ...ni uno de tickets para el formulario de booking.
      const wrong = await t.http
        .post(`/api/public/djs/${SLUG}/booking-requests`)
        .set('Origin', t.origin)
        .set('X-Forwarded-For', nextIp())
        .send({ fields: { fullName: 'Prueba M4', email1: `m4.${run}@example.com` }, consent: true, token: ticketToken() })
        .expect(400);
      expect(wrong.body.code).toBe('FORM_TOKEN_INVALID');

      const expired = ticketToken(2 * 60 * 60 * 1000 + 5_000);
      expect((await postTicket(ticketBody(expired)).expect(400)).body.code).toBe('FORM_EXPIRED');
      expect(await t.prisma.ticket.count({ where: { email: `m4.${run}@example.com` } })).toBe(before);
    });

    it('recién emitido: FORM_TOO_FAST; a los 2 s: 201 con aviso al admin; reutilizado: FORM_TOKEN_USED', async () => {
      const { body } = await t.http.get('/api/public/tickets/token').set('X-Forwarded-For', nextIp()).expect(200);
      const fast = await postTicket(ticketBody(body.token)).expect(400);
      expect(fast.body.code).toBe('FORM_TOO_FAST');

      await sleep(2_100);
      t.sendSpy.mockClear();
      const ok = await postTicket(ticketBody(body.token)).expect(201);
      ticketIds.push(ok.body.id);
      expect(ok.body.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(await t.prisma.ticket.findUnique({ where: { id: ok.body.id }, select: { isSpam: true, status: true } })).toEqual({
        isSpam: false,
        status: 'OPEN',
      });
      expect(t.sendSpy).toHaveBeenCalledWith(expect.anything(), 'admin-new-ticket', expect.objectContaining({ ticketId: ok.body.id }));

      const again = await postTicket(ticketBody(body.token)).expect(400);
      expect(again.body.code).toBe('FORM_TOKEN_USED');
    });
  });

  describe('tickets marcados como spam', () => {
    let honeypotId = '';

    it('honeypot: 201 con un id real, guardado como spam y sin aviso al admin', async () => {
      t.sendSpy.mockClear();
      const res = await postTicket(ticketBody(ticketToken(), { hp_x7: 'https://spam.example' })).expect(201);
      honeypotId = res.body.id;
      ticketIds.push(honeypotId);
      expect(res.body.id).toMatch(/^c[a-z0-9]{20,}$/);
      expect(await t.prisma.ticket.findUnique({ where: { id: honeypotId }, select: { isSpam: true } })).toEqual({ isSpam: true });
      expect(t.sendSpy.mock.calls.filter((c) => c[1] === 'admin-new-ticket')).toEqual([]);
    });

    it('fuera de la bandeja, de abiertos y de la insignia por defecto; visible con spam=true', async () => {
      expect(await adminTicketIds()).not.toContain(honeypotId);
      const spamIds = await adminTicketIds({ spam: 'true' });
      expect(spamIds).toContain(honeypotId);
      const onlySpam = await asAdmin(t.http.get('/api/admin/tickets').query({ spam: 'true', pageSize: 100 })).expect(200);
      expect((onlySpam.body.items as TicketDto[]).every((x) => x.isSpam)).toBe(true);
      await asAdmin(t.http.get('/api/admin/tickets').query({ spam: 'si' })).expect(400);

      const detail = await asAdmin(t.http.get(`/api/admin/tickets/${honeypotId}`)).expect(200);
      expect(detail.body.isSpam).toBe(true);

      const stats = await asAdmin(t.http.get('/api/admin/stats')).expect(200);
      const openNonSpam = await t.prisma.ticket.count({ where: { isSpam: false, status: { in: ['OPEN', 'IN_PROGRESS'] } } });
      expect(stats.body.openTickets).toBe(openNonSpam);
      expect(stats.body.spamTickets).toBeGreaterThanOrEqual(1);
    });

    it('el admin lo desmarca: vuelve a la bandeja y queda en la auditoría', async () => {
      const res = await asAdmin(t.http.patch(`/api/admin/tickets/${honeypotId}`)).send({ status: 'OPEN', isSpam: false }).expect(200);
      expect(res.body.isSpam).toBe(false);
      expect(await adminTicketIds()).toContain(honeypotId);
      const audit = await t.prisma.auditLog.findFirst({ where: { action: 'admin.ticket.update', targetId: honeypotId }, orderBy: { id: 'desc' } });
      expect(audit?.metadata).toEqual({ from: 'OPEN', to: 'OPEN', resolutionChanged: false, isSpam: false });
      await asAdmin(t.http.patch(`/api/admin/tickets/${honeypotId}`)).send({ status: 'OPEN', isSpam: 'no' }).expect(400);
    });

    it('el spam de una IP no frena a una persona real de esa IP', async () => {
      const ip = nextIp();
      const hash = ipHash(t.config.ipHashSecret, ip);
      for (let i = 0; i < TICKET_DAILY_CAPS.perIp; i++) await createTicket({ type: 'PQRS_CONSULTA', ipHash: hash, isSpam: true });
      t.sendSpy.mockClear();
      const res = await postTicket(ticketBody(ticketToken()), ip).expect(201);
      ticketIds.push(res.body.id);
      expect(await t.prisma.ticket.findUnique({ where: { id: res.body.id }, select: { isSpam: true } })).toEqual({ isSpam: false });
      expect(t.sendSpy).toHaveBeenCalledWith(expect.anything(), 'admin-new-ticket', expect.objectContaining({ ticketId: res.body.id }));
    });

    it('una IP por encima del tope diario: 429 con el correo como alternativa, sin guardar nada', async () => {
      const ip = nextIp();
      const hash = ipHash(t.config.ipHashSecret, ip);
      for (let i = 0; i < TICKET_DAILY_CAPS.perIp; i++) await createTicket({ type: 'PQRS_CONSULTA', ipHash: hash });
      const before = await t.prisma.ticket.count({ where: { ipHash: hash } });
      t.sendSpy.mockClear();
      const res = await postTicket(ticketBody(ticketToken()), ip).expect(429);
      expect(res.body.code).toBe('RATE_LIMITED');
      expect(res.body.message).toContain('correo de contacto');
      expect(await t.prisma.ticket.count({ where: { ipHash: hash } })).toBe(before);
      expect(t.sendSpy.mock.calls.filter((c) => c[1] === 'admin-new-ticket')).toEqual([]);
    });
  });

  describe('borrado suave de solicitudes desde el panel del DJ', () => {
    it('el DJ deja de verla (lista, conteo, no leídas, detalle); el admin la ve marcada; el borrado es idempotente', async () => {
      for (const name of [`Ana ${run}`, `Beto ${run}`]) {
        const b = await t.prisma.bookingRequest.create({
          data: {
            profileId,
            payload: [{ key: 'fullName', label: 'Nombre', value: name }],
            contactName: name,
            contactEmail: `m4.book.${run}@example.com`,
            status: 'NEW',
            consentAt: new Date(),
            consentVersion: LEGAL_DOCS.privacy.version,
            ipHash: 'd'.repeat(64),
          },
          select: { id: true },
        });
        bookingIds.push(b.id);
      }
      const [gone, kept] = bookingIds as [string, string];
      expect((await asOwner(t.http.get('/api/me/profile/bookings')).expect(200)).body.total).toBe(2);
      expect((await asOwner(t.http.get('/api/me/profile/bookings/unread-count')).expect(200)).body).toEqual({ count: 2 });
      const statsBefore = (await asAdmin(t.http.get('/api/admin/stats')).expect(200)).body;

      await asOwner(t.http.delete(`/api/me/profile/bookings/${gone}`)).expect(204);
      await asOwner(t.http.delete(`/api/me/profile/bookings/${gone}`)).expect(204);
      expect(await t.prisma.auditLog.count({ where: { action: 'profile.booking.delete', targetId: gone } })).toBe(1);

      const list = await asOwner(t.http.get('/api/me/profile/bookings')).expect(200);
      expect(list.body.total).toBe(1);
      expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([kept]);
      expect(list.body.items[0].ownerDeleted).toBe(false);
      expect((await asOwner(t.http.get('/api/me/profile/bookings/unread-count')).expect(200)).body).toEqual({ count: 1 });
      await asOwner(t.http.get(`/api/me/profile/bookings/${gone}`)).expect(404);
      await asOwner(t.http.patch(`/api/me/profile/bookings/${gone}`)).send({ status: 'READ' }).expect(404);

      // Sigue en la BD, con su estado (el DJ no la leyó) y la fecha del borrado.
      const row = await t.prisma.bookingRequest.findUniqueOrThrow({ where: { id: gone }, select: { status: true, ownerDeletedAt: true } });
      expect(row.status).toBe('NEW');
      expect(row.ownerDeletedAt).toBeInstanceOf(Date);

      const adminList = await asAdmin(t.http.get('/api/admin/bookings').query({ profileId, pageSize: 100 })).expect(200);
      const flags = Object.fromEntries(adminList.body.items.map((i: { id: string; ownerDeleted: boolean }) => [i.id, i.ownerDeleted]));
      expect(flags).toEqual({ [gone]: true, [kept]: false });
      expect((await asAdmin(t.http.get(`/api/admin/bookings/${gone}`)).expect(200)).body.ownerDeleted).toBe(true);
      // Ya no cuenta como nueva en el resumen del admin.
      const statsAfter = (await asAdmin(t.http.get('/api/admin/stats')).expect(200)).body;
      expect(statsAfter.newBookings).toBe(statsBefore.newBookings - 1);

      // El borrado del admin sí es definitivo.
      await asAdmin(t.http.delete(`/api/admin/bookings/${gone}`)).expect(204);
      expect(await t.prisma.bookingRequest.count({ where: { id: gone } })).toBe(0);
    });
  });

  describe('registros del art. 53', () => {
    it('lista sin documento, dirección ni teléfonos; filtro por estado y búsqueda', async () => {
      const all = await asAdmin(t.http.get('/api/admin/legal-records').query({ q: run })).expect(200);
      expect(all.body.total).toBe(2);
      const byId = Object.fromEntries(all.body.items.map((i: { id: string }) => [i.id, i]));
      expect(byId[activeRecordId]).toMatchObject({ state: 'active', profileId, slug: SLUG, profileStatus: 'APPROVED', closedAt: null, purgeAt: null });
      expect(byId[closedRecordId]).toMatchObject({
        state: 'closed',
        profileId: null,
        slug: SLUG_GONE,
        displayName: 'DJ Borrado E2E',
        profileStatus: null,
        closedAt: expect.any(String),
        purgeAt: expect.any(String),
      });
      for (const item of all.body.items) {
        expect(Object.keys(item).sort()).toEqual(
          ['closedAt', 'createdAt', 'displayName', 'id', 'legalName', 'profileId', 'profileStatus', 'purgeAt', 'slug', 'state', 'updatedAt'].sort(),
        );
      }
      const json = JSON.stringify(all.body);
      for (const secret of [DOC_ACTIVE, DOC_CLOSED, 'Calle Activa', 'Carrera Cerrada', '3001112233']) expect(json).not.toContain(secret);

      const active = await asAdmin(t.http.get('/api/admin/legal-records').query({ q: run, state: 'active' })).expect(200);
      expect(active.body.items.map((i: { id: string }) => i.id)).toEqual([activeRecordId]);
      const closed = await asAdmin(t.http.get('/api/admin/legal-records').query({ q: SLUG_GONE, state: 'closed' })).expect(200);
      expect(closed.body.items.map((i: { id: string }) => i.id)).toEqual([closedRecordId]);
      // No se busca por número de documento.
      expect((await asAdmin(t.http.get('/api/admin/legal-records').query({ q: DOC_ACTIVE })).expect(200)).body.total).toBe(0);
      await asAdmin(t.http.get('/api/admin/legal-records').query({ state: 'otro' })).expect(400);
    });

    it('step-up con contraseña y TOTP (lo usan el detalle y la entrega)', async () => {
      const res = await t.http
        .post('/api/auth/step-up')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Origin', t.origin)
        .set('X-Forwarded-For', nextIp())
        .set('X-Requested-With', XHR_HEADER_VALUE)
        .send({ password: admin.password, code: currentTotp(admin.totpSecret!) })
        .expect(200);
      stepUpToken = res.body.stepUpToken;
    });

    it('detalle sin step-up: 403 STEP_UP_REQUIRED, sin datos ni auditoría', async () => {
      const res = await asAdmin(t.http.get(`/api/admin/legal-records/${closedRecordId}`)).expect(403);
      expect(res.body.code).toBe('STEP_UP_REQUIRED');
      expect(JSON.stringify(res.body)).not.toContain(DOC_CLOSED);
      expect(await t.prisma.auditLog.count({ where: { action: 'admin.legal.view', targetId: closedRecordId } })).toBe(0);
    });

    it('detalle completo con step-up, auditado una vez por ventana y sin valores en la auditoría', async () => {
      const res = await asAdmin(t.http.get(`/api/admin/legal-records/${closedRecordId}`)).set('X-Step-Up', stepUpToken).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body).toMatchObject({
        id: closedRecordId,
        state: 'closed',
        docType: 'NIT',
        docNumber: DOC_CLOSED,
        address: `Carrera Cerrada ${run} # 3-4, Medellín`,
        phones: ['3004445566', '6041234567'],
      });
      await asAdmin(t.http.get(`/api/admin/legal-records/${closedRecordId}`)).set('X-Step-Up', stepUpToken).expect(200);
      const views = await t.prisma.auditLog.findMany({ where: { action: 'admin.legal.view', targetId: closedRecordId, actorId: admin.id } });
      expect(views).toHaveLength(1);
      expect(views[0]!.metadata).toEqual({ state: 'closed' });
      expect(JSON.stringify(views.map((v) => v.metadata))).not.toContain(DOC_CLOSED);

      await asAdmin(t.http.get('/api/admin/legal-records/cmg0000000000000000000000')).set('X-Step-Up', stepUpToken).expect(404);
      const asUser = await t.http.get(`/api/admin/legal-records/${closedRecordId}`).set('Authorization', `Bearer ${ownerToken}`).expect(403);
      expect(asUser.body.code).toBe('FORBIDDEN');
    });
  });

  describe('entrega de los datos del DJ (disclose)', () => {
    let dataRequest = '';

    beforeAll(async () => {
      dataRequest = await createTicket({ type: 'SOLICITUD_DATOS_DJ', profileId, profileSlug: SLUG });
    });

    it('sin step-up: 403 STEP_UP_REQUIRED y nada cambia', async () => {
      const res = await disclose(dataRequest, false).expect(403);
      expect(res.body.code).toBe('STEP_UP_REQUIRED');
      expect(await t.prisma.ticket.findUnique({ where: { id: dataRequest }, select: { status: true } })).toEqual({ status: 'OPEN' });
      expect(await t.prisma.auditLog.count({ where: { action: 'admin.legal.disclose', actorId: admin.id } })).toBe(0);
      // Un USER ni siquiera llega al step-up.
      const user = await t.http
        .post(`/api/admin/tickets/${dataRequest}/disclose-dj`)
        .set('Authorization', `Bearer ${ownerToken}`)
        .set('Origin', t.origin)
        .expect(403);
      expect(user.body.code).toBe('FORBIDDEN');
    });

    it('el detalle del ticket dice cuántas solicitudes de booking a ese DJ traen el mismo correo', async () => {
      const before = await asAdmin(t.http.get(`/api/admin/tickets/${dataRequest}`)).expect(200);
      expect(before.body.matchingBookings).toBe(0);
      const b = await t.prisma.bookingRequest.create({
        data: {
          profileId,
          payload: [{ key: 'fullName', label: 'Nombre', value: 'Solicitante E2E' }],
          contactName: 'Solicitante E2E',
          // Otra capitalización: la comparación no distingue mayúsculas.
          contactEmail: `M4.Sol.${run}@Example.com`,
          status: 'READ',
          consentAt: new Date(),
          consentVersion: LEGAL_DOCS.privacy.version,
          ipHash: 'e'.repeat(64),
        },
        select: { id: true },
      });
      bookingIds.push(b.id);
      const after = await asAdmin(t.http.get(`/api/admin/tickets/${dataRequest}`)).expect(200);
      expect(after.body.matchingBookings).toBe(1);
      // Otros tipos no lo traen.
      const pqrs = await createTicket({ type: 'PQRS_CONSULTA' });
      expect((await asAdmin(t.http.get(`/api/admin/tickets/${pqrs}`)).expect(200)).body.matchingBookings).toBeUndefined();
    });

    it('sin la confirmación de la verificación: 400 y nada cambia', async () => {
      for (const body of [{}, { confirmed: false }, { confirmed: 'true' }]) {
        const res = await disclose(dataRequest, true, body).expect(400);
        expect(res.body.code).toBe('VALIDATION_FAILED');
      }
      expect(await t.prisma.ticket.findUnique({ where: { id: dataRequest }, select: { status: true } })).toEqual({ status: 'OPEN' });
      expect(await t.prisma.auditLog.count({ where: { action: 'admin.legal.disclose', actorId: admin.id } })).toBe(0);
    });

    it('solicitud de datos de un perfil activo: registro completo, respuesta para copiar, ticket en trámite y auditoría sin datos', async () => {
      const res = await disclose(dataRequest).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.record).toMatchObject({ id: activeRecordId, state: 'active', docType: 'CC', docNumber: DOC_ACTIVE, phones: ['3001112233'] });
      const text: string = res.body.responseTemplate;
      expect(text).toContain('Hola, Solicitante E2E:');
      expect(text).toContain(`radicado ${dataRequest}`);
      expect(text).toContain(`Cédula de ciudadanía ${DOC_ACTIVE}`);
      expect(text).toContain(`${t.origin}/${SLUG}`);
      expect(text).toContain('Ley 1480');

      expect(await t.prisma.ticket.findUnique({ where: { id: dataRequest }, select: { status: true, handledById: true } })).toEqual({
        status: 'IN_PROGRESS',
        handledById: admin.id,
      });
      const audit = await t.prisma.auditLog.findFirst({ where: { action: 'admin.legal.disclose', actorId: admin.id, targetId: activeRecordId } });
      expect(audit).toMatchObject({
        targetType: 'DjLegalInfo',
        profileId,
        metadata: { ticketId: dataRequest, state: 'active', verifiedBy: 'email-match', matchingBookings: 1 },
      });
      expect(JSON.stringify(audit?.metadata)).not.toContain(DOC_ACTIVE);

      // Otra vez (ya en trámite): responde igual y se vuelve a auditar; el estado no cambia.
      await disclose(dataRequest).expect(200);
      expect(await t.prisma.auditLog.count({ where: { action: 'admin.legal.disclose', targetId: activeRecordId, actorId: admin.id } })).toBe(2);
    });

    it('perfil ya borrado: 409 aunque haya un registro conservado con ese slug (se busca a mano)', async () => {
      const id = await createTicket({ type: 'SOLICITUD_DATOS_DJ', profileId: null, profileSlug: SLUG_GONE, createdAt: new Date(Date.now() - DAY) });
      const res = await disclose(id).expect(409);
      expect(res.body.code).toBe('LEGAL_RECORD_MISSING');
      expect(JSON.stringify(res.body)).not.toContain(DOC_CLOSED);
      expect(await t.prisma.ticket.findUnique({ where: { id }, select: { status: true } })).toEqual({ status: 'OPEN' });
    });

    it('409 con otro tipo de ticket, sin registro, spam o rechazado; 404 si no existe', async () => {
      const report = await createTicket({ type: 'REPORTE_PERFIL', profileId, profileSlug: SLUG });
      expect((await disclose(report).expect(409)).body.code).toBe('TICKET_NOT_DATA_REQUEST');
      const pqrs = await createTicket({ type: 'PQRS_CONSULTA' });
      expect((await disclose(pqrs).expect(409)).body.code).toBe('TICKET_NOT_DATA_REQUEST');

      const noLegal = await createTicket({ type: 'SOLICITUD_DATOS_DJ', profileId: noLegalProfileId, profileSlug: SLUG_NOLEGAL });
      expect((await disclose(noLegal).expect(409)).body.code).toBe('LEGAL_RECORD_MISSING');
      expect(await t.prisma.ticket.findUnique({ where: { id: noLegal }, select: { status: true } })).toEqual({ status: 'OPEN' });

      const spam = await createTicket({ type: 'SOLICITUD_DATOS_DJ', profileId, profileSlug: SLUG, isSpam: true });
      expect((await disclose(spam).expect(409)).body.code).toBe('TICKET_IS_SPAM');

      const rejected = await createTicket({ type: 'SOLICITUD_DATOS_DJ', profileId, profileSlug: SLUG });
      await t.prisma.ticket.update({ where: { id: rejected }, data: { status: 'REJECTED' } });
      expect((await disclose(rejected).expect(409)).body.code).toBe('TICKET_REJECTED');

      await disclose('cmg0000000000000000000000').expect(404);
      // Ninguno de esos dejó rastro de entrega: solo las 2 de arriba (las del registro activo).
      expect(await t.prisma.auditLog.count({ where: { action: 'admin.legal.disclose', actorId: admin.id } })).toBe(2);
    });
  });
});
