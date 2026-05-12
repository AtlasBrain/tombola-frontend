import { describe, it, expect } from "vitest";
import { unwrapOption } from "./option";

// Five callers depend on this helper (wallet-stats, creator-stats,
// buyer-pools, leaderboard, get-pool-detail). Codama's Option<T> codec
// returns either a discriminator wrapper OR the raw value depending on
// the SDK path — both shapes must work, plus null/undefined for None.

describe("unwrapOption", () => {
  describe("Codama Option wrapper shape", () => {
    it("returns coerced value for Some", () => {
      const raw = { __option: "Some", value: 42 };
      expect(unwrapOption(raw, (v) => Number(v))).toBe(42);
    });

    it("returns null for None", () => {
      const raw = { __option: "None" };
      expect(unwrapOption(raw, (v) => Number(v))).toBeNull();
    });

    it("returns null when __option is Some but value is undefined", () => {
      // Defensive: if a malformed payload arrives, treat as None rather
      // than coercing undefined into NaN / 'undefined'.
      const raw = { __option: "Some", value: undefined };
      expect(unwrapOption(raw, String)).toBeNull();
    });

    it("coerces with the provided fn (bigint case)", () => {
      const raw = { __option: "Some", value: 100n };
      expect(
        unwrapOption(raw, (v) => BigInt(v as bigint | number | string)),
      ).toBe(100n);
    });
  });

  describe("raw-value shape", () => {
    it("coerces a plain string to string", () => {
      expect(unwrapOption("hello", String)).toBe("hello");
    });

    it("coerces a plain number to bigint", () => {
      expect(
        unwrapOption(42, (v) => BigInt(v as bigint | number | string)),
      ).toBe(42n);
    });
  });

  describe("null / undefined", () => {
    it("returns null for raw null", () => {
      expect(unwrapOption(null, String)).toBeNull();
    });

    it("returns null for raw undefined", () => {
      expect(unwrapOption(undefined, String)).toBeNull();
    });
  });
});
