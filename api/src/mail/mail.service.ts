import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import addressparser from 'nodemailer/lib/addressparser';
import { isValidEmail, mailboxKey, normalizeEmail } from '@fersua/shared';
import { AuditService } from '../audit/audit.service';
import { AppConfig } from '../config/app-config.service';
import { sha256Hex } from '../common/crypto';
import {
  mailLane,
  mailPriority,
  renderMail,
  type MailContent,
  type MailLane,
  type MailPriority,
  type MailRenderParams,
  type MailTemplateName,
  type MailTemplateParams,
} from './mail-templates';

/** Esperas antes de cada reintento: 1 s, 10 s, 60 s (tres reintentos y se descarta). */
export const MAIL_RETRY_DELAYS_MS = [1_000, 10_000, 60_000] as const;
/**
 * Topes diarios en memoria (M6): el SMTP de Hostinger tiene un cupo compartido, y si se agota
 * dejan de salir los correos de seguridad. En tres niveles:
 * - Global: MAIL_DAILY_BUDGET para todo. Los cupos que dispara cualquiera con autoservicio
 *   ('verify' y 'notice') paran antes, en MAIL_DAILY_NORMAL_BUDGET: siempre queda margen para
 *   las alertas de seguridad, los enlaces de restablecer y los avisos de PQRS.
 * - Por cupo (MAIL_LANE_DAILY_CAPS): una ola de registros o de "olvidé mi contraseña" gasta su
 *   propio cupo y nada más.
 * - Por buzón y cupo (MAIL_PER_RECIPIENT_PER_DAY), contando dj+1@x y dj+2@x como el mismo buzón:
 *   nadie usa un formulario para inundarle el buzón a otro.
 */
export const MAIL_DAILY_BUDGET = 300;
export const MAIL_DAILY_NORMAL_BUDGET = 250;
const NORMAL_BUDGET_LANES: ReadonlySet<MailLane> = new Set<MailLane>(['verify', 'notice']);
/** Tope global al día de algunos cupos (además del global de arriba). */
export const MAIL_LANE_DAILY_CAPS: Readonly<Partial<Record<MailLane, number>>> = {
  verify: 80,
  reset: 100,
};
/** Por buzón, al día y por cupo. */
export const MAIL_PER_RECIPIENT_PER_DAY = 10;
/**
 * Topes propios de algunas plantillas, por buzón y al día (además de los de arriba).
 * - Avisos de booking al DJ: máximo 5; el 5.º dice que lo que siga irá en el resumen de mañana
 *   (la plantilla recibe `lastOfDay`) y del 6.º en adelante se omiten en silencio: las
 *   solicitudes siguen en el panel. Así un bot que llena el formulario de un DJ no le inunda
 *   el buzón.
 * - Enlaces de restablecer: 5, la mitad del cupo del buzón, para que quien los pida en bucle
 *   nunca llegue al tope.
 */
export const MAIL_TEMPLATE_DAILY_CAPS: Readonly<Partial<Record<MailTemplateName, number>>> = {
  'booking-new-owner': 5,
  'reset-password': 5,
};

interface Job {
  id: number;
  to: string;
  content: MailContent;
  priority: MailPriority;
  template: MailTemplateName;
  attempts: number;
}

/** Mínimo que necesitamos del transporte (en las pruebas se reemplaza). */
export interface MailTransport {
  sendMail(msg: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
    envelope?: { from: string; to: string };
  }): Promise<unknown>;
}

type Refusal = 'closed' | 'invalid' | 'template-cap' | 'lane-cap' | 'recipient-cap' | 'budget';

type Verdict =
  | { ok: false; reason: Refusal; recipient?: string }
  | { ok: true; recipient: string; lane: MailLane; recipientKey: string; capKey: string; cap: number | undefined; capUsed: number };

/**
 * El destinatario normalizado solo si es UNA dirección simple: pasa isValidEmail (addr-spec
 * estricto) y el mismo parser que usa nodemailer lee exactamente esa dirección, sin nombre.
 * Segunda barrera: "x<otro@buzon.com>" o "a,otro@buzon.com" nunca llegan al SMTP.
 */
export function singleRecipient(to: string | null | undefined): string | null {
  if (!to || !isValidEmail(to)) return null;
  const recipient = normalizeEmail(to);
  let parsed: { name: string; address: string }[];
  try {
    parsed = addressparser(recipient, { flatten: true });
  } catch {
    return null;
  }
  if (parsed.length !== 1 || parsed[0]!.name || parsed[0]!.address.toLowerCase() !== recipient) return null;
  return recipient;
}

