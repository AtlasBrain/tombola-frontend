// Treasury read-only aggregator for /admin/treasury.
//
// What we surface (architecture doc §5.8 — never any signer here):
//   • On-chain ProtocolConfig.treasury pubkey (single source of truth).
//   • Live SOL balance of that pubkey.
//   • BPF upgrade authority of the raffle program (rotation indicator).
//   • Unrealized protocol fees: sum across open/drawing pools of
//     gross_fee − vrf_paid_so_far.
//   • Recent inflows: last N tx signatures for the treasury pubkey.
//   • "Rotation pending" flag when treasury OR upgrade-authority is
//     still the deployer key (configured via DEPLOYER_PUBKEY env so we
//     don't hard-code on chain identities).
//
// Costs: 1 RPC ProtocolConfig fetch + 1 getBalance + 1 getAccountInfo
// (ProgramData) + 1 getSignaturesForAddress + N getTransaction (sample).
// Cached for 60s.

import "server-only";
import { Connection, PublicKey } from "@solana/web3.js";
import { createSolanaRpc } from "@solana/kit";
import { PROGRAM_ID, RaffleClient } from "@tombola/sdk";
import { computeTreasuryShare } from "@/lib/admin/metrics/fees";
import { loadSnapshot } from "@/lib/admin/snapshot";

const TREASURY_TTL_MS = 60_000;
const INFLOW_SAMPLE = 12;
const BPF_LOADER_UPGRADEABLE = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

export interface TreasuryInflow {
  signature: string;
  blockTime: number | null;
  /** Lamports balance change observed on the treasury account. */
  deltaLamports: string;
  /** Slot the tx landed in. */
  slot: number;
}

export interface TreasuryPayload {
  /** ProtocolConfig.treasury pubkey. Empty string if read fails. */
  treasuryAddress: string;
  /** Live treasury balance, lamports. */
  treasuryBalanceLamports: string;
  /** Program upgrade authority for the raffle program, or null if it
   *  was already revoked (immutable program). Pubkey base58. */
  upgradeAuthority: string | null;
  /** True if upgrade authority is fully revoked. */
  upgradeAuthorityRevoked: boolean;
  /** Configured DEPLOYER_PUBKEY env (the wallet that initialized the
   *  protocol). Empty when unset — rotation indicator hides. */
  deployerPubkey: string;
  /** Mismatch flags — these light the dashboard's warning banner. */
  rotation: {
    treasuryIsDeployer: boolean;
    upgradeAuthorityIsDeployer: boolean;
  };
  /** Cluster label for the active RPC. */
  cluster: "devnet" | "mainnet" | "localnet" | "unknown";
  /** Sum across open/drawing pools of unclaimed protocol fee. */
  unrealizedFeesLamports: string;
  unrealizedFeesPoolCount: number;
  /** Last N tx signatures (treasury account address). */
  inflows: TreasuryInflow[];
  /** Useful deep-links. */
  links: {
    solanaExplorerTreasury: string;
    solanaExplorerProgram: string;
    /** Best-effort Squads vault link — only renders when looks like a
     *  Squads vault. We can't *prove* it from on-chain shape alone (the
     *  vault is system-owned), so we always link out and let the
     *  founder verify visually. */
    squadsVault: string;
  };
  generatedAt: number;
}

interface CacheEntry {
  payload: TreasuryPayload;
  ts: number;
}

let cache: CacheEntry | null = null;

