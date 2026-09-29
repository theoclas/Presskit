/** La cola del semáforo está llena: el llamador responde 503 en vez de esperar sin límite. */
export class SemaphoreFullError extends Error {
  constructor() {
    super('semaphore-full');
  }
}

/**
 * Semáforo con cola acotada. argon2 usa ~19 MiB por hash: sin tope, una ráfaga de logins
 * agota la memoria del contenedor (512 MB) antes que el throttler alcance a frenarla.
 */
export class Semaphore {
  private active = 0;
  private readonly waiters: Array<() => void> = [];

  constructor(
    private readonly max: number,
    private readonly maxQueue: number,
  ) {}

  get pending(): number {
    return this.waiters.length;
  }

  get running(): number {
    return this.active;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      if (this.waiters.length >= this.maxQueue) throw new SemaphoreFullError();
      // El cupo se hereda de quien termina (ver finally): aquí no se incrementa.
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await fn();
    } finally {
      const next = this.waiters.shift();
      if (next) next();
      else this.active--;
    }
  }
}
