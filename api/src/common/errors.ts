import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * Error con código estable para la web. `message` va en español y nunca incluye
 * los valores enviados por el usuario.
 */
export class AppError extends HttpException {
  constructor(
    status: HttpStatus,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super({ statusCode: status, code, message, ...(details ? { details } : {}) }, status);
  }
}

export const Errors = {
  notFound: (message = 'No encontrado.') => new AppError(HttpStatus.NOT_FOUND, 'NOT_FOUND', message),
  validation: (details: Record<string, string>, message = 'Revisa los datos enviados.') =>
    new AppError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message, details),
  badRequest: (code: string, message: string) => new AppError(HttpStatus.BAD_REQUEST, code, message),
  conflict: (code: string, message: string) => new AppError(HttpStatus.CONFLICT, code, message),
  forbidden: (code = 'FORBIDDEN', message = 'No tienes permiso para esta acción.') =>
    new AppError(HttpStatus.FORBIDDEN, code, message),
  unauthorized: (code = 'UNAUTHORIZED', message = 'Debes iniciar sesión.') =>
    new AppError(HttpStatus.UNAUTHORIZED, code, message),
  tooMany: (message = 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.') =>
    new AppError(HttpStatus.TOO_MANY_REQUESTS, 'RATE_LIMITED', message),
  unavailable: (code: string, message: string) => new AppError(HttpStatus.SERVICE_UNAVAILABLE, code, message),
};
