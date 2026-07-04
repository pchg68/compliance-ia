import { createHash, createHmac } from "crypto";

// Stub de carimbo de tempo ICP-Brasil (RFC 3161).
// Em produção, substituir por chamada real a uma TSA ICP-Brasil credenciada.
// O stub gera um token simulado para desenvolvimento e testes.

export interface TimestampToken {
  merkle_root_hex: string;
  timestamp: string;
  token: Buffer;
  stub: true;
}

const STUB_SECRET = "vexiajuris-dev-tsa-stub-key";

export function requestTimestamp(merkleRoot: Buffer): TimestampToken {
  const now = new Date().toISOString();
  const rootHex = merkleRoot.toString("hex");

  const hmac = createHmac("sha256", STUB_SECRET);
  hmac.update(rootHex);
  hmac.update(now);
  const token = hmac.digest();

  return {
    merkle_root_hex: rootHex,
    timestamp: now,
    token,
    stub: true,
  };
}

export function verifyTimestamp(
  merkleRoot: Buffer,
  timestamp: string,
  token: Buffer
): boolean {
  const rootHex = merkleRoot.toString("hex");
  const hmac = createHmac("sha256", STUB_SECRET);
  hmac.update(rootHex);
  hmac.update(timestamp);
  const expected = hmac.digest();
  return expected.equals(token);
}
