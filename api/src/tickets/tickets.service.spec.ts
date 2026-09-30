import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { AppError } from '../common/errors';
import type { RequestContext } from '../common/request-context';
import type { AppConfig } from '../config/app-config.service';
import { FormTokenService } from '../booking/form-token.service';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { PublicProfileResolver } from '../public/public-profile.resolver';
import { TICKET_DAILY_CAPS, type TicketRecentCounts } from './ticket-rules';
import type { TicketSubmitBody } from './ticket-submit.dto';
import { TICKET_TOKEN_SCOPE, TicketsService } from './tickets.service';

const config = { bookingFormSecret: 'test-secret-0123456789abcdef-0123456789', adminNotifyEmail: 'admin@example.test' } as unknown as AppConfig;

function setup(counts: TicketRecentCounts, opts: { nonceUsed?: boolean } = {}) {
  const created: Record<string, unknown>[] = [];
  const tx = {
    usedFormNonce: {
      create: jest.fn(async () => {
        if (opts.nonceUsed) throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
      }),
    },
    ticket: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return { id: `cticket${created.length}` };
      }),
    },
  };
  const prisma = {
    ticket: {
      // Orden de las consultas en recentCounts: IP sin spam, spam de la IP, total sin spam, todo.
      count: jest
        .fn()
        .mockResolvedValueOnce(counts.ip)
        .mockResolvedValueOnce(counts.ipSpam)
        .mockResolvedValueOnce(counts.total)
        .mockResolvedValueOnce(counts.all),
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaService;
  const resolver = { lookup: jest.fn(async () => ({ kind: 'none' })) } as unknown as PublicProfileResolver;
  const ctx = { ipHash: () => 'a'.repeat(64) } as unknown as RequestContext;
  const mail = { send: jest.fn(() => true) };
  const tokens = new FormTokenService(config);
  const service = new TicketsService(prisma, resolver, ctx, mail as unknown as MailService, config, tokens);
  // Emitido hace 5 s: pasa el tiempo mínimo.
  const token = tokens.issue('ticket', TICKET_TOKEN_SCOPE, Date.now() - 5_000);
  return { service, created, tx, mail, tokens, token };
}

const req = { ip: '203.0.113.7', headers: {} } as unknown as Request;
const body = (token: string, extra: Partial<TicketSubmitBody> = {}): TicketSubmitBody => ({
  type: 'PQRS_CONSULTA',
  name: 'Ana Pérez',
  email: 'ana@correo.com',
  subject: 'Consulta de datos',
  message: 'Quiero saber qué datos personales tienen guardados.',
  consent: true,
  token,
  ...extra,
});

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (err) {
    if (err instanceof AppError) return err.code;
    throw err;
  }
}

const quiet: TicketRecentCounts = { ip: 0, ipSpam: 0, total: 0, all: 0 };

