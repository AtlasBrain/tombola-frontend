"use client";

// Tab body that lists existing pool invites + lets the creator add more
// from unused codes in localStorage. Used in two places:
//
//   1. CreatePoolModal — right after a pool is created, on the success
//      screen. Initial allocations from FRIENDS mode already populate
//      the list; the picker lets the creator allocate more.
//   2. /create/my-pools/[pubkey] — admin page, ongoing management.
//
// Pulls invite metadata via /api/pool-invite/by-pool/[pool] (react-
// query cached). Add flow loads codes from localStorage, picks one per
// new friend, and POSTs the batch endpoint. Revoke flow refunds the
// code back to localStorage (it's safe to re-allocate to a different
// friend because the code never left the inviter's machine until now).

import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  createPoolInviteBatch,
  getInvitesForPool,
  revokePoolInvite,
  type InvitePublicView,
} from "@/lib/pool-invite-client";
import {
  bytesToBase64Url,
  loadCodesFromStorage,
  saveCodesToStorage,
} from "@/lib/private-pool-storage";
import { FriendPicker } from "@/components/FriendPicker";
import { WalletLink } from "@/components/WalletLink";
import { useToast } from "@/components/Toast";

const MINT = "#88cfc4";
const SAND = "#e8d89e";

interface Props {
  /** Pool address — keyed for the by-pool query. */
  poolAddress: string;
}

