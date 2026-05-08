import type { NextConfig } from "next";
import path from "node:path";

const SDK_ROOT = path.resolve(__dirname, "../../../../Project Tombola/sdk/src");

const nextConfig: NextConfig = {
  webpack: (config) => {
    config.resolve.alias = {
      ...(config.resolve.alias ?? {}),
      "@tombola/sdk": path.join(SDK_ROOT, "index.ts"),
      "@tombola/sdk/": SDK_ROOT + "/",
    };
    // SDK source uses ".js" extensions on imports (TS ESM convention);
    // webpack must rewrite them to ".ts" so it can find the actual files.
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
};

export default nextConfig;
