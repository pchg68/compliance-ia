import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

let db: Client;
let orgId: string;

beforeAll(async () => {
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const org = await db.query(
    `INSERT INTO organization (name) VALUES ('Teste Relatório') RETURNING id`
  );
  orgId = org.rows[0].id;

  const user = await db.query(
    `INSERT INTO app_user (org_id, email, role) VALUES ($1, 'rel@exemplo.com', 'admin') RETURNING id`,
    [orgId]
  );
  const userId = user.rows[0].id;

  const policy = await db.query(
    `INSERT INTO policy (org_id, version, rules, active) VALUES ($1, 1, '{}', true) RETURNING id`,
    [orgId]
  );
  const policyId = policy.rows[0].id;

  // Insert 3 interactions with different risk/decision
  const interactions = [
    { seq: 1, risk: "baixo", decision: "allow", task: "pesquisa", passed: true },
    { seq: 2, risk: "alto", decision: "require_approval", task: "peca", passed: true },
    { seq: 3, risk: "moderado", decision: "allow_with_masking", task: "contrato", passed: false },
  ];

  for (const i of interactions) {
    await db.query(
      `INSERT INTO ai_interaction (
        org_id, seq, user_id, provider, model, task_type, risk_class,
        prompt_masked, prompt_orig_hash, policy_id, decision, checklist_passed, row_hash
      ) VALUES ($1, $2, $3, 'anthropic', 'claude-sonnet-4-6', $4, $5, 'masked', decode('ab','hex'), $6, $7, $8, decode('cd','hex'))`,
      [orgId, i.seq, userId, i.task, i.risk, policyId, i.decision, i.passed]
    );
  }
});

afterAll(async () => {
  await db.end();
  const cleanup = new Client({ connectionString: DATABASE_URL });
  await cleanup.connect();
  await cleanup.query(`ALTER TABLE ai_interaction DISABLE TRIGGER no_mutation_ai_interaction`);
  await cleanup.query(`DELETE FROM ai_interaction WHERE org_id = $1`, [orgId]);
  await cleanup.query(`ALTER TABLE ai_interaction ENABLE TRIGGER no_mutation_ai_interaction`);
  await cleanup.query(`DELETE FROM policy WHERE org_id = $1`, [orgId]);
  await cleanup.query(`DELETE FROM app_user WHERE org_id = $1`, [orgId]);
  await cleanup.query(`DELETE FROM organization WHERE id = $1`, [orgId]);
  await cleanup.end();
});

describe("Relatório de conformidade", () => {
  it("agrega corretamente o total de interações", async () => {
    const result = await db.query(
      `SELECT COUNT(*)::int AS total FROM ai_interaction WHERE org_id = $1`,
      [orgId]
    );
    expect(result.rows[0].total).toBe(3);
  });

  it("conta checklist_passed e failed", async () => {
    const result = await db.query(
      `SELECT
         COUNT(*) FILTER (WHERE checklist_passed = true)::int AS passed,
         COUNT(*) FILTER (WHERE checklist_passed = false)::int AS failed
       FROM ai_interaction WHERE org_id = $1`,
      [orgId]
    );
    expect(result.rows[0].passed).toBe(2);
    expect(result.rows[0].failed).toBe(1);
  });

  it("agrupa por risk_class", async () => {
    const result = await db.query(
      `SELECT risk_class, COUNT(*)::int AS count
       FROM ai_interaction WHERE org_id = $1
       GROUP BY risk_class ORDER BY risk_class`,
      [orgId]
    );
    expect(result.rows).toHaveLength(3);
    const risks = result.rows.map((r: { risk_class: string }) => r.risk_class);
    expect(risks).toContain("baixo");
    expect(risks).toContain("alto");
    expect(risks).toContain("moderado");
  });

  it("agrupa por task_type", async () => {
    const result = await db.query(
      `SELECT task_type, COUNT(*)::int AS count
       FROM ai_interaction WHERE org_id = $1
       GROUP BY task_type ORDER BY task_type`,
      [orgId]
    );
    expect(result.rows).toHaveLength(3);
  });
});
