import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "pg";
import { getJurisdiction, listJurisdictions, JURISDICTION_BR, JURISDICTION_EU } from "../src/lib/jurisdiction";
import { classifyRisk, type RiskSignals } from "../src/lib/risk-engine";

const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:54322/postgres";

describe("Multi-jurisdição — profiles", () => {
  it("lista jurisdições disponíveis (BR e EU)", () => {
    const list = listJurisdictions();
    expect(list.length).toBe(2);
    expect(list.map((j) => j.code)).toContain("BR");
    expect(list.map((j) => j.code)).toContain("EU");
  });

  it("retorna profile BR com locale pt-BR", () => {
    const br = getJurisdiction("BR");
    expect(br.locale).toBe("pt-BR");
    expect(br.risk_levels.map((r) => r.key)).toContain("vedado");
  });

  it("retorna profile EU com locale en", () => {
    const eu = getJurisdiction("EU");
    expect(eu.locale).toBe("en");
    expect(eu.risk_levels.map((r) => r.key)).toContain("unacceptable");
  });

  it("lança erro para jurisdição desconhecida", () => {
    expect(() => getJurisdiction("XX")).toThrow(/não suportada/);
  });
});

describe("Multi-jurisdição — decision tables", () => {
  const baseSignals: RiskSignals = {
    task_type: "pesquisa",
    data_sensitivity: [],
    legal_effect: false,
    autonomy: "com_revisao",
    provider_posture: "aprovado",
    client_constraints: [],
    injection_flags: [],
  };

  it("BR: pesquisa genérica → residual", () => {
    const result = classifyRisk(baseSignals, JURISDICTION_BR.decision_table);
    expect(result.tier).toBe("residual");
    expect(result.decision).toBe("allow");
  });

  it("EU: pesquisa genérica → residual", () => {
    const result = classifyRisk(baseSignals, JURISDICTION_EU.decision_table);
    expect(result.tier).toBe("residual");
    expect(result.decision).toBe("allow");
  });

  it("BR: peça com efeito jurídico → alto/require_approval", () => {
    const signals: RiskSignals = { ...baseSignals, task_type: "peca", legal_effect: true };
    const result = classifyRisk(signals, JURISDICTION_BR.decision_table);
    expect(result.tier).toBe("alto");
    expect(result.controls).toContain("supervisao_socio");
  });

  it("EU: efeito jurídico → alto/require_approval com DPIA", () => {
    const signals: RiskSignals = { ...baseSignals, legal_effect: true };
    const result = classifyRisk(signals, JURISDICTION_EU.decision_table);
    expect(result.tier).toBe("alto");
    expect(result.controls).toContain("dpia_required");
    expect(result.controls).toContain("human_oversight");
  });

  it("EU: special category GDPR com provedor não aprovado → block", () => {
    const signals: RiskSignals = {
      ...baseSignals,
      data_sensitivity: ["special_category_gdpr"],
      provider_posture: "nao_aprovado",
    };
    const result = classifyRisk(signals, JURISDICTION_EU.decision_table);
    expect(result.tier).toBe("vedado");
    expect(result.decision).toBe("block");
  });

  it("EU: dados pessoais → moderado/masking com transparency_notice", () => {
    const signals: RiskSignals = { ...baseSignals, data_sensitivity: ["personal_data"] };
    const result = classifyRisk(signals, JURISDICTION_EU.decision_table);
    expect(result.tier).toBe("moderado");
    expect(result.controls).toContain("transparency_notice");
  });
});

