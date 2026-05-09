"use client";
import { useCallback, useMemo, useState } from "react";
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
import { saveCodesToStorage } from "@/lib/private-pool-storage";

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

  const ctaActive = isValid && !busy;
  const ctaTearBg = ctaActive ? "#88cfc4" : "#1a1a1a";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-5"
    >
      {/* TICKET PRICE — hero block, mirrors PoolCard's POT block: mint
          gradient wash + big display-font value. The input itself uses
          display font so the typed number scales like a POT readout. */}
      <div
        className="rounded-2xl border border-neutral-900 p-5"
        style={{
          backgroundImage: `linear-gradient(135deg, ${MINT}14, transparent 70%)`,
        }}
      >
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="priceSol"
            className="font-mono text-[10px] uppercase tracking-widest text-neutral-500"
          >
            Ticket price
          </label>
          <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
            What each ticket costs
          </span>
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <input
            id="priceSol"
            type="number"
            step="0.001"
            min="0.001"
            value={priceSol}
            onChange={(e) => setPriceSol(e.target.value)}
            placeholder="0.01"
            className="w-full min-w-0 bg-transparent font-display text-4xl uppercase leading-none tabular-nums outline-none placeholder:text-neutral-700 focus:outline-none sm:text-5xl"
            style={{ color: MINT }}
          />
          <span className="font-display text-2xl uppercase text-neutral-500">
            SOL
          </span>
        </div>
        {errors.priceSol && (
          <p
            className="mt-2 font-mono text-[10px] uppercase tracking-widest text-rose-400"
            role="alert"
          >
            {errors.priceSol}
          </p>
        )}
      </div>

      {/* DURATION / FEE / CODES — mini stat grid, mirrors PoolCard's
          tickets/buyers/closes-in tile row. Each input lives inside its own
          neutral card with mono caps label + display-font value. */}
      <div className="grid grid-cols-3 gap-2">
        <MiniStatInput
          id="days"
          label="Days"
          value={days}
          onChange={setDays}
          min={0}
          max={90}
          // Show hours under the days input as a secondary control so the
          // 3-tile rhythm stays clean. Days is the dominant axis (1d–90d).
          subInput={
            <input
              id="hours"
              aria-label="Hours"
              type="number"
              min="0"
              max="23"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full bg-transparent font-mono text-[10px] uppercase tabular-nums tracking-widest text-neutral-400 outline-none placeholder:text-neutral-700"
              placeholder="0"
            />
          }
          subLabel="hrs"
          errorOnRow={errors.duration}
        />
        <MiniStatInput
          id="feePct"
          label="Fee %"
          value={feePct}
          onChange={setFeePct}
          min={0}
          max={5}
          step={0.5}
          errorOnRow={errors.feePct}
        />
        <MiniStatInput
          id="codeCount"
          label="Codes"
          value={codeCount}
          onChange={setCodeCount}
          min={1}
          max={5000}
          errorOnRow={errors.codeCount}
        />
      </div>

      {/* ACCESS MODE — segmented pill toggle. Mint-tinted on the active
          option, neutral on the inactive. Replaces the old radio row for a
          cleaner toggle metaphor. */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Access mode
        </span>
        <div className="grid grid-cols-2 gap-2 rounded-xl border border-neutral-900 bg-neutral-950/80 p-1">
          <ModeOption
            active={mode === "Whitelist"}
            onClick={() => setMode("Whitelist")}
            title="Whitelist"
            sub="code unlocks unlimited buys"
          />
          <ModeOption
            active={mode === "OneCodePerTicket"}
            onClick={() => setMode("OneCodePerTicket")}
            title="One per code"
            sub="single ticket per redemption"
          />
        </div>
      </div>

      {/* CREATE POOL — tear-corner CTA. Disabled state uses a near-black
          tear-bg (no mint chip) so it doesn't look like an accent button
          you can press. */}
      <button
        type="submit"
        disabled={!ctaActive}
        style={{ ["--tear-bg" as never]: ctaTearBg }}
        className="btn-fx fx-tear mt-2 flex w-full items-center justify-center gap-2 px-4 py-4 font-display text-sm uppercase tracking-widest transition hover:brightness-110 disabled:cursor-not-allowed"
      >
        {busy ? (
          <span className="text-neutral-500">CREATING…</span>
        ) : ctaActive ? (
          <>
            <span className="text-black">CREATE POOL</span>
            <span className="chip-flip flex h-7 w-7 items-center justify-center rounded-full bg-black text-xs text-[#88cfc4]">
              →
            </span>
          </>
        ) : (
          <>
            <span className="text-neutral-500">CREATE POOL</span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-neutral-800 text-xs text-neutral-600">
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
  );
}

const MINT = "#88cfc4";

function MiniStatInput({
  id,
  label,
  value,
  onChange,
  min,
  max,
  step,
  subInput,
  subLabel,
  errorOnRow,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
  subInput?: React.ReactNode;
  subLabel?: string;
  errorOnRow?: string;
}) {
  return (
    <div
      className={`rounded-xl border bg-neutral-950/80 p-3 transition ${
        errorOnRow
          ? "border-rose-700/50"
          : "border-neutral-900 focus-within:border-[#88cfc4]/40"
      }`}
    >
      <label
        htmlFor={id}
        className="font-mono text-[9px] uppercase tracking-widest text-neutral-500"
      >
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full bg-transparent font-display text-xl uppercase tabular-nums outline-none focus:outline-none"
      />
      {subInput && (
        <div className="mt-1 flex items-baseline justify-between gap-1">
          {subInput}
          {subLabel && (
            <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
              {subLabel}
            </span>
          )}
        </div>
      )}
      {errorOnRow && (
        <p
          className="mt-1 font-mono text-[9px] uppercase tracking-widest text-rose-400"
          role="alert"
        >
          {errorOnRow}
        </p>
      )}
    </div>
  );
}

function ModeOption({
  active,
  onClick,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={
        active
          ? {
              borderColor: `${MINT}66`,
              background: `${MINT}1a`,
            }
          : undefined
      }
      className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition ${
        active ? "" : "border-transparent text-neutral-300 hover:bg-neutral-900/60"
      }`}
    >
      <span
        className="font-display text-sm uppercase"
        style={active ? { color: MINT } : undefined}
      >
        {title}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-500">
        {sub}
      </span>
    </button>
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
