// Vitest setup — runs once before any test file.
// Adds @testing-library/jest-dom matchers (toBeInTheDocument, toHaveClass, …)
// to vitest's `expect`, and auto-unmounts components between tests so
// queries in later tests don't see leftover DOM from earlier ones.
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
