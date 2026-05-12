"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CreatePoolForm, type CreateUiMode } from "@/components/CreatePoolForm";
import { RedemptionLinkList } from "@/components/RedemptionLinkList";
import { InviteFriendsTab } from "@/components/InviteFriendsTab";

const MINT = "#88cfc4";

interface CreatedPayload {
  poolAddress: string;
  codes: string[];
  proofs: Record<string, Uint8Array[]>;
  mode: "Whitelist" | "OneCodePerTicket";
  uiMode: CreateUiMode;
  invitedFriends: string[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** Fires after each successful pool creation. Lets the parent reload its
   *  list so the new pool appears in Live without a page refresh. */
  onPoolCreated?: (poolAddress: string) => void;
}

/**
 * Modal that wraps CreatePoolForm. Two states:
 *   - form: parameter the new pool, click CREATE
 *   - success: tx confirmed; show "You're live" banner + redemption links
 *     (codes are bearer tokens — Q1a, never close without showing them)
 *
 * Uses native <dialog>: handles ESC + click-outside + focus trap for free.
 * The user MUST explicitly close after success — clicking outside is
 * suppressed in success state to prevent accidental dismiss before they
 * save the codes.
 */
export function CreatePoolModal({ open, onClose, onPoolCreated }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [created, setCreated] = useState<CreatedPayload | null>(null);

  // Sync open prop to native dialog API
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    if (open && !dlg.open) {
      dlg.showModal();
    } else if (!open && dlg.open) {
      dlg.close();
    }
  }, [open]);

  // Reset success state when fully closed (so reopening starts at the form)
  useEffect(() => {
    if (!open) {
      // Small delay so the close animation finishes before resetting
      const t = setTimeout(() => setCreated(null), 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Listen for native close (ESC / form-method dialog close)
  useEffect(() => {
    const dlg = dialogRef.current;
    if (!dlg) return;
    const handleClose = () => {
      onClose();
    };
    dlg.addEventListener("close", handleClose);
    return () => dlg.removeEventListener("close", handleClose);
  }, [onClose]);

  // Click outside the inner panel = close (only when in form state).
  // Suppressed when we're showing codes — accidental dismiss = lost codes.
  function onBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (created !== null) return;
    if (e.target === dialogRef.current) {
      onClose();
    }
  }

  function handlePoolCreated(p: CreatedPayload) {
    setCreated(p);
    onPoolCreated?.(p.poolAddress);
  }

  return (
    <dialog
      ref={dialogRef}
      onClick={onBackdropClick}
      // Native <dialog> in modal mode auto-centers via UA styles, but Tailwind
      // preflight resets some of that — pin position + auto margins + max-h
      // for tall content explicitly so the panel sits dead center on every
      // browser, scrolls within itself if it overflows.
      className="fixed inset-0 m-auto max-h-[92vh] max-w-[min(92vw,640px)] overflow-y-auto bg-transparent p-0 backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div
        // Stop propagation so clicks INSIDE the panel don't bubble to the
        // backdrop handler (which would close the modal).
        onClick={(e) => e.stopPropagation()}
        className="grad-private rounded-3xl border border-neutral-800 bg-neutral-950 p-7 shadow-2xl shadow-black/60"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: MINT }}
            >
              {created ? "Pool created" : "New private pool"}
            </p>
            <h2
              className="mt-1 font-display text-3xl uppercase"
              style={{ color: MINT }}
            >
              {created ? "You're live" : "Parameters"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              borderColor: `${MINT}66`,
              color: MINT,
              background: `${MINT}10`,
            }}
            className="rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest transition hover:brightness-125"
          >
            {created ? "Done" : "Cancel"}
          </button>
        </div>

        <div className="mt-6">
          {!created ? (
            <CreatePoolForm onCreated={handlePoolCreated} />
          ) : (
            <SuccessBody created={created} />
          )}
        </div>
      </div>
    </dialog>
  );
}

/** Success-screen body. Picks which tabs to render based on the
 *  pool's UI mode:
 *
 *    WHITELIST  → both tabs, INVITE LINKS open by default
 *    FRIENDS    → both tabs, INVITE FRIENDS open by default (initial
 *                 allocations already done by CreatePoolForm; the tab
 *                 lets the creator add more or revoke)
 *    PUBLIC     → INVITE LINKS only — bearer codes can't be addressed
 *                 to a specific wallet
 */
function SuccessBody({ created }: { created: CreatedPayload }) {
  const showFriendsTab = created.uiMode !== "OneCodePerTicket";
  const showLinksTab = created.uiMode !== "Friends";
  const [tab, setTab] = useState<"links" | "friends">(
    created.uiMode === "Friends" ? "friends" : "links",
  );

  return (
    <div className="flex flex-col gap-5">
      <div
        className="rounded-2xl border p-5"
        style={{
          borderColor: `${MINT}66`,
          background: `linear-gradient(135deg, ${MINT}1a, ${MINT}05 60%, transparent)`,
          boxShadow: `0 0 0 1px ${MINT}33, 0 8px 30px ${MINT}26`,
        }}
      >
        <p className="text-sm text-neutral-300">
          Pool address:{" "}
          <Link
            href={`/pool/private/${created.poolAddress}`}
            className="font-mono hover:underline"
            style={{ color: MINT }}
          >
            {created.poolAddress.slice(0, 8)}…
            {created.poolAddress.slice(-4)}
          </Link>
        </p>
        {created.uiMode === "Friends" ? (
          <>
            <p
              className="mt-3 font-mono text-[10px] uppercase tracking-widest"
              style={{ color: MINT }}
            >
              Invited {created.invitedFriends.length} friend
              {created.invitedFriends.length === 1 ? "" : "s"} · codes never
              leave this browser
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Each friend will see a one-click claim banner on the pool
              page. Manage invites from the Friends tab below.
            </p>
          </>
        ) : (
          <>
            <p
              className="mt-3 font-mono text-[10px] uppercase tracking-widest"
              style={{ color: MINT }}
            >
              Save these codes now — they only live in this browser
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              Codes are bearer tokens; if you lose them you can&apos;t hand
              them out. Use Copy all or Download CSV before closing.
            </p>
          </>
        )}
      </div>

      {/* Tab bar — only renders when both surfaces are available. */}
      {showFriendsTab && showLinksTab && (
        <div
          className="flex w-fit gap-1 rounded-full border p-1"
          style={{
            borderColor: `${MINT}33`,
            background: "rgba(0,0,0,0.4)",
          }}
        >
          <TabBtn active={tab === "links"} onClick={() => setTab("links")}>
            INVITE LINKS
          </TabBtn>
          <TabBtn active={tab === "friends"} onClick={() => setTab("friends")}>
            INVITE FRIENDS
          </TabBtn>
        </div>
      )}

      {/* Content */}
      {(tab === "links" || !showFriendsTab) && showLinksTab && (
        <RedemptionLinkList
          poolAddress={created.poolAddress}
          codes={created.codes}
          proofs={created.proofs}
          mode={created.mode}
        />
      )}
      {(tab === "friends" || !showLinksTab) && showFriendsTab && (
        <InviteFriendsTab poolAddress={created.poolAddress} />
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={
        active
          ? { background: MINT, color: "#000" }
          : { color: "#a3a3a3" }
      }
      className="rounded-full px-4 py-1.5 font-mono text-[10px] font-bold uppercase tracking-widest transition"
    >
      {children}
    </button>
  );
}
