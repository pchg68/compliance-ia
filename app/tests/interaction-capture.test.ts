import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Client } from "pg";
import type { Context } from "../src/server/trpc/init";

const ADMIN_DB = {
  host: "127.0.0.1",
  port: 54322,
  user: "postgres",
  password: "postgres",
  database: "postgres",
};
const RESTRICTED_DB = {
  host: "127.0.0.1",
  port: 54322,
  user: "vexiajuris_app",
  password: "change_me_before_activating",
  database: "postgres",
};

let db: Client;
let restrictedDb: Client;

vi.mock("../src/lib/db", () => ({
  withOrgContext: async (orgId: string, fn: (client: Client) => Promise<unknown>) => {
    await restrictedDb.query("BEGIN");
    try {
      await restrictedDb.query(`SELECT set_config('app.current_org', $1, true)`, [orgId]);
      const result = await fn(restrictedDb);
      await restrictedDb.query("COMMIT");
      return result;
    } catch (error) {
      await restrictedDb.query("ROLLBACK");
      throw error;
    }
  },
}));

const { interactionRouter } = await import("../src/server/routers/interaction");

let orgId: string;
let userId: string;
let policyId: string;
let userEmail: string;

beforeAll(async () => {
  db = new Client(ADMIN_DB);
  await db.connect();
  restrictedDb = new Client(RESTRICTED_DB);
  await restrictedDb.connect();

  const suffix = crypto.randomUUID().slice(0, 8);
  const org = await db.query(
    `INSERT INTO organization (name) VALUES ($1) RETURNING id`,
    [`Teste Capture Interaction ${suffix}`]
  );
  orgId = org.rows[0].id;

  const user = await db.query(
    `INSERT INTO app_user (org_id, email, role) VALUES ($1, $2, 'admin') RETURNING id`,
    [orgId, `capture-${suffix}@exemplo.com`]
  );
  userId = user.rows[0].id;
  userEmail = `capture-${suffix}@exemplo.com`;

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
  await restrictedDb.end();
  await db.end();
});

function caller() {
  return interactionRouter.createCaller({
    orgId,
    userId,
    authUserId: "00000000-0000-0000-0000-000000000001",
    role: "admin",
    email: userEmail,
  } satisfies Context);
}

async function queryAsOrg(sql: string, values: unknown[] = []) {
  await restrictedDb.query("BEGIN");
  try {
    await restrictedDb.query(`SELECT set_config('app.current_org', $1, true)`, [orgId]);
    const result = await restrictedDb.query(sql, values);
    await restrictedDb.query("COMMIT");
    return result;
  } catch (error) {
    await restrictedDb.query("ROLLBACK");
    throw error;
  }
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

    const stored = await queryAsOrg(
      `SELECT encode(prompt_orig_hash, 'hex') AS prompt_orig_hash,
              encode(response_orig_hash, 'hex') AS response_orig_hash
       FROM ai_interaction
       WHERE id = $1`,
      [result.id]
    );
    expect(stored.rows[0].prompt_orig_hash).toBe(promptHash);
    expect(stored.rows[0].response_orig_hash).toBe(responseHash);

    const assessments = await queryAsOrg(
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
