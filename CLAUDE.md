# HYBRID — agent guide

Hybrid-athlete training app. **The product is the MOBILE app.** Monorepo: one
shared core, an Expo mobile app, a Next.js deployment that hosts the backend +
the admin panel (the user-facing web client was retired in Aug 2026), one
Supabase/Postgres database.

## Structure
- `packages/core` — shared TS: brand tokens, engines (fatigue/readiness/
  progression/periodization/prescription), plan library, sport engine, session
  helpers, **and the capabilities registry**.
- `apps/web` — Next.js (App Router) → Vercel. Hosts the backend (`app/api/*`)
  that the mobile app and the admin panel call, plus the ONLY remaining web
  surfaces: `/admin` (the operator panel), an admin-only `/login`,
  `/auth/callback`, `/privacy` + `/terms`, the `/invite/[token]` landing, and a
  minimal root page. There is NO user-facing web app — do not add user screens
  here (see the mobile-first rule below).
- `apps/mobile` — Expo / React Native (expo-router) → App Store. The product.
  Calls `/api` on Vercel with a Supabase Bearer token.
- `prisma/schema.prisma` — the data model (Supabase Postgres).
- `reference/` — the prototypes + build brief (the spec).

## Commands
- `pnpm install`
- `pnpm --filter @hybrid/core test` — engine/unit tests (vitest)
- `pnpm --filter @hybrid/web typecheck` / `build`
- `pnpm --filter @hybrid/mobile typecheck`
- `pnpm --filter @hybrid/mobile test` — **also gates CI, and is easy to miss.**
  It is not only component tests: it carries the DESIGN-TOKEN RATCHETS
  (`lib/design-tokens.test.ts`) and the Expo alignment guard, so a raw
  `fontSize`/`borderRadius`/`letterSpacing` added anywhere in `apps/mobile`
  fails here and nowhere else. `typecheck` passing says nothing about it.
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

## RULE: Expo native modules move as ONE SET (always)
Never `pnpm add expo-…`. It installs npm-latest, which is routinely a release
AHEAD of the installed SDK — and every Expo module is Swift compiled against
`ExpoModulesCore` and shipped as its own framework, so a module built against a
newer core than the app links resolves fine at build time and then **aborts in
dyld on the phone, before the first frame**. That is exactly how build 82223058
shipped dead: `expo-camera` declared `~56.0.8` while `expo@56.0.8` pins
`~56.0.7`, and camera 56.0.8 wanted core 56.0.16 against the app's 56.0.14.

The version set is `expo/bundledNativeModules.json` — the versions Expo builds
and tests together for the installed `expo`. Add and upgrade with
`npx expo install <pkg>` / `--fix`, and when bumping `expo`, bump the whole set
with it. `apps/mobile/lib/expo-alignment.test.ts` enforces this (and gates the
TestFlight workflow); non-Expo packages may diverge, but only via that file's
`DELIBERATE` map, with the reason written down.

## RULE: mobile-first — the web client is RETIRED (always)
The old rule here was web↔mobile parity. It is retired along with the web
client: **user-facing features ship on MOBILE, and only on mobile.** Do not add
user screens, user flows, or user-facing pages to `apps/web` — its only UI
surfaces are the admin panel (+ its login), the legal pages, and the two
public landings (root, invite). Product logic still belongs in `packages/core`
(the engines serve the API, the admin panel, and the mobile app alike), and
API work still lives in `apps/web/app/api/*` — serving both remaining callers.
Admin capabilities remain two-sided: the web `/admin` panel and the mobile
admin console both exist, so keep those two in step when you touch admin
features. That rule is about the two panels not disagreeing on a feature both
have — it does not oblige every operator tool to ship in the consumer binary.
A section may be **web-only**, and the AI group (Agent HQ, AI agents) now is:
an agent-operations console has no business compiled into the app an athlete
downloads, role gate or not. A web-only section must say so, and say why, in
`apps/mobile/components/admin/sections.ts`.

Comments must not cite files that no longer exist. Every repo-shaped path in a
source comment has to resolve — `apps/web/__tests__/dead-references.test.ts`
fails the build otherwise. The web client took 96 files with it and left 116
comments pointing at them, each one also asserting a parity obligation to a
client that is gone, which is how a retired decision gets rebuilt. Where a
deleted web file was genuinely the provenance, say so in the past tense; the
mobile file is the live standard in every such case. `reference/`, `audit/` and
`capabilities.ts` are exempt: they are records of what was true when written,
not instructions.