/**
 * Correo saliente con cola en proceso. `send` nunca lanza ni espera al SMTP: una falla de
 * correo no puede tumbar un login ni revelar nada al usuario. Los fallos van al log sin el
 * destinatario (solo un hash corto para cruzar).
 */
@Injectable()
export class MailService implements OnModuleDestroy {
  private readonly log = new Logger('Mail');
  private transport: MailTransport | null = null;
  private readonly queue: Job[] = [];
  private readonly timers = new Set<NodeJS.Timeout>();
  private running = false;
  private closed = false;
  private seq = 0;
  private day = '';
  private sentToday = 0;
  private readonly perRecipient = new Map<string, number>();
  private readonly perTemplate = new Map<string, number>();
  private readonly perLane = new Map<MailLane, number>();
  /** Cupos que ya avisaron hoy que se agotaron (una sola vez por día). */
  private readonly lanesAnnounced = new Set<MailLane>();
  private envelopeFrom: string | null | undefined;

  constructor(
    private readonly config: AppConfig,
    @Optional() private readonly audit?: AuditService,
  ) {}

  /**
   * ¿Saldría hoy este correo? Sin gastar cupo. Para decidir ANTES de emitir un enlace (y anular
   * los anteriores) si el correo que lo lleva va a salir.
   */
  canSend(to: string | null | undefined, template: MailTemplateName): boolean {
    return this.check(to, template).ok;
  }

