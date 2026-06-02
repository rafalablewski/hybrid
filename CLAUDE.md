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
fast-forward `main` to ship. Mobile ships via EAS Build → TestFlight (needs an
Apple Developer account + Expo token — not yet available).

## Environment limits (this sandbox)
- Network is allowlisted: npm + `api.expo.dev` reachable; **Supabase host + raw
  Postgres ports are blocked**. So the agent CANNOT run migrations or query the
  DB directly — hand the user SQL to run in the Supabase SQL Editor instead.

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
