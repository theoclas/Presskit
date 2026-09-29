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

    // Errores de body-parser (cuerpo demasiado grande, JSON roto, charset raro). No son
    // HttpException y corren antes de las rutas: sin esto cualquier POST a /api/* daba un 500
    // con stack en el log, fácil de usar para llenar los logs. Son culpa del cliente: sin log.
    const bodyError = bodyParserStatus(exception);
    if (bodyError) {
      if (bodyError === 413) {
        res.status(413).json({ statusCode: 413, code: 'PAYLOAD_TOO_LARGE', message: 'Lo que enviaste es demasiado grande.' });
      } else if (bodyError === 415) {
        res.status(415).json({ statusCode: 415, code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Formato no soportado.' });
      } else {
        res.status(400).json({ statusCode: 400, code: 'VALIDATION_FAILED', message: 'Revisa los datos enviados.' });
      }
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
      // Valor demasiado largo para la columna (P2000) o que el motor no acepta (InvalidArg,
      // p. ej. una mitad suelta de emoji que se coló): es entrada mala, no una falla nuestra.
      if (exception.code === 'P2000' || exception.code === 'InvalidArg') {
        this.logger.warn(`Prisma rechazó la entrada: ${exception.code}`);
        res.status(400).json({ statusCode: 400, code: 'VALIDATION_FAILED', message: 'Revisa los datos enviados.' });
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

/**
 * Estado 4xx de un error estilo http-errors de body-parser ({ type, status, expose }), o null.
 * Se exige `type` de body-parser para no tragarse otros errores con un `status` cualquiera.
 */
export function bodyParserStatus(exception: unknown): number | null {
  if (!exception || typeof exception !== 'object') return null;
  const e = exception as { type?: unknown; status?: unknown; statusCode?: unknown };
  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : null;
  if (status === null || status < 400 || status > 499) return null;
  if (typeof e.type !== 'string' || !/^(entity|request|encoding|charset|parameters|stream)./.test(e.type)) return null;
  return status;
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
