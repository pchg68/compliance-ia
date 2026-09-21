import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import type { Context } from "../src/server/trpc/init";

const LOCAL_DB = {
  host: "127.0.0.1",
  port: 54322,
  user: "postgres",
  password: "postgres",
  database: "postgres",
};

let db: Client;

vi.mock("../src/lib/db", () => ({
  withOrgContext: async (_orgId: string, fn: (client: Client) => Promise<unknown>) => fn(db),
}));

const { interactionRouter } = await import("../src/server/routers/interaction");

let orgId: string;
let userId: string;
let policyId: string;

beforeAll(async () => {
  db = new Client(LOCAL_DB);
  await db.connect();

  const org = await db.query(
    `INSERT INTO organization (name) VALUES ('Teste Capture Interaction') RETURNING id`
  );
  orgId = org.rows[0].id;

  const user = await db.query(
    `INSERT INTO app_user (org_id, email, role) VALUES ($1, 'capture@exemplo.com', 'admin') RETURNING id`,
    [orgId]
  );
  userId = user.rows[0].id;

  const policy = await db.query(
    `INSERT INTO policy (org_id, version, rules, active)
     VALUES ($1, 1, $2::jsonb, true)
     RETURNING id`,
    [
      orgId,
      JSON.stringify({
        decision_table: [
          { when: {}, tier: "residual", decision: "allow", controls: ["registrar"] },
        ],
      }),
    ]
  );
  policyId = policy.rows[0].id;
});

afterAll(async () => {
  await db.query(`ALTER TABLE risk_assessment DISABLE TRIGGER no_mutation_risk_assessment`);
  await db.query(`DELETE FROM risk_assessment WHERE org_id = $1`, [orgId]);
  await db.query(`ALTER TABLE risk_assessment ENABLE TRIGGER no_mutation_risk_assessment`);

  await db.query(`ALTER TABLE ai_interaction DISABLE TRIGGER no_mutation_ai_interaction`);
  await db.query(`DELETE FROM ai_interaction WHERE org_id = $1`, [orgId]);
  await db.query(`ALTER TABLE ai_interaction ENABLE TRIGGER no_mutation_ai_interaction`);

  await db.query(`DELETE FROM policy WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM app_user WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM organization WHERE id = $1`, [orgId]);
  await db.end();
});

function caller() {
  return interactionRouter.createCaller({
    orgId,
    userId,
    authUserId: "00000000-0000-0000-0000-000000000001",
    role: "admin",
    email: "capture@exemplo.com",
  } satisfies Context);
}

describe("interaction.capture", () => {
  it("persiste hashes fornecidos pelo cliente e mantém a cadeia válida sem plaintext", async () => {
    const promptHash = "a".repeat(64);
    const responseHash = "b".repeat(64);

    const result = await caller().capture({
      provider: "anthropic",
      model: "claude-sonnet-5",
      task_type: "pesquisa",
      risk_class: "baixo",
      prompt_masked: "Prompt com [CPF] mascarado",
      response_masked: "Resposta com citação sem PII",
      prompt_orig_hash: promptHash,
      response_orig_hash: responseHash,
      policy_id: policyId,
      decision: "allow",
      pii_technique: { cpf: "regex" },
      checklist_passed: true,
      signals: {
        task_type: "pesquisa",
        data_sensitivity: [],
        legal_effect: false,
        autonomy: "com_revisao",
        provider_posture: "aprovado",
        client_constraints: [],
        injection_flags: [],
      },
      citations: null,
    });

    const stored = await db.query(
      `SELECT encode(prompt_orig_hash, 'hex') AS prompt_orig_hash,
              encode(response_orig_hash, 'hex') AS response_orig_hash
       FROM ai_interaction
       WHERE id = $1`,
      [result.id]
    );
    expect(stored.rows[0].prompt_orig_hash).toBe(promptHash);
    expect(stored.rows[0].response_orig_hash).toBe(responseHash);

    const assessments = await db.query(
      `SELECT decision, tier FROM risk_assessment WHERE interaction_id = $1 AND org_id = $2`,
      [result.id, orgId]
    );
    expect(assessments.rows).toHaveLength(1);
    expect(assessments.rows[0].decision).toBe("allow");
    expect(assessments.rows[0].tier).toBe("residual");

    const chain = await caller().verifyChain();
    expect(chain.valid).toBe(true);
    expect(chain.checked).toBeGreaterThan(0);
  });

  it("rejeita inconsistência entre assessment server-side e decisão enviada", async () => {
    await expect(
      caller().capture({
        provider: "anthropic",
        model: "claude-sonnet-5",
        task_type: "pesquisa",
        risk_class: "alto",
        prompt_masked: "Prompt mascarado",
        response_masked: null,
        prompt_orig_hash: "c".repeat(64),
        response_orig_hash: null,
        policy_id: policyId,
        decision: "require_approval",
        pii_technique: { cpf: "regex" },
        checklist_passed: false,
        signals: {
          task_type: "pesquisa",
          data_sensitivity: [],
          legal_effect: false,
          autonomy: "com_revisao",
          provider_posture: "aprovado",
          client_constraints: [],
          injection_flags: [],
        },
        citations: null,
      })
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
    });
  });
});
