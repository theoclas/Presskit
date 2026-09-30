// Plantillas de correo. Reglas (M6 de la crítica de seguridad):
// - Nunca texto libre del público ni URLs que no armemos nosotros con PUBLIC_URL. La única
//   excepción: el motivo que escribe el admin al rechazar o suspender (escapado). El nombre
//   artístico que va al admin pasa por sanitizeMailName (sin puntos, arrobas, barras ni dos
//   puntos: no se puede volver un enlace).
// - Sin nombres de usuario: "evil.com" es un usuario válido y los clientes de correo lo
//   convierten en enlace.
// - Texto plano + HTML mínimo con todo escapado.
//
// Uso: `MailService.send(to, nombre, params)` con los tipos de parámetros exportados abajo
// (`MailTemplateParams<'nombre'>` da el mismo tipo). `send` nunca lanza ni espera al SMTP y
// devuelve false si el correo se descartó (sin destinatario válido o sin cupo).
//
// Cada plantilla se descuenta de un cupo (`lane`, ver MailService): 'security' (alertas de la
// cuenta), 'reset' (enlaces de restablecer), 'verify' (confirmar el correo), 'pqrs' (avisos de
// PQRS al admin, con plazo legal) y 'notice' (el resto de avisos). Así una ola de registros o de
// "olvidé mi contraseña" no puede dejar sin cupo a las alertas de seguridad ni a las PQRS.
//
// Plantillas de M3 (docs/api-m3.md, "Correos"):
// | Nombre                    | Para                                      | Parámetros                                   |
// |---------------------------|-------------------------------------------|----------------------------------------------|
// | 'verify-email'            | el usuario (registro o reenvío)           | VerifyEmailMailParams { token }              |
// | 'reset-password'          | user.email guardado (nunca lo escrito)    | ResetPasswordMailParams { token }            |
// | 'booking-new-owner'       | dueño con notifyByEmail y correo          | BookingNewOwnerMailParams {}                 |
// |                           | verificado (eso lo decide quien llama)    |                                              |
// | 'booking-digest-owner'    | dueño que llegó al tope de avisos ayer    | BookingDigestOwnerMailParams { count }       |
// | 'profile-submitted-admin' | ADMIN_NOTIFY_EMAIL o el correo del admin  | ProfileSubmittedAdminMailParams              |
// |                           |                                           |   { displayName, slug }                      |
// | 'profile-approved'        | dueño                                     | ProfileApprovedMailParams { slug }           |
// | 'profile-rejected'        | dueño                                     | ProfileRejectedMailParams { reason }         |
// | 'profile-suspended'       | dueño                                     | ProfileSuspendedMailParams { reason }        |
// | 'draft-expiring'          | dueño                                     | DraftExpiringMailParams { daysLeft }         |
//
// 'booking-new-owner' tiene además un tope propio de 5 por destinatario al día
// (MAIL_TEMPLATE_DAILY_CAPS en mail.service.ts): el 5.º avisa que lo que llegue después irá en
// un resumen al día siguiente ('booking-digest-owner', BookingDigestJob) y del 6.º en adelante no
// se envía nada (las solicitudes siguen llegando al panel).

import { LIMITS, SLUG_RE, cleanText, formatLongDate, sliceText } from '@fersua/shared';

// ------------------------------------------------------------------ parámetros de M3

/** 'verify-email': enlace a `/verificar-correo#t=<token>` (48 h, un solo uso). */
export interface VerifyEmailMailParams {
  /** Token en claro. Solo viaja en el fragmento del enlace (#t=); en la BD va su hash. */
  token: string;
}

/** 'reset-password': enlace a `/restablecer#t=<token>` (30 min, un solo uso). */
export interface ResetPasswordMailParams {
  /** Token en claro. Solo viaja en el fragmento del enlace (#t=); en la BD va su hash. */
  token: string;
}

/**
 * 'booking-new-owner': "Tienes una nueva solicitud" y enlace a `/panel/solicitudes`. Sin
 * ningún dato del solicitante (plan M3: "correos de aviso sin texto libre del público").
 */
export type BookingNewOwnerMailParams = Record<string, never>;

/** 'booking-digest-owner': "Tienes N solicitudes nuevas sin leer" y enlace al panel. */
export interface BookingDigestOwnerMailParams {
  /** Solicitudes sin leer (NEW) del perfil. */
  count: number;
}

/** 'profile-submitted-admin': nombre y slug del perfil y enlace a `/admin/djs`. */
export interface ProfileSubmittedAdminMailParams {
  displayName: string;
  slug: string;
}

/** 'profile-approved': enlace a la página publicada (`/<slug>`) y a `/panel`. */
export interface ProfileApprovedMailParams {
  slug: string;
}

