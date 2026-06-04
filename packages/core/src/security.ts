/**
 * HYBRID security core — the single source of truth for:
 *   1. shared security PRIMITIVES (validators + the pure authorization rules the
 *      API enforces), so the logic is unit-tested once and reused, and
 *   2. the canonical SECURITY CONTROL REGISTRY surfaced in the admin /security
 *      tab. Each control has an honest status: `pass` (implemented AND covered
 *      by an automated test), `todo` (not done — shows red), or `manual` (done
 *      in code but depends on an out-of-repo step, e.g. applying RLS in
 *      Supabase). The test suite (security.test.ts + the web static scan)
 *      asserts that every `pass` control actually holds, so the registry can't
 *      drift into a comfortable lie.
 */

// ---------------------------------------------------------------------------
// Primitives — validation + authorization rules (pure, deterministic).
// ---------------------------------------------------------------------------

export const LANGUAGES = ["en", "pl", "de"] as const;
export type Language = (typeof LANGUAGES)[number];

export function isValidLanguage(v: unknown): v is Language {
  return typeof v === "string" && (LANGUAGES as readonly string[]).includes(v);
}

export const SECURITY_ROLES = ["CLIENT", "COACH", "ADMIN"] as const;
export type SecurityRole = (typeof SECURITY_ROLES)[number];

/** Coerce arbitrary input to a known role, or null. Never trusts the caller's
 *  casing or type — defends the role mutation path against junk/escalation. */
export function normalizeRole(v: unknown): SecurityRole | null {
  const s = String(v ?? "").toUpperCase();
  return (SECURITY_ROLES as readonly string[]).includes(s) ? (s as SecurityRole) : null;
}

/** Clamp untrusted numeric input into [min,max], falling back when unparseable.
 *  Used for pagination so a hostile `pageSize=1e9` can't exhaust the DB. */
export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  // An absent value (null/undefined/"") means "not provided" → use the default,
  // NOT 0. This matters because URLSearchParams.get returns null for a missing
  // param: clampPageSize(null) must be the default page size, not the minimum.
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

export const clampPage = (v: unknown): number => clampInt(v, 1, 10_000_000, 1);
export const clampPageSize = (v: unknown, def = 25, max = 100): number => clampInt(v, 5, max, def);

export type RoleChangeDecision =
  | { ok: true; nextRole: SecurityRole }
  | { ok: false; reason: string };

/** The authorization rule for changing a user's role. Pure so it can be tested
 *  exhaustively and reused. Blocks two lockout/escalation footguns:
 *   - an admin removing their OWN admin role, and
 *   - removing the LAST remaining admin (would orphan the platform). */
export function evaluateRoleChange(input: {
  currentRole: SecurityRole;
  requestedRole: unknown;
  targetIsActor: boolean;
  totalAdmins: number;
}): RoleChangeDecision {
  const next = normalizeRole(input.requestedRole);
  if (!next) return { ok: false, reason: "invalid role" };
  const demotingFromAdmin = input.currentRole === "ADMIN" && next !== "ADMIN";
  if (demotingFromAdmin) {
    if (input.targetIsActor) return { ok: false, reason: "you cannot remove your own admin role" };
    if (input.totalAdmins <= 1) return { ok: false, reason: "cannot demote the last remaining admin" };
  }
  return { ok: true, nextRole: next };
}

/** Best-effort scrub of obviously-sensitive keys from an object before it is
 *  logged or returned. Defense-in-depth — routes already select narrowly. */
const SENSITIVE_KEY = /(token|secret|password|apikey|api_key|authorization|cookie|refresh)/i;
export function redactSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v)) as unknown as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? "[redacted]" : redactSensitive(v);
    }
    return out as T;
  }
  return value;
}

// ---------------------------------------------------------------------------
// Rate limiting (pure, deterministic fixed-window) + body-size guard.
// ---------------------------------------------------------------------------

export interface RateState {
  count: number;
  resetAt: number; // epoch ms when the window rolls over
}

export interface RateResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSec: number;
}

/** Fixed-window rate limit. Pure: it mutates the passed-in store and takes an
 *  injectable `now`, so it's fully testable and storage-agnostic — back it with
 *  an in-process Map today, or a shared Redis/Upstash map for multi-instance. */
