import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
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

// On-chain RandomnessAccountData layout (must match programs/raffle/src/vrf.rs):
//   8..40: authority   40..72: queue   72..104: seed_slothash
//   104..112: seed_slot   112..144: oracle   144..152: reveal_slot
//   152..184: value [32]
const RANDOMNESS_VALUE_OFFSET = 152;
const RANDOMNESS_VALUE_LEN = 32;

/**
 * Simulate a revealIx tx and return what the `value` field of the randomness
 * account would be after it ran (decoded as u64 LE from first 8 bytes). Returns
 * null if simulation fails or the post-state value is zero.
 *
 * The contract requires `clock_slot == reveal_slot` (vrf.rs:60), so we cannot
 * reveal in one tx and settle in another. The keeper must:
 *   1. simulate revealIx to learn the value the reveal would produce
 *   2. compute the winning batch using that value
 *   3. send `[revealIx, settleIx]` atomically
 */
async function simulateReveal(
  connection: Connection,
  sbRevealIx: import("@solana/web3.js").TransactionInstruction,
  randomnessPubkey: PublicKey,
  feePayer: Keypair,
): Promise<bigint | null> {
  const tx = new Transaction().add(sbRevealIx);
  tx.feePayer = feePayer.publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(feePayer);

  // Legacy-Transaction overload: third arg is includeAccounts pubkeys to capture.
  const sim = await connection.simulateTransaction(tx, undefined, [
    randomnessPubkey,
  ]);
  if (sim.value.err) {
    throw new Error(
      `reveal simulation failed: ${JSON.stringify(sim.value.err)} logs=${(sim.value.logs ?? []).slice(-5).join(" | ")}`,
    );
  }
  const simAccount = sim.value.accounts?.[0];
  if (!simAccount) return null;
  const [b64] = simAccount.data as [string, string];
  const buf = Buffer.from(b64, "base64");
  if (buf.length < RANDOMNESS_VALUE_OFFSET + RANDOMNESS_VALUE_LEN) return null;
  const value = buf.subarray(
    RANDOMNESS_VALUE_OFFSET,
    RANDOMNESS_VALUE_OFFSET + RANDOMNESS_VALUE_LEN,
  );
  let nonZero = false;
  for (let i = 0; i < value.length; i++) if (value[i] !== 0) { nonZero = true; break; }
  if (!nonZero) return null;
  let n = 0n;
  for (let i = 0; i < 8; i++) n |= BigInt(value[i] & 0xff) << (8n * BigInt(i));
  return n;
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

  // Build revealIx and simulate to learn the value reveal will produce.
  // The contract enforces clock_slot == reveal_slot (vrf.rs:60), so reveal and
  // settle must be in the same tx — but we need the value before sending in
  // order to compute the winning batch. Simulation gets us both.
  const sbRevealIx = await randomness.revealIx(keeperKp.publicKey);
  let revealedValue: bigint | null;
  try {
    revealedValue = await simulateReveal(
      connection,
      sbRevealIx,
      new PublicKey(vrfAddr),
      keeperKp,
    );
  } catch (err) {
    log(
      poolAddress,
      `reveal sim failed (will retry next tick): ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }
  if (revealedValue === null) {
    log(
      poolAddress,
      "reveal simulation returned zero value — slot not yet advanced; retry next tick",
    );
    return;
  }
  log(poolAddress, `simulated revealed value: ${revealedValue}`);

  const totalTickets = entry.pool.totalTickets;
  if (totalTickets === 0n) {
    logError(
      poolAddress,
      "pool is in AwaitingVrf with zero tickets — cannot compute winner",
      new Error("totalTickets is 0"),
    );
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

  // Atomic: reveal + settle in one tx, satisfying clock_slot == reveal_slot.
  await sendAndConfirm(
    connection,
    [sbRevealIx, kitIxToWeb3(settleIx)],
    [keeperKp],
  );
  log(
    poolAddress,
    `settleDrawPrivate confirmed — winner: ${winningBatch.owner}`,
  );
}
