"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import { Transaction, PublicKey } from "@solana/web3.js";
import { useConnection } from "@solana/wallet-adapter-react";
import { createSolanaRpc, type Address, type TransactionSigner } from "@solana/kit";
import { RaffleClient, AccessMode, PROGRAM_ID, findPrivatePoolPda } from "@tombola/sdk-v2";
import { kitToWeb3 } from "@/lib/kit-to-web3";
import type { Tenant } from "@/types/raas";

interface Props {
  tenant: Tenant;
  solUsd: number; // 0 if unavailable
}

const LAMPORTS_PER_SOL = 1_000_000_000;

const DURATIONS = [
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 21600 },
  { label: "24 hours", seconds: 86400 },
  { label: "3 days", seconds: 259200 },
  { label: "7 days", seconds: 604800 },
];

export function CreatePoolWizard({ tenant, solUsd }: Props) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const router = useRouter();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceSol, setPriceSol] = useState(0.1);
  const [duration, setDuration] = useState(86400);
  const [creatorFeeBps, setCreatorFeeBps] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const priceUsd = (priceSol * solUsd).toFixed(2);
  const creatorFeePct = (creatorFeeBps / 100).toFixed(1);

  async function submit() {
    if (!publicKey || !signTransaction) {
      setError("Connect your wallet first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // Mirror BuyTicketPrivateButton's signer shim pattern exactly.
      const creatorSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;

      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });

      // pool_id: Date.now() truncated to 31 bits fits safely in u64
      const poolId = BigInt(Date.now() & 0x7fffffff);
      const ticketPriceLamports = BigInt(Math.round(priceSol * LAMPORTS_PER_SOL));
      const durationSeconds = BigInt(duration);

      // Public mode = WhitelistMode (numeric enum = 0) with all-zero merkle root.
      // Any wallet can buy once via buy_ticket_private after the operator
      // whitelists them; in Public mode the operator never gates anyone.
      // Zero root is the agreed sentinel (Plan 2 Risk §3 / D-071).
      const kitIx = await client.createPrivatePool({
        creator: creatorSigner,
        poolId,
        ticketPrice: ticketPriceLamports,
        duration: durationSeconds,
        creatorFeeBps,
        accessMode: AccessMode.WhitelistMode,
        merkleRoot: new Uint8Array(32),
      });

      const tx = new Transaction().add(kitToWeb3(kitIx));
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

      // Derive pool PDA using sdk-v2 helper (no hand-construction).
      const [poolPdaAddress] = await findPrivatePoolPda(
        PROGRAM_ID as Address,
        publicKey.toBase58() as Address,
        poolId,
      );
      const poolPubkey = new PublicKey(poolPdaAddress).toBase58();

      // Attribute the pool to this tenant.
      const res = await fetch(`/api/r/pool/${poolPubkey}/attribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_slug: tenant.slug }),
      });
      if (!res.ok) {
        // Attribution failure is non-fatal for the creator (pool is on-chain already).
        console.warn("Pool attribution failed:", await res.text());
      }

      router.push(`/r/${tenant.slug}/pool/${poolPubkey}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // description is captured in state for future use (e.g. metadata upload)
  void description;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Create a raffle</h1>

      <label className="block">
        <span className="text-sm">Raffle name</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          placeholder="Weekly #1"
        />
      </label>

      <label className="block">
        <span className="text-sm">Description (optional)</span>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
          rows={2}
          placeholder="50 SOL prize pot — winner takes all"
        />
      </label>

      <label className="block">
        <span className="text-sm">Ticket price (SOL)</span>
        <input
          type="number"
          step="0.001"
          min="0.001"
          value={priceSol}
          onChange={(e) => setPriceSol(parseFloat(e.target.value) || 0)}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        />
        {solUsd > 0 && (
          <span className="text-xs opacity-60">≈ ${priceUsd} USD</span>
        )}
      </label>

      <label className="block">
        <span className="text-sm">Duration</span>
        <select
          value={duration}
          onChange={(e) => setDuration(parseInt(e.target.value))}
          className="w-full rounded-md bg-neutral-900 border border-neutral-700 px-3 py-2"
        >
          {DURATIONS.map((d) => (
            <option key={d.seconds} value={d.seconds}>
              {d.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm">
          Your cut: <strong>{creatorFeePct}%</strong>
        </span>
        <input
          type="range"
          min="0"
          max="3000"
          step="50"
          value={creatorFeeBps}
          onChange={(e) => setCreatorFeeBps(parseInt(e.target.value))}
          className="w-full"
        />
        <span className="text-xs opacity-60">
          On a 100 SOL pot, you&apos;d earn{" "}
          {(100 * (creatorFeeBps / 10000)).toFixed(1)} SOL. Tombola takes 1%
          ({(100 * 0.01).toFixed(1)} SOL). Winner gets{" "}
          {(100 * (1 - 0.01 - creatorFeeBps / 10000)).toFixed(1)} SOL.
        </span>
      </label>

      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={submit}
        disabled={submitting || !publicKey || !name}
        className="px-4 py-2 rounded-md bg-mint text-black font-semibold disabled:opacity-30"
      >
        {submitting ? "Creating…" : "Create raffle"}
      </button>
    </div>
  );
}
