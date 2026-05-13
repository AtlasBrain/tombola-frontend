import { describe, it, expect, vi, beforeEach } from "vitest";

// Set env var before importing the module so getStripe() finds a key.
process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_for_tests";

import { createOnrampSession } from "./stripe-onramp.js";

const mockCreate = vi.fn();
vi.mock("stripe", () => {
  return {
    default: function MockStripe() {
      return {
        crypto: {
          onrampSessions: {
            create: mockCreate,
          },
        },
      };
    },
  };
});

beforeEach(() => {
  mockCreate.mockReset();
});

describe("createOnrampSession", () => {
  it("creates a session with USDC + Solana destination", async () => {
    mockCreate.mockResolvedValueOnce({
      id: "cos_test_123",
      client_secret: "cos_secret_xyz",
      transaction_details: { destination_currency: "usdc", destination_network: "solana" },
    });
    const session = await createOnrampSession({
      walletAddress: "11111111111111111111111111111111",
      amountUsd: 10,
      cluster: "mainnet-beta",
    });
    expect(session.id).toBe("cos_test_123");
    expect(session.client_secret).toBe("cos_secret_xyz");
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        wallet_addresses: expect.objectContaining({ solana: "11111111111111111111111111111111" }),
        source_currency: "usd",
        destination_currencies: ["usdc"],
        destination_networks: ["solana"],
        source_amount: "10",
      }),
    );
  });

  it("rejects invalid Solana addresses early", async () => {
    await expect(
      createOnrampSession({
        walletAddress: "not-a-base58-address",
        amountUsd: 10,
        cluster: "mainnet-beta",
      }),
    ).rejects.toThrow(/invalid wallet/i);
  });

  it("rejects amount below $1", async () => {
    await expect(
      createOnrampSession({
        walletAddress: "11111111111111111111111111111111",
        amountUsd: 0.5,
        cluster: "mainnet-beta",
      }),
    ).rejects.toThrow(/amount out of range/i);
  });

  it("rejects amount above $10,000", async () => {
    await expect(
      createOnrampSession({
        walletAddress: "11111111111111111111111111111111",
        amountUsd: 10001,
        cluster: "mainnet-beta",
      }),
    ).rejects.toThrow(/amount out of range/i);
  });
});