describe('TicketsService.submit', () => {
  it('ticket normal: se guarda sin spam, gasta el nonce y avisa al admin', async () => {
    const { service, created, tx, mail, token } = setup(quiet);
    const res = await service.submit(body(token), req);
    expect(res).toEqual({ id: 'cticket1', dueDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(created[0]).toMatchObject({ type: 'PQRS_CONSULTA', email: 'ana@correo.com', isSpam: false });
    expect(tx.usedFormNonce.create).toHaveBeenCalledTimes(1);
    expect(mail.send).toHaveBeenCalledWith('admin@example.test', 'admin-new-ticket', expect.objectContaining({ ticketId: 'cticket1' }));
  });

  it('honeypot: se guarda como spam, con la misma respuesta, y no avisa', async () => {
    const { service, created, mail, token } = setup(quiet);
    const res = await service.submit(body(token, { hp_x7: 'https://spam.example' }), req);
    expect(res.id).toBe('cticket1');
    expect(created[0]).toMatchObject({ isSpam: true });
    expect(mail.send).not.toHaveBeenCalled();
  });

  it('por encima del tope por IP o del total: 429 con el correo como alternativa, sin guardar ni avisar', async () => {
    for (const counts of [
      { ...quiet, ip: TICKET_DAILY_CAPS.perIp },
      { ...quiet, total: TICKET_DAILY_CAPS.total, all: TICKET_DAILY_CAPS.total },
    ]) {
      const { service, tx, mail, token } = setup(counts);
      const res = service.submit(body(token), req);
      await expect(res).rejects.toMatchObject({ code: 'RATE_LIMITED', message: expect.stringContaining('correo de contacto') });
      expect(tx.ticket.create).not.toHaveBeenCalled();
      expect(tx.usedFormNonce.create).not.toHaveBeenCalled();
      expect(mail.send).not.toHaveBeenCalled();
    }
  });

  it('el spam de la misma IP no le cierra el paso a una persona real', async () => {
    const { service, created, mail, token } = setup({ ...quiet, ipSpam: 50, all: 50 });
    await service.submit(body(token), req);
    expect(created[0]).toMatchObject({ isSpam: false });
    expect(mail.send).toHaveBeenCalledTimes(1);
  });

  it('honeypot: los topes de personas no lo frenan; pasado su tope por IP recibe un id falso', async () => {
    const a = setup({ ...quiet, ip: TICKET_DAILY_CAPS.perIp, total: TICKET_DAILY_CAPS.total });
    await a.service.submit(body(a.token, { hp_x7: 'x' }), req);
    expect(a.created[0]).toMatchObject({ isSpam: true });

    const b = setup({ ...quiet, ipSpam: TICKET_DAILY_CAPS.spamPerIp });
    const res = await b.service.submit(body(b.token, { hp_x7: 'x' }), req);
    expect(res.id).toMatch(/^c[a-z0-9]{24}$/);
    expect(b.tx.ticket.create).not.toHaveBeenCalled();
    expect(b.mail.send).not.toHaveBeenCalled();
  });

  it('techo diario: 429 sin guardar; el honeypot recibe un id falso', async () => {
    const hard = { ...quiet, all: TICKET_DAILY_CAPS.hardTotal };
    const a = setup(hard);
    expect(await codeOf(a.service.submit(body(a.token), req))).toBe('RATE_LIMITED');
    expect(a.tx.ticket.create).not.toHaveBeenCalled();

    const b = setup(hard);
    const res = await b.service.submit(body(b.token, { hp_x7: 'x' }), req);
    expect(res.id).toMatch(/^c[a-z0-9]{24}$/);
    expect(b.tx.ticket.create).not.toHaveBeenCalled();
    expect(b.mail.send).not.toHaveBeenCalled();
  });

  it('un token de booking, uno muy nuevo o uno reutilizado no sirven', async () => {
    const a = setup(quiet);
    const booking = a.tokens.issue('booking', TICKET_TOKEN_SCOPE, Date.now() - 5_000);
    expect(await codeOf(a.service.submit(body(booking), req))).toBe('FORM_TOKEN_INVALID');
    expect(await codeOf(a.service.submit(body(a.tokens.issue('ticket', TICKET_TOKEN_SCOPE)), req))).toBe('FORM_TOO_FAST');
    expect(a.tx.ticket.create).not.toHaveBeenCalled();

    const b = setup(quiet, { nonceUsed: true });
    expect(await codeOf(b.service.submit(body(b.token), req))).toBe('FORM_TOKEN_USED');
    expect(b.mail.send).not.toHaveBeenCalled();
  });

  it('el token se revisa antes que los campos', async () => {
    const { service, token } = setup(quiet);
    expect(await codeOf(service.submit(body('basura', { email: 'no-es-correo' }), req))).toBe('FORM_TOKEN_INVALID');
    expect(await codeOf(service.submit(body(token, { email: 'no-es-correo' }), req))).toBe('VALIDATION_FAILED');
  });

  it('issueToken emite un token de propósito ticket', () => {
    const { service, tokens } = setup(quiet);
    const { token } = service.issueToken();
    expect(tokens.verify(token, 'ticket', TICKET_TOKEN_SCOPE, Date.now() + 5_000).p).toBe('ticket');
  });
});
