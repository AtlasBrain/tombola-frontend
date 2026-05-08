import "server-only";
import { createSolanaRpc } from "@solana/kit";
import { RaffleClient, PoolType, type PoolTypeValue } from "@tombola/sdk";
import type { PoolView, PoolKind, PoolState } from "./mock-pools";

const KIND_BY_TYPE: Record<PoolTypeValue, PoolKind> = {
  [PoolType.Weekly]: "Weekly",
  [PoolType.Biweekly]: "Biweekly",
  [PoolType.Triweekly]: "Triweekly",
  [PoolType.Monthly]: "Monthly",
};

const STATE_BY_DISCRIMINANT: Record<number, PoolState> = {
  0: "Open",
  1: "AwaitingVrf",
  2: "Resolved",
};

export async function getLivePools(): Promise<PoolView[]> {
  const url = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!url) throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL not set");
  const rpc = createSolanaRpc(url);
  const client = new RaffleClient({ rpc });

  const poolTypes: PoolTypeValue[] = [
    PoolType.Weekly,
    PoolType.Biweekly,
    PoolType.Triweekly,
    PoolType.Monthly,
  ];

  return Promise.all(
    poolTypes.map(async (poolType) => {
      const counter = await client.getPoolTypeCounter(poolType);
      const round = counter.currentRound;
      const p = await client.getPublicPool(poolType, round);
      return {
        kind: KIND_BY_TYPE[poolType],
        poolType,
        round,
        state: STATE_BY_DISCRIMINANT[Number(p.state)] ?? "Open",
        totalTickets: p.totalTickets,
        totalPotLamports: p.totalPot,
        closeTimeUnix: Number(p.closeTime),
        ticketPriceLamports: p.ticketPrice,
      } satisfies PoolView;
    }),
  );
}
