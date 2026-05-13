import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { FeeBreakdownPanel } from "./FeeBreakdownPanel";

describe("FeeBreakdownPanel", () => {
  it("renders fee math for 0.05 SOL ticket at 15% creator fee", () => {
    // 0.05 SOL = 50_000_000 lamports
    // creator fee: 15% = 1500 bps → 7_500_000 lamports
    // protocol fee: 1% = 100 bps  → 500_000 lamports
    // net to pot: 84%              → 42_000_000 lamports
    const { container } = render(
      <FeeBreakdownPanel
        ticketPriceLamports={50_000_000n}
        creatorFeeBps={1500}
        tenantDisplayName="Acme Labs"
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("0.0500 SOL");                    // ticket price
    expect(text).toContain("Creator fee (15.0% → Acme Labs)");
    expect(text).toContain("0.0075 SOL");                    // creator share
    expect(text).toContain("Protocol fee (1.0% → Tombola)");
    expect(text).toContain("0.0005 SOL");                    // protocol share
    expect(text).toContain("To prize pot (84.0%)");
    expect(text).toContain("0.0420 SOL");                    // net share
  });
});
