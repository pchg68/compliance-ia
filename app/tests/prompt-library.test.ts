import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

let db: Client;
let orgId: string;
let userId: string;
let templateId: string;

beforeAll(async () => {
  db = new Client({ connectionString: DATABASE_URL });
  await db.connect();

  const org = await db.query(
    `INSERT INTO organization (name) VALUES ('Teste Prompts') RETURNING id`
  );
  orgId = org.rows[0].id;

  const user = await db.query(
    `INSERT INTO app_user (org_id, email, role) VALUES ($1, 'prompt@exemplo.com', 'admin') RETURNING id`,
    [orgId]
  );
  userId = user.rows[0].id;
});

afterAll(async () => {
  await db.query(`DELETE FROM prompt_template WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM app_user WHERE org_id = $1`, [orgId]);
  await db.query(`DELETE FROM organization WHERE id = $1`, [orgId]);
  await db.end();
});

describe("Biblioteca de prompts", () => {
  it("cria template com variáveis", async () => {
    const result = await db.query(
      `INSERT INTO prompt_template (org_id, title, category, task_type, risk_class, template_text, variables, approved_by)
       VALUES ($1, 'Petição Inicial', 'contencioso', 'peca', 'alto',
         'Elabore uma petição inicial de {{tipo_acao}} para o caso {{numero_processo}}.',
         $2, $3)
       RETURNING id, version`,
      [orgId, JSON.stringify([{ name: "tipo_acao" }, { name: "numero_processo" }]), userId]
    );
    templateId = result.rows[0].id;
    expect(result.rows[0].version).toBe(1);
  });

  it("lista templates ativos por organização", async () => {
    await db.query(
      `INSERT INTO prompt_template (org_id, title, category, task_type, risk_class, template_text)
       VALUES ($1, 'Parecer Genérico', 'consultivo', 'parecer', 'moderado', 'Elabore um parecer sobre {{tema}}.')`,
      [orgId]
    );

    const result = await db.query(
      `SELECT * FROM prompt_template WHERE org_id = $1 AND active = true ORDER BY category`,
      [orgId]
    );
    expect(result.rows.length).toBe(2);
  });

  it("filtra por categoria", async () => {
    const result = await db.query(
      `SELECT * FROM prompt_template WHERE org_id = $1 AND category = 'contencioso'`,
      [orgId]
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0].title).toBe("Petição Inicial");
  });

  it("renderiza template substituindo variáveis", async () => {
    const result = await db.query(
      `SELECT template_text FROM prompt_template WHERE id = $1`,
      [templateId]
    );
    let rendered = result.rows[0].template_text as string;
    rendered = rendered.replaceAll("{{tipo_acao}}", "cobrança");
    rendered = rendered.replaceAll("{{numero_processo}}", "0001234-56.2026.8.16.0001");

    expect(rendered).toBe(
      "Elabore uma petição inicial de cobrança para o caso 0001234-56.2026.8.16.0001."
    );
  });

  it("desativa template sem deletar", async () => {
    await db.query(
      `UPDATE prompt_template SET active = false WHERE id = $1`,
      [templateId]
    );
    const result = await db.query(
      `SELECT active FROM prompt_template WHERE id = $1`,
      [templateId]
    );
    expect(result.rows[0].active).toBe(false);

    const activeCount = await db.query(
      `SELECT COUNT(*)::int AS count FROM prompt_template WHERE org_id = $1 AND active = true`,
      [orgId]
    );
    expect(activeCount.rows[0].count).toBe(1);
  });

  it("carrega risk_class do template (pula reclassificação)", async () => {
    const result = await db.query(
      `SELECT task_type, risk_class FROM prompt_template WHERE id = $1`,
      [templateId]
    );
    expect(result.rows[0].task_type).toBe("peca");
    expect(result.rows[0].risk_class).toBe("alto");
  });
});
