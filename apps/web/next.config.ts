import type { NextConfig } from "next";

// Baseline security response headers applied to every route. These are the
// controls surfaced (and tested) in the admin /security tab: HSTS, anti-
// clickjacking, MIME-sniff protection, referrer minimization, and a locked-down
// Permissions-Policy. A strict nonce-based CSP is tracked separately (todo).
const securityHeaders = [
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  // @hybrid/core is shipped as TypeScript source, so Next must transpile it.
  transpilePackages: ["@hybrid/core"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
