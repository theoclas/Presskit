import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.service';
import { MAIL_TEMPLATES, escapeHtml, renderMail } from './mail-templates';
import { MAIL_DAILY_NORMAL_BUDGET, MAIL_PER_RECIPIENT_PER_DAY, MailService, type MailTransport } from './mail.service';

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
      'email-changed',
      'password-changed',
      'temp-password-issued',
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
