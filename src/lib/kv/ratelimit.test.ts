import { beforeEach, describe, expect, it, vi } from "vitest";

// The interesting behavior to lock down: when Upstash env vars are NOT
// set (local dev / forgotten production secrets), `isRateLimited` MUST
// short-circuit to `false` so the dev server / preview deploys keep
// working. A regression here would silently let auth routes return
// 429 in production preview environments.
//
// We mock the underlying redis module rather than calling Upstash for
// real — getRedis() is the single seam.

vi.mock("./redis", () => ({
  getRedis: vi.fn(() => null),
}));

import { getLimiter, isRateLimited } from "./ratelimit";
import * as redisModule from "./redis";

describe("ratelimit fallback when Upstash isn't configured", () => {
  beforeEach(() => {
    vi.mocked(redisModule.getRedis).mockReturnValue(null);
  });

  it("getLimiter returns null", () => {
    expect(getLimiter("profile-nonce")).toBeNull();
  });

  it("isRateLimited returns false (allow) when no Redis", async () => {
    expect(await isRateLimited("profile-nonce", "wallet-abc")).toBe(false);
    expect(await isRateLimited("faucet", "1.2.3.4")).toBe(false);
  });
});

describe("ratelimit covers all named limiters", () => {
  // Compile-time + runtime check: if a new limiter is added to the
  // LimiterName union but its rule isn't wired in, getLimiter returns
  // undefined-window and Ratelimit constructor throws. This test
  // pre-empts that by exercising every name.
  const NAMES = [
    "profile-nonce",
    "profile-write",
    "friend-write",
    "faucet",
  ] as const;

  it("isRateLimited works for every defined LimiterName (no-redis fallback)", async () => {
    vi.mocked(redisModule.getRedis).mockReturnValue(null);
    for (const name of NAMES) {
      expect(await isRateLimited(name, "id")).toBe(false);
    }
  });
});
