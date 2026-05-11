// Server-only: full commit flow for one private pool.
//
// Two transactions:
//   1. Create a fresh Switchboard randomness account (co-signed by a brand-
//      new keypair). This is required because Switchboard's `Randomness.create`
//      needs the new account's keypair as a signer.
//   2. Bundle Switchboard's `commitIx` + the raffle program's
//      `commitDrawPrivate` into a single tx. After this lands, the pool is
//      in state 1 (AwaitingVrf).

import "server-only";
import { Connection, Keypair } from "@solana/web3.js";
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
} from "@solana/kit";
import { RaffleClient } from "@tombola/sdk";
import { kitIxToWeb3, sendAndConfirm } from "./tx";
import { log, logError } from "./logger";
import type { ActionablePool } from "./scan";

export async function commitPool(
  entry: ActionablePool,
  keeperKp: Keypair,
  connection: Connection,
  rpcUrl: string,
  cluster: "devnet" | "mainnet",
): Promise<void> {
  const poolAddress = entry.address;
  log(poolAddress, "committing draw…");

  const switchboardProgram =
    await AnchorUtils.loadProgramFromConnection(connection);
  const queuePk =
    cluster === "devnet" ? ON_DEMAND_DEVNET_QUEUE : ON_DEMAND_MAINNET_QUEUE;

  // Step A — create the randomness account.
  const randomnessKp = Keypair.generate();
  const [randomness, createIx] = await Randomness.create(
    switchboardProgram,
    randomnessKp,
    queuePk,
    keeperKp.publicKey,
  );
  await sendAndConfirm(connection, [createIx], [keeperKp, randomnessKp]);
  log(poolAddress, `randomness account created: ${randomness.pubkey.toBase58()}`);

  // Step B — Switchboard commit + raffle commit bundled in one tx.
  const sbCommitIx = await randomness.commitIx(
    queuePk,
    keeperKp.publicKey,
    undefined,
  );
  const rpc = createSolanaRpc(rpcUrl as `${string}://${string}`);
  const client = new RaffleClient({ rpc });
  const callerSigner = await createKeyPairSignerFromBytes(keeperKp.secretKey);
  const raffleCommitIx = await client.commitDrawPrivate({
    caller: callerSigner,
    pool: address(poolAddress),
    randomnessAccount: address(randomness.pubkey.toBase58()),
  });

  try {
    await sendAndConfirm(
      connection,
      [sbCommitIx, kitIxToWeb3(raffleCommitIx)],
      [keeperKp],
    );
  } catch (err) {
    logError(
      poolAddress,
      `commitDrawPrivate bundle failed — orphaned randomness account: ${randomness.pubkey.toBase58()} (reclaim rent manually)`,
      err,
    );
    throw err;
  }

  log(poolAddress, "commitDrawPrivate confirmed — pool → AwaitingVrf");
}
