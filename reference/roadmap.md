# HYBRID — roadmap

_Living plan. Mobile-first app (Expo / React Native); web is the deep companion.
Consolidates `first-run-and-logic-audit.md` + `persona-gap-matrix.md`._

## Done (this workstream)
- **First-run + engine-logic audit** → `first-run-and-logic-audit.md`.
- **Fixes shipped:** NaN-readiness guard; day-one accountability band ("new",
  risk 0); honest "estimated" prescription/run labels; removed fabricated landing
  stats + public admin link. 393 core tests green; web/mobile/core typecheck.
- **Personas defined + gap matrix** → `persona-gap-matrix.md`. Central finding:
  the nav is role-unaware (one flat 28-item menu shown to everyone).

## The three customers
- **Average Joe** (retail) — frictionless logger + a loud share loop (downloads).
- **The Athlete** (data/technique, maybe coached) — a deep, organized cockpit.
- **The Coach** (1:1 + team) — a console; the revenue persona.

## The plan

### Phase 0 — Persona-aware app shape ✅ *(shipped)*
The app now takes a different shape per persona, on both clients.
- ✅ Persona model in `@hybrid/core` (casual ⊂ athlete ⊂ coach ⊂ admin), derived
  from role + onboarding choice; `navForPersona`/`navVisibleTo` (7 tests).
- ✅ Onboarding "How do you want to use HYBRID?" fork (mobile + web), persisted
  per-device; reversible (mobile More toggle / web Settings toggle).
- ✅ Nav filtered by persona: mobile More hub + CommandMenu; web sidebar + ⌘K hub.
- ✅ Home shapes itself: casual gets the lean Start→route→on-track→share; athlete/
  coach get the cockpit cards (plan, This week, Future Self, Twin).
- ⏳ Remaining for later: per-persona PRIMARY ACTION / hero + a coach-first home
  (folds into Phase 1 / Phase 3).

### Phase 1 — Average Joe (acquisition)
- ✅ Registration routing nailed: the GUEST (no-account) flow is unchanged —
  welcome → train → finish → share, no onboarding wall; onboarding (persona +
  goal + prefs) appears only AFTER an account is created (pendingOnboarding flag,
  both clients; survives the email-confirm path). Returning sign-ins skip it.
- ✅ Post-workout **share is the climax**: PR/first-workout-aware CTA ("🏆 Share
  your PR" / "🎉 Share your first workout"), a "post it 👇" nudge + glow on a win,
  a first-ever milestone header, and celebratory share text. Localized EN/PL/DE.
  Guest flow structurally unchanged.
- ✅ Onboarding no longer over-promises a plan (leads with the persona fork; the
  empty-goal state honestly says "plans coming soon").

### Phase 2 — The Athlete (depth, organized + fed)
- ✅ Athlete cockpit (mobile): one screen sequencing goal/season → today's route →
  performance (Twin/HPI) → sport → velocity/technique → endurance, each a live
  snapshot off real data linking to the deep screen. Athlete/coach personas only
  (Today entry + featured More card). `app/cockpit.tsx`.
- ✅ Web cockpit parity (a `cockpit` nav item + components/cockpit.tsx, athlete-
  gated, same six live sections jumping to the deep web screens).
- ⛔ Unblock one real input stream — Apple HealthKit (recovery) or camera
  pose-capture (technique engine): blocked on an EAS build + native modules /
  credentials (see wearables / vbt-capture / video-intel).

### Phase 3 — The Coach (revenue)
- ✅ Coach-first landing: coaches land on the Coach roster/invite screen (web);
  mobile coaches get a 'Your athletes' entry on Today.
- ✅ Self-serve coaching: a client opts into the coach persona (onboarding fork /
  mode toggle) — no privileged role change (coach APIs are relationship-gated) —
  invites clients via the existing API, and INCOMING invites surface to every
  persona (web app-shell banner + mobile Today card) so any client can accept.
- ⛔ Unblock billing (Stripe) — needs provider keys. The ONLY remaining
  coach-revenue piece; everything around it is built.

### Admin governance — who sees what ✅ *(shipped)*
- Admin → Access control: a per-nav-item matrix where the admin sets the minimum
  persona each feature is visible from (lower = more users). So retail isn't
  overloaded, but an admin can grant e.g. stats to a casual user. Reuses the
  feature-flags store (no new table); both clients honour it. `persona-access`.

### Cross-cutting / blocked (parallel)
- Seed the **plan library** (content; don't fabricate).
- **Mobile App Store + push** (Apple Developer + Expo token + Supabase key → EAS).
- **Wearables / live VBT / food DB** (OAuth creds + native modules).

_Recommended order: Phase 0 → Phase 1 (share loop) → Phase 3 (billing) in
parallel with content/credential tracks._
