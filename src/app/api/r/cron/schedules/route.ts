// src/app/api/r/cron/schedules/route.ts
// Vercel cron handler — fires all due recurring schedules via the tenant's
// delegated hot key.
//
// Auth: Bearer $CRON_SECRET header (set in Vercel env + .env.local.example).
// Frequency: every 5 minutes (configured in vercel.json).
import { NextResponse } from "next/server";
import "server-only";
import { Redis } from "@upstash/redis";
import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
import type { Instruction } from "@solana/kit";

import { listDueSchedules, advanceSchedule } from "@/lib/raas/schedule";
import { getTenant } from "@/lib/raas/tenant";
import { loadDelegatedKey, getOrProvisionSignerKey } from "@/lib/raas/delegated-key";
import { attributePool } from "@/lib/raas/pool-attribution";
import { postToDiscord, hexToDecimal } from "@/lib/raas/discord-webhook";

const redis = Redis.fromEnv();
const SCHEDULE_LOCK_KEY = (id: string) => `raas:schedule:${id}:lock`;

/**
 * Inline Kit→web3.js instruction converter.
 * Mirrors src/lib/kit-to-web3.ts but importable from server context
 * (the original file has "use client" for Next.js bundling reasons).
 * AccountRole bit layout: bit 0 = WRITABLE (1), bit 1 = SIGNER (2).
 */
function kitIxToWeb3(ix: Instruction): TransactionInstruction {
  return new TransactionInstruction({
    programId: new PublicKey(ix.programAddress),
    keys: (ix.accounts ?? []).map((a) => ({
      pubkey: new PublicKey(a.address),
      isSigner: ((a.role as number) & 0b10) !== 0,
      isWritable: ((a.role as number) & 0b01) !== 0,
    })),
    data: Buffer.from(ix.data ?? new Uint8Array()),
  });
}

