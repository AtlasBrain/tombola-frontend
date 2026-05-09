import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

// --- mocks (must be hoisted via vi.mock; helper refs come from a factory) ---

const mockUseWallet = vi.fn();
const mockUseConnection = vi.fn(() => ({
  connection: { rpcEndpoint: "http://127.0.0.1:8899" },
}));

const mockSetWalletModalVisible = vi.fn();

vi.mock("@solana/wallet-adapter-react", () => ({
  useConnection: () => mockUseConnection(),
  useWallet: () => mockUseWallet(),
}));

vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({ setVisible: mockSetWalletModalVisible }),
}));

vi.mock("./Toast", () => ({
  useToast: () => ({ push: vi.fn() }),
}));

// Pull the SUT after the mocks are registered.
import { BuyTicketButton } from "./BuyTicketButton";

const PROPS = {
  poolType: 0 as const,
  round: 1n,
  ticketPriceLamports: 10_000_000n, // 0.01 SOL
};

const fakeWallet = () => ({
  publicKey: { toBase58: () => "FakeAddress11111111111111111111111111111111" },
  signTransaction: vi.fn(),
});

beforeEach(() => {
  mockUseWallet.mockReset();
});

describe("BuyTicketButton render branches", () => {
  it("shows 'Round closed' when closed=true (regardless of wallet)", () => {
    mockUseWallet.mockReturnValue({ publicKey: null, signTransaction: null });
    render(<BuyTicketButton {...PROPS} closed={true} />);
    expect(
      screen.getByRole("button", { name: "Round closed" }),
    ).toBeDisabled();
  });

  it("shows BUY 1 TICKET when no wallet, click opens wallet modal", () => {
    mockUseWallet.mockReturnValue({ publicKey: null, signTransaction: null });
    mockSetWalletModalVisible.mockReset();
    render(<BuyTicketButton {...PROPS} closed={false} />);
    const button = screen.getByRole("button", { name: /buy 1 ticket/i });
    expect(button).not.toBeDisabled();
    expect(button).toHaveAttribute("title", "Connect a wallet to buy");
    fireEvent.click(button);
    expect(mockSetWalletModalVisible).toHaveBeenCalledWith(true);
  });

  it("shows the qty input + cost preview when wallet is connected", () => {
    mockUseWallet.mockReturnValue(fakeWallet());
    render(<BuyTicketButton {...PROPS} closed={false} />);

    const input = screen.getByLabelText("Number of tickets to buy");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("type", "number");
    expect(input).toHaveValue(1);

    // Default qty=1 → 0.01 SOL preview + matching CTA label
    expect(screen.getByText("= 0.01 SOL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Buy 1 ticket — 0.01 SOL" }),
    ).toBeEnabled();
  });

  it("updates the cost preview live as the user types", () => {
    mockUseWallet.mockReturnValue(fakeWallet());
    render(<BuyTicketButton {...PROPS} closed={false} />);

    const input = screen.getByLabelText(
      "Number of tickets to buy",
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "5" } });
    expect(screen.getByText("= 0.05 SOL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Buy 5 tickets — 0.05 SOL" }),
    ).toBeEnabled();

    fireEvent.change(input, { target: { value: "100" } });
    expect(screen.getByText("= 1 SOL")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Buy 100 tickets — 1 SOL" }),
    ).toBeEnabled();
  });

  it("disables the buy button + shows '—' when the input is empty", () => {
    mockUseWallet.mockReturnValue(fakeWallet());
    render(<BuyTicketButton {...PROPS} closed={false} />);

    const input = screen.getByLabelText(
      "Number of tickets to buy",
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });

    expect(screen.getByText("—")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enter a quantity" }),
    ).toBeDisabled();
  });

  it("clamps to MIN on blur if the user emptied the field", () => {
    mockUseWallet.mockReturnValue(fakeWallet());
    render(<BuyTicketButton {...PROPS} closed={false} />);

    const input = screen.getByLabelText(
      "Number of tickets to buy",
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "" } });
    fireEvent.blur(input);

    expect(input).toHaveValue(1);
    expect(
      screen.getByRole("button", { name: "Buy 1 ticket — 0.01 SOL" }),
    ).toBeEnabled();
  });

  it("strips non-digits so '1.5' becomes '15'", () => {
    mockUseWallet.mockReturnValue(fakeWallet());
    render(<BuyTicketButton {...PROPS} closed={false} />);

    const input = screen.getByLabelText(
      "Number of tickets to buy",
    ) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "1.5" } });
    expect(input).toHaveValue(15);
  });
});
