import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../../config/app-config.service';
import { Errors } from '../errors';

/**
 * Toda petición que cambia estado debe venir de nuestro propio origen (patrón de HabitFer).
 * En producción, sin cabecera Origin se rechaza. Complementa SameSite=Strict de la cookie.
 */
@Injectable()
export class OriginGuard implements CanActivate {
  constructor(private readonly config: AppConfig) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method.toUpperCase())) return true;

    const origin = req.headers.origin;
    if (!origin) {
      if (this.config.isProd) throw Errors.forbidden('ORIGIN_REQUIRED', 'Solicitud no permitida.');
      return true;
    }
    if (!this.config.corsOrigins.includes(origin)) {
      throw Errors.forbidden('ORIGIN_NOT_ALLOWED', 'Solicitud no permitida.');
    }
    return true;
  }
}
