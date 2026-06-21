import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { evaluateAlerts } from "../src/lib/alert-rules";
import type { RiskSignals } from "../src/lib/risk-engine";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

describe("Regras de alerta", () => {
  const baseSignals: RiskSignals = {
    task_type: "pesquisa",
    data_sensitivity: [],
    legal_effect: false,
    autonomy: "com_revisao",
    provider_posture: "aprovado",
    client_constraints: [],
    injection_flags: [],
  };

  it("não gera alertas para cenário de baixo risco", () => {
    const alerts = evaluateAlerts(baseSignals, "allow", 0);
    expect(alerts).toHaveLength(0);
  });

  it("gera alerta crítico para bloqueio", () => {
    const alerts = evaluateAlerts(baseSignals, "block", 0);
    expect(alerts.some((a) => a.severity === "critical" && a.category === "bloqueio")).toBe(true);
  });

  it("gera alerta crítico para segredo de justiça", () => {
    const signals: RiskSignals = { ...baseSignals, data_sensitivity: ["segredo_justica"] };
    const alerts = evaluateAlerts(signals, "allow", 0);
    expect(alerts.some((a) => a.severity === "critical" && a.category === "sigilo")).toBe(true);
  });

  it("gera alerta high para provedor não aprovado", () => {
    const signals: RiskSignals = { ...baseSignals, provider_posture: "nao_aprovado" };
    const alerts = evaluateAlerts(signals, "allow", 0);
    expect(alerts.some((a) => a.severity === "high" && a.category === "provedor")).toBe(true);
  });

  it("gera alerta high para efeito jurídico sem revisão", () => {
    const signals: RiskSignals = { ...baseSignals, legal_effect: true, autonomy: "sem_revisao" };
    const alerts = evaluateAlerts(signals, "allow", 0);
    expect(alerts.some((a) => a.severity === "high" && a.category === "supervisao")).toBe(true);
  });

  it("gera alerta high para prompt injection", () => {
    const signals: RiskSignals = { ...baseSignals, injection_flags: ["ignore_instructions"] };
    const alerts = evaluateAlerts(signals, "allow", 0);
    expect(alerts.some((a) => a.severity === "high" && a.category === "seguranca")).toBe(true);
  });

  it("gera alerta medium para volume alto de PII", () => {
    const alerts = evaluateAlerts(baseSignals, "allow", 15);
    expect(alerts.some((a) => a.severity === "medium" && a.category === "pii")).toBe(true);
  });

  it("gera alerta crítico para cláusula contratual proibindo IA", () => {
    const signals: RiskSignals = { ...baseSignals, client_constraints: ["proibe_ia"] };
    const alerts = evaluateAlerts(signals, "allow", 0);
    expect(alerts.some((a) => a.severity === "critical" && a.category === "contratual")).toBe(true);
  });
});

describe("Alertas — persistência", () => {
  let db: Client;
  let orgId: string;
  let alertId: string;
  let userId: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
    const org = await db.query(`INSERT INTO organization (name) VALUES ('Teste Alertas') RETURNING id`);
    orgId = org.rows[0].id;
    const user = await db.query(
      `INSERT INTO app_user (org_id, email, role) VALUES ($1, 'alert@test.com', 'compliance') RETURNING id`,
      [orgId]
    );
    userId = user.rows[0].id;
  });

  afterAll(async () => {
    await db.end();
    const cleanup = new Client({ connectionString: DATABASE_URL });
    await cleanup.connect();
    await cleanup.query(`ALTER TABLE alert DISABLE TRIGGER no_delete_alert`);
    await cleanup.query(`DELETE FROM alert WHERE org_id = $1`, [orgId]);
    await cleanup.query(`ALTER TABLE alert ENABLE TRIGGER no_delete_alert`);
    await cleanup.query(`DELETE FROM app_user WHERE org_id = $1`, [orgId]);
    await cleanup.query(`DELETE FROM organization WHERE id = $1`, [orgId]);
    await cleanup.end();
  });

  it("insere alerta", async () => {
    const result = await db.query(
      `INSERT INTO alert (org_id, severity, category, title, description)
       VALUES ($1, 'critical', 'bloqueio', 'Teste', 'Descrição do alerta')
       RETURNING id`,
      [orgId]
    );
    alertId = result.rows[0].id;
    expect(alertId).toBeTruthy();
  });

  it("resolve alerta (update de status permitido)", async () => {
    await db.query(
      `UPDATE alert SET status = 'resolved', resolved_by = $1, resolved_at = now() WHERE id = $2`,
      [userId, alertId]
    );
    const result = await db.query(`SELECT status FROM alert WHERE id = $1`, [alertId]);
    expect(result.rows[0].status).toBe("resolved");
  });

  it("DELETE em alerta é bloqueado pelo trigger", async () => {
    const c = new Client({ connectionString: DATABASE_URL });
    await c.connect();
    await expect(
      c.query(`DELETE FROM alert WHERE id = $1`, [alertId])
    ).rejects.toThrow(/registro imutável/);
    await c.end();
  });
});
