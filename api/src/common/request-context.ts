import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppConfig } from '../config/app-config.service';
import { ipHash } from './crypto';

/** Datos del cliente para guardar: la IP solo como HMAC y el user-agent recortado. */
@Injectable()
export class RequestContext {
  constructor(private readonly config: AppConfig) {}

  ipHash(req: Request): string {
    return ipHash(this.config.ipHashSecret, req.ip);
  }

  userAgent(req: Request): string | null {
    const ua = req.headers['user-agent'];
    return typeof ua === 'string' && ua ? ua.slice(0, 120) : null;
  }
}
