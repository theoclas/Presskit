/**
 * Cola en memoria con concurrencia fija y un tope de espera. Decodificar una foto de 40 MP
 * ocupa ~160 MB; en un VPS de 1 vCPU con el api limitado en memoria, dos a la vez pueden
 * tumbar el contenedor. Si la fila está llena se rechaza de inmediato (el llamador responde
 * 503) en vez de acumular trabajo sin límite.
 */
export class ProcessingQueue {
  private active = 0;
  private readonly waiting: (() => void)[] = [];

  constructor(
    private readonly concurrency: number,
    private readonly maxWaiting: number,
    private readonly onFull: () => Error,
  ) {}

  get size(): { active: number; waiting: number } {
    return { active: this.active, waiting: this.waiting.length };
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      if (this.waiting.length >= this.maxWaiting) throw this.onFull();
      await new Promise<void>((resolve) => this.waiting.push(resolve));
    } else {
      this.active++;
    }
    try {
      return await task();
    } finally {
      // El cupo pasa directo al siguiente en la fila, sin liberarlo: así nadie se cuela.
      const next = this.waiting.shift();
      if (next) next();
      else this.active--;
    }
  }
}
