/**
 * Primitivas de escalabilidade para chamadas a fontes externas.
 * Sem dependências externas — pensadas para alto volume de buscas concorrentes.
 */

/** Executa `fn` sobre `items` com no máximo `limit` execuções simultâneas. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    () => worker()
  );
  await Promise.all(workers);
  return results;
}

/** Rejeita se a promise não resolver dentro de `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operação"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout de ${ms}ms em ${label}`)),
      ms
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

/** Tenta `fn` com backoff exponencial. Para imediatamente se `shouldRetry` retornar false. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; baseDelayMs?: number; shouldRetry?: (e: unknown) => boolean } = {}
): Promise<T> {
  const { retries = 2, baseDelayMs = 200, shouldRetry = () => true } = opts;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (attempt === retries || !shouldRetry(e)) break;
      await new Promise((r) => setTimeout(r, baseDelayMs * Math.pow(2, attempt)));
    }
  }
  throw lastErr;
}

/**
 * Rate limiter por token bucket. Protege fontes externas (DATAJUD, LexML)
 * de estouro de requisições sob alto volume.
 */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  private refill() {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = now;
  }

  /** Aguarda até haver um token disponível. */
  async acquire(): Promise<void> {
    this.refill();
    while (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.refillPerSecond) * 1000;
      await new Promise((r) => setTimeout(r, Math.max(waitMs, 10)));
      this.refill();
    }
    this.tokens -= 1;
  }
}

/**
 * Circuit breaker: após `failureThreshold` falhas consecutivas, abre o circuito
 * e falha rápido por `cooldownMs`, evitando martelar uma fonte indisponível.
 */
export class CircuitBreaker {
  private failures = 0;
  private openedAt: number | null = null;

  constructor(
    private readonly failureThreshold = 5,
    private readonly cooldownMs = 30_000
  ) {}

  get isOpen(): boolean {
    if (this.openedAt === null) return false;
    if (Date.now() - this.openedAt >= this.cooldownMs) {
      // half-open: permite uma tentativa
      this.openedAt = null;
      this.failures = 0;
      return false;
    }
    return true;
  }

  recordSuccess() {
    this.failures = 0;
    this.openedAt = null;
  }

  recordFailure() {
    this.failures += 1;
    if (this.failures >= this.failureThreshold) {
      this.openedAt = Date.now();
    }
  }
}
