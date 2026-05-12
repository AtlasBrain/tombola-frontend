"use client";

import { use, useCallback, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { explorerTxUrl } from "@/lib/explorer-url";
import { UserName } from "@/components/UserName";

const VALIDATOR_RPC = process.env.NEXT_PUBLIC_VALIDATOR_RPC ?? "";
const FAUCET_SOL = process.env.NEXT_PUBLIC_FAUCET_SOL ?? "1000";

interface PageProps {
  params: Promise<{ code: string }>;
}

type ClaimState = "idle" | "claiming" | "done" | "error";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      className="ml-2 rounded border border-neutral-700 bg-neutral-900 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-neutral-400 transition hover:border-neutral-500 hover:text-neutral-100"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function Step({
  n,
  done,
  title,
  children,
}: {
  n: number;
  done: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold"
          style={
            done
              ? { borderColor: "#88cfc4", background: "#88cfc41a", color: "#88cfc4" }
              : { borderColor: "#404040", background: "#1a1a1a", color: "#737373" }
          }
        >
          {done ? "✓" : n}
        </div>
        <div className="mt-1 w-px flex-1 bg-neutral-800" />
      </div>
      <div className="pb-8">
        <p className="font-display text-sm uppercase tracking-wide text-neutral-100">
          {title}
        </p>
        <div className="mt-2 text-sm text-neutral-400">{children}</div>
      </div>
    </div>
  );
}

export default function ClaimPage({ params }: PageProps) {
  const { code } = use(params);
  const { publicKey } = useWallet();
  const { setVisible: openWalletModal } = useWalletModal();
  const [state, setState] = useState<ClaimState>("idle");
  const [sig, setSig] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onClaim = useCallback(async () => {
    if (!publicKey) return;
    setState("claiming");
    setErr(null);
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.toUpperCase(), wallet: publicKey.toBase58() }),
      });
      const data: { success?: boolean; signature?: string; sol?: number; error?: string } =
        await res.json();
      if (!res.ok || !data.success) throw new Error(data.error ?? "Unknown error");
      setSig(data.signature ?? null);
      setState("done");
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }, [publicKey, code]);

  const walletConnected = !!publicKey;
  const rpcConfigured = VALIDATOR_RPC !== "";

  if (!rpcConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4">
        <p className="font-mono text-sm text-rose-400">
          NEXT_PUBLIC_VALIDATOR_RPC is not configured on this deployment.
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      {/* Header */}
      <div className="mb-10 text-center">
        <p
          className="font-mono text-[10px] uppercase tracking-widest"
          style={{ color: "#88cfc4" }}
        >
          Beta invite
        </p>
        <h1 className="mt-2 font-display text-4xl uppercase">
          Claim {FAUCET_SOL} SOL
        </h1>
        <p className="mt-2 font-mono text-xs text-neutral-500">
          Code:{" "}
          <span className="font-bold text-neutral-300">
            {code.toUpperCase()}
          </span>
        </p>
      </div>

      {/* Steps */}
      <div>
        {/* Step 1: Install Phantom */}
        <Step n={1} done={walletConnected} title="Install Phantom wallet">
          <p>
            Download{" "}
            <a
              href="https://phantom.app"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-neutral-100"
            >
              phantom.app
            </a>{" "}
            (browser extension or mobile app).
          </p>
        </Step>

        {/* Step 2: Add custom network */}
        <Step n={2} done={walletConnected} title="Add Tombola Beta network">
          <p className="mb-2">
            In Phantom: Settings → Networks → + Add network, then paste this URL:
          </p>
          <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2">
            <code className="flex-1 truncate font-mono text-xs text-neutral-200">
              {VALIDATOR_RPC}
            </code>
            <CopyButton text={VALIDATOR_RPC} />
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Switch to this network in Phantom before claiming.
          </p>
        </Step>

        {/* Step 3: Connect wallet */}
        <Step n={3} done={walletConnected} title="Connect your wallet">
          {walletConnected ? (
            <p className="font-mono text-xs text-neutral-300">
              <UserName wallet={publicKey.toBase58()} />
            </p>
          ) : (
            <button
              type="button"
              onClick={() => openWalletModal(true)}
              style={{ ["--tear-bg" as never]: "#88cfc4" }}
              className="btn-fx fx-tear inline-flex items-center gap-2 px-4 py-2 font-display text-sm uppercase text-black transition hover:brightness-110"
            >
              Connect wallet
            </button>
          )}
        </Step>

        {/* Step 4: Claim */}
        <div className="flex gap-4">
          <div className="flex flex-col items-center">
            <div
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-xs font-bold"
              style={
                state === "done"
                  ? { borderColor: "#88cfc4", background: "#88cfc41a", color: "#88cfc4" }
                  : walletConnected
                    ? { borderColor: "#c9b5dc", background: "#c9b5dc1a", color: "#c9b5dc" }
                    : { borderColor: "#404040", background: "#1a1a1a", color: "#737373" }
              }
            >
              {state === "done" ? "✓" : "4"}
            </div>
          </div>
          <div>
            <p className="font-display text-sm uppercase tracking-wide text-neutral-100">
              Claim your SOL
            </p>
            <div className="mt-2">
              {state === "done" ? (
                <div className="rounded-xl border p-4" style={{ borderColor: "#88cfc433", background: "#88cfc40d" }}>
                  <p className="font-display text-2xl uppercase" style={{ color: "#88cfc4" }}>
                    {FAUCET_SOL} SOL sent
                  </p>
                  <p className="mt-1 font-mono text-xs text-neutral-400">
                    You&apos;re in. Open the{" "}
                    <Link href="/" className="underline hover:text-neutral-100">
                      app
                    </Link>{" "}
                    and start playing.
                  </p>
                  {sig && VALIDATOR_RPC && (
                    <a
                      href={explorerTxUrl(sig, VALIDATOR_RPC)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 block font-mono text-[10px] uppercase tracking-widest text-neutral-500 hover:text-neutral-100"
                    >
                      tx {sig.slice(0, 8)}… ↗
                    </a>
                  )}
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={!walletConnected || state === "claiming"}
                    onClick={onClaim}
                    style={{ ["--tear-bg" as never]: walletConnected ? "#c9b5dc" : "#1a1a1a" }}
                    className="btn-fx fx-tear inline-flex items-center gap-2 px-4 py-2 font-display text-sm uppercase transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <span className={walletConnected ? "text-black" : "text-neutral-500"}>
                      {state === "claiming" ? "Sending…" : `Claim ${FAUCET_SOL} SOL`}
                    </span>
                  </button>
                  {state === "error" && err && (
                    <p className="mt-2 font-mono text-xs text-rose-400">{err}</p>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
