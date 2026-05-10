import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: [
      {
        find: /^@tombola\/sdk\/(.+)$/,
        replacement: path.resolve(__dirname, "../../vendor/sdk/$1"),
      },
      {
        find: "@tombola/sdk",
        replacement: path.resolve(__dirname, "../../vendor/sdk/index.ts"),
      },
    ],
  },
});
