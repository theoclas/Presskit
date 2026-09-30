import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.service';
import { MAIL_TEMPLATES, REQUESTER_NAME_MAX, escapeHtml, renderMail, sanitizeRequesterName } from './mail-templates';
import {
  MAIL_DAILY_NORMAL_BUDGET,
  MAIL_PER_RECIPIENT_PER_DAY,
  MAIL_TEMPLATE_DAILY_CAPS,
  MailService,
  type MailTransport,
} from './mail.service';

const config = {
  publicUrl: 'https://booking.fersuastudio.com',
  smtp: { from: 'Fersua Studio <no-reply@fersuastudio.com>' },
} as unknown as AppConfig;

describe('plantillas de correo', () => {
  const ctx = { publicUrl: 'https://booking.fersuastudio.com' };
  const at = new Date('2026-09-29T15:00:00Z');

  it('texto y HTML dicen lo mismo, en español y con hora de Colombia', () => {
    const m = renderMail('password-changed', { at, isAdmin: false }, ctx);
    expect(m.subject).toBe('Tu contraseña de Fersua Studio cambió');
    expect(m.text).toContain('hora de Colombia');
    expect(m.text).toContain('https://booking.fersuastudio.com/recuperar');
    expect(m.html).toContain('href="https://booking.fersuastudio.com/recuperar"');
  });

  it('todo lo interpolado va escapado en el HTML', () => {
    const m = renderMail('admin-new-login', { at, networkTag: '<b>"x"</b>', method: 'totp' }, ctx);
    expect(m.html).not.toContain('<b>"x"</b>');
    expect(m.html).toContain('&lt;b&gt;&quot;x&quot;&lt;/b&gt;');
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;');
  });

  it('el correo de contraseña temporal no lleva la contraseña ni el usuario', () => {
    const m = renderMail('temp-password-issued', { expiresAt: at }, ctx);
    expect(m.text).toContain('nunca la enviamos por correo');
    expect(Object.keys(MAIL_TEMPLATES).sort()).toEqual([
      'account-locked',
      'admin-mfa-failed',
      'admin-new-login',
      'admin-new-ticket',
      'booking-new-owner',
      'draft-expiring',
      'email-changed',
      'password-changed',
      'profile-approved',
      'profile-rejected',
      'profile-submitted-admin',
      'profile-suspended',
      'reset-password',
      'temp-password-issued',
      'verify-email',
    ]);
  });

  it('código de 2FA fallido: avisa de la contraseña expuesta y de la pausa', () => {
    const m = renderMail('admin-mfa-failed', { at, networkTag: 'ab12cd34', failures: 3, pausedUntil: at }, ctx);
    expect(m.text).toContain('contraseña correcta');
    expect(m.text).toContain('admin:reset-password');
    expect(m.text).toContain('pausamos los códigos');
    expect(renderMail('admin-mfa-failed', { at, networkTag: 'x', failures: 1, pausedUntil: null }, ctx).text).toContain('1 código incorrecto');
  });

  it('aviso de PQRS al admin: tipo, radicado y vencimiento, sin texto del público', () => {
    const m = renderMail('admin-new-ticket', { typeLabel: 'Reclamo sobre datos personales', ticketId: 'cticket1', dueDate: '2026-10-20', businessDays: 15 }, ctx);
    expect(m.subject).toBe('Nueva solicitud: Reclamo sobre datos personales');
    expect(m.text).toContain('cticket1');
    expect(m.text).toContain('20 de octubre de 2026');
    expect(m.text).toContain('https://booking.fersuastudio.com/admin/pqrs');
  });

  it('el aviso de admin no ofrece recuperación por correo', () => {
    const m = renderMail('password-changed', { at, isAdmin: true }, ctx);
    expect(m.text).toContain('admin:reset-password');
    expect(m.text).not.toContain('/recuperar');
  });

  it('verificar el correo: enlace con el token en el fragmento, 48 h y sin el usuario', () => {
    const m = renderMail('verify-email', { token: 'abc_DEF-123.xyz' }, ctx);
    expect(m.subject).toBe('Confirma tu correo en Fersua Studio');
    expect(m.text).toContain('https://booking.fersuastudio.com/verificar-correo#t=abc_DEF-123.xyz');
    expect(m.html).toContain('href="https://booking.fersuastudio.com/verificar-correo#t=abc_DEF-123.xyz"');
    expect(m.text).toContain('48 horas');
    expect(m.text).toContain('Confirmar mi correo');
    expect(MAIL_TEMPLATES['verify-email'].priority).toBe('normal');
  });

  it('restablecer: enlace con #t=, 30 minutos y "si no fuiste tú, ignóralo"; prioridad de seguridad', () => {
    const m = renderMail('reset-password', { token: 'tok.en' }, ctx);
    expect(m.text).toContain('https://booking.fersuastudio.com/restablecer#t=tok.en');
    expect(m.text).toContain('30 minutos');
    expect(m.text).toContain('Si no fuiste tú, ignora este correo');
    expect(MAIL_TEMPLATES['reset-password'].priority).toBe('security');
    // Un token raro no puede salirse del fragmento ni del atributo href.
    const odd = renderMail('reset-password', { token: '"><script>x</script>' }, ctx);
    expect(odd.html).not.toContain('<script>');
    expect(odd.text).toContain('#t=%22%3E%3Cscript%3E');
  });

  it('solicitud nueva al dueño: sin datos del solicitante salvo el nombre saneado (máx. 40) y enlace al panel', () => {
    const plain = renderMail('booking-new-owner', {}, ctx);
    expect(plain.subject).toBe('Tienes una nueva solicitud de booking');
    expect(plain.text).toContain('Tienes una nueva solicitud de booking.');
    expect(plain.text).toContain('https://booking.fersuastudio.com/panel/solicitudes');
    expect(plain.text).not.toContain('hasta mañana');

    const named = renderMail('booking-new-owner', { requesterName: 'José Ñandú <b>visita</b> www.evil.com' }, ctx);
    expect(named.text).toContain('de José Ñandú b visita b www evil com.');
    expect(named.text).not.toContain('evil.com');
    expect(named.html).not.toContain('<b>');
    const last = renderMail('booking-new-owner', { requesterName: null, lastOfDay: true }, ctx);
    expect(last.text).toContain('no te avisaremos de más solicitudes hasta mañana');
  });

  it('sanitizeRequesterName: solo letras, espacios, apóstrofos y guiones; nada de enlaces, correos ni teléfonos', () => {
    expect(sanitizeRequesterName("  María-José  O'Neil ")).toBe("María-José O'Neil");
    expect(sanitizeRequesterName('http://evil.com/x?y=1')).toBe('http evil com x y');
    expect(sanitizeRequesterName('ana@evil.com')).toBe('ana evil com');
    expect(sanitizeRequesterName('Llama al 3001234567')).toBe('Llama al');
    // Puntos "raros" (U+2024, U+FF0E, U+FF61) tampoco sobreviven.
    expect(sanitizeRequesterName('evil․com')).toBe('evil com');
    expect(sanitizeRequesterName('evil．com｡co')).toBe('evil com co');
    // Invisibles y overrides bidireccionales fuera.
    expect(sanitizeRequesterName('‮evil​name')).toBe('evilname');
    expect(sanitizeRequesterName('1234 !!!')).toBe('');
    expect(sanitizeRequesterName(42)).toBe('');
    expect(sanitizeRequesterName('a'.repeat(100))).toHaveLength(REQUESTER_NAME_MAX);
  });

  it('perfil enviado a revisión (al admin): nombre y slug, enlace a /admin/djs', () => {
    const m = renderMail('profile-submitted-admin', { displayName: 'Mac Fly & <Mike>', slug: 'mac-fly' }, ctx);
    expect(m.text).toContain('El perfil «Mac Fly & <Mike>» (/mac-fly) se envió a revisión.');
    expect(m.html).toContain('Mac Fly &amp; &lt;Mike&gt;');
    expect(m.text).toContain('https://booking.fersuastudio.com/admin/djs');
    const bad = renderMail('profile-submitted-admin', { displayName: 'X', slug: 'https://evil.com' }, ctx);
    expect(bad.text).not.toContain('evil');
  });

  it('aprobado: enlace a la página y al panel; un slug inválido no arma enlace', () => {
    const m = renderMail('profile-approved', { slug: 'mac-fly' }, ctx);
    expect(m.text).toContain('https://booking.fersuastudio.com/mac-fly');
    expect(m.text).toContain('https://booking.fersuastudio.com/panel');
    const bad = renderMail('profile-approved', { slug: '../admin' }, ctx);
    expect(bad.text).not.toContain('/../admin');
    expect(bad.text).toContain('https://booking.fersuastudio.com/panel');
  });

  it('rechazado y suspendido: el motivo del admin va escapado, en una línea y con enlace al panel', () => {
    const r = renderMail('profile-rejected', { reason: 'Falta la foto <img src=x onerror=alert(1)>\nprincipal' }, ctx);
    expect(r.subject).toBe('Tu perfil necesita cambios');
    expect(r.text).toContain('Motivo: Falta la foto <img src=x onerror=alert(1)> principal');
    expect(r.html).not.toContain('<img');
    expect(r.html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(r.text).toContain('https://booking.fersuastudio.com/panel');
    const s = renderMail('profile-suspended', { reason: 'r'.repeat(900) }, ctx);
    expect(s.subject).toBe('Suspendimos tu página de booking');
    expect(s.text).toContain(`Motivo: ${'r'.repeat(500)}\n`);
    expect(s.text).not.toContain('r'.repeat(501));
    expect(s.text).toContain('https://booking.fersuastudio.com/pqrs');
    expect(renderMail('profile-rejected', { reason: '  ' }, ctx).text).not.toContain('Motivo:');
  });

  it('borrador por vencer: días que faltan (singular y plural) y enlace al panel', () => {
    expect(renderMail('draft-expiring', { daysLeft: 9 }, ctx).text).toContain('Tu borrador se borrará en 9 días por inactividad.');
    expect(renderMail('draft-expiring', { daysLeft: 1 }, ctx).text).toContain('en 1 día por inactividad');
    expect(renderMail('draft-expiring', { daysLeft: Number.NaN }, ctx).text).toContain('en 1 día');
    expect(renderMail('draft-expiring', { daysLeft: 9 }, ctx).text).toContain('https://booking.fersuastudio.com/panel');
  });

  it('ninguna plantilla de M3 arma enlaces fuera de PUBLIC_URL', () => {
    const samples = [
      renderMail('verify-email', { token: 't' }, ctx),
      renderMail('reset-password', { token: 't' }, ctx),
      renderMail('booking-new-owner', { requesterName: 'https://evil.com' }, ctx),
      renderMail('profile-submitted-admin', { displayName: 'https://evil.com', slug: 'dj-uno' }, ctx),
      renderMail('profile-approved', { slug: 'dj-uno' }, ctx),
      renderMail('profile-rejected', { reason: 'mira https://evil.com' }, ctx),
      renderMail('profile-suspended', { reason: 'x' }, ctx),
      renderMail('draft-expiring', { daysLeft: 9 }, ctx),
    ];
    for (const m of samples) {
      const hrefs = [...m.html.matchAll(/href="([^"]*)"/g)].map((x) => x[1]!);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const href of hrefs) expect(href.startsWith('https://booking.fersuastudio.com/')).toBe(true);
    }
  });
});

describe('MailService', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  function withTransport(fn: MailTransport['sendMail']) {
    const svc = new MailService(config);
    const sendMail = jest.fn(fn);
    svc.setTransportForTesting({ sendMail });
    return { svc, sendMail };
  }

  it('envía a la dirección normalizada con el remitente configurado', async () => {
    const { svc, sendMail } = withTransport(async () => ({}));
    expect(svc.send(' DJ@Example.com ', 'account-locked', { until: new Date() })).toBe(true);
    await svc.drainForTesting();
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'dj@example.com', from: 'Fersua Studio <no-reply@fersuastudio.com>' }),
    );
    svc.onModuleDestroy();
  });

  it('sin destinatario válido no encola', () => {
    const { svc, sendMail } = withTransport(async () => ({}));
    expect(svc.send(null, 'account-locked', { until: new Date() })).toBe(false);
    expect(svc.send('no-es-correo', 'account-locked', { until: new Date() })).toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('reintenta 3 veces (1 s, 10 s, 60 s) y luego descarta sin lanzar', async () => {
    jest.useFakeTimers();
    const { svc, sendMail } = withTransport(async () => {
      throw new Error('smtp caído');
    });
    svc.send('dj@example.com', 'password-changed', { at: new Date(), isAdmin: false });
    await jest.advanceTimersByTimeAsync(0);
    expect(sendMail).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1_000);
    expect(sendMail).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(sendMail).toHaveBeenCalledTimes(3);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(sendMail).toHaveBeenCalledTimes(4);
    await jest.advanceTimersByTimeAsync(600_000);
    expect(sendMail).toHaveBeenCalledTimes(4);
    svc.onModuleDestroy();
  });

  it('un fallo transitorio se recupera en el reintento', async () => {
    jest.useFakeTimers();
    let calls = 0;
    const { svc, sendMail } = withTransport(async () => {
      if (++calls === 1) throw new Error('timeout');
      return {};
    });
    svc.send('dj@example.com', 'account-locked', { until: new Date() });
    await jest.advanceTimersByTimeAsync(1_000);
    expect(sendMail).toHaveBeenCalledTimes(2);
    svc.onModuleDestroy();
  });

  it(`máximo ${MAIL_PER_RECIPIENT_PER_DAY} correos por destinatario al día`, async () => {
    const { svc } = withTransport(async () => ({}));
    for (let i = 0; i < MAIL_PER_RECIPIENT_PER_DAY; i++) {
      expect(svc.send('dj@example.com', 'account-locked', { until: new Date() })).toBe(true);
    }
    expect(svc.send('DJ@example.com', 'account-locked', { until: new Date() })).toBe(false);
    expect(svc.send('otro@example.com', 'account-locked', { until: new Date() })).toBe(true);
    await svc.drainForTesting();
    svc.onModuleDestroy();
  });

  it('avisos de booking: máximo 5 al día por dueño; el último lo dice y los siguientes se omiten', async () => {
    const { svc, sendMail } = withTransport(async () => ({}));
    const cap = MAIL_TEMPLATE_DAILY_CAPS['booking-new-owner']!;
    expect(cap).toBe(5);
    for (let i = 0; i < cap; i++) expect(svc.send('dj@example.com', 'booking-new-owner', { requesterName: 'Ana' })).toBe(true);
    expect(svc.send('DJ@example.com', 'booking-new-owner', { requesterName: 'Ana' })).toBe(false);
    // Otro dueño tiene su propio tope, y el mismo dueño sigue recibiendo otros avisos.
    expect(svc.send('otro@example.com', 'booking-new-owner', {})).toBe(true);
    expect(svc.send('dj@example.com', 'profile-approved', { slug: 'dj-uno' })).toBe(true);
    await svc.drainForTesting();
    const toDj = sendMail.mock.calls.map(([m]) => m).filter((m) => m.to === 'dj@example.com' && m.subject.includes('solicitud'));
    expect(toDj).toHaveLength(cap);
    expect(toDj.slice(0, cap - 1).every((m) => !m.text.includes('hasta mañana'))).toBe(true);
    expect(toDj[cap - 1]!.text).toContain('no te avisaremos de más solicitudes hasta mañana');
    svc.onModuleDestroy();
  });

  it('el tope de avisos de booking se reinicia al día siguiente', async () => {
    jest.useFakeTimers({ now: new Date('2026-09-29T12:00:00Z') });
    const { svc } = withTransport(async () => ({}));
    for (let i = 0; i < 5; i++) svc.send('dj@example.com', 'booking-new-owner', {});
    expect(svc.send('dj@example.com', 'booking-new-owner', {})).toBe(false);
    jest.setSystemTime(new Date('2026-09-30T12:00:00Z'));
    expect(svc.send('dj@example.com', 'booking-new-owner', {})).toBe(true);
    await jest.advanceTimersByTimeAsync(0);
    svc.onModuleDestroy();
  });

  it('los avisos normales no gastan el cupo de seguridad del mismo buzón', async () => {
    const { svc } = withTransport(async () => ({}));
    const ticket = { typeLabel: 'Consulta', ticketId: 'c1', dueDate: '2026-10-13', businessDays: 10 };
    for (let i = 0; i < MAIL_PER_RECIPIENT_PER_DAY; i++) expect(svc.send('admin@example.com', 'admin-new-ticket', ticket)).toBe(true);
    expect(svc.send('admin@example.com', 'admin-new-ticket', ticket)).toBe(false);
    expect(svc.send('admin@example.com', 'admin-new-login', { at: new Date(), networkTag: 'x', method: 'totp' })).toBe(true);
    expect(MAIL_DAILY_NORMAL_BUDGET).toBeLessThan(300);
    await svc.drainForTesting();
    svc.onModuleDestroy();
  });
});
