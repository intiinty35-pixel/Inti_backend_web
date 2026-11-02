export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Registra un intento y devuelve false cuando la clave superó el límite dentro de la ventana. */
  allow(key: string): boolean {
    const now = Date.now();
    const recent = this.recent(key, now);
    if (recent.length >= this.limit) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 5000) this.prune(now);
    return true;
  }

  /** Consulta el bloqueo sin registrar un intento. */
  isBlocked(key: string): boolean {
    const now = Date.now();
    return this.recent(key, now).length >= this.limit;
  }

  /** Registra un fallo sin extender el bloqueo una vez alcanzado el límite. */
  record(key: string): void {
    const now = Date.now();
    const recent = this.recent(key, now);
    if (recent.length < this.limit) {
      recent.push(now);
      this.hits.set(key, recent);
    }
    if (this.hits.size > 5000) this.prune(now);
  }

  reset(key: string): void {
    this.hits.delete(key);
  }

  private recent(key: string, now: number): number[] {
    return (this.hits.get(key) ?? []).filter((time) => now - time < this.windowMs);
  }

  private prune(now: number): void {
    for (const [key, times] of this.hits) {
      if (times.every((time) => now - time >= this.windowMs)) this.hits.delete(key);
    }
  }
}
