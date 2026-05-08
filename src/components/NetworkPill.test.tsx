import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetworkPill } from "./NetworkPill";

describe("NetworkPill", () => {
  it("shows 'localnet' for 127.0.0.1 RPCs", () => {
    render(<NetworkPill rpcUrl="http://127.0.0.1:8899" />);
    const pill = screen.getByText("localnet");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveAttribute("title", "http://127.0.0.1:8899");
  });

  it("shows 'devnet' for the official devnet RPC", () => {
    render(<NetworkPill rpcUrl="https://api.devnet.solana.com" />);
    expect(screen.getByText("devnet")).toBeInTheDocument();
  });

  it("shows 'testnet' for the official testnet RPC", () => {
    render(<NetworkPill rpcUrl="https://api.testnet.solana.com" />);
    expect(screen.getByText("testnet")).toBeInTheDocument();
  });

  it("shows 'mainnet' for unknown / mainnet RPCs over HTTPS", () => {
    render(<NetworkPill rpcUrl="https://api.mainnet-beta.solana.com" />);
    const pill = screen.getByText("mainnet");
    expect(pill).toBeInTheDocument();
    // Mainnet over HTTPS uses the safe emerald style
    expect(pill).toHaveClass("text-emerald-400");
  });

  it("shows the rose '⚠ insecure RPC' warning for mainnet over plain HTTP", () => {
    render(<NetworkPill rpcUrl="http://my-private-rpc.example.com" />);
    const pill = screen.getByText(/insecure RPC/);
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveClass("text-rose-400");
    expect(pill).toHaveAttribute(
      "title",
      expect.stringContaining("Mainnet RPC over plain HTTP"),
    );
  });

  it("uses neutral styling for localnet (dev signal, no warning)", () => {
    render(<NetworkPill rpcUrl="http://127.0.0.1:8899" />);
    expect(screen.getByText("localnet")).toHaveClass("text-neutral-300");
  });
});
