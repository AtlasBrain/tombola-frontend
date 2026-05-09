"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Transaction } from "@solana/web3.js";
import { createSolanaRpc, type TransactionSigner } from "@solana/kit";
import {
  buildCodeTree,
  generateInviteCode,
  PROGRAM_ID,
  RaffleClient,
  AccessMode,
} from "@tombola/sdk";
import { kitToWeb3 } from "@/lib/kit-to-web3";
import { findMyPrivatePools, type RedemptionMode } from "@/lib/private-pools";
import {
  saveCodesToStorage,
  loadAllCodesForWallet,
} from "@/lib/private-pool-storage";

const MIN_DURATION_SECS = 3_600;
const MAX_DURATION_SECS = 90 * 86_400;
const MAX_CODE_COUNT = 5_000;
const MAX_FEE_PCT = 5.0;

interface OnCreatedPayload {
  poolAddress: string;
  codes: string[];
  proofs: Record<string, Uint8Array[]>;
  mode: RedemptionMode;
}

interface Props {
  onCreated: (payload: OnCreatedPayload) => void;
}

export function CreatePoolForm({ onCreated }: Props) {
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [priceSol, setPriceSol] = useState("");
  const [days, setDays] = useState("1");
  const [hours, setHours] = useState("0");
  const [feePct, setFeePct] = useState("0");
  const [codeCount, setCodeCount] = useState("10");
  const [mode, setMode] = useState<RedemptionMode>("Whitelist");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [unsavedPools, setUnsavedPools] = useState<
    Array<{ poolAddress: string; createdAt: number }>
  >([]);

  useEffect(() => {
    if (!publicKey) {
      setUnsavedPools([]);
      return;
    }
    const all = loadAllCodesForWallet(publicKey.toBase58());
    setUnsavedPools(
      all
        .map((p) => ({ poolAddress: p.poolAddress, createdAt: p.createdAt }))
        .sort((a, b) => b.createdAt - a.createdAt),
    );
  }, [publicKey]);

  const errors = useMemo(
    () => validate({ priceSol, days, hours, feePct, codeCount }),
    [priceSol, days, hours, feePct, codeCount],
  );

  const isValid = Object.keys(errors).length === 0;

  const onSubmit = useCallback(async () => {
    if (!isValid) return;
    if (!publicKey || !signTransaction) {
      setWalletModalVisible(true);
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const ticketPrice = BigInt(Math.round(Number(priceSol) * 1e9));
      const duration = BigInt(Number(days) * 86_400 + Number(hours) * 3_600);
      const creatorFeeBps = Math.round(Number(feePct) * 100);
      const count = Number(codeCount);

      // Generate codes + Merkle tree client-side
      const codes = Array.from({ length: count }, () => generateInviteCode());
      const { root, proofs } = buildCodeTree(codes);

      // Derive next pool_id by counting existing pools by this creator
      const existing = await findMyPrivatePools({
        rpcUrl: connection.rpcEndpoint,
        programId: PROGRAM_ID,
        walletAddress: publicKey.toBase58(),
      });
      const poolId = BigInt(existing.length);

      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const creatorSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;

      const accessMode =
        mode === "Whitelist"
          ? AccessMode.WhitelistMode
          : AccessMode.OneCodePerTicket;

      const ix = await client.createPrivatePool({
        creator: creatorSigner,
        poolId,
        ticketPrice,
        duration,
        creatorFeeBps,
        accessMode,
        merkleRoot: root,
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

      const [poolAddress] = await client.privatePoolPda(
        publicKey.toBase58() as never,
        poolId,
      );

      // proofs is already keyed by code string from buildCodeTree
      const proofMap: Record<string, Uint8Array[]> = { ...proofs };

      // Persist codes locally so the creator can recover them after navigating
      // away. Wraps in try/catch — if localStorage write fails (private mode /
      // quota), surface a warning but don't fail the whole flow because the
      // on-chain pool already exists at this point.
      try {
        saveCodesToStorage({
          poolAddress,
          creator: publicKey.toBase58(),
          createdAt: Math.floor(Date.now() / 1000),
          mode,
          codes,
          proofs,
        });
      } catch (storageErr) {
        console.warn("saveCodesToStorage failed:", storageErr);
        setErr(
          "Couldn't save codes to browser storage — copy/download them now or they're lost.",
        );
      }

      onCreated({ poolAddress, codes, proofs: proofMap, mode });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(msg.length > 200 ? msg.slice(0, 200) + "…" : msg);
      console.error("create pool failed:", e);
    } finally {
      setBusy(false);
    }
  }, [
    publicKey,
    signTransaction,
    isValid,
    priceSol,
    days,
    hours,
    feePct,
    codeCount,
    mode,
    connection,
    onCreated,
    setWalletModalVisible,
  ]);

  return (
    <>
      {unsavedPools.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-700/40 bg-amber-900/20 p-4">
          <p className="text-sm font-semibold text-amber-300">
            You have {unsavedPools.length} pool
            {unsavedPools.length === 1 ? "" : "s"} with redemption links saved
            in this browser.
          </p>
          <ul className="mt-2 space-y-1 text-xs text-amber-200">
            {unsavedPools.slice(0, 5).map((p) => (
              <li key={p.poolAddress} className="flex items-center justify-between">
                <code className="font-mono">
                  {p.poolAddress.slice(0, 8)}…{p.poolAddress.slice(-4)}
                </code>
                <Link
                  href={`/create/my-pools/${p.poolAddress}`}
                  className="rounded bg-amber-800/50 px-2 py-1 hover:bg-amber-800"
                >
                  Open admin →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6"
      >
      <FieldRow
        label="Ticket price (SOL)"
        htmlFor="priceSol"
        error={errors.priceSol}
      >
        <input
          id="priceSol"
          type="number"
          step="0.001"
          min="0.001"
          value={priceSol}
          onChange={(e) => setPriceSol(e.target.value)}
          className="rounded bg-neutral-800 px-3 py-2 text-neutral-100"
        />
      </FieldRow>
      <FieldRow label="Duration" error={errors.duration}>
        <div className="flex gap-2">
          <input
            id="days"
            aria-label="Days"
            type="number"
            min="0"
            max="90"
            value={days}
            onChange={(e) => setDays(e.target.value)}
            className="w-24 rounded bg-neutral-800 px-3 py-2"
          />
          <span className="text-sm text-neutral-500">days</span>
          <input
            id="hours"
            aria-label="Hours"
            type="number"
            min="0"
            max="23"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            className="w-24 rounded bg-neutral-800 px-3 py-2"
          />
          <span className="text-sm text-neutral-500">hours</span>
        </div>
      </FieldRow>
      <FieldRow
        label="Creator fee (%)"
        htmlFor="feePct"
        error={errors.feePct}
      >
        <input
          id="feePct"
          type="number"
          step="0.5"
          min="0"
          max="5"
          value={feePct}
          onChange={(e) => setFeePct(e.target.value)}
          className="w-24 rounded bg-neutral-800 px-3 py-2"
        />
      </FieldRow>
      <FieldRow
        label="Number of codes"
        htmlFor="codeCount"
        error={errors.codeCount}
      >
        <input
          id="codeCount"
          type="number"
          min="1"
          max="5000"
          value={codeCount}
          onChange={(e) => setCodeCount(e.target.value)}
          className="w-32 rounded bg-neutral-800 px-3 py-2"
        />
      </FieldRow>
      <FieldRow label="Access mode">
        <div className="flex gap-4 text-sm text-neutral-200">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="mode"
              value="Whitelist"
              checked={mode === "Whitelist"}
              onChange={() => setMode("Whitelist")}
            />
            Whitelist (code unlocks unlimited buys)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="mode"
              value="OneCodePerTicket"
              checked={mode === "OneCodePerTicket"}
              onChange={() => setMode("OneCodePerTicket")}
            />
            One ticket per code
          </label>
        </div>
      </FieldRow>

      <button
        type="submit"
        disabled={!isValid || busy}
        className="mt-4 rounded bg-emerald-600 px-4 py-3 font-semibold text-white disabled:cursor-not-allowed disabled:bg-neutral-700"
      >
        {busy ? "Creating…" : "Create pool"}
      </button>
      {err && (
        <p role="alert" className="text-sm text-red-400">
          {err}
        </p>
      )}
      </form>
    </>
  );
}

function FieldRow({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={htmlFor} className="text-sm text-neutral-300">
        {label}
      </label>
      {children}
      {error && (
        <p className="text-xs text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function validate(args: {
  priceSol: string;
  days: string;
  hours: string;
  feePct: string;
  codeCount: string;
}): Record<string, string> {
  const errs: Record<string, string> = {};
  const price = Number(args.priceSol);
  if (!Number.isFinite(price) || price <= 0) {
    errs.priceSol = "Ticket price must be > 0";
  }
  const days = Number(args.days);
  const hours = Number(args.hours);
  const totalSec = days * 86_400 + hours * 3_600;
  if (totalSec < MIN_DURATION_SECS) {
    errs.duration = "Duration must be at least 1 hour";
  } else if (totalSec > MAX_DURATION_SECS) {
    errs.duration = "Duration must be at most 90 days";
  }
  const fee = Number(args.feePct);
  if (!Number.isFinite(fee) || fee < 0 || fee > MAX_FEE_PCT) {
    errs.feePct = `Creator fee must be at most 5%`;
  }
  const count = Number(args.codeCount);
  if (!Number.isInteger(count) || count < 1 || count > MAX_CODE_COUNT) {
    errs.codeCount = `Code count must be 1..at most 5000`;
  }
  return errs;
}
