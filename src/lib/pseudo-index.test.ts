import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "./__mocks__/fake-redis";

const fake = new FakeRedis();

vi.mock("./kv/redis", () => ({
  getRedis: () => fake,
}));

// profile-store imports pseudo-index transitively. Mute the consumeNonce
// dependency it pulls in via friend-store so the test environment stays
// pure. (We don't exercise the nonce flow here.)
vi.mock("./profile-store", async () => {
  const actual = await vi.importActual<typeof import("./profile-store")>(
    "./profile-store",
  );
  return actual;
});

import {
  addPseudoToIndex,
  parsePseudoIndexMember,
  pseudoIndexMember,
  removePseudoFromIndex,
  searchPseudoPrefix,
} from "./pseudo-index";

const ALICE = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const BOB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
const CAROL = "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC";

beforeEach(() => {
  fake.store.clear();
  fake.sets.clear();
  fake.zsets.clear();
  fake.ttls.clear();
});

describe("pseudoIndexMember / parsePseudoIndexMember", () => {
  it("roundtrips a (pseudo, wallet) pair", () => {
    const m = pseudoIndexMember("alice", ALICE);
    expect(m).toBe(`alice::${ALICE}`);
    expect(parsePseudoIndexMember(m)).toEqual({ pseudo: "alice", wallet: ALICE });
  });

  it("lowercases the pseudo so the index lex order matches search input", () => {
    const m = pseudoIndexMember("Alice", ALICE);
    expect(m.startsWith("alice")).toBe(true);
  });

  it("returns null on malformed members", () => {
    expect(parsePseudoIndexMember("nocolons")).toBeNull();
  });
});

describe("addPseudoToIndex / searchPseudoPrefix", () => {
  it("returns nothing on empty prefix (no list-everyone shortcut)", async () => {
    await addPseudoToIndex("alice", ALICE);
    expect(await searchPseudoPrefix("")).toEqual([]);
    expect(await searchPseudoPrefix("   ")).toEqual([]);
  });

  it("finds an exact pseudo match", async () => {
    await addPseudoToIndex("alice", ALICE);
    const results = await searchPseudoPrefix("alice");
    expect(results).toEqual([{ pseudo: "alice", wallet: ALICE }]);
  });

  it("finds a prefix match (case-insensitive)", async () => {
    await addPseudoToIndex("alice", ALICE);
    await addPseudoToIndex("alex", BOB);
    await addPseudoToIndex("zebra", CAROL);

    const results = await searchPseudoPrefix("al");
    expect(results.map((r) => r.pseudo).sort()).toEqual(["alex", "alice"]);
    // Search input casing doesn't matter — the index is lowercase.
    expect((await searchPseudoPrefix("AL")).map((r) => r.pseudo).sort()).toEqual([
      "alex",
      "alice",
    ]);
  });

  it("excludes non-matching prefixes", async () => {
    await addPseudoToIndex("alice", ALICE);
    await addPseudoToIndex("bob", BOB);
    const results = await searchPseudoPrefix("al");
    expect(results.map((r) => r.wallet)).not.toContain(BOB);
  });

  it("respects the limit", async () => {
    for (let i = 0; i < 12; i++) {
      await addPseudoToIndex(`a_${i.toString().padStart(2, "0")}`, ALICE + i);
    }
    const results = await searchPseudoPrefix("a", 5);
    expect(results).toHaveLength(5);
  });
});

describe("removePseudoFromIndex", () => {
  it("removes the (pseudo, wallet) pair", async () => {
    await addPseudoToIndex("alice", ALICE);
    expect(await searchPseudoPrefix("alice")).toHaveLength(1);
    await removePseudoFromIndex("alice", ALICE);
    expect(await searchPseudoPrefix("alice")).toEqual([]);
  });

  it("only removes the SAME (pseudo, wallet) pair — a colliding pseudo on another wallet must not be wiped", async () => {
    // Pseudo uniqueness is enforced upstream; this is the defensive case
    // where the index somehow held two entries for the same pseudo.
    await addPseudoToIndex("alice", ALICE);
    await addPseudoToIndex("alice", BOB);
    await removePseudoFromIndex("alice", ALICE);
    expect(await searchPseudoPrefix("alice")).toEqual([
      { pseudo: "alice", wallet: BOB },
    ]);
  });
});

describe("end-to-end via saveProfile (integration with profile-store)", () => {
  // Re-import profile-store so it sees the same mocked redis.
  it("populates the index on save and removes the old pseudo on rename", async () => {
    const ps = await import("./profile-store");
    const initial = { ...ps.defaultProfile(ALICE), pseudo: "alice" };
    await ps.saveProfile(initial, null);
    expect(await searchPseudoPrefix("alice")).toEqual([
      { pseudo: "alice", wallet: ALICE },
    ]);

    // Rename to "alicia" — old alice gone, alicia present.
    const renamed = { ...initial, pseudo: "alicia" };
    await ps.saveProfile(renamed, initial);
    // Old "alice" exact match is gone.
    expect(await searchPseudoPrefix("alice")).toEqual([]);
    // New "alicia" surfaces under its own prefix...
    expect(await searchPseudoPrefix("alicia")).toEqual([
      { pseudo: "alicia", wallet: ALICE },
    ]);
    // ...and under shorter prefixes that match it.
    expect(await searchPseudoPrefix("alic")).toEqual([
      { pseudo: "alicia", wallet: ALICE },
    ]);
  });

  it("idempotent re-save with the same pseudo leaves the index alone", async () => {
    const ps = await import("./profile-store");
    const initial = { ...ps.defaultProfile(ALICE), pseudo: "alice" };
    await ps.saveProfile(initial, null);
    const resaved = { ...initial, xHandle: "alice_x" };
    await ps.saveProfile(resaved, initial);
    expect(await searchPseudoPrefix("alice")).toEqual([
      { pseudo: "alice", wallet: ALICE },
    ]);
  });
});
