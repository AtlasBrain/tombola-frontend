"use client";
import { useCallback, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  type TransactionInstruction,
} from "@solana/web3.js";
import {
  createSolanaRpc,
  type Address,
  type TransactionSigner,
} from "@solana/kit";
import {
  AnchorUtils,
  getDefaultDevnetQueue,
  Randomness,
} from "@switchboard-xyz/on-demand";
import { RaffleClient } from "@tombola/sdk";
import { kitToWeb3 } from "@/lib/kit-to-web3";
import { useToast } from "./Toast";

interface Props {
  poolAddress: string;
  state: 0 | 1 | 2;
  closeTimeUnix: number;
  totalTickets: bigint;
  creator: string;
}

const RETRY_TIMEOUT_SECS = 3_600;
const SETTLE_RETRIES = 6;

export function DrawWinnerButton({
  poolAddress,
  state,
  closeTimeUnix,
  totalTickets,
  creator,
}: Props) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const { push: pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string>("");

  const nowSec = Math.floor(Date.now() / 1000);
  const closed = closeTimeUnix <= nowSec;
  const closeTimeoutPassed = closeTimeUnix + RETRY_TIMEOUT_SECS <= nowSec;

  // Decide which action this button performs based on state + timers.
  // Note: private pools have no on-chain retry instruction (the protocol
  // only ships retry_draw_public). If Switchboard never reveals for a
  // private pool, the only recovery is operator intervention. We surface
  // this as a "stuck" message rather than a broken retry button.
  const action:
    | "commit"
    | "settle"
    | "stuck"
    | "close-empty"
    | "none" =
    state === 0 && closed && totalTickets === 0n
      ? "close-empty"
      : state === 0 && closed
        ? "commit"
        : state === 1 && closeTimeoutPassed
          ? "stuck"
          : state === 1
            ? "settle"
            : "none";

  const requireWallet = useCallback(
    (cb: () => void) => {
      if (!publicKey || !signTransaction) {
        setWalletModalVisible(true);
        return;
      }
      cb();
    },
    [publicKey, signTransaction, setWalletModalVisible],
  );

  const onCommit = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setBusy(true);
    setPhase("Generating randomness account…");
    try {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const callerSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;

      const sbConn = new Connection(connection.rpcEndpoint, "confirmed");
      const switchboardProgram = await AnchorUtils.loadProgramFromConnection(sbConn);
      const queue = await getDefaultDevnetQueue(connection.rpcEndpoint);

      const randomnessKp = Keypair.generate();
      const [randomness, createIx] = await Randomness.create(
        switchboardProgram,
        randomnessKp,
        queue.pubkey,
        publicKey,
      );

      // Tx 1: create the randomness account (web3.js, two signers)
      setPhase("Creating randomness account on chain…");
      {
        const tx = new Transaction().add(createIx);
        tx.feePayer = publicKey;
        const { blockhash, lastValidBlockHeight } =
          await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;
        tx.partialSign(randomnessKp);
        const signed = await signTransaction(tx);
        const sig = await connection.sendRawTransaction(signed.serialize(), {
          skipPreflight: false,
        });
        await connection.confirmTransaction(
          { signature: sig, blockhash, lastValidBlockHeight },
          "confirmed",
        );
      }

      // Tx 2: bundle Switchboard.commitIx + raffle.commit_draw_private
      setPhase("Committing draw…");
      const sbCommitIx: TransactionInstruction = await randomness.commitIx(
        queue.pubkey,
        publicKey,
        undefined,
      );
      const raffleCommitIx = await client.commitDrawPrivate({
        caller: callerSigner,
        pool: poolAddress as Address,
        randomnessAccount: randomness.pubkey.toBase58() as Address,
      });
      const tx = new Transaction()
        .add(sbCommitIx)
        .add(kitToWeb3(raffleCommitIx));
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      pushToast("success", "Commit landed; oracle is producing the reveal");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast("error", msg.slice(0, 100));
      setPhase("");
    } finally {
      setBusy(false);
    }
  }, [
    connection,
    publicKey,
    signTransaction,
    poolAddress,
    pushToast,
  ]);

  const onSettle = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setBusy(true);
    setPhase("Reading pool state…");
    try {
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const callerSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;

      const { fetchPrivatePool } = await import("@tombola/sdk/generated");
      const pool = await fetchPrivatePool(rpc, poolAddress as Address);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const vrfOpt = pool.data.vrfRequest as any;
      let randomnessAddr: Address;
      if (vrfOpt && typeof vrfOpt === "object" && "__option" in vrfOpt) {
        if (vrfOpt.__option !== "Some") {
          throw new Error("Pool is AwaitingVrf but vrfRequest is None");
        }
        randomnessAddr = vrfOpt.value as Address;
      } else if (vrfOpt) {
        randomnessAddr = vrfOpt as Address;
      } else {
        throw new Error("Pool is AwaitingVrf but vrfRequest is null");
      }

      const sbConn = new Connection(connection.rpcEndpoint, "confirmed");
      const switchboardProgram = await AnchorUtils.loadProgramFromConnection(sbConn);
      const randomness = new Randomness(
        switchboardProgram,
        new PublicKey(String(randomnessAddr)),
      );

      const treasury = (await client.getProtocolConfig()).treasury;

      for (let attempt = 1; attempt <= SETTLE_RETRIES; attempt++) {
        setPhase(`Fetching reveal from oracle (attempt ${attempt}/${SETTLE_RETRIES})…`);
        try {
          const sbRevealIx: TransactionInstruction = await randomness.revealIx(
            publicKey,
          );

          // Multi-ticket private settle requires off-chain gateway pre-fetch
          // to compute winner_id before bundling reveal+settle. Out of scope
          // for the frontend keeper in v1 — point user to the operator daemon.
          if (totalTickets > 1n) {
            throw new Error(
              "Multi-ticket private pools must be drawn by the operator daemon (frontend keeper handles 1-ticket pools only).",
            );
          }

          // 1-ticket path: winner_id = 0; winning_batch is at first_ticket_id=0
          const [winningBatch] = await client.ticketBatchPda(
            poolAddress as Address,
            0n,
          );
          const batch = await client.getTicketBatch(
            poolAddress as Address,
            0n,
          );
          const winnerAddr = batch.owner;

          const settleIx = await client.settleDrawPrivate({
            caller: callerSigner,
            pool: poolAddress as Address,
            winningBatch,
            winner: winnerAddr,
            creator: creator as Address,
            treasury,
            randomnessAccount: randomnessAddr,
          });

          setPhase("Bundling reveal + settle (atomic)…");
          const tx = new Transaction()
            .add(sbRevealIx)
            .add(kitToWeb3(settleIx));
          tx.feePayer = publicKey;
          const { blockhash, lastValidBlockHeight } =
            await connection.getLatestBlockhash();
          tx.recentBlockhash = blockhash;
          const signed = await signTransaction(tx);
          // skipPreflight=true: simulation runs at slot N but tx lands at N+M;
          // strict clock_slot==reveal_slot would fail in sim (companion D-068).
          const sig = await connection.sendRawTransaction(signed.serialize(), {
            skipPreflight: true,
          });
          await connection.confirmTransaction(
            { signature: sig, blockhash, lastValidBlockHeight },
            "confirmed",
          );
          pushToast("success", "Pool resolved — winner paid out");
          return;
        } catch (e) {
          if (attempt < SETTLE_RETRIES) {
            await new Promise((r) => setTimeout(r, 15_000));
            continue;
          }
          throw e;
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      pushToast("error", msg.slice(0, 200));
      setPhase("");
    } finally {
      setBusy(false);
    }
  }, [
    connection,
    publicKey,
    signTransaction,
    poolAddress,
    creator,
    pushToast,
    totalTickets,
  ]);

  const onCloseEmpty = useCallback(async () => {
    if (!publicKey || !signTransaction) return;
    setBusy(true);
    setPhase("Reclaiming creator rent…");
    try {
      if (publicKey.toBase58() !== creator) {
        throw new Error("Only the pool creator can close an empty pool");
      }
      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const creatorSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;
      const ix = await client.closeEmptyPrivatePool({
        creator: creatorSigner,
        pool: poolAddress as Address,
      });
      const tx = new Transaction().add(kitToWeb3(ix));
      tx.feePayer = publicKey;
      const { blockhash, lastValidBlockHeight } =
        await connection.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      const signed = await signTransaction(tx);
      const sig = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
      });
      await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight },
        "confirmed",
      );
      pushToast("success", "Pool closed; rent refunded");
    } catch (e: unknown) {
      pushToast("error", (e instanceof Error ? e.message : String(e)).slice(0, 200));
    } finally {
      setBusy(false);
      setPhase("");
    }
  }, [
    connection,
    publicKey,
    signTransaction,
    poolAddress,
    creator,
    pushToast,
  ]);

  if (action === "none" || state === 2) return null;

  if (action === "stuck") {
    return (
      <div className="mt-6 rounded border border-red-700/40 bg-red-900/20 p-4">
        <p className="text-sm text-red-300">
          Draw is stuck: oracle hasn&apos;t revealed within an hour of close. Private
          pools have no on-chain retry path (protocol limitation). Ask the
          creator to contact the operator team.
        </p>
      </div>
    );
  }

  const labels = {
    commit: "Draw winner",
    settle: "Settle (oracle reveal ready)",
    "close-empty": "Reclaim rent (no tickets sold)",
  } as const;

  const handlers = {
    commit: () => requireWallet(onCommit),
    settle: () => requireWallet(onSettle),
    "close-empty": () => requireWallet(onCloseEmpty),
  } as const;

  return (
    <div className="mt-6 flex flex-col gap-2">
      <button
        type="button"
        onClick={handlers[action]}
        disabled={busy}
        className="rounded bg-amber-600 px-4 py-3 font-semibold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-neutral-700"
      >
        {busy ? phase || "Working…" : labels[action]}
      </button>
      {action === "commit" && (
        <p className="text-xs text-neutral-500">
          Anyone can trigger this. You pay the tx fee; the pool reimburses you for the VRF cost out of accumulated fees.
        </p>
      )}
    </div>
  );
}
