import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { Observable } from 'rxjs';
import { PUBLIC_CACHE_KEY } from '../decorators';

/** No-store por defecto; solo los GET marcados con @PublicCache se pueden cachear. */
@Injectable()
export class CacheControlInterceptor implements NestInterceptor {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const seconds = this.reflector.getAllAndOverride<number | undefined>(PUBLIC_CACHE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (req.method === 'GET' && seconds && !req.headers.authorization) {
      res.setHeader('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 5}`);
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    return next.handle();
  }
}
