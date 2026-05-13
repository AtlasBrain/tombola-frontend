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
      // sdk-v2 sub-path imports: map @tombola/sdk-v2/<file> → vendor/sdk-v2/<file>.ts
      // Must come before the bare @tombola/sdk-v2 alias so sub-paths are matched first.
      "@tombola/sdk-v2/codes": path.resolve(__dirname, "vendor/sdk-v2/codes.ts"),
      "@tombola/sdk-v2/merkle": path.resolve(__dirname, "vendor/sdk-v2/merkle.ts"),
      "@tombola/sdk-v2": path.resolve(__dirname, "vendor/sdk-v2/index.ts"),
      // `server-only` is a no-op marker at runtime that throws when
      // imported from a Client Component. Vitest sees keeper modules as
      // "client" by default; alias to an empty stub so the marker stays
      // a Next.js production-build check but doesn't block unit tests.
      "server-only": path.resolve(__dirname, "src/test-server-only-stub.ts"),
    },
  },
});
