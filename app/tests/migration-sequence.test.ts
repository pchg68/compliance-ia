/**
 * Testa a sequência de migrations da Fase 1 do Vexiajuris Guard.
 * Valida que os arquivos de migration existem, estão na ordem correta
 * e contêm os elementos essenciais de cada fase.
 * Estes testes rodam sem banco de dados (apenas filesystem).
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const MIGRATIONS_DIR = resolve(__dirname, "../supabase/migrations");

function getMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

function readMigration(filename: string): string {
  return readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
}

describe("Sequência de migrations — Fase 1 (MVP vendável)", () => {
  it("diretório de migrations existe", () => {
    expect(existsSync(MIGRATIONS_DIR)).toBe(true);
  });

  it("migration 1 — trilha de auditoria imutável existe", () => {
    const files = getMigrationFiles();
    const m = files.find((f) => f.includes("create_audit_trail"));
    expect(m).toBeTruthy();
  });

  it("migration 2 — motor de risco e checklist existe", () => {
    const files = getMigrationFiles();
    const m = files.find((f) => f.includes("create_risk_checklist"));
    expect(m).toBeTruthy();
  });

  it("migration 3 — biblioteca de prompts existe", () => {
    const files = getMigrationFiles();
    const m = files.find((f) => f.includes("create_prompt_library"));
    expect(m).toBeTruthy();
  });

  it("migration 4 — sistema de alertas existe", () => {
    const files = getMigrationFiles();
    const m = files.find((f) => f.includes("create_alerts"));
    expect(m).toBeTruthy();
  });

  it("migration 5 — citações e proxy existe", () => {
    const files = getMigrationFiles();
    const m = files.find((f) => f.includes("create_citations_and_proxy"));
    expect(m).toBeTruthy();
  });

  it("migrations da Fase 1 estão em ordem cronológica correta", () => {
    const files = getMigrationFiles();
    const fase1 = [
      "create_audit_trail",
      "create_risk_checklist",
      "create_prompt_library",
      "create_alerts",
      "create_citations_and_proxy",
    ];
    const indices = fase1.map((name) => files.findIndex((f) => f.includes(name)));
    for (let i = 1; i < indices.length; i++) {
      expect(indices[i]).toBeGreaterThan(indices[i - 1]);
    }
  });

  it("migration 1 define função block_mutation() antes dos triggers", () => {
    const files = getMigrationFiles();
    const m1 = files.find((f) => f.includes("create_audit_trail"))!;
    const sql = readMigration(m1);
    const fnIdx = sql.indexOf("CREATE OR REPLACE FUNCTION block_mutation()");
    const trgIdx = sql.indexOf("CREATE TRIGGER no_mutation_ai_interaction");
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    expect(trgIdx).toBeGreaterThan(fnIdx);
  });

  it("migration 1 define RLS com missing_ok=true para evitar erro por setting ausente", () => {
    const files = getMigrationFiles();
    const m1 = files.find((f) => f.includes("create_audit_trail"))!;
    const sql = readMigration(m1);
    expect(sql).not.toMatch(/current_setting\('app\.current_org'\)[^,]/);
    expect(sql).toContain("current_setting('app.current_org', true)");
  });

  it("migration 2 usa block_mutation() (definida na migration 1)", () => {
    const files = getMigrationFiles();
    const m2 = files.find((f) => f.includes("create_risk_checklist"))!;
    const sql = readMigration(m2);
    expect(sql).toContain("EXECUTE FUNCTION block_mutation()");
  });

  it("migration 2 protege checklist_response contra DELETE", () => {
    const files = getMigrationFiles();
    const m2 = files.find((f) => f.includes("create_risk_checklist"))!;
    const sql = readMigration(m2);
    expect(sql).toContain("no_delete_checklist_response");
  });

  it("migration 1 tem CHECK constraint em ai_interaction.decision", () => {
    const files = getMigrationFiles();
    const m1 = files.find((f) => f.includes("create_audit_trail"))!;
    const sql = readMigration(m1);
    expect(sql).toContain("CHECK (decision IN");
    expect(sql).toContain("require_approval");
    expect(sql).toContain("allow_with_masking");
  });

  it("migration 5 usa nomes corretos de decisão na view (require_approval, allow_with_masking)", () => {
    const files = getMigrationFiles();
    const m5 = files.find((f) => f.includes("create_citations_and_proxy"))!;
    const sql = readMigration(m5);
    expect(sql).not.toContain("decision = 'approval'");
    expect(sql).not.toContain("decision = 'masked'");
    expect(sql).toContain("require_approval");
    expect(sql).toContain("allow_with_masking");
  });

  it("todas as migrations da Fase 1 usam missing_ok=true no current_setting de RLS", () => {
    const files = getMigrationFiles();
    const fase1Names = [
      "create_audit_trail",
      "create_risk_checklist",
      "create_prompt_library",
      "create_alerts",
      "create_citations_and_proxy",
    ];
    for (const name of fase1Names) {
      const filename = files.find((f) => f.includes(name))!;
      const sql = readMigration(filename);
      // verifica que não existe current_setting sem missing_ok
      const badPattern = /current_setting\('app\.current_org'\)[^,)]/g;
      expect(
        sql.match(badPattern),
        `${filename} tem current_setting sem missing_ok=true`
      ).toBeNull();
    }
  });
});
