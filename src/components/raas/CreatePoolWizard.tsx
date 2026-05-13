"use client";

import { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useRouter } from "next/navigation";
import type { Tenant } from "@/types/raas";

interface Props {
  tenant: Tenant;
  solUsd: number; // 0 if unavailable
}

const DURATIONS = [
  { label: "1 hour", seconds: 3600 },
  { label: "6 hours", seconds: 21600 },
  { label: "24 hours", seconds: 86400 },
  { label: "3 days", seconds: 259200 },
  { label: "7 days", seconds: 604800 },
];

export function CreatePoolWizard({ tenant, solUsd }: Props) {
  const { publicKey, signTransaction } = useWallet();
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
      throw new Error(
        "STUB: chain submit wired in Task 12 commit",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

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

      {/* unused vars kept to avoid re-work in Task 12 */}
      <span data-tenant-slug={tenant.slug} className="hidden" />
      <span data-router={router ? "yes" : "no"} className="hidden" />
    </div>
  );
}
