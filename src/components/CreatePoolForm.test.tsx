import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Stub wallet context — the form reads useWallet() but only acts on submit;
// tests focus on field validation, which doesn't need a real wallet.
vi.mock("@solana/wallet-adapter-react", () => ({
  useWallet: () => ({ publicKey: null, signTransaction: null }),
  useConnection: () => ({ connection: { rpcEndpoint: "http://localhost" } }),
}));
vi.mock("@solana/wallet-adapter-react-ui", () => ({
  useWalletModal: () => ({ setVisible: vi.fn() }),
}));

import { CreatePoolForm } from "./CreatePoolForm";

describe("<CreatePoolForm />", () => {
  it("disables submit until all required fields are valid", () => {
    render(<CreatePoolForm onCreated={() => {}} />);
    const submit = screen.getByRole("button", { name: /create pool/i });
    expect(submit).toBeDisabled();
  });

  it("rejects ticket price <= 0", () => {
    render(<CreatePoolForm onCreated={() => {}} />);
    const priceInput = screen.getByLabelText(/ticket price/i);
    fireEvent.change(priceInput, { target: { value: "0" } });
    expect(screen.getByText(/must be > 0/i)).toBeInTheDocument();
  });

  it("rejects duration < 1 hour", () => {
    render(<CreatePoolForm onCreated={() => {}} />);
    const days = screen.getByLabelText(/days/i);
    const hours = screen.getByLabelText(/hours/i);
    fireEvent.change(days, { target: { value: "0" } });
    fireEvent.change(hours, { target: { value: "0" } });
    expect(screen.getByText(/at least 1 hour/i)).toBeInTheDocument();
  });

  it("rejects duration > 90 days", () => {
    render(<CreatePoolForm onCreated={() => {}} />);
    const days = screen.getByLabelText(/days/i);
    fireEvent.change(days, { target: { value: "91" } });
    expect(screen.getByText(/at most 90 days/i)).toBeInTheDocument();
  });

  it("rejects code count > 5000", () => {
    render(<CreatePoolForm onCreated={() => {}} />);
    const count = screen.getByLabelText(/number of codes/i);
    fireEvent.change(count, { target: { value: "5001" } });
    expect(screen.getByText(/at most 5000/i)).toBeInTheDocument();
  });

  it("rejects creator fee > 5%", () => {
    render(<CreatePoolForm onCreated={() => {}} />);
    const fee = screen.getByLabelText(/creator fee/i);
    fireEvent.change(fee, { target: { value: "5.1" } });
    expect(screen.getByText(/at most 5/i)).toBeInTheDocument();
  });
});
