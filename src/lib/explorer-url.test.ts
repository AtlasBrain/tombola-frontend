import { describe, it, expect } from "vitest";
import { explorerAddressUrl, clusterLabelFor } from "./explorer-url";

const ADDR = "qWyk54XHmEaRhYCuuhoEPKSWRnucyiUiVJGZJFvZB1M";

describe("clusterLabelFor", () => {
  it("returns 'localnet' for 127.0.0.1 and localhost", () => {
    expect(clusterLabelFor("http://127.0.0.1:8899")).toBe("localnet");
    expect(clusterLabelFor("http://localhost:8899")).toBe("localnet");
    expect(clusterLabelFor("http://LOCALHOST:8899")).toBe("localnet"); // case-insensitive
  });

  it("returns 'devnet' / 'testnet' for the official Solana hosts", () => {
    expect(clusterLabelFor("https://api.devnet.solana.com")).toBe("devnet");
    expect(clusterLabelFor("https://api.testnet.solana.com")).toBe("testnet");
  });

  it("falls back to 'mainnet' for any other host", () => {
    expect(clusterLabelFor("https://api.mainnet-beta.solana.com")).toBe(
      "mainnet",
    );
    expect(clusterLabelFor("https://my-private-rpc.example.com")).toBe(
      "mainnet",
    );
  });
});

describe("explorerAddressUrl", () => {
  it("uses cluster=custom + customUrl for localhost RPCs", () => {
    const url = explorerAddressUrl(ADDR, "http://127.0.0.1:8899");
    expect(url).toBe(
      `https://explorer.solana.com/address/${ADDR}?cluster=custom&customUrl=http%3A%2F%2F127.0.0.1%3A8899`,
    );
  });

  it("uses cluster=devnet/testnet for the matching Solana RPC hostnames", () => {
    expect(
      explorerAddressUrl(ADDR, "https://api.devnet.solana.com"),
    ).toBe(`https://explorer.solana.com/address/${ADDR}?cluster=devnet`);
    expect(
      explorerAddressUrl(ADDR, "https://api.testnet.solana.com"),
    ).toBe(`https://explorer.solana.com/address/${ADDR}?cluster=testnet`);
  });

  it("emits no cluster query for mainnet (the default)", () => {
    expect(
      explorerAddressUrl(ADDR, "https://api.mainnet-beta.solana.com"),
    ).toBe(`https://explorer.solana.com/address/${ADDR}`);
  });

  it("URL-encodes the customUrl so the cluster param round-trips cleanly", () => {
    const url = explorerAddressUrl(ADDR, "http://127.0.0.1:8899");
    // The colons/slashes inside customUrl must be %-encoded; the raw URL
    // contains them only in the prefix `?cluster=custom&customUrl=…`.
    const queryStart = url.indexOf("?");
    const customUrlPart = url.slice(queryStart);
    expect(customUrlPart).not.toContain("://");
    expect(customUrlPart).toContain("%3A%2F%2F");
  });
});
