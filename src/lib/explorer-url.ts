// Build a Solana Explorer URL for an account on the cluster the dapp is
// reading from. Works for mainnet (default), devnet, testnet, and localhost
// (encoded as cluster=custom + customUrl=<rpc>).

const DEVNET_HOSTS = ["devnet"];
const TESTNET_HOSTS = ["testnet"];
const LOCAL_HOSTS = ["127.0.0.1", "localhost"];

function clusterQueryFor(rpcUrl: string): string {
  const lower = rpcUrl.toLowerCase();
  if (LOCAL_HOSTS.some((h) => lower.includes(h))) {
    return `?cluster=custom&customUrl=${encodeURIComponent(rpcUrl)}`;
  }
  if (DEVNET_HOSTS.some((h) => lower.includes(h))) return "?cluster=devnet";
  if (TESTNET_HOSTS.some((h) => lower.includes(h))) return "?cluster=testnet";
  return ""; // mainnet is the default
}

const EXPLORER_BASE = "https://explorer.solana.com";

export function explorerAddressUrl(address: string, rpcUrl: string): string {
  return `${EXPLORER_BASE}/address/${address}${clusterQueryFor(rpcUrl)}`;
}

export function explorerTxUrl(signature: string, rpcUrl: string): string {
  return `${EXPLORER_BASE}/tx/${signature}${clusterQueryFor(rpcUrl)}`;
}

export type ClusterLabel = "localnet" | "devnet" | "testnet" | "mainnet";

export function clusterLabelFor(rpcUrl: string): ClusterLabel {
  const lower = rpcUrl.toLowerCase();
  if (LOCAL_HOSTS.some((h) => lower.includes(h))) return "localnet";
  if (DEVNET_HOSTS.some((h) => lower.includes(h))) return "devnet";
  if (TESTNET_HOSTS.some((h) => lower.includes(h))) return "testnet";
  return "mainnet";
}
