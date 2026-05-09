import { describe, it, expect } from "vitest";
import { accentForPool } from "./pool-accent";

describe("accentForPool", () => {
  it("maps each pool type to a distinct CSS var", () => {
    expect(accentForPool("Weekly")).toBe("var(--lavender)");
    expect(accentForPool("Biweekly")).toBe("var(--mint)");
    expect(accentForPool("Triweekly")).toBe("var(--yellow)");
    expect(accentForPool("Monthly")).toBe("var(--pink)");
  });
  it("falls back to lavender for unknown types", () => {
    expect(accentForPool("Unknown")).toBe("var(--lavender)");
  });
});
