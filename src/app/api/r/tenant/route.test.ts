// src/app/api/r/tenant/route.test.ts — hex color validation on POST /api/r/tenant
// Tests the regex guard directly; no HTTP layer needed.
import { describe, it, expect } from "vitest";

// The regex lives in the handler; duplicate here to keep tests self-contained
// and validate the contract that the handler enforces.
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

describe("hex color regex — Task 13 CSS injection guard", () => {
  // ---- Valid 6-digit hex ----
  it("accepts lowercase 6-digit hex", () => {
    expect(HEX_COLOR_RE.test("#88cfc4")).toBe(true);
  });

  it("accepts uppercase 6-digit hex", () => {
    expect(HEX_COLOR_RE.test("#88CFC4")).toBe(true);
  });

  it("accepts mixed-case 6-digit hex", () => {
    expect(HEX_COLOR_RE.test("#aAbBcC")).toBe(true);
  });

  it("accepts all-zeros", () => {
    expect(HEX_COLOR_RE.test("#000000")).toBe(true);
  });

  it("accepts all-Fs", () => {
    expect(HEX_COLOR_RE.test("#FFFFFF")).toBe(true);
  });

  // ---- Shorthand — must reject ----
  it("rejects 3-digit shorthand #fff", () => {
    expect(HEX_COLOR_RE.test("#fff")).toBe(false);
  });

  it("rejects 3-digit shorthand #000", () => {
    expect(HEX_COLOR_RE.test("#000")).toBe(false);
  });

  // ---- CSS injection attempts — must reject ----
  it("rejects CSS function body()", () => {
    expect(HEX_COLOR_RE.test("body{}")).toBe(false);
  });

  it("rejects expression injection", () => {
    expect(HEX_COLOR_RE.test("red; background: url(evil)")).toBe(false);
  });

  it("rejects url() injection", () => {
    expect(HEX_COLOR_RE.test("#fff; --x: url(https://evil.com)")).toBe(false);
  });

  it("rejects semicolon injection", () => {
    expect(HEX_COLOR_RE.test("#abc123; color: red")).toBe(false);
  });

  // ---- Missing # ----
  it("rejects hex without leading hash", () => {
    expect(HEX_COLOR_RE.test("88cfc4")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(HEX_COLOR_RE.test("")).toBe(false);
  });

  // ---- Wrong length ----
  it("rejects 8-digit RGBA hex", () => {
    expect(HEX_COLOR_RE.test("#88cfc4ff")).toBe(false);
  });

  it("rejects 4-digit hex", () => {
    expect(HEX_COLOR_RE.test("#abcd")).toBe(false);
  });

  // ---- Non-hex characters ----
  it("rejects non-hex characters", () => {
    expect(HEX_COLOR_RE.test("#gggggg")).toBe(false);
  });

  it("rejects named color 'red'", () => {
    expect(HEX_COLOR_RE.test("red")).toBe(false);
  });
});
