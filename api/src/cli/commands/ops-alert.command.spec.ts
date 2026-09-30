import { Logger } from '@nestjs/common';
import type { AppConfig } from '../../config/app-config.service';
import { OPS_ALERT_DETAIL_MAX, renderMail } from '../../mail/mail-templates';
import type { MailTransport } from '../../mail/mail.service';
import { CliUsageError, parseArgs } from '../args';
import { COMMANDS } from './index';
import {
  OPS_ALERT_AUDIT_ACTION,
  OPS_ALERT_CLI_DETAIL_MAX,
  OPS_ALERT_DAILY_MAX,
  OPS_ALERT_KINDS,
  opsAlertCommand,
  parseOpsAlertArgs,
  sanitizeOpsDetail,
  sendOpsAlert,
  type OpsAlertDeps,
} from './ops-alert.command';

const parse = (argv: string[]) => parseOpsAlertArgs(parseArgs(argv, opsAlertCommand.flags));

describe('ops:alert — argumentos', () => {
  it('está registrado en la CLI', () => {
    expect(COMMANDS.map((c) => c.name)).toContain('ops:alert');
  });

  it('acepta un tipo de la lista, con detalle y --resolved', () => {
    expect(parse(['--kind', 'disk-low', '--detail', 'Quedan 3.2 GB libres en / (mínimo 5 GB)'])).toEqual({
      kind: 'disk-low',
      detail: 'Quedan 3.2 GB libres en / (mínimo 5 GB)',
      resolved: false,
    });
    expect(parse(['--kind=offsite-stale', '--resolved'])).toEqual({ kind: 'offsite-stale', detail: '', resolved: true });
    for (const kind of Object.keys(OPS_ALERT_KINDS)) expect(parse(['--kind', kind]).kind).toBe(kind);
  });

  it('rechaza tipos fuera de la lista (también los nombres heredados de Object)', () => {
    expect(() => parse([])).toThrow(/Falta --kind/);
    for (const kind of ['disk', 'DISK-LOW', 'rm -rf /', '__proto__', 'constructor', 'toString']) {
      expect(() => parse(['--kind', kind])).toThrow(CliUsageError);
    }
  });

  it('rechaza argumentos sueltos y flags mal escritos', () => {
    expect(() => parse(['--kind', 'test', 'extra'])).toThrow(/Sobra el argumento/);
    expect(() => parse(['--kind', 'test', '--resolved=yes'])).toThrow(CliUsageError);
    expect(() => parse(['--kind', 'test', '--detail'])).toThrow(/necesita un valor/);
    expect(() => parse(['--kynd', 'test'])).toThrow(/desconocida/);
  });

  it('el detalle queda en una línea, sin marcado ni correos, y cortado', () => {
    expect(sanitizeOpsDetail('api: unhealthy\nedge:\tmissing\u0007')).toBe('api: unhealthy edge: missing');
    expect(sanitizeOpsDetail('<script>alert("x")</script>')).not.toMatch(/[<>"]/);
    expect(sanitizeOpsDetail('escribe a x@evil.com')).not.toContain('@');
    expect(sanitizeOpsDetail('[clic](https://evil.com/x)')).not.toMatch(/[[\]]|:\/\//);
    expect(sanitizeOpsDetail('db_nightly_20261001T081500Z vence en 10 días (2026-12-28), 12%')).toBe(
      'db_nightly_20261001T081500Z vence en 10 días (2026-12-28), 12%',
    );
    expect(sanitizeOpsDetail('x'.repeat(5000))).toHaveLength(OPS_ALERT_CLI_DETAIL_MAX);
    expect(OPS_ALERT_CLI_DETAIL_MAX).toBeLessThanOrEqual(OPS_ALERT_DETAIL_MAX);
  });
});

describe('plantilla ops-alert', () => {
  const ctx = { publicUrl: 'https://booking.fersuastudio.com' };
  const at = new Date('2026-09-29T15:00:00Z');
  const kind = OPS_ALERT_KINDS['disk-low'];

  it('alerta: título, detalle, qué hacer y hora de Colombia; HTML escapado', () => {
    const m = renderMail('ops-alert', { title: kind.title, detail: 'Quedan <b>3 GB</b>', hint: kind.hint, resolved: false, at }, ctx);
    expect(m.subject).toBe('Alerta del servidor: Poco espacio en el disco del VPS');
    expect(m.text).toContain('Detalle: Quedan <b>3 GB</b>');
    expect(m.text).toContain(kind.hint);
    expect(m.text).toContain('hora de Colombia');
    expect(m.html).not.toContain('<b>3 GB</b>');
    expect(m.html).toContain('&lt;b&gt;3 GB&lt;/b&gt;');
  });

  it('resuelto: otro asunto y sin el consejo', () => {
    const m = renderMail('ops-alert', { title: kind.title, detail: '12.0 GB libres en /', hint: kind.hint, resolved: true, at }, ctx);
    expect(m.subject).toBe('Resuelto: Poco espacio en el disco del VPS');
    expect(m.text).not.toContain(kind.hint);
    expect(m.text).toContain('Detalle: 12.0 GB libres en /');
  });

  it('la prueba no dice que hay un problema', () => {
    const t = OPS_ALERT_KINDS.test;
    const m = renderMail('ops-alert', { title: t.title, detail: '', hint: t.hint, resolved: false, test: true, at }, ctx);
    expect(m.subject).toBe('Alerta del servidor: Prueba de alertas');
    expect(m.text).toContain('Esta es una prueba');
    expect(m.text).not.toMatch(/detectó un problema|Mientras siga/);
  });

  it('los textos fijos no tienen nombres de archivo, enlaces ni correos (el cliente los enlazaría)', () => {
    for (const k of Object.values(OPS_ALERT_KINDS)) {
      for (const s of [k.title, k.hint, k.note]) {
        expect(s).not.toMatch(/\.(sh|md|log|com|conf)\b|https?:|@/);
      }
    }
  });
});

describe('sendOpsAlert', () => {
  const config = {
    adminNotifyEmail: 'ops@fersuastudio.com',
    publicUrl: 'https://booking.fersuastudio.com',
    smtp: { from: 'Fersua Studio <no-reply@fersuastudio.com>' },
  };

  function deps(over: { config?: Partial<typeof config>; count?: number; adminEmail?: string | null; transport?: MailTransport } = {}) {
    const sendMail = jest.fn().mockResolvedValue({});
    const d = {
      prisma: {
        user: { findFirst: jest.fn().mockResolvedValue(over.adminEmail === undefined ? null : { email: over.adminEmail }) },
        auditLog: { count: jest.fn().mockResolvedValue(over.count ?? 0) },
      },
      audit: { record: jest.fn().mockResolvedValue(undefined) },
      config: { ...config, ...over.config } as unknown as AppConfig,
      transport: over.transport ?? { sendMail },
    };
    return { d: d as unknown as OpsAlertDeps & typeof d, sendMail };
  }

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('manda a ADMIN_NOTIFY_EMAIL y lo audita sin el destinatario', async () => {
    const { d, sendMail } = deps();
    await expect(sendOpsAlert(d, { kind: 'backup-stale', detail: 'hace 30 h', resolved: false })).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: 'ops@fersuastudio.com', subject: 'Alerta del servidor: El respaldo nocturno está atrasado' });
    expect(d.prisma.user.findFirst).not.toHaveBeenCalled();
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: OPS_ALERT_AUDIT_ACTION,
        metadata: { kind: 'backup-stale', resolved: false, delivered: true, detail: 'hace 30 h' },
      }),
    );
    expect(JSON.stringify(d.audit.record.mock.calls)).not.toContain('ops@fersuastudio.com');
    expect(sendMail.mock.calls[0][0].text).toContain('Mientras siga pasando');
  });

  it('un reinicio es un hecho puntual: no promete aviso de resuelto', async () => {
    const { d, sendMail } = deps();
    await expect(sendOpsAlert(d, { kind: 'container-restart', detail: 'api (1)', resolved: false })).resolves.toBe(true);
    const text: string = sendMail.mock.calls[0][0].text;
    expect(text).toContain('Si vuelve a pasar');
    expect(text).not.toContain('cuando se resuelva');
  });

  it('sin ADMIN_NOTIFY_EMAIL usa el correo del admin', async () => {
    const { d, sendMail } = deps({ config: { adminNotifyEmail: null as unknown as string }, adminEmail: 'fernando@fersuastudio.com' });
    await expect(sendOpsAlert(d, { kind: 'test', detail: '', resolved: false })).resolves.toBe(true);
    expect(d.prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { role: 'ADMIN' } }));
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: 'fernando@fersuastudio.com' });
  });

  it('sin destinatario falla antes de enviar', async () => {
    const { d, sendMail } = deps({ config: { adminNotifyEmail: null as unknown as string }, adminEmail: null });
    await expect(sendOpsAlert(d, { kind: 'test', detail: '', resolved: false })).rejects.toThrow(/No hay a quién avisar/);
    expect(sendMail).not.toHaveBeenCalled();
    expect(d.audit.record).not.toHaveBeenCalled();
  });

  it('respeta el tope diario de avisos entregados, contado en la auditoría', async () => {
    const { d, sendMail } = deps({ count: OPS_ALERT_DAILY_MAX });
    await expect(sendOpsAlert(d, { kind: 'disk-low', detail: '', resolved: false })).rejects.toThrow(/tope/);
    expect(d.prisma.auditLog.count).toHaveBeenCalledWith({
      // Solo los que salieron: una caída del SMTP no agota el tope con intentos fallidos.
      where: { action: OPS_ALERT_AUDIT_ACTION, createdAt: { gte: expect.any(Date) }, metadata: { path: '$.delivered', equals: true } },
    });
    expect(sendMail).not.toHaveBeenCalled();
    expect(d.audit.record).not.toHaveBeenCalled();
  });

  it('un destinatario no válido no llega al SMTP y cuenta como no enviado', async () => {
    const { d, sendMail } = deps({ config: { adminNotifyEmail: 'x<otro@evil.com>' } });
    await expect(sendOpsAlert(d, { kind: 'test', detail: '', resolved: false })).resolves.toBe(false);
    expect(sendMail).not.toHaveBeenCalled();
    expect(d.audit.record).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ delivered: false }) }));
  });

  it('espera el reintento de MailService si el primer intento falla', async () => {
    const sendMail = jest.fn().mockRejectedValueOnce(new Error('ECONNRESET')).mockResolvedValue({});
    const { d } = deps({ transport: { sendMail } });
    await expect(sendOpsAlert(d, { kind: 'container-down', detail: 'api: unhealthy', resolved: false })).resolves.toBe(true);
    expect(sendMail).toHaveBeenCalledTimes(2);
  });

  it('si el SMTP no responde a tiempo devuelve false y lo audita', async () => {
    const sendMail = jest.fn().mockRejectedValue(new Error('ETIMEDOUT'));
    const { d } = deps({ transport: { sendMail } });
    d.timeoutMs = 300;
    await expect(sendOpsAlert(d, { kind: 'tls-expiring', detail: '', resolved: true })).resolves.toBe(false);
    expect(d.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: expect.objectContaining({ kind: 'tls-expiring', resolved: true, delivered: false }) }),
    );
  });
});
