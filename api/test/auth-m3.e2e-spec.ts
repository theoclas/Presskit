// e2e de M3 (auth) contra la BD de desarrollo/CI: registro, verificación del correo, olvido y
// restablecimiento de la contraseña y re-aceptación de términos. Usuarios desechables.
//
// Correos: si mailpit responde en MAILPIT_URL (por defecto http://127.0.0.1:8025) y el SMTP del
// .env es local, los correos salen de verdad hacia mailpit y los enlaces se leen de su API (y
// al final se borran solo los de esta corrida). Si no (p. ej. en CI, donde mailpit no publica
// el puerto de la API), el token se toma de la llamada a MailService.send.
import { createTransport } from 'nodemailer';
import { randomBytes } from 'node:crypto';
import { LEGAL_DOCS } from '@fersua/shared';
import { AdminUsersService } from '../src/admin/users/admin-users.service';
import { AccountService } from '../src/auth/account.service';
import { XHR_HEADER_VALUE } from '../src/auth/auth.constants';
import { TestUsers, cookieFrom, createTestApp, nextIp, setCookieHeader, strongPassword, uniqueEmail, type TestApp } from './auth.e2e-helpers';

const MAILPIT = (process.env.MAILPIT_URL ?? 'http://127.0.0.1:8025').replace(/\/+$/, '');
const LOCAL_SMTP = new Set(['127.0.0.1', 'localhost', '::1', 'mailpit']);
const run = randomBytes(3).toString('hex');

type MailTemplate = 'verify-email' | 'reset-password' | 'password-changed';
const SUBJECTS: Record<MailTemplate, string> = {
  'verify-email': 'Confirma tu correo en Fersua Studio',
  'reset-password': 'Restablece tu contraseña de Fersua Studio',
  'password-changed': 'Tu contraseña de Fersua Studio cambió',
};

interface MailpitSummary {
  ID: string;
  Subject: string;
  To: { Address: string }[];
}

async function mailpitReachable(): Promise<boolean> {
  try {
    const r = await fetch(`${MAILPIT}/api/v1/info`, { signal: AbortSignal.timeout(1_500) });
    return r.ok;
  } catch {
    return false;
  }
}

