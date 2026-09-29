import type { ArgumentsHost } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AllExceptionsFilter, bodyParserStatus } from './all-exceptions.filter';

function run(exception: unknown) {
  const res = {
    headersSent: false,
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      return this;
    },
  };
  const host = { switchToHttp: () => ({ getResponse: () => res }) } as unknown as ArgumentsHost;
  new AllExceptionsFilter().catch(exception, host);
  return res;
}

/** Igual que los errores de body-parser (http-errors). */
function bodyErr(type: string, status: number): Error {
  return Object.assign(new Error('x'), { type, status, statusCode: status, expose: true });
}

describe('AllExceptionsFilter', () => {
  let errorSpy: jest.SpyInstance;
  beforeEach(() => {
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => jest.restoreAllMocks());

  it('cuerpo demasiado grande → 413 JSON, sin stack en el log', () => {
    const res = run(bodyErr('entity.too.large', 413));
    expect(res.statusCode).toBe(413);
    expect(res.body).toMatchObject({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('JSON roto → 400 VALIDATION_FAILED', () => {
    const res = run(bodyErr('entity.parse.failed', 400));
    expect(res.statusCode).toBe(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('un error cualquiera con status no se confunde con uno de body-parser', () => {
    expect(bodyParserStatus(Object.assign(new Error('x'), { status: 413 }))).toBeNull();
    expect(bodyParserStatus(bodyErr('entity.too.large', 500))).toBeNull();
    const res = run(new Error('boom'));
    expect(res.statusCode).toBe(500);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('Prisma InvalidArg / P2000 → 400, no 500', () => {
    for (const code of ['InvalidArg', 'P2000']) {
      const err = new Prisma.PrismaClientKnownRequestError('mensaje interno', { code, clientVersion: 'test' });
      const res = run(err);
      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED' });
      expect(JSON.stringify(res.body)).not.toContain('mensaje interno');
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
