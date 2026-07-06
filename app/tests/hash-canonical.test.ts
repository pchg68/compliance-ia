import { describe, it, expect } from "vitest";
import { computeRowHash, CURRENT_HASH_SCHEMA_VERSION, type HashableInteraction } from "../src/lib/hash";

// Testes puros de serialização canônica — sem dependência de banco de dados,
// ao contrário de hash-chain.test.ts (que exige Postgres local via Supabase).

function baseInteraction(citations: unknown): HashableInteraction {
  return {
    org_id: "00000000-0000-0000-0000-000000000001",
    seq: 1,
    user_id: "00000000-0000-0000-0000-000000000002",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    task_type: "pesquisa",
    risk_class: "baixo",
    prompt_masked: "test",
    response_masked: null,
    prompt_orig_hash: "abcd",
    response_orig_hash: null,
    decision: "allow",
    checklist_passed: true,
    citations,
    created_at: "2026-06-21T00:00:00.000Z",
    hash_schema_version: CURRENT_HASH_SCHEMA_VERSION,
  };
}

describe("hash.ts — serialização canônica (puro, sem DB)", () => {
  it("hash de 'citations' independe da ordem das chaves do jsonb aninhado", () => {
    const a = baseInteraction({ total: 2, by_status: { confirmada: 1, nao_localizada: 1 } });
    const b = baseInteraction({ by_status: { nao_localizada: 1, confirmada: 1 }, total: 2 });

    expect(computeRowHash(a, null).equals(computeRowHash(b, null))).toBe(true);
  });

  it("hash muda se o conteúdo de 'citations' realmente mudar", () => {
    const a = baseInteraction({ total: 2 });
    const b = baseInteraction({ total: 3 });

    expect(computeRowHash(a, null).equals(computeRowHash(b, null))).toBe(false);
  });

  it("ordena chaves recursivamente também em arrays de objetos", () => {
    const a = baseInteraction([{ b: 1, a: 2 }]);
    const b = baseInteraction([{ a: 2, b: 1 }]);

    expect(computeRowHash(a, null).equals(computeRowHash(b, null))).toBe(true);
  });
});
