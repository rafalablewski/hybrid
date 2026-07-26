# 07 — Product, QA, UX & Performance Audit (2026-07)

**Branch:** `claude/fitness-app-audit-wotwti`
**Scope:** end-to-end product experience across both clients — onboarding, Today/home, workout logger & timers, progress/analytics, nutrition, social, settings, paywall, offline behaviour, notifications, visuals/typography/CSS, accessibility, and performance.
**Method:** five parallel specialist passes (bugs/functional, consistency, visual/CSS, performance, UX/a11y/product) over the full codebase, followed by an adversarial verification pass — every headline finding below was re-checked against the actual code, and claims that did not survive verification were discarded. Performance numbers are **measured** (production `next build`, gzip of emitted chunks; `expo export --platform ios` for the mobile bundle). Baseline: `@hybrid/core` 1101/1101 tests green, both typechecks clean.
**Relationship to prior audits:** builds on `audit/01–06` (security/data-integrity remediation, iOS readiness). Fixed items from those engagements were spot-verified and are not re-reported; where a prior fix regressed or was only partially adopted, that is called out explicitly.

---

## 1. Executive summary

**Overall health: 7 / 10.** The foundations are unusually strong for this stage — a shared engine core with 1,101 passing tests, mechanical parity/style guards in CI, genuine dual-theme design tokens with contrast unit tests, deep accessibility infrastructure, and "never lose a workout" offline engineering that survived every adversarial check thrown at it. What keeps the score at 7 is a small set of high-severity correctness gaps in exactly the places a fitness app cannot afford them (PR detection, history integrity, the interval timer), a paywall promising a trial the billing stack cannot deliver, and a first-paint JS budget (~580 KB gz web, 9.06 MB Hermes bundle mobile) that undercuts the app's otherwise premium feel.

**Top 5 priority issues:**

1. **The 50-session history cap silently corrupts PRs and lifetime stats** — `/api/sessions` returns `take: 50` with no pagination; both clients treat it as complete history, so after ~3 months of training the app awards false PRs and truncates "lifetime" tonnage. (§2, BUG-1)
2. **One malformed workout row bricks a user's entire history forever** — `POST /api/sessions` stores `blocks` unvalidated; `migrateBlocks` then throws on every subsequent `GET`, which 500s the session list permanently on both clients with no recovery path. (§2, BUG-2)
3. **The interval timer is wrong in the exact scenario it exists for** — both clients count `setInterval` ticks instead of anchoring to wall clock, so backgrounding/locking the phone freezes a HIIT session mid-round; the mobile screen also never takes the keep-awake lock the workout logger takes. (§2, BUG-4)
4. **Monetization trust gap** — the paywall promises "7-day free trial – cancel anytime" while Stripe is unconfigured and the IAP intro offer is unverified; web's paywall also drifts from the shared benefits list and hardcodes `$9.99`. Combined with mobile onboarding silently losing answers on a flaky connection, the first-session trust surface has real holes. (§2, BUG-6/7)
5. **First-paint JS is far heavier than the architecture intends** — `@hybrid/core` ships whole (178 KB gz) to every page including `/login` and an 856 KB edge middleware; an eager import in `today.tsx` defeats the shell's own code-splitting and drags recharts (~155 KB gz) into every app open; the workout player re-renders its full tree every second. (§6)

---

## 2. Critical & High severity findings

No finding met the bar for *Critical* (crash-on-launch, data loss in the primary save path, security regression). The following are High.

### BUG-1 (High) — 50-session cap: false PRs, truncated lifetime stats, unreachable archives
- **Where:** `apps/web/app/api/sessions/route.ts:22` (`take: 50`, no cursor/param); consumed as complete history by `apps/web/lib/use-sessions.tsx` and `apps/mobile/lib/api.ts:44-49`; PR detection at `packages/core/src/engines/records.ts:84-141` and `apps/mobile/app/workout.tsx:430-434, 875-876`.
- **Repro:** athlete with 60 sessions benched 110 kg in session #5; today they bench 100 kg. The client only sees sessions #11–60, so `topLoadMap(prior)` has no 110 kg entry → false "+PR" celebration. Same cap truncates `totalVolume` ("lifetime tonnage"), `lifetimePrCount`, `e1rmSeries` trend charts, and makes older archived workouts unreachable (reads as data loss).
- **Impact:** the app's core motivational mechanic (PRs) becomes untrustworthy for exactly the retained, paying users who train consistently.
- **Fix:** cursor pagination on `(startedAt, id)` + clients page in full history for PR/lifetime computations — or compute PR baselines server-side over the whole table (better long-term; see §8 systemic pattern S1).

