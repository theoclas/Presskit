import { Injectable } from '@nestjs/common';
import type { Prisma, UserRole } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { AppConfig } from '../../config/app-config.service';
import { hmacHex, safeEqual } from '../../common/crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { LOCKOUT, MFA_LOCKOUT } from '../auth.constants';
import { BoundedMap } from '../bounded-map';

type Tx = Prisma.TransactionClient | PrismaService;

/** Minutos de bloqueo de la pareja tras `failures` fallos: 15·2^(n−5), máximo 240. */
export function pairLockMinutes(failures: number): number {
  if (failures < LOCKOUT.pairThreshold) return 0;
  return Math.min(LOCKOUT.pairBaseMinutes * 2 ** (failures - LOCKOUT.pairThreshold), LOCKOUT.pairMaxMinutes);
}

/** Minutos de pausa del 2FA tras `failures` códigos malos seguidos: 15·2^(n−3), máximo 240. */
export function mfaLockMinutes(failures: number): number {
  if (failures < MFA_LOCKOUT.threshold) return 0;
  return Math.min(MFA_LOCKOUT.baseMinutes * 2 ** (failures - MFA_LOCKOUT.threshold), MFA_LOCKOUT.maxMinutes);
}

/**
 * Candados en proceso, uno por flujo y usuario. Cada flujo tiene el suyo: un login anónimo con
 * el usuario del admin (que es público) no puede hacer fallar su código de 2FA ni su step-up.
 */
export type LockFlow = 'login' | 'mfa' | 'stepup' | 'pwchange';

export function lockKey(flow: LockFlow, userId: string): string {
  return `${flow}:${userId}`;
}

/** El contador del usuario (todas las IPs) llegó a un múltiplo del tope suave. */
export function userSoftCapReached(failedLoginCount: number): boolean {
  return failedLoginCount > 0 && failedLoginCount % LOCKOUT.userSoftCap === 0;
}

interface PairState {
  failures: number;
  /** ms epoch; 0 = sin bloqueo. */
  lockedUntil: number;
}

export interface LockoutUser {
  id: string;
  role: UserRole;
  failedLoginCount: number;
  lockedUntil: Date | null;
}

/**
 * Bloqueo por intentos fallidos (H6/M1 de la crítica de seguridad):
 * - Pareja (usuario, IP /64): tras 5 fallos, 15·2^(n−5) min (máx. 240). En memoria: solo
 *   afecta a esa red, así que un atacante no deja al DJ afuera desde otra IP.
 * - Tope suave por usuario en la BD: cada 30 fallos seguidos (sin un login correcto de por
 *   medio), 60 min de bloqueo para todas las IPs. Nunca al ADMIN (lo protegen el TOTP y el
 *   límite por IP).
 * - Cookie de dispositivo conocido: el navegador donde el usuario ya entró salta ambos. Va
 *   atada a tokenVersion: cambiar o restablecer la contraseña, o cerrar todas las sesiones,
 *   invalida las cookies viejas (quien entró antes no conserva la inmunidad).
 * - 2FA del admin: contador por usuario en la BD (mfaFailedCount) con pausa progresiva
 *   (mfaLockedUntil) que la cookie de dispositivo conocido también salta.
 * - Un login correcto o un desbloqueo (admin o CLI) deja failedLoginCount en 0, y eso limpia
 *   también los bloqueos por IP en memoria (la CLI corre en otro proceso y solo toca la BD).
 */
@Injectable()
export class LockoutService {
  private readonly pairs = new BoundedMap<string, PairState>(20_000, LOCKOUT.pairResetMs);
  /** Claves lockKey(flujo, usuario) con una verificación en curso (mutex en proceso). */
  private readonly inFlight = new Set<string>();
  private readonly deviceSecret: string;

  constructor(
    private readonly prisma: PrismaService,
    config: AppConfig,
  ) {
    this.deviceSecret = hmacHex(config.jwtAccessSecret, 'fersua:known-device');
  }

  /** true si este intento ni siquiera debe verificar la contraseña. */
  isBlocked(user: LockoutUser, ipHash: string, opts: { knownDevice: boolean }, now = Date.now()): boolean {
    if (user.failedLoginCount === 0) this.clearPairs(user.id);
    if (opts.knownDevice) return false;
    const pair = this.pairs.get(pairKey(user.id, ipHash));
    if (pair && pair.lockedUntil > now) return true;
    return user.role !== 'ADMIN' && !!user.lockedUntil && user.lockedUntil.getTime() > now;
  }

  /**
   * Suma un fallo. El contador de la BD sube con un incremento atómico y el bloqueo se decide
   * con el valor que devuelve (nada de leer-modificar-escribir).
   */
  async recordFailure(user: Pick<LockoutUser, 'id' | 'role'>, ipHash: string, now = Date.now()): Promise<{ userLockedUntil: Date | null }> {
    const key = pairKey(user.id, ipHash);
    const failures = (this.pairs.get(key)?.failures ?? 0) + 1;
    const minutes = pairLockMinutes(failures);
    this.pairs.set(
      key,
      { failures, lockedUntil: minutes ? now + minutes * 60_000 : 0 },
      Math.max(LOCKOUT.pairResetMs, minutes * 60_000),
    );

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    if (user.role === 'ADMIN' || !userSoftCapReached(updated.failedLoginCount)) return { userLockedUntil: null };
    const until = new Date(now + LOCKOUT.userLockMinutes * 60_000);
    await this.prisma.user.update({ where: { id: user.id }, data: { lockedUntil: until } });
    return { userLockedUntil: until };
  }

