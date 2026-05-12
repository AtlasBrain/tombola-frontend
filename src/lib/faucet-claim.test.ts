import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "./__mocks__/fake-redis";

const fake = new FakeRedis();

// Swap the redis singleton for the in-memory fake.
vi.mock("./kv/redis", () => ({
  getRedis: () => fake,
}));

import {
  CLAIM_TTL_SEC,
  PENDING_PREFIX,
  RESERVATION_TTL_SEC,
  _resetMemUsedForTests,
  finalizeUsed,
  releaseReservation,
  reserveCode,
} from "./faucet-claim";

const CODE = "DEVNET-INVITE-001";
const ALICE = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const BOB = "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";

const KEY = `tombola:faucet:used:${CODE}`;

beforeEach(() => {
  fake.store.clear();
  fake.sets.clear();
  fake.ttls.clear();
  _resetMemUsedForTests();
});

describe("reserveCode", () => {
  it("acquires a fresh code with the short-TTL pending marker", async () => {
    expect(await reserveCode(CODE, ALICE)).toBe(true);
    expect(await fake.get<string>(KEY)).toBe(`${PENDING_PREFIX}${ALICE}`);
    expect(fake.ttls.get(KEY)).toBe(RESERVATION_TTL_SEC);
  });

  it("refuses a second reservation while the first is still pending", async () => {
    expect(await reserveCode(CODE, ALICE)).toBe(true);
    // Even from the SAME wallet — the route handler treats this as 409.
    expect(await reserveCode(CODE, ALICE)).toBe(false);
    expect(await reserveCode(CODE, BOB)).toBe(false);
  });

  it("refuses a reservation when the code was finalized previously", async () => {
    await reserveCode(CODE, ALICE);
    await finalizeUsed(CODE, ALICE);
    // Finalized claims persist for a year — no one can re-claim.
    expect(await reserveCode(CODE, BOB)).toBe(false);
  });
});

describe("finalizeUsed", () => {
  it("promotes the reservation to a long-TTL claim with the wallet as value", async () => {
    await reserveCode(CODE, ALICE);
    await finalizeUsed(CODE, ALICE);
    expect(await fake.get<string>(KEY)).toBe(ALICE);
    expect(fake.ttls.get(KEY)).toBe(CLAIM_TTL_SEC);
  });

  it("overwrites the pending marker without the NX flag", async () => {
    await reserveCode(CODE, ALICE);
    // No NX — finalize MUST replace the pending value with the wallet.
    await finalizeUsed(CODE, ALICE);
    expect(await fake.get<string>(KEY)).not.toContain(PENDING_PREFIX);
  });
});

describe("releaseReservation", () => {
  it("deletes a still-pending reservation when the wallet matches", async () => {
    await reserveCode(CODE, ALICE);
    await releaseReservation(CODE, ALICE);
    expect(await fake.get<string>(KEY)).toBeNull();
  });

  it("does NOT wipe a finalized claim if release races a successful finalize", async () => {
    // Simulates: another request flow finalized this code; ours errored
    // and rolled back. The rollback MUST NOT clobber the permanent
    // claim record.
    await reserveCode(CODE, ALICE);
    await finalizeUsed(CODE, ALICE);
    await releaseReservation(CODE, ALICE);
    // Permanent claim still there.
    expect(await fake.get<string>(KEY)).toBe(ALICE);
  });

  it("does NOT wipe another wallet's reservation", async () => {
    // Edge case: A and B both call faucet near-simultaneously; A wins
    // the SETNX, B's reserveCode returns false. If B's flow then
    // incorrectly called releaseReservation, A's pending must survive.
    await reserveCode(CODE, ALICE);
    await releaseReservation(CODE, BOB);
    expect(await fake.get<string>(KEY)).toBe(`${PENDING_PREFIX}${ALICE}`);
  });

  it("is a no-op when no key exists at all", async () => {
    await releaseReservation(CODE, ALICE);
    expect(await fake.get<string>(KEY)).toBeNull();
  });
});

describe("full happy-path lifecycle", () => {
  it("reserve -> finalize", async () => {
    expect(await reserveCode(CODE, ALICE)).toBe(true);
    await finalizeUsed(CODE, ALICE);
    expect(await fake.get<string>(KEY)).toBe(ALICE);
    expect(fake.ttls.get(KEY)).toBe(CLAIM_TTL_SEC);

    // After finalize the code is permanently claimed.
    expect(await reserveCode(CODE, BOB)).toBe(false);
  });

  it("reserve -> release allows re-claim", async () => {
    expect(await reserveCode(CODE, ALICE)).toBe(true);
    await releaseReservation(CODE, ALICE);
    // Alice gave up; Bob can now grab it.
    expect(await reserveCode(CODE, BOB)).toBe(true);
    expect(await fake.get<string>(KEY)).toBe(`${PENDING_PREFIX}${BOB}`);
  });
});

describe("concurrent reservation race (the recent atomicity fix)", () => {
  it("only ONE of two simultaneous reserveCode calls wins", async () => {
    const [a, b] = await Promise.all([
      reserveCode(CODE, ALICE),
      reserveCode(CODE, BOB),
    ]);
    const wins = [a, b].filter(Boolean).length;
    expect(wins).toBe(1);
    // Loser sees the winner's pending marker.
    const stored = await fake.get<string>(KEY);
    expect(stored === `${PENDING_PREFIX}${ALICE}` || stored === `${PENDING_PREFIX}${BOB}`).toBe(true);
  });
});
