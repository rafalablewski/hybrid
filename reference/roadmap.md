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
- Collapse his surface to Today / Train / History / Share.
- Make the post-workout **share the reward** (auto-prompt on PR/streak, better
  templates, a first-workout hero card).
- Stop onboarding over-promising a plan.

### Phase 2 — The Athlete (depth, organized + fed)
- An athlete cockpit: sport → goal → season → today → performance → technique.
- Unblock one real input stream: Apple HealthKit (recovery) via EAS build, or
  camera pose-capture (lights up the dormant technique engine).

### Phase 3 — The Coach (revenue)
- Coach-first landing (squad monitor as home).
- Self-serve coach onboarding + client invite.
- Unblock billing (Stripe).

### Cross-cutting / blocked (parallel)
- Seed the **plan library** (content; don't fabricate).
- **Mobile App Store + push** (Apple Developer + Expo token + Supabase key → EAS).
- **Wearables / live VBT / food DB** (OAuth creds + native modules).

_Recommended order: Phase 0 → Phase 1 (share loop) → Phase 3 (billing) in
parallel with content/credential tracks._