export function fixedWindow(
  store: Map<string, RateState>,
  key: string,
  opts: { limit: number; windowMs: number; now?: number },
): RateResult {
  const now = opts.now ?? Date.now();
  const cur = store.get(key);
  if (!cur || now >= cur.resetAt) {
    const resetAt = now + opts.windowMs;
    store.set(key, { count: 1, resetAt });
    return { allowed: true, limit: opts.limit, remaining: opts.limit - 1, resetAt, retryAfterSec: 0 };
  }
  cur.count += 1;
  const allowed = cur.count <= opts.limit;
  return {
    allowed,
    limit: opts.limit,
    remaining: Math.max(0, opts.limit - cur.count),
    resetAt: cur.resetAt,
    retryAfterSec: allowed ? 0 : Math.max(1, Math.ceil((cur.resetAt - now) / 1000)),
  };
}

/** Evict expired entries so an in-process store can't grow unbounded. Returns
 *  the number removed. Call opportunistically (e.g. 1% of requests). */
export function pruneRateStore(store: Map<string, RateState>, now: number = Date.now()): number {
  let removed = 0;
  for (const [k, v] of store) {
    if (now >= v.resetAt) {
      store.delete(k);
      removed++;
    }
  }
  return removed;
}

export const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export type CsrfDecision = { ok: true } | { ok: false; reason: string };

/** CSRF defense for cookie-authenticated requests. Pure + testable.
 *  Rationale: cookies are attached by the browser automatically, so a
 *  state-changing request from another origin is the CSRF threat. We require a
 *  same-origin Origin/Referer for unsafe methods. Bearer-token requests (mobile)
 *  are exempt — a token is never sent ambiently, so they can't be forged this
 *  way. Safe methods (GET/HEAD/OPTIONS) pass through. */
export function csrfCheck(input: {
  method: string;
  hasBearer: boolean;
  origin: string | null;
  referer: string | null;
  host: string | null;
}): CsrfDecision {
  if (!UNSAFE_METHODS.has(input.method.toUpperCase())) return { ok: true };
  if (input.hasBearer) return { ok: true };
  if (!input.host) return { ok: false, reason: "no host" };
  const source = input.origin ?? input.referer;
  if (!source) return { ok: false, reason: "missing origin" };
  let sourceHost: string;
  try {
    sourceHost = new URL(source).host;
  } catch {
    return { ok: false, reason: "malformed origin" };
  }
  return sourceHost === input.host ? { ok: true } : { ok: false, reason: "cross-origin" };
}

/** True when a request body is within the allowed byte size. A null/absent
 *  content-length is treated as unknown → allowed (the stream read still caps).*/
export function withinBodyLimit(contentLength: unknown, maxBytes: number): boolean {
  if (contentLength === null || contentLength === undefined || contentLength === "") return true;
  const n = typeof contentLength === "number" ? contentLength : Number(contentLength);
  if (!Number.isFinite(n)) return true;
  return n <= maxBytes;
}

// ---------------------------------------------------------------------------
// Security control registry.
// ---------------------------------------------------------------------------

export type ControlStatus = "pass" | "todo" | "manual";
export type ControlSeverity = "critical" | "high" | "medium" | "low";

export interface SecurityControl {
  id: string;
  category: string;
  severity: ControlSeverity;
  status: ControlStatus;
  title: string;
  detail: string;
  /** What proves a `pass` (test name / file), or what unblocks a todo/manual. */
  evidence?: string;
}

