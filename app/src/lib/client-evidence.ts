"use client";

import { maskPii } from "./pii-masker";

export interface ClientMaskedEvidence {
  masked: string;
  techniques: Record<string, string>;
  pii_match_count: number;
  pii_types: string[];
  prompt_orig_hash: string;
}

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function sha256Hex(value: string): Promise<string> {
  const encoded = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return toHex(digest);
}

export async function prepareMaskedEvidence(text: string, salt: string): Promise<ClientMaskedEvidence> {
  const result = maskPii(text);
  return {
    masked: result.masked,
    techniques: result.techniques,
    pii_match_count: result.matches.length,
    pii_types: [...new Set(result.matches.map((m) => m.type))],
    prompt_orig_hash: await sha256Hex(text + salt),
  };
}