### BUG-2 (High) — Unvalidated `blocks` on write → permanent 500 on every history read
- **Where:** `apps/web/app/api/sessions/route.ts:69` stores `(b.blocks ?? []) as object` with no shape validation; every `GET` then runs `migrateBlocks → canonicalizeBlockNames → canonicalExerciseName(b.name).trim()` (`route.ts:30-31`, `engines/session.ts:687-696`, `engines/movements.ts:280-289`).
- **Repro:** an authenticated client POSTs `{ title: "x", blocks: [null] }` (or a block with no `name`) → 201. Every subsequent `GET /api/sessions` throws `TypeError` → 500 on both clients, forever. Mobile swallows the error to `[]`, so all workouts appear vanished; no UI path can delete the poison row because the list never loads.
- **Related:** `b.startedAt` goes straight into `new Date(...)` (`route.ts:66`; same in `anon-sessions/route.ts:42`) — garbage input produces an unhandled Prisma throw → 500 instead of 400.
- **Fix:** validate `blocks` server-side on write (array of objects, string `name`, known `kind`), and make `migrateBlocks`/`canonicalExerciseName` skip non-conforming entries so one bad historical row can never take down the read path.

### BUG-3 (High) — Session save is not idempotent → duplicate workouts from the offline-sync path
- **Where:** `apps/mobile/app/workout.tsx:851-856` (failed save → `saveGuestSession` → re-posted by `flushGuestSessions`, `apps/mobile/lib/guest.ts:84-97`); `createSession` treats a 15 s timeout as failure (`apps/mobile/lib/fetch.ts`); `POST /api/sessions` unconditionally `create`s; no client id in the payload.
- **Repro:** flaky gym Wi-Fi — the POST reaches Vercel and commits, but the response exceeds 15 s → client aborts → workout enters the offline queue → next app foreground flushes it → the same workout exists twice, double-counting volume and streaks and potentially minting a rep-PR against itself. *Verified first-hand: this is not user-retry-dependent; the well-intentioned offline stash makes the duplicate automatic.*
- **Fix:** client-generated UUID in `NewSession` + a unique `(userId, clientId)` column; server upserts so retries are no-ops.