/** 'profile-rejected': el motivo que escribió el admin (se escapa y se corta en 500) y `/panel`. */
export interface ProfileRejectedMailParams {
  reason: string;
}

/** 'profile-suspended': el motivo que escribió el admin (se escapa y se corta en 500) y `/panel`. */
export interface ProfileSuspendedMailParams {
  reason: string;
}

/** 'draft-expiring': "Tu borrador se borrará en N días por inactividad" y `/panel`. */
export interface DraftExpiringMailParams {
  /** Días que faltan para el borrado (se redondea y queda en 1 como mínimo). */
  daysLeft: number;
}

/** Interno de 'booking-new-owner': lo pone MailService en el último aviso del día. No lo pases. */
interface BookingNewOwnerRenderParams {
  lastOfDay?: boolean;
}

/** Máximo de caracteres del nombre del solicitante que podría salir en un correo (M6). */
export const REQUESTER_NAME_MAX = 40;

/**
 * Nombre apto para un correo: solo letras (con tildes), espacios, apóstrofos, guiones y, si se
 * pide, dígitos y '&'. Sin puntos, arrobas, barras ni dos puntos, nada puede volverse un enlace
 * en el cliente de correo (sin dígitos, tampoco un teléfono). Cortado a `max`; '' si no queda nada.
 */
export function sanitizeMailName(raw: unknown, max: number, opts: { digits?: boolean } = {}): string {
  if (typeof raw !== 'string') return '';
  const allowed = opts.digits ? /[^\p{L}\p{M}\p{Nd}\s'’&-]/gu : /[^\p{L}\p{M}\s'’-]/gu;
  const clean = cleanText(raw.slice(0, 500)).replace(allowed, ' ').replace(/\s+/g, ' ').trim();
  return sliceText(clean, max).trim();
}

/**
 * Nombre del solicitante apto para un correo (máx. 40, sin dígitos). Hoy ningún correo lo usa:
 * el aviso al DJ no lleva datos del público (plan M3). Queda por si se decide mostrarlo.
 */
export function sanitizeRequesterName(raw: unknown): string {
  return sanitizeMailName(raw, REQUESTER_NAME_MAX);
}

/** Línea "Motivo: …" con el texto del admin en una sola línea y dentro del límite de la columna (o nada si viene vacío). */
function reasonLine(raw: string | null | undefined): string[] {
  const reason = sliceText(cleanText(raw ?? ''), LIMITS.profile.statusReasonMax);
  return reason ? [`Motivo: ${reason}`] : [];
}

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

/**
 * Cupo del que se descuenta cada plantilla (MailService lleva un conteo por cupo y buzón, y
 * algunos cupos tienen además un tope global al día):
 * - 'security': alertas que un tercero puede provocar (bloqueo por intentos, 2FA, ingreso nuevo,
 *   clave temporal).
 * - 'account': "tu contraseña cambió" y "tu correo cambió". Solo salen por un cambio real: con
 *   cupo propio, nadie puede silenciarlas gastando el de las otras alertas.
 * - 'reset': enlaces de "olvidé mi contraseña" (los puede pedir cualquiera: cupo aparte).
 * - 'verify': confirmar el correo (registro y reenvíos).
 * - 'pqrs': aviso al admin de una PQRS o reporte (plazo legal): nunca lo agotan los avisos.
 * - 'notice': el resto de avisos (solicitudes, estado del perfil, borrador por vencer).
 */
export type MailLane = 'security' | 'account' | 'reset' | 'verify' | 'pqrs' | 'notice';

const LANE_PRIORITY: Record<MailLane, MailPriority> = {
  security: 'security',
  account: 'security',
  reset: 'security',
  verify: 'normal',
  pqrs: 'normal',
  notice: 'normal',
};

