import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import {
  computeRowHash,
  computeContentHash,
  CURRENT_HASH_SCHEMA_VERSION,
  type HashableInteraction,
} from "../src/lib/hash";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

let db: Client;
let orgId: string;
let userId: string;
let policyId: string;

beforeAll(async () => {
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const org = await db.query(
    `INSERT INTO organization (name) VALUES ('Teste Cadeia Hash') RETURNING id`
  );
  orgId = org.rows[0].id;

  const user = await db.query(
    `INSERT INTO app_user (org_id, email, role) VALUES ($1, 'hash@exemplo.com', 'admin') RETURNING id`,
    [orgId]
  );
  userId = user.rows[0].id;

  const policy = await db.query(
    `INSERT INTO policy (org_id, version, rules, active) VALUES ($1, 1, '{"decision_table":[]}', true) RETURNING id`,
    [orgId]
  );
  policyId = policy.rows[0].id;
});

afterAll(async () => {
  await db.query(`ALTER TABLE ai_interaction DISABLE TRIGGER no_mutation_ai_interaction`);
  await db.query(`DELETE FROM ai_interaction WHERE org_id = $1`, [orgId]);
  await db.query(`ALTER TABLE ai_interaction ENABLE TRIGGER no_mutation_ai_interaction`);
  await db.query(`DELETE FROM policy WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM app_user WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM organization WHERE id = $1`, [orgId]);
  await db.end();
});

async function insertInteraction(seq: number, prevHash: Buffer | null) {
  const now = new Date().toISOString();
  const promptOrigHash = computeContentHash("prompt original " + seq, orgId);

  const hashable: HashableInteraction = {
    org_id: orgId,
    seq,
    user_id: userId,
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    task_type: "pesquisa",
    risk_class: "baixo",
    prompt_masked: `prompt mascarado ${seq}`,
    response_masked: `resposta mascarada ${seq}`,
    prompt_orig_hash: promptOrigHash.toString("hex"),
    response_orig_hash: null,
    decision: "allow",
    checklist_passed: true,
    citations: null,
    created_at: now,
    hash_schema_version: CURRENT_HASH_SCHEMA_VERSION,
  };

  const rowHash = computeRowHash(hashable, prevHash);

  const result = await db.query(
    `INSERT INTO ai_interaction (
      org_id, seq, user_id, provider, model, task_type, risk_class,
      prompt_masked, response_masked, prompt_orig_hash, response_orig_hash,
      policy_id, decision, checklist_passed, prev_hash, row_hash, created_at, hash_schema_version
    ) VALUES (
      $1, $2, $3, 'anthropic', 'claude-sonnet-4-6', 'pesquisa', 'baixo',
      $4, $5, $6, NULL,
      $7, 'allow', true, $8, $9, $10, $11
    ) RETURNING id`,
    [
      orgId, seq, userId,
      hashable.prompt_masked, hashable.response_masked,
      promptOrigHash, policyId,
      prevHash, rowHash, now, CURRENT_HASH_SCHEMA_VERSION,
    ]
  );

  return { id: result.rows[0].id, rowHash };
}

describe("Cadeia de hash — integridade", () => {
  it("constrói cadeia de 3 registros com hashes encadeados", async () => {
    const r1 = await insertInteraction(1, null);
    const r2 = await insertInteraction(2, r1.rowHash);
    const r3 = await insertInteraction(3, r2.rowHash);

    expect(r1.rowHash).toBeInstanceOf(Buffer);
    expect(r2.rowHash).toBeInstanceOf(Buffer);
    expect(r3.rowHash).toBeInstanceOf(Buffer);

    // Hashes são únicos
    expect(r1.rowHash.equals(r2.rowHash)).toBe(false);
    expect(r2.rowHash.equals(r3.rowHash)).toBe(false);
  });

  it("verificação detecta cadeia íntegra", async () => {
    const rows = await db.query(
      `SELECT seq, org_id, user_id, provider, model, task_type, risk_class,
              prompt_masked, response_masked,
              encode(prompt_orig_hash, 'hex') as prompt_orig_hash,
              encode(response_orig_hash, 'hex') as response_orig_hash,
              decision, checklist_passed, citations, created_at,
              prev_hash, row_hash, hash_schema_version
       FROM ai_interaction WHERE org_id = $1 ORDER BY seq ASC`,
      [orgId]
    );

    for (let i = 0; i < rows.rows.length; i++) {
      const row = rows.rows[i];
      const prevHash: Buffer | null = i > 0 ? rows.rows[i - 1].row_hash : null;

      const hashable: HashableInteraction = {
        org_id: row.org_id,
        seq: Number(row.seq),
        user_id: row.user_id,
        provider: row.provider,
        model: row.model,
        task_type: row.task_type,
        risk_class: row.risk_class,
        prompt_masked: row.prompt_masked,
        response_masked: row.response_masked,
        prompt_orig_hash: row.prompt_orig_hash,
        response_orig_hash: row.response_orig_hash,
        decision: row.decision,
        checklist_passed: row.checklist_passed,
        citations: row.citations,
        created_at: row.created_at instanceof Date
          ? row.created_at.toISOString()
          : row.created_at,
        hash_schema_version: row.hash_schema_version,
      };

      const expected = computeRowHash(hashable, prevHash);
      expect(expected.equals(row.row_hash)).toBe(true);
    }
  });

  it("serialização canônica é determinística", () => {
    const data: HashableInteraction = {
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
      citations: null,
      created_at: "2026-06-21T00:00:00.000Z",
      hash_schema_version: CURRENT_HASH_SCHEMA_VERSION,
    };

    const hash1 = computeRowHash(data, null);
    const hash2 = computeRowHash(data, null);
    expect(hash1.equals(hash2)).toBe(true);
  });

  it("alterar qualquer campo muda o hash", () => {
    const base: HashableInteraction = {
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
      citations: null,
      created_at: "2026-06-21T00:00:00.000Z",
      hash_schema_version: CURRENT_HASH_SCHEMA_VERSION,
    };

    const original = computeRowHash(base, null);
    const tampered = computeRowHash({ ...base, prompt_masked: "adulterado" }, null);
    expect(original.equals(tampered)).toBe(false);
  });
});

// Ver também tests/hash-canonical.test.ts para testes puros de canonicalização
// (determinismo de 'citations' jsonb aninhado) que não exigem banco de dados.
