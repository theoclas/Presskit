import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ThrottlerException } from '@nestjs/throttler';
import type { Response } from 'express';

/**
 * Respuesta de error uniforme: { statusCode, code, message, details? }.
 * En producción nunca sale un stack ni un mensaje interno de Prisma.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Errors');

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    if (res.headersSent) return;

    if (exception instanceof ThrottlerException) {
      res.status(429).json({
        statusCode: 429,
        code: 'RATE_LIMITED',
        message: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.',
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'object' && body && 'code' in body) {
        res.status(status).json(body);
        return;
      }
      // Errores de ValidationPipe y HttpException genéricas de Nest.
      const raw = typeof body === 'object' && body ? (body as { message?: unknown }).message : body;
      const messages = Array.isArray(raw) ? raw : [raw];
      res.status(status).json({
        statusCode: status,
        code: status === 400 ? 'VALIDATION_FAILED' : codeForStatus(status),
        message:
          status === 400
            ? 'Revisa los datos enviados.'
            : status === 404
              ? 'No encontrado.'
              : String(messages[0] ?? 'Error'),
        ...(status === 400 && Array.isArray(raw) ? { details: { fields: raw.slice(0, 10).join(' | ') } } : {}),
      });
      return;
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        res.status(409).json({ statusCode: 409, code: 'CONFLICT', message: 'Ese valor ya está en uso.' });
        return;
      }
      if (exception.code === 'P2025') {
        res.status(404).json({ statusCode: 404, code: 'NOT_FOUND', message: 'No encontrado.' });
        return;
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado. Intenta de nuevo.',
    });
  }
}

function codeForStatus(status: number): string {
  switch (status) {
    case 401:
      return 'UNAUTHORIZED';
    case 403:
      return 'FORBIDDEN';
    case 404:
      return 'NOT_FOUND';
    case 405:
      return 'METHOD_NOT_ALLOWED';
    case 409:
      return 'CONFLICT';
    case 413:
      return 'PAYLOAD_TOO_LARGE';
    case 415:
      return 'UNSUPPORTED_MEDIA_TYPE';
    case 429:
      return 'RATE_LIMITED';
    default:
      return 'ERROR';
  }
}
