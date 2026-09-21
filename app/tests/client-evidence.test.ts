import { describe, expect, it } from "vitest";
import { prepareMaskedEvidence } from "../src/lib/client-evidence";

describe("prepareMaskedEvidence", () => {
  it("mascara PII estruturado antes de qualquer envio ao núcleo", async () => {
    const result = await prepareMaskedEvidence(
      "Cliente João. CPF 123.456.789-09, e-mail joao@example.com, processo 1234567-89.2024.8.26.0100."
    );

    expect(result.masked).not.toContain("123.456.789-09");
    expect(result.masked).not.toContain("joao@example.com");
    expect(result.masked).toContain("[CPF_1]");
    expect(result.masked).toContain("[EMAIL_1]");
    expect(result.pii_match_count).toBeGreaterThan(0);
    expect(result.pii_types).toContain("CPF");
    expect(result.pii_types).toContain("EMAIL");
  });

  it("preserva citações jurídicas não sensíveis no texto mascarado", async () => {
    const result = await prepareMaskedEvidence(
      "Conforme o art. 5º da Lei 8.078/1990 e o REsp 123456/SP, elabore um resumo."
    );

    expect(result.masked).toContain("Lei 8.078/1990");
    expect(result.masked).toContain("REsp 123456/SP");
  });
});
