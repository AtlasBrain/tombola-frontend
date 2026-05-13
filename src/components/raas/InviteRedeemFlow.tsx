// src/components/raas/InviteRedeemFlow.tsx
// Client component: fetches Merkle proof for the invite code, signs the
// redeem_invite_code_whitelist instruction, and redirects to the buy page.
"use client";

import { useState } from "react";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";
import { useRouter } from "next/navigation";
import type { TransactionSigner, Address } from "@solana/kit";

interface Props {
  tenantSlug: string;
  tenantPrimaryColor: string;
  tenantDisplayName: string;
  poolPubkey: string;
  rawCode: string;
}

// Maps on-chain custom error codes to user-friendly messages.
// Codes mirror vendor/sdk-v2/generated/errors/raffleV2.ts discriminants.
const ANCHOR_ERROR_MESSAGES: Record<number, string> = {
  0x1770: "Unauthorized.",
  0x1773: "This raffle is not open.",
  0x1774: "This raffle has closed — ticket sales are over.",
  0x1784: "Invalid invite code — proof verification failed.",
  0x1785: "Wrong access mode — this pool does not use invite codes.",
};

// Detect "already redeemed" from the on-chain account-already-exists error.
// Anchor surfaces this as "Error processing Instruction X: custom program error:
// 0x0" or an "account already in use" system error when the RedeemedCode PDA
// already exists.
function parseAnchorError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);

  // Custom program error — extract hex code and look it up.
  const hexMatch = msg.match(/custom program error:\s*(0x[0-9a-fA-F]+)/i);
  if (hexMatch) {
    const code = parseInt(hexMatch[1], 16);
    if (ANCHOR_ERROR_MESSAGES[code]) return ANCHOR_ERROR_MESSAGES[code];
    return `On-chain error (${hexMatch[1]})`;
  }

  // "already in use" means the RedeemedCode PDA was already created —
  // this code was already redeemed.
  if (/already in use/i.test(msg)) {
    return "This invite code has already been redeemed.";
  }

  return msg;
}

export function InviteRedeemFlow({
  tenantSlug,
  tenantPrimaryColor,
  tenantDisplayName,
  poolPubkey,
  rawCode,
}: Props) {
  const signer = useUnifiedSigner();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function redeem() {
    if (!signer.publicKey || !signer.signTransaction) {
      setError("Connect your wallet first.");
      return;
    }
    setSubmitting(true);
    setError(null);

    try {
      // 1. Fetch the Merkle proof for this specific code from the server-side endpoint.
      //    The endpoint decrypts the full code set server-side and returns only the
      //    proof — no other codes are revealed.
      const proofUrl =
        `/api/r/pool/${poolPubkey}/code-proof?` +
        `code=${encodeURIComponent(rawCode)}&tenant=${encodeURIComponent(tenantSlug)}`;
      const proofRes = await fetch(proofUrl);
      if (!proofRes.ok) {
        const body = await proofRes.json().catch(() => ({}));
        if (proofRes.status === 404) {
          const detail = (body as { error?: string }).error;
          if (detail === "code_not_found") {
            throw new Error("This invite code is not valid for this raffle.");
          }
          if (detail === "no_codes") {
            throw new Error("No invite codes are registered for this raffle.");
          }
        }
        if (proofRes.status === 429) {
          throw new Error("Too many requests — please wait a moment and try again.");
        }
        throw new Error(
          (body as { error?: string }).error ?? "Failed to fetch proof.",
        );
      }
      const { proof } = (await proofRes.json()) as { proof: string[] };

      // 2. Build the transaction.
      const { RaffleClient } = await import("@tombola/sdk-v2");
      const { createSolanaRpc } = await import("@solana/kit");
      const { Connection, Transaction } = await import("@solana/web3.js");
      const { kitToWeb3 } = await import("@/lib/kit-to-web3");

      const rpcUrl =
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
      const rpc = createSolanaRpc(rpcUrl);
      const client = new RaffleClient({ rpc });

      // redeemInviteCodeWhitelist expects:
      //   buyer: TransactionSigner  (Kit type — only the address field is used to
      //                              derive PDAs; signing happens below via web3.js)
      //   pool:  Address
      //   code:  string             (client.ts encodes to bytes internally)
      //   proof: Uint8Array[]       (32-byte Merkle proof nodes, base64-decoded)
      const buyerSigner = {
        address: signer.publicKey.toBase58(),
      } as unknown as TransactionSigner;

      const kitIx = await client.redeemInviteCodeWhitelist({
        buyer: buyerSigner,
        pool: poolPubkey as Address,
        code: rawCode,
        proof: proof.map((p) => new Uint8Array(Buffer.from(p, "base64"))),
      });

      // 3. Convert Kit instruction → web3.js, build + sign + send.
      const ix = kitToWeb3(kitIx);
      const conn = new Connection(rpcUrl, "confirmed");
      const tx = new Transaction().add(ix);
      tx.feePayer = signer.publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      const signed = await signer.signTransaction(tx);
      const sig = await conn.sendRawTransaction(signed.serialize());
      await conn.confirmTransaction(sig, "confirmed");

      // 4. Redirect to the pool buy page on success.
      router.push(`/r/${tenantSlug}/pool/${poolPubkey}`);
    } catch (e) {
      setError(parseAnchorError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold" style={{ color: tenantPrimaryColor }}>
        You&apos;re invited
      </h1>
      <p className="opacity-80">
        <strong>{tenantDisplayName}</strong> sent you an invite to enter their
        raffle. Click below to redeem — it&apos;s free except a small network fee
        (~0.00008 SOL). After redeeming you&apos;ll be able to buy tickets with one
        signature.
      </p>

      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={redeem}
        disabled={submitting || !signer.publicKey}
        className="px-4 py-3 rounded-md font-semibold text-black disabled:opacity-30 w-full"
        style={{ background: tenantPrimaryColor }}
      >
        {submitting ? "Redeeming…" : "Redeem invite"}
      </button>

      {!signer.publicKey && (
        <p className="text-xs opacity-60">
          Connect your wallet using the header button first.
        </p>
      )}
    </div>
  );
}
