import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "./__mocks__/fake-redis";

const fake = new FakeRedis();

vi.mock("./kv/redis", () => ({
  getRedis: () => fake,
}));

import {
  createInvite,
  getInvite,
  getInvitesForPool,
  getInvitesForWallet,
  markRedeemed,
  publicView,
  revokeInvite,
  type InviteRow,
} from "./pool-invite-store";

const POOL = "PoolPoolPoolPoolPoolPoolPoolPoolPoolPoolPool";
const POOL_2 = "Pool2Pool2Pool2Pool2Pool2Pool2Pool2Pool2Pool";
const ALICE = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const BOB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const CAROL = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

const SAMPLE: InviteRow = {
  pool: POOL,
  friend: BOB,
  inviter: ALICE,
  code: "DEVNET-CODE-001",
  proofsBase64: ["aGFzaDE=", "aGFzaDI="],
  createdAt: Date.now(),
  status: "sent",
};

beforeEach(() => {
  fake.store.clear();
  fake.sets.clear();
  fake.ttls.clear();
  fake.zsets.clear();
});

describe("createInvite", () => {
  it("writes the row + both index sets", async () => {
    const r = await createInvite(SAMPLE);
    expect(r.ok).toBe(true);
    const row = await getInvite(POOL, BOB);
    expect(row).toEqual(SAMPLE);
    // Friend's inbox + pool's roster both contain the new entry.
    expect(await getInvitesForWallet(BOB)).toEqual([publicView(SAMPLE)]);
    expect(await getInvitesForPool(POOL)).toEqual([publicView(SAMPLE)]);
  });

  it("rejects self-invite", async () => {
    const r = await createInvite({ ...SAMPLE, friend: ALICE });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/yourself/i);
  });

  it("refuses a duplicate (pool, friend) — SETNX guard", async () => {
    await createInvite(SAMPLE);
    const r = await createInvite({ ...SAMPLE, code: "OTHER-CODE" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already has an invite/i);
    // Original row is preserved.
    const row = await getInvite(POOL, BOB);
    expect(row?.code).toBe("DEVNET-CODE-001");
  });

  it("two concurrent creates only land one row", async () => {
    const [a, b] = await Promise.all([
      createInvite(SAMPLE),
      createInvite({ ...SAMPLE, code: "RACE-CODE" }),
    ]);
    const wins = [a.ok, b.ok].filter(Boolean).length;
    expect(wins).toBe(1);
    expect(await getInvitesForPool(POOL)).toHaveLength(1);
  });
});

describe("markRedeemed", () => {
  it("flips status from sent to redeemed", async () => {
    await createInvite(SAMPLE);
    expect((await getInvite(POOL, BOB))?.status).toBe("sent");
    const r = await markRedeemed(POOL, BOB);
    expect(r.ok).toBe(true);
    expect((await getInvite(POOL, BOB))?.status).toBe("redeemed");
  });

  it("is idempotent on an already-redeemed row", async () => {
    await createInvite(SAMPLE);
    await markRedeemed(POOL, BOB);
    const r = await markRedeemed(POOL, BOB);
    expect(r.ok).toBe(true);
  });

  it("returns an error when the invite doesn't exist", async () => {
    const r = await markRedeemed(POOL, BOB);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/not found/i);
  });
});

describe("revokeInvite", () => {
  it("removes the row + both index sets and echoes the deleted payload", async () => {
    await createInvite(SAMPLE);
    const r = await revokeInvite(POOL, BOB, ALICE);
    expect(r.ok).toBe(true);
    expect(r.row?.code).toBe("DEVNET-CODE-001");
    expect(await getInvite(POOL, BOB)).toBeNull();
    expect(await getInvitesForWallet(BOB)).toEqual([]);
    expect(await getInvitesForPool(POOL)).toEqual([]);
  });

  it("refuses when the caller isn't the original inviter", async () => {
    await createInvite(SAMPLE);
    const r = await revokeInvite(POOL, BOB, CAROL);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/only the inviter/i);
    // Row preserved.
    expect(await getInvite(POOL, BOB)).not.toBeNull();
  });

  it("refuses to revoke an already-redeemed invite", async () => {
    await createInvite(SAMPLE);
    await markRedeemed(POOL, BOB);
    const r = await revokeInvite(POOL, BOB, ALICE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/redeemed/i);
  });
});

describe("getInvitesForWallet / getInvitesForPool", () => {
  it("returns invites sorted newest-first", async () => {
    await createInvite({ ...SAMPLE, friend: BOB, createdAt: 1_000, pool: POOL });
    await createInvite({
      ...SAMPLE,
      friend: CAROL,
      createdAt: 2_000,
      pool: POOL,
    });
    const list = await getInvitesForPool(POOL);
    expect(list.map((i) => i.friend)).toEqual([CAROL, BOB]);
  });

  it("only returns rows for the requested wallet / pool", async () => {
    await createInvite({ ...SAMPLE, pool: POOL, friend: BOB });
    await createInvite({ ...SAMPLE, pool: POOL_2, friend: BOB });
    const bobInbox = await getInvitesForWallet(BOB);
    expect(bobInbox.map((i) => i.pool).sort()).toEqual([POOL, POOL_2].sort());
    expect(await getInvitesForWallet(CAROL)).toEqual([]);

    const poolRoster = await getInvitesForPool(POOL);
    expect(poolRoster).toHaveLength(1);
    expect(poolRoster[0].friend).toBe(BOB);
  });

  it("publicView strips the redemption secret", async () => {
    const view = publicView(SAMPLE);
    expect(view).not.toHaveProperty("code");
    expect(view).not.toHaveProperty("proofsBase64");
    expect(view.pool).toBe(POOL);
  });
});