### BUG-4 (High) — Interval timer counts ticks, not wall clock; no keep-awake; both clients
- **Where:** `apps/mobile/app/interval-timer.tsx:46-60` and `apps/web/components/interval-timer.tsx:38-50` — `setElapsed(e => e + 1)` inside `setInterval(1000)`. *Verified first-hand on both clients.* Contrast with the workout stopwatch, which anchors to `Date.now() - startedAt` and is immune (`apps/web/lib/use-workout-timer.ts:66`, `apps/mobile/app/workout.tsx:321-334`).
- **Repro:** start 8×40/20, pocket the phone during a work interval → iOS suspends JS timers → the timer freezes; every phase boundary and "done" arrive late by the backgrounded duration. The mobile screen also takes no keep-awake lock (the logger does, `workout.tsx:362-368`), so default screen-dim alone breaks it. Web background tabs throttle to the same effect; no `visibilitychange` resync.
- **Fix:** derive elapsed from a wall-clock anchor (pause by shifting the anchor — the logger's exact idiom), add keep-awake + AppState/visibility resync, and schedule local notifications for phase ends.

### BUG-5 (High) — Query cache survives logout; keys are not user-scoped
- **Where:** `apps/web/lib/session.tsx:28-56` — `clearClientState()` wipes persona, `hybrid.*` localStorage and `sb-*` cookies, but never calls `queryClient.clear()`; all query keys are static (`sessionsKey`, `qk.sessions` — `apps/web/lib/use-sessions.tsx:33`, `apps/mobile/lib/queries.ts:25`). *Verified first-hand.*
- **Repro:** logout → login as a different account in the same tab/app → cached queries serve user A's history/biometrics to user B instantly while refetch is in flight.
- **Impact:** cross-account data flash on shared devices — the exact "logout state retention" class the enterprise audit closed for module singletons, reintroduced by the newer query-cache layer.
- **Fix:** `queryClient.clear()` inside `clearClientState()` (both clients), and/or fold the user id into query keys.

### BUG-6 (High) — Mobile onboarding submit failure is silent and unrecoverable
- **Where:** `apps/mobile/components/aurora/onboarding.tsx:32-40` ignores `finishOnboarding`'s `ok`; `apps/mobile/lib/use-onboarding.ts:64-66` sets local `hybrid.onboarded = "1"` even on failure. The web twin does it correctly (surfaces errors with `role="alert"`, stays on the step).
- **Impact:** on a flaky connection the user's answers and plan enrollment are lost server-side, they believe they're enrolled, and the local flag prevents ever re-prompting on that device.
- **Fix:** mirror web — check `ok`, show error + retry, set the flag only on success.

### BUG-7 (High) — Paywall promises a free trial billing cannot deliver
- **Where:** `packages/core/src/i18n-web/account.ts:453-454` ("Start free trial", "7-day free trial – cancel anytime") rendered on both paywalls (`aurora/upgrade.tsx`). Stripe is `blocked` (`capabilities.ts`), so the web CTA dead-ends at "billing isn't configured"; whether the IAP product carries a 7-day introductory offer lives in App Store Connect and is unverified.
- **Impact:** a material misrepresentation at the moment of purchase if the intro offer isn't configured — an App Store review and consumer-trust risk.
- **Fix:** gate trial copy on the actual offer (StoreKit exposes introductory offers; Stripe price metadata can carry it), per the existing `upgrade-pricing` capability's intent. Also fix the web paywall's drift: it hardcodes 4 benefits vs `full-benefits.ts`'s 5 (missing "Unlimited saved routines") and a hardcoded `$9.99` vs mobile's live StoreKit price (`apps/web/components/aurora/upgrade.tsx:15-20, 76`).

### PERF-cluster (High) — see §6: core-barrel shipping, eager recharts on Today, per-second full-tree re-render in the workout player.

---

## 3. Bugs & functional issues (Medium / Low)

| # | Sev | Finding | Evidence | Fix direction |
|---|-----|---------|----------|---------------|
| M1 | Med | **lb-mode load input rounds while typing** — controlled value round-trips through `roundDisp` (lb → `Math.round`), so typing `227.5` snaps to `228` and the decimal point is swallowed mid-keystroke; stored kg differs from the actual lift. | `packages/core/src/units.ts:14`; `apps/mobile/app/workout.tsx:1201-1202` | Local edit-buffer string while focused, convert on blur; round lb display to 0.5. |
| M2 | Med | **Prefilled-but-unbanked sets save as performed work** — template/plan/AI starts prefill reps+load for every planned set; `buildBlocks` (mobile) and web `save()` keep every non-empty set regardless of `done`. Bail after 2 of 5×5 → 2,500 kg logged instead of 1,000 kg; phantom sets can mint PRs. | `apps/mobile/app/workout.tsx:800-811`; `apps/web/components/aurora/logger.tsx:366-372` | On finish, drop (or confirm-drop) prefilled-not-banked sets when any set was banked. |
| M3 | Med | **Check-in dedupe uses UTC day, product semantics are local day** — west of UTC, an evening quick check-in + later guided refinement crosses a UTC boundary → the promised same-day update path returns `429 cooldown`, or two rows exist for one local day. | `apps/web/app/api/checkins/route.ts` (`Date.UTC` window) vs local matching in `aurora/today.tsx:273,294` | Dedupe on a client-supplied `localDayKey`. |
| M4 | Med | **Paused rest still fires "Rest's up" at the original time** — the scheduled OS notification isn't cancelled on pause; user gets a buzz mid-pause and a second one after resume. | `apps/mobile/app/workout.tsx:386-414` vs `togglePause` at `:753-763` | Include `paused` in the effect deps; cancel on pause, reschedule from shifted `restSince` on resume. |
| M5 | Med | **Web has no offline-finish parity** — a failed web save keeps state (good) but closing the tab leaves the workout only as a draft; no queued-write equivalent of mobile's guest stash. Not recorded in `capabilities.ts`. | `apps/web/components/aurora/logger.tsx:433-436` | Stash-and-flush twin, or record the gap as `planned` per the parity rule. |
| M6 | Med | **Rest-done alert may not fire on Android release builds** — local-notification code ships while the `expo-notifications` config plugin was removed from `app.json`. | `apps/mobile/app/workout.tsx:386` vs `app.json` | Verify on next TestFlight/Android build; re-add the plugin when push credentials land. |
| L1 | Low | Interval-timer pause discards the in-flight fraction of a second; folded into the BUG-4 rewrite. | both `interval-timer.tsx` | — |
| L2 | Low | `sessionBuckets` week/month windows are DST-naive — duplicate/skipped bucket twice a year; "month" is a fixed 35 days. | `packages/core/src/stats.ts:55-74` | Step via `addLocalDays`. |
| L3 | Low | Run tracker: sub-30 s efforts save `minutes: 0`, and `startedAt = completedAt = now` so timestamp-derived duration is always 0. | `apps/mobile/components/aurora/run-track.tsx:49-60` | `Math.max(1, round)`; `startedAt = now - elapsed`. |
| L4 | Low | `PATCH /api/sessions/[id]` reads the body with bare `request.json()` — no size cap or rate limit, unlike the POST. | `[id]/route.ts:21` | Reuse `readJsonLimited` + `rateLimit`. |
| L5 | Low | Notification permission requested at logger mount with no priming; denial silently disables the rest alert with no indication in settings. | `apps/mobile/app/workout.tsx:376-380` | Ask on toggle-enable; reflect denied state in logger-settings. |

**Claims tested and refuted (kept here so they aren't re-reported by future audits):** the workout stopwatch does *not* drift (wall-clock anchored, both clients); the mobile draft does *not* lose sets on app kill (500 ms debounced persistence); e1RM has a *single* source (Epley in `engines/session.ts:271`, no client-side second formula); tonnage does *not* count seconds/metres as reps (time/distance measures are excluded by design); streaks/calendars are *local*-day keyed (`day-key.ts`, documented and tested); the rest-timer notification is correctly cancelled on stop/unmount (the pause case, M4, is the only gap); logout does force-clear auth state even offline.

---

## 4. Inconsistencies

### 4.1 Project-rule compliance (CLAUDE.md "always" rules)
- **Clean, and mechanically enforced:** single-number reps (guarded by `plans.test.ts:37-45`), `KB` prefix (`exercise-db.test.ts:31-32`), no decorative header dots, no middots in app UI (all meta joins use the sanctioned `" – "`).
- **Med — full-bleed rule misses on three mobile rails:** nutrition "Recent" re-log rail has the bleed on web but not mobile (`apps/mobile/components/aurora/nutrition.tsx:671` vs web `:772`); competition events rail (`competition.tsx:76`) and team-monitor/org chip rails (`team-monitor.tsx:108,118,128`, `org.tsx:126`) sit on screens with no bleed — and web renders the same content as wrapping rows, a simultaneous presentation-parity drift. Pick one treatment per rail type and apply on both clients.
- **Low — middot stragglers in operator surfaces:** Slack/cron/cost-report strings use `·`/`•` (`apps/web/lib/slack.ts:37`, `api/cron/agent-monthly/route.ts:40-42`, `packages/core/src/agents.ts:172,176`); admin exercise cues render `• `-prefixed lines on both clients; two settings screens build a `·`-joined string only to split it again, contradicting the codebase's own documented convention (`social.ts:135`).

### 4.2 Capabilities-registry drift (the registry is the product's source of truth)
- **Med — statuses under-report shipped work:** `web-data-layer` and `web-code-splitting` are `planned`, but TanStack Query (provider + 8 web / 2 mobile consumers) and ~40 `next/dynamic` screens are in the tree. Partial adoption is real (see §6 P1-4), but "planned" misstates it — split each into what shipped vs what remains.
- **Med — a `shipped` claim is now false:** `mobile-admin` claims "ALL 19 sections … mirrors the web nav one-for-one", but web has since grown to 21 sections (`email`, `onboarding`) absent from `apps/mobile/components/admin/sections.ts`.
- **Low — three `shipped` entries keep to-do-phrased details** (`web-logger-prefs`, `mobile-calendar-layers`, `mobile-coach-console-parity`) — the admin Capabilities screen describes shipped items as gaps.

### 4.3 Parity & localization drift
- **High — mobile Statistics screen is entirely unlocalized:** zero `t()` calls — `"Your\nStatistics"`, `"Weekly volume"`, `"Sessions"`, `"Active days"`, empty-state prose all hardcoded English (`apps/mobile/app/statistics.tsx:59-109`), while the web twin is fully localized via `w.analyze.stats.*`. PL/DE users get an English screen on mobile only; not recorded in `parity-followups`.
- **Med — web `aurora/profile.tsx` contains literal NUL bytes** (`join("\x00")` written as raw 0x00 at offsets ~33272/33294), making the 758-line file *binary to grep/ripgrep* — it silently drops out of every audit, codemod and sweep (it escaped two of this audit's own passes). The mobile twin uses `join(" ")` — so the clients also compare reorder state differently. Replace with `" "` escapes (or a structured compare) and align.
- **Low — dead `Stories` component on both clients** (no importers; its removal from Today is documented, the files were left behind).
- **Low — web onboarding has no Skip; mobile Skip re-nags every cold start** (nothing is persisted on skip; the entry gate routes straight back into the wizard — `apps/mobile/app/index.tsx:25-28`). Mid-onboarding answers aren't persisted on either client.

### 4.4 Data-display inconsistencies
- **Med — history dates differ across clients:** web `{month, day, year: "2-digit"}` ("Jul 26, 26") vs mobile `{month, day}` ("Jul 26") for the same list.
- **Med — mixed date-locale strategy:** `"en-US"` hardcoded in history-views/calendar/session-detail/analytics/forceplate; `undefined` (device locale) in endurance/exercise-page/today/home/nutrition/plans — and *neither* passes the app's active language, so PL/DE dates render arbitrarily. One shared date formatter in `packages/core/src/format.ts` taking `Lang` fixes the class.
- **Med — weekly volume ignores the units preference on Statistics only:** hardcoded `` `${Math.round(v)} kg` `` on both clients while History/Profile/Logger use `fmtTonnage(volume, units)`; an lb user sees kg on one screen.
- **Low —** velocity est-1RM hardcodes `" kg"` + `toFixed(1)` on both clients; duplicate i18n keys (`history.blocks` vs `w.analyze.hist.blocks`) mixed within one expression on mobile; hardcoded `"Workout"` fallback title unlocalized; calendar marker dots 6×6 web vs 5×5 mobile.

---

## 5. Visual / Typography / Spacing / CSS

### Typography
- **High — web fonts load via render-blocking Google Fonts CSS `@import`** (`apps/web/app/globals.css:1`), not `next/font`: two chained render-blocking third-party requests, guaranteed FOUT + CLS on the 900-weight masthead, and a per-visit GDPR-relevant call to Google. Mobile is already correct (bundled `@expo-google-fonts`, gated render). Move to `next/font/google` wired into the existing `--font-*` tokens.
- **High — sub-10px text in glanceable, mid-set surfaces:** 74 instances of `fontSize: 9` across mobile (workout player "PAUSED"/PR-count labels at 9px, RPE table headers 9px, chart keys down to **8px** in `liquid-glass.tsx:217`), below the design system's own smallest token (`fs.nano = 10`); fractional sizes (`9.5`, `8.5`) prove scale bypass. Clamp the floor at `fs.nano` for eyebrows and `fs.micro`+ for load-bearing player text.
- **Med — web is 100% px inline styles** — browser text-size preference does nothing (only full-page zoom works). Already tracked as `web-font-rem`; the cheap seam is emitting `fs` as rem strings in `lib/ui.tsx`.

### Color / contrast (ratios computed against actual token values)
- **Token-routed text is genuinely AA-clean, on both themes, guarded by unit tests** (`contrast.ts`, `palette.test.ts`) — verified: ash/card 5.47:1 dark, 5.10:1 light; all `accentText` ≥ 5.87:1.
- **High — charts break in light mode:** `apps/web/lib/ui.tsx:22-33` exports raw *dark*-theme hexes (`LINE_HEX`, `ASH`, `LIME_HEX`) for recharts presentation attrs, used across ~10 chart files. In light "Kyoto Hour" mode the primary data stroke computes to **1.19:1** (invisible), axis ticks **3.16:1** (fails AA). Read the live theme's hexes per render (mobile already does exactly this via `paletteFor(scheme)`).
- **Med — token drift between "sources of truth":** `theme/tokens.ts` `card`/`line` disagree with `palette.ts`/`globals.css` (retired values still shipped to charts). Re-export from `THEMES.dark` or add the parity test the repo style favours.
- **Low —** `gold` on light card 3.03:1 renders coach ★ ratings (informational, not decorative); raw teal text 3.59:1 in two spots bypassing `txt()`.

### Spacing & touch targets
- **Med — the mobile gutter is not one number:** `AuroraScreen` pads 16, legacy `Screen` pads 18, ad-hoc paddings of 14/15/17/20/22 across aurora components, and two different bleed assumptions (−16 ×6, −20 ×3) live in the tree — the full-bleed rule's arithmetic only works when the gutter is a constant. Publish `GUTTER = 16` and consume it everywhere.
- **Med — sub-44dp targets without hitSlop:** the post-set mood picker's 32×32 pressables (`workout.tsx:2154`), bare `Text onPress` sort headers at 9px in trends. hitSlop discipline is strong in some files (nutrition ×14) and absent in others.

### CSS / layout (web)
- **Med — phones get a desktop-shell first paint:** `useMediaQuery` returns `false` during SSR/first paint by design, so every phone load renders the 240px desktop sidebar then snaps to the drawer — visible CLS on an app that carefully eliminated theme-flash via cookie. Serve a UA-CH/cookie hint or gate the two shell variants with CSS media queries.
- **Med — partial `100vh`→`dvh` migration:** `100dvh` correctly used in 2 places, `100vh` remains in ~12 (login centering, the fixed mobile drawer whose bottom sign-out can sit under the iOS toolbar, error/not-found, timer, landing).
- **Low — safe-area handling is dead code:** `env(safe-area-inset-bottom)` appears once (`aurora/sheet.tsx:92`) but no `viewport-fit=cover` is ever set, so it evaluates to 0 — and the fixed pill nav/cmd-orb don't use it at all; an installed PWA on a notched iPhone sits the nav on the home indicator. Add the `viewport` export + apply the inset to nav/orb/sheet. (Mobile RN safe-areas are clean.)
- **Low — ad-hoc z-index ladder** (0…80, 200, 9999 with three different "topmost" conventions) — no collisions today, but token it (`--z-nav/--z-overlay/--z-top`) before a toast lands under a sheet.
- **Suggestion —** vertical-only scrollbar styling (older Chromium shows an 8px horizontal bar inside full-bleed rails); no `scrollbar-gutter: stable` (centered column shifts between short/long pages).

### Animation & responsive
- **Web reduced-motion is exemplary** (global near-zero catch-all that keeps `animationend` firing, plus reduced-transparency and backdrop-filter fallbacks). **Med —** mobile's `useReducedMotion` hook exists but three perpetual `Animated.loop`s don't consult it (`feed-preview.tsx:41`, `profile.tsx:627`, `workout-wrapped.tsx:219`); the web Sheet/paywall slide is likewise unconditional.
- **Low —** 769–900px window renders the squeezed desktop layout (single 900px breakpoint); a one-time 320px pass would catch the pill-nav/num-input tightness.

---

## 6. Performance analysis & "slower than promised" diagnosis

**The app makes no public speed claims** (no marketing performance promises found in the codebase; the closest is `welcome.sub`: "Start logging in seconds", which the guest-first flow genuinely delivers). The gap is therefore against the app's *own* stated bar — the prior audit's scorecard ("Performance 68, path to 90: prove it with numbers, isolate the 1 s timer tick, Lighthouse ≥ 90 in CI") and the premium positioning. Against that bar, measured reality:

### Measured numbers
| Surface | Measured | Assessment |
|---|---|---|
| `/app` (signed-in shell) first-paint JS | **~2.1 MB raw / ~580 KB gz** | ~3× a "fast web app" budget (≤200 KB gz) |
| `/login`, `/` (landing) | ~1.0 MB raw / ~280 KB gz each | Carries the full `@hybrid/core` barrel for ~2 functions |
| Edge middleware (every HTML request) | **856 KB** | Contains the plan library + i18n via the core barrel |
| `@hybrid/core` barrel chunk | 634 KB raw / 178 KB gz | All 3 languages + 1,570-line plan library shipped eagerly to every user |
| recharts+d3 in the `/app` graph | ~575 KB raw / ~155 KB gz | Eager, despite the shell code-splitting it — see P0-2 |
| Mobile Hermes bundle | **9.06 MB** (`expo export`) | Up ~46% from the 6.2 MB measured in the prior audit; all parsed at cold start |

### Root-caused findings (ranked by user-perceived impact)
- **P0-1 (High) — the workout player re-renders its entire tree every second.** `elapsed` state at the top of the 2,309-line `workout.tsx` (and web's 984-line `logger.tsx`), zero `React.memo` in either file, twice-per-second while resting. 10–30 ms JS per tick on mid-range Android — competing with keyboard input exactly while the athlete types a load. Fix: leaf `<ElapsedClock/>`/rest-chip components own the interval; memo the exercise cards. (This is precisely the prior audit's "isolate the 1 s timer tick" item — still open.)
- **P0-2 (High) — `today.tsx:54` statically imports the 2,150-line Nutrition screen**, which imports recharts — defeating `app-shell.tsx`'s own dynamic import of the same module. Verified in build artifacts: the recharts chunks sit in the `/app` entry graph; `exercise-widget.tsx` even documents removing recharts for this reason — nutrition is the sole remaining eager path. One `dynamic()` line inside a Sheet-rendered surface: ~155 KB gz and ~300–600 ms mid-phone parse off every app open.
- **P0-3 (High) — the core barrel ships whole everywhere:** `packages/core` has **no `sideEffects: false`**, `main: src/index.ts`, `export *` barrels — so `/login` (needs 2 validators) and the middleware (needs `csrfCheck`) each carry the plan library, exercise DB and all three languages. The single highest-leverage line in the repo is adding `"sideEffects": false` + subpath exports for the middleware import; per-language dynamic i18n import is the follow-up (~⅔ of string weight unused per user).
- **P1-4 (High for perceived snappiness) — the query-cache adoption is half-done:** core data is on TanStack Query with sane defaults, but ~9 feature screens (feed, discover, leaderboard, notifications, coaches, check-ins, explore, progress, calendar) still `useEffect`+`fetch`, and the shell's `key={screen}` remount forces a full spinner + refetch on *every tab revisit* — 300–800 ms of spinner where a cache would paint instantly. The invalidation discipline already exists; migrate the stragglers.
- **P1-5 (Med-High) — `/api/me` is a 6-step sequential waterfall** (auth round-trip → user upsert → per-invite awaited loop → coach invites → onboarding → macrocycle): ~100–300 ms serialized on the critical path that gates the first screen decision. `Promise.all` + batch the invite claims.
- **P1-6 (Med-High) — every authenticated request pays a Supabase Auth network round trip** (`server-auth.ts:26-27`); the shell fires ~9 authenticated GETs on load → ~10 auth round trips per app open, each 30–120 ms. Verify JWTs locally (JWKS), reserve the network call for refresh.
- **P2 (Med) —** client waterfall serializing exercise catalog before sessions on both clients (~1 RTT); no `Cache-Control`/ETag on the global-config GETs (flags/translations/exercises) or the sessions payload (50 full block blobs re-migrated and re-transferred per focus revalidation); mobile exercise picker/library render the full catalog unvirtualized (History/Feed/Leaderboard are already proper FlatLists — the backlog item is narrower than stated); 10 font variants block mobile first render; no `expo-image` for feed/progress photos.
- **P3 (Low) —** tour's static+dynamic double import defeats its own split; duplicate `/api/me` on load (sequence-guarded but not deduped); `run-track` ticks at 250 ms.

### What's already fast (verified, don't re-fix)
~40 screens properly `next/dynamic`; TanStack defaults sane; coach-roster N+1 replaced with a window-function query; 26 routes use `Promise.all`; `unstable_cache` on global config; Prisma indexes match every hot query examined; mobile home-screen engine work fully memoized; animations on the native driver; **memory: clean bill — every interval/listener/wake-lock found has a cleanup path.**

---

## 7. Broader UX, accessibility & product observations

### Onboarding & time-to-value — strong
Guest-first training with on-device history that migrates into the account is the standout: a user can log a workout before creating an account, and the first-login race was found and fixed (`login/page.tsx:42-53`). Onboarding is 6 single-tap steps with API-down fallbacks and server-side gating that survives device changes. Gaps: BUG-6 (silent mobile failure), skip re-nag, no web skip, no mid-wizard persistence (§3/§4). **Low:** mobile renders `kind: "text"` questions as `null` — an admin adding a *required* text question would hard-block the mobile wizard with nothing to fill in.

### Accessibility — unusually deep, with specific gaps
Infrastructure that most consumer apps at this stage don't have: global focus-visible ring that defeats inline `outline:none`, skip link, a focus-trap hook citing the WCAG SCs it satisfies, reduced-motion on both clients, `maxFontSizeMultiplier` clamping instead of the lazy `allowFontScaling={false}` (which appears nowhere), live-region announcements on errors, and near-complete labeling of icon-only controls (10 mobile screens sampled: effectively all labeled).
- **High — the web Sheet declares `role="dialog" aria-modal` but manages no focus** (`aurora/sheet.tsx:74-104` doesn't use the existing `useDialog` hook): keyboard/SR users can Tab into the inert page behind the paywall and every Today quick action. One-line fix with the proven hook.
- **Med —** web history rows are bare `<div onClick>` (no role/tabIndex/key handler) — a core screen keyboard-unreachable, inconsistent with the corrected pattern in `plans.tsx`/`coach.tsx`; login inputs have no `<form>` (Enter does nothing) and no visible labels (WCAG 3.3.2).
- **Low —** a handful of hardcoded-English a11y labels bypass i18n (`"Close"`, `"Search tools"`); welcome guest link and onboarding Skip lack roles.

### Error handling — good pattern, incomplete rollout
The `FetchError` card (distinguishing load-failure from genuinely-empty, with Retry) is the right idiom and is shipped on both clients — but wired into only 3 screens per client. Everywhere else an API failure renders the *empty* state: `statistics.tsx:28` destructures only `sessions` from a hook that exposes `error`, so a failed fetch tells the athlete to "log a few workouts" — the exact bug the FetchError work was created to kill (~65 silent `.catch(() => [])` sites on mobile). Web social still uses browser `alert()`. No crash reporting (acknowledged as `planned`): production errors are invisible.

### Empty states — a genuine strength
Every sampled zero-data screen tells the user the exact action that fills it, localized in three languages. One gap: the landing footer links logged-out visitors to `/statistics`/`/notifications`, which render the *authenticated* empty copy with no sign-in prompt (401 resolves to `[]`).

### Edge cases — the best-engineered dimension
Draft persistence + resume with the original clock, offline finish stash + foreground sync, opt-in keep-awake, wall-clock duration, virtualized history, rest alerts as local notifications. The gaps are BUG-3 (the stash's duplicate window) and the interval timer (BUG-4).

### Monetization & trust
Mobile paywall is App-Store-correct (localized StoreKit price, Restore, launch-time transaction listener, manage-subscription link, legal links). Web fails *honestly* when Stripe is absent. Real, thorough legal pages; account deletion, data reset and data export all exist and match the privacy policy's claims. Gaps: BUG-7 (trial copy), web paywall drift, and legal-entity placeholders (`legal.ts` operator "HYBRID", `privacy@hybrid.app`) that its own comment says must be confirmed before App Store submission.

### Privacy — very clean
No third-party analytics/tracking SDKs (the tracker is a no-op shim awaiting a provider), which makes the privacy policy's "no third-party tracking" claim currently true; HealthKit follows a data-minimizing on-device-aggregate pattern ("the engines never learn HealthKit exists"). Watch item: when `funnel-analytics` lands, the policy's technical-data section must change in the same PR — worth a note on that capability. The policy's "notify you in the app" promise for material changes has no mechanism yet; the existing announcement banner could serve.

---

## 8. Systemic patterns & root causes

- **S1 — "The last 50 sessions" is load-bearing for things that are semantically all-time.** PRs, lifetime tonnage, trends, streak math and archive-restore all consume one capped list endpoint. Root cause: analytics computed client-side over a transfer-bounded window (the prior audit flagged "retire the `take: 50` client window" — still open). The durable fix is server-side aggregates (PR baselines, lifetime totals) with the capped list reserved for *display*.
- **S2 — Trust boundaries are enforced at write time inconsistently.** The API layer is exemplary on auth/rate-limit/body-size, but *shape* validation is ad-hoc: `blocks` unvalidated (BUG-2), `startedAt` unparsed, PATCH unguarded (L4). One shared payload validator per route would close the class.
- **S3 — Correct idioms exist; adoption is the gap.** Wall-clock timer exists — interval timer doesn't use it. `useDialog` exists — Sheet doesn't use it. `FetchError` exists — 3 screens use it. TanStack exists — 9 screens don't. `fmtTonnage`/local-day keys/`paletteFor(scheme)` exist — Statistics/check-ins/web charts bypass them. The codebase's biggest quality lever is no longer inventing patterns but *sweeping* them — each idiom needs its completion pass (and, where the repo's style allows, a lint/test guard like the ones that successfully froze the reps/KB/middot rules).
- **S4 — The registry drifts in both directions.** Under-reporting (`web-data-layer` "planned" though half-shipped) and over-reporting (`mobile-admin` "one-for-one" though 2 sections behind) — plus shipped entries with to-do-phrased details. The registry is the product's memory; a small convention ("rewrite the detail in shipped voice when flipping status; re-verify counts when touching admin nav") keeps it honest.
- **S5 — Client-side rendering of everything makes every screen pay for the heaviest one.** The core barrel, eager i18n for 3 languages, and one stray static import undo deliberate code-splitting. Root cause: no bundle-size guard in CI — a Lighthouse/size budget (already named in the prior roadmap) would have caught P0-2 the day it landed.
- **S6 — Per-second state at the top of monolith screens.** 2,309-line and 984-line logger files with tick state at the root is both the perf finding (P0-1) and a maintainability smell the prior audit already flagged ("break up the 939-line app-shell" — it has since grown).

---

## 9. Prioritized recommendation roadmap

### Quick wins (days, high ROI)
1. `queryClient.clear()` on logout, both clients (BUG-5).
2. Validate `blocks` + `startedAt` on write; make `migrateBlocks` skip malformed entries (BUG-2).
3. `"sideEffects": false` in `packages/core/package.json` + deep import for middleware `csrfCheck` (P0-3, first stage).
4. `dynamic()` the nutrition import in `today.tsx` (P0-2).
5. Fix the interval timer with the logger's own wall-clock idiom + keep-awake (BUG-4).
6. Check `finishOnboarding`'s `ok` on mobile; only set the local flag on success (BUG-6).
7. Attach `useDialog` to the web Sheet (a11y High).
8. Remove/gate the trial copy until the offer is verifiable; import `FULL_BENEFITS` + live price on web (BUG-7).
9. Fix the NUL bytes in `aurora/profile.tsx` so tooling can see the file again.
10. `next/font` migration for the three Google families.

### Medium-term (1–3 sprints)
1. Idempotent session save: client UUID + unique `(userId, clientId)` (BUG-3).
2. Cursor pagination on `/api/sessions` + server-side PR/lifetime aggregates (BUG-1, S1) — the single most important correctness investment.
3. Complete the TanStack migration for the 9 straggler screens; stop remounting screens on tab switch (P1-4).
4. `Promise.all` + batched invite claims in `/api/me`; local JWT verification (P1-5/6).
5. Isolate the ticking clocks; memo the workout player's exercise cards (P0-1).
6. FetchError rollout to every data screen (consume the `error` the hooks already expose).
7. The consistency sweep: one date formatter taking `Lang`, `fmtTonnage` on Statistics, localize mobile Statistics, gutter constant, `dvh` migration, chart theme hexes via live palette.
8. Registry hygiene pass (S4) + record the web offline-finish gap.
9. Per-language dynamic i18n loading (P0-3, second stage).
10. Crash reporting (Sentry) wired to the boundaries that already exist.

### Strategic
1. **Server-side analytics aggregates** as the durable end-state for S1 (PR baselines, lifetime totals, trend series computed over the full table).
2. **CI performance budget**: Lighthouse ≥ 90 + a gzip first-load budget per route, failing the build — the guard that prevents S5 recurring.
3. **Sweep-as-policy**: for each proven idiom (FetchError, useDialog, wall-clock timers, fmt helpers), a completion pass plus, where feasible, a test/lint guard in the style of the parity/reps/middot tests.
4. **Decompose the two logger monoliths** (2,309 / 984 lines) as the enabler for P0-1 and future feature velocity.
5. When billing unblocks: drive paywall price/trial from live product metadata (the existing `upgrade-pricing` intent) so copy and reality can never drift again.

---

## 10. Suggested test plan for the next sprint

**Regression tests to add (unit/integration, in the repo's existing style):**
1. `POST /api/sessions` rejects malformed `blocks` (null entries, missing `name`, bad `kind`) with 400; `GET` survives a pre-existing poison row (BUG-2).
2. `migrateBlocks` tolerance test: non-string names, null blocks → skipped, never throws.
3. Idempotency: two POSTs with the same client id create one row (BUG-3, once the column lands).
4. Interval timer: elapsed derives from a mocked wall clock — advancing the clock 90 s with zero ticks must advance the phase (BUG-4).
5. Logout: query cache is empty after `clearClientState()` (BUG-5).
6. Mobile onboarding: `finishOnboarding` failure keeps the local flag unset and surfaces an error (BUG-6).
7. lb input round-trip: typing `227.5` in lb mode stores 103.2 kg and the field never snaps while focused (M1).
8. Prefilled-set filter: finishing with 2 of 5 banked sets saves 2 sets' volume (M2).
9. Check-in same-local-day refinement across a UTC boundary updates, not 429s (M3).
10. Bundle guard: a build-artifact test asserting recharts chunks are absent from the `/app` entry graph (P0-2) and `/login` JS is under a set gzip budget (P0-3).
11. Token parity: `theme/tokens.ts` ⟷ `palette.ts` equality test (visual §5).
12. Grep-ability guard: no source file contains raw control bytes (the `profile.tsx` NUL regression).

**Manual/device passes:**
1. **Interval-timer field test** (after the fix): 8×40/20 with the phone locked from round 2 — phases must land on time via notifications; screen must stay awake when open.
2. **Gym-Wi-Fi save test**: throttle to 2G, finish a workout, verify exactly one session exists after the app foregrounds twice (BUG-3).
3. **60-session account** (seed script): verify PR banners against all-time bests, lifetime tonnage, and archive-restore beyond 50 (BUG-1).
4. **Account-switch test** on one device: logout → login as a second user → no flash of user A's data (BUG-5).
5. **Light-mode chart pass**: every analytics/nutrition/endurance chart legible in Kyoto Hour (visual High).
6. **Keyboard-only web pass**: open the paywall Sheet, Tab must stay trapped; traverse History rows; submit login with Enter.
7. **PWA on a notched iPhone**: pill nav clear of the home indicator after the `viewport-fit` fix.
8. **Dynamic Type / 200% zoom pass** (already tracked in `a11y-followups`) — pair it with a 320px-width web pass.
9. **Android release build**: verify the rest-done local notification fires without the expo-notifications plugin, or re-add it (M6).
10. **PL/DE locale pass** on mobile Statistics after localization, plus date rendering on History both clients.

---

*Verification note: every High finding in this report was confirmed by direct code reading (file:line cited). Findings from specialist passes that failed adversarial re-verification were excluded and are listed in §3's "tested and refuted" paragraph so future audits don't rediscover them.*
