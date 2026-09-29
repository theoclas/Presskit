import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'node:crypto';
import { AppConfig } from '../../config/app-config.service';
import { hmacHex } from '../../common/crypto';
import {
  ACCESS_TTL_SECONDS,
  JWT_AUDIENCE_ACCESS,
  JWT_AUDIENCE_MFA,
  JWT_AUDIENCE_STEP_UP,
  JWT_ISSUER,
  MFA_TTL_SECONDS,
  STEP_UP_TTL_SECONDS,
} from '../auth.constants';

export interface AccessClaims {
  sub: string;
  /** tokenVersion del usuario al emitirlo. */
  tv: number;
  /** Familia de refresh tokens (sesión). */
  sid: string;
}

export interface MfaClaims {
  sub: string;
  tv: number;
  jti: string;
}

export interface StepUpClaims {
  sub: string;
  sid: string;
}

const MAX_TOKEN_LENGTH = 2048;
const ID_RE = /^[a-z0-9]{20,32}$/;
const SID_RE = /^[a-f0-9]{30}$/;
const JTI_RE = /^[a-f0-9]{32}$/;

/**
 * Emite y verifica los JWT (HS256). Cada propósito tiene su audiencia y su propio secreto,
 * derivado de JWT_ACCESS_SECRET con HMAC, así que no se pueden intercambiar.
 */
@Injectable()
export class TokenService {
  private readonly secrets: { access: string; mfa: string; stepUp: string };

  constructor(
    private readonly jwt: JwtService,
    config: AppConfig,
  ) {
    const root = config.jwtAccessSecret;
    this.secrets = {
      access: hmacHex(root, 'fersua:jwt:access'),
      mfa: hmacHex(root, 'fersua:jwt:mfa'),
      stepUp: hmacHex(root, 'fersua:jwt:step-up'),
    };
  }

  signAccess(claims: AccessClaims): string {
    return this.jwt.sign(
      { sub: claims.sub, tv: claims.tv, sid: claims.sid },
      { secret: this.secrets.access, algorithm: 'HS256', expiresIn: ACCESS_TTL_SECONDS, issuer: JWT_ISSUER, audience: JWT_AUDIENCE_ACCESS },
    );
  }

  verifyAccess(token: string): AccessClaims | null {
    const p = this.verify(token, this.secrets.access, JWT_AUDIENCE_ACCESS);
    if (!p || !isId(p.sub) || !isVersion(p.tv) || typeof p.sid !== 'string' || !SID_RE.test(p.sid)) return null;
    return { sub: p.sub, tv: p.tv, sid: p.sid };
  }

  /** Segundo paso del login del admin. `jti` permite usarlo una sola vez. */
  signMfa(claims: { sub: string; tv: number }): { token: string; jti: string } {
    const jti = randomBytes(16).toString('hex');
    const token = this.jwt.sign(
      { sub: claims.sub, tv: claims.tv, purpose: 'mfa' },
      {
        secret: this.secrets.mfa,
        algorithm: 'HS256',
        expiresIn: MFA_TTL_SECONDS,
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE_MFA,
        jwtid: jti,
      },
    );
    return { token, jti };
  }

  verifyMfa(token: string): MfaClaims | null {
    const p = this.verify(token, this.secrets.mfa, JWT_AUDIENCE_MFA);
    if (!p || p.purpose !== 'mfa' || !isId(p.sub) || !isVersion(p.tv) || typeof p.jti !== 'string' || !JTI_RE.test(p.jti)) {
      return null;
    }
    return { sub: p.sub, tv: p.tv, jti: p.jti };
  }

  /** Atado al usuario y a su sesión: robarlo de otra sesión no sirve. */
  signStepUp(claims: StepUpClaims): string {
    return this.jwt.sign(
      { sub: claims.sub, sid: claims.sid, purpose: 'step-up' },
      { secret: this.secrets.stepUp, algorithm: 'HS256', expiresIn: STEP_UP_TTL_SECONDS, issuer: JWT_ISSUER, audience: JWT_AUDIENCE_STEP_UP },
    );
  }

  verifyStepUp(token: string, expected: StepUpClaims): boolean {
    const p = this.verify(token, this.secrets.stepUp, JWT_AUDIENCE_STEP_UP);
    return !!p && p.purpose === 'step-up' && p.sub === expected.sub && p.sid === expected.sid;
  }

  private verify(token: string, secret: string, audience: string): Record<string, unknown> | null {
    if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) return null;
    try {
      const payload = this.jwt.verify<Record<string, unknown>>(token, {
        secret,
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience,
      });
      return payload && typeof payload === 'object' ? payload : null;
    } catch {
      return null;
    }
  }
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && ID_RE.test(v);
}

function isVersion(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}
