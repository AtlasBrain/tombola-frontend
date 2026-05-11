import { Connection } from "@solana/web3.js";
import { loadKeeperKeypair } from "./wallet.js";
import { logInfo, log, logError } from "./logger.js";
import { scanActionablePools } from "./scan.js";
import { commitPool } from "./commit.js";
import { settlePool } from "./settle.js";

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Required env var ${name} is not set`);
  return v;
}

async function runTick(ctx: {
  rpcUrl: string;
  programId: string;
  connection: Connection;
  cluster: "devnet" | "mainnet";
  keeperKp: ReturnType<typeof loadKeeperKeypair>;
}): Promise<void> {
  const pools = await scanActionablePools(ctx.rpcUrl, ctx.programId);
  logInfo(`tick: ${pools.length} actionable pool(s) found`);

  for (const entry of pools) {
    if (entry.action === "stuck") {
      log(entry.address, "WARNING: oracle has been stuck >1h — manual recovery needed");
      continue;
    }
    try {
      if (entry.action === "commit") {
        await commitPool(entry, ctx.keeperKp, ctx.connection, ctx.rpcUrl, ctx.cluster);
      } else {
        await settlePool(entry, ctx.keeperKp, ctx.connection, ctx.rpcUrl, ctx.cluster);
      }
    } catch (err) {
      logError(entry.address, `${entry.action} failed`, err);
    }
  }
}

async function main(): Promise<void> {
  const rpcUrl = requireEnv("SOLANA_RPC_URL");
  const programId = requireEnv("PROGRAM_ID");
  const cluster = (process.env.SB_CLUSTER ?? "devnet") as "devnet" | "mainnet";
  const intervalMs = Number(process.env.POLL_INTERVAL_MS ?? "30000");

  const keeperKp = loadKeeperKeypair(); // throws immediately if env is wrong
  logInfo(`keeper starting — wallet: ${keeperKp.publicKey.toBase58()}`);
  logInfo(`rpc: ${rpcUrl} | program: ${programId} | cluster: ${cluster} | poll: ${intervalMs}ms`);

  const connection = new Connection(rpcUrl, "confirmed");

  const ctx = { rpcUrl, programId, connection, cluster, keeperKp };

  // Run first tick immediately, then on interval.
  await runTick(ctx);
  setInterval(() => {
    runTick(ctx).catch((err: unknown) => {
      logError("(global)", "tick failed", err);
    });
  }, intervalMs);
}

main().catch((err: unknown) => {
  console.error("keeper failed to start:", err);
  process.exit(1);
});
