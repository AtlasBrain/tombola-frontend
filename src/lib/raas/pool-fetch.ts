import "server-only";
import { createSolanaRpc, address, isSome } from "@solana/kit";
import { fetchMaybePrivatePool } from "@tombola/sdk-v2/generated/accounts/privatePool";
import { PoolState } from "@tombola/sdk-v2/generated/types/poolState";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

export interface PoolFetchedState {
  pool_pubkey: string;
  creator: string;
  ticket_price_lamports: string; // BigInt as string for serialization
  close_time: number; // unix seconds
  total_tickets: number;
  total_pot_lamports: string;
  creator_fee_bps: number;
  state: "Open" | "AwaitingVrf" | "Resolved";
  winner: string | null;
  winning_ticket: number | null;
}

function mapPoolState(
  s: PoolState,
): "Open" | "AwaitingVrf" | "Resolved" {
  switch (s) {
    case PoolState.Open:
      return "Open";
    case PoolState.AwaitingVrf:
      return "AwaitingVrf";
    case PoolState.Resolved:
      return "Resolved";
    default:
      return "Open";
  }
}

export async function fetchPoolState(
  pool_pubkey: string,
): Promise<PoolFetchedState | null> {
  const rpc = createSolanaRpc(RPC_URL);
  const poolAddress = address(pool_pubkey);
  const maybeAccount = await fetchMaybePrivatePool(rpc, poolAddress);

  if (!maybeAccount.exists) {
    return null;
  }

  const data = maybeAccount.data;

  return {
    pool_pubkey,
    creator: data.creator as string,
    ticket_price_lamports: data.ticketPrice.toString(),
    close_time: Number(data.closeTime),
    total_tickets: Number(data.totalTickets),
    total_pot_lamports: data.totalPot.toString(),
    creator_fee_bps: data.creatorFeeBps,
    state: mapPoolState(data.state),
    winner: isSome(data.winner) ? (data.winner.value as string) : null,
    winning_ticket: isSome(data.winningTicket)
      ? Number(data.winningTicket.value)
      : null,
  };
}
