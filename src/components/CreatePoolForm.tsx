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
import {
  bytesToBase64Url,
  saveCodesToStorage,
} from "@/lib/private-pool-storage";
import { pushNotification } from "@/lib/notifications";
import { createPoolInviteBatch } from "@/lib/pool-invite-client";
import { FriendPicker } from "@/components/FriendPicker";

const MIN_DURATION_SECS = 3_600;
const MAX_DURATION_SECS = 90 * 86_400;
const MAX_CODE_COUNT = 5_000;
const MAX_FEE_PCT = 5.0;

/** The on-chain AccessMode plus the FRIENDS UI flavor. FRIENDS pools
 *  are stored as Whitelist on-chain (codes baked into a merkle tree);
 *  the UI just hides the codes and pre-allocates them to picked friends. */
export type CreateUiMode = "Whitelist" | "Friends" | "OneCodePerTicket";

interface OnCreatedPayload {
  poolAddress: string;
  codes: string[];
  proofs: Record<string, Uint8Array[]>;
  mode: RedemptionMode;
  uiMode: CreateUiMode;
  /** Friends that were allocated codes at pool-create time. Only set
   *  when uiMode === "Friends". */
  invitedFriends: string[];
}

interface Props {
  onCreated: (payload: OnCreatedPayload) => void;
}

