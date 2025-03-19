import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Required for the background-removal package
    config.resolve.alias = {
      ...config.resolve.alias,
      sharp$: false,
      "onnxruntime-node$": false,
    };
    return config;
  },
  // Add Turbopack configuration
  experimental: {
    turbo: {
      resolveAlias: {
        // For Turbopack, we need to use empty strings instead of false
        sharp: "",
        "onnxruntime-node": "",
      },
    },
  },
};

export default nextConfig;
