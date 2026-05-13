// Jupiter v6 swap API helpers.
// Docs: https://station.jup.ag/docs/swap-api/get-quote

const JUPITER_BASE = "https://quote-api.jup.ag/v6";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface QuoteInput {
  inputMint: string;
  outputMint: string;
  /** Atomic amount of input token (ExactIn) or output token (ExactOut). */
  amount: string;
  slippageBps: number;
  /**
   * "ExactIn" (default) — you specify input, Jupiter returns output.
   * "ExactOut"           — you specify desired output, Jupiter sizes the input.
   *                        Use ExactOut so leftover USDC stays in user's wallet.
   */
  swapMode?: "ExactIn" | "ExactOut";
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: unknown[];
}

export interface RawIx {
  programId: string;
  accounts: Array<{ pubkey: string; isSigner: boolean; isWritable: boolean }>;
  /** base64-encoded instruction data */
  data: string;
}

export interface SwapInstructionsResponse {
  computeBudgetInstructions: RawIx[];
  setupInstructions: RawIx[];
  swapInstruction: RawIx;
  cleanupInstruction: RawIx | null;
  addressLookupTableAddresses: string[];
}

export interface SwapInstructionsInput {
  quote: SwapQuote;
  userPublicKey: string;
}

// ─── API helpers ─────────────────────────────────────────────────────────────

/**
 * Fetch a Jupiter v6 quote.
 *
 * Use swapMode: "ExactOut" when you know how much SOL you need (e.g. ticket
 * price in lamports) and want Jupiter to size the USDC input. Any leftover
 * USDC stays in the user's ATA.
 */
export async function getSwapQuote(input: QuoteInput): Promise<SwapQuote> {
  const url = new URL(`${JUPITER_BASE}/quote`);
  url.searchParams.set("inputMint", input.inputMint);
  url.searchParams.set("outputMint", input.outputMint);
  url.searchParams.set("amount", input.amount);
  url.searchParams.set("slippageBps", String(input.slippageBps));
  if (input.swapMode) {
    url.searchParams.set("swapMode", input.swapMode);
  }

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`quote failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as SwapQuote;
}

/**
 * Fetch Jupiter v6 swap instructions for an already-obtained quote.
 *
 * Returns raw instruction data (programId + accounts + base64 data) + ALT
 * addresses. The caller converts these to web3.js instructions and composes
 * them into a VersionedTransaction (see bundle-tx.ts).
 */
export async function getSwapInstructions(
  input: SwapInstructionsInput,
): Promise<SwapInstructionsResponse> {
  const res = await fetch(`${JUPITER_BASE}/swap-instructions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      quoteResponse: input.quote,
      userPublicKey: input.userPublicKey,
      wrapAndUnwrapSol: true,
      asLegacyTransaction: false,
      useSharedAccounts: true,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`swap-instructions failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as SwapInstructionsResponse;
}
