import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { USERNAME_RE, normalizeUsername, type LoginResultDto, type MeDto, type SessionDto, type StepUpDto } from '@fersua/shared';
import { AuditService } from '../audit/audit.service';
import { AppError, Errors } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { AppConfig } from '../config/app-config.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { ACCESS_TTL_SECONDS, MFA_LOCKOUT, STEP_UP_TTL_SECONDS } from './auth.constants';
import type { AuthUser } from './auth-user';
import type { ChangePasswordBody, LoginBody, MfaVerifyBody, StepUpBody } from './auth.dto';
import { LockoutService, lockKey } from './lockout/lockout.service';
import { ME_SELECT, toMeDto } from './me';
import { MfaService } from './mfa/mfa.service';
import { PasswordHasher } from './password/password-hasher.service';
import { checkNewPassword, passwordTooLong, samePassword, weakPasswordError } from './password/password-policy';
import {
  clearRefreshCookies,
  readKnownDeviceCookie,
  readRefreshCookie,
  setKnownDeviceCookie,
  setRefreshCookies,
} from './tokens/auth-cookies';
import { SessionService, type IssuedSession, type SessionMeta } from './tokens/session.service';
import { TokenService } from './tokens/token.service';

const LOGIN_SELECT = {
  id: true,
  username: true,
  email: true,
  passwordHash: true,
  role: true,
  status: true,
  tokenVersion: true,
  mustChangePassword: true,
  tempPasswordExpiresAt: true,
  failedLoginCount: true,
  lockedUntil: true,
  lastLoginIpHash: true,
  mfaSecretEnc: true,
  mfaEnabledAt: true,
  mfaRecoveryCodes: true,
  mfaFailedCount: true,
  mfaLockedUntil: true,
} satisfies Prisma.UserSelect;

type LoginUser = Prisma.UserGetPayload<{ select: typeof LOGIN_SELECT }>;

/** Mismo cuerpo en todo fallo de login: no revela si el usuario existe ni por qué falló. */
const invalidCredentials = () => Errors.unauthorized('INVALID_CREDENTIALS', 'Usuario o contraseña incorrectos.');
/** Mínimo de un login fallido. Cubre argon2 (~50-80 ms en el VPS) más la escritura del contador. */
const LOGIN_FAILURE_FLOOR_MS = 300;
const sleep = (ms: number) => (ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve());
const mfaInvalid = () => Errors.unauthorized('MFA_INVALID', 'El código no es correcto o ya se usó.');
const mfaExpired = (message = 'El paso de verificación venció. Vuelve a ingresar tu contraseña.') =>
  Errors.unauthorized('MFA_TOKEN_EXPIRED', message);
/** Pausa del 2FA tras varios códigos malos. Solo la ve quien ya puso la contraseña correcta (L4). */
const mfaPaused = (until: Date) =>
  new AppError(
    HttpStatus.TOO_MANY_REQUESTS,
    'MFA_PAUSED',
    `Por seguridad, pausamos los códigos de verificación por varios intentos fallidos. Intenta de nuevo después de las ${bogotaTime(until)} (hora de Colombia).`,
  );
/**
 * Otra verificación del mismo usuario está en curso (doble clic, dos pestañas). No es un código
 * malo: la web lo muestra como "intenta de nuevo" y no cuenta como fallo.
 */
const authInProgress = () =>
  Errors.conflict('AUTH_IN_PROGRESS', 'Hay otra verificación en curso. Intenta de nuevo en un momento.');

const BOGOTA_TIME = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', hour: '2-digit', minute: '2-digit' });
function bogotaTime(d: Date): string {
  return BOGOTA_TIME.format(d);
}