describe("Multi-jurisdição — checklists", () => {
  it("BR alto: 7 itens, 4 eixos OAB", () => {
    expect(JURISDICTION_BR.checklist_alto.length).toBe(7);
    const eixos = new Set(JURISDICTION_BR.checklist_alto.map((i) => i.eixo));
    expect(eixos.size).toBe(4);
  });

  it("EU alto: 9 itens incluindo DPIA e AI Act", () => {
    expect(JURISDICTION_EU.checklist_alto.length).toBe(9);
    expect(JURISDICTION_EU.checklist_alto.some((i) => i.pergunta.includes("DPIA"))).toBe(true);
    expect(JURISDICTION_EU.checklist_alto.some((i) => i.pergunta.includes("AI Act"))).toBe(true);
  });

  it("EU moderado: inclui transparência de IA", () => {
    expect(JURISDICTION_EU.checklist_moderado.some((i) =>
      i.pergunta.includes("interacting with AI")
    )).toBe(true);
  });

  it("BR e EU têm referências regulatórias distintas", () => {
    expect(JURISDICTION_BR.regulatory_refs.some((r) => r.includes("OAB"))).toBe(true);
    expect(JURISDICTION_EU.regulatory_refs.some((r) => r.includes("GDPR"))).toBe(true);
    expect(JURISDICTION_EU.regulatory_refs.some((r) => r.includes("AI Act"))).toBe(true);
  });
});

describe("Multi-jurisdição — persistência", () => {
  let db: Client;
  let orgId: string;

  beforeAll(async () => {
    db = new Client({ connectionString: DATABASE_URL });
    await db.connect();
    const org = await db.query(
      `INSERT INTO organization (name) VALUES ('Teste Jurisdição') RETURNING id`
    );
    orgId = org.rows[0].id;
  });

  afterAll(async () => {
    await db.query(`DELETE FROM jurisdiction_config WHERE org_id = $1`, [orgId]);
    await db.query(`DELETE FROM policy WHERE org_id = $1`, [orgId]);
    await db.query(`DELETE FROM organization WHERE id = $1`, [orgId]);
    await db.end();
  });

  it("configura jurisdição BR na organização", async () => {
    const profile = getJurisdiction("BR");
    await db.query(
      `INSERT INTO jurisdiction_config (org_id, jurisdiction, label, locale, regulatory_refs, risk_levels, active)
       VALUES ($1, $2, $3, $4, $5, $6, true)`,
      [orgId, profile.code, profile.label, profile.locale,
       JSON.stringify(profile.regulatory_refs), JSON.stringify(profile.risk_levels)]
    );

    const result = await db.query(
      `SELECT * FROM jurisdiction_config WHERE org_id = $1 AND jurisdiction = 'BR'`,
      [orgId]
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].locale).toBe("pt-BR");
  });

  it("configura jurisdição EU na mesma organização", async () => {
    const profile = getJurisdiction("EU");
    await db.query(
      `INSERT INTO jurisdiction_config (org_id, jurisdiction, label, locale, regulatory_refs, risk_levels, active)
       VALUES ($1, $2, $3, $4, $5, $6, false)`,
      [orgId, profile.code, profile.label, profile.locale,
       JSON.stringify(profile.regulatory_refs), JSON.stringify(profile.risk_levels)]
    );

    const result = await db.query(
      `SELECT COUNT(*)::int AS count FROM jurisdiction_config WHERE org_id = $1`,
      [orgId]
    );
    expect(result.rows[0].count).toBe(2);
  });

  it("i18n: carrega mensagens pt-BR", async () => {
    const result = await db.query(
      `SELECT message_key, message_text FROM i18n_message WHERE locale = 'pt-BR'`
    );
    expect(result.rows.length).toBeGreaterThan(0);
    const keys = result.rows.map((r: { message_key: string }) => r.message_key);
    expect(keys).toContain("risk.vedado");
    expect(keys).toContain("decision.block");
  });

  it("i18n: carrega mensagens en", async () => {
    const result = await db.query(
      `SELECT message_key, message_text FROM i18n_message WHERE locale = 'en'`
    );
    expect(result.rows.length).toBeGreaterThan(0);
    const keys = result.rows.map((r: { message_key: string }) => r.message_key);
    expect(keys).toContain("risk.unacceptable");
    expect(keys).toContain("checklist.human_oversight");
  });

  it("organization tem default_jurisdiction", async () => {
    const result = await db.query(
      `SELECT default_jurisdiction FROM organization WHERE id = $1`,
      [orgId]
    );
    expect(result.rows[0].default_jurisdiction).toBe("BR");
  });
});
