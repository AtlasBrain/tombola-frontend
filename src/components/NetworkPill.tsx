import { clusterLabelFor, type ClusterLabel } from "@/lib/explorer-url";

const RPC_URL =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const CLUSTER = clusterLabelFor(RPC_URL);
const IS_INSECURE_MAINNET =
  CLUSTER === "mainnet" && RPC_URL.startsWith("http://");

const STYLE: Record<ClusterLabel, string> = {
  localnet: "bg-neutral-500/10 text-neutral-300 ring-neutral-500/20",
  devnet: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  testnet: "bg-amber-500/10 text-amber-400 ring-amber-500/20",
  mainnet: "bg-emerald-500/10 text-emerald-400 ring-emerald-500/20",
};

export function NetworkPill() {
  if (IS_INSECURE_MAINNET) {
    return (
      <span
        title={`Mainnet RPC over plain HTTP — ${RPC_URL}. MITM-vulnerable; do not buy tickets.`}
        className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-xs font-medium text-rose-400 ring-1 ring-inset ring-rose-500/20"
      >
        ⚠ insecure RPC
      </span>
    );
  }
  return (
    <span
      title={RPC_URL}
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STYLE[CLUSTER]}`}
    >
      {CLUSTER}
    </span>
  );
}
