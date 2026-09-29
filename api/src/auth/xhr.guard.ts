import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { Errors } from '../common/errors';
import { XHR_HEADER, XHR_HEADER_VALUE } from './auth.constants';

/**
 * CSRF de las rutas que actúan con la cookie (refresh, logout) y del resto del flujo de
 * sesión: un formulario de otro sitio no puede mandar cabeceras propias sin pasar por CORS.
 * Complementa SameSite=Strict (que no cubre a los subdominios hermanos) y el OriginGuard.
 */
@Injectable()
export class XRequestedWithGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (req.headers[XHR_HEADER] !== XHR_HEADER_VALUE) {
      throw Errors.forbidden('XHR_HEADER_REQUIRED', 'Solicitud no permitida.');
    }
    return true;
  }
}
