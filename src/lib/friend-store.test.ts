import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "./__mocks__/fake-redis";

// Hoist a single FakeRedis instance into the module mock so the
// friend-store module gets a stable handle. Re-keying for each test
// happens in beforeEach via `fake.store.clear()` + `fake.sets.clear()`.
const fake = new FakeRedis();

vi.mock("./kv/redis", () => ({
  getRedis: () => fake,
}));

// profile-store is imported by friend-store for `consumeNonce`. We
// don't exercise that path here.
vi.mock("./profile-store", () => ({
  consumeNonce: vi.fn(async () => true),
}));

import {
  getFriendCount,
  getFriendLists,
  getRelationship,
  respondToFriendRequest,
  sendFriendRequest,
  unfriend,
} from "./friend-store";

const ALICE = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const BOB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const CAROL = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

beforeEach(() => {
  fake.store.clear();
  fake.sets.clear();
});

describe("sendFriendRequest", () => {
  it("rejects friending yourself", async () => {
    const r = await sendFriendRequest(ALICE, ALICE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/yourself/i);
  });

  it("writes pending edge + populates both index sets on first request", async () => {
    const r = await sendFriendRequest(ALICE, BOB);
    expect(r.ok).toBe(true);

    // From Alice's side: pending-out contains Bob.
    expect(await getFriendLists(ALICE)).toEqual({
      friends: [],
      pendingIn: [],
      pendingOut: [BOB],
    });
    // From Bob's side: pending-in contains Alice.
    expect(await getFriendLists(BOB)).toEqual({
      friends: [],
      pendingIn: [ALICE],
      pendingOut: [],
    });
    // Relationship from Alice's view = pending-out.
    expect(await getRelationship(ALICE, BOB)).toBe("pending-out");
    expect(await getRelationship(BOB, ALICE)).toBe("pending-in");
  });

  it("refuses a second request from the same sender", async () => {
    await sendFriendRequest(ALICE, BOB);
    const r = await sendFriendRequest(ALICE, BOB);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already sent/i);
  });

  it("refuses when the other side already invited the caller", async () => {
    await sendFriendRequest(BOB, ALICE);
    const r = await sendFriendRequest(ALICE, BOB);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already invited you/i);
  });

  it("refuses when the pair is already friends", async () => {
    await sendFriendRequest(ALICE, BOB);
    await respondToFriendRequest(BOB, ALICE, true);
    const r = await sendFriendRequest(ALICE, BOB);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already friends/i);
  });
});

describe("respondToFriendRequest — accept", () => {
  it("promotes pending to accepted, populates accepted sets, drops pending sets", async () => {
    await sendFriendRequest(ALICE, BOB);
    const r = await respondToFriendRequest(BOB, ALICE, true);
    expect(r.ok).toBe(true);

    expect(await getRelationship(ALICE, BOB)).toBe("friends");
    expect(await getRelationship(BOB, ALICE)).toBe("friends");
    expect(await getFriendCount(ALICE)).toBe(1);
    expect(await getFriendCount(BOB)).toBe(1);

    const aLists = await getFriendLists(ALICE);
    const bLists = await getFriendLists(BOB);
    expect(aLists.friends).toEqual([BOB]);
    expect(bLists.friends).toEqual([ALICE]);
    expect(aLists.pendingIn).toEqual([]);
    expect(aLists.pendingOut).toEqual([]);
    expect(bLists.pendingIn).toEqual([]);
    expect(bLists.pendingOut).toEqual([]);
  });

  it("refuses when no pending request exists", async () => {
    const r = await respondToFriendRequest(BOB, ALICE, true);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no pending request/i);
  });

  it("refuses to let the requester accept their own request", async () => {
    await sendFriendRequest(ALICE, BOB);
    const r = await respondToFriendRequest(ALICE, BOB, true);
    expect(r.ok).toBe(false);
  });
});

describe("respondToFriendRequest — reject", () => {
  it("clears the edge + pending sets and returns to strangers", async () => {
    await sendFriendRequest(ALICE, BOB);
    const r = await respondToFriendRequest(BOB, ALICE, false);
    expect(r.ok).toBe(true);

    expect(await getRelationship(ALICE, BOB)).toBe("strangers");
    expect((await getFriendLists(ALICE)).pendingOut).toEqual([]);
    expect((await getFriendLists(BOB)).pendingIn).toEqual([]);
  });
});

describe("unfriend", () => {
  it("removes both wallets from each other's accepted set", async () => {
    await sendFriendRequest(ALICE, BOB);
    await respondToFriendRequest(BOB, ALICE, true);
    const r = await unfriend(ALICE, BOB);
    expect(r.ok).toBe(true);
    expect(await getRelationship(ALICE, BOB)).toBe("strangers");
    expect(await getFriendCount(ALICE)).toBe(0);
    expect(await getFriendCount(BOB)).toBe(0);
  });

  it("lets the requester cancel a still-pending outgoing invite", async () => {
    await sendFriendRequest(ALICE, BOB);
    const r = await unfriend(ALICE, BOB);
    expect(r.ok).toBe(true);
    expect(await getRelationship(ALICE, BOB)).toBe("strangers");
  });

  it("refuses cancel from the OTHER side of a pending invite", async () => {
    await sendFriendRequest(ALICE, BOB);
    const r = await unfriend(BOB, ALICE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/only the requester/i);
  });

  it("refuses unfriend when no relationship exists", async () => {
    const r = await unfriend(ALICE, BOB);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/no relationship/i);
  });
});

describe("edge key is order-independent (lex canonical)", () => {
  it("sendFriendRequest(A,B) and sendFriendRequest(B,A) collide on the same key", async () => {
    await sendFriendRequest(ALICE, BOB);
    // Bob trying to friend Alice should see "already invited you" (the
    // opposite-direction branch) because the same edge key already
    // exists — not "request sent".
    const r = await sendFriendRequest(BOB, ALICE);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already invited/i);
  });
});

describe("concurrent sendFriendRequest race (the recent atomicity fix)", () => {
  it("two concurrent requests from the same wallet only land one edge", async () => {
    // Fire both before the first has finished writing. The SETNX in the
    // mutation should make only one acquire the edge; the other re-reads
    // and surfaces the right error path.
    const [a, b] = await Promise.all([
      sendFriendRequest(ALICE, BOB),
      sendFriendRequest(ALICE, BOB),
    ]);

    // Exactly one wins; the other gets an error.
    const wins = [a.ok, b.ok].filter(Boolean).length;
    expect(wins).toBe(1);
    // The losing call surfaces a known error string (any of three is fine).
    const loser = a.ok ? b : a;
    expect(loser.error).toBeTruthy();

    // State is consistent: a single edge, both sets populated once.
    expect((await getFriendLists(ALICE)).pendingOut).toEqual([BOB]);
    expect((await getFriendLists(BOB)).pendingIn).toEqual([ALICE]);
  });
});

describe("getFriendLists — multiple friends", () => {
  it("lists all accepted friends + both pending sets", async () => {
    await sendFriendRequest(ALICE, BOB);
    await respondToFriendRequest(BOB, ALICE, true);
    await sendFriendRequest(CAROL, ALICE);
    await sendFriendRequest(ALICE, "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD");

    const lists = await getFriendLists(ALICE);
    expect(lists.friends.sort()).toEqual([BOB].sort());
    expect(lists.pendingIn).toEqual([CAROL]);
    expect(lists.pendingOut).toEqual([
      "DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
    ]);
  });
});