@Injectable()
export class AuthService {
  private readonly log = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
    private readonly lockout: LockoutService,
    private readonly mfa: MfaService,
  ) {}

  // ------------------------------------------------------------------ login

  async login(body: LoginBody, req: Request, res: Response): Promise<LoginResultDto> {
    const started = Date.now();
    try {
      return await this.attemptLogin(body, req, res);
    } catch (err) {
      // Todo rechazo sale con el mismo piso de tiempo: así no se nota si hubo escritura en la
      // BD (usuario real) o solo el hash ficticio (usuario inexistente o bloqueado).
      if (err instanceof AppError && err.code === 'INVALID_CREDENTIALS') {
        await sleep(LOGIN_FAILURE_FLOOR_MS - (Date.now() - started));
      }
      throw err;
    }
  }

  private async attemptLogin(body: LoginBody, req: Request, res: Response): Promise<LoginResultDto> {
    const username = normalizeUsername(body.username);
    const password = body.password;
    const meta = this.meta(req);
    const wellFormed = USERNAME_RE.test(username) && !passwordTooLong(password);
    const user = wellFormed ? await this.prisma.user.findUnique({ where: { username }, select: LOGIN_SELECT }) : null;

    // Todos los caminos de rechazo gastan un hash: mismo cuerpo y tiempo parecido.
    if (!user) {
      await this.hasher.dummyVerify(password);
      throw invalidCredentials();
    }
    const knownDevice = this.isKnownDevice(req, user);
    if (this.lockout.isBlocked(user, meta.ipHash, { knownDevice })) {
      await this.hasher.dummyVerify(password);
      throw invalidCredentials();
    }
    // Un intento en curso para este usuario: los paralelos no verifican ni cuentan (M1).
    const key = lockKey('login', user.id);
    if (!this.lockout.tryAcquire(key)) {
      await this.hasher.dummyVerify(password);
      throw invalidCredentials();
    }
    try {
      if (!(await this.hasher.verify(user.passwordHash, password))) {
        // Si la BD falla al contar, igual sale el 401 genérico (un 404/500 aquí diría "existe").
        const { userLockedUntil } = await this.lockout.recordFailure(user, meta.ipHash).catch((err: unknown) => {
          this.log.warn(`no se pudo contar el intento fallido: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`);
          return { userLockedUntil: null };
        });
        if (userLockedUntil) await this.onUserLocked(user, userLockedUntil, meta).catch(() => undefined);
        throw invalidCredentials();
      }

      // Desde aquí la contraseña es correcta.
      if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt.getTime() <= Date.now()) {
        throw invalidCredentials();
      }
      // L4: el estado de la cuenta solo se revela a quien sabe la contraseña.
      if (user.status !== 'ACTIVE') {
        throw Errors.forbidden('ACCOUNT_SUSPENDED', 'Tu cuenta está suspendida. Si crees que es un error, escríbenos.');
      }
      this.lockout.clearPair(user.id, meta.ipHash);
      await this.rehashIfNeeded(user, password);

      if (user.role === 'ADMIN') {
        if (!user.mfaEnabledAt || !user.mfaSecretEnc) {
          throw Errors.forbidden(
            'MFA_SETUP_REQUIRED',
            'La cuenta de administración necesita la verificación en dos pasos. Configúrala con la CLI en el servidor.',
          );
        }
        // Tras varios códigos malos seguidos no se entregan más mfaToken (salvo al navegador
        // conocido): con la contraseña filtrada, cada login ya no regala 3 intentos nuevos.
        const paused = this.lockout.mfaPausedUntil(user, { knownDevice });
        if (paused) throw mfaPaused(paused);
        const { token } = this.tokens.signMfa({ sub: user.id, tv: user.tokenVersion });
        // Contraseña correcta: queda constancia aunque el segundo paso nunca llegue.
        await this.audit.record({
          actorId: user.id,
          actorUsername: user.username,
          action: 'auth.mfa_challenge',
          targetType: 'User',
          targetId: user.id,
          ipHash: meta.ipHash,
        });
        return { mfaRequired: true, mfaToken: token };
      }
      return await this.completeLogin(user, req, res, 'password');
    } finally {
      this.lockout.release(key);
    }
  }

  async verifyMfa(body: MfaVerifyBody, req: Request, res: Response): Promise<SessionDto> {
    const claims = this.tokens.verifyMfa(body.mfaToken);
    if (!claims || this.mfa.isBurned(claims.jti)) throw mfaExpired();
    // Candado propio del 2FA: un login anónimo con el mismo usuario no lo bloquea (ver lockKey).
    const key = lockKey('mfa', claims.sub);
    if (!this.lockout.tryAcquire(key)) throw authInProgress();
    try {
      const user = await this.prisma.user.findUnique({ where: { id: claims.sub }, select: LOGIN_SELECT });
      if (
        !user ||
        user.role !== 'ADMIN' ||
        user.status !== 'ACTIVE' ||
        user.tokenVersion !== claims.tv ||
        !user.mfaEnabledAt ||
        !user.mfaSecretEnc
      ) {
        this.mfa.burn(claims.jti);
        throw mfaExpired();
      }
      const ipHash = this.ctx.ipHash(req);
      // Un mfaToken emitido antes de la pausa tampoco sirve durante ella.
      const paused = this.lockout.mfaPausedUntil(user, { knownDevice: this.isKnownDevice(req, user) });
      if (paused) {
        this.mfa.burn(claims.jti);
        throw mfaPaused(paused);
      }

      const code = body.code.replace(/\s+/g, '');
      let method: 'totp' | 'recovery';
      let remaining: string[] | null = null;
      let ok: boolean;
      if (/^\d{6}$/.test(code)) {
        method = 'totp';
        ok = this.mfa.verifyTotp(user.id, user.mfaSecretEnc, code);
      } else {
        method = 'recovery';
        remaining = this.mfa.consumeRecovery(user.mfaRecoveryCodes, code);
        ok = remaining !== null;
      }
      if (!ok) {
        await this.onMfaFailure(user, method, ipHash);
        if (this.mfa.failAttempt(claims.jti)) throw mfaExpired('Demasiados códigos incorrectos. Vuelve a ingresar tu contraseña.');
        throw mfaInvalid();
      }

      this.mfa.burn(claims.jti);
      if (remaining) {
        await this.prisma.user.update({ where: { id: user.id }, data: { mfaRecoveryCodes: remaining } });
        await this.audit.record({
          actorId: user.id,
          actorUsername: user.username,
          action: 'auth.mfa_recovery_used',
          targetType: 'User',
          targetId: user.id,
          metadata: { remaining: remaining.length },
          ipHash,
        });
      }
      return await this.completeLogin(user, req, res, method);
    } finally {
      this.lockout.release(key);
    }
  }

  /**
   * Contraseña correcta y código malo: la señal más fuerte de que la contraseña del admin se
   * filtró. Se cuenta por usuario (entre todos los mfaToken), se audita y se avisa por correo
   * en el primer fallo desde una red nueva y cuando empieza una pausa. Si la BD falla al
   * contar, igual sale el 401 del código (nunca un 500 que cambie la respuesta).
   */
  private async onMfaFailure(user: LoginUser, method: 'totp' | 'recovery', ipHash: string): Promise<void> {
    try {
      const { failures, lockedUntil } = await this.lockout.recordMfaFailure(user.id);
      await this.audit.record({
        actorId: null,
        actorUsername: null,
        action: 'security.mfa_failed',
        targetType: 'User',
        targetId: user.id,
        metadata: { method, failures, ...(lockedUntil ? { pausedUntil: lockedUntil.toISOString() } : {}) },
        ipHash,
      });
      // Cada pausa avisa (a lo sumo ~6 al día: la pausa crece hasta 4 h); el primer fallo solo si
      // viene de una red nueva, para que los errores de tipeo del admin no generen ruido.
      const paused = lockedUntil !== null && failures >= MFA_LOCKOUT.threshold;
      const firstFromNewNetwork = failures === 1 && (await this.isNewNetwork(user.id, ipHash, user.lastLoginIpHash));
      if (paused || firstFromNewNetwork) {
        this.mail.send(user.email ?? this.config.adminNotifyEmail, 'admin-mfa-failed', {
          at: new Date(),
          networkTag: ipHash.slice(0, 8),
          failures,
          pausedUntil: lockedUntil,
        });
      }
    } catch (err) {
      this.log.warn(`no se pudo registrar el código fallido: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`);
    }
  }

  // ------------------------------------------------------------------ sesión

  async refresh(req: Request, res: Response): Promise<SessionDto> {
    const secure = this.config.cookieSecure;
    const result = await this.sessions.rotate(readRefreshCookie(req, secure), this.meta(req));
    // En RACE no se toca la cookie: el navegador ya tiene la nueva de la otra pestaña.
    if (result.kind === 'race') throw Errors.unauthorized('REFRESH_RACE', 'La sesión se está renovando en otra pestaña. Intenta de nuevo.');
    if (result.kind === 'invalid') {
      clearRefreshCookies(res, secure);
      throw Errors.unauthorized('REFRESH_INVALID', 'Tu sesión terminó. Vuelve a iniciar sesión.');
    }
    setRefreshCookies(res, secure, result.refreshToken, result.expiresAt, result.familyExpiresAt);
    return { accessToken: result.accessToken, expiresIn: ACCESS_TTL_SECONDS, user: await this.loadMe(result.userId) };
  }

  async logout(req: Request, res: Response): Promise<void> {
    const secure = this.config.cookieSecure;
    await this.sessions.revokeByToken(readRefreshCookie(req, secure), 'LOGOUT');
    clearRefreshCookies(res, secure);
  }

  async logoutAll(user: AuthUser, req: Request, res: Response): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { tokenVersion: { increment: 1 } } });
      const revoked = await this.sessions.revokeAllForUser(user.id, 'LOGOUT', tx);
      await this.audit.record(
        {
          actorId: user.id,
          actorUsername: user.username,
          action: 'auth.logout_all',
          targetType: 'User',
          targetId: user.id,
          metadata: { sessionsRevoked: revoked },
          ipHash: this.ctx.ipHash(req),
        },
        tx,
      );
    });
    clearRefreshCookies(res, this.config.cookieSecure);
  }

  async me(user: AuthUser): Promise<MeDto> {
    return this.loadMe(user.id);
  }

  // ------------------------------------------------------------------ contraseña y step-up

  async changePassword(user: AuthUser, body: ChangePasswordBody, req: Request, res: Response): Promise<SessionDto> {
    const key = lockKey('pwchange', user.id);
    if (!this.lockout.tryAcquire(key)) throw Errors.tooMany('Ya hay un cambio en curso. Espera un momento.');
    try {
      const row = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { id: true, username: true, email: true, role: true, passwordHash: true },
      });
      if (!row) throw Errors.unauthorized();
      if (passwordTooLong(body.currentPassword) || !(await this.hasher.verify(row.passwordHash, body.currentPassword))) {
        throw Errors.unauthorized('INVALID_CREDENTIALS', 'La contraseña actual no es correcta.');
      }
      if (samePassword(body.currentPassword, body.newPassword)) {
        throw Errors.badRequest('SAME_PASSWORD', 'La contraseña nueva debe ser distinta de la actual.');
      }
      const policyError = checkNewPassword(body.newPassword, { username: row.username, role: row.role });
      if (policyError) throw weakPasswordError(policyError, row.role);

      const hash = await this.hasher.hash(body.newPassword);
      const now = new Date();
      const meta = this.meta(req);
      // Todo o nada: contraseña nueva, tokenVersion++ (mueren los access tokens), todas las
      // familias revocadas y una sesión nueva para quien hizo el cambio.
      const { session, tokenVersion } = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: row.id },
          data: {
            passwordHash: hash,
            passwordChangedAt: now,
            mustChangePassword: false,
            tempPasswordExpiresAt: null,
            tokenVersion: { increment: 1 },
            failedLoginCount: 0,
            lockedUntil: null,
          },
          select: { id: true, role: true, tokenVersion: true },
        });
        await this.sessions.revokeAllForUser(row.id, 'PASSWORD_CHANGED', tx);
        const created = await this.sessions.create(updated, meta, tx);
        await this.audit.record(
          { actorId: row.id, actorUsername: row.username, action: 'auth.password_changed', targetType: 'User', targetId: row.id, ipHash: meta.ipHash },
          tx,
        );
        return { session: created, tokenVersion: updated.tokenVersion };
      });
      this.lockout.clearPairs(row.id);
      const secure = this.config.cookieSecure;
      setRefreshCookies(res, secure, session.refreshToken, session.expiresAt, session.familyExpiresAt);
      // tokenVersion subió y con eso murieron las cookies de dispositivo conocido emitidas antes;
      // este navegador acaba de probar la contraseña nueva, así que recibe una vigente.
      const device = this.lockout.issueDeviceToken(row.id, tokenVersion);
      setKnownDeviceCookie(res, secure, device.value, device.expires);
      this.mail.send(row.email, 'password-changed', { at: now, isAdmin: row.role === 'ADMIN' });
      return this.sessionDto(session);
    } finally {
      this.lockout.release(key);
    }
  }

  async stepUp(user: AuthUser, body: StepUpBody, req: Request): Promise<StepUpDto> {
    const denied = () => Errors.forbidden('STEP_UP_INVALID', 'La contraseña o el código no son correctos.');
    if (user.role !== 'ADMIN') throw Errors.forbidden();
    const key = lockKey('stepup', user.id);
    if (!this.lockout.tryAcquire(key)) throw authInProgress();
    try {
      const row = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true, mfaSecretEnc: true, mfaEnabledAt: true },
      });
      const passwordOk = !!row && !passwordTooLong(body.password) && (await this.hasher.verify(row.passwordHash, body.password));
      // El TOTP solo se consume si la contraseña ya pasó: si no, un error de tipeo quemaría el código.
      const codeOk = passwordOk && !!row?.mfaEnabledAt && this.mfa.verifyTotp(user.id, row.mfaSecretEnc, body.code);
      if (!codeOk) {
        await this.audit.record({
          actorId: user.id,
          actorUsername: user.username,
          action: 'auth.step_up_failed',
          targetType: 'User',
          targetId: user.id,
          ipHash: this.ctx.ipHash(req),
        });
        throw denied();
      }
      await this.audit.record({
        actorId: user.id,
        actorUsername: user.username,
        action: 'auth.step_up',
        targetType: 'User',
        targetId: user.id,
        ipHash: this.ctx.ipHash(req),
      });
      return { stepUpToken: this.tokens.signStepUp({ sub: user.id, sid: user.sessionFamilyId }), expiresIn: STEP_UP_TTL_SECONDS };
    } finally {
      this.lockout.release(key);
    }
  }

  // ------------------------------------------------------------------ internos

  /** Abre la sesión tras un login completo (contraseña, y TOTP si es admin). */
  private async completeLogin(user: LoginUser, req: Request, res: Response, method: 'password' | 'totp' | 'recovery'): Promise<SessionDto> {
    const meta = this.meta(req);
    const now = new Date();
    const newNetwork = user.role === 'ADMIN' && (await this.isNewNetwork(user.id, meta.ipHash, user.lastLoginIpHash));
    const session = await this.prisma.$transaction(async (tx) => {
      const created = await this.sessions.create(user, meta, tx);
      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: now, lastLoginIpHash: meta.ipHash, failedLoginCount: 0, lockedUntil: null, mfaFailedCount: 0, mfaLockedUntil: null },
      });
      await this.audit.record(
        {
          actorId: user.id,
          actorUsername: user.username,
          action: 'auth.login',
          targetType: 'User',
          targetId: user.id,
          metadata: { method },
          ipHash: meta.ipHash,
        },
        tx,
      );
      return created;
    });
    this.lockout.clearPairs(user.id);

    const secure = this.config.cookieSecure;
    setRefreshCookies(res, secure, session.refreshToken, session.expiresAt, session.familyExpiresAt);
    const device = this.lockout.issueDeviceToken(user.id, user.tokenVersion);
    setKnownDeviceCookie(res, secure, device.value, device.expires);

    if (newNetwork && method !== 'password') {
      this.mail.send(user.email ?? this.config.adminNotifyEmail, 'admin-new-login', {
        at: now,
        networkTag: meta.ipHash.slice(0, 8),
        method,
      });
    }
    return this.sessionDto(session);
  }

  /** Red nunca vista en los ingresos auditados de este usuario. */
  private async isNewNetwork(userId: string, ipHash: string, lastLoginIpHash: string | null): Promise<boolean> {
    if (lastLoginIpHash === ipHash) return false;
    const seen = await this.prisma.auditLog.findFirst({
      where: { actorId: userId, action: 'auth.login', ipHash },
      select: { id: true },
    });
    return !seen;
  }

  private async onUserLocked(user: LoginUser, until: Date, meta: SessionMeta): Promise<void> {
    await this.audit.record({
      actorId: null,
      actorUsername: null,
      action: 'security.account_locked',
      targetType: 'User',
      targetId: user.id,
      metadata: { until: until.toISOString() },
      ipHash: meta.ipHash,
    });
    this.mail.send(user.email, 'account-locked', { until });
  }

  private async rehashIfNeeded(user: LoginUser, password: string): Promise<void> {
    if (!this.hasher.needsRehash(user.passwordHash)) return;
    try {
      const passwordHash = await this.hasher.hash(password);
      await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    } catch (err) {
      // Se reintenta en el próximo login; no vale la pena tumbar este.
      this.log.warn(`rehash pospuesto: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async sessionDto(session: IssuedSession): Promise<SessionDto> {
    return { accessToken: session.accessToken, expiresIn: ACCESS_TTL_SECONDS, user: await this.loadMe(session.userId) };
  }

  private async loadMe(userId: string): Promise<MeDto> {
    const row = await this.prisma.user.findUnique({ where: { id: userId }, select: ME_SELECT });
    if (!row) throw Errors.unauthorized();
    return toMeDto(row);
  }

  private meta(req: Request): SessionMeta & { ipHash: string } {
    return { ipHash: this.ctx.ipHash(req), userAgent: this.ctx.userAgent(req) };
  }

  /** Cookie de dispositivo conocido válida para este usuario y su tokenVersion actual. */
  private isKnownDevice(req: Request, user: Pick<LoginUser, 'id' | 'tokenVersion'>): boolean {
    return this.lockout.isKnownDevice(readKnownDeviceCookie(req, this.config.cookieSecure), user.id, user.tokenVersion);
  }
}
