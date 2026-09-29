// e2e de las operaciones del admin (todo menos la edición de perfiles) contra la BD de
// desarrollo/CI, con el login real: contraseña + TOTP + step-up. Crea un ADMIN desechable
// (adminSlot NULL, así no choca con el admin real si existe), usuarios, un perfil, solicitudes,
// tickets y un género, todos con sufijo aleatorio, y los borra al final.
// Las credenciales se generan aquí en cada corrida y nunca se escriben en ningún archivo.
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';

import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import request from 'supertest';
import { addDays, defaultFormConfig, todayBogota } from '@fersua/shared';
import { AppModule } from '../src/app.module';
import { PasswordHasher } from '../src/auth/password/password-hasher.service';
import { generateTotpSecret } from '../src/auth/mfa/totp';
import { encryptSecret } from '../src/common/crypto';
import { AppConfig } from '../src/config/app-config.service';
import { PrismaService } from '../src/prisma/prisma.service';

const run = randomBytes(4).toString('hex');
const ADMIN_USERNAME = `e2eadm${run}`;
const ADMIN2_USERNAME = `e2eadmb${run}`;
const MATRIX_USERNAME = `e2eusr${run}`;
const NEW_USERNAME = `e2enew${run}`;
const SLUG = `e2e-adm-${run}`;
const GENRE_NAME = `E2E Género ${run}`;
const FAKE_ID = 'cmg0000000000000000000000';

/** Contraseña desechable de la corrida (nunca se guarda). */
const throwawayPassword = () => `Pw-${randomBytes(12).toString('base64url')}`;

