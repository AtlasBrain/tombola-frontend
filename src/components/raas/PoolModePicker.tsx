"use client";

import type { Dispatch, SetStateAction } from "react";

export type PoolMode = "public" | "whitelisted";

interface Props {
  mode: PoolMode;
  setMode: Dispatch<SetStateAction<PoolMode>>;
  tenantPrimaryColor: string;
}

export function PoolModePicker({ mode, setMode, tenantPrimaryColor }: Props) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm opacity-80">Who can enter?</legend>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => setMode("public")}
          className="text-left rounded-md border p-4 transition"
          style={{
            borderColor: mode === "public" ? tenantPrimaryColor : "rgba(255,255,255,0.1)",
            background: mode === "public" ? `${tenantPrimaryColor}10` : "transparent",
          }}
        >
          <div className="font-semibold mb-1">Public</div>
          <div className="text-xs opacity-70 space-y-1">
            <div>1 shareable link</div>
            <div>Anyone can buy</div>
            <div>1 signature per buy</div>
            <div>Best for: public hype</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setMode("whitelisted")}
          className="text-left rounded-md border p-4 transition"
          style={{
            borderColor: mode === "whitelisted" ? tenantPrimaryColor : "rgba(255,255,255,0.1)",
            background: mode === "whitelisted" ? `${tenantPrimaryColor}10` : "transparent",
          }}
        >
          <div className="font-semibold mb-1">Whitelisted</div>
          <div className="text-xs opacity-70 space-y-1">
            <div>N single-use invite codes</div>
            <div>Only invitees can buy</div>
            <div>1 redeem + 1 sig/buy</div>
            <div>Best for: gated communities</div>
          </div>
        </button>
      </div>
    </fieldset>
  );
}