interface TemplateDef<P> {
  lane: MailLane;
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

function def<P>(lane: MailLane, render: (params: P, ctx: MailContext) => MailContent): TemplateDef<P> {
  return { lane, priority: LANE_PRIORITY[lane], render };
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
  'admin-new-ticket': def<{ typeLabel: string; ticketId: string; dueDate: string; businessDays: number }>('pqrs', (p, ctx) =>
    compose(`Nueva solicitud: ${p.typeLabel}`, [
      `Llegó una solicitud de tipo «${p.typeLabel}» (radicado ${p.ticketId}).`,
      `Hay que responderla en ${p.businessDays} días hábiles: vence el ${formatLongDate(p.dueDate)}.`,
      { link: `${ctx.publicUrl}/admin/pqrs`, label: 'Abrir PQRS y reportes' },
    ]),
  ),

  /** Al usuario: su contraseña cambió. */
  'password-changed': def<{ at: Date; isAdmin: boolean }>('account', (p, ctx) =>
    compose('Tu contraseña de Fersua Studio cambió', [
      `La contraseña de tu cuenta se cambió el ${formatBogota(p.at)}. Cerramos las demás sesiones abiertas.`,
      p.isAdmin
        ? 'Si no fuiste tú, entra al VPS y ejecuta admin:reset-password y admin:reset-mfa.'
        : 'Si no fuiste tú, restablece tu contraseña ya y escríbenos respondiendo este correo.',
      ...(p.isAdmin ? [] : [{ link: `${ctx.publicUrl}/recuperar`, label: 'Restablecer mi contraseña' }]),
    ]),
  ),

  /** Al correo ANTERIOR de un usuario: el admin lo cambió. No incluye el correo nuevo. */
  'email-changed': def<{ at: Date }>('account', (p) =>
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

  // ---------------------------------------------------------------- M3: cuenta

  /**
   * Al usuario: confirmar su correo. Cupo propio ('verify', con tope global al día): una ola de
   * registros falsos no gasta el de las alertas de seguridad, el de las PQRS ni el de los avisos.
   * El enlace abre una página con un botón: los escáneres de correo no lo confirman solos (L3).
   */
  'verify-email': def<VerifyEmailMailParams>('verify', (p, ctx) =>
    compose('Confirma tu correo en Fersua Studio', [
      'Para terminar de crear tu cuenta de artista en Fersua Studio, confirma que este correo es tuyo: abre el enlace y toca «Confirmar mi correo».',
      { link: `${ctx.publicUrl}/verificar-correo#t=${encodeURIComponent(p.token)}`, label: 'Confirmar mi correo' },
      `El enlace vence en ${LIMITS.retention.verifyTokenHours} horas y solo sirve una vez. Si vence, pide otro desde tu panel.`,
      `Si no confirmas tu correo en ${LIMITS.retention.unverifiedUserDays} días, borramos la cuenta y lo que hayas empezado a armar.`,
      'Si no creaste una cuenta en Fersua Studio, ignora este correo: sin la confirmación no pasa nada.',
    ]),
  ),

  /** Al user.email guardado: restablecer la contraseña. Nunca al admin (su rescate es por CLI). */
  'reset-password': def<ResetPasswordMailParams>('reset', (p, ctx) =>
    compose('Restablece tu contraseña de Fersua Studio', [
      'Recibimos una solicitud para restablecer la contraseña de tu cuenta de Fersua Studio.',
      { link: `${ctx.publicUrl}/restablecer#t=${encodeURIComponent(p.token)}`, label: 'Elegir una contraseña nueva' },
      `El enlace vence en ${LIMITS.retention.resetTokenMinutes} minutos y solo sirve una vez. Al usarlo se cierran todas las sesiones abiertas de tu cuenta.`,
      'Si no fuiste tú, ignora este correo: tu contraseña sigue igual.',
    ]),
  ),

  // ---------------------------------------------------------------- M3: perfil y solicitudes

  /**
   * Al dueño: llegó una solicitud de booking. Sin ningún dato del solicitante (ni el nombre):
   * todo se ve en el panel. Un bot no puede meter texto propio en un correo firmado por nosotros.
   */
  'booking-new-owner': def<BookingNewOwnerRenderParams>('notice', (p, ctx) =>
    compose('Tienes una nueva solicitud de booking', [
      'Tienes una nueva solicitud de booking.',
      'Por seguridad, los datos de contacto y el detalle del evento solo se ven en tu panel.',
      { link: `${ctx.publicUrl}/panel/solicitudes`, label: 'Ver mis solicitudes' },
      ...(p.lastOfDay
        ? ['Hoy ya te enviamos varios avisos: para no llenar tu buzón, las solicitudes que lleguen después te las contamos mañana en un solo correo. Todas siguen llegando a tu panel.']
        : []),
      'Puedes apagar estos avisos desde tu panel.',
    ]),
  ),

  /** Al dueño: resumen del día siguiente cuando llegó al tope de avisos (solo el número). */
  'booking-digest-owner': def<BookingDigestOwnerMailParams>('notice', (p, ctx) => {
    const n = Math.max(1, Math.floor(Number.isFinite(p.count) ? p.count : 1));
    return compose('Tienes solicitudes de booking sin leer', [
      n === 1 ? 'Tienes 1 solicitud de booking sin leer.' : `Tienes ${n} solicitudes de booking sin leer.`,
      'Ayer llegaron más solicitudes de las que te avisamos una por una. Los datos de contacto y el detalle de cada una están en tu panel.',
      { link: `${ctx.publicUrl}/panel/solicitudes`, label: 'Ver mis solicitudes' },
      'Puedes apagar estos avisos desde tu panel.',
    ]);
  }),

  /** Al admin: un perfil se envió a revisión. */
  'profile-submitted-admin': def<ProfileSubmittedAdminMailParams>('notice', (p, ctx) => {
    // El nombre artístico lo escribe cualquiera que se registre: sin puntos, arrobas, barras ni
    // dos puntos, "Soporte fersua-login.com/admin" no se vuelve un enlace en el correo del admin.
    const name = sanitizeMailName(p.displayName, LIMITS.profile.displayNameMax, { digits: true }) || 'sin nombre';
    const slug = SLUG_RE.test(p.slug) ? p.slug : '';
    return compose('Perfil enviado a revisión', [
      slug ? `El perfil «${name}» (/${slug}) se envió a revisión.` : `El perfil «${name}» se envió a revisión.`,
      { link: `${ctx.publicUrl}/admin/djs`, label: 'Revisar perfiles' },
    ]);
  }),

  /** Al dueño: su perfil fue aprobado y ya está publicado. */
  'profile-approved': def<ProfileApprovedMailParams>('notice', (p, ctx) =>
    compose('¡Tu página de booking fue aprobada!', [
      'Revisamos tu perfil y lo aprobamos: tu página de booking ya está publicada.',
      ...(SLUG_RE.test(p.slug) ? [{ link: `${ctx.publicUrl}/${p.slug}`, label: 'Ver mi página' }] : []),
      'Puedes seguir actualizando tus fechas, fotos y textos desde tu panel, sin volver a revisión.',
      { link: `${ctx.publicUrl}/panel`, label: 'Ir a mi panel' },
    ]),
  ),

  /** Al dueño: su perfil fue rechazado, con el motivo del admin. */
  'profile-rejected': def<ProfileRejectedMailParams>('notice', (p, ctx) =>
    compose('Tu perfil necesita cambios', [
      'Revisamos tu perfil y todavía no lo podemos publicar.',
      ...reasonLine(p.reason),
      'Haz los ajustes desde tu panel y envíalo de nuevo a revisión.',
      `Si no hay cambios en ${LIMITS.retention.rejectedIdleDays} días, el perfil se borra, con sus fotos y sus datos legales (tu cuenta no).`,
      { link: `${ctx.publicUrl}/panel`, label: 'Ir a mi panel' },
    ]),
  ),

  /** Al dueño: su página fue suspendida, con el motivo del admin. */
  'profile-suspended': def<ProfileSuspendedMailParams>('notice', (p, ctx) =>
    compose('Suspendimos tu página de booking', [
      'Tu página de booking dejó de verse en Fersua Studio.',
      ...reasonLine(p.reason),
      'Si crees que es un error, escríbenos desde la página de PQRS.',
      { link: `${ctx.publicUrl}/pqrs`, label: 'Escribir a Fersua Studio' },
      { link: `${ctx.publicUrl}/panel`, label: 'Ir a mi panel' },
    ]),
  ),

  /** Al dueño: su borrador lleva semanas sin cambios y se borrará pronto. */
  'draft-expiring': def<DraftExpiringMailParams>('notice', (p, ctx) => {
    const days = Math.max(1, Math.round(Number.isFinite(p.daysLeft) ? p.daysLeft : 1));
    return compose('Tu borrador se borrará pronto', [
      `Tu borrador se borrará en ${days} ${days === 1 ? 'día' : 'días'} por inactividad.`,
      'Para conservarlo, entra a tu panel y sigue editándolo o envíalo a revisión. Tu cuenta no se borra.',
      { link: `${ctx.publicUrl}/panel`, label: 'Ir a mi panel' },
    ]);
  }),
} as const;

export type MailTemplateName = keyof typeof MAIL_TEMPLATES;
/** Lo que recibe cada plantilla al pintarse (incluye los campos internos que pone MailService). */
export type MailRenderParams<K extends MailTemplateName> = Parameters<(typeof MAIL_TEMPLATES)[K]['render']>[0];

/** Parámetros que pasa quien llama a MailService.send (sin los campos internos). */
export type MailTemplateParams<K extends MailTemplateName> = K extends 'booking-new-owner'
  ? BookingNewOwnerMailParams
  : MailRenderParams<K>;

export function renderMail<K extends MailTemplateName>(name: K, params: MailRenderParams<K>, ctx: MailContext): MailContent {
  const tpl = MAIL_TEMPLATES[name] as unknown as TemplateDef<MailRenderParams<K>>;
  return tpl.render(params, ctx);
}

export function mailPriority(name: MailTemplateName): MailPriority {
  return MAIL_TEMPLATES[name].priority;
}

export function mailLane(name: MailTemplateName): MailLane {
  return MAIL_TEMPLATES[name].lane;
}
