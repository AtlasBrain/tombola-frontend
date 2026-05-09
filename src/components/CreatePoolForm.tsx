"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey, Transaction } from "@solana/web3.js";
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

      const rpc = createSolanaRpc(connection.rpcEndpoint);
      const client = new RaffleClient({ rpc });
      const creatorSigner = {
        address: publicKey.toBase58(),
      } as unknown as TransactionSigner;

      // Derive next pool_id by counting existing pools, then probe forward to
      // find the first un-allocated PDA. The count is a hint; the probe is
      // authoritative — it survives a stale dataSize filter or a partial reset.
      const existing = await findMyPrivatePools({
        rpcUrl: connection.rpcEndpoint,
        programId: PROGRAM_ID,
        walletAddress: publicKey.toBase58(),
      });
      let poolId = BigInt(existing.length);
      const MAX_PROBE = 64;
      for (let i = 0; i < MAX_PROBE; i++) {
        const [candidate] = await client.privatePoolPda(
          publicKey.toBase58() as never,
          poolId,
        );
        const info = await connection.getAccountInfo(
          new PublicKey(candidate),
          "confirmed",
        );
        if (info === null) break;
        poolId += 1n;
        if (i === MAX_PROBE - 1) {
          throw new Error(
            "Could not find an unused pool_id within 64 probes from the count hint.",
          );
        }
      }

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

  const inputCls =
    "rounded-lg border border-neutral-800 bg-neutral-950/50 px-3 py-2 text-neutral-100 tabular-nums outline-none transition focus:border-[#88cfc4]/40 focus:ring-2 focus:ring-[#88cfc4]/20";

  return (
    <>
      {unsavedPools.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-700/40 bg-amber-900/20 p-4">
          <p className="font-mono text-[10px] uppercase tracking-widest text-amber-300">
            Saved in this browser
          </p>
          <p className="mt-1 text-sm text-amber-200">
            You have {unsavedPools.length} pool
            {unsavedPools.length === 1 ? "" : "s"} with redemption links saved
            locally.
          </p>
          <ul className="mt-3 space-y-1 text-xs">
            {unsavedPools.slice(0, 5).map((p) => (
              <li
                key={p.poolAddress}
                className="flex items-center justify-between"
              >
                <code className="font-mono text-amber-100">
                  {p.poolAddress.slice(0, 8)}…{p.poolAddress.slice(-4)}
                </code>
                <Link
                  href={`/create/my-pools/${p.poolAddress}`}
                  className="rounded-full bg-amber-800/50 px-3 py-1 font-mono text-[10px] uppercase tracking-widest hover:bg-amber-800"
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
        className="grad-private flex flex-col gap-5 rounded-3xl border border-neutral-800 bg-neutral-950 p-7"
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
            placeholder="0.01"
            className={`w-full ${inputCls}`}
          />
        </FieldRow>
        <FieldRow label="Duration" error={errors.duration}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              id="days"
              aria-label="Days"
              type="number"
              min="0"
              max="90"
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className={`w-24 ${inputCls}`}
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              days
            </span>
            <input
              id="hours"
              aria-label="Hours"
              type="number"
              min="0"
              max="23"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className={`w-24 ${inputCls}`}
            />
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              hours
            </span>
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
            className={`w-24 ${inputCls}`}
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
            className={`w-32 ${inputCls}`}
          />
        </FieldRow>
        <FieldRow label="Access mode">
          <div className="flex flex-col gap-2 text-sm text-neutral-200 sm:flex-row sm:gap-6">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="mode"
                value="Whitelist"
                checked={mode === "Whitelist"}
                onChange={() => setMode("Whitelist")}
                className="accent-[#88cfc4]"
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
                className="accent-[#88cfc4]"
              />
              One ticket per code
            </label>
          </div>
        </FieldRow>

        <button
          type="submit"
          disabled={!isValid || busy}
          style={{ ["--tear-bg" as never]: isValid && !busy ? "#88cfc4" : "#2a2a2f" }}
          className="btn-fx fx-tear mt-2 flex w-full items-center justify-center gap-2 px-4 py-4 font-display text-sm uppercase tracking-widest text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:text-neutral-500"
        >
          {busy ? (
            "CREATING…"
          ) : (
            <>
              CREATE POOL
              <span className="chip-flip flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs text-[#88cfc4]">
                →
              </span>
            </>
          )}
        </button>
        {err && (
          <p role="alert" className="text-sm text-rose-400">
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
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="font-mono text-[10px] uppercase tracking-widest text-neutral-500"
      >
        {label}
      </label>
      {children}
      {error && (
        <p
          className="font-mono text-[10px] uppercase tracking-widest text-rose-400"
          role="alert"
        >
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