// POST /api/r/cron/schedules
export async function POST(req: Request) {
  // Authenticate via Bearer token to prevent unauthorized triggering.
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const due = await listDueSchedules();
  const results: {
    schedule_id: string;
    status: "ok" | "skipped" | "failed";
    reason?: string;
    pool?: string;
  }[] = [];

  const rpcUrl =
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  const conn = new Connection(rpcUrl, "confirmed");

  for (const schedule of due) {
    // Distributed lock: prevent double-fire if two cron invocations overlap.
    // SET NX EX 60 — only one invocation wins; losers skip, lock auto-expires
    // on failure so the next cron window can retry.
    const lockKey = SCHEDULE_LOCK_KEY(schedule.schedule_id);
    const locked = await redis.set(lockKey, "1", { nx: true, ex: 60 });
    if (!locked) {
      results.push({
        schedule_id: schedule.schedule_id,
        status: "skipped",
        reason: "concurrent_lock",
      });
      continue;
    }

    try {
      const tenant = await getTenant(schedule.tenant_slug);
      if (
        !tenant ||
        !tenant.delegated_signer ||
        tenant.delegated_signer.revoked_at
      ) {
        results.push({
          schedule_id: schedule.schedule_id,
          status: "skipped",
          reason: "no_delegated_key",
        });
        continue;
      }

      // Load + decrypt the delegated private key using the dedicated signer_key
      // (separate from code_key — defense in depth for Redis compromise).
      const signerKey = await getOrProvisionSignerKey(schedule.tenant_slug);
      const privBytes = await loadDelegatedKey(schedule.tenant_slug, signerKey);
      if (!privBytes) {
        results.push({
          schedule_id: schedule.schedule_id,
          status: "failed",
          reason: "decrypt_failed",
        });
        continue;
      }
      const hotKp = Keypair.fromSecretKey(privBytes);

      // Build the create_private_pool instruction using sdk-v2.
      // RaffleClient.createPrivatePool only uses creator.address for PDA
      // derivation; actual signing is done by web3.js tx.sign() below.
      const { RaffleClient, AccessMode } = await import("@tombola/sdk-v2");
      const { createSolanaRpc } = await import("@solana/kit");
      const rpc = createSolanaRpc(rpcUrl);
      const client = new RaffleClient({ rpc });

      // Use a stable pool_id derived from current second to avoid collisions
      // across rapid re-fires within the same schedule interval.
      const poolId = BigInt(Math.floor(Date.now() / 1000) & 0x7fffffff);

      const poolName = schedule.template.name_template.replace(
        "{n}",
        String(schedule.run_count + 1),
      );

      // For MVP: PublicMode only. Whitelisted recurring pools are Plan 3.5+.
      const kitIx = await client.createPrivatePool({
        creator: {
          address: hotKp.publicKey.toBase58() as Parameters<typeof client.createPrivatePool>[0]["creator"]["address"],
        } as Parameters<typeof client.createPrivatePool>[0]["creator"],
        poolId,
        ticketPrice: BigInt(schedule.template.ticket_price_lamports),
        duration: BigInt(schedule.template.duration_seconds),
        creatorFeeBps: schedule.template.creator_fee_bps,
        accessMode: AccessMode.PublicMode,
        merkleRoot: new Uint8Array(32), // zero root for PublicMode
      });

      // Convert Kit Instruction → web3.js TransactionInstruction.
      const ix = kitIxToWeb3(kitIx);
      const tx = new Transaction().add(ix);
      tx.feePayer = hotKp.publicKey;
      tx.recentBlockhash = (await conn.getLatestBlockhash()).blockhash;
      tx.sign(hotKp);
      const sig = await conn.sendRawTransaction(tx.serialize());
      await conn.confirmTransaction(sig, "confirmed");

      // Derive pool PDA using web3.js findProgramAddressSync.
      // Seeds: ["private_pool", creator_pubkey_bytes, pool_id_le_bytes]
      const poolIdBuf = Buffer.alloc(8);
      poolIdBuf.writeBigUInt64LE(poolId);
      const [poolPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("private_pool"),
          hotKp.publicKey.toBuffer(),
          poolIdBuf,
        ],
        new PublicKey("AVbducCFnioqM8j8S6DVe6xK3DS79Bf7ciVVv8d37XLQ"),
      );

      // Attribute the pool to the tenant as recurring.
      await attributePool({
        pool_pubkey: poolPda.toBase58(),
        tenant_slug: schedule.tenant_slug,
        created_via: "recurring",
      });

      // Advance the schedule to its next firing time.
      await advanceSchedule(schedule.schedule_id);
      // Explicit lock release on success. On failure the lock auto-expires
      // after 60s — intentionally NOT deleted to prevent immediate retry storms.
      await redis.del(lockKey);

      // Notify tenant owner in-app.
      const notif = {
        kind: "raas_recurring_fired",
        pool: poolPda.toBase58(),
        pool_name: poolName,
        scheduled_at: schedule.next_run_at,
        created_at: new Date().toISOString(),
      };
      await redis.lpush(
        `notifications:${tenant.owner_wallet}`,
        JSON.stringify(notif),
      );

      // Discord webhook — fires if the tenant has configured one.
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
        "https://tombola.app";
      await postToDiscord(tenant.integrations?.discord_webhook_url, {
        embeds: [
          {
            title: `${tenant.display_name} — new raffle created`,
            description: `**${poolName}** fired from your recurring schedule.`,
            url: `${baseUrl}/r/${tenant.slug}/pool/${poolPda.toBase58()}`,
            color: hexToDecimal(tenant.branding.primary_color),
            timestamp: new Date().toISOString(),
          },
        ],
      });

      results.push({
        schedule_id: schedule.schedule_id,
        status: "ok",
        pool: poolPda.toBase58(),
      });
    } catch (e) {
      results.push({
        schedule_id: schedule.schedule_id,
        status: "failed",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}
