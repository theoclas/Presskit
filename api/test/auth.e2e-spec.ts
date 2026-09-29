// e2e de auth contra la BD de desarrollo/CI: login, refresh con rotación y detección de reuso,
// logout, bloqueos, 2FA del admin, step-up y contraseña temporal. Usuarios desechables.
import { sha256Hex } from '../src/common/crypto';
import { currentTotp } from '../src/auth/mfa/totp';
import { XHR_HEADER_VALUE } from '../src/auth/auth.constants';
import { TestUsers, cookieFrom, createTestApp, nextIp, setCookieHeader, strongPassword, uniqueEmail, type TestApp } from './auth.e2e-helpers';

const EMAIL_DJ = uniqueEmail('dj');
const EMAIL_BLOQUEO = uniqueEmail('bloqueo');
const EMAIL_ADMIN = uniqueEmail('admin');
const EMAIL_TEMP = uniqueEmail('temp');
const EMAIL_MFA_PAUSE = uniqueEmail('mfapausa');

describe('Auth (e2e)', () => {
  let t: TestApp;
  let users: TestUsers;

  beforeAll(async () => {
    t = await createTestApp();
    users = new TestUsers(t.prisma, t.config);
  });

  afterAll(async () => {
    await users?.cleanup();
    await t?.app.close();
  });

  beforeEach(() => t.sendSpy.mockClear());

  const login = (username: string, password: string, ip = nextIp(), cookie?: string) => {
    const r = t.http.post('/api/auth/login').set('Origin', t.origin).set('X-Forwarded-For', ip);
    if (cookie) r.set('Cookie', cookie);
    return r.send({ username, password });
  };
  const refresh = (rt: string, ip = nextIp()) =>
    t.http
      .post('/api/auth/refresh')
      .set('Origin', t.origin)
      .set('X-Forwarded-For', ip)
      .set('X-Requested-With', XHR_HEADER_VALUE)
      .set('Cookie', `${t.cookieName}=${rt}`);
  const me = (access: string) => t.http.get('/api/auth/me').set('Authorization', `Bearer ${access}`);
  const mfa = (mfaToken: string, code: string, ip = nextIp()) =>
    t.http
      .post('/api/auth/mfa')
      .set('Origin', t.origin)
      .set('X-Forwarded-For', ip)
      .set('X-Requested-With', XHR_HEADER_VALUE)
      .send({ mfaToken, code });

  it('login de USER: SessionDto, cookies de sesión y /auth/me', async () => {
    const u = await users.create({ email: EMAIL_DJ });
    const res = await login(u.username.toUpperCase(), u.password).expect(200);
    expect(res.body).toMatchObject({ expiresIn: 900, user: { id: u.id, username: u.username, role: 'USER', mfaEnabled: false, mustChangePassword: false } });
    expect(typeof res.body.accessToken).toBe('string');

    const rt = setCookieHeader(res, t.cookieName)!;
    expect(rt).toMatch(/HttpOnly/);
    expect(rt).toMatch(/SameSite=Strict/);
    expect(rt).toMatch(/Path=\//);
    expect(rt).not.toMatch(/Domain=/i);
    expect(cookieFrom(res, t.cookieName)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(setCookieHeader(res, 'fs_session')).toMatch(/^fs_session=1;/);
    expect(setCookieHeader(res, 'fs_session')).not.toMatch(/HttpOnly/);
    expect(res.headers['cache-control']).toBe('no-store');

    const m = await me(res.body.accessToken).expect(200);
    expect(m.body).toEqual(res.body.user);
    await me('x.y.z').expect(401);
    await t.http.get('/api/auth/me').expect(401);
  });

  it('usuario inexistente, mal formado o contraseña mala: exactamente la misma respuesta', async () => {
    const u = await users.create();
    const t0 = Date.now();
    const a = await login(`nadie${Date.now()}`, 'lo-que-sea-123').expect(401);
    const t1 = Date.now();
    const b = await login(u.username, `${u.password}x`).expect(401);
    const t2 = Date.now();
    // Mismo piso de tiempo (300 ms) con o sin usuario real detrás.
    expect(t1 - t0).toBeGreaterThanOrEqual(290);
    expect(t2 - t1).toBeGreaterThanOrEqual(290);
    const c = await login('no válido!', 'x').expect(401);
    expect(a.body).toEqual({ statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Usuario o contraseña incorrectos.' });
    expect(b.body).toEqual(a.body);
    expect(c.body).toEqual(a.body);
  });

  it('refresh rota el token; el viejo es RACE hasta que el sucesor se usa, y entonces revoca la familia', async () => {
    const u = await users.create();
    const res = await login(u.username, u.password).expect(200);
    const c1 = cookieFrom(res, t.cookieName)!;

    // Sin la cabecera CSRF no se rota nada.
    const noXhr = await t.http.post('/api/auth/refresh').set('Cookie', `${t.cookieName}=${c1}`).expect(403);
    expect(noXhr.body.code).toBe('XHR_HEADER_REQUIRED');

    const r2 = await refresh(c1).expect(200);
    const c2 = cookieFrom(r2, t.cookieName)!;
    expect(c2).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(c2).not.toBe(c1);
    expect(r2.body.user.id).toBe(u.id);

    // Otra pestaña con la cookie vieja, dentro de los 10 s: RACE y la cookie no se toca.
    const race = await refresh(c1).expect(401);
    expect(race.body.code).toBe('REFRESH_RACE');
    expect(setCookieHeader(race, t.cookieName)).toBeNull();

    const r3 = await refresh(c2).expect(200);
    const c3 = cookieFrom(r3, t.cookieName)!;
    await me(r3.body.accessToken).expect(200);

    // El sucesor de c1 ya se usó: presentar c1 es robo → se revoca toda la familia.
    const reuse = await refresh(c1).expect(401);
    expect(reuse.body.code).toBe('REFRESH_INVALID');
    expect(cookieFrom(reuse, t.cookieName)).toBe('');
    const after = await refresh(c3).expect(401);
    expect(after.body.code).toBe('REFRESH_INVALID');
    await me(r3.body.accessToken).expect(401);

    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'security.refresh_reuse', targetId: u.id } });
    expect(audit).not.toBeNull();
    const family = await t.prisma.refreshToken.findMany({ where: { userId: u.id }, select: { revokedAt: true, revokeReason: true } });
    expect(family.every((f) => f.revokedAt && f.revokeReason === 'REUSE_DETECTED')).toBe(true);
  });

  it('reuso pasada la gracia de 10 s también revoca la familia', async () => {
    const u = await users.create();
    const res = await login(u.username, u.password).expect(200);
    const c1 = cookieFrom(res, t.cookieName)!;
    const r2 = await refresh(c1).expect(200);
    await t.prisma.refreshToken.update({ where: { tokenHash: sha256Hex(c1) }, data: { replacedAt: new Date(Date.now() - 30_000) } });
    expect((await refresh(c1).expect(401)).body.code).toBe('REFRESH_INVALID');
    await refresh(cookieFrom(r2, t.cookieName)!).expect(401);
  });

  it('refresh sin cookie o con una inventada → REFRESH_INVALID y borra la cookie', async () => {
    const none = await t.http.post('/api/auth/refresh').set('X-Requested-With', XHR_HEADER_VALUE).expect(401);
    expect(none.body.code).toBe('REFRESH_INVALID');
    const fake = await refresh('A'.repeat(43)).expect(401);
    expect(fake.body.code).toBe('REFRESH_INVALID');
    expect(cookieFrom(fake, 'fs_session')).toBe('');
  });

  it('logout cierra la sesión de la cookie; logout-all mata todos los access tokens', async () => {
    const u = await users.create();
    const s1 = await login(u.username, u.password).expect(200);
    const s2 = await login(u.username, u.password).expect(200);
    const s3 = await login(u.username, u.password).expect(200);

    await t.http
      .post('/api/auth/logout')
      .set('Origin', t.origin)
      .set('X-Requested-With', XHR_HEADER_VALUE)
      .set('Cookie', `${t.cookieName}=${cookieFrom(s1, t.cookieName)}`)
      .expect(204);
    await me(s1.body.accessToken).expect(401);
    await me(s2.body.accessToken).expect(200);

    await t.http.post('/api/auth/logout-all').set('Origin', t.origin).set('Authorization', `Bearer ${s2.body.accessToken}`).expect(204);
    await me(s2.body.accessToken).expect(401);
    await me(s3.body.accessToken).expect(401);
    expect((await refresh(cookieFrom(s3, t.cookieName)!).expect(401)).body.code).toBe('REFRESH_INVALID');
    // logout-all exige sesión.
    await t.http.post('/api/auth/logout-all').set('Origin', t.origin).expect(401);
  });

  it('bloqueo por pareja (usuario, IP) tras 5 fallos, sin dejar afuera a otra red', async () => {
    const u = await users.create();
    const ipA = nextIp();
    for (let i = 0; i < 5; i++) await login(u.username, 'mala-clave-123', ipA).expect(401);
    // Correcta pero desde la red bloqueada: mismo 401 genérico.
    const blocked = await login(u.username, u.password, ipA).expect(401);
    expect(blocked.body.code).toBe('INVALID_CREDENTIALS');
    await login(u.username, u.password, nextIp()).expect(200);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { failedLoginCount: true, lockedUntil: true } });
    expect(row).toEqual({ failedLoginCount: 0, lockedUntil: null });
  });

  it('tope suave: 30 fallos desde varias redes bloquean al usuario; el navegador conocido entra igual', async () => {
    const u = await users.create({ email: EMAIL_BLOQUEO });
    const first = await login(u.username, u.password).expect(200);
    const kd = setCookieHeader(first, t.config.cookieSecure ? '__Host-kd' : 'kd')!.split(';')[0]!;

    for (let net = 0; net < 6; net++) {
      const ip = nextIp();
      for (let i = 0; i < 5; i++) await login(u.username, 'mala-clave-123', ip).expect(401);
    }
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { failedLoginCount: true, lockedUntil: true } });
    expect(row.failedLoginCount).toBe(30);
    expect(row.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect(t.sendSpy).toHaveBeenCalledWith(EMAIL_BLOQUEO, 'account-locked', expect.objectContaining({ until: expect.any(Date) }));

    await login(u.username, u.password, nextIp()).expect(401);
    await login(u.username, u.password, nextIp(), kd).expect(200);
  }, 90_000);

  it('intentos paralelos: el mutex por usuario evita verificar (y contar) de más', async () => {
    const u = await users.create();
    const results = await Promise.all(Array.from({ length: 10 }, () => login(u.username, 'mala-clave-123', nextIp())));
    expect(results.every((r) => r.status === 401 && r.body.code === 'INVALID_CREDENTIALS')).toBe(true);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { failedLoginCount: true } });
    expect(row.failedLoginCount).toBeGreaterThanOrEqual(1);
    expect(row.failedLoginCount).toBeLessThan(10);
  });

  it('login del ADMIN: exige el segundo paso (TOTP o código de recuperación)', async () => {
    const a = await users.create({ role: 'ADMIN', mfa: true, email: EMAIL_ADMIN });
    const ip = nextIp();

    const step1 = await login(a.username, a.password, ip).expect(200);
    expect(step1.body).toEqual({ mfaRequired: true, mfaToken: expect.any(String) });
    expect(setCookieHeader(step1, t.cookieName)).toBeNull();

    // mfaToken no es un access token.
    await me(step1.body.mfaToken).expect(401);
    const noXhr = await t.http.post('/api/auth/mfa').set('Origin', t.origin).send({ mfaToken: step1.body.mfaToken, code: '000000' });
    expect(noXhr.status).toBe(403);

    const code = currentTotp(a.totpSecret!);
    const wrong = String((Number(code) + 1) % 1_000_000).padStart(6, '0');
    expect((await mfa(step1.body.mfaToken, wrong, ip).expect(401)).body.code).toBe('MFA_INVALID');

    const ok = await mfa(step1.body.mfaToken, code, ip).expect(200);
    expect(ok.body.user).toMatchObject({ id: a.id, role: 'ADMIN', mfaEnabled: true, profile: null });
    expect(cookieFrom(ok, t.cookieName)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await me(ok.body.accessToken).expect(200);
    expect(t.sendSpy).toHaveBeenCalledWith(EMAIL_ADMIN, 'admin-new-login', expect.objectContaining({ method: 'totp' }));

    // Un solo uso por mfaToken.
    expect((await mfa(step1.body.mfaToken, code, ip).expect(401)).body.code).toBe('MFA_TOKEN_EXPIRED');

    // Código de recuperación: sirve una vez.
    const step2 = await login(a.username, a.password, ip).expect(200);
    await mfa(step2.body.mfaToken, a.recoveryCodes[0]!.toLowerCase(), ip).expect(200);
    const stored = await t.prisma.user.findUniqueOrThrow({ where: { id: a.id }, select: { mfaRecoveryCodes: true } });
    expect(stored.mfaRecoveryCodes).toHaveLength(9);
    const step3 = await login(a.username, a.password, ip).expect(200);
    expect((await mfa(step3.body.mfaToken, a.recoveryCodes[0]!, ip).expect(401)).body.code).toBe('MFA_INVALID');

    // Tres códigos malos queman el token.
    await mfa(step3.body.mfaToken, 'AAAA-AAAA', ip).expect(401);
    expect((await mfa(step3.body.mfaToken, 'AAAA-AAAA', ip).expect(401)).body.code).toBe('MFA_TOKEN_EXPIRED');
  });

  it('2FA: los códigos malos se cuentan por usuario entre mfaTokens, se auditan, avisan y pausan (salvo el navegador conocido)', async () => {
    const a = await users.create({ role: 'ADMIN', mfa: true, email: EMAIL_MFA_PAUSE });
    const kdName = t.config.cookieSecure ? '__Host-kd' : 'kd';
    // Un ingreso completo deja la cookie de dispositivo conocido.
    const first = await login(a.username, a.password).expect(200);
    const ok = await mfa(first.body.mfaToken, currentTotp(a.totpSecret!)).expect(200);
    const kd = setCookieHeader(ok, kdName)!.split(';')[0]!;
    const wrongCode = () => String((Number(currentTotp(a.totpSecret!)) + 500_000) % 1_000_000).padStart(6, '0');

    // Cada login con la contraseña correcta da un mfaToken nuevo, pero el contador es del usuario.
    for (let i = 0; i < 3; i++) {
      const step = await login(a.username, a.password).expect(200);
      expect((await mfa(step.body.mfaToken, wrongCode()).expect(401)).body.code).toBe('MFA_INVALID');
    }
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: a.id }, select: { mfaFailedCount: true, mfaLockedUntil: true } });
    expect(row.mfaFailedCount).toBe(3);
    expect(row.mfaLockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000);
    expect(await t.prisma.auditLog.count({ where: { targetId: a.id, action: 'security.mfa_failed' } })).toBe(3);
    expect(await t.prisma.auditLog.count({ where: { targetId: a.id, action: 'auth.mfa_challenge' } })).toBe(4);
    expect(t.sendSpy).toHaveBeenCalledWith(EMAIL_MFA_PAUSE, 'admin-mfa-failed', expect.objectContaining({ failures: 3, pausedUntil: expect.any(Date) }));

    // En pausa: no se entregan más mfaToken (429 MFA_PAUSED, solo tras la contraseña correcta).
    const paused = await login(a.username, a.password).expect(429);
    expect(paused.body.code).toBe('MFA_PAUSED');
    expect((await login(a.username, `${a.password}x`).expect(401)).body.code).toBe('INVALID_CREDENTIALS');
    // El navegador donde ya entró no queda afuera (H6).
    const known = await login(a.username, a.password, nextIp(), kd).expect(200);
    expect(known.body.mfaRequired).toBe(true);
  });

  it('cookie de dispositivo conocido: deja de servir cuando cambia la contraseña (tokenVersion)', async () => {
    const u = await users.create();
    const kdName = t.config.cookieSecure ? '__Host-kd' : 'kd';
    const first = await login(u.username, u.password).expect(200);
    const kd = setCookieHeader(first, kdName)!.split(';')[0]!;
    // Bloqueo de la pareja (usuario, IP): con la cookie vigente se entra igual.
    const ip = nextIp();
    for (let i = 0; i < 5; i++) await login(u.username, 'mala-clave-123', ip).expect(401);
    await login(u.username, u.password, ip).expect(401);
    const ok = await login(u.username, u.password, ip, kd).expect(200);
    // Cerrar todas las sesiones sube tokenVersion: la cookie vieja ya no salta el bloqueo
    // (otra red, para no chocar con el límite de 10 logins por IP).
    await t.http.post('/api/auth/logout-all').set('Origin', t.origin).set('Authorization', `Bearer ${ok.body.accessToken}`).expect(204);
    const ip2 = nextIp();
    for (let i = 0; i < 5; i++) await login(u.username, 'mala-clave-123', ip2).expect(401);
    await login(u.username, u.password, ip2, kd).expect(401);
  });

  it('ADMIN sin 2FA configurado no entra; con contraseña mala da el 401 genérico', async () => {
    const a = await users.create({ role: 'ADMIN' });
    expect((await login(a.username, a.password).expect(403)).body.code).toBe('MFA_SETUP_REQUIRED');
    expect((await login(a.username, 'mala-clave-123').expect(401)).body.code).toBe('INVALID_CREDENTIALS');
  });

  it('step-up: solo el ADMIN, con contraseña y TOTP', async () => {
    const a = await users.create({ role: 'ADMIN', mfa: true });
    const access = await users.session(t.app, a, 'ADMIN');
    const stepUp = (token: string, body: Record<string, unknown>) =>
      t.http
        .post('/api/auth/step-up')
        .set('Origin', t.origin)
        .set('X-Forwarded-For', nextIp())
        .set('X-Requested-With', XHR_HEADER_VALUE)
        .set('Authorization', `Bearer ${token}`)
        .send(body);

    const code = currentTotp(a.totpSecret!);
    const bad = await stepUp(access, { password: 'mala-clave-123', code }).expect(403);
    expect(bad.body.code).toBe('STEP_UP_INVALID');
    const ok = await stepUp(access, { password: a.password, code }).expect(200);
    expect(ok.body).toEqual({ stepUpToken: expect.any(String), expiresIn: 300 });
    // El mismo código no se puede reusar.
    await stepUp(access, { password: a.password, code }).expect(403);

    const u = await users.create();
    const userAccess = await users.session(t.app, u, 'USER');
    expect((await stepUp(userAccess, { password: u.password, code: '123456' }).expect(403)).body.code).toBe('FORBIDDEN');
  });

  it('contraseña temporal: solo me/change-password hasta cambiarla; después la sesión vieja muere', async () => {
    const u = await users.create({ mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() + 3_600_000), email: EMAIL_TEMP });
    const s = await login(u.username, u.password).expect(200);
    expect(s.body.user.mustChangePassword).toBe(true);
    const access = s.body.accessToken as string;
    await me(access).expect(200);
    // Cualquier otra ruta con sesión: 403 antes incluso del chequeo de rol.
    const blocked = await t.http
      .post('/api/auth/step-up')
      .set('Origin', t.origin)
      .set('X-Requested-With', XHR_HEADER_VALUE)
      .set('Authorization', `Bearer ${access}`)
      .send({ password: 'x', code: '123456' })
      .expect(403);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');

    const change = (body: Record<string, unknown>, token = access) =>
      t.http.post('/api/auth/change-password').set('Origin', t.origin).set('X-Forwarded-For', nextIp()).set('Authorization', `Bearer ${token}`).send(body);

    expect((await change({ currentPassword: 'mala-clave-123', newPassword: strongPassword() }).expect(401)).body.code).toBe('INVALID_CREDENTIALS');
    expect((await change({ currentPassword: u.password, newPassword: u.password }).expect(400)).body.code).toBe('SAME_PASSWORD');
    const weak = await change({ currentPassword: u.password, newPassword: 'corta' }).expect(400);
    expect(weak.body).toMatchObject({ code: 'PASSWORD_WEAK', details: { newPassword: 'TOO_SHORT' } });

    const next = strongPassword();
    const done = await change({ currentPassword: u.password, newPassword: next }).expect(200);
    expect(done.body.user.mustChangePassword).toBe(false);
    expect(cookieFrom(done, t.cookieName)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await me(access).expect(401);
    await refresh(cookieFrom(s, t.cookieName)!).expect(401);
    await me(done.body.accessToken).expect(200);
    await refresh(cookieFrom(done, t.cookieName)!).expect(200);
    expect(t.sendSpy).toHaveBeenCalledWith(EMAIL_TEMP, 'password-changed', expect.objectContaining({ isAdmin: false }));
    await login(u.username, next).expect(200);
    await login(u.username, u.password).expect(401);
  });

  it('contraseña temporal vencida: 401 genérico aunque sea la correcta', async () => {
    const u = await users.create({ mustChangePassword: true, tempPasswordExpiresAt: new Date(Date.now() - 1_000) });
    expect((await login(u.username, u.password).expect(401)).body.code).toBe('INVALID_CREDENTIALS');
  });

  it('suspendido: su token deja de servir y ACCOUNT_SUSPENDED solo con la contraseña correcta', async () => {
    const u = await users.create();
    const s = await login(u.username, u.password).expect(200);
    await t.prisma.user.update({ where: { id: u.id }, data: { status: 'SUSPENDED' } });
    await me(s.body.accessToken).expect(401);
    expect((await refresh(cookieFrom(s, t.cookieName)!).expect(401)).body.code).toBe('REFRESH_INVALID');
    expect((await login(u.username, 'mala-clave-123').expect(401)).body.code).toBe('INVALID_CREDENTIALS');
    expect((await login(u.username, u.password).expect(403)).body.code).toBe('ACCOUNT_SUSPENDED');
  });

  it('tokenVersion distinto en la BD invalida el access token al instante', async () => {
    const u = await users.create();
    const s = await login(u.username, u.password).expect(200);
    await me(s.body.accessToken).expect(200);
    await t.prisma.user.update({ where: { id: u.id }, data: { tokenVersion: { increment: 1 } } });
    await me(s.body.accessToken).expect(401);
  });
});
