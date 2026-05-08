import { clusterLabelFor, type ClusterLabel } from "@/lib/explorer-url";

const DEFAULT_RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

const STYLE: Record<ClusterLabel, string> = {
  localnet: "bg-neutral-500/10 text-neutral-300 ring-neutral-500/20",
  devnet: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  testnet: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  mainnet: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
};

interface Props {
  /** RPC URL the dapp is reading from. Defaults to NEXT_PUBLIC_SOLANA_RPC_URL.
   *  Exposed as a prop so tests can hit each cluster branch without
   *  mocking process.env. */
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
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-400 ring-1 ring-inset ring-rose-500/20"
      >
        ⚠ insecure RPC
      </span>
    );
  }
  return (
    <span
      title={rpcUrl}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STYLE[cluster]}`}
    >
      {cluster}
    </span>
  );
}
