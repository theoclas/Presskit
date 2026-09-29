import { Injectable, Logger } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { isIP } from 'node:net';
import { ipKey } from '../crypto';

const PRIVATE_RE = /^(10\.|127\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|fc|fd)/;

/**
 * Límite por IP real (IPv6 agrupada por /64). Si detrás del edge llega una IP privada en
 * producción, la cadena de proxies está mal configurada: se registra y se usa un balde
 * aparte para no mezclar a todos los visitantes en uno solo.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  private readonly log = new Logger('Throttler');

  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const ip = (req as unknown as Request).ip ?? '';
    if (process.env.NODE_ENV === 'production' && (!isIP(ip.replace(/^::ffff:/, '')) || PRIVATE_RE.test(ip.replace(/^::ffff:/, '')))) {
      this.log.warn(`real-ip-missing: ${ip || 'vacía'}`);
      return 'real-ip-missing';
    }
    return ipKey(ip);
  }
}
