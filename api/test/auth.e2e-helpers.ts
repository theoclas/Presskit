// Utilidades de los e2e de auth y de la matriz de guards. Crean usuarios desechables en la BD
// de desarrollo/CI (nombres únicos por corrida) y los borran al final. Las contraseñas se
// generan al vuelo y nunca se escriben en archivos.
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'warn';

import { ValidationPipe } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCodes, recoveryKey } from '../src/auth/mfa/totp';
import { PasswordHasher } from '../src/auth/password/password-hasher.service';
import { refreshCookieName } from '../src/auth/tokens/auth-cookies';
import { SessionService } from '../src/auth/tokens/session.service';
import { encryptSecret } from '../src/common/crypto';
import { AppConfig } from '../src/config/app-config.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma/prisma.service';

export interface TestApp {
  app: NestExpressApplication;
  http: ReturnType<typeof request>;
  prisma: PrismaService;
  config: AppConfig;
  origin: string;
  cookieName: string;
  mail: MailService;
  sendSpy: jest.SpyInstance;
}

/** Igual que main.ts en lo que importa aquí, más trust proxy para simular IPs distintas. */
export async function createTestApp(): Promise<TestApp> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule, DiscoveryModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  app.set('query parser', 'simple');
  // Cada prueba usa su propia IP (X-Forwarded-For) para no compartir límites ni bloqueos.
  app.set('trust proxy', true);
  app.use(cookieParser());
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  // Escuchando de verdad: supertest reutiliza el puerto en vez de abrir uno por petición.
  await app.listen(0, '127.0.0.1');
  const config = app.get(AppConfig);
  const mail = app.get(MailService);
  // Nada sale por SMTP en las pruebas: se registra la llamada y listo.
  mail.setTransportForTesting({ sendMail: async () => ({}) });
  const sendSpy = jest.spyOn(mail, 'send');
  return {
    app,
    http: request(app.getHttpServer()),
    prisma: app.get(PrismaService),
    config,
    origin: config.publicUrl,
    cookieName: refreshCookieName(config.cookieSecure),
    mail,
    sendSpy,
  };
}

let ipSeq = 0;
/** IP privada única por llamada (10.x.y.z). */
export function nextIp(): string {
  ipSeq++;
  const r = randomBytes(2);
  return `10.${r[0]}.${r[1]}.${(ipSeq % 250) + 1}`;
}

const emailRun = randomBytes(3).toString('hex');
/** Correo único por corrida: otras suites pueden estar usando la misma BD al mismo tiempo. */
export function uniqueEmail(tag: string): string {
  return `${tag}.${emailRun}@example.com`;
}

export function strongPassword(): string {
  return `${randomBytes(12).toString('base64url')}-Q7z`;
}

export interface TestUser {
  id: string;
  username: string;
  password: string;
  totpSecret: string | null;
  recoveryCodes: string[];
}

export interface CreateUserOpts {
  role?: 'USER' | 'ADMIN';
  status?: 'ACTIVE' | 'SUSPENDED';
  mustChangePassword?: boolean;
  tempPasswordExpiresAt?: Date | null;
  mfa?: boolean;
  email?: string | null;
}

/** Fábrica de usuarios desechables; `cleanup()` borra usuarios, sesiones y su auditoría. */
export class TestUsers {
  private readonly ids: string[] = [];
  private seq = 0;
  private readonly run = randomBytes(3).toString('hex');
  private readonly hasher = new PasswordHasher();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  async create(opts: CreateUserOpts = {}): Promise<TestUser> {
    const username = `t${this.run}u${++this.seq}`;
    const password = strongPassword();
    let totpSecret: string | null = null;
    let recoveryCodes: string[] = [];
    let mfaData = {};
    if (opts.mfa) {
      totpSecret = generateTotpSecret();
      recoveryCodes = generateRecoveryCodes();
      mfaData = {
        mfaSecretEnc: encryptSecret(this.config.mfaEncKey, totpSecret),
        mfaEnabledAt: new Date(),
        mfaRecoveryCodes: hashRecoveryCodes(recoveryKey(this.config.mfaEncKey), recoveryCodes),
      };
    }
    const user = await this.prisma.user.create({
      data: {
        username,
        email: opts.email ?? null,
        passwordHash: await this.hasher.hash(password),
        role: opts.role ?? 'USER',
        // adminSlot queda NULL: la BD de desarrollo puede tener ya al admin real.
        status: opts.status ?? 'ACTIVE',
        mustChangePassword: opts.mustChangePassword ?? false,
        tempPasswordExpiresAt: opts.tempPasswordExpiresAt ?? null,
        ...mfaData,
      },
      select: { id: true },
    });
    this.ids.push(user.id);
    return { id: user.id, username, password, totpSecret, recoveryCodes };
  }

  /** Sesión sin pasar por el login (para la matriz de guards). */
  async session(app: NestExpressApplication, user: TestUser, role: 'USER' | 'ADMIN'): Promise<string> {
    const row = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { tokenVersion: true } });
    const s = await app.get(SessionService).create({ id: user.id, role, tokenVersion: row.tokenVersion }, { ipHash: null, userAgent: null });
    return s.accessToken;
  }

  async cleanup(): Promise<void> {
    if (!this.ids.length) return;
    await this.prisma.auditLog.deleteMany({ where: { OR: [{ actorId: { in: this.ids } }, { targetId: { in: this.ids } }] } });
    await this.prisma.user.deleteMany({ where: { id: { in: this.ids } } });
  }
}

/** Valor de una cookie en la respuesta ('' si la borró; null si no vino). */
export function cookieFrom(res: { headers: Record<string, unknown> }, name: string): string | null {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : typeof raw === 'string' ? [raw] : [];
  const hit = list.find((c) => c.startsWith(`${name}=`));
  if (!hit) return null;
  return decodeURIComponent(hit.slice(name.length + 1).split(';')[0] ?? '');
}

export function setCookieHeader(res: { headers: Record<string, unknown> }, name: string): string | null {
  const raw = res.headers['set-cookie'];
  const list = Array.isArray(raw) ? (raw as string[]) : [];
  return list.find((c) => c.startsWith(`${name}=`)) ?? null;
}