export async function getTreasury(): Promise<TreasuryPayload> {
  if (cache && Date.now() - cache.ts < TREASURY_TTL_MS) {
    return cache.payload;
  }
  const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC_URL;
  if (!rpcUrl) throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL not set");
  const conn = new Connection(rpcUrl, "confirmed");
  const rpc = createSolanaRpc(rpcUrl);

  // 1) Read on-chain config.
  let treasuryAddress = "";
  try {
    const client = new RaffleClient({
      rpc: rpc as ConstructorParameters<typeof RaffleClient>[0]["rpc"],
    });
    const cfg = await client.getProtocolConfig();
    treasuryAddress = String(cfg.treasury);
  } catch {
    // ProtocolConfig not initialized (fresh deploy) — surface
    // gracefully.
  }

  // 2) Balance + upgrade authority + cluster.
  const [balance, upgrade] = await Promise.all([
    treasuryAddress
      ? conn
          .getBalance(new PublicKey(treasuryAddress), "confirmed")
          .catch(() => 0)
      : Promise.resolve(0),
    readUpgradeAuthority(conn).catch(() => ({
      authority: null,
      revoked: false,
    })),
  ]);

  // 3) Unrealized fees from the shared snapshot. We use the snapshot's
  // pool list (don't refetch — keeps RPC load steady across pages).
  const snap = await loadSnapshot();
  let unrealized = 0n;
  let unrealizedCount = 0;
  for (const p of snap.pools) {
    if (p.state === 2) continue; // already paid out
    const share = computeTreasuryShare(p.totalPotLamports, p.vrfPaidLamports);
    if (share > 0n) {
      unrealized += share;
      unrealizedCount += 1;
    }
  }

  // 4) Recent inflows (best-effort — empty array on failure).
  const inflows = treasuryAddress
    ? await loadInflows(conn, treasuryAddress).catch(() => [] as TreasuryInflow[])
    : [];

  const deployerPubkey = (process.env.DEPLOYER_PUBKEY ?? "").trim();
  const rotation = {
    treasuryIsDeployer:
      deployerPubkey.length > 0 && treasuryAddress === deployerPubkey,
    upgradeAuthorityIsDeployer:
      deployerPubkey.length > 0 &&
      upgrade.authority !== null &&
      upgrade.authority === deployerPubkey,
  };

  const cluster = inferCluster(rpcUrl);

  const payload: TreasuryPayload = {
    treasuryAddress,
    treasuryBalanceLamports: BigInt(balance).toString(),
    upgradeAuthority: upgrade.authority,
    upgradeAuthorityRevoked: upgrade.revoked,
    deployerPubkey,
    rotation,
    cluster,
    unrealizedFeesLamports: unrealized.toString(),
    unrealizedFeesPoolCount: unrealizedCount,
    inflows,
    links: {
      solanaExplorerTreasury: treasuryAddress
        ? `https://explorer.solana.com/address/${treasuryAddress}?cluster=${cluster === "mainnet" ? "mainnet-beta" : cluster}`
        : "",
      solanaExplorerProgram: `https://explorer.solana.com/address/${PROGRAM_ID}?cluster=${cluster === "mainnet" ? "mainnet-beta" : cluster}`,
      squadsVault: treasuryAddress ? `https://app.squads.so/squads/${treasuryAddress}` : "",
    },
    generatedAt: Math.floor(Date.now() / 1000),
  };
  cache = { payload, ts: Date.now() };
  return payload;
}

export function clearTreasuryCache() {
  cache = null;
}

// ───────────────────────────── internals ─────────────────────────────

async function readUpgradeAuthority(
  conn: Connection,
): Promise<{ authority: string | null; revoked: boolean }> {
  const [programDataPda] = PublicKey.findProgramAddressSync(
    [new PublicKey(String(PROGRAM_ID)).toBuffer()],
    BPF_LOADER_UPGRADEABLE,
  );
  const info = await conn.getAccountInfo(programDataPda, "confirmed");
  if (!info) return { authority: null, revoked: false };
  // ProgramData layout: 4 bytes variant + 8 bytes slot + 1 byte option
  // tag + (33 bytes pubkey when option == Some). See solana-program's
  // UpgradeableLoaderState.
  if (info.data.length < 13) return { authority: null, revoked: false };
  const optTag = info.data[12];
  if (optTag === 0) {
    // Option::None — authority has been revoked (program is immutable).
    return { authority: null, revoked: true };
  }
  if (info.data.length < 13 + 32) return { authority: null, revoked: false };
  const authBytes = info.data.subarray(13, 13 + 32);
  return {
    authority: new PublicKey(authBytes).toBase58(),
    revoked: false,
  };
}

async function loadInflows(
  conn: Connection,
  address: string,
): Promise<TreasuryInflow[]> {
  const sigs = await conn.getSignaturesForAddress(new PublicKey(address), {
    limit: INFLOW_SAMPLE,
  });
  if (sigs.length === 0) return [];
  const txs = await conn.getParsedTransactions(
    sigs.map((s) => s.signature),
    { maxSupportedTransactionVersion: 0, commitment: "confirmed" },
  );
  const out: TreasuryInflow[] = [];
  for (let i = 0; i < sigs.length; i++) {
    const sig = sigs[i];
    const tx = txs[i];
    if (!tx || !tx.meta) {
      out.push({
        signature: sig.signature,
        blockTime: sig.blockTime ?? null,
        deltaLamports: "0",
        slot: sig.slot,
      });
      continue;
    }
    // Find the treasury's lamport delta in this tx by matching the
    // pubkey in accountKeys.
    const keys = tx.transaction.message.accountKeys;
    let idx = -1;
    for (let k = 0; k < keys.length; k++) {
      if (keys[k].pubkey.toBase58() === address) {
        idx = k;
        break;
      }
    }
    let delta = 0n;
    if (idx >= 0) {
      const post = BigInt(tx.meta.postBalances[idx] ?? 0);
      const pre = BigInt(tx.meta.preBalances[idx] ?? 0);
      delta = post - pre;
    }
    out.push({
      signature: sig.signature,
      blockTime: sig.blockTime ?? null,
      deltaLamports: delta.toString(),
      slot: sig.slot,
    });
  }
  return out;
}

function inferCluster(url: string): TreasuryPayload["cluster"] {
  const u = url.toLowerCase();
  if (u.includes("devnet")) return "devnet";
  if (u.includes("mainnet") || u.includes("solana-rpc")) return "mainnet";
  if (u.includes("127.0.0.1") || u.includes("localhost")) return "localnet";
  return "unknown";
}
