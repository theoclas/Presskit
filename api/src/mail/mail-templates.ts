// Plantillas de correo. Reglas (M6 de la crítica de seguridad):
// - Nunca texto libre del público ni URLs que no armemos nosotros con PUBLIC_URL.
// - Sin nombres de usuario: "evil.com" es un usuario válido y los clientes de correo lo
//   convierten en enlace.
// - Texto plano + HTML mínimo con todo escapado.
// M3 agrega aquí sus plantillas (verificación, restablecer, avisos del perfil…).

import { formatLongDate } from '@fersua/shared';

export interface MailContext {
  /** Origen público sin barra final (AppConfig.publicUrl). */
  publicUrl: string;
}

export interface MailContent {
  subject: string;
  text: string;
  html: string;
}

/** Los de seguridad salen primero cuando hay cola. */
export type MailPriority = 'security' | 'normal';

interface TemplateDef<P> {
  priority: MailPriority;
  render(params: P, ctx: MailContext): MailContent;
}

const BOGOTA_DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  timeZone: 'America/Bogota',
  dateStyle: 'long',
  timeStyle: 'short',
});

export function formatBogota(d: Date): string {
  return `${BOGOTA_DATE_TIME.format(d)} (hora de Colombia)`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

type Block = string | { link: string; label: string };

/** Arma texto y HTML a partir de los mismos bloques, para que digan exactamente lo mismo. */
function compose(subject: string, blocks: Block[]): MailContent {
  const text = [...blocks.map((b) => (typeof b === 'string' ? b : `${b.label}: ${b.link}`)), '— Fersua Studio'].join('\n\n');
  const body = blocks
    .map((b) =>
      typeof b === 'string'
        ? `<p style="margin:0 0 16px">${escapeHtml(b)}</p>`
        : `<p style="margin:0 0 16px"><a href="${escapeHtml(b.link)}" style="color:#ea580c">${escapeHtml(b.label)}</a></p>`,
    )
    .join('');
  const html =
    '<!doctype html><html lang="es"><body style="margin:0;padding:24px;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;font-size:15px;line-height:1.5">' +
    `<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px">${body}` +
    '<p style="margin:24px 0 0;color:#64748b;font-size:13px">— Fersua Studio</p></div></body></html>';
  return { subject, text, html };
}

function def<P>(priority: MailPriority, render: (params: P, ctx: MailContext) => MailContent): TemplateDef<P> {
  return { priority, render };
}

export const MAIL_TEMPLATES = {
  /** Al admin: ingreso desde una red que no había usado antes. */
  'admin-new-login': def<{ at: Date; networkTag: string; method: 'totp' | 'recovery' }>('security', (p) =>
    compose('Nuevo ingreso a la administración de Fersua Studio', [
      `Alguien entró a la cuenta de administración el ${formatBogota(p.at)} desde una red que no se había usado antes (identificador de red: ${p.networkTag}).`,
      p.method === 'recovery'
        ? 'Para el segundo paso se usó un código de recuperación, no la app de autenticación.'
        : 'El segundo paso se hizo con la app de autenticación.',
      'Si fuiste tú, no tienes que hacer nada. Si no fuiste tú, entra al VPS y ejecuta admin:reset-password y admin:reset-mfa: así se cierran todas las sesiones.',
    ]),
  ),

  /**
   * Al admin: contraseña correcta y código de 2FA incorrecto. Es la señal más clara de que la
   * contraseña se filtró, así que avisa antes de que la cuenta se pierda, no después.
   */
  'admin-mfa-failed': def<{ at: Date; networkTag: string; failures: number; pausedUntil: Date | null }>('security', (p) =>
    compose('Código de verificación incorrecto en la administración de Fersua Studio', [
      `El ${formatBogota(p.at)} alguien escribió la contraseña correcta de la cuenta de administración, pero el código de verificación no fue correcto (identificador de red: ${p.networkTag}). Van ${p.failures} ${p.failures === 1 ? 'código incorrecto' : 'códigos incorrectos seguidos'}.`,
      p.pausedUntil
        ? `Por seguridad pausamos los códigos hasta el ${formatBogota(p.pausedUntil)}, salvo desde el navegador donde ya habías entrado.`
        : 'Si hay más intentos fallidos, pausaremos los códigos por un rato.',
      'Si fuiste tú, no tienes que hacer nada. Si no fuiste tú, tu contraseña está expuesta: entra al VPS y ejecuta admin:reset-password (cierra todas las sesiones).',
    ]),
  ),

  /** Al admin: llegó una PQRS o un reporte (plazo legal). Sin texto del público: solo tipo, radicado y vencimiento. */
  'admin-new-ticket': def<{ typeLabel: string; ticketId: string; dueDate: string; businessDays: number }>('normal', (p, ctx) =>
    compose(`Nueva solicitud: ${p.typeLabel}`, [
      `Llegó una solicitud de tipo «${p.typeLabel}» (radicado ${p.ticketId}).`,
      `Hay que responderla en ${p.businessDays} días hábiles: vence el ${formatLongDate(p.dueDate)}.`,
      { link: `${ctx.publicUrl}/admin/pqrs`, label: 'Abrir PQRS y reportes' },
    ]),
  ),

  /** Al usuario: su contraseña cambió. */
  'password-changed': def<{ at: Date; isAdmin: boolean }>('security', (p, ctx) =>
    compose('Tu contraseña de Fersua Studio cambió', [
      `La contraseña de tu cuenta se cambió el ${formatBogota(p.at)}. Cerramos las demás sesiones abiertas.`,
      p.isAdmin
        ? 'Si no fuiste tú, entra al VPS y ejecuta admin:reset-password y admin:reset-mfa.'
        : 'Si no fuiste tú, restablece tu contraseña ya y escríbenos respondiendo este correo.',
      ...(p.isAdmin ? [] : [{ link: `${ctx.publicUrl}/recuperar`, label: 'Restablecer mi contraseña' }]),
    ]),
  ),

  /** Al correo ANTERIOR de un usuario: el admin lo cambió. No incluye el correo nuevo. */
  'email-changed': def<{ at: Date }>('security', (p) =>
    compose('El correo de tu cuenta de Fersua Studio cambió', [
      `El equipo de Fersua Studio cambió el correo de tu cuenta el ${formatBogota(p.at)}. Desde ahora los avisos y la recuperación de la contraseña llegan al correo nuevo.`,
      'Si no lo pediste, respóndenos este correo.',
    ]),
  ),

  /** Al usuario: el admin le generó una contraseña temporal. La contraseña NUNCA va en el correo. */
  'temp-password-issued': def<{ expiresAt: Date }>('security', (p, ctx) =>
    compose('Tienes una contraseña temporal en Fersua Studio', [
      'El equipo de Fersua Studio generó una contraseña temporal para tu cuenta. Te la entregaremos por un canal directo; nunca la enviamos por correo.',
      `Vence el ${formatBogota(p.expiresAt)}. Al entrar tendrás que elegir una contraseña nueva.`,
      { link: `${ctx.publicUrl}/login`, label: 'Ir a iniciar sesión' },
      'Si no pediste esto, respóndenos este correo.',
    ]),
  ),

  /** Al usuario: su cuenta quedó bloqueada un rato por muchos intentos fallidos. */
  'account-locked': def<{ until: Date }>('security', (p, ctx) =>
    compose('Bloqueamos temporalmente el ingreso a tu cuenta', [
      'Hubo muchos intentos fallidos de iniciar sesión en tu cuenta de Fersua Studio, así que pausamos el ingreso por seguridad.',
      `Podrás volver a intentarlo después del ${formatBogota(p.until)}. Desde el navegador donde ya habías entrado puedes seguir ingresando.`,
      'Si no fuiste tú, alguien está intentando adivinar tu contraseña: te recomendamos cambiarla por una larga y única.',
      { link: `${ctx.publicUrl}/recuperar`, label: 'Restablecer mi contraseña' },
    ]),
  ),
} as const;

export type MailTemplateName = keyof typeof MAIL_TEMPLATES;
export type MailTemplateParams<K extends MailTemplateName> = Parameters<(typeof MAIL_TEMPLATES)[K]['render']>[0];

export function renderMail<K extends MailTemplateName>(name: K, params: MailTemplateParams<K>, ctx: MailContext): MailContent {
  const tpl = MAIL_TEMPLATES[name] as unknown as TemplateDef<MailTemplateParams<K>>;
  return tpl.render(params, ctx);
}

export function mailPriority(name: MailTemplateName): MailPriority {
  return MAIL_TEMPLATES[name].priority;
}
