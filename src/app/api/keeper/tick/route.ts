// GET /api/keeper/tick
//
// Vercel-Cron entry point — fires every minute, runs one keeper tick:
// scan all PrivatePool accounts, commit the open-but-closed ones, settle
// the AwaitingVrf ones. Returns a JSON summary of what happened.
//
// Auth: Vercel Cron requests carry an `Authorization: Bearer <CRON_SECRET>`
// header (the secret is auto-injected from the env var of the same name).
// When CRON_SECRET is set we require it; in local dev / preview without
// the secret, any caller can fire the endpoint (useful for manual debug).
//
// Budget: each commit takes ~5s (two txs), each settle takes ~4s (one tx +
// optional ~10s recovery). To stay under Vercel's 60s function cap we
// process pools sequentially and bail when wall-clock elapsed exceeds the
// soft deadline. Remaining pools roll into the next minute's tick.

import "server-only";

import { Connection } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { loadKeeperKeypair } from "@/lib/keeper/wallet";
import { logInfo } from "@/lib/keeper/logger";
import { scanActionablePools } from "@/lib/keeper/scan";
import { commitPool } from "@/lib/keeper/commit";
import { settlePool } from "@/lib/keeper/settle";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_PROGRAM_ID = "qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M";
const DEADLINE_MS = 50_000; // leave ~10s headroom before maxDuration kills us

interface TickEntry {
  pool: string;
  action: "commit" | "settle" | "stuck" | "skipped";
  ok?: boolean;
  err?: string;
  reason?: string;
}

export async function GET(req: Request) {
  // CRON auth — when CRON_SECRET is configured we enforce it. Vercel Cron
  // sends Authorization: Bearer <CRON_SECRET> automatically.
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: "Unauthorized", code: "auth_required" },
        { status: 401 },
      );
    }
  }

  const t0 = Date.now();

  // ENV checks — fail fast with a readable message rather than crashing
  // mid-tick on the first missing field.
  const rpcUrl =
    process.env.KEEPER_RPC_URL ??
    process.env.SOLANA_RPC_URL ??
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ??
    "https://api.devnet.solana.com";
  const programId = process.env.PROGRAM_ID ?? DEFAULT_PROGRAM_ID;
  const cluster = (process.env.SB_CLUSTER ?? "devnet") as
    | "devnet"
    | "mainnet";

  let keeperKp;
  try {
    keeperKp = loadKeeperKeypair();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }

  logInfo(
    `tick start — keeper=${keeperKp.publicKey.toBase58()} rpc=${rpcUrl} cluster=${cluster}`,
  );

  let pools: Awaited<ReturnType<typeof scanActionablePools>>;
  try {
    pools = await scanActionablePools(rpcUrl, programId);
  } catch (err) {
    return NextResponse.json(
      {
        error: `scan failed: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - t0,
      },
      { status: 500 },
    );
  }
  logInfo(`tick: ${pools.length} actionable pool(s) found`);

  const connection = new Connection(rpcUrl, "confirmed");
  const log: TickEntry[] = [];

  for (const entry of pools) {
    if (Date.now() - t0 > DEADLINE_MS) {
      log.push({
        pool: entry.address,
        action: "skipped",
        reason: "deadline",
      });
      continue;
    }
    if (entry.action === "stuck") {
      // Defensive — classifyPool no longer returns "stuck", but keep the
      // branch in case it comes back.
      log.push({ pool: entry.address, action: "stuck", ok: false });
      continue;
    }
    try {
      if (entry.action === "commit") {
        await commitPool(entry, keeperKp, connection, rpcUrl, cluster);
        log.push({ pool: entry.address, action: "commit", ok: true });
      } else {
        await settlePool(entry, keeperKp, connection, rpcUrl, cluster);
        log.push({ pool: entry.address, action: "settle", ok: true });
      }
    } catch (err) {
      log.push({
        pool: entry.address,
        action: entry.action,
        ok: false,
        err: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const durationMs = Date.now() - t0;
  logInfo(`tick done in ${durationMs}ms — processed ${log.length} pool(s)`);
  return NextResponse.json({
    foundPools: pools.length,
    processed: log.length,
    durationMs,
    log,
  });
}
