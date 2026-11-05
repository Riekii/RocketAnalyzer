import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@kant/node-boxcars", "cbor-x"],
  outputFileTracingIncludes: {
    "/api/analyze": [
      "./scripts/parse-replay.mjs",
      "./.local/rrrocket/rrrocket.exe",
      "./.local/rrrocket/rrrocket",
      "./src/lib/replay.ts",
      "./src/lib/network.ts",
      "./src/lib/telemetry.ts",
      "./node_modules/@kant/node-boxcars/**/*",
      "./node_modules/@kant/node-boxcars-win32-x64-msvc/**/*",
      "./node_modules/cbor-x/**/*",
    ],
  },
};

export default nextConfig;
