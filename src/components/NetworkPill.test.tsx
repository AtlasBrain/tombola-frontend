import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { NetworkPill } from "./NetworkPill";

describe("NetworkPill", () => {
  it("shows 'localnet' for 127.0.0.1 RPCs", () => {
    render(<NetworkPill rpcUrl="http://127.0.0.1:8899" />);
    const pill = screen.getByTitle("http://127.0.0.1:8899");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent("LOCALNET");
  });

  it("shows 'devnet' for the official devnet RPC", () => {
    render(<NetworkPill rpcUrl="https://api.devnet.solana.com" />);
    expect(screen.getByTitle("https://api.devnet.solana.com")).toHaveTextContent("DEVNET");
  });

  it("shows 'testnet' for the official testnet RPC", () => {
    render(<NetworkPill rpcUrl="https://api.testnet.solana.com" />);
    expect(screen.getByTitle("https://api.testnet.solana.com")).toHaveTextContent("TESTNET");
  });

  it("shows 'mainnet' for unknown / mainnet RPCs over HTTPS", () => {
    render(<NetworkPill rpcUrl="https://api.mainnet-beta.solana.com" />);
    const pill = screen.getByTitle("https://api.mainnet-beta.solana.com");
    expect(pill).toBeInTheDocument();
    expect(pill).toHaveTextContent("MAINNET");
    expect(pill).toHaveClass("text-neutral-300");
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
    const pill = screen.getByTitle("http://127.0.0.1:8899");
    expect(pill).toHaveClass("text-neutral-300");
    expect(pill).toHaveTextContent("LOCALNET");
  });
});
