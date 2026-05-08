import { defineConfig } from "vitest/config";
import path from "node:path";

// First testing pass: pure-function modules only, no React, no jsdom.
// When integration coverage lands later (e.g. mocked RPC for get-pools, or
// component tests for BuyTicketButton), add `environment: "happy-dom"` and
// the relevant Testing-Library packages.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@tombola/sdk": path.resolve(__dirname, "vendor/sdk/index.ts"),
    },
  },
});