export function CreatePoolForm({ onCreated }: Props) {
  const { connection } = useConnection();
  const { publicKey, signTransaction, signMessage } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  // Pre-populate every field with a sensible default so the form opens in
  // the "ready to submit" state — no validation error visible, CTA enabled,
  // every input rendering its mint value. The creator can override any field
  // before clicking CREATE POOL.
  const [priceSol, setPriceSol] = useState("0.01");
  const [days, setDays] = useState("1");
  const [hours, setHours] = useState("0");
  const [feePct, setFeePct] = useState("0");
  const [codeCount, setCodeCount] = useState("10");
  const [uiMode, setUiMode] = useState<CreateUiMode>("Whitelist");
  /** Friends picked for FRIENDS-mode allocation. The form forces
   *  codeCount to match this list on submit. */
  const [pickedFriends, setPickedFriends] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // FRIENDS mode bakes one code per picked friend, so the "codes" input
  // is meaningless. Use the picker length as the effective count for
  // validation.
  const effectiveCodeCount =
    uiMode === "Friends" ? String(pickedFriends.length) : codeCount;

  const errors = useMemo(
    () =>
      validate({
        priceSol,
        days,
        hours,
        feePct,
        codeCount: effectiveCodeCount,
        uiMode,
        pickedFriendCount: pickedFriends.length,
      }),
    [priceSol, days, hours, feePct, effectiveCodeCount, uiMode, pickedFriends.length],
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
      // FRIENDS mode: one code per picked friend, no extra reserve.
      const count =
        uiMode === "Friends" ? pickedFriends.length : Number(codeCount);

      // Generate codes + Merkle tree client-side
      const codes = Array.from({ length: count }, () => generateInviteCode());
      const { root, proofs } = buildCodeTree(codes);
      // FRIENDS mode wires Whitelist on-chain — the only flavor of access
      // mode that supports merkle-proof-gated redemption per code.
      const mode: RedemptionMode =
        uiMode === "OneCodePerTicket" ? "OneCodePerTicket" : "Whitelist";

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

      pushNotification({
        wallet: publicKey.toBase58(),
        kind: "created",
        title: `Created private pool`,
        body:
          uiMode === "Friends"
            ? `Invited ${count} friend${count === 1 ? "" : "s"} · ${priceSol} SOL/ticket`
            : `${count} invite code${count === 1 ? "" : "s"} · ${priceSol} SOL/ticket`,
        href: `/pool/private/${poolAddress}`,
        dedupeId: `created-${poolAddress}`,
      });

      // FRIENDS mode: batch-allocate the freshly-baked codes to the
      // picked friends in one signed call. We do this AFTER the on-chain
      // tx confirms so the (pool, friend) KV row always points at a
      // valid Whitelisted-PDA target.
      let invitedFriends: string[] = [];
      if (uiMode === "Friends" && pickedFriends.length > 0 && signMessage) {
        try {
          const batch = pickedFriends.map((friend, i) => ({
            friend,
            code: codes[i],
            // proofs is keyed by code string. Encode each merkle step as
            // base64url so it ships cleanly over JSON.
            proofsBase64: (proofs[codes[i]] ?? []).map(bytesToBase64Url),
          }));
          const results = await createPoolInviteBatch({
            inviter: publicKey.toBase58(),
            signMessage,
            pool: String(poolAddress),
            friends: batch,
          });
          invitedFriends = results
            .filter((r) => r.ok)
            .map((r) => r.friend);
          const failed = results.filter((r) => !r.ok);
          if (failed.length > 0) {
            setErr(
              `Pool created but ${failed.length} invite${failed.length === 1 ? "" : "s"} failed — open the pool admin to retry.`,
            );
          }
        } catch (inviteErr) {
          // Don't fail the whole flow — the pool already exists on-chain;
          // the creator can re-issue invites from the admin tab.
          console.warn("invite batch failed:", inviteErr);
          setErr(
            "Pool created but couldn't allocate invites to friends. Open the pool admin to send them.",
          );
        }
      }

      onCreated({
        poolAddress,
        codes,
        proofs: proofMap,
        mode,
        uiMode,
        invitedFriends,
      });
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
    signMessage,
    isValid,
    priceSol,
    days,
    hours,
    feePct,
    codeCount,
    uiMode,
    pickedFriends,
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

      {/* DAYS / HOURS / FEE / CODES — 4 equal mini-stat tiles in a row.
          Days and hours used to share a tile (days dominant, hours sub-input)
          which made hours feel demoted. They're now separate tiles, same
          size, both with display-font values in mint — duration is a single
          row instead of nested. errors.duration surfaces under the Days
          tile since that's the dominant axis; clearing days alone shows the
          violation immediately. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStatInput
          id="days"
          label="Days"
          value={days}
          onChange={setDays}
          min={0}
          max={90}
          errorOnRow={errors.duration}
        />
        <MiniStatInput
          id="hours"
          label="Hours"
          value={hours}
          onChange={setHours}
          min={0}
          max={23}
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
        {/* Code count is hidden in FRIENDS mode — the friend picker
            determines how many codes the merkle tree contains. */}
        {uiMode !== "Friends" && (
          <MiniStatInput
            id="codeCount"
            label="Codes"
            value={codeCount}
            onChange={setCodeCount}
            min={1}
            max={5000}
            errorOnRow={errors.codeCount}
          />
        )}
      </div>

      {/* ACCESS MODE — 3 radio cards. Spans the whole width so the
          accent (FRIENDS) reads. Each card has a title + 1-line
          explanation; selected card is mint-bordered with a fill. */}
      <div className="flex flex-col gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
          Access mode
        </span>
        <div className="flex flex-col gap-2">
          <ModeRadio
            active={uiMode === "Whitelist"}
            onClick={() => setUiMode("Whitelist")}
            title="WHITELIST · invite codes"
            sub="Generate N redemption links to copy and share manually."
          />
          <ModeRadio
            active={uiMode === "Friends"}
            onClick={() => setUiMode("Friends")}
            title="FRIENDS · pick from list"
            sub="Codes hidden; allocated automatically to friends you pick."
            badge="NEW"
          />
          <ModeRadio
            active={uiMode === "OneCodePerTicket"}
            onClick={() => setUiMode("OneCodePerTicket")}
            title="PUBLIC · one code per ticket"
            sub="Bearer-token codes — anyone with a code can join."
          />
        </div>
      </div>

      {uiMode === "Friends" && publicKey && (
        <div className="flex flex-col gap-3 rounded-xl border border-neutral-900 bg-neutral-950/60 p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              Pick friends to invite
            </span>
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-600">
              one code per friend · max 100
            </span>
          </div>
          <FriendPicker
            caller={publicKey.toBase58()}
            value={pickedFriends}
            onChange={setPickedFriends}
            maxSelected={100}
            emptyHint="Add friends first — use ⌘K to search, then send a friend request from their profile."
            compact
          />
          {errors.pickedFriendCount && (
            <p
              className="font-mono text-[10px] uppercase tracking-widest text-rose-400"
              role="alert"
            >
              {errors.pickedFriendCount}
            </p>
          )}
        </div>
      )}

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
  errorOnRow,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  min: number;
  max: number;
  step?: number;
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
        // Tint values mint so they read as the same brand color as the
        // ticket-price hero number above. UA default is black-on-dark,
        // which made the values nearly invisible on the dark panel.
        style={{ color: "#88cfc4" }}
        className="mt-1 w-full bg-transparent font-display text-xl uppercase tabular-nums outline-none focus:outline-none"
      />
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

function ModeRadio({
  active,
  onClick,
  title,
  sub,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  sub: string;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={
        active
          ? {
              borderColor: MINT,
              background: `${MINT}10`,
            }
          : undefined
      }
      className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
        active ? "" : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700"
      }`}
    >
      <span
        className="relative inline-block h-4 w-4 shrink-0 rounded-full border-2"
        style={{
          borderColor: active ? MINT : "#3f3f46",
        }}
        aria-hidden
      >
        {active && (
          <span
            className="absolute inset-[3px] rounded-full"
            style={{ background: MINT }}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`flex items-center gap-2 font-display text-sm uppercase tracking-tight ${
            active ? "" : "text-neutral-100"
          }`}
          style={active ? { color: MINT } : undefined}
        >
          {title}
          {badge && (
            <span
              className="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest"
              style={{
                background: `${MINT}26`,
                color: MINT,
                border: `1px solid ${MINT}66`,
              }}
            >
              {badge}
            </span>
          )}
        </span>
        <span className="font-mono text-[10px] text-neutral-500">{sub}</span>
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
  uiMode: CreateUiMode;
  pickedFriendCount: number;
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
  if (args.uiMode === "Friends") {
    // FRIENDS mode: validate the picker length, not the hidden codeCount
    // input. Need at least one selection to create a meaningful pool.
    if (args.pickedFriendCount < 1) {
      errs.pickedFriendCount = "Pick at least 1 friend to invite";
    } else if (args.pickedFriendCount > MAX_CODE_COUNT) {
      errs.pickedFriendCount = `At most ${MAX_CODE_COUNT} friends per pool`;
    }
  } else {
    const count = Number(args.codeCount);
    if (!Number.isInteger(count) || count < 1 || count > MAX_CODE_COUNT) {
      errs.codeCount = `Code count must be 1..at most 5000`;
    }
  }
  return errs;
}