  /** Encola un correo. Devuelve false si se descartó (sin destinatario válido o sin cupo). */
  send<K extends MailTemplateName>(to: string | null | undefined, template: K, params: MailTemplateParams<K>): boolean {
    const verdict = this.check(to, template);
    if (!verdict.ok) {
      if (verdict.reason === 'template-cap') {
        this.log.debug(`aviso omitido por el tope diario de la plantilla: ${template} a ${tag(verdict.recipient ?? '')}`);
      } else if (verdict.reason !== 'closed' && verdict.reason !== 'invalid') {
        this.log.warn(`correo descartado por cupo diario (${verdict.reason}): ${template} a ${tag(verdict.recipient ?? '')}`);
      }
      return false;
    }
    let renderParams = params as unknown as MailRenderParams<K>;
    const last = verdict.cap !== undefined && verdict.capUsed + 1 === verdict.cap;
    if (last) renderParams = { ...renderParams, lastOfDay: true };
    let content: MailContent;
    try {
      content = renderMail(template, renderParams, { publicUrl: this.config.publicUrl });
    } catch (err) {
      this.log.error(`plantilla ${template} falló: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    // Se gasta el cupo solo cuando el correo de verdad se encola.
    this.sentToday++;
    this.perRecipient.set(verdict.recipientKey, (this.perRecipient.get(verdict.recipientKey) ?? 0) + 1);
    this.perLane.set(verdict.lane, (this.perLane.get(verdict.lane) ?? 0) + 1);
    if (verdict.cap !== undefined) this.perTemplate.set(verdict.capKey, verdict.capUsed + 1);
    const job: Job = { id: ++this.seq, to: verdict.recipient, content, priority: mailPriority(template), template, attempts: 0 };
    this.enqueue(job);
    return true;
  }

  /** Solo pruebas: cambia el transporte SMTP por uno falso. */
  setTransportForTesting(transport: MailTransport): void {
    this.transport = transport;
  }

  /** Solo pruebas: espera a que la cola quede vacía (sin contar reintentos programados). */
  async drainForTesting(): Promise<void> {
    while (this.running || this.queue.length) await new Promise((r) => setTimeout(r, 5));
  }

  onModuleDestroy(): void {
    this.closed = true;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.queue.length = 0;
  }

  private check(to: string | null | undefined, template: MailTemplateName): Verdict {
    if (this.closed) return { ok: false, reason: 'closed' };
    const recipient = singleRecipient(to);
    if (!recipient) return { ok: false, reason: 'invalid' };
    this.rollDay();
    const lane = mailLane(template);
    const box = mailboxKey(recipient);
    const cap = MAIL_TEMPLATE_DAILY_CAPS[template];
    const capKey = `${template}|${box}`;
    const capUsed = cap === undefined ? 0 : (this.perTemplate.get(capKey) ?? 0);
    if (cap !== undefined && capUsed >= cap) return { ok: false, reason: 'template-cap', recipient };
    const laneCap = MAIL_LANE_DAILY_CAPS[lane];
    if (laneCap !== undefined && (this.perLane.get(lane) ?? 0) >= laneCap) {
      this.announceLaneCap(lane, laneCap);
      return { ok: false, reason: 'lane-cap', recipient };
    }
    const recipientKey = `${lane}|${box}`;
    if ((this.perRecipient.get(recipientKey) ?? 0) >= MAIL_PER_RECIPIENT_PER_DAY) return { ok: false, reason: 'recipient-cap', recipient };
    const globalCap = NORMAL_BUDGET_LANES.has(lane) ? MAIL_DAILY_NORMAL_BUDGET : MAIL_DAILY_BUDGET;
    if (this.sentToday >= globalCap) return { ok: false, reason: 'budget', recipient };
    return { ok: true, recipient, lane, recipientKey, capKey, cap, capUsed };
  }

  /**
   * Un cupo con tope global se agotó: una vez al día, al log y a la auditoría (la ve el admin).
   * Si es el de verificación, casi seguro es una ola de registros falsos: el aviso lo dice.
   */
  private announceLaneCap(lane: MailLane, cap: number): void {
    if (this.lanesAnnounced.has(lane)) return;
    this.lanesAnnounced.add(lane);
    const hint = lane === 'verify' ? ' Si es una ola de registros falsos, cierra el registro con REGISTRATION_OPEN=false.' : '';
    this.log.warn(`cupo diario de correos '${lane}' agotado (${cap}).${hint}`);
    void this.audit
      ?.record({ actorId: null, actorUsername: null, action: 'system.mail.cap_reached', metadata: { lane, cap } })
      .catch(() => undefined);
  }

  private enqueue(job: Job): void {
    // Seguridad primero: se inserta antes del primer correo "normal" de la cola.
    if (job.priority === 'security') {
      const idx = this.queue.findIndex((j) => j.priority !== 'security');
      if (idx === -1) this.queue.push(job);
      else this.queue.splice(idx, 0, job);
    } else {
      this.queue.push(job);
    }
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (this.queue.length && !this.closed) {
        const job = this.queue.shift()!;
        try {
          const from = this.config.smtp.from;
          const envelopeFrom = this.getEnvelopeFrom(from);
          await this.getTransport().sendMail({
            from,
            to: job.to,
            subject: job.content.subject,
            text: job.content.text,
            html: job.content.html,
            // Sobre SMTP explícito: RCPT TO es exactamente la dirección validada, nunca lo que
            // el parser de cabeceras pudiera deducir.
            ...(envelopeFrom ? { envelope: { from: envelopeFrom, to: job.to } } : {}),
          });
        } catch (err) {
          this.retry(job, err);
        }
      }
    } finally {
      this.running = false;
    }
  }

  private retry(job: Job, err: unknown): void {
    const reason = err instanceof Error ? err.message.slice(0, 120) : 'error';
    const delay = MAIL_RETRY_DELAYS_MS[job.attempts];
    if (delay === undefined || this.closed) {
      this.log.error(`correo ${job.template} #${job.id} a ${tag(job.to)} descartado tras ${job.attempts + 1} intentos: ${reason}`);
      return;
    }
    job.attempts++;
    this.log.warn(`correo ${job.template} #${job.id} falló (intento ${job.attempts}): ${reason}`);
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      if (!this.closed) this.enqueue(job);
    }, delay);
    // Un reintento pendiente no debe mantener vivo el proceso (CLI, pruebas, apagado).
    timer.unref();
    this.timers.add(timer);
  }

  /** Dirección del remitente ("Fersua Studio <no-reply@…>" → "no-reply@…") para MAIL FROM. */
  private getEnvelopeFrom(from: string): string | null {
    if (this.envelopeFrom === undefined) {
      try {
        const parsed = addressparser(from, { flatten: true });
        this.envelopeFrom = parsed.length === 1 && isValidEmail(parsed[0]!.address) ? parsed[0]!.address : null;
      } catch {
        this.envelopeFrom = null;
      }
    }
    return this.envelopeFrom;
  }

  private getTransport(): MailTransport {
    if (!this.transport) {
      const smtp = this.config.smtp;
      const transporter: Transporter = createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      });
      this.transport = transporter as unknown as MailTransport;
    }
    return this.transport;
  }

  /** Los cupos se reinician cada día (UTC). */
  private rollDay(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.sentToday = 0;
      this.perRecipient.clear();
      this.perTemplate.clear();
      this.perLane.clear();
      this.lanesAnnounced.clear();
    }
  }
}

/** Hash corto del destinatario para los logs (nunca el correo en claro: Ley 1581). */
function tag(email: string): string {
  return sha256Hex(email).slice(0, 10);
}
