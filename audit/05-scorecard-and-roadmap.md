# 05 — Scorecard & Roadmap

---

## 1. Production-readiness scorecard

Scores out of 100. "End" reflects the merged branch **with the four SQL scripts applied** (they have been). Estimates are engineering judgement calibrated to a Stripe/Linear/Vercel bar, not a benchmark.

| Dimension | Start | End | What moved it |
|-----------|------:|----:|---------------|
| **Reliability** | 55 | **78** | error/404 boundaries, session-race fix, cache-driven revalidation, mobile stale-on-focus, atomic budget pause |
| **Security** | 78 | **91** | privesc closed, IDOR fix, timing-safe cron, fail-closed HMAC, role-seed, **RLS enabled & completed**, FK cascade |
| **Performance** | 45 | **68** | code-split (recharts out of entry), composite indexes, shared-fetch dedup, query cache |
| **UX** | 62 | **78** | cache removes tab-flicker, cold-start gate, consistent revalidation |
| **Mobile** | 58 | **76** | stale-on-focus fixed, full query parity (bundle-verified), 44pt targets, haptics |
| **Scalability** | 48 | **62** | indexes, shared fetch, atomic budget gate, RLS, cascade |
| **Maintainability** | 65 | **74** | one shared data pattern, 3 new regression tests, registry current |
| **Overall** | **≈58 (C+)** | **≈80–82 (B / B+)** | |

### Gate verdicts

| Gate | Start | End |
|------|-------|-----|
| Security review | ⚠️ Conditional | ✅ Likely pass — last concrete gap is Redis-backed rate limiting |
| App Store review | ⚠️ Conditional | ✅ Conditional pass — quality items remain (virtualization) but no rejection risk |
| Enterprise procurement | ❌ Fail | ⚠️ Near — deletion + tenant isolation resolved; SSO/audit-export maturity remains |
| Investor diligence | ⚠️ Flagged | ⚠️ Improved — the "no data layer" red flag is resolved |

---

## 2. The path to >90

>90 means crossing from "solid" to "best-in-class." It is no longer about fixing bugs — it's about eliminating whole categories of failure and adding the operational layer.

### Already done (the keystones)
- ✅ **Client data layer** (TanStack Query, both clients) — the single highest-leverage change; collapsed the stale-data, flicker, and duplicate-fetch classes at once.
- ✅ **Code-splitting** — recharts + ~75 screens out of the initial bundle.
- ✅ **RLS actually enabled** + completed; **deletion cascade**; **hot-path indexes**.

### Remaining to clear 90 (per dimension)
| Dimension | To reach 90 |
|-----------|-------------|
| Security | Redis/Upstash rate limiting keyed on `user.id`; secret-rotation story; dependency scanning + a pen-test pass. |
| Reliability | Mobile fetch-error states (discriminated results + Retry); a real error sink (Sentry) wired to the boundaries already added; retry/backoff on mutations. |
| Performance | Prove it with numbers — Lighthouse ≥90 in CI; isolate the 1 s workout-timer tick; zero duplicate requests in the network panel. |
| UX | One loading system (skeletons everywhere); consistent empty/error/success states. |
| Mobile | FlatList/FlashList virtualization; haptics on all CTAs; 60 fps scroll on a 500-session history; offline read cache. |
| Scalability | Server-side analytics aggregates (retire the `take: 50` client window); load-test evidence at 1k/10k/100k concurrent; atomic spend *reservation*. |
| Maintainability | Break up the 939-line `app-shell`; collapse classic/aurora to one themed tree; **add CI** (no lint config exists today) + extend tests to the API layer. |

### The "evidence" layer that distinguishes 90 from 83
- **CI/CD gates** (typecheck + test + lint + Lighthouse budget) — there is no lint configuration in the repo today.
- **Observability** — Sentry + structured logging + an uptime/SLO dashboard.
- **Load-test proof** at the concurrency tiers the brief named.

> **Honest framing:** 58 → ~67 was bug-fixing (done). ~67 → ~82 was the keystone refactors (done, verified). ~82 → >90 is operational maturity — CI, observability, and measured proof — which is an engineering-*practice* change more than a code diff.

---

## 3. Open backlog (tracked in `packages/core/src/capabilities.ts`)

These are recorded as `planned`/`blocked` so they survive between sessions (per the project rule that deferred work is never buried in prose).

**Planned (engineering):**
- `web-code-splitting` — *now substantially done; entry covers remaining per-screen polish*
- `mobile-fetch-error-states` — discriminated `{ ok }` results + Retry in `lib/api.ts`
- `mobile-list-virtualization` — FlatList for History/Coach/Calendar

**Blocked on running the DB scripts (now applied):**
- `schema-deletion-cascade` — `sql-all.sql` (or `sql-ondelete-cascade.sql`)
- `schema-tenant-isolation-rls` — `sql-all.sql` (or `rls-policies.sql` + `sql-rls-extend.sql`)

**Documented, not yet built:**
- Server-side analytics aggregates (retire `take: 50`)
- Stringly-typed enums → real Postgres enums
- `@updatedAt` on mutable tables for sync/conflict-resolution
- `/api/me` invite-claims moved out of the GET path

---

## 4. Deliberately *not* changed (and why)

A principal-level audit also documents what it chose to leave alone:

- **`landmarks.ts` "add volume while maintaining"** — flagged as a possible bug, but it's **explicitly tested as intended** product behaviour (encourage growth when only maintaining). Left unchanged.
- **`onDelete` in the app layer** — the admin-delete / `account/reset` routes already cascade thoroughly (with deliberate `EmailSuppression` retention for CAN-SPAM/GDPR). The DB cascade is a *backstop*, not a behaviour change.
- **The `key={screen}` entrance animation** — kept; the cache removed the flicker, so removing the key would have been a regression for no benefit.
- **`Connection` token column type** — already encrypted via `protectToken` (AES-GCM) when the key is set; RLS now denies direct anon access. A column-type change was unnecessary.

---

## 5. Verification ledger

| Surface | Tool | Result |
|---------|------|--------|
| `@hybrid/core` | `vitest` | 562 tests pass (+3 new regression tests) |
| `apps/web` | `tsc --noEmit` | clean |
| `apps/web` | `next build` | compiles; recharts confirmed out of the entry chunk; ~100 lazy chunks |
| `apps/mobile` | `tsc --noEmit` | clean |
| `apps/mobile` | `expo export --platform ios` | bundles clean (6.2 MB), run twice |
| `prisma/schema.prisma` | `prisma validate` / `generate` | valid; client generates |
| DB scripts | column cross-check vs schema + dry structural review | applied by the team |
