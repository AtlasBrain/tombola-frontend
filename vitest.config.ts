import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// First testing pass: pure-function modules only, no React, no jsdom.
// When integration coverage lands later (e.g. mocked RPC for get-pools, or
// component tests for BuyTicketButton), add `environment: "happy-dom"` and
// the relevant Testing-Library packages.
export default defineConfig({
  plugins: [react()],
  test: {
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    environment: "happy-dom",
    setupFiles: ["./src/test-setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@tombola/sdk": path.resolve(__dirname, "vendor/sdk/index.ts"),
    },
  },
});
