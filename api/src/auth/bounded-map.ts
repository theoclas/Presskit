/**
 * Map en memoria con tope de entradas y vencimiento. Para estado de seguridad efímero
 * (bloqueos por IP, jti de MFA usados, carreras de refresh): un atacante no puede hacerlo
 * crecer sin límite, y al llenarse se descartan primero las entradas más viejas.
 */
export class BoundedMap<K, V> {
  private readonly map = new Map<K, { value: V; expiresAt: number }>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    const hit = this.map.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.map.delete(key);
      return undefined;
    }
    return hit.value;
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /** `ttlMs` propio opcional (p. ej. un bloqueo que dura más que el TTL por defecto). */
  set(key: K, value: V, ttlMs = this.ttlMs): void {
    this.map.delete(key);
    this.map.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.map.size > this.maxEntries) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  delete(key: K): void {
    this.map.delete(key);
  }

  /** Borra las entradas cuya clave cumple el filtro (p. ej. todas las de un usuario). */
  deleteWhere(pred: (key: K) => boolean): void {
    for (const key of [...this.map.keys()]) if (pred(key)) this.map.delete(key);
  }

  sweep(): void {
    const t = this.now();
    for (const [key, hit] of [...this.map.entries()]) if (hit.expiresAt <= t) this.map.delete(key);
  }
}
