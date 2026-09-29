import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { isValidEmail, normalizeEmail } from '@fersua/shared';
import { AppConfig } from '../config/app-config.service';
import { sha256Hex } from '../common/crypto';
import { mailPriority, renderMail, type MailContent, type MailPriority, type MailTemplateName, type MailTemplateParams } from './mail-templates';

/** Esperas antes de cada reintento: 1 s, 10 s, 60 s (tres reintentos y se descarta). */
export const MAIL_RETRY_DELAYS_MS = [1_000, 10_000, 60_000] as const;
/**
 * Topes diarios en memoria (M6): el SMTP de Hostinger tiene un cupo compartido, y si se agota
 * dejan de salir los correos de seguridad. Por destinatario, para que nadie use el formulario
 * de otro para inundarle el buzón. Cupos separados por prioridad: una ola de avisos normales
 * (p. ej. PQRS al admin) no puede gastar el cupo de las alertas de seguridad del mismo buzón,
 * y los normales paran antes del tope global para dejar margen a los de seguridad.
 */
export const MAIL_DAILY_BUDGET = 300;
export const MAIL_DAILY_NORMAL_BUDGET = 250;
/** Por destinatario, al día y por prioridad. */
export const MAIL_PER_RECIPIENT_PER_DAY = 10;

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
  sendMail(msg: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown>;
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

  constructor(private readonly config: AppConfig) {}

  /** Encola un correo. Devuelve false si se descartó (sin destinatario válido o sin cupo). */
  send<K extends MailTemplateName>(to: string | null | undefined, template: K, params: MailTemplateParams<K>): boolean {
    if (this.closed || !to || !isValidEmail(to)) return false;
    const recipient = normalizeEmail(to);
    if (!this.takeBudget(recipient, mailPriority(template))) {
      this.log.warn(`correo descartado por cupo diario: ${template} a ${tag(recipient)}`);
      return false;
    }
    let content: MailContent;
    try {
      content = renderMail(template, params, { publicUrl: this.config.publicUrl });
    } catch (err) {
      this.log.error(`plantilla ${template} falló: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
    const job: Job = { id: ++this.seq, to: recipient, content, priority: mailPriority(template), template, attempts: 0 };
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
          await this.getTransport().sendMail({
            from: this.config.smtp.from,
            to: job.to,
            subject: job.content.subject,
            text: job.content.text,
            html: job.content.html,
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

  private takeBudget(recipient: string, priority: MailPriority): boolean {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.day) {
      this.day = today;
      this.sentToday = 0;
      this.perRecipient.clear();
    }
    const key = `${priority}|${recipient}`;
    const mine = this.perRecipient.get(key) ?? 0;
    const globalCap = priority === 'security' ? MAIL_DAILY_BUDGET : MAIL_DAILY_NORMAL_BUDGET;
    if (this.sentToday >= globalCap || mine >= MAIL_PER_RECIPIENT_PER_DAY) return false;
    this.sentToday++;
    this.perRecipient.set(key, mine + 1);
    return true;
  }
}

/** Hash corto del destinatario para los logs (nunca el correo en claro: Ley 1581). */
function tag(email: string): string {
  return sha256Hex(email).slice(0, 10);
}
