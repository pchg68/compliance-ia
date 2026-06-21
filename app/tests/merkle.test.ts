import { describe, it, expect } from "vitest";
import { buildMerkleTree, getMerkleProof, verifyMerkleProof } from "../src/lib/merkle";
import { requestTimestamp, verifyTimestamp } from "../src/lib/tsa-stub";

describe("Árvore de Merkle", () => {
  const leaves = [
    Buffer.from("registro1"),
    Buffer.from("registro2"),
    Buffer.from("registro3"),
    Buffer.from("registro4"),
  ];

  it("constrói árvore com raiz determinística", () => {
    const { root: root1 } = buildMerkleTree(leaves);
    const { root: root2 } = buildMerkleTree(leaves);
    expect(root1.equals(root2)).toBe(true);
    expect(root1.length).toBe(32);
  });

  it("raiz muda se qualquer folha mudar", () => {
    const { root: original } = buildMerkleTree(leaves);
    const tampered = [...leaves];
    tampered[2] = Buffer.from("adulterado");
    const { root: modified } = buildMerkleTree(tampered);
    expect(original.equals(modified)).toBe(false);
  });

  it("prova de inclusão verifica corretamente", () => {
    const { root, levels } = buildMerkleTree(leaves);
    for (let i = 0; i < leaves.length; i++) {
      const proof = getMerkleProof(i, levels);
      expect(verifyMerkleProof(leaves[i], proof, root)).toBe(true);
    }
  });

  it("prova de inclusão falha com folha adulterada", () => {
    const { root, levels } = buildMerkleTree(leaves);
    const proof = getMerkleProof(0, levels);
    expect(verifyMerkleProof(Buffer.from("adulterado"), proof, root)).toBe(false);
  });

  it("funciona com número ímpar de folhas", () => {
    const oddLeaves = leaves.slice(0, 3);
    const { root, levels } = buildMerkleTree(oddLeaves);
    expect(root.length).toBe(32);
    const proof = getMerkleProof(2, levels);
    expect(verifyMerkleProof(oddLeaves[2], proof, root)).toBe(true);
  });

  it("funciona com uma única folha", () => {
    const { root } = buildMerkleTree([Buffer.from("unico")]);
    expect(root.length).toBe(32);
  });

  it("árvore vazia retorna buffer zerado", () => {
    const { root } = buildMerkleTree([]);
    expect(root.equals(Buffer.alloc(32))).toBe(true);
  });
});

describe("Carimbo de tempo (TSA stub)", () => {
  it("gera e verifica token de timestamp", () => {
    const root = Buffer.from("raiz-merkle-teste");
    const token = requestTimestamp(root);
    expect(token.stub).toBe(true);
    expect(token.token.length).toBe(32);
    expect(verifyTimestamp(root, token.timestamp, token.token)).toBe(true);
  });

  it("rejeita token com raiz adulterada", () => {
    const root = Buffer.from("raiz-original");
    const token = requestTimestamp(root);
    expect(verifyTimestamp(Buffer.from("raiz-adulterada"), token.timestamp, token.token)).toBe(false);
  });

  it("rejeita token com timestamp adulterado", () => {
    const root = Buffer.from("raiz-teste");
    const token = requestTimestamp(root);
    expect(verifyTimestamp(root, "2020-01-01T00:00:00.000Z", token.token)).toBe(false);
  });
});
