"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CreatePoolForm } from "@/components/CreatePoolForm";
import { RedemptionLinkList } from "@/components/RedemptionLinkList";

const MINT = "#88cfc4";

interface CreatedPayload {
  poolAddress: string;
  codes: string[];
  proofs: Record<string, Uint8Array[]>;
  mode: "Whitelist" | "OneCodePerTicket";
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
      className="bg-transparent backdrop:bg-black/70 backdrop:backdrop-blur-sm"
    >
      <div
        // Stop propagation so clicks INSIDE the panel don't bubble to the
        // backdrop handler (which would close the modal).
        onClick={(e) => e.stopPropagation()}
        className="grad-private mx-auto my-8 w-[min(92vw,640px)] rounded-3xl border border-neutral-800 bg-neutral-950 p-7 shadow-2xl shadow-black/60"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p
              className="font-mono text-[10px] uppercase tracking-widest"
              style={{ color: MINT }}
            >
              {created ? "Pool created" : "New private pool"}
            </p>
            <h2 className="mt-1 font-display text-2xl uppercase">
              {created ? "You're live" : "Parameters"}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-neutral-400 transition hover:border-neutral-600 hover:text-neutral-100"
          >
            {created ? "Done" : "Cancel"}
          </button>
        </div>

        <div className="mt-6">
          {!created ? (
            <CreatePoolForm onCreated={handlePoolCreated} />
          ) : (
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
                <p
                  className="mt-3 font-mono text-[10px] uppercase tracking-widest"
                  style={{ color: MINT }}
                >
                  Save these codes now — they only live in this browser
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  Codes are bearer tokens; if you lose them you can&apos;t
                  hand them out. Use Copy all or Download CSV before closing.
                </p>
              </div>
              <RedemptionLinkList
                poolAddress={created.poolAddress}
                codes={created.codes}
                proofs={created.proofs}
                mode={created.mode}
              />
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
