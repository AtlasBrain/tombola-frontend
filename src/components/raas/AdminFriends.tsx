"use client";

// Wraps the v1 FriendsDrawer in the admin tab context.
// FriendsDrawer is a slide-in overlay; here we mount it inline in a
// persistent open state using its wallet + open props.
// Do NOT edit FriendsDrawer itself (v1 frozen).

import { useState } from "react";
import type { Tenant } from "@/types/raas";
import { FriendsDrawer } from "@/components/FriendsDrawer";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";

interface Props {
  tenant: Tenant;
}

export function AdminFriends({ tenant }: Props) {
  const signer = useUnifiedSigner();
  const [open, setOpen] = useState(false);

  if (!signer.publicKey) {
    return (
      <div className="space-y-4">
        <p className="opacity-60 text-sm">
          Connect your wallet to view your friends list.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm opacity-60">
        Your friends list for{" "}
        <span className="font-mono">{signer.publicKey.toBase58().slice(0, 12)}…</span>.
        You can use friends to send invite codes to Whitelisted raffles.
      </p>
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 rounded-md font-semibold text-black text-sm"
        style={{ background: tenant.branding.primary_color }}
      >
        Open friends list
      </button>

      <FriendsDrawer
        wallet={signer.publicKey.toBase58()}
        open={open}
        onClose={() => setOpen(false)}
      />
    </div>
  );
}
