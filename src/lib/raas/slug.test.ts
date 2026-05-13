// src/lib/raas/slug.test.ts
import { describe, it, expect } from "vitest";
import { slugify, isReservedSlug, isValidSlug } from "./slug.js";

describe("slugify", () => {
  it("lowercases and dasherizes", () => {
    expect(slugify("MrBeast Raffles")).toBe("mrbeast-raffles");
  });
  it("strips non-alphanumeric except dash", () => {
    expect(slugify("Acme!@#  Casino_X")).toBe("acme-casino-x");
  });
  it("collapses repeated dashes", () => {
    expect(slugify("foo --- bar")).toBe("foo-bar");
  });
  it("trims leading/trailing dashes", () => {
    expect(slugify("-foo-")).toBe("foo");
  });
});

describe("isReservedSlug", () => {
  it.each(["onboard", "admin", "api", "ops", "_ops", "tenant", "tombola"])(
    "reserves %s",
    (slug) => {
      expect(isReservedSlug(slug)).toBe(true);
    },
  );
  it("does not reserve normal names", () => {
    expect(isReservedSlug("mrbeast")).toBe(false);
  });
});

describe("isValidSlug", () => {
  it("accepts 3-32 char lowercase alphanumeric+dash", () => {
    expect(isValidSlug("mrbeast")).toBe(true);
    expect(isValidSlug("acme-casino")).toBe(true);
    expect(isValidSlug("abc")).toBe(true);
  });
  it("rejects too short", () => {
    expect(isValidSlug("ab")).toBe(false);
  });
  it("rejects too long", () => {
    expect(isValidSlug("a".repeat(33))).toBe(false);
  });
  it("rejects uppercase", () => {
    expect(isValidSlug("MrBeast")).toBe(false);
  });
  it("rejects reserved names", () => {
    expect(isValidSlug("admin")).toBe(false);
  });
  it("rejects leading underscore", () => {
    expect(isValidSlug("_ops")).toBe(false);
  });
});