## RULE: the device's recording is the source of truth (always)
When a session is matched to an Apple Watch (or other device) recording, the
**measured figures outrank the typed ones — everywhere**. `Session.device`
carries the recording and `packages/core/src/device-truth.ts` projects it onto
the session's blocks (`deviceTrueSession(s)` — including second-accurate
`seconds` for pace); every engine, summary line, row, card, and stat must read
through that projection, never the raw typed blocks. Derived figures (pace,
rates) must come from the device's exact values (`cardioSeconds`, unrounded
distance), NOT from display-rounded ones — a pace computed from "8 min" when
the watch recorded 7:52 contradicts the device panel beside it. The ONE
exception: the summary's logged-vs-measured comparison panel deliberately reads
the raw session (`ignoreDevice`). When adding any new surface or aggregate that
touches duration/distance/pace, wire it through device-truth in the same change.

## RULE: keep the Capabilities registry current (always)
`packages/core/src/capabilities.ts` is the single source of truth for **every**
app capability. It is surfaced on BOTH admin Capabilities screens
(`apps/web/components/capabilities.tsx` and
`apps/mobile/components/admin/content.tsx`, admin-only).

Each capability has a `status`:
- `shipped` — built and working.
- `blocked` — implemented (code is done) but cannot proceed because of missing
  data/access/credentials. Record `blockedBy` (what's needed to unblock).
- `planned` — not built yet.
- `retired` — deliberately DELETED (not paused, not deferred). Record
  `retiredBecause`: why it went, and what would have to be true to revisit it.

**Whenever you ship, block, plan or retire a feature, update `capabilities.ts`
in the same change.** This list must always reflect reality. New blocked items
(e.g. "needs an API key", "needs the Apple Developer account") go here so
nothing implemented-but-stuck is forgotten.

**Never delete a capability entry — retire it.** An entry that vanishes takes
its reasoning with it, and the next session cheerfully rebuilds the thing. The
code is in git; the argument for why it went lives only here.

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

## RULE: screen-level sliders run FULL-BLEED — no gap at the screen edge (always)
Every horizontal slider/rail that sits directly on a screen (Today's "Train your
way", its "Follow a coach" rail, …) must let its cards
slide under the physical screen edge — never clip at the content column with
the screen gutter showing beside a cut card. The **golden standard is the
exercise-widget rail** (`aurora/exercise-widget.tsx` — the rail left Today in
Aug 2026 and the file is kept as this rule's reference implementation): negative
horizontal margins the width of the screen gutter pull the scroll clip to the
true edge (mobile `marginHorizontal: -12` against AuroraScreen's 12dp gutter —
the kit's `GUTTER`; web `margin: 0 calc(-1 * var(--page-pad-x, 12px))`, the
shell publishes 12px on mobile), with MATCHING internal padding so resting
cards still align with the content column. `CoachRail`'s
`bleed` prop is the same idiom. The one exception: a rail rendered inside a
Sheet or a card respects its container's padding — bleed is only for rails
sitting directly on a screen.

## RULE: a sheet owns the pad under its last row — content adds none (always)
The bottom pad of a bottom-sheet is ONE number, `sheetPadBottom(insetBottom)`
from `packages/core/src/scale.ts` — `max(insetBottom, 24)`, **max, never plus**.
A sheet's panel sits ON the screen's bottom edge, so the home-indicator inset is
the FLOOR of the pad, not an addition to it. Apply it on the PANEL: mobile
`paddingBottom: sheetPadBottom(insets.bottom)`, web
`max(${sheetPadBottom()}px, env(safe-area-inset-bottom, 0px))`.
Nothing rendered INSIDE a sheet may trail a pad of its own — no
`contentContainerStyle={{ paddingBottom }}` on a sheet's scroller, no trailing
`paddingBottom` on the last block. Those stack on the panel's pad and are what
put a dead band under every sheet (the web More sheet reserved 110px for a pill
bar it renders over and hides). A sheet also never reserves clearance for the
tab bar or the pill nav: it covers them.

## RULE: no decorative dot/marker before section headers (always)
A small dot, circle or square placed before a section label reads as AI slop.
Never render one in front of a heading, kicker, or cluster label, on either
client. The **golden standard is the Explore tab's `SectionHead`**: a bold
display-face title in chalk (web `--font-heading` 800/18; mobile
`F.black` 18), with any META or head-level CONTROL (a count, a
filter, "Free") as small mono uppercase on the RIGHT side of the same row —
never a marker on the left. That right slot is NOT where a rail's "See all"
goes; an exit lives at the end of the thing (see the rule below). SEMANTIC dots
are not decoration and stay: status/live dots, mood dots, chart legend swatches,
calendar event markers, notification badges, and the ✦ premium signifier.

## RULE: an exit is never a bordered box — ring = leaves, no ring = grows (always)
No end-of-thing affordance wears card chrome. Not the "See all"/"See more" at
the end of a rail, not a destination row, not an explainer glyph — no fill, no
border, no radius, no shadow, on either client. A card carries a THING (a coach,
a recipe, a business, a metric); an exit carries none, so a filled bordered box
at the end of a row of things reads as one more item that turned out to be empty
— and gets counted ("six verified businesses" where there are five).

Use the shared components, never a local copy — the drift is the whole problem.
Five rails once drew five different tails because each sized its own:
- **A rail** ends in `aurora/rail-tail.tsx` (both clients). Its only per-rail
  prop is `w`, and that is a SCROLL concern, not a decorative one: under a
  mandatory snap grid (web `scroll-snap`, mobile `snapToInterval`) an odd-width
  final child puts the content end off the grid and leaves the tail half-cut.
  `radius`/`shadow` were deleted rather than defaulted so no caller can re-card
  it. Label is the shared `w.explore.seeAll` / `seeMore` — put the rail's
  subject in `a11y`, not in a bespoke string.
- **A full-width block** ends in `week-verdict.tsx`'s `DoorRow`.
- **A vertical list** ends in a DOOR ROW *of that list* — it takes the list's
  own hairline and chevron (the food page's "More from this business"), because
  there the separator belongs to the rows above it.

THE GRAMMAR, and it is the part that must not drift:
- **Ringed glyph → it LEAVES** (opens a screen or a sheet). The tail's 44px
  arrow ring, the door row's 32px glyph ring. A glyph that is ALREADY a ring
  (ⓘ) needs no second one drawn around it.
- **Bare `＋`/`−`, no ring → it GROWS in place** (the Other-sports tail, the
  endurance block's All-sports control). An arrow there would promise a
  destination that does not exist.

Expander counts and labels are **ash, never chartreuse** — the accent is the
"go" colour, and an expander never goes anywhere. Stacked rows separate by
whitespace, not a rule: a hairline under a GroupMark is the label-plus-rule
divider the cluster markers deliberately retired.

## RULE: a state the USER caused must travel, never teleport (always)
When a tap changes what a surface CONTAINS or how tall it is — a card swapping
between its states, a row arriving or leaving, a list re-filtering, a block
whose actions disappear — the change is animated. Not decoration: motion is the
only thing that says *what* changed, and without it the app is correct,
type-safe, fully tested and feels cheap in a way nobody can point at. It is
also the one class of bug no gate here can catch by running the code, which is
why both guards for it (`apps/mobile/lib/list-motion.test.ts`) read the source
as TEXT.

The mechanism is `useListMotion()` / `animateListChange(reduced)` from
`apps/mobile/lib/list-motion.ts` — the shared `springs.slide` curve, armed
IMMEDIATELY BEFORE the state update:

    const motion = useListMotion();
    onPress={() => motion(() => setThing(next))}

Three things that are easy to get wrong:
- **Arm next to the commit, never across an `await`.** `configureNext` decorates
  whatever layout lands next, so arming before a round-trip animates some other
  commit. Compute the next state locally, animate, apply, then persist
  best-effort (see `onDeclareRest` in `apps/mobile/components/aurora/home.tsx`).
- **Reduce Motion is not "a shorter animation".** For a LAYOUT change the
  correct substitution is NO motion — there is no position left to
  cross-dissolve — and `useListMotion` already reads it.
- **Not every write.** A per-keystroke field write, or a value changing inside
  a row that stays put, must NOT animate; `list-motion.test.ts`'s `EXEMPT` list
  names each such path with its reason, and the next one added has to say which
  kind it is.

Known platform limit, worth stating rather than rediscovering: LayoutAnimation
is ON for iOS + Fabric and OFF for Android + Fabric in the installed RN. The
product ships to the App Store, so this is a note, not a blocker — just do not
describe list motion as cross-platform until it is.
