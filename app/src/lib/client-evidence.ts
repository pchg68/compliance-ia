"use client";

import { maskPii } from "./pii-masker";

export interface ClientMaskedEvidence {
  masked: string;
  techniques: Record<string, string>;
  pii_match_count: number;
  pii_types: string[];
}

export async function prepareMaskedEvidence(text: string): Promise<ClientMaskedEvidence> {
  const result = maskPii(text);
  return {
    masked: result.masked,
    techniques: result.techniques,
    pii_match_count: result.matches.length,
    pii_types: [...new Set(result.matches.map((m) => m.type))],
  };
}
