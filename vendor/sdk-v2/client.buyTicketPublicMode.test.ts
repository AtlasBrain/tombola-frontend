import { describe, it, expect } from "vitest";
import {
  createSolanaRpcFromTransport,
  createDefaultRpcTransport,
  generateKeyPairSigner,
  address,
} from "@solana/kit";

import { RaffleClient } from "./client.js";
import { PROGRAM_ID, findPrivatePoolPda, findTicketBatchPda } from "./pdas.js";

const stubTransport = createDefaultRpcTransport({
  url: "http://127.0.0.1:8899",
});
const stubRpc = createSolanaRpcFromTransport(stubTransport);

describe("RaffleClient.buyTicketPublicMode (v2.1)", () => {
  it("builds an instruction with correct program ID + account order", async () => {
    const client = new RaffleClient({ rpc: stubRpc });
    const buyer = await generateKeyPairSigner();

    const programIdAddr = address(PROGRAM_ID);
    const [pool] = await findPrivatePoolPda(programIdAddr, buyer.address, 0n);

    const ix = await client.buyTicketPublicMode({
      buyer,
      pool,
      totalTickets: 0n,
      quantity: 1n,
    });

    expect(ix.programAddress).toBe(PROGRAM_ID);
    expect(ix.accounts).toBeDefined();
    // Account order: pool, ticketBatch, buyer, systemProgram
    expect(ix.accounts?.[0]?.address).toBe(pool);
    const [ticketBatch] = await findTicketBatchPda(programIdAddr, pool, 0n);
    expect(ix.accounts?.[1]?.address).toBe(ticketBatch);
    expect(ix.accounts?.[2]?.address).toBe(buyer.address);
  });
});
