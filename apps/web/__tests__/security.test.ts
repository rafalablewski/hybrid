import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Static security guardrails. These scan the actual source tree so a future
// change that weakens a control (drops an auth check, leaks a token, removes a
// security header, commits a secret) turns CI red. They back the `pass` items
// shown green in the admin /security tab.

const APP_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function walk(dir: string, exts: string[], skip: string[] = []): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (skip.includes(name) || name === "node_modules" || name === ".next") continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, exts, skip));
    else if (exts.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

const apiRoutes = walk(join(APP_ROOT, "app", "api"), ["route.ts"]);
const adminRoutes = apiRoutes.filter((f) => f.includes(join("api", "admin")));
const read = (f: string) => readFileSync(f, "utf8");

// Deliberately PUBLIC routes — no user/machine auth is possible because there's
// no account or signing secret. They are allow-listed from the auth check but
// MUST still be rate-limited (enforced below), so the allow-list can't become a
// silent open door.
//   - anon-sessions: a guest logs a workout BEFORE creating an account, so an
//     admin sees real pre-signup usage. Non-PII (opaque deviceId + blocks).
//   - email/unsubscribe: a marketing-email recipient who may not have an account
//     opts out via a one-click link; the credential is an HMAC token over their
//     email (verifyUnsubscribeToken), so no session is possible by design.
const PUBLIC_ROUTES = [join("api", "anon-sessions"), join("api", "email", "unsubscribe"), join("api", "health")];
const isPublic = (f: string) => PUBLIC_ROUTES.some((p) => f.includes(p));

describe("authentication: every API route authenticates", () => {
  it("found a meaningful number of routes", () => {
    expect(apiRoutes.length).toBeGreaterThan(20);
  });
  it("no route is reachable without an auth helper", () => {
    const offenders = apiRoutes.filter((f) => {
      if (isPublic(f)) return false; // intentionally public — see PUBLIC_ROUTES
      const src = read(f);
      // A route authenticates via a user session (getOrCreateDbUser/requireAdmin,
      // or requireAgentOperator which wraps requireAdmin) OR a machine channel:
      // a CRON_SECRET bearer (Vercel Cron), a verified Slack request signature,
      // or a verified Stripe webhook signature (constructEvent + the signing secret).
      return !/getOrCreateDbUser|requireAdmin|requireAgentOperator|CRON_SECRET|verifySlackSignature|constructEvent/.test(src);
    });
    expect(offenders, `routes missing an auth check:\n${offenders.join("\n")}`).toEqual([]);
  });
  it("every deliberately-public route is rate-limited", () => {
    const offenders = apiRoutes
      .filter(isPublic)
      .filter((f) => !/rateLimit/.test(read(f)));
    expect(offenders, `public routes missing a rate limit:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("authorization: admin surface is locked down", () => {
  it("every /api/admin route requires the ADMIN role", () => {
    expect(adminRoutes.length).toBeGreaterThan(5);
    // requireAgentOperator wraps requireAdmin (admin + operator allow-list).
    const offenders = adminRoutes.filter((f) => !/requireAdmin|requireAgentOperator/.test(read(f)));
    expect(offenders, `admin routes missing requireAdmin:\n${offenders.join("\n")}`).toEqual([]);
  });
  it("the /admin page is server-gated and redirects non-admins", () => {
    const layout = read(join(APP_ROOT, "app", "admin", "layout.tsx"));
    expect(layout).toMatch(/getAdmin/);
    expect(layout).toMatch(/redirect\(/);
  });
});

describe("data protection: tokens never leak", () => {
  it("no route selects an OAuth token into a result object", () => {
    const offenders = apiRoutes.filter((f) => /(accessToken|refreshToken)\s*:\s*true/.test(read(f)));
    expect(offenders).toEqual([]);
  });
  it("the connections listing endpoint never touches tokens", () => {
    const conn = read(join(APP_ROOT, "app", "api", "connections", "route.ts"));
    expect(conn).not.toMatch(/accessToken|refreshToken/);
  });
  it("no Connection findMany is unprojected (a bare findMany returns the tokens)", () => {
    // The accessToken:true check above misses the real leak vector: a
    // findMany with NO `select` returns EVERY column — including the OAuth
    // tokens — straight into a response (this is exactly how /account/export
    // leaked them). Require an explicit `select` on every Connection findMany.
    const offenders = apiRoutes.filter((f) => {
      const calls = read(f).match(/connection\.findMany\(\{[\s\S]*?\}\s*\)/g) ?? [];
      return calls.some((c) => !/\bselect\s*:/.test(c));
    });
    expect(offenders, `Connection findMany without select in:\n${offenders.join("\n")}`).toEqual([]);
  });
  it("the account export never serializes OAuth tokens", () => {
    const exp = read(join(APP_ROOT, "app", "api", "account", "export", "route.ts"));
    // tokens must not be selected true, and the connection read must project.
    expect(exp).not.toMatch(/(accessToken|refreshToken)\s*:\s*true/);
    expect(exp).toMatch(/connection\.findMany\([\s\S]*?select\s*:/);
  });
});

describe("xss: no raw HTML injection", () => {
  it("dangerouslySetInnerHTML is not used", () => {
    const files = [
      ...walk(join(APP_ROOT, "app"), [".tsx", ".ts"], ["__tests__"]),
      ...walk(join(APP_ROOT, "components"), [".tsx", ".ts"]),
    ];
    const offenders = files.filter((f) => /dangerouslySetInnerHTML/.test(read(f)));
    expect(offenders, `raw HTML injection in:\n${offenders.join("\n")}`).toEqual([]);
  });
});

describe("transport: security headers are configured", () => {
  const cfg = read(join(APP_ROOT, "next.config.ts"));
  const mw = read(join(APP_ROOT, "middleware.ts"));
  it("next.config sends the baseline headers", () => {
    for (const h of [
      "Strict-Transport-Security",
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
    ]) {
      expect(cfg, `missing header ${h}`).toMatch(h);
    }
  });
  it("middleware sets a strict, nonce-based CSP", () => {
    expect(mw).toMatch(/content-security-policy/i);
    expect(mw).toMatch(/'nonce-/);
    expect(mw).toMatch(/'strict-dynamic'/);
    for (const d of ["object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'", "upgrade-insecure-requests"]) {
      expect(mw, `missing CSP directive ${d}`).toMatch(d);
    }
  });
});

describe("csrf: cookie mutations are origin-checked", () => {
  it("middleware enforces csrfCheck on /api", () => {
    const mw = read(join(APP_ROOT, "middleware.ts"));
    expect(mw).toMatch(/csrfCheck/);
    expect(mw).toMatch(/\/api\//);
  });
});

describe("accountability: support reads are audited", () => {
  it("the admin user-detail GET writes an audit entry", () => {
    const src = read(join(APP_ROOT, "app", "api", "admin", "users", "[id]", "route.ts"));
    expect(src).toMatch(/audit\(/);
    expect(src).toMatch(/user\.view/);
  });
});

describe("data at rest: wearable tokens are encryptable", () => {
  it("stored tokens go through protectToken on write", () => {
    const cb = read(join(APP_ROOT, "app", "api", "connect", "[provider]", "callback", "route.ts"));
    expect(cb).toMatch(/protectToken\(/);
    expect(cb).not.toMatch(/accessToken:\s*tok\.access_token\b/); // no raw token stored
  });
  it("tokens are decrypted before use, not stored decrypted", () => {
    const sync = read(join(APP_ROOT, "app", "api", "connect", "[provider]", "sync", "route.ts"));
    expect(sync).toMatch(/revealToken\(/);
  });
});

describe("disclosure: security.txt is published", () => {
  it("has an RFC 9116 contact + expiry", () => {
    const txt = read(join(APP_ROOT, "public", ".well-known", "security.txt"));
    expect(txt).toMatch(/^Contact:/m);
    expect(txt).toMatch(/^Expires:/m);
  });
});

describe("abuse: expensive + privileged writes are rate-limited", () => {
  it("the AI coach endpoint applies a rate limit", () => {
    const src = read(join(APP_ROOT, "app", "api", "ai-coach", "route.ts"));
    expect(src).toMatch(/rateLimit\(/);
  });
  it("the admin user mutation applies a rate limit and a body cap", () => {
    const src = read(join(APP_ROOT, "app", "api", "admin", "users", "[id]", "route.ts"));
    expect(src).toMatch(/rateLimit\(/);
    expect(src).toMatch(/readJsonLimited/);
  });
});

describe("secrets: nothing sensitive is committed", () => {
  const scanFiles = [
    ...walk(join(APP_ROOT, "app"), [".ts", ".tsx"], ["__tests__"]),
    ...walk(join(APP_ROOT, "components"), [".ts", ".tsx"]),
    ...walk(join(APP_ROOT, "lib"), [".ts", ".tsx"]),
    join(APP_ROOT, "next.config.ts"),
    join(APP_ROOT, "middleware.ts"),
  ].filter(existsSync);

  const SECRET_PATTERNS: [string, RegExp][] = [
    ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
    ["AWS access key id", /AKIA[0-9A-Z]{16}/],
    ["OpenAI key", /sk-[A-Za-z0-9]{32,}/],
    ["JWT literal", /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/],
  ];

  it("no hardcoded secrets in the source tree", () => {
    const hits: string[] = [];
    for (const f of scanFiles) {
      const src = read(f);
      for (const [label, re] of SECRET_PATTERNS) if (re.test(src)) hits.push(`${label} in ${f}`);
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });

  it("secrets are never written to logs", () => {
    const hits: string[] = [];
    for (const f of scanFiles) {
      for (const line of read(f).split("\n")) {
        if (/console\.\w+\([^)]*\b(token|secret|password|apikey)\b/i.test(line)) hits.push(`${f}: ${line.trim()}`);
      }
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
