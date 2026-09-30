import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import {
  LEGAL_DOCS,
  USERNAME_RE,
  isValidEmail,
  normalizeEmail,
  normalizeUsername,
  validateUsername,
  type MeDto,
  type RegistrationStatusDto,
  type SessionDto,
} from '@fersua/shared';
import { AuditService } from '../audit/audit.service';
import { randomToken } from '../common/crypto';
import { AppError, Errors } from '../common/errors';
import { RequestContext } from '../common/request-context';
import { AppConfig } from '../config/app-config.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AcceptTermsBody, ForgotPasswordBody, RegisterBody, ResetPasswordBody, VerifyEmailBody } from './account.dto';
import { ACCESS_TTL_SECONDS, JWT_AUDIENCE_ACCESS, JWT_ISSUER, SESSION_TTL } from './auth.constants';
import type { AuthUser } from './auth-user';
import { AuthService } from './auth.service';
import { LockoutService, lockKey } from './lockout/lockout.service';
import { PasswordHasher } from './password/password-hasher.service';
import { checkNewPassword, passwordErrorMessage, weakPasswordError } from './password/password-policy';
import { acceptedTermsData } from './terms';
import { clearRefreshCookies, setKnownDeviceCookie, setRefreshCookies } from './tokens/auth-cookies';
import { EmailTokenService } from './tokens/email-token.service';
import { SessionService, type IssuedSession } from './tokens/session.service';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Reenvíos del enlace de verificación por usuario y hora (cuenta también el del registro). */
export const VERIFY_EMAILS_PER_USER_PER_HOUR = 3;
/** Enlaces de restablecer por usuario resuelto (M6): 3 por hora y 10 al día. Pasado el tope, nada. */
export const RESET_EMAILS_PER_USER_PER_HOUR = 3;
export const RESET_EMAILS_PER_USER_PER_DAY = 10;

/** Siempre el mismo código para un token inválido, usado, vencido o de otro correo. */
const tokenInvalid = () => Errors.badRequest('TOKEN_INVALID', 'El enlace no es válido o ya venció. Pide uno nuevo.');
const usernameTaken = () => Errors.conflict('USERNAME_TAKEN', 'Ese nombre de usuario ya está en uso.');
const emailTaken = () => Errors.conflict('EMAIL_TAKEN', 'Ya hay una cuenta con ese correo. Si es tuya, recupera tu contraseña.');

type Consents = Pick<RegisterBody, 'acceptTerms' | 'acceptPrivacy' | 'confirmAge'>;

/**
 * Búsqueda de "Olvidé mi contraseña": correo (si trae @) o usuario, ya normalizados. null si
 * no puede ser ninguno de los dos (ni se consulta la BD).
 */
export function forgotLookup(identifier: string): { email: string } | { username: string } | null {
  const raw = identifier.trim();
  if (raw.includes('@')) return isValidEmail(raw) ? { email: normalizeEmail(raw) } : null;
  const username = normalizeUsername(raw);
  return USERNAME_RE.test(username) ? { username } : null;
}

/**
 * Autoservicio de la cuenta (M3, docs/api-m3.md): registro, verificación del correo, olvido y
 * restablecimiento de la contraseña y re-aceptación de los documentos legales.
 */
