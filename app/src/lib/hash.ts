import { createHash } from "crypto";

export const CURRENT_HASH_SCHEMA_VERSION = 1;

export interface HashableInteraction {
  org_id: string;
  seq: number;
  user_id: string;
  provider: string;
  model: string;
  task_type: string;
  risk_class: string;
  prompt_masked: string;
  response_masked: string | null;
  prompt_orig_hash: string;
  response_orig_hash: string | null;
  decision: string;
  checklist_passed: boolean;
  citations: unknown | null;
  created_at: string;
  hash_schema_version: number;
}

const HASH_FIELDS: (keyof HashableInteraction)[] = [
  "org_id",
  "seq",
  "user_id",
  "provider",
  "model",
  "task_type",
  "risk_class",
  "prompt_masked",
  "response_masked",
  "prompt_orig_hash",
  "response_orig_hash",
  "decision",
  "checklist_passed",
  "citations",
  "created_at",
  "hash_schema_version",
];

/**
 * Ordena recursivamente as chaves de qualquer objeto/array aninhado.
 * Necessário porque `citations` é jsonb arbitrário: sem isso, a ordem das
 * chaves devolvida pelo driver pg não é garantida como a de inserção,
 * quebrando o determinismo exigido pelo hash canônico.
 */
function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function canonicalSerialize(data: HashableInteraction): string {
  const obj: Record<string, unknown> = {};
  for (const key of HASH_FIELDS) {
    obj[key] = sortKeysDeep(data[key] ?? null);
  }
  return JSON.stringify(obj);
}

export function computeRowHash(
  data: HashableInteraction,
  prevHash: Buffer | null
): Buffer {
  const canonical = canonicalSerialize(data);
  const hasher = createHash("sha256");
  hasher.update(canonical);
  if (prevHash) {
    hasher.update(prevHash);
  }
  return hasher.digest();
}

export function computeContentHash(content: string, salt: string): Buffer {
  return createHash("sha256").update(content + salt).digest();
}
