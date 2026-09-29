import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { normalizePassword } from '@fersua/shared';
import { Errors } from '../../common/errors';
import { randomToken } from '../../common/crypto';
import { Semaphore, SemaphoreFullError } from './semaphore';

/** argon2id según OWASP (m=19 MiB, t=2, p=1). Cambiarlos rehashea solo en el siguiente login. */
export const ARGON2_PARAMS = { memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const HASH_OPTIONS = { type: argon2.argon2id, ...ARGON2_PARAMS } as const;

/** 4 hashes a la vez (~76 MiB) y 20 en espera; lo demás recibe 503. */
const MAX_CONCURRENT = 4;
const MAX_QUEUE = 20;

/**
 * Hash y verificación de contraseñas. Sin dependencias de Nest para que la CLI la pueda
 * instanciar con `new PasswordHasher()`.
 */
@Injectable()
export class PasswordHasher implements OnModuleInit {
  // Sin parámetros en el constructor: Nest no debe intentar inyectar nada aquí.
  protected semaphore = new Semaphore(MAX_CONCURRENT, MAX_QUEUE);
  private dummy: Promise<string> | null = null;

  /** El hash ficticio se calcula al arrancar: así el primer login con usuario inexistente no tarda distinto. */
  async onModuleInit(): Promise<void> {
    await this.dummyHash();
  }

  async hash(plain: string): Promise<string> {
    return this.guarded(() => argon2.hash(normalizePassword(plain), HASH_OPTIONS));
  }

  /**
   * true solo si la contraseña coincide. Un hash vacío o que no es argon2 (p. ej. el hash
   * inutilizable de una cuenta sembrada) gasta el mismo tiempo que uno real y da false.
   */
  async verify(hash: string | null | undefined, plain: string): Promise<boolean> {
    if (!hash || !hash.startsWith('$argon2')) {
      await this.dummyVerify(plain);
      return false;
    }
    return this.guarded(async () => {
      try {
        return await argon2.verify(hash, normalizePassword(plain));
      } catch {
        return false;
      }
    });
  }

  /** Mismo costo que una verificación real, para usuarios que no existen o están bloqueados. */
  async dummyVerify(plain: string): Promise<false> {
    const dummy = await this.dummyHash();
    await this.guarded(() => argon2.verify(dummy, normalizePassword(plain)).catch(() => false));
    return false;
  }

  /** El hash quedó con parámetros (o algoritmo) viejos: se rehace tras un login correcto. */
  needsRehash(hash: string): boolean {
    if (!hash.startsWith('$argon2id$')) return true;
    try {
      return argon2.needsRehash(hash, ARGON2_PARAMS);
    } catch {
      return true;
    }
  }

  private dummyHash(): Promise<string> {
    this.dummy ??= argon2.hash(randomToken(24), HASH_OPTIONS);
    return this.dummy;
  }

  private async guarded<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await this.semaphore.run(fn);
    } catch (err) {
      if (err instanceof SemaphoreFullError) {
        throw Errors.unavailable('AUTH_BUSY', 'Hay muchas solicitudes en este momento. Intenta de nuevo en unos segundos.');
      }
      throw err;
    }
  }
}