export const SECURITY_CONTROLS: SecurityControl[] = [
  // ---- Authentication ----
  { id: "authn-all-routes", category: "Authentication", severity: "critical", status: "pass", title: "Every API route authenticates", detail: "No /api route is reachable without resolving a real Supabase session; unauthenticated calls get 401. Enforced per-route via getOrCreateDbUser / requireAdmin.", evidence: "web static scan: every route.ts calls an auth helper" },
  { id: "authn-db-role", category: "Authentication", severity: "high", status: "pass", title: "Role sourced from the DB, not the client", detail: "A user's role is read from the User row server-side; auth-metadata role is only ever a creation-time seed. A client cannot self-assert ADMIN.", evidence: "server-auth.ts getOrCreateDbUser" },
  { id: "authn-dual-transport", category: "Authentication", severity: "medium", status: "pass", title: "Cookie + Bearer, both server-verified", detail: "Web sends the session cookie; mobile sends a Bearer access token. Both are verified by Supabase server-side before any row is touched.", evidence: "server-auth.ts" },
  { id: "authn-mfa", category: "Authentication", severity: "high", status: "manual", title: "Multi-factor authentication (TOTP)", detail: "TOTP 2FA is implemented end-to-end: enroll/verify/remove in account settings, and a sign-in step-up that prompts for a code when a verified factor exists (a no-op otherwise, so it can't lock anyone out). The decision logic (stepUpRequired, code validation) is unit-tested. Activation needs MFA enabled in the Supabase project (default for TOTP) and a quick in-browser verification of the challenge flow.", evidence: "core mfa.ts (tested) + components/account/mfa.tsx + login step-up; enable + verify in Supabase" },

  // ---- Authorization ----
  { id: "authz-admin-api", category: "Authorization", severity: "critical", status: "pass", title: "Admin APIs require the ADMIN role", detail: "Every /api/admin/* route starts with requireAdmin() and returns 403 for non-admins. The check is server-side, not UI-gated.", evidence: "web static scan: admin routes import requireAdmin" },
  { id: "authz-admin-page", category: "Authorization", severity: "critical", status: "pass", title: "The /admin surface is server-gated", detail: "app/admin/layout.tsx resolves the user and redirects any non-admin before admin UI or data is sent to the browser.", evidence: "app/admin/layout.tsx getAdmin()" },
  { id: "authz-relationship", category: "Authorization", severity: "high", status: "pass", title: "Coach access is by relationship, not label", detail: "A coach reads a client's data only through an ACTIVE CoachLink (mutual consent); the role label alone grants nothing.", evidence: "coach routes gate on CoachLink status" },
  { id: "authz-last-admin", category: "Authorization", severity: "high", status: "pass", title: "No self-demote / last-admin lockout", detail: "Role changes run through evaluateRoleChange: an admin can't drop their own admin role, and the final admin can't be demoted.", evidence: "security.test.ts evaluateRoleChange" },
  { id: "authz-csrf", category: "Authorization", severity: "critical", status: "pass", title: "CSRF protection on cookie auth", detail: "Cookie-authenticated state-changing requests (POST/PUT/PATCH/DELETE) must carry a same-origin Origin/Referer; cross-origin forgeries are rejected with 403 in middleware. Bearer-token (mobile) calls are exempt — they can't be ambiently forged.", evidence: "security.test.ts csrfCheck; middleware.ts enforces /api mutations" },

  // ---- Data protection / least privilege ----
  { id: "data-token-redaction", category: "Data protection", severity: "critical", status: "pass", title: "Wearable tokens never leave the server", detail: "Connection access/refresh tokens are never selected into an API response; clients see status + provider only.", evidence: "web static scan: no accessToken/refreshToken in responses" },
  { id: "data-admin-aggregates", category: "Data protection", severity: "high", status: "pass", title: "Admins see metadata, not private rows", detail: "Admin endpoints return aggregates, management metadata and activity COUNTS — never another user's raw training/check-in content.", evidence: "admin routes select counts/aggregates only" },
  { id: "data-rls", category: "Data protection", severity: "critical", status: "manual", title: "Row-level security in Postgres", detail: "Per-table RLS (own-rows + relationship policies) ships as reference/sql-*.sql and must be applied in Supabase so the DB enforces isolation even if the API is bypassed.", evidence: "Apply reference/sql-*.sql in the Supabase SQL Editor" },
  { id: "data-token-encryption", category: "Data protection", severity: "high", status: "manual", title: "Wearable tokens encrypted at rest", detail: "Stored OAuth access/refresh tokens are sealed with AES-256-GCM (per-record IV + auth tag) before they hit the DB and unsealed only to call the provider. Round-trip is unit-tested; it activates once TOKEN_ENCRYPTION_KEY is set (until then tokens are stored as-is, backward-compatibly).", evidence: "lib/crypto.ts (tested); set TOKEN_ENCRYPTION_KEY in the deploy env" },

  // ---- Audit & accountability ----
  { id: "audit-trail", category: "Audit & accountability", severity: "high", status: "pass", title: "Privileged actions are audited", detail: "Every admin mutation writes an AdminAudit row (actor, action, target, before/after, IP, timestamp), surfaced in the Audit log.", evidence: "lib/admin.ts audit() on mutations" },
  { id: "audit-support-reads", category: "Audit & accountability", severity: "medium", status: "pass", title: "Support lookups are logged", detail: "An admin opening an individual user's record writes a user.view audit entry, so 'support access' is accountable rather than silent — matching the stated privacy posture.", evidence: "GET /api/admin/users/[id] calls audit()" },
  { id: "audit-immutable", category: "Audit & accountability", severity: "medium", status: "manual", title: "Audit log is append-only + server-locked", detail: "AdminAudit has no UPDATE/DELETE code path and ships with RLS enabled and zero client policies (server-only). Requires the SQL to be applied.", evidence: "reference/sql-admin-audit.sql" },

  // ---- Input validation ----
  { id: "input-enum-validation", category: "Input validation", severity: "high", status: "pass", title: "Enums are validated, not trusted", detail: "Role and language inputs are normalized against an allow-list before any write; junk is rejected with 400.", evidence: "security.test.ts normalizeRole / isValidLanguage" },
  { id: "input-pagination-clamp", category: "Input validation", severity: "medium", status: "pass", title: "Pagination is clamped", detail: "page/pageSize are clamped to safe bounds so a hostile request can't force an unbounded query.", evidence: "security.test.ts clampPage / clampPageSize" },
  { id: "input-body-limits", category: "Input validation", severity: "medium", status: "pass", title: "Request body-size limits", detail: "Sensitive write routes reject oversized payloads (413) via a shared limit guard, so a giant body can't be used to exhaust memory. withinBodyLimit is unit-tested; schema validation per-route is an ongoing hardening.", evidence: "security.test.ts withinBodyLimit; lib/guard.ts readJsonLimited" },

  // ---- Transport & headers ----
  { id: "hdr-hsts", category: "Transport & headers", severity: "high", status: "pass", title: "HSTS forces HTTPS", detail: "Strict-Transport-Security is sent with a long max-age + includeSubDomains so browsers refuse plaintext.", evidence: "web static scan: next.config Strict-Transport-Security" },
  { id: "hdr-frame", category: "Transport & headers", severity: "high", status: "pass", title: "Clickjacking blocked", detail: "X-Frame-Options: DENY and frame-ancestors 'none' stop the app being framed.", evidence: "web static scan: next.config X-Frame-Options" },
  { id: "hdr-nosniff", category: "Transport & headers", severity: "medium", status: "pass", title: "MIME sniffing disabled", detail: "X-Content-Type-Options: nosniff prevents content-type confusion attacks.", evidence: "web static scan: next.config nosniff" },
  { id: "hdr-referrer", category: "Transport & headers", severity: "low", status: "pass", title: "Referrer leakage minimized", detail: "Referrer-Policy: strict-origin-when-cross-origin keeps paths out of cross-site referers.", evidence: "web static scan: next.config Referrer-Policy" },
  { id: "hdr-permissions", category: "Transport & headers", severity: "low", status: "pass", title: "Powerful features locked down", detail: "Permissions-Policy disables camera/microphone/geolocation for the web origin by default.", evidence: "web static scan: next.config Permissions-Policy" },
  { id: "hdr-csp-strict-script", category: "Transport & headers", severity: "high", status: "pass", title: "Strict nonce-based CSP", detail: "A per-request nonce (middleware) drives a strict script-src 'self' 'nonce-…' 'strict-dynamic' — the strongest XSS defense: an injected inline script without the nonce can't execute. Verified against the running production server (every Next script, incl. the inline RSC stream, carries the matching nonce; pages render; chunks load via strict-dynamic). Pages render dynamically so the nonce can be injected. object-src/base-uri/form-action/frame-ancestors are locked and https is forced; style-src keeps 'unsafe-inline' (the UI uses inline styles) and fonts/Supabase are allow-listed.", evidence: "middleware.ts buildCsp + force-dynamic; verified nonce match on the running server" },

  // ---- Secrets ----
  { id: "secrets-no-hardcode", category: "Secrets", severity: "critical", status: "pass", title: "No secrets in the source tree", detail: "No private keys / service tokens are committed; secret-looking literals are caught by a scan.", evidence: "web static scan: no hardcoded secret patterns" },
  { id: "secrets-server-only", category: "Secrets", severity: "high", status: "pass", title: "Service credentials are server-only", detail: "Only the public anon/publishable key reaches the browser; the service-role DB connection lives in server routes.", evidence: "supabase clients use anon key; Prisma server-only" },
  { id: "secrets-not-logged", category: "Secrets", severity: "high", status: "pass", title: "Secrets are never logged", detail: "No token/secret/password value is written to logs; the audit logger records actions, not credentials.", evidence: "web static scan: no console logging of secrets" },

  // ---- Privacy ----
  { id: "privacy-no-impersonation", category: "Privacy", severity: "high", status: "pass", title: "No admin impersonation", detail: "Admins cannot assume a user's identity / log in as them; there is deliberately no such code path.", evidence: "no impersonation route exists" },
  { id: "privacy-self-erasure", category: "Privacy", severity: "medium", status: "pass", title: "User-initiated data erasure", detail: "A user can wipe all their data (keeping the login) via an authenticated, confirm-gated reset.", evidence: "/api/account/reset" },

  // ---- Supply chain & process ----
  { id: "ci-frozen-lockfile", category: "Supply chain", severity: "medium", status: "pass", title: "Reproducible installs in CI", detail: "CI installs with a frozen lockfile so a tampered/loose dependency tree fails the build.", evidence: ".github/workflows/ci.yml --frozen-lockfile" },
  { id: "ci-security-tests", category: "Supply chain", severity: "high", status: "pass", title: "Security tests run in CI", detail: "This control suite (logic + static scans) runs on every PR/push, so a regression that weakens a control turns CI red.", evidence: "security.test.ts + web security scan in CI" },
  { id: "deps-vuln-scan", category: "Supply chain", severity: "medium", status: "pass", title: "Automated dependency CVE scanning", detail: "Dependabot opens weekly update PRs for npm + GitHub Actions, and CI runs a dependency audit that fails the build on a critical advisory.", evidence: ".github/dependabot.yml + the audit step in ci.yml" },
  { id: "disclosure-policy", category: "Supply chain", severity: "low", status: "pass", title: "Vulnerability disclosure contact", detail: "A machine-readable /.well-known/security.txt (RFC 9116) publishes a security contact so researchers can report issues responsibly.", evidence: "public/.well-known/security.txt" },

  // ---- Abuse / availability ----
  { id: "rate-limiting", category: "Abuse & availability", severity: "high", status: "pass", title: "Per-IP / per-route rate limiting", detail: "Sensitive + expensive endpoints (admin mutations, the AI coach) are rate-limited per client IP with a tested fixed-window limiter that returns 429 + Retry-After. In-process today; the limiter is storage-agnostic so a shared Redis/Upstash store drops in for multi-instance enforcement.", evidence: "security.test.ts fixedWindow; lib/guard.ts rateLimit applied to ai-coach + admin user mutation" },
];

export interface SecurityPosture {
  total: number;
  pass: number;
  todo: number;
  manual: number;
  criticalOpen: number;
  score: number; // 0..100, share of controls passing
}

export function securityPosture(controls: SecurityControl[] = SECURITY_CONTROLS): SecurityPosture {
  const total = controls.length;
  const pass = controls.filter((c) => c.status === "pass").length;
  const todo = controls.filter((c) => c.status === "todo").length;
  const manual = controls.filter((c) => c.status === "manual").length;
  const criticalOpen = controls.filter((c) => c.severity === "critical" && c.status !== "pass").length;
  return { total, pass, todo, manual, criticalOpen, score: total ? Math.round((pass / total) * 100) : 0 };
}
