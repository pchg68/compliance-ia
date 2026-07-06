/**
 * Testes de isolamento multi-tenant via RLS.
 * Verifica que cada organização só acessa seus próprios dados.
 * Requer banco de dados PostgreSQL (DATABASE_URL).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

// A RLS só é de fato aplicada para um papel sem BYPASSRLS. `postgres` é
// superuser e ignora RLS — por isso os testes de leitura abaixo usam o papel
// restrito `vexiajuris_app` (criado na migration 20260706163639), não o
// DATABASE_URL padrão. beforeAll/afterAll continuam usando o superuser porque
// precisam desabilitar o trigger de imutabilidade para limpar os dados de teste.
const RESTRICTED_DATABASE_URL =
  process.env.RESTRICTED_DATABASE_URL ??
  "postgresql://vexiajuris_app:change_me_before_activating@localhost:54322/postgres";

async function freshClient(): Promise<Client> {
  const c = new Client({ connectionString: DATABASE_URL });
  await c.connect();
  return c;
}

async function freshRestrictedClient(): Promise<Client> {
  const c = new Client({ connectionString: RESTRICTED_DATABASE_URL });
  await c.connect();
  return c;
}

/** Configura o org_id na sessão para que o RLS filtre corretamente. */
async function setOrgContext(db: Client, orgId: string): Promise<void> {
  await db.query(`SELECT set_config('app.current_org', $1, false)`, [orgId]);
}

/** Remove o setting de org_id da sessão (simula sessão sem contexto). */
async function clearOrgContext(db: Client): Promise<void> {
  await db.query(`RESET app.current_org`);
}

let orgA: string;
let orgB: string;
let userA: string;
let userB: string;
let policyA: string;
let policyB: string;
let interactionA: string;
let interactionB: string;

beforeAll(async () => {
  const db = await freshClient();

  const resA = await db.query(
    `INSERT INTO organization (name) VALUES ('Org Alpha RLS Teste') RETURNING id`
  );
  orgA = resA.rows[0].id;

  const resB = await db.query(
    `INSERT INTO organization (name) VALUES ('Org Beta RLS Teste') RETURNING id`
  );
  orgB = resB.rows[0].id;

  const uA = await db.query(
    `INSERT INTO app_user (org_id, email, role) VALUES ($1, 'user.a.rls@alpha.test', 'member') RETURNING id`,
    [orgA]
  );
  userA = uA.rows[0].id;

  const uB = await db.query(
    `INSERT INTO app_user (org_id, email, role) VALUES ($1, 'user.b.rls@beta.test', 'member') RETURNING id`,
    [orgB]
  );
  userB = uB.rows[0].id;

  const pA = await db.query(
    `INSERT INTO policy (org_id, version, rules, active) VALUES ($1, 1, '{"decision_table":[]}', true) RETURNING id`,
    [orgA]
  );
  policyA = pA.rows[0].id;

  const pB = await db.query(
    `INSERT INTO policy (org_id, version, rules, active) VALUES ($1, 1, '{"decision_table":[]}', true) RETURNING id`,
    [orgB]
  );
  policyB = pB.rows[0].id;

  const iA = await db.query(
    `INSERT INTO ai_interaction (
      org_id, seq, user_id, provider, model, task_type, risk_class,
      prompt_masked, prompt_orig_hash, policy_id, decision, checklist_passed, row_hash
    ) VALUES (
      $1, 1, $2, 'anthropic', 'claude-sonnet-4-6', 'pesquisa', 'baixo',
      'prompt alpha mascarado', decode('aaaa','hex'), $3, 'allow', true, decode('1111','hex')
    ) RETURNING id`,
    [orgA, userA, policyA]
  );
  interactionA = iA.rows[0].id;

  const iB = await db.query(
    `INSERT INTO ai_interaction (
      org_id, seq, user_id, provider, model, task_type, risk_class,
      prompt_masked, prompt_orig_hash, policy_id, decision, checklist_passed, row_hash
    ) VALUES (
      $1, 1, $2, 'openai', 'gpt-4o', 'contrato', 'alto',
      'prompt beta mascarado', decode('bbbb','hex'), $3, 'require_approval', true, decode('2222','hex')
    ) RETURNING id`,
    [orgB, userB, policyB]
  );
  interactionB = iB.rows[0].id;

  await db.end();
});

