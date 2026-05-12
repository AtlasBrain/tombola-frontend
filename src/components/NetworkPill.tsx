import { clusterLabelFor } from "@/lib/explorer-url";

const DEFAULT_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

interface Props {
  rpcUrl?: string;
}

export function NetworkPill({ rpcUrl = DEFAULT_RPC_URL }: Props = {}) {
  const cluster = clusterLabelFor(rpcUrl);
  const isInsecureMainnet =
    cluster === "mainnet" && rpcUrl.startsWith("http://");

  if (isInsecureMainnet) {
    return (
      <span
        title={`Mainnet RPC over plain HTTP — ${rpcUrl}. MITM-vulnerable; do not buy tickets.`}
        className="hidden items-center gap-1.5 rounded-full border border-rose-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-rose-400 sm:inline-flex"
      >
        <span className="pulse-soft inline-block h-1.5 w-1.5 rounded-full bg-rose-400" />
        ⚠ insecure RPC
      </span>
    );
  }

  return (
    <span
      title={rpcUrl}
      className="hidden items-center gap-1.5 rounded-full border border-neutral-800 px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider text-neutral-300 sm:inline-flex"
    >
      <span className="pulse-soft inline-block h-1.5 w-1.5 rounded-full bg-lavender" />
      {cluster.toUpperCase()}
    </span>
  );
}