export function InviteFriendsTab({ poolAddress }: Props) {
  const { publicKey, signMessage } = useWallet();
  const qc = useQueryClient();
  const { push: pushToast } = useToast();
  const [picked, setPicked] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const invitesQuery = useQuery({
    queryKey: ["poolInvites", "by-pool", poolAddress],
    queryFn: () => getInvitesForPool(poolAddress),
  });

  const invites = invitesQuery.data ?? [];
  const invitedWallets = useMemo(
    () => new Set(invites.map((i) => i.friend)),
    [invites],
  );

  // Codes left to allocate from localStorage. The creator may not have
  // codes available here (e.g. they navigated to the admin page from a
  // different browser) — in that case we hide the add UI and explain.
  const inviter = publicKey?.toBase58();
  const stored = useMemo(() => {
    if (!inviter) return null;
    return loadCodesFromStorage(poolAddress, inviter);
  }, [poolAddress, inviter]);

  const usedCodes = useMemo(() => {
    // Server returns the inviter for each row but not the code (secret-
    // gated). We can't directly identify which stored codes are used, so
    // we conservatively assume invites.length codes are off-the-table.
    return invites.length;
  }, [invites.length]);

  const availableCodes = stored ? stored.codes.length - usedCodes : 0;

  const canAdd =
    !!inviter && !!signMessage && availableCodes > 0 && !submitting;

  const submit = useCallback(async () => {
    if (!inviter || !signMessage || !stored) return;
    if (picked.length === 0) return;
    if (picked.length > availableCodes) return;
    setSubmitting(true);
    try {
      // Allocate the first N unused codes — order is arbitrary; codes
      // are unguessable bearer strings so ordering doesn't matter.
      const slice = stored.codes.slice(usedCodes, usedCodes + picked.length);
      const batch = picked.map((friend, i) => {
        const code = slice[i];
        const proofs = stored.proofs[code] ?? [];
        return {
          friend,
          code,
          proofsBase64: proofs.map(bytesToBase64Url),
        };
      });
      const results = await createPoolInviteBatch({
        inviter,
        signMessage,
        pool: poolAddress,
        friends: batch,
      });
      const ok = results.filter((r) => r.ok).length;
      const fail = results.length - ok;
      pushToast(
        fail === 0 ? "success" : "error",
        fail === 0
          ? `Sent ${ok} invite${ok === 1 ? "" : "s"}.`
          : `${ok} sent, ${fail} failed — see console.`,
      );
      if (fail > 0) {
        console.warn("invite batch failures:", results.filter((r) => !r.ok));
      }
      setPicked([]);
      await qc.invalidateQueries({
        queryKey: ["poolInvites", "by-pool", poolAddress],
      });
    } catch (e) {
      pushToast("error", e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }, [
    inviter,
    signMessage,
    stored,
    picked,
    availableCodes,
    usedCodes,
    poolAddress,
    qc,
    pushToast,
  ]);

  const revoke = useCallback(
    async (friend: string) => {
      if (!inviter || !signMessage || !stored) return;
      if (!confirm("Revoke this invite? The code will be returned to your unused pool.")) {
        return;
      }
      try {
        const { code, proofsBase64: _proofs } = await revokePoolInvite({
          inviter,
          signMessage,
          pool: poolAddress,
          friend,
        });
        // Refund the code to localStorage so the creator can re-allocate
        // it. The proofs entry is already keyed by code string and was
        // never deleted from stored.proofs — the original tree is intact.
        if (!stored.codes.includes(code)) {
          saveCodesToStorage({
            ...stored,
            codes: [...stored.codes, code],
          });
        }
        pushToast("success", "Invite revoked.");
        await qc.invalidateQueries({
          queryKey: ["poolInvites", "by-pool", poolAddress],
        });
      } catch (e) {
        pushToast("error", e instanceof Error ? e.message : String(e));
      }
    },
    [inviter, signMessage, stored, poolAddress, qc, pushToast],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Existing allocations */}
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <span
            className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: MINT }}
          >
            Invited · {invites.length}
          </span>
          {stored && (
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              {availableCodes} of {stored.codes.length} codes left
            </span>
          )}
        </div>
        {invitesQuery.isLoading ? (
          <p className="rounded-xl border border-neutral-800 bg-neutral-950/40 px-3 py-4 text-center font-mono text-[10px] uppercase tracking-widest text-neutral-500">
            Loading…
          </p>
        ) : invites.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 px-3 py-4 text-center text-xs text-neutral-500">
            No friends invited yet — pick some below to allocate codes.
          </p>
        ) : (
          <div className="flex flex-col">
            {invites.map((inv) => (
              <InviteRow key={inv.friend} invite={inv} onRevoke={revoke} />
            ))}
          </div>
        )}
      </div>

      {/* Add-more picker */}
      {!stored && inviter && (
        <div className="rounded-xl border border-dashed border-neutral-800 bg-neutral-900/30 p-3 text-center text-xs text-neutral-500">
          The unused codes for this pool aren’t in this browser. Open the
          original browser session to allocate more invites — codes never
          leave the creator’s device.
        </div>
      )}

      {canAdd && (
        <div className="rounded-xl border border-neutral-800 bg-neutral-950/60 p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              + Add friends — one code each
            </span>
          </div>
          <FriendPicker
            caller={inviter!}
            value={picked}
            onChange={setPicked}
            maxSelected={availableCodes}
            disabledWallets={invitedWallets}
            compact
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500">
              {picked.length === 0
                ? "Pick at least one friend"
                : `${picked.length} of ${availableCodes} ready`}
            </span>
            <button
              type="button"
              disabled={picked.length === 0 || submitting}
              onClick={submit}
              style={{
                background: picked.length > 0 ? MINT : "#1a1a1a",
                color: picked.length > 0 ? "#000" : "#525252",
              }}
              className="rounded-full px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest transition hover:brightness-110 disabled:cursor-not-allowed"
            >
              {submitting ? "Sending…" : `Send ${picked.length || ""} invite${picked.length === 1 ? "" : "s"}`.trim()}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InviteRow({
  invite,
  onRevoke,
}: {
  invite: InvitePublicView;
  onRevoke: (friend: string) => void;
}) {
  const sent = invite.status === "sent";
  return (
    <div className="flex items-center gap-3 border-b border-dashed border-neutral-800 px-2 py-2 last:border-0">
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <WalletLink
          wallet={invite.friend}
          className="truncate text-sm text-neutral-100 transition hover:text-white"
        />
      </span>
      <span
        className="font-mono text-[9px] uppercase tracking-widest"
        style={{ color: sent ? SAND : MINT }}
      >
        {sent ? "SENT" : "REDEEMED ✓"}
      </span>
      {sent && (
        <button
          type="button"
          onClick={() => onRevoke(invite.friend)}
          className="rounded-full border border-neutral-800 bg-neutral-950 px-3 py-1 font-mono text-[9px] uppercase tracking-widest text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-200"
        >
          REVOKE
        </button>
      )}
    </div>
  );
}
