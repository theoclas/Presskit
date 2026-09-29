import { TICKET_DAILY_CAPS, fakeTicketId, ticketCapExceeded, ticketDueDate, validateTicketFields } from './ticket-rules';

const ok = {
  name: '  Ana   Pérez ',
  email: ' ANA@Correo.com ',
  phone: '+57 300 000 0000',
  subject: 'Quiero saber qué datos tienen',
  message: 'Hola, quisiera consultar qué datos personales míos tienen guardados.',
};

describe('validateTicketFields', () => {
  it('limpia y normaliza un ticket válido', () => {
    const { value, errors } = validateTicketFields(ok);
    expect(errors).toEqual({});
    expect(value).toEqual({
      name: 'Ana Pérez',
      email: 'ana@correo.com',
      phone: '+57 300 000 0000',
      subject: 'Quiero saber qué datos tienen',
      message: ok.message,
    });
  });

  it('marca cada campo inválido', () => {
    const { errors } = validateTicketFields({
      name: 'A',
      email: 'no-es-correo',
      phone: '12',
      subject: '',
      message: 'corto',
    });
    expect(errors).toEqual({ name: 'TOO_SHORT', email: 'INVALID', phone: 'INVALID', subject: 'REQUIRED', message: 'TOO_SHORT' });
  });

  it('rechaza números de tarjeta pegados en el mensaje', () => {
    const { errors } = validateTicketFields({ ...ok, message: 'Mi tarjeta es 4111 1111 1111 1111, gracias' });
    expect(errors.message).toBe('CARD_NUMBER');
  });

  it('respeta los máximos de LIMITS.ticket después de limpiar', () => {
    const { errors } = validateTicketFields({ ...ok, name: 'N'.repeat(81), subject: 'S'.repeat(121), message: 'M'.repeat(3001) });
    expect(errors).toEqual({ name: 'TOO_LONG', subject: 'TOO_LONG', message: 'TOO_LONG' });
  });

  it('rechaza mitades sueltas de emojis (JSON válido que la BD no acepta)', () => {
    const { errors } = validateTicketFields({ ...ok, name: 'Prueba \ud83d Uno', message: `${ok.message} \ud83d` });
    expect(errors).toEqual({ name: 'INVALID', message: 'INVALID' });
    // Un emoji completo sí vale.
    expect(validateTicketFields({ ...ok, name: 'Ana 🎧' }).errors).toEqual({});
  });

  it('el teléfono es opcional', () => {
    expect(validateTicketFields({ ...ok, phone: undefined }).value.phone).toBeNull();
  });
});

describe('ticketDueDate', () => {
  it('consulta: 10 días hábiles; reclamo: 15 (sin fines de semana ni festivos)', () => {
    // 2026-09-28 es lunes; el lunes 12 de octubre es festivo (Día de la Raza).
    expect(ticketDueDate('PQRS_CONSULTA', '2026-09-28')).toBe('2026-10-13');
    expect(ticketDueDate('PQRS_RECLAMO', '2026-09-28')).toBe('2026-10-20');
  });
});

describe('honeypot y topes', () => {
  it('el id falso tiene la forma de un cuid de Prisma', () => {
    const now = Date.UTC(2026, 8, 29, 12);
    const id = fakeTicketId(now);
    expect(id).toMatch(/^c[a-z0-9]{24}$/);
    // Los 8 caracteres de fecha son los del momento, como en un cuid real.
    expect(id.slice(1, 9)).toBe(now.toString(36));
    expect(fakeTicketId(now)).not.toBe(id);
  });

  it('tope diario por IP y total', () => {
    expect(ticketCapExceeded({ ip: 0, total: 0 })).toBe(false);
    expect(ticketCapExceeded({ ip: TICKET_DAILY_CAPS.perIp - 1, total: 5 })).toBe(false);
    expect(ticketCapExceeded({ ip: TICKET_DAILY_CAPS.perIp, total: 5 })).toBe(true);
    expect(ticketCapExceeded({ ip: 0, total: TICKET_DAILY_CAPS.total })).toBe(true);
  });
});
