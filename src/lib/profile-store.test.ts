import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "./__mocks__/fake-redis";

const fake = new FakeRedis();

vi.mock("./kv/redis", () => ({
  getRedis: () => fake,
}));

import {
  consumeNonce,
  defaultProfile,
  getProfileByPseudo,
  getProfileByWallet,
  isPseudoAvailable,
  issueNonce,
  saveProfile,
  validatePseudo,
  type ProfileRow,
} from "./profile-store";

const ALICE = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const BOB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

beforeEach(() => {
  fake.store.clear();
  fake.sets.clear();
});

describe("validatePseudo", () => {
  it("accepts 3–24 chars of lowercase letters, digits, underscore", () => {
    expect(validatePseudo("abc")).toBeNull();
    expect(validatePseudo("marwan")).toBeNull();
    expect(validatePseudo("dev_007")).toBeNull();
    expect(validatePseudo("a".repeat(24))).toBeNull();
  });

  it("accepts uppercase by lowercasing first", () => {
    // The route lowercases before storing — the validator follows the
    // same rule so a user can type "Marwan" and still pass.
    expect(validatePseudo("Marwan")).toBeNull();
  });

  it("rejects too short / too long", () => {
    expect(validatePseudo("ab")).toMatch(/3.24/);
    expect(validatePseudo("a".repeat(25))).toMatch(/3.24/);
  });

  it("rejects disallowed characters", () => {
    expect(validatePseudo("has space")).toBeTruthy();
    expect(validatePseudo("hyphen-no")).toBeTruthy();
    expect(validatePseudo("emoji🙂")).toBeTruthy();
    expect(validatePseudo("dot.com")).toBeTruthy();
  });

  it("rejects non-strings defensively", () => {
    // The caller is responsible for type-narrowing, but the validator
    // shouldn't throw if a bogus value sneaks past.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validatePseudo(123 as any)).toBeTruthy();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(validatePseudo(null as any)).toBeTruthy();
  });
});

describe("defaultProfile", () => {
  it("returns a public profile with null pseudo + null avatar", () => {
    const p = defaultProfile(ALICE);
    expect(p.wallet).toBe(ALICE);
    expect(p.pseudo).toBeNull();
    expect(p.avatar).toBeNull();
    expect(p.isPublic).toBe(true);
    expect(p.xVerified).toBe(false);
    expect(p.createdAt).toBe(p.updatedAt);
  });
});

describe("getProfileByWallet / saveProfile", () => {
  it("returns null when no row exists", async () => {
    expect(await getProfileByWallet(ALICE)).toBeNull();
  });

  it("roundtrips a saved profile", async () => {
    const next = defaultProfile(ALICE);
    next.pseudo = "marwan";
    await saveProfile(next, null);
    expect(await getProfileByWallet(ALICE)).toEqual(next);
  });

  it("populates the pseudo index on save (case-insensitive)", async () => {
    const next: ProfileRow = { ...defaultProfile(ALICE), pseudo: "Marwan" };
    await saveProfile(next, null);
    // The route lowercases before passing the pseudo into save, but we
    // verify saveProfile itself is also case-insensitive on the index.
    expect(await getProfileByPseudo("marwan")).toEqual(next);
    expect(await getProfileByPseudo("MARWAN")).toEqual(next);
  });

  it("releases the prior pseudo when it changes", async () => {
    const first: ProfileRow = { ...defaultProfile(ALICE), pseudo: "first" };
    await saveProfile(first, null);
    const second: ProfileRow = { ...first, pseudo: "second" };
    await saveProfile(second, first);

    // Old pseudo should resolve to nobody now.
    expect(await getProfileByPseudo("first")).toBeNull();
    // New pseudo points at Alice.
    expect(await getProfileByPseudo("second")).toEqual(second);
    // Another wallet can claim the now-released "first".
    expect(await isPseudoAvailable("first", BOB)).toBe(true);
  });

  it("does NOT release the pseudo when it stays the same (re-save)", async () => {
    const p: ProfileRow = { ...defaultProfile(ALICE), pseudo: "alice" };
    await saveProfile(p, null);
    // Re-save with the same pseudo (e.g. only changed xHandle).
    const p2: ProfileRow = { ...p, xHandle: "alice_x" };
    await saveProfile(p2, p);
    expect(await getProfileByPseudo("alice")).toEqual(p2);
  });
});

describe("isPseudoAvailable", () => {
  it("returns true when the pseudo isn't claimed", async () => {
    expect(await isPseudoAvailable("freebird", ALICE)).toBe(true);
  });

  it("returns false when another wallet owns it", async () => {
    await saveProfile({ ...defaultProfile(ALICE), pseudo: "marwan" }, null);
    expect(await isPseudoAvailable("marwan", BOB)).toBe(false);
  });

  it("returns true when the SAME wallet owns it (idempotent re-save)", async () => {
    await saveProfile({ ...defaultProfile(ALICE), pseudo: "marwan" }, null);
    expect(await isPseudoAvailable("marwan", ALICE)).toBe(true);
  });

  it("treats casing as equivalent", async () => {
    await saveProfile({ ...defaultProfile(ALICE), pseudo: "Marwan" }, null);
    expect(await isPseudoAvailable("MARWAN", BOB)).toBe(false);
    expect(await isPseudoAvailable("marwan", BOB)).toBe(false);
  });
});

describe("issueNonce / consumeNonce", () => {
  it("issues a 64-char hex nonce", async () => {
    const n = await issueNonce(ALICE);
    expect(n).toMatch(/^[0-9a-f]{64}$/);
  });

  it("consumeNonce succeeds exactly once (single-use)", async () => {
    const n = await issueNonce(ALICE);
    expect(await consumeNonce(ALICE, n)).toBe(true);
    // Second attempt with the same nonce must fail — replay attacks.
    expect(await consumeNonce(ALICE, n)).toBe(false);
  });

  it("consumeNonce fails on mismatch", async () => {
    await issueNonce(ALICE);
    expect(await consumeNonce(ALICE, "wrong".padEnd(64, "0"))).toBe(false);
  });

  it("consumeNonce fails when no nonce was ever issued", async () => {
    expect(await consumeNonce(ALICE, "a".repeat(64))).toBe(false);
  });

  it("consumeNonce fails when the wallet doesn't match the issuer", async () => {
    const n = await issueNonce(ALICE);
    // Bob trying to spend Alice's nonce.
    expect(await consumeNonce(BOB, n)).toBe(false);
  });

  it("re-issuing replaces the previous nonce", async () => {
    const n1 = await issueNonce(ALICE);
    const n2 = await issueNonce(ALICE);
    expect(n1).not.toBe(n2);
    // Old nonce no longer usable.
    expect(await consumeNonce(ALICE, n1)).toBe(false);
    // New one works.
    expect(await consumeNonce(ALICE, n2)).toBe(true);
  });
});
