# 03 — Architecture: The Data Layer

The keystone of the engagement. This document explains the problem, the design, and the verification.

---

## 1. The problem

The web client had **no data layer**. Two coexisting patterns:

- **Identity in context:** `SessionProvider` held `session`/`entitlement`; persona was a module singleton.
- **Per-concern hooks:** each of `use-sessions`, `use-macrocycle`, `use-biometrics`, `use-signals`, `use-roster`, `use-flags` owned its own `fetch` + `useState` + mount-`useEffect`, instantiated at the top of `AppShell` and **prop-drilled** into screens.

Compounding it, navigation was an in-memory `useState("today")` and the active screen rendered inside `<div key={screen}>`. Changing the key **force-remounts the subtree** — so every tab switch unmounted the screen, remounted it, and re-ran its mount fetch from scratch.

### Why this produced every "stale data" symptom

| Symptom | Mechanism |
|---------|-----------|
| Blank/empty flash on tab switch | Remount → `state = []` → loading → data pops in |
| Refetch on every visit; waterfalls; duplicate requests | No cache; each mount re-fetches; multiple components fetch the same endpoint independently |
| "Refresh fixes it" after a mutation | A write in screen A couldn't invalidate screen B's separate `useState` copy |
| Oversized bundle | All ~80 screens + recharts statically imported into the one route |

---

## 2. The design

### 2.1 A shared cache (TanStack Query)

A single `QueryClient` per browser tab (created in state, **never** at module scope, so the cache is never shared across requests/users on the server):

```tsx
// apps/web/components/query-provider.tsx
const [client] = useState(() => new QueryClient({
  defaultOptions: { queries: {
    staleTime: 30_000,            // active data feels live without a refetch storm
    gcTime: 5 * 60_000,
    retry: 1,
    refetchOnWindowFocus: true,
  }},
}));
```

Each shared hook became a thin `useQuery` wrapper that **preserved its exact return shape**, so no call site changed:

```ts
// apps/web/lib/use-sessions.tsx
export const sessionsKey = ["sessions"] as const;
export function useSessions() {
  const q = useQuery({ queryKey: sessionsKey, queryFn: fetchSessions });
  return { sessions: q.data ?? [], loading: q.isPending || q.isFetching,
           error: ..., refresh: () => q.refetch() };
}
```

Migrated on web: `useSessions`, `useBiometrics`, `useSignals`, `useMacrocycle`, `useRoster`, `useExercises`, plus the `coach.tsx` (links + groups) and `connections.tsx` screen-level fetches.

### 2.2 Mutation → invalidation (not prop-drilling)

The old pattern threaded `onSaved`/`refreshBio` callbacks down through the shell. That's replaced by direct cache invalidation:

```ts
// apps/web/lib/use-invalidate.ts
export function useRevalidate() {
  const qc = useQueryClient();
  return {
    sessions: () => qc.invalidateQueries({ queryKey: sessionsKey }),
    recovery: () => { qc.invalidateQueries({ queryKey: signalsKey });
                      qc.invalidateQueries({ queryKey: biometricsKey }); },
    macrocycle: () => qc.invalidateQueries({ queryKey: macrocycleKey }),
  };
}
```

Now a check-in writes its signals and calls `revalidate.recovery()` — **every** consumer of those queries (Today's Performance State, the nutrition screen, anywhere) revalidates automatically, with zero prop wiring. The shell's `refreshBio` plumbing was deleted.

### 2.3 The remount is now harmless

The `<div key={screen}>` wrapper drives an intentional entrance animation, so it was **kept**. The insight: with a cache, even though a screen remounts on navigation, its data is served **synchronously from cache** within `staleTime` — so the flicker is gone without removing the animation. Removing the key would have been a regression (lost transition) for no benefit. Verified by reasoning + the production build.

---

## 3. Code-splitting

`app-shell` statically imported ~80 screen components (classic + aurora) plus recharts. Critically, the default Aurora landing (`aurora/today.tsx`) is recharts-free, but **classic `today.tsx` imports recharts**, and since every screen was a static import, recharts sat in the shared entry bundle for all users.

**Strategy:** keep the default Aurora landing + nav/banner chrome static (instant first paint); lazy-load everything else — including classic Today (which carries recharts) — via `next/dynamic` with `{ ssr: false }` (the shell renders `null` until client-side auth resolves, so SSR work is moot).

```ts
const Trends = dynamic(() => import("./trends"), { ssr: false });
const AthleteAnalytics = dynamic(
  () => import("./screens").then((m) => ({ default: m.AthleteAnalytics })),
  { ssr: false },
);
```

**Verified** with a real `next build`:
- Compiles clean.
- `rootMainFiles` (the always-loaded entry) contains **zero recharts** (was eager via `today.tsx` / `screens.tsx`).
- The build emits ~100 on-demand chunks instead of a near-monolithic bundle.

---

## 4. Web ↔ mobile parity

The project mandates feature/behaviour parity across clients. The same data-layer was brought to Expo, with two RN-specific concerns the web doesn't have:

```tsx
// apps/mobile/lib/query.tsx
// 1. React Query's window-focus detection is web-only → drive it from AppState.
AppState.addEventListener("change", (s) => focusManager.setFocused(s === "active"));

// 2. RN screens stay mounted in the navigator, so a back-navigation doesn't
//    remount → refetchOnMount won't fire. A per-screen focus refetch covers it.
export function useRefreshOnFocus(refetch) {
  useFocusEffect(useCallback(() => { /* skip first, then */ refetch(); }, [refetch]));
}
```

Migrated on mobile: the 12 sessions-only data screens (velocity/running/volume/calendar/trends/exercises, classic + aurora), **History** ×2 (archived-aware query key), **Home** ×2 (sessions + signals from cache; assignments/macro/invites stay home-local with their optimistic handlers), and **Nutrition/Check-in** ×2 (signals cache). The workout-save path invalidates `['sessions']`, and a check-in invalidates recovery — so the mobile dashboard revalidates exactly like web.

A parametrized `useSessionsQuery({ archived })` uses `['sessions']` vs `['sessions','archived']`; invalidating the `['sessions']` prefix revalidates both, so an archive toggle or a new workout refreshes either view.

**Verified** with `expo export --platform ios` (clean bundle, 6.2 MB, run twice).

---

## 5. What this fixed, concretely

- **Tab-switch flicker** — gone for every screen built on shared data (served from cache).
- **`useSessions`** — ~6 independent fetches collapsed to **1** deduped request.
- **Stale-after-mutation** — a check-in updates Today's readiness with no prop-drilling and no manual refresh, on both clients.
- **Initial bundle** — recharts + ~75 screens removed from the always-loaded path.
- **Mobile stale-on-focus** — closed via the cache + `useRefreshOnFocus`, restoring web↔mobile parity.

## 6. Incremental follow-ups (tracked, not blocking)

- Remaining low-traffic per-screen raw fetches can adopt the same pattern.
- The classic/aurora duplication still exists at the **view** layer (the data layer is now shared).
- Mobile list virtualization and fetch-error states are tracked in `capabilities.ts`.
