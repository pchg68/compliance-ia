import { createHash } from "crypto";

export function sha256(data: Buffer): Buffer {
  return createHash("sha256").update(data).digest();
}

export function buildMerkleTree(leaves: Buffer[]): {
  root: Buffer;
  levels: Buffer[][];
} {
  if (leaves.length === 0) {
    return { root: Buffer.alloc(32), levels: [] };
  }

  const levels: Buffer[][] = [leaves.map((l) => sha256(l))];

  while (levels[levels.length - 1].length > 1) {
    const current = levels[levels.length - 1];
    const next: Buffer[] = [];

    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        next.push(sha256(Buffer.concat([current[i], current[i + 1]])));
      } else {
        next.push(sha256(Buffer.concat([current[i], current[i]])));
      }
    }

    levels.push(next);
  }

  return { root: levels[levels.length - 1][0], levels };
}

export function getMerkleProof(
  index: number,
  levels: Buffer[][]
): { hash: Buffer; position: "left" | "right" }[] {
  const proof: { hash: Buffer; position: "left" | "right" }[] = [];
  let idx = index;

  for (let level = 0; level < levels.length - 1; level++) {
    const current = levels[level];
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;

    if (siblingIdx < current.length) {
      proof.push({
        hash: current[siblingIdx],
        position: isRight ? "left" : "right",
      });
    } else {
      proof.push({
        hash: current[idx],
        position: "right",
      });
    }

    idx = Math.floor(idx / 2);
  }

  return proof;
}

export function verifyMerkleProof(
  leaf: Buffer,
  proof: { hash: Buffer; position: "left" | "right" }[],
  root: Buffer
): boolean {
  let current = sha256(leaf);

  for (const step of proof) {
    if (step.position === "left") {
      current = sha256(Buffer.concat([step.hash, current]));
    } else {
      current = sha256(Buffer.concat([current, step.hash]));
    }
  }

  return current.equals(root);
}
