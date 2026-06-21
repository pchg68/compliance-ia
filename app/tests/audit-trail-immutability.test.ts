import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

let db: Client;
let orgId: string;
let userId: string;
let policyId: string;
let interactionId: string;

beforeAll(async () => {
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const org = await db.query(
    `INSERT INTO organization (name) VALUES ('Teste Imutabilidade') RETURNING id`
  );
  orgId = org.rows[0].id;

  const user = await db.query(
    `INSERT INTO app_user (org_id, email, role) VALUES ($1, 'teste@exemplo.com', 'admin') RETURNING id`,
    [orgId]
  );
  userId = user.rows[0].id;

  const policy = await db.query(
    `INSERT INTO policy (org_id, version, rules, active) VALUES ($1, 1, '{"decision_table":[]}', true) RETURNING id`,
    [orgId]
  );
  policyId = policy.rows[0].id;

  const interaction = await db.query(
    `INSERT INTO ai_interaction (
      org_id, seq, user_id, provider, model, task_type, risk_class,
      prompt_masked, prompt_orig_hash, policy_id, decision, checklist_passed, row_hash
    ) VALUES (
      $1, 1, $2, 'anthropic', 'claude-sonnet-4-6', 'pesquisa', 'baixo',
      'prompt mascarado de teste', decode('abcd','hex'), $3, 'allow', true, decode('1234','hex')
    ) RETURNING id`,
    [orgId, userId, policyId]
  );
  interactionId = interaction.rows[0].id;
});

afterAll(async () => {
  // Cleanup: desabilitar triggers temporariamente para limpar dados de teste
  await db.query(`ALTER TABLE ai_interaction DISABLE TRIGGER no_mutation_ai_interaction`);
  await db.query(`ALTER TABLE token_map DISABLE TRIGGER no_mutation_token_map`);
  await db.query(`ALTER TABLE audit_anchor DISABLE TRIGGER no_mutation_audit_anchor`);
  await db.query(`DELETE FROM token_map WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM audit_anchor WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM ai_interaction WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM policy WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM app_user WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM organization WHERE id = $1`, [orgId]);
  await db.query(`ALTER TABLE ai_interaction ENABLE TRIGGER no_mutation_ai_interaction`);
  await db.query(`ALTER TABLE token_map ENABLE TRIGGER no_mutation_token_map`);
  await db.query(`ALTER TABLE audit_anchor ENABLE TRIGGER no_mutation_audit_anchor`);
  await db.end();
});

describe("Trilha de auditoria — imutabilidade", () => {
  it("INSERT em ai_interaction funciona", async () => {
    const res = await db.query(
      `SELECT id FROM ai_interaction WHERE id = $1`,
      [interactionId]
    );
    expect(res.rows).toHaveLength(1);
  });

  it("UPDATE em ai_interaction é bloqueado pelo trigger", async () => {
    await expect(
      db.query(`UPDATE ai_interaction SET prompt_masked = 'adulterado' WHERE id = $1`, [
        interactionId,
      ])
    ).rejects.toThrow(/registro imutável/);
  });

  it("DELETE em ai_interaction é bloqueado pelo trigger", async () => {
    await expect(
      db.query(`DELETE FROM ai_interaction WHERE id = $1`, [interactionId])
    ).rejects.toThrow(/registro imutável/);
  });

  it("UPDATE em token_map é bloqueado pelo trigger", async () => {
    await db.query(
      `INSERT INTO token_map (interaction_id, org_id, ciphertext, wrapped_data_key)
       VALUES ($1, $2, decode('aabb','hex'), decode('ccdd','hex'))`,
      [interactionId, orgId]
    );

    await expect(
      db.query(`UPDATE token_map SET ciphertext = decode('ffff','hex') WHERE interaction_id = $1`, [
        interactionId,
      ])
    ).rejects.toThrow(/registro imutável/);
  });

  it("DELETE em token_map é bloqueado pelo trigger", async () => {
    await expect(
      db.query(`DELETE FROM token_map WHERE interaction_id = $1`, [interactionId])
    ).rejects.toThrow(/registro imutável/);
  });

  it("UPDATE em audit_anchor é bloqueado pelo trigger", async () => {
    await db.query(
      `INSERT INTO audit_anchor (org_id, epoch_from_seq, epoch_to_seq, merkle_root, tsa_token)
       VALUES ($1, 1, 1, decode('aabb','hex'), decode('ccdd','hex'))`,
      [orgId]
    );

    await expect(
      db.query(`UPDATE audit_anchor SET merkle_root = decode('ffff','hex') WHERE org_id = $1`, [
        orgId,
      ])
    ).rejects.toThrow(/registro imutável/);
  });

  it("DELETE em audit_anchor é bloqueado pelo trigger", async () => {
    await expect(
      db.query(`DELETE FROM audit_anchor WHERE org_id = $1`, [orgId])
    ).rejects.toThrow(/registro imutável/);
  });
});
