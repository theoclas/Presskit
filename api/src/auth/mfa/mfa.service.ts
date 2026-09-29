import { Injectable } from '@nestjs/common';
import { AppConfig } from '../../config/app-config.service';
import { decryptSecret } from '../../common/crypto';
import { MFA_MAX_ATTEMPTS, MFA_TTL_SECONDS } from '../auth.constants';
import { BoundedMap } from '../bounded-map';
import { consumeRecoveryCode, recoveryKey, totpStep } from './totp';

/**
 * Segundo factor del admin. Estado en memoria (hay un solo proceso del api):
 * - último paso TOTP usado por usuario, para que un código visto por encima del hombro no
 *   se pueda reusar dentro de su ventana;
 * - jti de los mfaToken ya usados o quemados, e intentos fallidos por jti.
 */
@Injectable()
export class MfaService {
  private readonly encKey: Buffer;
  private readonly rcKey: string;
  private readonly lastStep = new BoundedMap<string, number>(1_000, 5 * 60_000);
  private readonly burnedJti = new BoundedMap<string, true>(10_000, (MFA_TTL_SECONDS + 60) * 1000);
  private readonly attempts = new BoundedMap<string, number>(10_000, (MFA_TTL_SECONDS + 60) * 1000);

  constructor(config: AppConfig) {
    this.encKey = config.mfaEncKey;
    this.rcKey = recoveryKey(this.encKey);
  }

  get recoveryHashKey(): string {
    return this.rcKey;
  }

  /** Código TOTP correcto y no usado antes. Marca su paso como usado. */
  verifyTotp(userId: string, secretEnc: string | null, code: string): boolean {
    if (!secretEnc) return false;
    let secret: string;
    try {
      secret = decryptSecret(this.encKey, secretEnc);
    } catch {
      return false;
    }
    const step = totpStep(secret, code);
    if (step === null) return false;
    const last = this.lastStep.get(userId);
    if (last !== undefined && step <= last) return false;
    this.lastStep.set(userId, step);
    return true;
  }

  /** Lista de hashes sin el código usado, o null si el código no es válido. */
  consumeRecovery(stored: unknown, code: string): string[] | null {
    return consumeRecoveryCode(this.rcKey, stored, code);
  }

  isBurned(jti: string): boolean {
    return this.burnedJti.has(jti);
  }

  burn(jti: string): void {
    this.burnedJti.set(jti, true);
    this.attempts.delete(jti);
  }

  /** Suma un intento fallido; al llegar al máximo quema el token. Devuelve true si quedó quemado. */
  failAttempt(jti: string): boolean {
    const n = (this.attempts.get(jti) ?? 0) + 1;
    if (n >= MFA_MAX_ATTEMPTS) {
      this.burn(jti);
      return true;
    }
    this.attempts.set(jti, n);
    return false;
  }

  /** Olvida el último paso usado (tras admin:reset-mfa el secreto cambia). */
  forgetUser(userId: string): void {
    this.lastStep.delete(userId);
  }

  sweepMemory(): void {
    this.lastStep.sweep();
    this.burnedJti.sweep();
    this.attempts.sweep();
  }
}
