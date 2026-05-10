import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      "@tombola/sdk": path.resolve(__dirname, "../../vendor/sdk/index.ts"),
      "@tombola/sdk/*": [path.resolve(__dirname, "../../vendor/sdk/*")],
    },
  },
});