@Injectable()
export class AccountService {
  private readonly log = new Logger('Account');
  /** Trabajo de "Olvidé mi contraseña" que corre después de responder. */
  private readonly background = new Set<Promise<void>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly ctx: RequestContext,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly lockout: LockoutService,
    private readonly emailTokens: EmailTokenService,
    private readonly auth: AuthService,
  ) {}

  registration(): RegistrationStatusDto {
    return { open: this.config.registrationOpen };
  }

  // ------------------------------------------------------------------ registro

  async register(body: RegisterBody, req: Request, res: Response): Promise<SessionDto> {
    if (!this.config.registrationOpen) throw Errors.forbidden('REGISTRATION_CLOSED', 'El registro está cerrado por ahora.');

    const details: Record<string, string> = {};
    const usernameError = validateUsername(body.username);
    if (usernameError) details.username = usernameError;
    if (!isValidEmail(body.email)) details.email = 'INVALID';
    for (const key of ['acceptTerms', 'acceptPrivacy', 'confirmAge'] as const satisfies (keyof Consents)[]) {
      if ((body[key] as boolean) !== true) details[key] = 'REQUIRED';
    }
    if (Object.keys(details).length) throw Errors.validation(details);

    const username = normalizeUsername(body.username);
    const email = normalizeEmail(body.email);
    const policy = checkNewPassword(body.password, { username, role: 'USER' });
    if (policy) throw new AppError(HttpStatus.BAD_REQUEST, 'PASSWORD_WEAK', passwordErrorMessage(policy, 'USER'), { password: policy });

    // Honeypot lleno: misma respuesta de apariencia y nada guardado (ni siquiera se mira si el
    // usuario o el correo existen).
    if (body.hp_x7) return this.decoyRegistration(res, username, email, body.password);

    // Revelar que el usuario o el correo ya existen es inevitable aquí; lo acotan el límite de
    // 5 por hora por IP y el honeypot (L4).
    const taken = await this.prisma.user.findFirst({
      where: { OR: [{ username }, { email }] },
      select: { username: true },
    });
    if (taken) throw taken.username === username ? usernameTaken() : emailTaken();

    const passwordHash = await this.hasher.hash(body.password);
    const meta = { ipHash: this.ctx.ipHash(req), userAgent: this.ctx.userAgent(req) };
    const now = new Date();
    let created: { session: IssuedSession; token: string; tokenVersion: number };
    try {
      created = await this.prisma.$transaction(async (tx) => {
        // Campo por campo: nada del cuerpo llega a Prisma sin pasar por aquí. Rol siempre USER.
        const user = await tx.user.create({
          data: {
            username,
            email,
            passwordHash,
            passwordChangedAt: now,
            role: 'USER',
            ...acceptedTermsData(now),
            ageConfirmedAt: now,
          },
          select: { id: true, role: true, tokenVersion: true },
        });
        const session = await this.sessions.create(user, meta, tx);
        const token = await this.emailTokens.issue({ id: user.id, email }, 'EMAIL_VERIFY', { ipHash: meta.ipHash, now }, tx);
        await this.audit.record(
          {
            actorId: user.id,
            actorUsername: username,
            action: 'auth.register',
            targetType: 'User',
            targetId: user.id,
            metadata: { termsVersion: LEGAL_DOCS.artistTerms.version, privacyVersion: LEGAL_DOCS.privacy.version, ageConfirmed: true },
            ipHash: meta.ipHash,
          },
          tx,
        );
        return { session, token, tokenVersion: user.tokenVersion };
      });
    } catch (err) {
      // Dos registros a la vez con el mismo usuario o correo: el índice único decide.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw uniqueTarget(err) === 'email' ? emailTaken() : usernameTaken();
      }
      throw err;
    }
    this.mail.send(email, 'verify-email', { token: created.token });
    return this.auth.finishSession(res, created.session, created.tokenVersion);
  }

  /**
   * Respuesta falsa para el honeypot: mismo 201, misma forma y las mismas cookies, pero nada
   * existe detrás (el refresh y el access token no sirven). Gasta un hash para no responder
   * notablemente más rápido que un registro real.
   */
  private async decoyRegistration(res: Response, username: string, email: string, password: string): Promise<SessionDto> {
    await this.hasher.dummyVerify(password);
    this.log.warn('registro descartado por el honeypot');
    const now = Date.now();
    const ttl = SESSION_TTL.USER;
    const secure = this.config.cookieSecure;
    setRefreshCookies(res, secure, randomToken(32), new Date(now + ttl.idleMs), new Date(now + ttl.absoluteMs));
    const fakeId = `c${randomBytes(12).toString('hex')}`;
    const device = this.lockout.issueDeviceToken(fakeId, 0);
    setKnownDeviceCookie(res, secure, device.value, device.expires);
    return {
      accessToken: decoyJwt(fakeId, now),
      expiresIn: ACCESS_TTL_SECONDS,
      user: {
        id: fakeId,
        username,
        email,
        emailVerified: false,
        role: 'USER',
        mustChangePassword: false,
        mfaEnabled: false,
        profile: null,
        termsVersion: LEGAL_DOCS.artistTerms.version,
        privacyVersion: LEGAL_DOCS.privacy.version,
        termsOutdated: false,
      },
    };
  }

  // ------------------------------------------------------------------ verificación del correo

  async verifyEmail(body: VerifyEmailBody, req: Request): Promise<void> {
    const found = await this.emailTokens.find(body.token, 'EMAIL_VERIFY');
    if (!found || found.user.role !== 'USER') throw tokenInvalid();
    const { user } = found;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (!(await this.emailTokens.consume(found.id, tx, now))) throw tokenInvalid();
      // Los demás enlaces pendientes ya no hacen falta.
      await this.emailTokens.invalidate(user.id, 'EMAIL_VERIFY', tx, now);
      if (!user.emailVerifiedAt) await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: now } });
      await this.audit.record(
        {
          actorId: user.id,
          actorUsername: user.username,
          action: 'auth.email_verified',
          targetType: 'User',
          targetId: user.id,
          ipHash: this.ctx.ipHash(req),
        },
        tx,
      );
    });
  }

  async resendVerification(authUser: AuthUser, req: Request): Promise<void> {
    const key = lockKey('resend', authUser.id);
    if (!this.lockout.tryAcquire(key)) throw Errors.tooMany('Ya estamos enviando un enlace. Espera un momento.');
    try {
      const row = await this.prisma.user.findUnique({
        where: { id: authUser.id },
        select: { id: true, email: true, emailVerifiedAt: true },
      });
      if (!row) throw Errors.unauthorized();
      if (row.emailVerifiedAt) throw Errors.conflict('ALREADY_VERIFIED', 'Tu correo ya está confirmado.');
      if (!row.email) {
        throw Errors.conflict('EMAIL_MISSING', 'Tu cuenta no tiene un correo registrado. Escríbenos para agregarlo.');
      }
      const recent = await this.emailTokens.countSince(row.id, 'EMAIL_VERIFY', new Date(Date.now() - HOUR_MS));
      if (recent >= VERIFY_EMAILS_PER_USER_PER_HOUR) {
        throw Errors.tooMany('Ya te enviamos varios enlaces. Revisa tu correo (también la carpeta de spam) o intenta de nuevo en una hora.');
      }
      const token = await this.emailTokens.issue({ id: row.id, email: row.email }, 'EMAIL_VERIFY', { ipHash: this.ctx.ipHash(req) });
      this.mail.send(row.email, 'verify-email', { token });
    } finally {
      this.lockout.release(key);
    }
  }

  // ------------------------------------------------------------------ olvido y restablecimiento

  /**
   * Responde 202 de una vez, sin consultar nada: la búsqueda, el token y el correo corren
   * después, así que ni el cuerpo ni el tiempo dicen si la cuenta existe.
   */
  forgotPassword(body: ForgotPasswordBody, req: Request): void {
    const ipHash = this.ctx.ipHash(req);
    const job: Promise<void> = this.processForgot(body.identifier, ipHash)
      .catch((err: unknown) => {
        this.log.warn(`olvidé mi contraseña falló: ${err instanceof Error ? err.message.slice(0, 120) : 'error'}`);
      })
      .finally(() => this.background.delete(job));
    this.background.add(job);
  }

  private async processForgot(identifier: string, ipHash: string): Promise<void> {
    // Primero sale la respuesta; después se trabaja.
    await new Promise<void>((resolve) => setImmediate(resolve));
    const where = forgotLookup(identifier);
    if (!where) return;
    const user = await this.prisma.user.findUnique({ where, select: { id: true, email: true, role: true, status: true } });
    // Solo cuentas de DJ activas y con correo. El admin se rescata por CLI en el VPS, nunca por correo.
    if (!user || user.role !== 'USER' || user.status !== 'ACTIVE' || !user.email) return;
    const key = lockKey('forgot', user.id);
    if (!this.lockout.tryAcquire(key)) return;
    try {
      const now = Date.now();
      const [lastHour, lastDay] = await Promise.all([
        this.emailTokens.countSince(user.id, 'PASSWORD_RESET', new Date(now - HOUR_MS)),
        this.emailTokens.countSince(user.id, 'PASSWORD_RESET', new Date(now - DAY_MS)),
      ]);
      if (lastHour >= RESET_EMAILS_PER_USER_PER_HOUR || lastDay >= RESET_EMAILS_PER_USER_PER_DAY) {
        this.log.warn('restablecer: tope por usuario alcanzado, no se envía otro enlace');
        return;
      }
      const token = await this.emailTokens.issue({ id: user.id, email: user.email }, 'PASSWORD_RESET', { ipHash });
      // Siempre al correo guardado, nunca al texto que se escribió.
      this.mail.send(user.email, 'reset-password', { token });
      await this.audit.record({
        actorId: null,
        actorUsername: null,
        action: 'auth.password_reset_requested',
        targetType: 'User',
        targetId: user.id,
        ipHash,
      });
    } finally {
      this.lockout.release(key);
    }
  }

  async resetPassword(body: ResetPasswordBody, req: Request, res: Response): Promise<void> {
    const found = await this.emailTokens.find(body.token, 'PASSWORD_RESET');
    if (!found || found.user.role !== 'USER' || found.user.status !== 'ACTIVE') throw tokenInvalid();
    const { user } = found;
    // La política se revisa antes de consumir: una contraseña débil no quema el enlace.
    const policy = checkNewPassword(body.newPassword, { username: user.username, role: 'USER' });
    if (policy) throw weakPasswordError(policy, 'USER');

    const key = lockKey('reset', user.id);
    if (!this.lockout.tryAcquire(key)) {
      throw Errors.conflict('AUTH_IN_PROGRESS', 'Hay otro cambio de contraseña en curso. Intenta de nuevo en un momento.');
    }
    try {
      const passwordHash = await this.hasher.hash(body.newPassword);
      const now = new Date();
      const ipHash = this.ctx.ipHash(req);
      // Todo o nada: token consumido, contraseña nueva, tokenVersion++ (mueren los access
      // tokens y las cookies de dispositivo conocido), bloqueos en cero y sesiones revocadas.
      await this.prisma.$transaction(async (tx) => {
        if (!(await this.emailTokens.consume(found.id, tx, now))) throw tokenInvalid();
        await this.emailTokens.invalidate(user.id, 'PASSWORD_RESET', tx, now);
        const updated = await tx.user.updateMany({
          where: { id: user.id, role: 'USER', status: 'ACTIVE' },
          data: {
            passwordHash,
            passwordChangedAt: now,
            mustChangePassword: false,
            tempPasswordExpiresAt: null,
            tokenVersion: { increment: 1 },
            // Abrir el enlace prueba que el buzón es suyo.
            emailVerifiedAt: user.emailVerifiedAt ?? now,
            failedLoginCount: 0,
            lockedUntil: null,
            mfaFailedCount: 0,
            mfaLockedUntil: null,
          },
        });
        if (updated.count !== 1) throw tokenInvalid();
        const revoked = await this.sessions.revokeAllForUser(user.id, 'PASSWORD_CHANGED', tx);
        await this.audit.record(
          {
            actorId: user.id,
            actorUsername: user.username,
            action: 'auth.password_reset',
            targetType: 'User',
            targetId: user.id,
            metadata: { sessionsRevoked: revoked },
            ipHash,
          },
          tx,
        );
      });
      this.lockout.clearPairs(user.id);
      // Si este navegador tenía una sesión, ya no sirve: se borra su cookie.
      clearRefreshCookies(res, this.config.cookieSecure);
      this.mail.send(user.email, 'password-changed', { at: now, isAdmin: false });
    } finally {
      this.lockout.release(key);
    }
  }

  // ------------------------------------------------------------------ términos

  async acceptTerms(authUser: AuthUser, body: AcceptTermsBody, req: Request): Promise<MeDto> {
    const details: Record<string, string> = {};
    if ((body.acceptTerms as boolean) !== true) details.acceptTerms = 'REQUIRED';
    if ((body.acceptPrivacy as boolean) !== true) details.acceptPrivacy = 'REQUIRED';
    if (Object.keys(details).length) throw Errors.validation(details);
    if (authUser.role !== 'USER') throw Errors.forbidden();

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({ where: { id: authUser.id, role: 'USER' }, data: acceptedTermsData(now) });
      if (updated.count !== 1) throw Errors.unauthorized();
      await this.audit.record(
        {
          actorId: authUser.id,
          actorUsername: authUser.username,
          action: 'auth.terms_accepted',
          targetType: 'User',
          targetId: authUser.id,
          metadata: { termsVersion: LEGAL_DOCS.artistTerms.version, privacyVersion: LEGAL_DOCS.privacy.version },
          ipHash: this.ctx.ipHash(req),
        },
        tx,
      );
    });
    return this.auth.me(authUser);
  }

  /** Solo pruebas: espera a que termine el trabajo de "Olvidé mi contraseña" ya encolado. */
  async settledForTesting(): Promise<void> {
    while (this.background.size) await Promise.allSettled([...this.background]);
  }
}

/** Qué índice único chocó (MySQL lo informa como nombre del índice o lista de campos). */
function uniqueTarget(err: Prisma.PrismaClientKnownRequestError): 'email' | 'username' {
  const target = (err.meta as { target?: unknown } | undefined)?.target;
  const text = Array.isArray(target) ? target.join(',') : String(target ?? '');
  return text.includes('email') ? 'email' : 'username';
}

/** JWT con la forma de uno real (HS256, mismos claims) y una firma al azar: no sirve para nada. */
function decoyJwt(sub: string, nowMs: number): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const iat = Math.floor(nowMs / 1000);
  const payload = {
    sub,
    tv: 0,
    sid: randomBytes(15).toString('hex'),
    iat,
    exp: iat + ACCESS_TTL_SECONDS,
    aud: JWT_AUDIENCE_ACCESS,
    iss: JWT_ISSUER,
  };
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.${randomBytes(32).toString('base64url')}`;
}
