import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { FakeRedis } from "@/lib/__mocks__/fake-redis";

const fake = new FakeRedis();
vi.mock("@/lib/kv/redis", () => ({
  getRedis: () => fake,
}));

import { fireAlert } from "./alerts";

beforeEach(() => {
  fake.store.clear();
  fake.sets.clear();
  fake.zsets.clear();
  fake.ttls.clear();
});

afterEach(() => {
  delete process.env.ADMIN_ALERT_WEBHOOK_URL;
  delete process.env.ADMIN_ALERT_DEDUPE_HOURS;
  vi.unstubAllGlobals();
});

describe("fireAlert", () => {
  it("no-ops when no webhook is configured", async () => {
    const out = await fireAlert({
      id: "stuck:pool-xyz",
      severity: "high",
      title: "Stuck pool",
      detail: "AwaitingVrf for 2h",
    });
    expect(out).toBe("no-config");
  });

  it("posts to the configured webhook and sets a dedupe key", async () => {
    process.env.ADMIN_ALERT_WEBHOOK_URL = "https://example.com/hook";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const out = await fireAlert({
      id: "stuck:pool-xyz",
      severity: "high",
      title: "Stuck pool",
      detail: "AwaitingVrf for 2h",
      url: "https://app/admin/pools/xyz",
    });
    expect(out).toBe("sent");
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe("https://example.com/hook");
    const body = JSON.parse(call[1].body);
    // Vendor-agnostic body
    expect(body.text).toContain("Stuck pool");
    expect(body.content).toContain("Stuck pool");
    expect(body.embeds[0].title).toBe("Stuck pool");
    expect(body.embeds[0].url).toBe("https://app/admin/pools/xyz");
    // Dedupe key written with TTL
    expect(fake.store.has("alert-sent:stuck:pool-xyz")).toBe(true);
    expect(fake.ttls.get("alert-sent:stuck:pool-xyz")).toBeGreaterThan(0);
  });

  it("dedupes when called twice with the same id", async () => {
    process.env.ADMIN_ALERT_WEBHOOK_URL = "https://example.com/hook";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await fireAlert({
        id: "stuck:pool-xyz",
        severity: "high",
        title: "Stuck pool",
        detail: "x",
      }),
    ).toBe("sent");
    expect(
      await fireAlert({
        id: "stuck:pool-xyz",
        severity: "high",
        title: "Stuck pool again",
        detail: "x",
      }),
    ).toBe("deduped");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("treats a different id as a separate alert", async () => {
    process.env.ADMIN_ALERT_WEBHOOK_URL = "https://example.com/hook";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await fireAlert({
      id: "stuck:pool-a",
      severity: "high",
      title: "a",
      detail: "x",
    });
    await fireAlert({
      id: "stuck:pool-b",
      severity: "high",
      title: "b",
      detail: "x",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("releases the dedupe key on webhook failure (4xx)", async () => {
    process.env.ADMIN_ALERT_WEBHOOK_URL = "https://example.com/hook";
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400 });
    vi.stubGlobal("fetch", fetchMock);
    const out = await fireAlert({
      id: "stuck:pool-xyz",
      severity: "high",
      title: "Stuck pool",
      detail: "x",
    });
    expect(out).toBe("failed");
    expect(fake.store.has("alert-sent:stuck:pool-xyz")).toBe(false);
  });

  it("releases the dedupe key on network exception", async () => {
    process.env.ADMIN_ALERT_WEBHOOK_URL = "https://example.com/hook";
    const fetchMock = vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch", fetchMock);
    expect(
      await fireAlert({
        id: "stuck:pool-xyz",
        severity: "high",
        title: "x",
        detail: "x",
      }),
    ).toBe("failed");
    expect(fake.store.has("alert-sent:stuck:pool-xyz")).toBe(false);
  });

  it("respects ADMIN_ALERT_DEDUPE_HOURS env override on TTL", async () => {
    process.env.ADMIN_ALERT_WEBHOOK_URL = "https://example.com/hook";
    process.env.ADMIN_ALERT_DEDUPE_HOURS = "2";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    await fireAlert({
      id: "stuck:pool-xyz",
      severity: "high",
      title: "x",
      detail: "x",
    });
    expect(fake.ttls.get("alert-sent:stuck:pool-xyz")).toBe(2 * 60 * 60);
  });
});