describe('Operaciones del admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let origin: string;

  // Admin desechable.
  let adminId = '';
  let adminPassword = '';
  let totpSecret = '';
  let adminToken = '';
  let stepUpToken = '';
  let admin2Id = '';
  // USER para la matriz de 403.
  let matrixUserId = '';
  let userToken = '';
  // USER creado por el admin.
  let newUserId = '';
  let newUserToken = '';
  let tempPassword = '';
  let chosenPassword = '';

  let profileId = '';
  const bookingIds: string[] = [];
  const ticketIds: string[] = [];
  let genreId = 0;

  const http = () => request(app.getHttpServer());
  const asAdmin = (req: request.Test) => req.set('Authorization', `Bearer ${adminToken}`).set('Origin', origin);
  const asUser = (req: request.Test, token = userToken) => req.set('Authorization', `Bearer ${token}`).set('Origin', origin);

  function login(username: string, password: string): request.Test {
    return http().post('/api/auth/login').set('Origin', origin).send({ username, password });
  }

  /** Código TOTP de otro momento (±30 s): el api no acepta dos veces el mismo paso. */
  function totpAt(offsetMs: number): string {
    return authenticator.clone({ epoch: Date.now() + offsetMs }).generate(totpSecret);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const nest = moduleRef.createNestApplication<NestExpressApplication>();
    // Lo mismo que main.ts para lo que estas rutas usan.
    nest.set('query parser', 'simple');
    nest.set('trust proxy', 'loopback');
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
    prisma = app.get(PrismaService);
    const config = app.get(AppConfig);
    origin = config.publicUrl;
    const hasher = app.get(PasswordHasher);

    adminPassword = throwawayPassword();
    totpSecret = generateTotpSecret();
    const admin = await prisma.user.create({
      data: {
        username: ADMIN_USERNAME,
        passwordHash: await hasher.hash(adminPassword),
        role: 'ADMIN',
        mfaSecretEnc: encryptSecret(config.mfaEncKey, totpSecret),
        mfaEnabledAt: new Date(),
      },
    });
    adminId = admin.id;
    // Segundo ADMIN solo para probar CANNOT_TARGET_ADMIN (nunca inicia sesión).
    admin2Id = (await prisma.user.create({ data: { username: ADMIN2_USERNAME, passwordHash: 'x', role: 'ADMIN' } })).id;

    const matrixPassword = throwawayPassword();
    matrixUserId = (
      await prisma.user.create({ data: { username: MATRIX_USERNAME, passwordHash: await hasher.hash(matrixPassword) } })
    ).id;

    // Login del admin: contraseña → mfaToken → código.
    const step1 = await login(ADMIN_USERNAME, adminPassword).expect(200);
    expect(step1.body.mfaRequired).toBe(true);
    const step2 = await http()
      .post('/api/auth/mfa')
      .set('Origin', origin)
      .set('X-Requested-With', 'fersua')
      .send({ mfaToken: step1.body.mfaToken, code: totpAt(0) })
      .expect(200);
    adminToken = step2.body.accessToken;
    expect(step2.body.user.role).toBe('ADMIN');

    const userLogin = await login(MATRIX_USERNAME, matrixPassword).expect(200);
    userToken = userLogin.body.accessToken;

    const today = todayBogota();
    const profile = await prisma.djProfile.create({
      data: { slug: SLUG, displayName: 'E2E Admin DJ', texts: {}, bookingForm: defaultFormConfig() as never, status: 'APPROVED' },
    });
    profileId = profile.id;

    const booking = (contactName: string, status: 'NEW' | 'READ' | 'SPAM') =>
      prisma.bookingRequest.create({
        data: {
          profileId,
          payload: [
            { key: 'name', label: 'Nombre', value: contactName },
            { key: 'city', label: 'Ciudad', value: 'Medellín' },
          ],
          contactName,
          contactEmail: `${contactName.toLowerCase().replace(/\s+/g, '.')}@example.test`,
          contactPhone: '3001234567',
          eventDate: new Date(`${addDays(today, 20)}T00:00:00.000Z`),
          status,
          consentAt: new Date(),
          consentVersion: '2026-09',
          ipHash: 'a'.repeat(64),
        },
      });
    for (const b of [await booking(`Ana ${run}`, 'NEW'), await booking(`Beto ${run}`, 'READ'), await booking(`Spam ${run}`, 'SPAM')]) {
      bookingIds.push(b.id);
    }

    const ticket = (subject: string, dueAt: string, status: 'OPEN' | 'RESOLVED') =>
      prisma.ticket.create({
        data: {
          type: 'PQRS_CONSULTA',
          status,
          name: 'Persona E2E',
          email: 'persona@example.test',
          subject,
          message: 'Mensaje de prueba de la bandeja del admin.',
          consentAt: new Date(),
          consentVersion: '2026-09',
          ipHash: 'b'.repeat(64),
          dueAt: new Date(`${dueAt}T00:00:00.000Z`),
          resolvedAt: status === 'RESOLVED' ? new Date() : null,
        },
      });
    // Orden de creación a propósito distinto del orden esperado.
    ticketIds.push((await ticket(`Futuro ${run}`, addDays(today, 3), 'OPEN')).id);
    ticketIds.push((await ticket(`Vencido ${run}`, addDays(today, -10), 'OPEN')).id);
    ticketIds.push((await ticket(`Cerrado ${run}`, addDays(today, -20), 'RESOLVED')).id);
  });

  afterAll(async () => {
    if (prisma) {
      const userIds = [adminId, admin2Id, matrixUserId, newUserId].filter(Boolean);
      await prisma.bookingRequest.deleteMany({ where: { OR: [{ id: { in: bookingIds } }, { profileId }] } });
      await prisma.ticket.deleteMany({ where: { id: { in: ticketIds } } });
      if (profileId) await prisma.profileGenre.deleteMany({ where: { profileId } });
      if (genreId) await prisma.genre.deleteMany({ where: { id: genreId } });
      if (profileId) await prisma.djProfile.deleteMany({ where: { id: profileId } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      // La auditoría es de solo inserción en producción (grants); en desarrollo se limpia lo
      // de esta corrida para no acumular basura. Si no hay permiso, se deja.
      await prisma.auditLog
        .deleteMany({
          where: { OR: [{ actorUsername: { in: [ADMIN_USERNAME, NEW_USERNAME, MATRIX_USERNAME] } }, { targetId: { in: userIds } }, { profileId }] },
        })
        .catch(() => undefined);
    }
    await app?.close();
  });

  /** Todas las rutas de este módulo, con un cuerpo válido donde hace falta. */
  const routes = (): { method: 'get' | 'post' | 'patch' | 'delete'; path: string; body?: object }[] => [
    { method: 'get', path: '/api/admin/stats' },
    { method: 'get', path: '/api/admin/users' },
    { method: 'post', path: '/api/admin/users', body: { username: `e2ex${run}` } },
    { method: 'post', path: `/api/admin/users/${matrixUserId}/reset-password` },
    { method: 'post', path: `/api/admin/users/${matrixUserId}/suspend` },
    { method: 'post', path: `/api/admin/users/${matrixUserId}/reactivate` },
    { method: 'post', path: `/api/admin/users/${matrixUserId}/unlock` },
    { method: 'post', path: `/api/admin/users/${matrixUserId}/revoke-sessions` },
    { method: 'delete', path: `/api/admin/users/${matrixUserId}`, body: { confirm: MATRIX_USERNAME } },
    { method: 'get', path: '/api/admin/bookings' },
    { method: 'get', path: `/api/admin/bookings/${bookingIds[0]}` },
    { method: 'patch', path: `/api/admin/bookings/${bookingIds[0]}`, body: { status: 'ARCHIVED' } },
    { method: 'delete', path: `/api/admin/bookings/${bookingIds[0]}` },
    { method: 'get', path: '/api/admin/tickets' },
    { method: 'get', path: `/api/admin/tickets/${ticketIds[0]}` },
    { method: 'patch', path: `/api/admin/tickets/${ticketIds[0]}`, body: { status: 'RESOLVED' } },
    { method: 'get', path: '/api/admin/audit-logs' },
    { method: 'get', path: '/api/admin/genres' },
    { method: 'post', path: '/api/admin/genres', body: { name: `E2E Intruso ${run}` } },
    { method: 'patch', path: '/api/admin/genres/1', body: { isActive: false } },
    { method: 'delete', path: '/api/admin/genres/1' },
  ];

  describe('guards', () => {
    it('sin sesión: 401 en todas las rutas', async () => {
      for (const r of routes()) {
        const res = await http()[r.method](r.path).set('Origin', origin).send(r.body);
        expect({ route: `${r.method} ${r.path}`, status: res.status }).toEqual({ route: `${r.method} ${r.path}`, status: 401 });
      }
    });

    it('USER: 403 en todas las rutas y no cambia nada', async () => {
      for (const r of routes()) {
        const res = await asUser(http()[r.method](r.path)).send(r.body);
        expect({ route: `${r.method} ${r.path}`, status: res.status, code: res.body.code }).toEqual({
          route: `${r.method} ${r.path}`,
          status: 403,
          code: 'FORBIDDEN',
        });
      }
      // Nada de lo anterior tuvo efecto.
      expect(await prisma.bookingRequest.findUnique({ where: { id: bookingIds[0] }, select: { status: true } })).toEqual({ status: 'NEW' });
      expect(await prisma.user.findUnique({ where: { username: `e2ex${run}` } })).toBeNull();
      expect(await prisma.genre.findFirst({ where: { name: `E2E Intruso ${run}` } })).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: matrixUserId }, select: { status: true } })).toEqual({ status: 'ACTIVE' });
    });

    it('acciones destructivas sin step-up: 403 STEP_UP_REQUIRED', async () => {
      const reset = await asAdmin(http().post(`/api/admin/users/${matrixUserId}/reset-password`)).expect(403);
      expect(reset.body.code).toBe('STEP_UP_REQUIRED');
      const del = await asAdmin(http().delete(`/api/admin/users/${matrixUserId}`)).send({ confirm: MATRIX_USERNAME }).expect(403);
      expect(del.body.code).toBe('STEP_UP_REQUIRED');
    });

    it('step-up con contraseña + TOTP de otro paso', async () => {
      const res = await asAdmin(http().post('/api/auth/step-up'))
        .set('X-Requested-With', 'fersua')
        .send({ password: adminPassword, code: totpAt(30_000) })
        .expect(200);
      stepUpToken = res.body.stepUpToken;
      expect(typeof stepUpToken).toBe('string');
    });
  });

  describe('stats', () => {
    it('conteos con todos los estados', async () => {
      const res = await asAdmin(http().get('/api/admin/stats')).expect(200);
      expect(Object.keys(res.body.profiles).sort()).toEqual(['APPROVED', 'DRAFT', 'PENDING_REVIEW', 'REJECTED', 'SUSPENDED']);
      expect(res.body.profiles.APPROVED).toBeGreaterThanOrEqual(1);
      expect(res.body.newBookings).toBeGreaterThanOrEqual(1);
      expect(res.body.overdueTickets).toBeGreaterThanOrEqual(1);
      expect(res.body.users).toBeGreaterThanOrEqual(1);
      // El perfil de la corrida está aprobado sin registro del art. 53: el resumen lo señala.
      expect(res.body.approvedWithoutLegal).toEqual(expect.arrayContaining([{ id: profileId, slug: SLUG, displayName: 'E2E Admin DJ' }]));
      expect(res.headers['cache-control']).toBe('no-store');
    });
  });

  describe('usuarios', () => {
    it('crea un USER con contraseña temporal (una sola vez, no-store)', async () => {
      const res = await asAdmin(http().post('/api/admin/users'))
        .send({ username: `  ${NEW_USERNAME.toUpperCase()} `, email: `${NEW_USERNAME}@example.test` })
        .expect(201);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.username).toBe(NEW_USERNAME);
      expect(res.body.temporaryPassword).toMatch(/^[A-HJKMNP-Za-hjkmnp-z2-9]{16}$/);
      const hours = (new Date(res.body.expiresAt).getTime() - Date.now()) / 3_600_000;
      expect(hours).toBeGreaterThan(71.9);
      expect(hours).toBeLessThanOrEqual(72);
      newUserId = res.body.userId;
      tempPassword = res.body.temporaryPassword;

      const row = await prisma.user.findUniqueOrThrow({ where: { id: newUserId } });
      expect(row).toMatchObject({ role: 'USER', status: 'ACTIVE', mustChangePassword: true, adminSlot: null });
      expect(row.passwordHash).toMatch(/^\$argon2id\$/);
      expect(row.passwordHash).not.toContain(tempPassword);

      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.user.create', targetId: newUserId } });
      expect(audit?.actorUsername).toBe(ADMIN_USERNAME);
      expect(JSON.stringify(audit?.metadata)).not.toContain(tempPassword);
    });

    it('rechaza rol, reservados, duplicados y correos inválidos', async () => {
      const role = await asAdmin(http().post('/api/admin/users')).send({ username: `e2ey${run}`, role: 'ADMIN' }).expect(400);
      expect(role.body.code).toBe('VALIDATION_FAILED');
      const reserved = await asAdmin(http().post('/api/admin/users')).send({ username: 'Admin' }).expect(400);
      expect(reserved.body.details).toEqual({ username: 'RESERVED' });
      const format = await asAdmin(http().post('/api/admin/users')).send({ username: 'a b' }).expect(400);
      expect(format.body.details).toEqual({ username: 'FORMAT' });
      const dup = await asAdmin(http().post('/api/admin/users')).send({ username: NEW_USERNAME }).expect(409);
      expect(dup.body.code).toBe('USERNAME_TAKEN');
      const dupEmail = await asAdmin(http().post('/api/admin/users'))
        .send({ username: `e2ez${run}`, email: `${NEW_USERNAME.toUpperCase()}@EXAMPLE.TEST` })
        .expect(409);
      expect(dupEmail.body.code).toBe('EMAIL_TAKEN');
      const badEmail = await asAdmin(http().post('/api/admin/users')).send({ username: `e2ez${run}`, email: 'no-es-correo' }).expect(400);
      expect(badEmail.body.details).toEqual({ email: 'INVALID' });
    });

    it('la contraseña temporal entra, pero solo deja usar las rutas permitidas hasta cambiarla', async () => {
      const res = await login(NEW_USERNAME, tempPassword).expect(200);
      expect(res.body.user.mustChangePassword).toBe(true);
      const token = res.body.accessToken as string;

      await asUser(http().get('/api/auth/me'), token).expect(200);
      const blocked = await asUser(http().get('/api/admin/stats'), token).expect(403);
      expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

      chosenPassword = throwawayPassword();
      const changed = await asUser(http().post('/api/auth/change-password'), token)
        .set('X-Requested-With', 'fersua')
        .send({ currentPassword: tempPassword, newPassword: chosenPassword })
        .expect(200);
      expect(changed.body.user.mustChangePassword).toBe(false);
      newUserToken = changed.body.accessToken;
      // Ya sin contraseña pendiente: el admin sigue cerrado para un USER.
      const forbidden = await asUser(http().get('/api/admin/stats'), newUserToken).expect(403);
      expect(forbidden.body.code).toBe('FORBIDDEN');
    });

    it('lista con búsqueda y filtro de estado', async () => {
      const res = await asAdmin(http().get('/api/admin/users').query({ q: NEW_USERNAME, status: 'ACTIVE' })).expect(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]).toMatchObject({ id: newUserId, username: NEW_USERNAME, role: 'USER', emailVerified: false });
      expect(res.body.items[0]).not.toHaveProperty('passwordHash');
      await asAdmin(http().get('/api/admin/users').query({ pageSize: 101 })).expect(400);
      await asAdmin(http().get('/api/admin/users').query({ page: 0 })).expect(400);
      await asAdmin(http().get('/api/admin/users').query({ status: 'BORRADO' })).expect(400);
    });

    it('cambiar el correo: con step-up, queda sin verificar y la auditoría no guarda correos', async () => {
      const path = `/api/admin/users/${newUserId}`;
      const noStepUp = await asAdmin(http().patch(path)).send({ email: `nuevo.${NEW_USERNAME}@example.test` }).expect(403);
      expect(noStepUp.body.code).toBe('STEP_UP_REQUIRED');
      // La clave es obligatoria: un cuerpo vacío no borra el correo.
      await asAdmin(http().patch(path)).set('X-Step-Up', stepUpToken).send({}).expect(400);
      const bad = await asAdmin(http().patch(path)).set('X-Step-Up', stepUpToken).send({ email: 'no-es-correo' }).expect(400);
      expect(bad.body.details).toEqual({ email: 'INVALID' });

      await prisma.user.update({ where: { id: matrixUserId }, data: { email: `${MATRIX_USERNAME}@example.test` } });
      const taken = await asAdmin(http().patch(path))
        .set('X-Step-Up', stepUpToken)
        .send({ email: `${MATRIX_USERNAME.toUpperCase()}@example.test` })
        .expect(409);
      expect(taken.body.code).toBe('EMAIL_TAKEN');

      const next = `Nuevo.${NEW_USERNAME}@Example.test`;
      const ok = await asAdmin(http().patch(path)).set('X-Step-Up', stepUpToken).send({ email: next }).expect(200);
      expect(ok.body).toMatchObject({ id: newUserId, email: next.toLowerCase(), emailVerified: false });
      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.user.email', targetId: newUserId } });
      expect(audit?.metadata).toEqual({ hadEmail: true, hasEmail: true });
      expect(JSON.stringify(audit?.metadata)).not.toContain('example.test');

      const cleared = await asAdmin(http().patch(path)).set('X-Step-Up', stepUpToken).send({ email: null }).expect(200);
      expect(cleared.body.email).toBeNull();
      await asAdmin(http().patch(`/api/admin/users/${adminId}`)).set('X-Step-Up', stepUpToken).send({ email: null }).expect(403);
    });

    it('el admin no puede actuar sobre sí mismo ni sobre otro ADMIN', async () => {
      const self = await asAdmin(http().post(`/api/admin/users/${adminId}/suspend`)).expect(403);
      expect(self.body.code).toBe('CANNOT_TARGET_SELF');
      const selfReset = await asAdmin(http().post(`/api/admin/users/${adminId}/reset-password`)).set('X-Step-Up', stepUpToken).expect(403);
      expect(selfReset.body.code).toBe('CANNOT_TARGET_SELF');
      const selfDelete = await asAdmin(http().delete(`/api/admin/users/${adminId}`))
        .set('X-Step-Up', stepUpToken)
        .send({ confirm: ADMIN_USERNAME })
        .expect(403);
      expect(selfDelete.body.code).toBe('CANNOT_TARGET_SELF');
      const other = await asAdmin(http().post(`/api/admin/users/${admin2Id}/revoke-sessions`)).expect(403);
      expect(other.body.code).toBe('CANNOT_TARGET_ADMIN');
      expect(await prisma.user.findUnique({ where: { id: adminId }, select: { status: true } })).toEqual({ status: 'ACTIVE' });
      await asAdmin(http().post(`/api/admin/users/${FAKE_ID}/suspend`)).expect(404);
      await asAdmin(http().post('/api/admin/users/no-es-un-id/suspend')).expect(404);
    });

    it('reset-password con step-up: nueva temporal, sesiones cerradas y la clave vieja deja de servir', async () => {
      const res = await asAdmin(http().post(`/api/admin/users/${newUserId}/reset-password`)).set('X-Step-Up', stepUpToken).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.temporaryPassword).not.toBe(tempPassword);
      // El access token anterior muere ya (tokenVersion++ y familia revocada).
      await asUser(http().get('/api/auth/me'), newUserToken).expect(401);
      const live = await prisma.refreshToken.count({ where: { userId: newUserId, revokedAt: null } });
      expect(live).toBe(0);
      // La contraseña que el DJ había elegido ya no sirve.
      await login(NEW_USERNAME, chosenPassword).expect(401);
      tempPassword = res.body.temporaryPassword;
      const again = await login(NEW_USERNAME, tempPassword).expect(200);
      expect(again.body.user.mustChangePassword).toBe(true);
      newUserToken = again.body.accessToken;
    });

    it('suspender corta la sesión y el ingreso; reactivar lo devuelve', async () => {
      const res = await asAdmin(http().post(`/api/admin/users/${newUserId}/suspend`)).expect(200);
      expect(res.body.status).toBe('SUSPENDED');
      await asUser(http().get('/api/auth/me'), newUserToken).expect(401);
      const blocked = await login(NEW_USERNAME, tempPassword).expect(403);
      expect(blocked.body.code).toBe('ACCOUNT_SUSPENDED');

      const back = await asAdmin(http().post(`/api/admin/users/${newUserId}/reactivate`)).expect(200);
      expect(back.body.status).toBe('ACTIVE');
      const ok = await login(NEW_USERNAME, tempPassword).expect(200);
      newUserToken = ok.body.accessToken;
    });

    it('unlock limpia el bloqueo y revoke-sessions cierra todo', async () => {
      await prisma.user.update({
        where: { id: newUserId },
        data: { failedLoginCount: 30, lockedUntil: new Date(Date.now() + 3_600_000) },
      });
      const res = await asAdmin(http().post(`/api/admin/users/${newUserId}/unlock`)).expect(200);
      expect(res.body.lockedUntil).toBeNull();
      expect(await prisma.user.findUnique({ where: { id: newUserId }, select: { failedLoginCount: true, lockedUntil: true } })).toEqual({
        failedLoginCount: 0,
        lockedUntil: null,
      });

      await asUser(http().get('/api/auth/me'), newUserToken).expect(200);
      await asAdmin(http().post(`/api/admin/users/${newUserId}/revoke-sessions`)).expect(204);
      await asUser(http().get('/api/auth/me'), newUserToken).expect(401);
    });

    it('borrar: pide el usuario exacto y deja el perfil sin dueño (y suspendido, si estaba aprobado)', async () => {
      await prisma.djProfile.update({ where: { id: profileId }, data: { userId: newUserId } });
      const wrong = await asAdmin(http().delete(`/api/admin/users/${newUserId}`))
        .set('X-Step-Up', stepUpToken)
        .send({ confirm: 'otro' })
        .expect(400);
      expect(wrong.body.code).toBe('CONFIRM_MISMATCH');
      await asAdmin(http().delete(`/api/admin/users/${newUserId}`)).set('X-Step-Up', stepUpToken).send({}).expect(400);

      await asAdmin(http().delete(`/api/admin/users/${newUserId}`)).set('X-Step-Up', stepUpToken).send({ confirm: NEW_USERNAME }).expect(204);
      expect(await prisma.user.findUnique({ where: { id: newUserId } })).toBeNull();
      // Un perfil aprobado sin dueño sería público: se suspende en la misma transacción.
      expect(await prisma.djProfile.findUnique({ where: { id: profileId }, select: { userId: true, status: true } })).toEqual({
        userId: null,
        status: 'SUSPENDED',
      });
      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.user.delete', targetId: newUserId } });
      expect(audit?.profileId).toBe(profileId);
      expect(audit?.metadata).toMatchObject({ profileSuspended: true });
      expect(await prisma.auditLog.findFirst({ where: { action: 'admin.profile.suspend', profileId } })).not.toBeNull();
    });
  });

  describe('solicitudes', () => {
    it('lista por perfil sin SPAM por defecto; SPAM aparte; búsqueda y fechas', async () => {
      const all = await asAdmin(http().get('/api/admin/bookings').query({ profileId })).expect(200);
      expect(all.body.total).toBe(2);
      expect(all.body.items.map((b: { contactName: string }) => b.contactName).sort()).toEqual([`Ana ${run}`, `Beto ${run}`]);
      expect(all.body.items[0].profile).toEqual({ id: profileId, slug: SLUG, displayName: 'E2E Admin DJ' });
      expect(all.body.items[0].eventDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      const spam = await asAdmin(http().get('/api/admin/bookings').query({ profileId, status: 'SPAM' })).expect(200);
      expect(spam.body.total).toBe(1);

      const q = await asAdmin(http().get('/api/admin/bookings').query({ q: `beto ${run}` })).expect(200);
      expect(q.body.items.map((b: { id: string }) => b.id)).toEqual([bookingIds[1]]);

      const today = todayBogota();
      const inRange = await asAdmin(http().get('/api/admin/bookings').query({ profileId, from: today, to: today })).expect(200);
      expect(inRange.body.total).toBe(2);
      const past = await asAdmin(http().get('/api/admin/bookings').query({ profileId, to: addDays(today, -1) })).expect(200);
      expect(past.body.total).toBe(0);
      await asAdmin(http().get('/api/admin/bookings').query({ from: '2026-02-30' })).expect(400);
      await asAdmin(http().get('/api/admin/bookings').query({ profileId: '../x' })).expect(400);
    });

    it('el detalle trae los campos, se audita una vez y no la marca leída', async () => {
      const res = await asAdmin(http().get(`/api/admin/bookings/${bookingIds[0]}`)).expect(200);
      expect(res.body.fields).toEqual([
        { key: 'name', label: 'Nombre', value: `Ana ${run}` },
        { key: 'city', label: 'Ciudad', value: 'Medellín' },
      ]);
      expect(res.body.status).toBe('NEW');
      expect(res.body.consentVersion).toBe('2026-09');
      await asAdmin(http().get(`/api/admin/bookings/${bookingIds[0]}`)).expect(200);
      const views = await prisma.auditLog.count({ where: { action: 'admin.booking.view', targetId: bookingIds[0], actorId: adminId } });
      expect(views).toBe(1);
      await asAdmin(http().get(`/api/admin/bookings/${FAKE_ID}`)).expect(404);
    });

    it('cambia el estado con sus fechas y borra', async () => {
      const archived = await asAdmin(http().patch(`/api/admin/bookings/${bookingIds[0]}`)).send({ status: 'ARCHIVED' }).expect(200);
      expect(archived.body.status).toBe('ARCHIVED');
      expect(archived.body.readAt).not.toBeNull();
      const row = await prisma.bookingRequest.findUniqueOrThrow({ where: { id: bookingIds[0] } });
      expect(row.archivedAt).not.toBeNull();

      const unread = await asAdmin(http().patch(`/api/admin/bookings/${bookingIds[0]}`)).send({ status: 'NEW' }).expect(200);
      expect(unread.body.readAt).toBeNull();
      await asAdmin(http().patch(`/api/admin/bookings/${bookingIds[0]}`)).send({ status: 'BORRADA' }).expect(400);
      await asAdmin(http().patch(`/api/admin/bookings/${bookingIds[0]}`)).send({ status: 'READ', profileId: 'x' }).expect(400);

      await asAdmin(http().delete(`/api/admin/bookings/${bookingIds[2]}`)).expect(204);
      await asAdmin(http().get(`/api/admin/bookings/${bookingIds[2]}`)).expect(404);
      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.booking.delete', targetId: bookingIds[2] } });
      expect(audit?.profileId).toBe(profileId);
    });
  });

  describe('tickets', () => {
    /** Todos los tickets en el orden de la bandeja (recorre las páginas). */
    async function allTicketIds(): Promise<string[]> {
      const ids: string[] = [];
      for (let page = 1; page <= 50; page++) {
        const res = await asAdmin(http().get('/api/admin/tickets').query({ page, pageSize: 100 })).expect(200);
        ids.push(...res.body.items.map((t: { id: string }) => t.id));
        if (ids.length >= res.body.total) break;
      }
      return ids;
    }

    it('vencidos primero, luego por fecha límite; días hábiles con signo', async () => {
      const ids = await allTicketIds();
      const [future, overdue, closed] = ticketIds as [string, string, string];
      expect(ids.indexOf(overdue)).toBeGreaterThanOrEqual(0);
      expect(ids.indexOf(overdue)).toBeLessThan(ids.indexOf(closed));
      expect(ids.indexOf(closed)).toBeLessThan(ids.indexOf(future));

      const detail = await asAdmin(http().get(`/api/admin/tickets/${overdue}`)).expect(200);
      expect(detail.body.businessDaysLeft).toBeLessThan(0);
      const upcoming = await asAdmin(http().get(`/api/admin/tickets/${future}`)).expect(200);
      expect(upcoming.body.businessDaysLeft).toBeGreaterThanOrEqual(0);

      const open = await asAdmin(http().get('/api/admin/tickets').query({ status: 'RESOLVED', type: 'PQRS_CONSULTA', pageSize: 100 })).expect(200);
      expect(open.body.items.every((t: { status: string }) => t.status === 'RESOLVED')).toBe(true);
      await asAdmin(http().get('/api/admin/tickets').query({ type: 'OTRO' })).expect(400);
    });

    it('resolver fija resolvedAt y responsable; reabrir lo borra', async () => {
      const [, overdue] = ticketIds as [string, string];
      const res = await asAdmin(http().patch(`/api/admin/tickets/${overdue}`))
        .send({ status: 'RESOLVED', resolution: '  Respondimos por correo.\r\n\r\n\r\nGracias.  ' })
        .expect(200);
      expect(res.body.status).toBe('RESOLVED');
      expect(res.body.resolution).toBe('Respondimos por correo.\n\nGracias.');
      expect(res.body.resolvedAt).not.toBeNull();
      const row = await prisma.ticket.findUniqueOrThrow({ where: { id: overdue } });
      expect(row.handledById).toBe(adminId);

      const reopened = await asAdmin(http().patch(`/api/admin/tickets/${overdue}`)).send({ status: 'IN_PROGRESS' }).expect(200);
      expect(reopened.body.resolvedAt).toBeNull();
      expect(reopened.body.resolution).toBe('Respondimos por correo.\n\nGracias.');

      const tooLong = await asAdmin(http().patch(`/api/admin/tickets/${overdue}`)).send({ status: 'RESOLVED', resolution: 'a'.repeat(3001) }).expect(400);
      expect(tooLong.body.details).toEqual({ resolution: 'TOO_LONG' });
      const audit = await prisma.auditLog.findFirst({ where: { action: 'admin.ticket.update', targetId: overdue }, orderBy: { id: 'desc' } });
      expect(audit?.metadata).toEqual({ from: 'RESOLVED', to: 'IN_PROGRESS', resolutionChanged: false });
    });
  });

  describe('auditoría', () => {
    it('filtra por acción (exacta o prefijo), actor y perfil; id como string', async () => {
      const exact = await asAdmin(http().get('/api/admin/audit-logs').query({ action: 'admin.user.create', actor: ADMIN_USERNAME })).expect(200);
      expect(exact.body.total).toBeGreaterThanOrEqual(1);
      expect(exact.body.items.every((a: { action: string; actorUsername: string }) => a.action === 'admin.user.create' && a.actorUsername === ADMIN_USERNAME)).toBe(true);
      expect(typeof exact.body.items[0].id).toBe('string');
      expect(exact.body.items[0]).not.toHaveProperty('ipHash');

      const prefix = await asAdmin(http().get('/api/admin/audit-logs').query({ action: 'admin.user.', actor: ADMIN_USERNAME.toUpperCase() })).expect(200);
      const actions = new Set(prefix.body.items.map((a: { action: string }) => a.action));
      expect(actions.has('admin.user.suspend')).toBe(true);
      expect([...actions].every((a) => String(a).startsWith('admin.user.'))).toBe(true);

      const byProfile = await asAdmin(http().get('/api/admin/audit-logs').query({ profileId, action: 'admin.booking.*' })).expect(200);
      expect(byProfile.body.items.every((a: { profileId: string }) => a.profileId === profileId)).toBe(true);
      expect(byProfile.body.total).toBeGreaterThanOrEqual(2);

      await asAdmin(http().get('/api/admin/audit-logs').query({ action: 'DROP TABLE' })).expect(400);
    });
  });

  describe('géneros', () => {
    it('crea con slug derivado, rechaza duplicados y edita', async () => {
      const res = await asAdmin(http().post('/api/admin/genres')).send({ name: `  ${GENRE_NAME}  ` }).expect(201);
      genreId = res.body.id;
      expect(res.body).toMatchObject({ name: GENRE_NAME, slug: `e2e-genero-${run}`, isActive: true, profiles: 0 });

      const dup = await asAdmin(http().post('/api/admin/genres')).send({ name: GENRE_NAME.toUpperCase() }).expect(409);
      expect(dup.body.code).toBe('GENRE_NAME_TAKEN');
      const empty = await asAdmin(http().post('/api/admin/genres')).send({ name: '🎧🎧' }).expect(400);
      expect(empty.body.details).toEqual({ name: 'INVALID' });

      const patched = await asAdmin(http().patch(`/api/admin/genres/${genreId}`)).send({ isActive: false, sortOrder: 5 }).expect(200);
      expect(patched.body).toMatchObject({ isActive: false, sortOrder: 5, slug: `e2e-genero-${run}` });
      await asAdmin(http().patch(`/api/admin/genres/${genreId}`)).send({ name: null }).expect(400);
      await asAdmin(http().patch(`/api/admin/genres/${genreId}`)).send({ slug: 'otro' }).expect(400);
      await asAdmin(http().patch(`/api/admin/genres/${genreId}`)).send({}).expect(400);
      await asAdmin(http().patch('/api/admin/genres/999999999')).send({ isActive: true }).expect(404);

      const list = await asAdmin(http().get('/api/admin/genres')).expect(200);
      expect(list.body.find((g: { id: number }) => g.id === genreId)).toMatchObject({ isActive: false });
    });

    it('en uso no se borra (409); libre sí', async () => {
      await prisma.profileGenre.create({ data: { profileId, genreId } });
      const inUse = await asAdmin(http().delete(`/api/admin/genres/${genreId}`)).expect(409);
      expect(inUse.body.code).toBe('GENRE_IN_USE');
      const list = await asAdmin(http().get('/api/admin/genres')).expect(200);
      expect(list.body.find((g: { id: number }) => g.id === genreId).profiles).toBe(1);

      await prisma.profileGenre.deleteMany({ where: { profileId, genreId } });
      await asAdmin(http().delete(`/api/admin/genres/${genreId}`)).expect(204);
      expect(await prisma.genre.findUnique({ where: { id: genreId } })).toBeNull();
      genreId = 0;
    });
  });
});
