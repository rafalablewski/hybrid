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
  // CSP baseline: the directives that need no per-request nonce. They close
  // off plugin/object injection, <base> hijacking, cross-origin form posts and
  // framing, and force https. A strict nonce-based script-src/style-src is
  // tracked separately (hdr-csp-strict-script) and needs a nonce pipeline.
  {
    key: "Content-Security-Policy",
    value: [
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
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
