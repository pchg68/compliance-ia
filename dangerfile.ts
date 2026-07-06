import { danger, fail, warn, message } from "danger";

const changedFiles = [
  ...danger.git.modified_files,
  ...danger.git.created_files,
  ...danger.git.deleted_files
];

const touchedSql = changedFiles.some((f) => f.endsWith(".sql"));
const touchedPolicy = changedFiles.some((f) =>
  /policy|rules|compliance/i.test(f)
);
const touchedAudit = changedFiles.some((f) =>
  /audit|trilha|ledger|imut|immutable/i.test(f)
);

const testTouched = changedFiles.some((f) =>
  /test|spec|__tests__/i.test(f)
);

const prBody = (danger.github.pr.body || "").toLowerCase();

if (touchedSql && !testTouched) {
  fail("Mudança SQL detectada sem arquivo de teste correspondente.");
}

if (touchedPolicy) {
  if (!/changelog|vers[aã]o|versionamento/.test(prBody)) {
    fail(
      "Alteração em política/regras sem evidência no corpo do PR sobre versionamento/changelog."
    );
  } else {
    message("Política/regras alteradas com menção de versionamento/changelog ✅");
  }
}

if (touchedAudit && !testTouched) {
  fail(
    "Mudança em trilha de auditoria sem teste de imutabilidade/negação de mutação."
  );
}

const potentialPii = changedFiles.some((f) =>
  /log|logger|audit|event/i.test(f)
);
if (potentialPii) {
  warn(
    "Verifique se não há PII/sensível em logs e trilhas. (Gate manual recomendado no review)"
  );
}