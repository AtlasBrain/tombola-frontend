import { describe, it, expect, vi } from "vitest";
import {
  PublicKey,
  TransactionInstruction,
  Connection,
} from "@solana/web3.js";
import { rawIxToWeb3, buildSwapAndBuyTx } from "./bundle-tx.js";
import type { SwapInstructionsResponse } from "./jupiter-swap.js";

// ─── rawIxToWeb3 ─────────────────────────────────────────────────────────────

describe("rawIxToWeb3", () => {
  it("decodes a Jupiter raw ix to a TransactionInstruction", () => {
    const raw = {
      programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      accounts: [
        {
          pubkey: "11111111111111111111111111111111",
          isSigner: false,
          isWritable: false,
        },
      ],
      data: Buffer.from([1, 2, 3, 4]).toString("base64"),
    };

    const ix = rawIxToWeb3(raw);

    expect(ix).toBeInstanceOf(TransactionInstruction);
    expect(ix.programId.toBase58()).toBe(
      "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    );
    expect(ix.keys).toHaveLength(1);
    expect(ix.keys[0].pubkey.toBase58()).toBe(
      "11111111111111111111111111111111",
    );
    expect(ix.keys[0].isSigner).toBe(false);
    expect(ix.keys[0].isWritable).toBe(false);
    expect(ix.data).toEqual(Buffer.from([1, 2, 3, 4]));
  });

  it("handles multiple accounts with mixed signer/writable flags", () => {
    const raw = {
      programId: "11111111111111111111111111111111",
      accounts: [
        { pubkey: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", isSigner: true, isWritable: true },
        { pubkey: "11111111111111111111111111111111", isSigner: false, isWritable: true },
      ],
      data: Buffer.from([]).toString("base64"),
    };

    const ix = rawIxToWeb3(raw);

    expect(ix.keys).toHaveLength(2);
    expect(ix.keys[0].isSigner).toBe(true);
    expect(ix.keys[0].isWritable).toBe(true);
    expect(ix.keys[1].isWritable).toBe(true);
    expect(ix.data).toEqual(Buffer.from([]));
  });
});

// ─── buildSwapAndBuyTx ───────────────────────────────────────────────────────

describe("buildSwapAndBuyTx", () => {
  it("builds a VersionedTransaction with swap ixs + buy ix in correct order", async () => {
    // Mock connection: no ALTs, returns a blockhash
    const mockConnection = {
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 1000,
      }),
      getAddressLookupTable: vi.fn().mockResolvedValue({ value: null }),
    } as unknown as Connection;

    const payer = new PublicKey("11111111111111111111111111111111");

    // Use real base58 public keys (System Program + known programs)
    const SYSTEM_PROG = "11111111111111111111111111111111";
    const COMPUTE_BUDGET = "ComputeBudget1111111111111111111111111111111";
    const JUP_PROG = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";
    const TOKEN_PROG = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
    const RAFFLE_PROG = "TomboLAHQajKSF7v2KCiGFNMkk4Z2ZXnhBnFcjqqmHH";

    const makeRawIx = (programId: string, dataBytes: number[]) => ({
      programId,
      accounts: [],
      data: Buffer.from(dataBytes).toString("base64"),
    });

    const swapInstructions: SwapInstructionsResponse = {
      computeBudgetInstructions: [makeRawIx(COMPUTE_BUDGET, [0x02])],
      setupInstructions: [makeRawIx(TOKEN_PROG, [0xAA, 0xBB])],
      swapInstruction: makeRawIx(JUP_PROG, [0x01]),
      cleanupInstruction: makeRawIx(TOKEN_PROG, [0xCC]),
      addressLookupTableAddresses: [],
    };

    const buyInstruction = new TransactionInstruction({
      programId: new PublicKey(RAFFLE_PROG),
      keys: [],
      data: Buffer.from([0xFF]),
    });

    void SYSTEM_PROG;

    const vtx = await buildSwapAndBuyTx({
      connection: mockConnection,
      payer,
      swapInstructions,
      buyInstruction,
    });

    // Should be a VersionedTransaction
    expect(vtx.message).toBeDefined();
    expect(typeof vtx.serialize).toBe("function");

    // The message should contain 5 instructions:
    // computeBudget + setup + swap + cleanup + buy
    const ixCount = vtx.message.compiledInstructions.length;
    expect(ixCount).toBe(5);

    // buy instruction (raffle program) should be LAST
    const programKeys = vtx.message.staticAccountKeys;
    const lastIxIdx = vtx.message.compiledInstructions[ixCount - 1].programIdIndex;
    const lastProgram = programKeys[lastIxIdx].toBase58();
    expect(lastProgram).toBe("TomboLAHQajKSF7v2KCiGFNMkk4Z2ZXnhBnFcjqqmHH");
  });

  it("builds correctly with no cleanup instruction", async () => {
    const mockConnection = {
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 1000,
      }),
      getAddressLookupTable: vi.fn().mockResolvedValue({ value: null }),
    } as unknown as Connection;

    const payer = new PublicKey("11111111111111111111111111111111");

    const makeRawIx = (programId: string, dataBytes: number[]) => ({
      programId,
      accounts: [],
      data: Buffer.from(dataBytes).toString("base64"),
    });

    const swapInstructions: SwapInstructionsResponse = {
      computeBudgetInstructions: [],
      setupInstructions: [],
      swapInstruction: makeRawIx("JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", [0x01]),
      cleanupInstruction: null, // no cleanup
      addressLookupTableAddresses: [],
    };

    const buyInstruction = new TransactionInstruction({
      programId: new PublicKey("TomboLAHQajKSF7v2KCiGFNMkk4Z2ZXnhBnFcjqqmHH"),
      keys: [],
      data: Buffer.from([0xFF]),
    });

    const vtx = await buildSwapAndBuyTx({
      connection: mockConnection,
      payer,
      swapInstructions,
      buyInstruction,
    });

    // swap + buy = 2 instructions
    expect(vtx.message.compiledInstructions.length).toBe(2);
  });

  it("fetches ALTs from connection when addresses provided", async () => {
    const mockAltKey = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
    const mockGetAlt = vi.fn().mockResolvedValue({ value: null });
    const mockConnection = {
      getLatestBlockhash: vi.fn().mockResolvedValue({
        blockhash: "11111111111111111111111111111111",
        lastValidBlockHeight: 1000,
      }),
      getAddressLookupTable: mockGetAlt,
    } as unknown as Connection;

    const swapInstructions: SwapInstructionsResponse = {
      computeBudgetInstructions: [],
      setupInstructions: [],
      swapInstruction: {
        programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
        accounts: [],
        data: Buffer.from([0x01]).toString("base64"),
      },
      cleanupInstruction: null,
      addressLookupTableAddresses: [mockAltKey.toBase58()],
    };

    await buildSwapAndBuyTx({
      connection: mockConnection,
      payer: new PublicKey("11111111111111111111111111111111"),
      swapInstructions,
      buyInstruction: new TransactionInstruction({
        programId: new PublicKey("TomboLAHQajKSF7v2KCiGFNMkk4Z2ZXnhBnFcjqqmHH"),
        keys: [],
        data: Buffer.from([]),
      }),
    });

    expect(mockGetAlt).toHaveBeenCalledWith(
      expect.objectContaining({ toBase58: expect.any(Function) }),
    );
  });
});
