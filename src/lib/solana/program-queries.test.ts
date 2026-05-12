import { describe, it, expect } from "vitest";
import {
  decodeAccountBytes,
  fetchPrivatePools,
  fetchPublicPools,
  fetchTicketBatches,
} from "./program-queries";

// These wrappers are the single source of truth for `getProgramAccounts`
// filter construction across the app. The risk isn't decoding — that's
// handled by the SDK — but the filter SHAPE: a wrong offset or missing
// dataSize means the RPC returns the wrong accounts and downstream
// stats silently bottom out to zero. So the tests verify the filter
// payload the RPC receives.

const PROGRAM_ID = "qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M";

interface CapturedCall {
  programId: string;
  config: {
    commitment?: string;
    encoding?: string;
    filters?: unknown[];
  };
}

function makeRpc(captured: CapturedCall[], returnValue: unknown = []) {
  return {
    getProgramAccounts: (programId: string, config: CapturedCall["config"]) => {
      captured.push({ programId, config });
      return { send: () => Promise.resolve(returnValue) };
    },
  };
}

describe("fetchTicketBatches", () => {
  it("filters by dataSize only when neither pool nor owner is set", async () => {
    const captured: CapturedCall[] = [];
    await fetchTicketBatches({
      rpc: makeRpc(captured),
      programId: PROGRAM_ID,
    });
    expect(captured).toHaveLength(1);
    expect(captured[0].config.filters).toEqual([{ dataSize: 89n }]);
  });

  it("adds a pool memcmp at the TicketBatch pool offset (8)", async () => {
    const captured: CapturedCall[] = [];
    await fetchTicketBatches({
      rpc: makeRpc(captured),
      programId: PROGRAM_ID,
      pool: "PoolPubkey123",
    });
    expect(captured[0].config.filters).toEqual([
      { dataSize: 89n },
      { memcmp: { offset: 8, bytes: "PoolPubkey123" } },
    ]);
  });

  it("adds an owner memcmp at the TicketBatch owner offset (40)", async () => {
    const captured: CapturedCall[] = [];
    await fetchTicketBatches({
      rpc: makeRpc(captured),
      programId: PROGRAM_ID,
      owner: "WalletPubkey456",
    });
    expect(captured[0].config.filters).toEqual([
      { dataSize: 89n },
      { memcmp: { offset: 40, bytes: "WalletPubkey456" } },
    ]);
  });

  it("combines pool and owner filters (3-filter shape)", async () => {
    const captured: CapturedCall[] = [];
    await fetchTicketBatches({
      rpc: makeRpc(captured),
      programId: PROGRAM_ID,
      pool: "PoolX",
      owner: "WalletY",
    });
    expect(captured[0].config.filters).toEqual([
      { dataSize: 89n },
      { memcmp: { offset: 8, bytes: "PoolX" } },
      { memcmp: { offset: 40, bytes: "WalletY" } },
    ]);
  });

  it("throws when the RPC returns a non-array shape", async () => {
    const rpc = {
      getProgramAccounts: () => ({
        send: () => Promise.resolve({ unexpected: "shape" }),
      }),
    };
    await expect(
      fetchTicketBatches({ rpc, programId: PROGRAM_ID, pool: "X" }),
    ).rejects.toThrow(/unexpected shape/);
  });
});

describe("fetchPrivatePools", () => {
  it("filters by dataSize only when no state / creator is set", async () => {
    const captured: CapturedCall[] = [];
    await fetchPrivatePools({ rpc: makeRpc(captured), programId: PROGRAM_ID });
    expect(captured[0].config.filters).toEqual([{ dataSize: 216n }]);
  });

  it("adds a state memcmp at offset 123 with the right base58 byte", async () => {
    const captured: CapturedCall[] = [];
    await fetchPrivatePools({
      rpc: makeRpc(captured),
      programId: PROGRAM_ID,
      state: 1, // AwaitingVrf
    });
    const filters = captured[0].config.filters as Array<Record<string, unknown>>;
    expect(filters[0]).toEqual({ dataSize: 216n });
    // base58 of [1] is "2"; this is what `getProgramAccounts` accepts as
    // the indexed memcmp key.
    expect(filters[1]).toEqual({
      memcmp: {
        offset: 123,
        bytes: "2",
        encoding: "base58",
      },
    });
  });

  it("encodes state=0 (Open) as base58 '1'", async () => {
    const captured: CapturedCall[] = [];
    await fetchPrivatePools({
      rpc: makeRpc(captured),
      programId: PROGRAM_ID,
      state: 0,
    });
    const filters = captured[0].config.filters as Array<Record<string, unknown>>;
    expect(filters[1]).toEqual({
      memcmp: { offset: 123, bytes: "1", encoding: "base58" },
    });
  });

  it("adds a creator memcmp at offset 8", async () => {
    const captured: CapturedCall[] = [];
    await fetchPrivatePools({
      rpc: makeRpc(captured),
      programId: PROGRAM_ID,
      creator: "CreatorPubkey",
    });
    expect(captured[0].config.filters).toEqual([
      { dataSize: 216n },
      { memcmp: { offset: 8, bytes: "CreatorPubkey" } },
    ]);
  });

  it("composes state and creator filters", async () => {
    const captured: CapturedCall[] = [];
    await fetchPrivatePools({
      rpc: makeRpc(captured),
      programId: PROGRAM_ID,
      state: 2,
      creator: "C",
    });
    expect(captured[0].config.filters).toHaveLength(3);
  });
});

describe("fetchPublicPools", () => {
  it("filters by PublicPool dataSize (150n)", async () => {
    const captured: CapturedCall[] = [];
    await fetchPublicPools({ rpc: makeRpc(captured), programId: PROGRAM_ID });
    expect(captured[0].config.filters).toEqual([{ dataSize: 150n }]);
  });
});

describe("call config", () => {
  it("always sends commitment=confirmed + encoding=base64", async () => {
    const captured: CapturedCall[] = [];
    await fetchTicketBatches({ rpc: makeRpc(captured), programId: PROGRAM_ID });
    expect(captured[0].config.commitment).toBe("confirmed");
    expect(captured[0].config.encoding).toBe("base64");
  });
});

describe("decodeAccountBytes", () => {
  it("decodes a base64 payload to a Uint8Array", () => {
    const original = new Uint8Array([1, 2, 3, 4, 5]);
    const b64 = Buffer.from(original).toString("base64");
    const acc = {
      pubkey: "ignored",
      account: { data: [b64, "base64"] as const },
    };
    expect(decodeAccountBytes(acc)).toEqual(original);
  });
});
