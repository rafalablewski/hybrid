import type { NextConfig } from "next";

// Baseline security response headers applied to every route: HSTS, anti-
// clickjacking, MIME-sniff protection, referrer minimization, a locked-down
// Permissions-Policy. The Content-Security-Policy is set per-request in
// middleware.ts (it needs a fresh nonce each request for the strict script-src).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // @hybrid/core is shipped as TypeScript source, so Next must transpile it.
  transpilePackages: ["@hybrid/core"],
  // The Apple IAP route reads root-CA cert files at runtime; force them into the
  // serverless bundle (they're otherwise invisible to Next's dependency tracer).
  outputFileTracingIncludes: {
    "/api/billing/iap/verify": ["./lib/apple-root-certs/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
