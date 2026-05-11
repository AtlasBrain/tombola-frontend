// Server-only: full settle flow for one private pool.
//
// State 1 pools that hit this path go through:
//   1. RECOVERY (if needed) — re-commit a randomness account whose previous
//      reveal was already spent in a past slot. Switchboard allows recommit
//      on existing accounts; doing so clears `value` and `reveal_slot=0`,
//      restarting the cycle.
//   2. SIMULATE — call connection.simulateTransaction(revealIx) with
//      includeAccounts on the randomness PDA to learn the value the reveal
//      will produce. The on-chain settle requires `clock_slot == reveal_slot`
//      (vrf.rs:60), so reveal + settle must ship in the SAME tx — but we
//      need the value before sending to pick the winning batch. Simulation
//      reads the post-state without committing.
//   3. WINNER COMPUTE — winnerId = revealedValue % totalTickets, walk the
//      pool's TicketBatch accounts to find the one containing that id.
//   4. ATOMIC SEND — `[revealIx, settleIx]` in one tx. Reveal writes the
//      value at the current slot; settle reads it back in the same slot.

import "server-only";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import type { TransactionInstruction } from "@solana/web3.js";
import {
  Randomness,
  AnchorUtils,
  ON_DEMAND_DEVNET_QUEUE,
  ON_DEMAND_MAINNET_QUEUE,
} from "@switchboard-xyz/on-demand";
import {
  address,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  isSome,
  type Address,
  type Option,
} from "@solana/kit";
import { RaffleClient, PROGRAM_ID, generated } from "@tombola/sdk";
import { kitIxToWeb3, sendAndConfirm } from "./tx";
import { log, logError } from "./logger";
import type { ActionablePool } from "./scan";

const TICKET_BATCH_SIZE = 89;
const POOL_FIELD_OFFSET = 8;
// On-chain RandomnessAccountData layout — must match programs/raffle/src/vrf.rs.
const RANDOMNESS_VALUE_OFFSET = 152;
const RANDOMNESS_VALUE_LEN = 32;

export interface BatchView {
  batchAddress: string;
  owner: string;
  firstTicketId: bigint;
  lastTicketId: bigint;
}

export function computeWinnerId(revealedValue: bigint, totalTickets: bigint): bigint {
  return revealedValue % totalTickets;
}

export function findWinningBatch(
  batches: Pick<BatchView, "batchAddress" | "owner" | "firstTicketId" | "lastTicketId">[],
  winnerId: bigint,
): Pick<BatchView, "batchAddress" | "owner"> | null {
  return (
    batches.find((b) => b.firstTicketId <= winnerId && winnerId <= b.lastTicketId) ?? null
  );
}

async function simulateReveal(
  connection: Connection,
  sbRevealIx: TransactionInstruction,
  randomnessPubkey: PublicKey,
  feePayer: Keypair,
): Promise<bigint | null> {
  const tx = new Transaction().add(sbRevealIx);
  tx.feePayer = feePayer.publicKey;
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.sign(feePayer);

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
  for (let i = 0; i < value.length; i++) {
    if (value[i] !== 0) {
      nonZero = true;
      break;
    }
  }
  if (!nonZero) return null;
  let n = 0n;
  for (let i = 0; i < 8; i++) n |= BigInt(value[i] & 0xff) << (8n * BigInt(i));
  return n;
}

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
            bytes: poolAddress as never,
            encoding: "base58",
          },
        },
      ],
    },
  ).send()) as ReadonlyArray<{
    pubkey: string;
    account: { data: readonly [string, "base64"] };
  }>;
  if (!Array.isArray(accounts)) {
    throw new Error("getProgramAccounts returned unexpected shape");
  }

  const decoder = generated.getTicketBatchDecoder();
  return accounts
    .map((acc) => {
      const [b64] = acc.account.data;
      const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
      const batch = decoder.decode(bytes);
      return {
        batchAddress: String(acc.pubkey),
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
  cluster: "devnet" | "mainnet" = "devnet",
): Promise<void> {
  const poolAddress = entry.address;
  log(poolAddress, "checking oracle reveal…");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const vrfOpt = (entry.pool as any).vrfRequest as Option<Address>;
  if (!isSome(vrfOpt)) {
    logError(
      poolAddress,
      "pool is in AwaitingVrf but vrfRequest is None",
      new Error("missing vrfRequest"),
    );
    return;
  }
  const vrfAddr = vrfOpt.value;

  const switchboardProgram =
    await AnchorUtils.loadProgramFromConnection(connection);
  const randomness = new Randomness(switchboardProgram, new PublicKey(vrfAddr));

  // RECOVERY — when the randomness `value` field is already populated, the
  // previous reveal was spent in a past slot and we can't satisfy
  // `clock_slot == reveal_slot` anymore. Switchboard allows re-commit on the
  // same account: it resets seed_slot to current, zeros the value, and
  // restarts the cycle. We do that, wait ~6s for the slot delay, then fall
  // through to the normal atomic reveal+settle path.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const randData = (await randomness.loadData()) as any;
  const valueArr = Array.from((randData?.value ?? []) as Iterable<number>);
  const alreadyRevealed = valueArr.some((b) => b !== 0);
  if (alreadyRevealed) {
    log(
      poolAddress,
      "randomness already revealed in a past slot — recommitting to restart the cycle",
    );
    const queuePk =
      cluster === "devnet" ? ON_DEMAND_DEVNET_QUEUE : ON_DEMAND_MAINNET_QUEUE;
    try {
      const recommitIx = await randomness.commitIx(
        queuePk,
        keeperKp.publicKey,
        undefined,
      );
      const sig = await sendAndConfirm(connection, [recommitIx], [keeperKp]);
      log(poolAddress, `recommit confirmed: ${sig} — waiting for slot delay`);
      await new Promise((r) => setTimeout(r, 6000));
    } catch (err) {
      logError(
        poolAddress,
        "recommit failed (keeper may not be the randomness authority — try a different KEEPER_KEYPAIR)",
        err,
      );
      return;
    }
  }

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalTickets = (entry.pool as any).totalTickets as bigint;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    creator: address(String((entry.pool as any).creator)),
    treasury: address(treasury),
    randomnessAccount: address(vrfAddr),
  });

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
