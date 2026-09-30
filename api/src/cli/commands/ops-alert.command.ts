import { cleanText, sliceText } from '@fersua/shared';
import { createTransport } from 'nodemailer';
import { AuditService } from '../../audit/audit.service';
import { AppConfig } from '../../config/app-config.service';
import type { OpsAlertMailParams } from '../../mail/mail-templates';
import { MailService, type MailTransport } from '../../mail/mail.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CliUsageError, type ParsedArgs } from '../args';
import type { CliCommand } from '../command';

/** Condición que dura (disco, respaldo...): el watchdog repite cada 24 h y avisa al resolverse. */
const REPEAT_NOTE =
  'Mientras siga pasando, te llega como mucho un aviso de este tipo al día, y otro cuando se resuelva.';
/** Hecho puntual (un reinicio): no hay aviso de resuelto. */
const EVENT_NOTE = 'Si vuelve a pasar, te avisamos otra vez (como mucho una vez al día).';

/**
 * Tipos de alerta de scripts/watchdog.sh (docs/08-monitoreo.md). Lista cerrada: el título y el
 * consejo del correo salen de aquí, nunca de la línea de comandos. Sin nombres de archivo ni
 * comandos: "status.sh" parece un dominio y el cliente de correo lo enlaza.
 */
export const OPS_ALERT_KINDS = {
  'disk-low': {
    title: 'Poco espacio en el disco del VPS',
    hint: 'Libera espacio: imágenes y caché de compilación viejas de Docker y respaldos locales antiguos. Si el disco se llena, MySQL deja de escribir y el sitio falla. Pasos en la guía de monitoreo, «Poco disco».',
    note: REPEAT_NOTE,
  },
  'backup-stale': {
    title: 'El respaldo nocturno está atrasado',
    hint: 'Revisa el log del respaldo en el VPS y córrelo a mano. Sin respaldo reciente, un daño en la base de datos se pierde. Pasos en la guía de monitoreo, «Respaldo atrasado».',
    note: REPEAT_NOTE,
  },
  'container-down': {
    title: 'Un contenedor del sitio no está sano',
    hint: 'Revisa el estado y los logs del contenedor en el VPS. Si el sitio está caído, la vuelta a la versión anterior suele resolverlo. Pasos en la guía de monitoreo, «Contenedor no sano».',
    note: REPEAT_NOTE,
  },
  'container-restart': {
    title: 'Un contenedor se reinició solo',
    hint: 'Docker lo levantó de nuevo tras una caída (falta de memoria o un error). Revisa sus logs y la memoria del VPS. Pasos en la guía de monitoreo, «Reinicios».',
    note: EVENT_NOTE,
  },
  'tls-expiring': {
    title: 'El certificado HTTPS está por vencer',
    hint: 'certbot debería renovarlo solo. Revisa el temporizador de certbot en el VPS y renueva a mano si hace falta. Pasos en la guía de monitoreo, «Certificado».',
    note: REPEAT_NOTE,
  },
  'offsite-stale': {
    title: 'La copia externa de los respaldos está atrasada',
    hint: 'Revisa el log de la copia externa en el VPS y córrela a mano. Sin ella, si el disco del VPS se daña, los respaldos se pierden con él. Pasos en la guía de monitoreo, «Copia externa».',
    note: REPEAT_NOTE,
  },
  test: {
    title: 'Prueba de alertas',
    hint: 'Es una prueba: si te llegó, los avisos del vigilante del VPS funcionan. No hay nada que hacer.',
    note: '',
  },
} as const satisfies Record<string, { title: string; hint: string; note: string }>;

export type OpsAlertKind = keyof typeof OPS_ALERT_KINDS;

/** Máximo del detalle que acepta la CLI (la plantilla corta en 300: queda margen). */
export const OPS_ALERT_CLI_DETAIL_MAX = 200;
/**
 * Tope de avisos ENTREGADOS en 24 h, contando todos los procesos: la auditoría es el contador.
 * Los topes de MailService viven en memoria y cada corrida de la CLI es un proceso nuevo; este
 * no. Así un watchdog que falle en bucle no agota el cupo del SMTP de Hostinger. Los intentos
 * fallidos no cuentan: tras una caída del SMTP, los avisos de verdad deben poder salir (el
 * watchdog espacia los reintentos de cada tipo a uno por hora).
 */
