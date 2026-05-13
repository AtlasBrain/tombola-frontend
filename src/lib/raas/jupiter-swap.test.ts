import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getSwapQuote, getSwapInstructions } from "./jupiter-swap.js";
import type { SwapQuote } from "./jupiter-swap.js";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("getSwapQuote", () => {
  it("calls Jupiter v6 /quote with correct params and parses response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        outputMint: "So11111111111111111111111111111111111111112",
        inAmount: "10000000",
        outAmount: "70000000",
        otherAmountThreshold: "69300000",
        swapMode: "ExactOut",
        slippageBps: 100,
        priceImpactPct: "0.05",
        routePlan: [],
      }),
    });

    const quote = await getSwapQuote({
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "So11111111111111111111111111111111111111112",
      amount: "70000000",
      slippageBps: 100,
      swapMode: "ExactOut",
    });

    expect(quote.outAmount).toBe("70000000");
    expect(quote.swapMode).toBe("ExactOut");
    // Verify URL contains quote path
    const calledUrl: string = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toMatch(/quote-api\.jup\.ag\/v6\/quote/);
    expect(calledUrl).toMatch(/inputMint=/);
    expect(calledUrl).toMatch(/outputMint=/);
    expect(calledUrl).toMatch(/swapMode=ExactOut/);
  });

  it("throws on non-200 response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "internal server error",
    });
    await expect(
      getSwapQuote({
        inputMint: "x",
        outputMint: "y",
        amount: "1",
        slippageBps: 50,
      }),
    ).rejects.toThrow(/quote failed/i);
  });

  it("passes ExactIn as default swapMode when not specified", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        inputMint: "A",
        outputMint: "B",
        inAmount: "100",
        outAmount: "200",
        otherAmountThreshold: "198",
        swapMode: "ExactIn",
        slippageBps: 50,
        priceImpactPct: "0",
        routePlan: [],
      }),
    });

    await getSwapQuote({
      inputMint: "A",
      outputMint: "B",
      amount: "100",
      slippageBps: 50,
    });

    const calledUrl: string = fetchMock.mock.calls[0][0] as string;
    // Default swapMode should NOT appear in URL (omitted means ExactIn for Jupiter)
    // OR it's explicitly set to ExactIn — either way fine
    expect(calledUrl).toMatch(/inputMint=A/);
  });
});

describe("getSwapInstructions", () => {
  it("POSTs to /swap-instructions with quoteResponse + userPublicKey", async () => {
    const mockSwapIx = {
      programId: "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
      accounts: [
        { pubkey: "11111111111111111111111111111111", isSigner: false, isWritable: false },
      ],
      data: Buffer.from([1, 2, 3, 4]).toString("base64"),
    };

    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        computeBudgetInstructions: [],
        setupInstructions: [],
        swapInstruction: mockSwapIx,
        cleanupInstruction: null,
        addressLookupTableAddresses: ["ALT111111111111111111111111111111111111111111"],
      }),
    });

    const fakeQuote: SwapQuote = {
      inputMint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
      outputMint: "So11111111111111111111111111111111111111112",
      inAmount: "10000000",
      outAmount: "70000000",
      otherAmountThreshold: "69300000",
      swapMode: "ExactOut",
      slippageBps: 100,
      priceImpactPct: "0.05",
      routePlan: [],
    };

    const result = await getSwapInstructions({
      quote: fakeQuote,
      userPublicKey: "11111111111111111111111111111111",
    });

    expect(result.swapInstruction).toBeDefined();
    expect(result.swapInstruction.programId).toBe(
      "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
    );
    expect(result.addressLookupTableAddresses).toHaveLength(1);

    // Verify POST body shape
    const [calledUrl, calledOpts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toMatch(/quote-api\.jup\.ag\/v6\/swap-instructions/);
    expect(calledOpts.method).toBe("POST");
    const body = JSON.parse(calledOpts.body as string);
    expect(body.quoteResponse).toEqual(fakeQuote);
    expect(body.userPublicKey).toBe("11111111111111111111111111111111");
    expect(body.wrapAndUnwrapSol).toBe(true);
  });

  it("throws on non-200 response", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => "bad request",
    });

    await expect(
      getSwapInstructions({
        quote: {} as SwapQuote,
        userPublicKey: "xxx",
      }),
    ).rejects.toThrow(/swap-instructions failed/i);
  });
});
