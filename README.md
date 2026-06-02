# HYBRID

Strength & conditioning for hybrid athletes — web + native, one shared core.

A monorepo: the expensive logic (engines, types, API client) is written **once**
in `packages/core` and consumed by both a Next.js web app and an Expo native app.

```
hybrid/
├─ packages/
│  └─ core/        # @hybrid/core — shared TS: brand tokens (+ engines/types later)
├─ apps/
│  ├─ web/         # @hybrid/web — Next.js (App Router, TS, Tailwind v4) → Vercel
│  └─ mobile/      # @hybrid/mobile — Expo / React Native (expo-router) → App Store
├─ reference/      # the prototypes + build brief (the spec)
├─ turbo.json      # Turborepo task graph
└─ pnpm-workspace.yaml
```

## Prerequisites

- Node ≥ 20, [pnpm](https://pnpm.io) 10+
- For mobile: the [Expo Go](https://expo.dev/go) app or an iOS/Android simulator

## Setup

```bash
pnpm install
```

## Run

```bash
pnpm web       # web app at http://localhost:3000
pnpm mobile    # Expo dev server (press i for iOS simulator, a for Android)
```

Or everything at once: `pnpm dev`.

## Verify

```bash
pnpm typecheck   # all packages
pnpm build       # builds the web app (what Vercel runs)
```

## Sprint status

- ✅ **Sprint 0** — Monorepo, dual clients, shared brand tokens, branded screens.
- ⬜ Sprint 1 onward — see `reference/BUILD_BRIEF.md`.

The shared identity lives in `packages/core/src/brand.ts`; both clients import it,
so the look stays in lockstep.