export const OPS_ALERT_DAILY_MAX = 20;
/** Intentos de envío (el primero y dos reintentos de MailService, a 1 s y 10 s) y plazo total. */
export const OPS_ALERT_MAX_ATTEMPTS = 3;
export const OPS_ALERT_TIMEOUT_MS = 90_000;
export const OPS_ALERT_AUDIT_ACTION = 'system.ops_alert';

export interface OpsAlertInput {
  kind: OpsAlertKind;
  detail: string;
  resolved: boolean;
}

/**
 * Detalle apto para el correo: una línea, solo letras, dígitos, espacios y `.,:;()%/_+=-`, sin
 * "://" (ninguna URL armada) y como mucho 200 caracteres. Sin arrobas, comillas ni marcado.
 */
export function sanitizeOpsDetail(raw: string): string {
  const clean = cleanText(raw.slice(0, 2000))
    .replace(/[^\p{L}\p{M}\p{N} .,:;()%/_+=-]/gu, ' ')
    .replace(/:\/+/g, ': ')
    .replace(/\s+/g, ' ')
    .trim();
  return sliceText(clean, OPS_ALERT_CLI_DETAIL_MAX).trim();
}

export function isOpsAlertKind(kind: string): kind is OpsAlertKind {
  return Object.prototype.hasOwnProperty.call(OPS_ALERT_KINDS, kind);
}

/** Valida los argumentos de ops:alert. Lanza CliUsageError con un mensaje claro. */
export function parseOpsAlertArgs(args: ParsedArgs): OpsAlertInput {
  if (args.positionals.length) throw new CliUsageError(`Sobra el argumento: ${args.positionals[0]!.slice(0, 40)}`);
  const kind = args.flags.kind;
  if (typeof kind !== 'string') throw new CliUsageError('Falta --kind');
  if (!isOpsAlertKind(kind)) {
    throw new CliUsageError(`--kind no válido. Opciones: ${Object.keys(OPS_ALERT_KINDS).join(', ')}`);
  }
  const rawDetail = args.flags.detail;
  if (rawDetail !== undefined && typeof rawDetail !== 'string') throw new CliUsageError('--detail necesita un texto');
  return { kind, detail: rawDetail === undefined ? '' : sanitizeOpsDetail(rawDetail), resolved: args.flags.resolved === true };
}

/**
 * Envuelve el transporte SMTP para saber si el correo salió. MailService.send solo encola y
 * reintenta con timers que no mantienen vivo el proceso: sin esto la CLI terminaría antes del
 * envío y el watchdog creería que avisó.
 */
export class ObservedTransport implements MailTransport {
  delivered = false;
  failures = 0;

  constructor(private readonly inner: MailTransport) {}

  async sendMail(msg: Parameters<MailTransport['sendMail']>[0]): Promise<unknown> {
    try {
      const result = await this.inner.sendMail(msg);
      this.delivered = true;
      return result;
    } catch (err) {
      // El motivo ya lo registra MailService; aquí solo se cuenta.
      this.failures++;
      throw err;
    }
  }

  /**
   * Espera a que salga, a que fallen `maxAttempts` intentos o a que pase el plazo. Este bucle
   * mantiene vivo el proceso para que corran los reintentos de MailService.
   */
  async waitForDelivery(maxAttempts: number, timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (!this.delivered && this.failures < maxAttempts && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 100));
    }
    return this.delivered;
  }
}

/** El transporte SMTP real, con los mismos parámetros que usa MailService. */
export function smtpTransport(config: AppConfig): MailTransport & { close?: () => void } {
  const smtp = config.smtp;
  return createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  }) as unknown as MailTransport & { close?: () => void };
}

