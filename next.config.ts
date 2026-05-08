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
    return config;
  },
};

export default nextConfig;
