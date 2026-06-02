import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // @hybrid/core is shipped as TypeScript source, so Next must transpile it.
  transpilePackages: ["@hybrid/core"],
};

export default nextConfig;
