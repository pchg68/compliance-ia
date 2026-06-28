import { describe, it, expect } from "vitest";
import {
  mapWithConcurrency,
  withTimeout,
  withRetry,
  TokenBucket,
  CircuitBreaker,
} from "../src/lib/concurrency";

describe("mapWithConcurrency — alto volume", () => {
  it("processa 1000 itens respeitando o limite de concorrência", async () => {
    const total = 1000;
    const limit = 8;
    let active = 0;
    let maxActive = 0;

    const items = Array.from({ length: total }, (_, i) => i);
    const results = await mapWithConcurrency(items, limit, async (n) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 1));
      active--;
      return n * 2;
    });

    expect(results).toHaveLength(total);
    expect(results[500]).toBe(1000);
    expect(maxActive).toBeLessThanOrEqual(limit);
    expect(maxActive).toBeGreaterThan(1); // de fato houve paralelismo
  });

  it("preserva a ordem dos resultados", async () => {
    const items = Array.from({ length: 50 }, (_, i) => i);
    const results = await mapWithConcurrency(items, 5, async (n) => {
      await new Promise((r) => setTimeout(r, (50 - n) % 7));
      return n;
    });
    expect(results).toEqual(items);
  });

  it("retorna vazio para lista vazia", async () => {
    const results = await mapWithConcurrency([], 4, async (n) => n);
    expect(results).toEqual([]);
  });
});

describe("withTimeout", () => {
  it("resolve quando dentro do prazo", async () => {
    const r = await withTimeout(Promise.resolve("ok"), 100);
    expect(r).toBe("ok");
  });

  it("rejeita quando estoura o prazo", async () => {
    const slow = new Promise((r) => setTimeout(() => r("tarde"), 50));
    await expect(withTimeout(slow, 10, "teste")).rejects.toThrow(/Timeout/);
  });
});

describe("withRetry", () => {
  it("tenta novamente até suceder", async () => {
    let attempts = 0;
    const r = await withRetry(
      async () => {
        attempts++;
        if (attempts < 3) throw new Error("falha");
        return "ok";
      },
      { retries: 3, baseDelayMs: 1 }
    );
    expect(r).toBe("ok");
    expect(attempts).toBe(3);
  });

  it("para imediatamente se shouldRetry for falso", async () => {
    let attempts = 0;
    await expect(
      withRetry(
        async () => { attempts++; throw new Error("fatal"); },
        { retries: 5, baseDelayMs: 1, shouldRetry: () => false }
      )
    ).rejects.toThrow("fatal");
    expect(attempts).toBe(1);
  });
});

describe("TokenBucket — rate limit", () => {
  it("limita a taxa de aquisições sob rajada", async () => {
    const bucket = new TokenBucket(5, 50); // capacidade 5, 50/s
    const start = Date.now();
    // 10 aquisições: 5 imediatas, 5 dependem de refill (~20ms cada)
    for (let i = 0; i < 10; i++) await bucket.acquire();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(50);
  });
});

describe("CircuitBreaker", () => {
  it("abre após o limiar de falhas e falha rápido", () => {
    const cb = new CircuitBreaker(3, 1000);
    expect(cb.isOpen).toBe(false);
    cb.recordFailure();
    cb.recordFailure();
    expect(cb.isOpen).toBe(false);
    cb.recordFailure();
    expect(cb.isOpen).toBe(true); // 3 falhas -> aberto
  });

  it("reseta em sucesso", () => {
    const cb = new CircuitBreaker(2, 1000);
    cb.recordFailure();
    cb.recordSuccess();
    cb.recordFailure();
    expect(cb.isOpen).toBe(false); // sucesso zerou o contador
  });

  it("entra em half-open após o cooldown", async () => {
    const cb = new CircuitBreaker(1, 20);
    cb.recordFailure();
    expect(cb.isOpen).toBe(true);
    await new Promise((r) => setTimeout(r, 30));
    expect(cb.isOpen).toBe(false); // cooldown expirou -> permite nova tentativa
  });
});
