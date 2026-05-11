import {
  Connection,
  Keypair,
  PublicKey,
} from "@solana/web3.js";
import { Randomness, AnchorUtils } from "@switchboard-xyz/on-demand";
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  isSome,
  type Address,
  type Option,
} from "@solana/kit";
import { RaffleClient, PROGRAM_ID } from "../../../vendor/sdk/index.ts";
import { getTicketBatchDecoder } from "../../../vendor/sdk/generated/accounts/ticketBatch.ts";
import { kitIxToWeb3, sendAndConfirm } from "./tx.js";
import { log, logError } from "./logger.js";
import type { ActionablePool } from "./scan.js";

// discriminator(8) + pool(32) + owner(32) + firstTicketId(8) + lastTicketId(8) + bump(1) = 89
const TICKET_BATCH_SIZE = 89;
/** Byte offset of `pool` field inside TicketBatch (after 8-byte discriminator). */
const POOL_FIELD_OFFSET = 8;
/** Max ms to poll for oracle reveal per tick before giving up. */
const REVEAL_TIMEOUT_MS = 60_000;
const REVEAL_POLL_INTERVAL_MS = 2_000;

export interface BatchView {
  batchAddress: string;
  owner: string;
  firstTicketId: bigint;
  lastTicketId: bigint;
}

/** Pure: compute winner ticket index. Mirrors on-chain modulo logic. */
export function computeWinnerId(
  revealedValue: bigint,
  totalTickets: bigint,
): bigint {
  return revealedValue % totalTickets;
}

/** Pure: find the batch containing the winning ticket ID. */
export function findWinningBatch(
  batches: Pick<BatchView, "batchAddress" | "owner" | "firstTicketId" | "lastTicketId">[],
  winnerId: bigint,
): Pick<BatchView, "batchAddress" | "owner"> | null {
  return (
    batches.find(
      (b) => b.firstTicketId <= winnerId && winnerId <= b.lastTicketId,
    ) ?? null
  );
}

/** Poll randomness.loadData() until oracle reveals or we time out. */
async function waitForReveal(randomness: Randomness): Promise<bigint | null> {
  const deadline = Date.now() + REVEAL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    try {
      const data = (await randomness.loadData()) as { value?: number[] };
      const value = data?.value ?? [];
      if (value.some((b: number) => b !== 0)) {
        // First 8 bytes as u64 LE — mirrors on-chain reduction.
        let n = 0n;
        for (let i = 0; i < 8; i++) n |= BigInt(value[i] & 0xff) << (8n * BigInt(i));
        return n;
      }
    } catch {
      // transient — keep polling
    }
    await new Promise((r) => setTimeout(r, REVEAL_POLL_INTERVAL_MS));
  }
  return null;
}

/** Fetch all TicketBatches for a pool, sorted by firstTicketId ascending. */
async function fetchBatches(
  rpcUrl: string,
  poolAddress: string,
): Promise<BatchView[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = createSolanaRpc(rpcUrl as any);

  type RpcAny = Record<string, (...args: unknown[]) => { send(): Promise<unknown> }>;
  const accounts = (await (rpc as unknown as RpcAny)["getProgramAccounts"](
    PROGRAM_ID as Address,
    {
      commitment: "confirmed",
      encoding: "base64",
      filters: [
        { dataSize: TICKET_BATCH_SIZE },
        {
          memcmp: {
            offset: POOL_FIELD_OFFSET,
            bytes: poolAddress,
            encoding: "base58",
          },
        },
      ],
    },
  ).send()) as ReadonlyArray<{
    pubkey: string;
    account: { data: readonly [string, "base64"] };
  }>;

  if (!Array.isArray(accounts))
    throw new Error("getProgramAccounts returned unexpected shape");

  const decoder = getTicketBatchDecoder();
  return accounts
    .map((acc) => {
      const [b64] = acc.account.data;
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const batch = decoder.decode(bytes);
      return {
        batchAddress: acc.pubkey,
        owner: String(batch.owner),
        firstTicketId: batch.firstTicketId,
        lastTicketId: batch.lastTicketId,
      };
    })
    .sort((a, b) => (a.firstTicketId < b.firstTicketId ? -1 : 1));
}

export async function settlePool(
  entry: ActionablePool,
  keeperKp: Keypair,
  connection: Connection,
  rpcUrl: string,
): Promise<void> {
  const poolAddress = entry.address;
  log(poolAddress, "checking oracle reveal…");

  // vrfRequest is Option<Address> — Kit shape: { __option: 'Some'; value: Address } | { __option: 'None' }
  const vrfOpt = entry.pool.vrfRequest as Option<Address>;
  if (!isSome(vrfOpt)) {
    logError(
      poolAddress,
      "pool is in AwaitingVrf but vrfRequest is None",
      new Error("missing vrfRequest"),
    );
    return;
  }
  const vrfAddr = vrfOpt.value;

  // Reconstruct Randomness from stored pubkey.
  const switchboardProgram = await AnchorUtils.loadProgramFromConnection(connection);
  const randomness = new Randomness(switchboardProgram, new PublicKey(vrfAddr));

  const revealedValue = await waitForReveal(randomness);
  if (revealedValue === null) {
    log(poolAddress, "oracle has not revealed yet — will retry next tick");
    return;
  }
  log(poolAddress, `oracle revealed: ${revealedValue}`);

  const totalTickets = entry.pool.totalTickets;
  if (totalTickets === 0n) {
    logError(poolAddress, "pool is in AwaitingVrf with zero tickets — cannot compute winner", new Error("totalTickets is 0"));
    return;
  }
  const winnerId = computeWinnerId(revealedValue, totalTickets);
  log(poolAddress, `winner ticket: ${winnerId} of ${totalTickets}`);

  const batches = await fetchBatches(rpcUrl, poolAddress);
  const winningBatch = findWinningBatch(batches, winnerId);
  if (!winningBatch) {
    logError(
      poolAddress,
      `no batch contains winner_id=${winnerId}`,
      new Error("batch not found"),
    );
    return;
  }
  log(
    poolAddress,
    `winning batch: ${winningBatch.batchAddress}, winner: ${winningBatch.owner}`,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rpc = createSolanaRpc(rpcUrl as any);
  const client = new RaffleClient({ rpc });
  const config = await client.getProtocolConfig();
  const treasury = config.treasury as string;

  // revealIx takes an optional payer PublicKey (web3.js).
  const sbRevealIx = await randomness.revealIx(keeperKp.publicKey);
  const callerSigner = await createKeyPairSignerFromBytes(keeperKp.secretKey);
  const settleIx = await client.settleDrawPrivate({
    caller: callerSigner,
    pool: address(poolAddress),
    winningBatch: address(winningBatch.batchAddress),
    winner: address(winningBatch.owner),
    creator: address(String(entry.pool.creator)),
    treasury: address(treasury),
    randomnessAccount: address(vrfAddr),
  });

  await sendAndConfirm(
    connection,
    [sbRevealIx, kitIxToWeb3(settleIx)],
    [keeperKp],
  );
  log(poolAddress, `settleDrawPrivate confirmed — winner: ${winningBatch.owner}`);
}
