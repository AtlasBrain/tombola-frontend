import { describe, it, expect } from "vitest";
import {
  createSolanaRpcFromTransport,
  createDefaultRpcTransport,
  generateKeyPairSigner,
  address,
} from "@solana/kit";

import { RaffleClient } from "./client.js";
import { PROGRAM_ID, findPrivatePoolPda, findRedeemedCodePda } from "./pdas.js";
import { hashCode } from "./codes.js";

const stubTransport = createDefaultRpcTransport({
  url: "http://127.0.0.1:8899",
});
const stubRpc = createSolanaRpcFromTransport(stubTransport);

describe("RaffleClient.voidInviteCode (v2)", () => {
  it("builds an instruction with the correct program ID and account order", async () => {
    const client = new RaffleClient({ rpc: stubRpc });
    const creator = await generateKeyPairSigner();

    const programIdAddr = address(PROGRAM_ID);
    const [pool] = await findPrivatePoolPda(programIdAddr, creator.address, 0n);
    const code = new TextEncoder().encode("test-code-alpha");
    const proof = [new Uint8Array(32)];

    const ix = await client.voidInviteCode({
      creator,
      pool,
      code,
      proof,
    });

    expect(ix.programAddress).toBe(PROGRAM_ID);
    expect(ix.accounts).toBeDefined();
    // First account is the pool PDA.
    expect(ix.accounts?.[0]?.address).toBe(pool);
    // Second account is the creator (signer).
    expect(ix.accounts?.[1]?.address).toBe(creator.address);
    // Third is the redemption record PDA.
    const [redemptionRecord] = await findRedeemedCodePda(
      programIdAddr,
      pool,
      hashCode(code),
    );
    expect(ix.accounts?.[2]?.address).toBe(redemptionRecord);
  });
});