async function mailpitSearch(address: string): Promise<MailpitSummary[]> {
  const r = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}&limit=50`);
  if (!r.ok) throw new Error(`mailpit search ${r.status}`);
  const body = (await r.json()) as { messages?: MailpitSummary[] };
  return body.messages ?? [];
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('Auth M3 (e2e)', () => {
  let t: TestApp;
  let users: TestUsers;
  let account: AccountService;
  let useMailpit = false;
  /** Usuarios creados por /auth/register (TestUsers no los conoce). */
  const registered: string[] = [];
  /** Buzones de esta corrida, para borrar solo sus correos en mailpit. */
  const inboxes = new Set<string>();
  let seq = 0;

  const newUsername = () => `m3${run}n${++seq}`;
  const newEmail = (tag: string) => {
    const e = uniqueEmail(`m3${tag}${++seq}`);
    inboxes.add(e);
    return e;
  };

  beforeAll(async () => {
    t = await createTestApp();
    users = new TestUsers(t.prisma, t.config);
    account = t.app.get(AccountService);
    useMailpit = LOCAL_SMTP.has(t.config.smtp.host) && (await mailpitReachable());
    if (useMailpit) {
      t.mail.setTransportForTesting(
        createTransport({ host: t.config.smtp.host, port: t.config.smtp.port, secure: t.config.smtp.secure }) as unknown as Parameters<
          typeof t.mail.setTransportForTesting
        >[0],
      );
    }
  });

  afterAll(async () => {
    await account?.settledForTesting();
    await t?.mail.drainForTesting();
    if (useMailpit) {
      const ids: string[] = [];
      for (const address of inboxes) ids.push(...(await mailpitSearch(address)).map((m) => m.ID));
      if (ids.length) {
        await fetch(`${MAILPIT}/api/v1/messages`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ IDs: ids }),
        });
      }
    }
    if (registered.length && t) {
      const rows = await t.prisma.user.findMany({ where: { username: { in: registered } }, select: { id: true } });
      const ids = rows.map((r) => r.id);
      if (ids.length) {
        await t.prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: ids } }, { targetId: { in: ids } }] } });
        await t.prisma.user.deleteMany({ where: { id: { in: ids } } });
      }
    }
    await users?.cleanup();
    await t?.app.close();
  });

  const post = (path: string, body: object, opts: { ip?: string; xhr?: boolean; access?: string; cookie?: string } = {}) => {
    const r = t.http.post(path).set('Origin', t.origin).set('X-Forwarded-For', opts.ip ?? nextIp());
    if (opts.xhr !== false) r.set('X-Requested-With', XHR_HEADER_VALUE);
    if (opts.access) r.set('Authorization', `Bearer ${opts.access}`);
    if (opts.cookie) r.set('Cookie', opts.cookie);
    return r.send(body);
  };
  const me = (access: string) => t.http.get('/api/auth/me').set('Authorization', `Bearer ${access}`);
  const register = (over: Record<string, unknown> = {}, ip?: string) =>
    post(
      '/api/auth/register',
      { username: newUsername(), email: newEmail('reg'), password: strongPassword(), acceptTerms: true, acceptPrivacy: true, confirmAge: true, ...over },
      { ip },
    );
  const login = (username: string, password: string) =>
    t.http.post('/api/auth/login').set('Origin', t.origin).set('X-Forwarded-For', nextIp()).send({ username, password });

  /** Token del último correo de este tipo enviado a `address` (mailpit o, si no hay, la llamada a send). */
  async function tokenFromMail(address: string, template: 'verify-email' | 'reset-password'): Promise<string> {
    await account.settledForTesting();
    await t.mail.drainForTesting();
    if (!useMailpit) {
      const call = [...t.sendSpy.mock.calls].reverse().find(([to, tpl]) => to === address && tpl === template);
      if (!call) throw new Error(`no se envió ${template}`);
      return (call[2] as { token: string }).token;
    }
    for (let i = 0; i < 50; i++) {
      const hit = (await mailpitSearch(address)).find((m) => m.Subject === SUBJECTS[template]);
      if (hit) {
        const r = await fetch(`${MAILPIT}/api/v1/message/${hit.ID}`);
        const msg = (await r.json()) as { Text: string };
        const path = template === 'verify-email' ? '/verificar-correo#t=' : '/restablecer#t=';
        const at = msg.Text.indexOf(`${t.config.publicUrl}${path}`);
        if (at === -1) throw new Error('el enlace no sale de PUBLIC_URL');
        const m = /#t=([A-Za-z0-9_.%-]+)/.exec(msg.Text.slice(at));
        return decodeURIComponent(m![1]!);
      }
      await wait(100);
    }
    throw new Error(`no llegó ${template} a mailpit`);
  }

  /** Cuántos correos de este tipo recibió `address` (mailpit y la llamada a send). */
  async function mailCount(address: string, template: MailTemplate): Promise<number> {
    await account.settledForTesting();
    await t.mail.drainForTesting();
    const sent = t.sendSpy.mock.calls.filter(([to, tpl]) => to === address && tpl === template).length;
    if (!useMailpit) return sent;
    await wait(300);
    const inMailpit = (await mailpitSearch(address)).filter((m) => m.Subject === SUBJECTS[template]).length;
    expect(inMailpit).toBe(sent);
    return inMailpit;
  }

  // ---------------------------------------------------------------- registro

  it('GET /auth/registration refleja REGISTRATION_OPEN y se cachea 60 s', async () => {
    const res = await t.http.get('/api/auth/registration').expect(200);
    expect(res.body).toEqual({ open: true });
    expect(res.headers['cache-control']).toMatch(/^public, max-age=60/);
  });

  it('registro abierto: 201 con SessionDto y cookie; guarda USER, consentimientos y correo en minúscula; envía verify-email', async () => {
    const username = newUsername();
    const email = newEmail('ok');
    const password = strongPassword();
    const body = { username: username.toUpperCase(), email: email.toUpperCase(), password, acceptTerms: true, acceptPrivacy: true, confirmAge: true };

    const noXhr = await post('/api/auth/register', body, { xhr: false }).expect(403);
    expect(noXhr.body.code).toBe('XHR_HEADER_REQUIRED');

    const res = await post('/api/auth/register', body).expect(201);
    registered.push(username);
    expect(res.body).toMatchObject({
      expiresIn: 900,
      user: {
        username,
        email,
        emailVerified: false,
        role: 'USER',
        mustChangePassword: false,
        mfaEnabled: false,
        profile: null,
        termsVersion: LEGAL_DOCS.artistTerms.version,
        termsOutdated: false,
        ageConfirmed: true,
      },
    });
    expect(cookieFrom(res, t.cookieName)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(setCookieHeader(res, t.cookieName)).toMatch(/HttpOnly/);
    expect(res.headers['cache-control']).toBe('no-store');

    const row = await t.prisma.user.findUniqueOrThrow({ where: { username } });
    expect(row).toMatchObject({
      email,
      role: 'USER',
      adminSlot: null,
      emailVerifiedAt: null,
      termsVersion: LEGAL_DOCS.artistTerms.version,
      privacyVersion: LEGAL_DOCS.privacy.version,
    });
    expect(row.termsAcceptedAt).toBeInstanceOf(Date);
    expect(row.privacyAcceptedAt).toBeInstanceOf(Date);
    expect(row.ageConfirmedAt).toBeInstanceOf(Date);
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    const audit = await t.prisma.auditLog.findFirst({ where: { action: 'auth.register', targetId: row.id } });
    expect(audit?.ipHash).toMatch(/^[a-f0-9]{64}$/);

    // La sesión sirve de una vez, y el login con la contraseña elegida también.
    const m = await me(res.body.accessToken).expect(200);
    expect(m.body.id).toBe(row.id);
    await login(username, password).expect(200);
    expect(await mailCount(email, 'verify-email')).toBe(1);
  });

  it('registro cerrado: 403 REGISTRATION_CLOSED (y GET /auth/registration lo dice)', async () => {
    const spy = jest.spyOn(t.config, 'registrationOpen', 'get').mockReturnValue(false);
    try {
      const res = await register().expect(403);
      expect(res.body).toEqual({ statusCode: 403, code: 'REGISTRATION_CLOSED', message: 'El registro está cerrado por ahora.' });
      expect((await t.http.get('/api/auth/registration').expect(200)).body).toEqual({ open: false });
    } finally {
      spy.mockRestore();
    }
  });

  it('usuario o correo repetidos: 409 USERNAME_TAKEN / EMAIL_TAKEN (sin importar mayúsculas)', async () => {
    const username = newUsername();
    const email = newEmail('dup');
    await register({ username, email }).expect(201);
    registered.push(username);

    const u = await register({ username: username.toUpperCase() }).expect(409);
    expect(u.body.code).toBe('USERNAME_TAKEN');
    const e = await register({ email: email.toUpperCase() }).expect(409);
    expect(e.body.code).toBe('EMAIL_TAKEN');
  });

  it('validación: casillas, usuario reservado, contraseña débil y campos de más', async () => {
    const bad = await register({ username: 'admin', acceptPrivacy: false }).expect(400);
    expect(bad.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { username: 'RESERVED', acceptPrivacy: 'REQUIRED' } });
    const weak = await register({ password: 'corta' }).expect(400);
    expect(weak.body).toMatchObject({ code: 'PASSWORD_WEAK', details: { password: 'TOO_SHORT' } });
    await register({ role: 'ADMIN' }).expect(400);
    await register({ emailVerifiedAt: new Date().toISOString() }).expect(400);
    // Sintaxis de lista o de "nombre <buzón>": el SMTP lo entregaría a OTRO buzón. Nunca pasa.
    for (const email of [`x<victima.${run}@example.com>`, `a,victima.${run}@example.com`, `"a b"@example.com`]) {
      const inj = await register({ email }).expect(400);
      expect(inj.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { email: 'INVALID' } });
    }
  });

  it('honeypot lleno: el mismo 201 de apariencia, pero no se crea nada ni se envía correo', async () => {
    const username = newUsername();
    const email = newEmail('hp');
    const res = await register({ username, email, hp_x7: 'http://spam.example' }).expect(201);
    expect(res.body).toMatchObject({ expiresIn: 900, user: { username, email, role: 'USER', emailVerified: false } });
    expect(cookieFrom(res, t.cookieName)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await t.prisma.user.findUnique({ where: { username } })).toBeNull();
    await me(res.body.accessToken).expect(401);
    expect(await mailCount(email, 'verify-email')).toBe(0);
  });

  it('límite de registro: 5 por hora por IP', async () => {
    const ip = nextIp();
    for (let i = 0; i < 5; i++) await register({ username: 'admin' }, ip).expect(400);
    const res = await register({}, ip).expect(429);
    expect(res.body.code).toBe('RATE_LIMITED');
  });

  // ---------------------------------------------------------------- verificación del correo

  it('verificar el correo con el enlace del correo: 204; reutilizarlo o uno inventado: 400 TOKEN_INVALID', async () => {
    const username = newUsername();
    const email = newEmail('ver');
    const reg = await register({ username, email }).expect(201);
    registered.push(username);
    const token = await tokenFromMail(email, 'verify-email');

    await post('/api/auth/verify-email', { token }, { xhr: false }).expect(403);
    await post('/api/auth/verify-email', { token }).expect(204);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { username } });
    expect(row.emailVerifiedAt).toBeInstanceOf(Date);
    expect((await me(reg.body.accessToken).expect(200)).body.emailVerified).toBe(true);

    const reuse = await post('/api/auth/verify-email', { token }).expect(400);
    expect(reuse.body).toEqual({ statusCode: 400, code: 'TOKEN_INVALID', message: 'El enlace no es válido o ya venció. Pide uno nuevo.' });
    const fake = await post('/api/auth/verify-email', { token: `${'a'.repeat(43)}${'b'.repeat(22)}` }).expect(400);
    expect(fake.body).toEqual(reuse.body);
    await post('/api/auth/verify-email', { token: 'x' }).expect(400);

    const again = await post('/api/auth/resend-verification', {}, { access: reg.body.accessToken }).expect(409);
    expect(again.body.code).toBe('ALREADY_VERIFIED');
  });

  it('reenviar la verificación: 202, anula el enlace anterior y tiene tope de 3 por hora por usuario', async () => {
    const username = newUsername();
    const email = newEmail('rsd');
    const reg = await register({ username, email }).expect(201);
    registered.push(username);
    const access = reg.body.accessToken as string;
    const first = await tokenFromMail(email, 'verify-email');

    await t.http.post('/api/auth/resend-verification').set('Origin', t.origin).set('X-Forwarded-For', nextIp()).set('Authorization', `Bearer ${access}`).expect(403);
    await post('/api/auth/resend-verification', {}).expect(401);
    const r = await post('/api/auth/resend-verification', {}, { access }).expect(202);
    expect(r.text).toBe('');
    const second = await tokenFromMail(email, 'verify-email');
    expect(second).not.toBe(first);
    await post('/api/auth/verify-email', { token: first }).expect(400);

    await post('/api/auth/resend-verification', {}, { access }).expect(202);
    const limited = await post('/api/auth/resend-verification', {}, { access }).expect(429);
    expect(limited.body.code).toBe('RATE_LIMITED');
    expect(await mailCount(email, 'verify-email')).toBe(3);
  });

  // ---------------------------------------------------------------- olvido y restablecimiento

  it('olvidé mi contraseña: 202 idéntico para DJ real, inexistente y admin; solo el DJ recibe el enlace', async () => {
    const djEmail = newEmail('fgt');
    const adminEmail = newEmail('adm');
    const dj = await users.create({ email: djEmail });
    const admin = await users.create({ role: 'ADMIN', email: adminEmail, mfa: true });

    const noXhr = await post('/api/auth/forgot-password', { identifier: dj.username }, { xhr: false }).expect(403);
    expect(noXhr.body.code).toBe('XHR_HEADER_REQUIRED');

    const responses = [
      await post('/api/auth/forgot-password', { identifier: dj.username.toUpperCase() }).expect(202),
      await post('/api/auth/forgot-password', { identifier: `nadie${run}` }).expect(202),
      await post('/api/auth/forgot-password', { identifier: newEmail('nadie') }).expect(202),
      await post('/api/auth/forgot-password', { identifier: admin.username }).expect(202),
      await post('/api/auth/forgot-password', { identifier: adminEmail }).expect(202),
    ];
    for (const r of responses) {
      expect(r.text).toBe('');
      expect(r.headers['content-length']).toBe(responses[0]!.headers['content-length']);
      expect(r.headers['set-cookie']).toBeUndefined();
    }
    await account.settledForTesting();
    expect(await mailCount(djEmail, 'reset-password')).toBe(1);
    expect(await mailCount(adminEmail, 'reset-password')).toBe(0);
    expect(await t.prisma.emailToken.count({ where: { userId: admin.id } })).toBe(0);
    expect(t.sendSpy.mock.calls.filter(([, tpl]) => tpl === 'reset-password').every(([to]) => to === djEmail)).toBe(true);
  });

  it('restablecer: 204, revoca las sesiones viejas, verifica el correo y el login con la nueva funciona', async () => {
    const email = newEmail('rst');
    const dj = await users.create({ email });
    const old = await login(dj.username, dj.password).expect(200);
    const oldRefresh = cookieFrom(old, t.cookieName)!;

    await post('/api/auth/forgot-password', { identifier: email }).expect(202);
    const token = await tokenFromMail(email, 'reset-password');

    // Una contraseña débil no quema el enlace.
    const weak = await post('/api/auth/reset-password', { token, newPassword: 'corta' }).expect(400);
    expect(weak.body).toMatchObject({ code: 'PASSWORD_WEAK', details: { newPassword: 'TOO_SHORT' } });

    const newPassword = strongPassword();
    await post('/api/auth/reset-password', { token, newPassword }, { xhr: false }).expect(403);
    const res = await post('/api/auth/reset-password', { token, newPassword }).expect(204);
    expect(cookieFrom(res, t.cookieName)).toBe('');

    // Las sesiones anteriores murieron: ni el access token ni la cookie de refresh sirven.
    await me(old.body.accessToken).expect(401);
    const refresh = await t.http
      .post('/api/auth/refresh')
      .set('Origin', t.origin)
      .set('X-Forwarded-For', nextIp())
      .set('X-Requested-With', XHR_HEADER_VALUE)
      .set('Cookie', `${t.cookieName}=${oldRefresh}`)
      .expect(401);
    expect(refresh.body.code).toBe('REFRESH_INVALID');

    await login(dj.username, dj.password).expect(401);
    const fresh = await login(dj.username, newPassword).expect(200);
    expect(fresh.body.user.emailVerified).toBe(true);

    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: dj.id } });
    expect(row.tokenVersion).toBe(1);
    expect(row.failedLoginCount).toBe(0);
    const reuse = await post('/api/auth/reset-password', { token, newPassword: strongPassword() }).expect(400);
    expect(reuse.body.code).toBe('TOKEN_INVALID');
    expect(await mailCount(email, 'password-changed')).toBe(1);
    expect(await t.prisma.auditLog.count({ where: { action: 'auth.password_reset', targetId: dj.id } })).toBe(1);
  });

  it('el admin rescata la cuenta (clave temporal) o la suspende: los enlaces de restablecer pendientes mueren', async () => {
    const admin = await users.create({ role: 'ADMIN' });
    const actor = { id: admin.id, username: admin.username, ipHash: null };
    const adminUsers = t.app.get(AdminUsersService);
    for (const action of ['reset', 'suspend'] as const) {
      const email = newEmail(`adm${action}`);
      const dj = await users.create({ email });
      await post('/api/auth/forgot-password', { identifier: dj.username }).expect(202);
      const token = await tokenFromMail(email, 'reset-password');
      if (action === 'reset') {
        await adminUsers.resetPassword(actor, dj.id);
      } else {
        await adminUsers.suspend(actor, dj.id);
        await adminUsers.reactivate(actor, dj.id);
      }
      const res = await post('/api/auth/reset-password', { token, newPassword: strongPassword() }).expect(400);
      expect(res.body.code).toBe('TOKEN_INVALID');
    }
  });

  it('restablecer con un enlace de un correo que el admin cambió después: 400 TOKEN_INVALID', async () => {
    const email = newEmail('chg');
    const dj = await users.create({ email });
    await post('/api/auth/forgot-password', { identifier: dj.username }).expect(202);
    const token = await tokenFromMail(email, 'reset-password');
    await t.prisma.user.update({ where: { id: dj.id }, data: { email: newEmail('chg2') } });
    const res = await post('/api/auth/reset-password', { token, newPassword: strongPassword() }).expect(400);
    expect(res.body.code).toBe('TOKEN_INVALID');
    await login(dj.username, dj.password).expect(200);
  });

  // ---------------------------------------------------------------- términos

  it('términos desactualizados: /api/me/** responde 403 hasta aceptar; /auth/me y accept-terms siguen funcionando', async () => {
    const dj = await users.create({ email: newEmail('trm') });
    await t.prisma.user.update({ where: { id: dj.id }, data: { termsVersion: '2020-01', privacyVersion: LEGAL_DOCS.privacy.version } });
    const access = (await login(dj.username, dj.password).expect(200)).body.accessToken as string;

    expect((await me(access).expect(200)).body).toMatchObject({ termsOutdated: true, termsVersion: '2020-01' });
    const blocked = await t.http.get('/api/me/profile').set('Authorization', `Bearer ${access}`).expect(403);
    expect(blocked.body.code).toBe('TERMS_ACCEPTANCE_REQUIRED');

    await post('/api/auth/accept-terms', { acceptTerms: true, acceptPrivacy: true, confirmAge: true }, { access, xhr: false }).expect(403);
    const half = await post('/api/auth/accept-terms', { acceptTerms: true, acceptPrivacy: false, confirmAge: true }, { access }).expect(400);
    expect(half.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { acceptPrivacy: 'REQUIRED' } });
    // Esta cuenta no pasó por /registro (como las que crea el admin): también declara la mayoría de edad.
    expect((await me(access).expect(200)).body.ageConfirmed).toBe(false);
    const noAge = await post('/api/auth/accept-terms', { acceptTerms: true, acceptPrivacy: true }, { access }).expect(400);
    expect(noAge.body).toMatchObject({ code: 'VALIDATION_FAILED', details: { confirmAge: 'REQUIRED' } });
    const ok = await post('/api/auth/accept-terms', { acceptTerms: true, acceptPrivacy: true, confirmAge: true }, { access }).expect(200);
    expect(ok.body).toMatchObject({ id: dj.id, termsOutdated: false, ageConfirmed: true, termsVersion: LEGAL_DOCS.artistTerms.version });

    // Ya no es 403: sin perfil todavía, el editor responde 404 NO_PROFILE.
    const after = await t.http.get('/api/me/profile').set('Authorization', `Bearer ${access}`);
    expect(after.status).not.toBe(403);
    const row = await t.prisma.user.findUniqueOrThrow({ where: { id: dj.id } });
    expect(row.termsVersion).toBe(LEGAL_DOCS.artistTerms.version);
    expect(row.privacyVersion).toBe(LEGAL_DOCS.privacy.version);
    expect(row.termsAcceptedAt).toBeInstanceOf(Date);
    expect(row.ageConfirmedAt).toBeInstanceOf(Date);
    const accepted = await t.prisma.auditLog.findFirst({ where: { action: 'auth.terms_accepted', targetId: dj.id } });
    expect(accepted?.metadata).toMatchObject({ ageConfirmed: true });
    expect(await t.prisma.auditLog.count({ where: { action: 'auth.terms_accepted', targetId: dj.id } })).toBe(1);

    // Una vez declarada, la próxima re-aceptación ya no la pide.
    await t.prisma.user.update({ where: { id: dj.id }, data: { termsVersion: '2020-01' } });
    await post('/api/auth/accept-terms', { acceptTerms: true, acceptPrivacy: true }, { access }).expect(200);
  });

  it('el admin no acepta términos de artista: accept-terms 403 y termsOutdated siempre false', async () => {
    const admin = await users.create({ role: 'ADMIN' });
    const access = await users.session(t.app, admin, 'ADMIN');
    expect((await me(access).expect(200)).body.termsOutdated).toBe(false);
    await post('/api/auth/accept-terms', { acceptTerms: true, acceptPrivacy: true }, { access }).expect(403);
    await post('/api/auth/resend-verification', {}, { access }).expect(403);
  });
});
