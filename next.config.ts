import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@kant/node-boxcars", "cbor-x"],
  outputFileTracingIncludes: {
    "/api/analyze": [
      "./scripts/parse-replay.mjs",
      "./node_modules/@kant/node-boxcars/**/*",
      "./node_modules/@kant/node-boxcars-win32-x64-msvc/**/*",
      "./node_modules/cbor-x/**/*",
    ],
  },
};

export default nextConfig;
