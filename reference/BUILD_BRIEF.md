# HYBRID — Build Brief & Sprint Plan

This is the spec for the HYBRID hybrid-athlete training app. The prototypes
(`HybridApp.jsx` = mobile, `HybridWeb.jsx` = web) are the source of truth for
UX and the engines. This monorepo turns them into a running, deployed product.

## Tech-stack decisions (do not re-litigate mid-build)

- **Monorepo**: pnpm workspace + Turborepo (Vercel-native).
- **Shared core** (`packages/core`): engines (fatigue, readiness, progression,
  periodization), TypeScript types, the API client, validation. Written ONCE,
  imported by both clients.
- **Web** (`apps/web`): Next.js (App Router, TypeScript, Tailwind) on Vercel.
- **Mobile** (`apps/mobile`): Expo / React Native (expo-router) — the App Store app.
- **Backend**: Next.js API routes (in `apps/web/app/api`). BOTH clients call it.
- **Database**: Postgres via Supabase (auth + DB + row-level security).
- **ORM**: Prisma. **Auth**: Supabase Auth (Apple + Google).
- **Charts**: Recharts (web), Victory Native / react-native-svg-charts (mobile).
- **AI coach**: server-side Anthropic calls from the backend, never from clients.

## Visual identity

- Near-black `#0c0d0c` (ink), acid-lime `#c4f035` (lime).
- Fonts: the previous face (display/body), the previous face Narrow (condensed), the previous mono.
- Full token set lives in `packages/core` so both clients share it.

## Sprint plan (parallel web + native, shared core)

- **Sprint 0** — Monorepo & dual deploy pipeline. Both clients render a branded
  screen; web deploys green. ← *this commit*
- **Sprint 1** — Backend, auth & data layer (Supabase + Prisma, Apple+Google auth).
- **Sprint 2** — Shared engines ported into `packages/core/engines`, unit-tested.
- **Sprint 3** — The logger (both clients), writing to the `Session` table.
- **Sprint 4** — Prescription + periodization wired to real logged data.
- **Sprint 5** — Plans + history from DB.
- **Sprint 6** — Analytics (athlete / coach / operator dashboards).
- **Sprint 7** — Wearables (HealthKit + WHOOP).
- **Sprint 8** — Coach layer (CoachLink consent, roster, notes, RLS).
- **Sprint 9** — App Store + instrumentation (EAS Build, TestFlight, retention).

## The one rule

One sprint at a time. Deploy green before moving on.

## Database schema (Sprint 1)

See section 3 of the kickoff doc: `User` (role CLIENT|COACH|ADMIN), `CoachLink`
(mutual-consent coach↔client, status PENDING|ACTIVE|ENDED), `CoachNote`
(with `private`), `Session`, `Macrocycle`, `Biometric`, `Plan`. RLS: a user
reads/writes own rows only; a coach reads a client's data only via an ACTIVE
CoachLink; admins see aggregates only.
