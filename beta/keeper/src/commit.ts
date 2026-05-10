import {
  Connection,
  Keypair,
} from "@solana/web3.js";
import {
  Randomness,
  ON_DEMAND_DEVNET_QUEUE,
  ON_DEMAND_MAINNET_QUEUE,
  AnchorUtils,
} from "@switchboard-xyz/on-demand";
import { address, createKeyPairSignerFromBytes, createSolanaRpc, type Address } from "@solana/kit";
import { RaffleClient } from "@tombola/sdk";
import { kitIxToWeb3, sendAndConfirm } from "./tx.js";
import { log, logError } from "./logger.js";
import type { ActionablePool } from "./scan.js";

export async function commitPool(
  entry: ActionablePool,
  keeperKp: Keypair,
  connection: Connection,
  rpcUrl: string,
  cluster: "devnet" | "mainnet",
): Promise<void> {
  const poolAddress = entry.address;
  log(poolAddress, "committing draw…");

  // ---- Switchboard setup ----
  const switchboardProgram = await AnchorUtils.loadProgramFromConnection(connection);
  const queuePk =
    cluster === "devnet" ? ON_DEMAND_DEVNET_QUEUE : ON_DEMAND_MAINNET_QUEUE;

  // ---- Step A: create randomness account (co-signed by fresh keypair) ----
  const randomnessKp = Keypair.generate();
  const [randomness, createIx] = await Randomness.create(
    switchboardProgram,
    randomnessKp,
    queuePk,
    keeperKp.publicKey,
  );
  await sendAndConfirm(connection, [createIx], [keeperKp, randomnessKp]);
  log(poolAddress, `randomness account created: ${randomness.pubkey.toBase58()}`);

  // ---- Step B: bundle sbCommit + commitDrawPrivate ----
  const sbCommitIx = await randomness.commitIx(queuePk, keeperKp.publicKey, undefined);
  const rpc = createSolanaRpc(rpcUrl as `${string}://${string}`);
  const client = new RaffleClient({ rpc });
  const callerSigner = await createKeyPairSignerFromBytes(keeperKp.secretKey);
  const raffleCommitIx = await client.commitDrawPrivate({
    caller: callerSigner,
    pool: address(poolAddress),
    randomnessAccount: address(randomness.pubkey.toBase58()),
  });

  try {
    await sendAndConfirm(connection, [sbCommitIx, kitIxToWeb3(raffleCommitIx)], [keeperKp]);
  } catch (err) {
    logError(
      poolAddress,
      `commitDrawPrivate bundle failed — orphaned randomness account: ${randomness.pubkey.toBase58()} (reclaim rent manually)`,
      err,
    );
    throw err; // re-throw so the caller's catch in index.ts also logs and continues to next pool
  }
  log(poolAddress, "commitDrawPrivate confirmed — pool → AwaitingVrf");
}
