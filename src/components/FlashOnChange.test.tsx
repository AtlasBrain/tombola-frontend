import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { FlashOnChange } from "./FlashOnChange";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("FlashOnChange", () => {
  it("does not apply the flash class on initial mount", () => {
    render(<FlashOnChange value="1">hello</FlashOnChange>);
    const wrapper = screen.getByText("hello");
    // The base class string is always present; the flash class is the only
    // thing that toggles on/off.
    expect(wrapper.className).not.toContain("text-amber-300");
  });

  it("adds the flash class when value changes", () => {
    const { rerender } = render(
      <FlashOnChange value="1">hello</FlashOnChange>,
    );
    expect(screen.getByText("hello").className).not.toContain("text-amber-300");

    rerender(<FlashOnChange value="2">hello</FlashOnChange>);
    expect(screen.getByText("hello").className).toContain("text-amber-300");
  });

  it("removes the flash class after the configured duration", () => {
    const { rerender } = render(
      <FlashOnChange value="1" durationMs={500}>
        hello
      </FlashOnChange>,
    );
    rerender(
      <FlashOnChange value="2" durationMs={500}>
        hello
      </FlashOnChange>,
    );
    expect(screen.getByText("hello").className).toContain("text-amber-300");

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(screen.getByText("hello").className).not.toContain("text-amber-300");
  });

  it("does not flash when value is identical across renders", () => {
    const { rerender } = render(
      <FlashOnChange value="abc">hello</FlashOnChange>,
    );
    rerender(<FlashOnChange value="abc">hello</FlashOnChange>);
    expect(screen.getByText("hello").className).not.toContain("text-amber-300");
  });

  it("re-flashes when value changes again after the previous flash", () => {
    const { rerender } = render(
      <FlashOnChange value="1" durationMs={300}>
        hello
      </FlashOnChange>,
    );

    rerender(
      <FlashOnChange value="2" durationMs={300}>
        hello
      </FlashOnChange>,
    );
    expect(screen.getByText("hello").className).toContain("text-amber-300");

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(screen.getByText("hello").className).not.toContain("text-amber-300");

    rerender(
      <FlashOnChange value="3" durationMs={300}>
        hello
      </FlashOnChange>,
    );
    expect(screen.getByText("hello").className).toContain("text-amber-300");
  });
});