export interface OpsAlertDeps {
  prisma: Pick<PrismaService, 'user' | 'auditLog'>;
  audit: Pick<AuditService, 'record'>;
  config: AppConfig;
  /** Transporte SMTP (en las pruebas, uno falso). */
  transport: MailTransport;
  timeoutMs?: number;
}

/**
 * Manda el aviso y deja constancia en la auditoría. Devuelve si el correo salió; lanza si no
 * hay a quién mandarlo o si ya se llegó al tope del día (en ese caso no se envía ni se audita).
 */
export async function sendOpsAlert(deps: OpsAlertDeps, input: OpsAlertInput, now = new Date()): Promise<boolean> {
  const to =
    deps.config.adminNotifyEmail ??
    (await deps.prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { email: true }, orderBy: { createdAt: 'asc' } }))?.email;
  if (!to) throw new Error('No hay a quién avisar: define ADMIN_NOTIFY_EMAIL en .env o registra el correo del admin.');

  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const recent = await deps.prisma.auditLog.count({
    where: { action: OPS_ALERT_AUDIT_ACTION, createdAt: { gte: since }, metadata: { path: '$.delivered', equals: true } },
  });
  if (recent >= OPS_ALERT_DAILY_MAX) {
    throw new Error(`Ya salieron ${recent} avisos en 24 h (tope ${OPS_ALERT_DAILY_MAX}): este no se envía.`);
  }

  const kind = OPS_ALERT_KINDS[input.kind];
  const params: OpsAlertMailParams = {
    title: kind.title,
    detail: input.detail,
    hint: kind.note ? `${kind.hint} ${kind.note}` : kind.hint,
    resolved: input.resolved,
    test: input.kind === 'test',
    at: now,
  };
  const observed = new ObservedTransport(deps.transport);
  // MailService sin Nest (el contexto de la CLI no carga MailModule): mismos cupos, plantilla y
  // validación del destinatario que en el api.
  const mail = new MailService(deps.config, deps.audit as AuditService);
  // Es el único punto para poner el transporte (el nombre dice pruebas): aquí va el SMTP real,
  // solo envuelto para observar el resultado.
  mail.setTransportForTesting(observed);
  let delivered = false;
  try {
    const queued = mail.send(to, 'ops-alert', params);
    if (queued) delivered = await observed.waitForDelivery(OPS_ALERT_MAX_ATTEMPTS, deps.timeoutMs ?? OPS_ALERT_TIMEOUT_MS);
  } finally {
    mail.onModuleDestroy();
  }

  try {
    await deps.audit.record({
      actorId: null,
      actorUsername: null,
      action: OPS_ALERT_AUDIT_ACTION,
      metadata: { kind: input.kind, resolved: input.resolved, delivered, detail: input.detail },
    });
  } catch {
    // La auditoría no decide el resultado: lo importante es si el aviso salió.
    console.error('Aviso: no se pudo registrar en la auditoría.');
  }
  return delivered;
}

/**
 * Aviso de operación al admin. Lo llama scripts/watchdog.sh dentro del contenedor del api:
 *   docker compose exec -T api node dist/cli/main.js ops:alert --kind disk-low --detail "Quedan 3 GB"
 * Sale con error si el correo no salió: así el watchdog lo reintenta en la corrida siguiente.
 */
export const opsAlertCommand: CliCommand = {
  name: 'ops:alert',
  summary: 'Aviso de operación al admin por correo (lo usa scripts/watchdog.sh)',
  usage: 'ops:alert --kind <tipo> [--detail "texto"] [--resolved]',
  flags: { kind: 'string', detail: 'string', resolved: 'boolean' },
  async run(app, args) {
    const input = parseOpsAlertArgs(args);
    const config = app.get(AppConfig);
    const transport = smtpTransport(config);
    try {
      const delivered = await sendOpsAlert({ prisma: app.get(PrismaService), audit: app.get(AuditService), config, transport }, input);
      if (!delivered) throw new Error('El correo no salió (SMTP o destinatario no válido). Se reintenta en la próxima corrida.');
      console.log(`Aviso ${input.resolved ? 'de resuelto ' : ''}enviado (${input.kind}).`);
    } finally {
      transport.close?.();
    }
  },
};
