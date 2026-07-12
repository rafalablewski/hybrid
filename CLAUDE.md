# HYBRID — agent guide

Hybrid-athlete training app. Monorepo: one shared core, a Next.js web app, an
Expo mobile app, one backend, one Supabase/Postgres database.

## Structure
- `packages/core` — shared TS: brand tokens, engines (fatigue/readiness/
  progression/periodization/prescription), plan library, sport engine, session
  helpers, **and the capabilities registry**. Imported by BOTH clients.
- `apps/web` — Next.js (App Router, Tailwind v4) → Vercel. Also hosts the
  backend (`app/api/*`) that BOTH clients call.
- `apps/mobile` — Expo / React Native (expo-router) → App Store. Calls the same
  `/api` on Vercel with a Supabase Bearer token.
- `prisma/schema.prisma` — the data model (Supabase Postgres).
- `reference/` — the prototypes + build brief (the spec).

## Commands
- `pnpm install`
- `pnpm --filter @hybrid/core test` — engine/unit tests (vitest)
- `pnpm --filter @hybrid/web typecheck` / `build`
- `pnpm --filter @hybrid/mobile typecheck`
- iOS bundle check (no simulator needed): `cd apps/mobile && npx expo export --platform ios --output-dir /tmp/x`

## Deploy
`main` auto-deploys `apps/web` to Vercel. Work on the feature branch, then
fast-forward `main` to ship.

Mobile ships via **GitHub Actions → TestFlight** — the
`.github/workflows/mobile-release.yml` workflow. It runs on a GitHub cloud Mac:
`expo prebuild` is local codegen only (**no Expo/EAS account, service, or
token**), `codemagic-cli-tools` (the open-source Apple-signing helper, *not* the
codemagic.io service) creates/reuses the Apple Distribution cert + provisioning
profile from an App Store Connect API key, then it builds the IPA and uploads to
TestFlight (internal testing — available immediately, no beta review). Build
numbers auto-increment (seconds since 2024-01-01). Free + unlimited (public
repo, no EAS quota). **Trigger:** GitHub → Actions → "Mobile — build &
TestFlight" → Run workflow, or push a `mobile-v*` tag. **Required repo secrets**
(documented in the workflow header): `APPLE_ASC_API_KEY_P8`, `APPLE_ASC_KEY_ID`,
`APPLE_ASC_ISSUER_ID`, `APPLE_CERT_PRIVATE_KEY`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
JS-only changes can instead ship over-the-air via EAS Update (`eas-update`).

## Environment limits (this sandbox)
- Network is allowlisted: npm + `api.expo.dev` reachable; **Supabase host + raw
  Postgres ports are blocked**. So the agent CANNOT run migrations or query the
  DB directly — hand the user SQL to run in the Supabase SQL Editor instead.

## RULE: web ↔ mobile parity (always)
This is ONE product on two clients. Whatever ships for **web must also ship for
mobile**, and whatever ships for **mobile must also ship for web** — features,
screens, visual treatments (e.g. Liquid Glass), nav, and behaviour. Put shared
logic in `packages/core` so both clients consume the same source of truth.

When you add or change something on one client, implement the equivalent on the
other in the SAME change. If you genuinely can't reach parity in that change
(e.g. a native-only constraint), record the gap explicitly in `capabilities.ts`
(as `planned`/`blocked` with `blockedBy`) so the missing side is never lost.

## RULE: keep the Capabilities registry current (always)
`packages/core/src/capabilities.ts` is the single source of truth for **every**
app capability. It is surfaced in the web admin **Capabilities** screen
(`apps/web/components/capabilities.tsx`, admin-only).

Each capability has a `status`:
- `shipped` — built and working.
- `blocked` — implemented (code is done) but cannot proceed because of missing
  data/access/credentials. Record `blockedBy` (what's needed to unblock).
- `planned` — not built yet.

**Whenever you ship, block, or plan a feature, update `capabilities.ts` in the
same change.** This list must always reflect reality. New blocked items (e.g.
"needs an API key", "needs the Apple Developer account") go here so nothing
implemented-but-stuck is forgotten.

## RULE: plan reps are a SINGLE number, never a range (always)
When authoring plan programs (`packages/core/src/plan-programs.ts`), a rep
prescription must be ONE number — never a range. Collapse any source range to
the **top** of the range: `15-20` → `20`, `10-12` → `12`, `8-10` → `10`. This
holds for every discipline's schemes and reps (write `3 × 20`, not
`3 × 15-20`). Per-side / time notations stay as-is (`10/leg`, `30 s`).

## RULE: kettlebell exercise names use the `KB` prefix (always)
In plan exercise names, abbreviate "Kettlebell" to **`KB`** (`KB Swing`, not
`Kettlebell Swing`; `Seesaw KB Press`, not `Seesaw Kettlebell Press`) so the
same lift never appears under two spellings. This is for exercise NAMES only —
plan titles, goal names, prose and source credits keep the full word
("12-Week Kettlebell", the Kettlebell goal).

## RULE: never use `·` (middle dot) as a separator (always)
The middot reads as AI slop. Do NOT join inline items with `·` (nor a `•`
bullet or a `|` pipe used as filler) in any UI copy or i18n string, on either
client. Replace it by context:
- **In components** (JSX / rendered nodes): prefer real layout — flex/grid gaps,
  distinct type weight or colour, or values on their own line. Where a string
  separator is unavoidable (e.g. a `.join(...)` meta line, since HTML collapses
  runs of spaces), use a **spaced en dash** `" – "`.
- **In flat strings** (i18n copy that is one value): reword, use a comma, or a
  spaced en/em dash (`–`/`—`) — never a middot.
A standalone `·` used as content (e.g. an empty-avatar placeholder glyph) is not
a separator — leave those.