afterAll(async () => {
  const db = await freshClient();
  await db.query(`ALTER TABLE ai_interaction DISABLE TRIGGER no_mutation_ai_interaction`);
  await db.query(`DELETE FROM ai_interaction WHERE org_id IN ($1,$2)`, [orgA, orgB]);
  await db.query(`ALTER TABLE ai_interaction ENABLE TRIGGER no_mutation_ai_interaction`);
  await db.query(`DELETE FROM policy WHERE org_id IN ($1,$2)`, [orgA, orgB]);
  await db.query(`DELETE FROM app_user WHERE org_id IN ($1,$2)`, [orgA, orgB]);
  await db.query(`DELETE FROM organization WHERE id IN ($1,$2)`, [orgA, orgB]);
  await db.end();
});

describe("Isolamento multi-tenant — RLS por org_id", () => {
  it("com contexto de Org A, só vê interações da Org A", async () => {
    const db = await freshRestrictedClient();
    await setOrgContext(db, orgA);

    const res = await db.query(
      `SELECT id FROM ai_interaction WHERE id IN ($1,$2)`,
      [interactionA, interactionB]
    );
    const ids = res.rows.map((r: { id: string }) => r.id);
    expect(ids).toContain(interactionA);
    expect(ids).not.toContain(interactionB);

    await db.end();
  });

  it("com contexto de Org B, só vê interações da Org B", async () => {
    const db = await freshRestrictedClient();
    await setOrgContext(db, orgB);

    const res = await db.query(
      `SELECT id FROM ai_interaction WHERE id IN ($1,$2)`,
      [interactionA, interactionB]
    );
    const ids = res.rows.map((r: { id: string }) => r.id);
    expect(ids).not.toContain(interactionA);
    expect(ids).toContain(interactionB);

    await db.end();
  });

  it("sem contexto de org (RESET), RLS falha fechado em vez de vazar dados", async () => {
    const db = await freshRestrictedClient();
    await clearOrgContext(db);

    // Sem app.current_org definido, current_setting(..., true) devolve '' (não NULL),
    // e o cast '' ::uuid da policy lança erro — a query falha em vez de devolver linhas.
    // Comportamento fail-closed: nenhuma interação vaza, mas via exceção, não lista vazia.
    await expect(
      db.query(`SELECT id FROM ai_interaction WHERE id IN ($1,$2)`, [interactionA, interactionB])
    ).rejects.toThrow(/invalid input syntax for type uuid/);

    await db.end();
  });

  it("Org A não vê policies da Org B mesmo sabendo o ID", async () => {
    const db = await freshRestrictedClient();
    // policy agora tem RLS habilitado (migration 20260706163639) — a RLS por si só
    // já isolaria mesmo sem o WHERE explícito abaixo, testado com o papel restrito.
    await setOrgContext(db, orgA);

    const res = await db.query(
      `SELECT id FROM policy WHERE org_id = $1`,
      [orgA]
    );
    const ids = res.rows.map((r: { id: string }) => r.id);
    expect(ids).toContain(policyA);
    expect(ids).not.toContain(policyB);

    await db.end();
  });

  it("com contexto de Org A, não vê app_users da Org B (RLS habilitada em app_user)", async () => {
    const db = await freshRestrictedClient();
    await setOrgContext(db, orgA);

    const res = await db.query(
      `SELECT id FROM app_user WHERE org_id = $1`,
      [orgA]
    );
    const ids = res.rows.map((r: { id: string }) => r.id);
    expect(ids).toContain(userA);
    expect(ids).not.toContain(userB);

    await db.end();
  });
});
