import "server-only";
import Stripe from "stripe";

// Lazy-throw: only crash when actually called, so dev builds without the key still compile.
// Read from process.env at call time (not module-load time) so vitest can inject the key
// via process.env before importing.
function getStripe(): Stripe {
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
  // Cast to any: Stripe's apiVersion type is a literal union that may not
  // include the version string used here, but the SDK accepts it at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new Stripe(stripeKey, { apiVersion: Stripe.API_VERSION as any });
}

// Base58 charset, 32-44 chars typical for Solana addresses.
const SOLANA_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface CreateOnrampInput {
  walletAddress: string;
  amountUsd: number;
  cluster: "mainnet-beta" | "devnet";
}

export interface OnrampSession {
  id: string;
  client_secret: string;
}

export async function createOnrampSession(input: CreateOnrampInput): Promise<OnrampSession> {
  if (!SOLANA_ADDR_RE.test(input.walletAddress)) {
    throw new Error(`invalid wallet address: ${input.walletAddress}`);
  }
  if (input.amountUsd < 1 || input.amountUsd > 10_000) {
    throw new Error(`amount out of range: ${input.amountUsd}`);
  }

  const stripe = getStripe();
  const session = await (stripe as unknown as {
    crypto: {
      onrampSessions: {
        create: (params: Record<string, unknown>) => Promise<{ id: string; client_secret: string }>;
      };
    };
  }).crypto.onrampSessions.create({
    wallet_addresses: { solana: input.walletAddress },
    source_currency: "usd",
    destination_currencies: ["usdc"],
    destination_networks: ["solana"],
    source_amount: String(input.amountUsd),
    // Note: Stripe Crypto Onramp does NOT support specifying devnet vs mainnet
    // directly via API — the network is "solana" and Stripe routes to
    // mainnet for real transactions. For dev/test, use Stripe test mode
    // (test-mode keys); transactions remain simulated and won't actually
    // settle on-chain. Devnet testing requires their separate Test Mode flow.
  });

  return {
    id: session.id,
    client_secret: session.client_secret,
  };
}