  /** Login correcto desde esta red. El reinicio del contador en la BD lo hace quien abre la sesión. */
  clearPair(userId: string, ipHash: string): void {
    this.pairs.delete(pairKey(userId, ipHash));
  }

  clearPairs(userId: string): void {
    const prefix = `${userId}|`;
    this.pairs.deleteWhere((k) => k.startsWith(prefix));
  }

  /** Desbloqueo completo (admin o CLI): BD y memoria, contraseña y 2FA. */
  async unlock(userId: string, tx: Tx = this.prisma): Promise<void> {
    await tx.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lockedUntil: null, mfaFailedCount: 0, mfaLockedUntil: null },
    });
    this.clearPairs(userId);
  }

  // ------------------------------------------------------------ 2FA

  /**
   * Suma un código malo del admin (incremento atómico en la BD) y, desde el tercero seguido,
   * fija la pausa progresiva. Devuelve el total y hasta cuándo dura la pausa (null = sin pausa).
   */
  async recordMfaFailure(userId: string, now = Date.now()): Promise<{ failures: number; lockedUntil: Date | null }> {
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { mfaFailedCount: { increment: 1 } },
      select: { mfaFailedCount: true },
    });
    const minutes = mfaLockMinutes(updated.mfaFailedCount);
    if (!minutes) return { failures: updated.mfaFailedCount, lockedUntil: null };
    const until = new Date(now + minutes * 60_000);
    await this.prisma.user.update({ where: { id: userId }, data: { mfaLockedUntil: until } });
    return { failures: updated.mfaFailedCount, lockedUntil: until };
  }

  /** Hasta cuándo no se aceptan códigos de 2FA para este intento (null = se aceptan). */
  mfaPausedUntil(user: { mfaLockedUntil: Date | null }, opts: { knownDevice: boolean }, now = Date.now()): Date | null {
    if (opts.knownDevice || !user.mfaLockedUntil || user.mfaLockedUntil.getTime() <= now) return null;
    return user.mfaLockedUntil;
  }

  // ------------------------------------------------------------ candados en proceso

  /** Una sola verificación por flujo y usuario a la vez (clave de lockKey): los paralelos no cuentan dos veces. */
  tryAcquire(key: string): boolean {
    if (this.inFlight.has(key)) return false;
    this.inFlight.add(key);
    return true;
  }

  release(key: string): void {
    this.inFlight.delete(key);
  }

  // ------------------------------------------------------------ dispositivo conocido

  /**
   * Valor de la cookie `kd`: `<ts36>.<nonce>.<hmac>` atado al usuario y a su tokenVersion.
   * Sin estado en la BD: subir tokenVersion (cambio o reinicio de contraseña, cerrar todas las
   * sesiones, suspensión) basta para que las cookies emitidas antes dejen de servir.
   */
  issueDeviceToken(userId: string, tokenVersion: number, now = Date.now()): { value: string; expires: Date } {
    const ts = Math.floor(now / 1000).toString(36);
    const nonce = randomBytes(8).toString('hex');
    const sig = hmacHex(this.deviceSecret, deviceInput(userId, tokenVersion, ts, nonce));
    return { value: `${ts}.${nonce}.${sig}`, expires: new Date(now + LOCKOUT.knownDeviceDays * 24 * 60 * 60 * 1000) };
  }

  isKnownDevice(raw: string | null, userId: string, tokenVersion: number, now = Date.now()): boolean {
    if (!raw) return false;
    const parts = raw.split('.');
    if (parts.length !== 3) return false;
    const [ts, nonce, sig] = parts as [string, string, string];
    if (!/^[a-z0-9]{1,10}$/.test(ts) || !/^[a-f0-9]{16}$/.test(nonce) || !/^[a-f0-9]{64}$/.test(sig)) return false;
    const issuedMs = parseInt(ts, 36) * 1000;
    if (!Number.isFinite(issuedMs) || issuedMs > now + 60_000) return false;
    if (now - issuedMs > LOCKOUT.knownDeviceDays * 24 * 60 * 60 * 1000) return false;
    return safeEqual(sig, hmacHex(this.deviceSecret, deviceInput(userId, tokenVersion, ts, nonce)));
  }

  sweepMemory(): void {
    this.pairs.sweep();
  }
}

function pairKey(userId: string, ipHash: string): string {
  return `${userId}|${ipHash}`;
}

function deviceInput(userId: string, tokenVersion: number, ts: string, nonce: string): string {
  return `${userId}|${tokenVersion}|${ts}|${nonce}`;
}
