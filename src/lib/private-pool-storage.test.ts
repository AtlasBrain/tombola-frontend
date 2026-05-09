import { describe, it, expect, beforeEach } from "vitest";
import {
  saveCodesToStorage,
  loadCodesFromStorage,
  loadAllCodesForWallet,
  type StoredCodesPayload,
} from "./private-pool-storage";

const POOL = "HMSqiATSstvrZBB7Qrxzx94BFc8QTKpLWRtSFv5yqJnW";
const WALLET = "EaALFp4ZsPrP23UoSwmHzMdTM1Yc7pVyS1FfrSUFpLBt";
const OTHER_WALLET = "A9xZTBN7pwkw4bHdKV1yQ3KBgmUtvf9cV2U6PXVjCDWY";

const SAMPLE_PAYLOAD: StoredCodesPayload = {
  poolAddress: POOL,
  creator: WALLET,
  createdAt: 1_778_544_000,
  mode: "Whitelist",
  codes: ["ab".repeat(16), "cd".repeat(16)],
  proofs: {
    ["ab".repeat(16)]: [new Uint8Array(32).fill(0x11)],
    ["cd".repeat(16)]: [new Uint8Array(32).fill(0x22)],
  },
};

describe("private-pool-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("round-trips a Whitelist-mode payload", () => {
    saveCodesToStorage(SAMPLE_PAYLOAD);
    const loaded = loadCodesFromStorage(POOL, WALLET);
    expect(loaded).not.toBeNull();
    expect(loaded!.poolAddress).toBe(POOL);
    expect(loaded!.creator).toBe(WALLET);
    expect(loaded!.mode).toBe("Whitelist");
    expect(loaded!.codes).toEqual(SAMPLE_PAYLOAD.codes);
    expect(loaded!.proofs[SAMPLE_PAYLOAD.codes[0]][0]).toEqual(
      new Uint8Array(32).fill(0x11),
    );
    expect(loaded!.proofs[SAMPLE_PAYLOAD.codes[1]][0]).toEqual(
      new Uint8Array(32).fill(0x22),
    );
  });

  it("round-trips OneCodePerTicket mode", () => {
    saveCodesToStorage({ ...SAMPLE_PAYLOAD, mode: "OneCodePerTicket" });
    const loaded = loadCodesFromStorage(POOL, WALLET);
    expect(loaded!.mode).toBe("OneCodePerTicket");
  });

  it("returns null when wallet is not the creator (cross-wallet leakage guard)", () => {
    saveCodesToStorage(SAMPLE_PAYLOAD);
    const loaded = loadCodesFromStorage(POOL, OTHER_WALLET);
    expect(loaded).toBeNull();
  });

  it("returns null when key is missing", () => {
    expect(loadCodesFromStorage(POOL, WALLET)).toBeNull();
  });

  it("returns null on schema version mismatch", () => {
    localStorage.setItem(
      `tombola.privatePool.${POOL}`,
      JSON.stringify({ schemaVersion: 999, poolAddress: POOL, creator: WALLET }),
    );
    expect(loadCodesFromStorage(POOL, WALLET)).toBeNull();
  });

  it("returns null on malformed JSON", () => {
    localStorage.setItem(`tombola.privatePool.${POOL}`, "not-json{{{");
    expect(loadCodesFromStorage(POOL, WALLET)).toBeNull();
  });

  it("loadAllCodesForWallet returns only this wallet's pools", () => {
    saveCodesToStorage(SAMPLE_PAYLOAD);
    saveCodesToStorage({
      ...SAMPLE_PAYLOAD,
      poolAddress: "OtherPoolPdaXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
      creator: OTHER_WALLET,
    });
    const mine = loadAllCodesForWallet(WALLET);
    expect(mine.length).toBe(1);
    expect(mine[0].poolAddress).toBe(POOL);
  });

  it("ignores entries with non-tombola.privatePool keys", () => {
    localStorage.setItem("unrelated", "value");
    saveCodesToStorage(SAMPLE_PAYLOAD);
    const mine = loadAllCodesForWallet(WALLET);
    expect(mine.length).toBe(1);
  });

  it("does not throw on save (quota assertions are env-dependent)", () => {
    expect(() => saveCodesToStorage(SAMPLE_PAYLOAD)).not.toThrow();
  });
});
