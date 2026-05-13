"use client";

import { useState } from "react";
import { useUnifiedSigner } from "@/lib/raas/phantom-signer";
import { FriendsInviteSender } from "@/components/raas/FriendsInviteSender";

interface Code {
  raw: string;
  status: "unredeemed" | "redeemed" | "voided";
}

interface Props {
  tenantSlug: string;
  poolPubkey: string;
  tenantPrimaryColor: string;
}

export function CodeManager({ tenantSlug, poolPubkey, tenantPrimaryColor }: Props) {
  const signer = useUnifiedSigner();
  const [codes, setCodes] = useState<Code[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  async function loadCodes() {
    if (!signer.publicKey || !signer.signMessage) {
      setError("Connect your wallet first.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // 1. Request a single-use nonce bound to this read action.
      const context = `read_codes:${poolPubkey}`;
      const nonceRes = await fetch(
        `/api/r/signed-nonce?context=${encodeURIComponent(context)}`,
      );
      if (!nonceRes.ok) throw new Error("Failed to get signing nonce");
      const { nonce } = (await nonceRes.json()) as { nonce: string };

      // 2. Sign the message. The server verifies: nacl.sign.detached.verify(
      //    encode(`tombola:${context}:${nonce}`), sig, pubkey)
      const msgBytes = new TextEncoder().encode(`tombola:${context}:${nonce}`);
      const sigBytes = await signer.signMessage(msgBytes);
      const bs58 = (await import("bs58")).default;
      const sigB58 = bs58.encode(sigBytes);

      // 3. Fetch decrypted codes. The nonce is single-use, so replay is blocked.
      const url =
        `/api/r/pool/${poolPubkey}/codes?` +
        `tenant=${encodeURIComponent(tenantSlug)}` +
        `&nonce=${encodeURIComponent(nonce)}` +
        `&signature=${encodeURIComponent(sigB58)}`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "fetch_failed");
      }
      const { codes: rawCodes } = (await res.json()) as { codes: string[] };

      // 4. MVP: all codes start as unredeemed. Polling on-chain redemption state
      //    (fetching RedeemedCode PDAs) is deferred to Plan 3.5.
      const enriched: Code[] = rawCodes.map((raw) => ({
        raw,
        status: "unredeemed" as const,
      }));
      setCodes(enriched);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function voidCode(rawCode: string) {
    if (!signer.publicKey || !signer.signTransaction) {
      setError("Connect your wallet first.");
      return;
    }
    if (!codes) {
      setError("Load codes first.");
      return;
    }
    try {
      const sdkV2 = await import("@tombola/sdk-v2");
      const { RaffleClient, buildCodeTree } = sdkV2;
      const kit = await import("@solana/kit");
      const { createSolanaRpc } = kit;
      const { Connection, Transaction } = await import("@solana/web3.js");
      const { kitToWeb3 } = await import("@/lib/kit-to-web3");

      const rpcUrl =
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
      const rpc = createSolanaRpc(rpcUrl);
      const client = new RaffleClient({ rpc });

      // Compute the Merkle proof client-side from the full (already loaded) code set.
      // buildCodeTree(codes) returns { root, proofs } where proofs[code] is the proof
      // for that code. We use the same code list that was committed at pool creation.
      const allCodes = codes.map((c) => c.raw);
      const { proofs } = buildCodeTree(allCodes);
      const proof = proofs[rawCode];
      if (!proof) throw new Error("proof_not_found: code not in the loaded set");

      const kitIx = await client.voidInviteCode({
        creator: {
          address: signer.publicKey.toBase58() as import("@solana/kit").Address,
        } as Parameters<typeof client.voidInviteCode>[0]["creator"],
        pool: poolPubkey as import("@solana/kit").Address,
        // On-chain the code bytes are the raw UTF-8 encoded invite code string
        // (same as what redeemInviteCodeWhitelist uses — the Rust program hashes
        // the raw bytes to get the leaf).
        code: new TextEncoder().encode(rawCode),
        proof,
      });

      const conn = new Connection(rpcUrl, "confirmed");
      const tx = new Transaction().add(kitToWeb3(kitIx));
      tx.feePayer = signer.publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      const signed = await signer.signTransaction(tx);
      const txSig = await conn.sendRawTransaction(
        (signed as { serialize(): Uint8Array }).serialize(),
      );
      await conn.confirmTransaction(txSig, "confirmed");

      // Update local UI state — flip this code to voided.
      setCodes((prev) =>
        prev!.map((c) =>
          c.raw === rawCode ? { ...c, status: "voided" as const } : c,
        ),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function copyLinkToClipboard(rawCode: string) {
    const link = `${window.location.origin}/r/${tenantSlug}/invite/${encodeURIComponent(rawCode)}`;
    await navigator.clipboard.writeText(link);
    setCopiedCode(rawCode);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  const unredeemedCount = codes?.filter((c) => c.status === "unredeemed").length ?? 0;
  const voidedCount = codes?.filter((c) => c.status === "voided").length ?? 0;

  return (
    <div className="space-y-4">
      {!codes && (
        <button
          onClick={loadCodes}
          disabled={loading || !signer.publicKey}
          className="px-4 py-2 rounded-md font-semibold text-black disabled:opacity-30"
          style={{ background: tenantPrimaryColor }}
        >
          {loading ? "Loading codes…" : "Load my codes (1 signature)"}
        </button>
      )}

      {error && (
        <div className="rounded-md bg-red-500/10 border border-red-500/30 p-3 text-red-200 text-sm">
          {error}
        </div>
      )}

      {codes && (
        <>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-4 text-sm opacity-70">
              <span>{codes.length} total</span>
              <span>{unredeemedCount} unredeemed</span>
              <span>{voidedCount} voided</span>
            </div>
            {unredeemedCount > 0 && (
              <FriendsInviteSender
                tenantSlug={tenantSlug}
                poolPubkey={poolPubkey}
                availableCodes={codes
                  .filter((c) => c.status === "unredeemed")
                  .map((c) => c.raw)}
                tenantPrimaryColor={tenantPrimaryColor}
                onSent={(assignments) => {
                  // Off-chain hint only — codes remain unredeemed on-chain
                  // until the friend actually redeems. Just log for now;
                  // Plan 3.5 will surface "assigned" status in the UI.
                  console.log("Assigned codes to friends:", assignments);
                }}
              />
            )}
          </div>
          <ul className="divide-y divide-white/10 border border-white/10 rounded-md">
            {codes.map((c) => (
              <li key={c.raw} className="p-3 flex items-center justify-between gap-3 flex-wrap">
                <code className="font-mono text-sm break-all">{c.raw}</code>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`text-xs px-2 py-1 rounded ${
                      c.status === "unredeemed"
                        ? "bg-emerald-500/20 text-emerald-200"
                        : c.status === "voided"
                        ? "bg-red-500/20 text-red-200"
                        : "bg-blue-500/20 text-blue-200"
                    }`}
                  >
                    {c.status}
                  </span>
                  {c.status === "unredeemed" && (
                    <>
                      <button
                        onClick={() => copyLinkToClipboard(c.raw)}
                        className="text-xs underline opacity-60 hover:opacity-100"
                      >
                        {copiedCode === c.raw ? "Copied!" : "Copy link"}
                      </button>
                      <button
                        onClick={() => voidCode(c.raw)}
                        className="text-xs underline opacity-60 hover:opacity-100 text-red-300"
                      >
                        Void
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
