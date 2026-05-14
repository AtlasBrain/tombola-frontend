"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";

interface Props {
  poolPubkey: string;
  ticketPriceLamports: string;
  totalTickets: number;
  tenantPrimaryColor: string;
}

export function PathC_DepositPanel(props: Props) {
  const signer = useUnifiedSigner();
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  const address = signer.publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (!address) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(address, { margin: 0, scale: 8 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        // QR generation failure is non-fatal; address text + copy still works.
      });
    return () => {
      cancelled = true;
    };
  }, [address]);

  if (!signer.publicKey) return null; // safety check — shouldn't render in this state

  const ticketSol = Number(BigInt(props.ticketPriceLamports)) / 1e9;
  // Show what they'd need: ticket price + ~0.005 SOL margin for fees.
  const neededSol = (ticketSol + 0.005).toFixed(3);

  async function copy() {
    await navigator.clipboard.writeText(address!);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-3">
      <div className="text-sm opacity-70">
        Your wallet doesn&apos;t have enough SOL or USDC yet. Send{" "}
        <strong>{neededSol} SOL</strong> (or {(ticketSol * 1.1).toFixed(2)}{" "}
        USDC) to your address below.
      </div>
      {qrDataUrl && (
        <div className="flex justify-center">
          {/* 48rem × 48rem QR, white bg, rounded — scannable on mobile */}
          <img
            src={qrDataUrl}
            alt="Wallet address QR code"
            className="rounded-md"
            style={{
              width: "12rem",
              height: "12rem",
              background: "#ffffff",
            }}
          />
        </div>
      )}
      <div className="rounded-md border border-white/10 bg-neutral-900 p-3 font-mono text-sm break-all">
        {address}
      </div>
      <button
        onClick={copy}
        className="w-full px-4 py-2 rounded-md font-semibold text-black"
        style={{ background: props.tenantPrimaryColor }}
      >
        {copied ? "Copied!" : "Copy address"}
      </button>
      <div className="text-xs opacity-50">
        Once the deposit confirms, the page auto-refreshes and you can buy.
        Don&apos;t see it? Send a small amount first to confirm the address —
        funds are non-refundable if sent to the wrong network.
      </div>
    </div>
  );
}
