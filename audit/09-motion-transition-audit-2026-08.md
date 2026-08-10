# Motion & Transition Audit — Apple-level review

**Date:** August 2026
**Scope:** every transition, navigation flow and screen change on both clients.
**Method:** read the shipping code, not the design decks. Every claim below cites
a file and line. Nothing is asserted from a screenshot or from the capabilities
register — where the register disagrees with the code, the code wins and the
register is marked stale.

> **STATUS — the audit has been actioned. This document is the original finding
> and is deliberately left as written; it is a record of what was true when it
> was taken, not a description of the app today.** All twenty items on §20's
> "worst transitions" list have shipped, plus the two follow-ups they opened.
> See `motion-audit-followups` in `packages/core/src/capabilities.ts` for what
> each fix actually was — that entry, not this file, is the current state.
>
> Where a finding below reads as present-tense fact, add "as of August 2026,
> before the fix". The scores in §21 are the pre-fix scores.
>
> **All twenty-two are now fixed everywhere, and §20's second list — the
> "most confusing navigation decisions" — is closed with them.** Most fixes
> live in one shared place — the Sheet, the SwipeRow, the shell's history, a
> list in core — so every site gets them by construction. The rest were swept
> in a third pass: the face flies at all twenty doors to a person's page,
> filtering travels on twelve surfaces, and web's stat tiles roll at the
> source, which reached thirty-one screens in one change.
>
> The two that were honestly still open — `loading-crossfade-adoption` and
> `mobile-stat-tile` — closed in **wave 4**, and both closed differently than
> this document predicted. The crossfade was scoped here as forty-five body
> moves; it needed none, because `LoadSwap` already rendered its children only
> once the data had landed, so making children LAZY turned that into an
> enforceable contract and let every body stay in its own scope. And the stat
> tile's blocker was never the count: it was that mobile had nothing to sweep
> ONTO. `shared-elements-remaining` still covers the pairs that were never in
> the twenty — the chart being the interesting one.

### The twenty, and where each went

| # | Finding | Where it was fixed |
|---|---|---|
| 1 | Browser Back exits the app (N1) | Wave 1 — `setScreen` pushes; popstate applies the direction the browser travelled |
| 2 | Sheet grab handle bound to nothing (F1) | Wave 1 — pan on the panel, release by velocity projection in core |
| 3 | Every list deletion teleports (§11) | Wave 1 (set rows) → Wave 3 — SwipeRow closes its own gap, so every host gets it |
| 4 | 448 mobile taps with no feedback (M1) | Wave 1 — `PressScale` swept across 83 files |
| 5 | 571 web buttons with no press state (M1) | Wave 1 — 574 buttons across 104 files |
| 6 | Session card → detail, hard cut (§3) | Wave 1 — `SHARED_ELEMENTS.sessionHero` |
| 7 | Plan cover → plan, hard cut (§3) | Wave 2 — `SHARED_ELEMENTS.planCover`; mobile's FLIP learned to fly a surface |
| 8 | Mobile sheet running a cubic (F3) | Wave 1 — `springToRN(springs.sheet)` |
| 9 | The hub lens at 629ms (T1) | Wave 1 — `springs.lens`, in the token set so the guard sees it |
| 10 | Settings pushing like a drill-down (N3) | Wave 2 — core `MODAL_SCREENS`; `presentation: "modal"` |
| 11 | Editors pushing like drill-downs (N3) | Wave 2 — same list |
| 12 | Web sheet unmount racing itself (F4) | Wave 1 — `transitionend`, timeout as fallback only |
| 13 | Swipe actions ignoring velocity (G1) | Wave 1 — core `projectSwipe` |
| 14 | Reorder commit with no travel (§11) | Wave 2 — animated inside `useDragReorder` |
| 15 | Spinner → fully-formed screen (§12) | Wave 1 (mobile `Skeleton`) → Wave 3 — web's twin, admin included |
| 16 | Skeleton → content as a swap (§12) | Wave 2 — `LoadSwap`, `durations.crossfade` → Wave 4 — lazy children, ~33 sites across 29 files |
| 17 | Numbers swapping, not rolling (§13) | Wave 2 — core `numericDiff` + `RollingNumber` → Wave 3 — web's 31 stat tiles + the calorie ring → Wave 4 — mobile's `AStat` |
| 18 | No full-swipe-to-delete (G2) | Wave 1 — commit at `swipe.fullAt` |
| 19 | Paywall bypassing the shared sheet (F5) | Wave 2 — it is the shared `Sheet` |
| 20 | Filter replacing the list wholesale (§11) | Wave 2 (Exercises) → Wave 3 — twelve surfaces |

### The two follow-ups the twenty opened

| Finding | Where it went |
|---|---|
| No full-screen-cover vocabulary — entering the live logger looks like opening Settings (§2) | Wave 3 — core `COVER_SCREENS`; `fullScreenModal` + focus blur, and web's chrome leaves with the mode |
| The remaining shared-element pairs (§3) | Wave 3 — `SHARED_ELEMENTS.personAvatar`, at all twenty doors to a person's page |

### §20's second list — the most confusing navigation decisions

Waves 1–3 closed thirteen of these as a by-product of the "worst transitions"
work (they are the same findings seen from the user's side rather than the
frame's). **Wave 4** closed the remainder, and closed the two honest gaps above
with them.

| # | Decision | Where it went |
|---|---|---|
| 4 | Detail screens inside the tab on mobile, on top of it on web (N5) | Wave 4 — the web pill bar stands only on a nav root (`navRootRank`), so a push covers it exactly as it hides mobile's native bar |
| 5 | Tab-switch motion differs between clients (§8) | Wave 4 — closed as a DECISION, not a build: web has no system bar to inherit and the alternative is a hard cut, so the slide stays and `nav-parity-gap` records it as deliberate |
| 6 | The search slot beside the tab bar is reserved and empty (§4) | Wave 4 — closed as a decision: the slot is deliberately spent on the Train action (`role="search"` detaches the circle), so a future search does not live there. Cross-app search is now its own `global-search` item |
| 8 | Two swipe-row implementations with four constants (G5) | Wave 1 (SwipeRow) → Wave 4 — History's SwipeCard, the last surface deciding on displacement, takes core's `projectSwipe` + rubber-band + `springs.slide` on both clients |
| 14 | Six hand-rolled springs beside a four-token system (F7) | Wave 1 (the lens) → Wave 4 — `springs.pop` is the celebration token, the one spring allowed past the 450ms ceiling and given its own guard |
| 17 | Error haptics fire nowhere (§15) | Wave 4 — `toast()` gains an error kind that knocks from inside the host, wired to the save/sync failure paths |
| 18 | Two loading languages across clients (§12) | Wave 4 — see item 16 above |
| 20 | The register describing a haptics state that no longer holds (H1) | Wave 1 — one gate per client by construction; the register corrected in the same change |

Items 1, 2, 3, 7, 9, 10, 11, 12, 13, 15, 16 and 19 were already closed by the
waves above (N1, N3, N4, F2, F6, H2, H3, §2's cover vocabulary, §3's pairs, and
`durations.fast` ceasing to do double duty once push-exit and sheet-exit were
separated).

**One stale claim of the audit's own, found in wave 4 and worth recording:**
`NAV_ROOT_ORDER` still ranked the retired More tab and had never ranked
Messages after it took More's slot — so Today ⇄ Messages, two roots sitting
beside each other in the capsule, resolved as a *drill-down* on web while the
native bar swapped them as siblings. Not on either list; it fell out of fixing
N5.

Two more findings outside both lists were closed on the way, because the fixes
turned out to be the same fix: **N4** (the recede-and-rise push was defined in
shared tokens and performed by one client) — web's push is the horizontal
travel now and recede-and-rise belongs to modality, which is what §2's table
recommended; and the `motionPushOut` keyframe's scale, which was `.94` against
`motion.recedeScale`'s `.92`, so a presented *screen* and a presented *panel*
receded by different amounts. Both are guarded.

### §20's third list — the biggest opportunities for delight

Shipped: **2** (sessionHero), **3** (planCover), **4** (sheet drag with the
scrim and recede tracking the finger), **5** (detents, and later the
one-drag elongation), **6** (`RollingNumber` — every rest clock, weight and
stat tile that goes through a shared component), **7** (wave 4 — the PR badge
flies, and the badge itself had to be built first: there was none), **9**
(press feedback, ~1,100 sites), **10** (full-swipe-to-delete), **11**
(full-screen cover + focus blur), **13** (personAvatar, at all twenty doors),
**14** (list insert/delete), **17** (wave 4 — the streak rolls), **18** (wave 4
— the readiness face morphs; every path normalised to one command signature so
it can interpolate at all), **19** (wave 4 — calendar day → detail, the app's
first same-screen shared element).

Open, and each its own item: **1** the accessory → logger expansion (the Music
mini-player moment), **8** chart expansion with persisting axes — a data change
rather than a motion one, which is why it is the interesting one, **12** the
rest timer as a Live Activity, **15** interactive back on web (needs the
shell's screen chain extracted so two can coexist mid-drag), **16**
pull-to-refresh that reveals, **20** the nav lens → FAB merge (idiom proven at
bundle level; needs a device).

### Corrections to the audit as written

Five claims in this document did not survive contact with the code, and are
left in place below rather than edited out:

- **§12's count of 43 spinner sites** was right at the time and is no longer the
  right *measure*. 18 `ActivityIndicator` render sites remain on mobile and
  every one is an in-flight ACTION — `busy ? <spinner/> : "Save"`, an export, a
  purchase, the AI coach thinking — which §12 itself says is what a spinner is
  for. The number that mattered was arriving-CONTENT sites, and those are on the
  skeleton. (Counting `grep ActivityIndicator` gives 37, but more than half of
  those are import lines; the audit's own 43 was measured the same way and was
  therefore also high.)
- **§13's "every stat tile and the macro rings"** understated how cheap the web
  half would be (one shared `Stat`, thirty-one screens) and understated the
  mobile half, which needs a primitive that does not exist.
- **The haptics register** claimed all sites were user-gated; four were not.
  Fixed in wave 1, noted in `screen-transitions-wave3`.
- **"Forty-five mobile loading states, each needing its body moved into a
  child"** (the status note's own scoping of §12's remainder) was wrong twice
  over, and the error is instructive: the count of *convertible* sites was ~33,
  and none of them needed a body move. The prescription assumed `LoadSwap` had
  to receive the content as a prop; it already rendered its children only once
  the data had landed, so making children LAZY made that an enforceable
  contract and let every body stay in its own scope. **Scoping a fix from the
  call sites rather than from the primitive is what made this look expensive
  for three waves.**
- **§13's mobile sweep was measured, and it is much larger than "thirty-one
  edits"** — 28 private look-alike components and ~50 inline sites across 29
  files, ~85 call sites. Three structural things block a blind sweep (a
  `color`/`c`/`accent` prop split, ~11 figures drawn through `serifIf` that
  would change on the light theme, and a figure-beside-label row that is a
  different layout rather than a variant), so `mobile-stat-tile` now carries a
  measurement instead of a guess.

---

## 0. The honest opening

This is not a bad motion system being asked to become good. It is a **good**
motion system with a **partial adoption problem**, wearing a token layer that has
quietly drifted out of sync with the components it governs.

`packages/core/src/motion.ts` is, genuinely, better than most shipping iOS apps.
It uses springs rather than duration+bezier because a bezier carries no velocity
and therefore cannot be interrupted. It solves settle time numerically rather
than from the envelope bound. It treats Reduce Motion as a *substitution*, not a
deletion. It derives direction from hierarchy so that back is the exact inverse
of forward. A regression test regenerates every CSS curve from the source and
fails if `globals.css` drifts by one millisecond. That is Apple-tier systems
thinking and it should be said plainly before the criticism starts.

The criticism is that **the system is not the app**. Four springs are defined;
six components hand-roll their own. One shared element exists in a product built
entirely out of cards that open into screens. 94% of taps on mobile produce no
visual feedback at all. And the token the whole system is anchored to —
`springs.nav`, the one the file says "must not be retuned without re-auditing
that screen" — points at a screen that was deleted, and no shipping component
runs it at its documented value.

So the verdict is not "add more animation." It is **finish the system you already
designed, then delete everything that isn't it.**

---

## 1. Navigation flow — **6/10**

### What is right

The hierarchy model (`motion.ts:274`, `screenTransition`) is correct and rare.
Sibling ⇄ sibling travels horizontally in bar order; root → detail pushes; detail
→ root pops; two unrelated leaves crossfade rather than inventing a direction
they don't have. Both clients read the same function, so they cannot disagree
about what a move *means*. This is the part most apps never get right, and it is
right here.

Mobile's tab bar is the real `UITabBarController` (`app/(tabs)/_layout.tsx`),
which means Liquid Glass, minimize-on-scroll, the scroll-edge transition, Dynamic
Type, Reduce Transparency and double-tap-to-pop-to-root are all *inherited*
rather than reconstructed. Deleting the hand-built capsule to get there was the
right call and the comment defending it is correct.

The back-swipe policy is also right: disabled exactly where a swipe would be
*wrong* rather than merely unhelpful — the live workout, the auth funnel — and
inherited from the OS everywhere else (`_layout.tsx:92–104`).

### Finding N1 — the browser Back button exits the app (web) — **CRITICAL**

`apps/web/components/app-shell.tsx:171` holds the entire app's location in
`useState`. `setScreen` never calls `history.pushState`. The only `popstate`-adjacent
code is a deep-link listener (`app-shell.tsx:184`). `useRouter` appears exactly
once, for `/admin` (`app-shell.tsx:625`).

The consequence: a user eleven screens deep who presses Back — the browser's
primary navigation control, and on Android the *system* back — **leaves the
application entirely**. Every piece of transition craftsmanship downstream of
this is decoration on a building with no exit.

This outranks every other item in this document. It is not a motion bug; it is
the reason several motion features (interruptible back, gesture-driven pop) are
unbuildable on web today.

**Fix:** `setScreen` pushes a history entry; a `popstate` handler drives
`setScreenRaw` with `back = true` so `screenTransition` produces the exact
inverse. This is ~30 lines and it unblocks items N2, R14 and R15.

### Finding N2 — no interactive back on web at all

Mobile inherits the iOS edge-swipe: genuinely finger-tracked, interruptible,
parallaxed. Web has nothing — no drag, no gesture, and (per N1) no button
either. The two clients' *primary* way of going backwards is not merely
different, it exists on one and not the other.

### Finding N3 — modality is unused on mobile (one route out of ~45)

`grep "presentation:" apps/mobile` returns exactly one hit: `upgrade`
(`_layout.tsx:108`). Every other non-tab route inherits `slide_from_right`.

That means **Settings, Profile-edit, Builder, Check-in, Logger-settings, the
exercise picker and the interval timer all arrive as drill-downs.** Apple's rule
is the opposite: a self-contained task that the user will *finish and leave*
should be modal. The spatial claim a right-slide makes is "this is deeper in the
same tree"; the claim a sheet makes is "this is a detour, and you will come
back." Editing your profile is a detour.

The cost is not aesthetic. A pushed screen exits by left-edge swipe; a modal
exits by dragging down anywhere. The app currently teaches one exit gesture for
two different kinds of destination.

### Finding N4 — push/pop parity between clients is claimed but not real

`motion.ts` defines the push as: parent scales to `recedeScale` 0.92, dims to
`recedeBrightness` 0.72, child rises `pushOffset` 16% (`motion.ts:81–99`), and
`globals.css` implements exactly that (`motionPushIn` / `motionPushOut`).

Mobile implements **none of it**. `_layout.tsx:79` sets
`animation: "slide_from_right"` for the entire stack — a horizontal push, not a
rising child over a receding parent. So the shared token that exists specifically
so "web and mobile can't disagree" describes a motion only one client performs.

I want to be careful here, because the *right* fix is not the obvious one.
Mobile's choice is defensible and possibly better: `slide_from_right` is rendered
natively by `react-native-screens`, runs off the JS thread, and is reversed
exactly by the OS's own interruptible edge-swipe. Hand-rolling the recede-push on
iOS would trade all of that for token purity.

**Recommendation:** keep mobile's native push, and change the *web* push to match
it — a horizontal push with the parent parallaxing under at `parallaxUnder` 0.33,
which the system already defines and already uses for siblings. Then reserve the
recede-and-rise for what it actually is: **sheet presentation**, where it is
already correct on both clients. Right now the app has two different visual
languages for "deeper" and calls them the same thing.

### Finding N5 — the two clients disagree about whether a detail screen is inside a tab

On mobile, the native tab bar is correctly hidden by any pushed screen — that is
the platform rule and the code adopts it deliberately. On web, the pill nav
persists on every screen. So the same destination is "inside the tab" on one
client and "on top of the tab" on the other. The spatial models are genuinely
different, not just the chrome.

### Score rationale
The hierarchy engine is 9/10 work. N1 is a 2/10 defect on the primary client.
**6/10.**

---

## 2. Screen transitions — what each move should do

| Move | Today | Should be | Why |
|---|---|---|---|
| Tab ⇄ tab | Horizontal slide, `springs.slide`, parallax under | **Keep** — but see §8 | Siblings in a fixed order have a real left/right |
| Root → detail (web) | Recede + rise | **Horizontal push, parallax under** | Reserve recede for modality (N4) |
| Root → detail (mobile) | `slide_from_right` | **Keep** | Native, interruptible, OS-reversed |
| Detail → detail | Crossfade | **Keep** | No defensible direction; inventing one is worse |
| Settings / editors | Push | **Sheet, `.large` detent** | Self-contained task (N3) |
| Card → its own screen | Hard cut | **Zoom / matched geometry** | §3 — the biggest single gap |
| Today hub tabs | Lens flies, content dissolves | **Keep** | Correct: one thing moves |
| Sheet open | Recede + slide up | **Keep, add detents + drag** | §9 |
| Upgrade paywall | Transparent modal, fade | **Sheet with `.large` detent** | It is a sheet wearing a modal |
| Logger entry | Push | **Full-screen cover + focus blur** | Entering a workout is a mode change |
| Post-workout → Done | Push | **Zoom from the last set row** | §3 / R7 |

The one genuinely missing *kind* is **full-screen cover**. Entering the live
logger is a mode change — the tab bar goes away, back-swipe is disabled, the app
is now a different tool. It currently arrives as an ordinary right-slide, which
is the same motion as opening Settings. Wave 3 already lists "live-workout focus
blur" as remaining; it should be promoted, because it is not a flourish, it is
the missing signal that the app changed mode.

---

## 3. Shared elements — **the single biggest gap**

The mechanism is **built, generic and good**. Web uses the View Transitions API
with an imperative arm-at-click-time source (`apps/web/lib/shared-element.ts`) —
and the reasoning in that file about why it must be imperative rather than React
state (the snapshot is captured synchronously, so a state update wouldn't have
committed) is exactly right. Mobile has a FLIP overlay mounted above the
navigator so the flying clone can't be clipped (`_layout.tsx:145`).

**It is used exactly once.**

```
SHARED_ELEMENTS = { exerciseHero: "hybrid-exercise-hero" }   ← motion.ts:213
```

Two call sites per client: `exercise-widget` → `exercise-page`. That is the
entire inventory.

Meanwhile the app is *made of* cards that open into screens. Every one of these
currently hard-cuts:

| Source | Destination | What should travel |
|---|---|---|
| Session card (`home.tsx:989`, `history.tsx:126`) | `/session/[id]` | The session's headline figure + its title |
| Plan cover (Plans root) | Plan detail | The cover image — a true hero, full geometry |
| Coach avatar (`coach-rail`) | Coach page | The avatar circle → the page's header portrait |
| Exercise row (Volume, Analytics) | Exercise page | Already has a mechanism; just not wired |
| Food row (Nutrition) | Food detail | The macro ring |
| Calendar day (`calendar.tsx:96`) | Day detail | The day cell → the detail card's frame |
| Chart card (Trends, Progress) | Expanded chart | The plot area — the axes stay, the frame grows |
| Last set row (logger) | Done summary | The PR badge (wave-3 item 4, still open) |
| Device panel (session detail) | Full recording | The route line / pace curve |

**The rule that makes these work** — and the app already articulates it in
`use-screen-transition.ts:88` — is that *a shared element in flight owns the
motion*: the screen behind cross-dissolves rather than sliding, so the eye
follows the one thing that persists. That rule is written down and enforced. It
simply has one participant.

**Recommendation, in priority order:**

1. **Session card → session detail.** Highest traffic in the app. Travel the
   headline figure (volume or duration), not the whole card — a card is not the
   shape of a page, but the *number is the same fact in both places*, which is
   the exact argument `motion.ts:216` already makes for the exercise hero.
2. **Plan cover → plan detail.** This one wants full matched geometry, not a
   figure: a cover image genuinely is the same object at both ends. It needs a
   per-plan detail screen to point at, which is already tracked as
   `plans-root-enrolled-cover` / wave-3 item 6.
3. **Coach avatar → coach page.** Cheap, and avatars are the most obviously
   "same object" element in any app.
4. **Chart → expanded chart.** Use `contentTransition`-style behaviour: the
   *axes and gridlines* persist while the frame grows. Charts that re-render at
   the destination are the most jarring cut in the analytics screens.

On the SwiftUI side (`swiftui-kit`, currently blocked) these map to
`matchedGeometryEffect` for 1–3 and `NavigationTransition.zoom(sourceID:in:)` for
the card-becomes-screen cases, which is the API Apple shipped precisely for this
and which Photos, Fitness and Wallet all use.

---

## 4. Window changes — opening and closing

### Opening

| Surface | Today | Verdict |
|---|---|---|
| Settings | Push | **Wrong** — sheet, `.large` (N3) |
| Detail pages | Push | Correct, but should zoom from source (§3) |
| Editors (profile, builder) | Push | **Wrong** — sheet |
| Modals | Sheet, recede | Correct |
| Search | *No global search exists* | The iOS 26 search slot beside the tab bar is deliberately reserved and empty (`(tabs)/_layout.tsx:38`). Correct to reserve it; it now needs filling. |
| Filters | Inline state | Correct — filters should never navigate |
| Upgrade | `transparentModal` + fade | **Wrong** — it is a sheet; give it the sheet's recede so it doesn't float over a flat picture |

### Closing

| Gesture | Works? |
|---|---|
| Swipe down on a sheet | ❌ **Does not exist** — see F1, the most serious microinteraction defect in the app |
| Tap outside | ✅ both clients |
| Done / Cancel | ✅ |
| Back (mobile) | ✅ OS gesture + hardware back |
| Back (web) | ❌ **Exits the app** — N1 |
| Esc (web) | ✅ sheets only (`sheet.tsx:101`) |

Two of the six closing affordances are broken, and they are the two users reach
for first on their respective platforms.

---

## 5. Context preservation — **6/10**

Where the app is strong: the parent-recede on sheet presentation is a genuine
spatial statement — the screen you came from is *visibly still there*, scaled
back and dimmed behind the panel. The reasoning at `motion.ts:90–94` (that the
recede is what *lets* the scrim drop from 0.6 to 0.28, because a heavy dim over
an un-receded page flattens it) is exactly the observation Apple made when sheets
were redesigned in iOS 13, arrived at independently. That is the best single
decision in this codebase.

Where it breaks:

- **"What object did I select?"** — unanswered everywhere except the exercise
  hero. You tap a session card, the screen cuts, and a page appears containing
  the same data with no visual thread back to the thing you touched (§3).
- **"How do I return?"** — unanswered on web (N1).
- **"What changed?"** — a deleted list row vanishes and everything below
  teleports up (§11), so the user's own edit produces no continuity at all.

---

## 6. Animation timing

The system's existing durations are, with one exception, correct and I would not
retune them:

| Token | Value | Verdict |
|---|---|---|
| `springs.slide` | 403ms | ✅ close to the iOS push; critically damped is right for a full-screen slide |
| `springs.zoom` | 429ms | ✅ a large surface travelling far earns it |
| `springs.sheet` | 378ms | ✅ |
| `springs.nav` | 365ms | ✅ *as a press spring* — see F6, it is mis-named |
| `durations.fast` | 160ms | ✅ things leave faster than they arrive |
| `durations.dissolve` | 200ms | ✅ |
| `durations.reduced` | 150ms | ✅ and never zero, which is the whole point |

Recommended additions, using the grid the brief asks for:

- **80ms** — toggle/switch state flip, checkbox fill. Below the threshold where
  the eye reads it as travel; it reads as *response*.
- **120ms** — press-down. Press-up should be slower than press-down (~200ms),
  because releasing is a recovery, not an input.
- **180ms** — swipe-action reveal settle, list-row collapse on delete.
- **250ms** — skeleton → content crossfade.
- **350ms** — full-screen cover entry (mode change deserves to be the longest
  ordinary transition).
- **500ms** — reserved for celebration only (the PR reveal already sits here at
  ~800ms with its confetti, and that is fine — a win is allowed to take its time).

### Finding T1 — the ceiling is guarded for four springs and violated by the app's most-tapped animation

`motion.test.ts:52` asserts nothing exceeds **450ms**. It iterates the four
tokens. It cannot see the six hand-rolled springs.

The Today hub lens (`liquid-seg.tsx:114`) runs `stiffness: 130, damping: 17,
mass: 1`, which is response **0.551 / damping 0.745** — SwiftUI's *default*
spring, confirmed by the web twin's own comment (`liquid-seg.tsx:41`: "SwiftUI
default spring: response 0.55 s, dampingFraction 0.75").

Run through the system's own `springDurationMs`, that settles in **629ms** — 40%
over the ceiling the system sets for itself, on the control users touch most
often, unguarded.

---

## 7. Spring physics

The parameterisation choice (SwiftUI `response`/`dampingFraction` rather than
stiffness/damping) is correct: it is what the native side consumes directly and
it is the vocabulary designers can reason about.

The character targets should be:

| Interaction | Feel | Spring |
|---|---|---|
| Screen travel | **Invisible** | `slide` — critically damped. A full-screen slide that overshoots reads as sloppy. The existing comment says this and is right. |
| Sheets | **Physical** | `sheet` — 0.86 damping, peaks ~0.5% past target. Correct. |
| Shared element / zoom | **Precise** | `zoom` — 0.92. A hero that bounces looks like a toy. |
| Press | **Mechanical, instant** | `nav` (0.32/0.74) — correct physics, wrong name (F6) |
| Selection lens | **Playful** | Deliberately the bounciest thing in the app — but at 0.55 response it is *slow*, not playful. Playful is fast with overshoot. **Retune to response ~0.35 / damping ~0.68**: same bounce, 250ms less of it. |
| Celebration | **Playful, exaggerated** | The PR trophy at `cubic-bezier(.2,1.5,.3,1)` is correct and should not be touched. |

**Momentum and interruption:** the system's justification for springs is that
they can be interrupted and retargeted mid-flight. Nothing in the app currently
exploits that, because no transition is gesture-tracked except the OS-owned
edge-swipe. The springs are correct in principle and are being used as very
good easing curves in practice. Sheet drag-to-dismiss (F1) is what would make the
choice pay off.

---

## 8. Tab bar — **9/10, the strongest area**

Mobile is the system tab bar, so switching is the platform's own instant swap
with the platform's own selection treatment and SF Symbol fill swap. **Apple would
not animate this differently, because this *is* Apple's.** Adopting `NativeTabs`
and deleting the hand-built capsule was the correct and slightly brave call.

Web's pill nav slides content horizontally between siblings via
`screenTransition`. This is the *one* place I would question the shared model:
iOS tab switches are **instant**, not slid. The horizontal slide is a
Material/Android idiom. It works here because the web app has a persistent
sidebar and no system bar to inherit from, and because the order is genuinely
fixed and shown in the bar — but it is a deliberate divergence from the platform
it is imitating, and it means the *same* action feels different on the two
clients.

**Recommendation:** keep the slide on web (it has no system bar to inherit and
the alternative is a hard cut), but document it as a deliberate divergence in
`nav-parity-gap` rather than leaving `screenTransition` implying both clients
slide. Neither client should change; the register should stop claiming they match.

---

## 9. Sheets — **5/10**

### Finding F1 — the grab handle is a lie — **CRITICAL**

Both clients render a 40×4 rounded pill at the top of every sheet
(`mobile/sheet.tsx:95`, `web/sheet.tsx:140`). On iOS that glyph has exactly one
meaning: **drag me.**

Neither client implements a drag. There is no `PanResponder`, no
`react-native-gesture-handler` gesture, no pointer handling on the panel. Search
the mobile Sheet for gesture code and there is none — the file imports
`Animated`, `Easing` and `Modal`, and nothing else.

So the app displays the system's universal "this is draggable" affordance on
every sheet and then does not respond to the gesture it promises. A user fluent
in iOS will try to drag it down — that is the *first* thing they will try — and
the sheet will sit there. That is worse than having no handle at all, because a
sheet with no handle teaches "tap outside"; a sheet with a dead handle teaches
"this app is broken."

This is the single highest-severity item in the document after N1.

**Fix:** a pan gesture on the panel that tracks the finger 1:1 downward, with
rubber-band resistance upward (`1 - e^(-x/d)`, resisting past the top); on
release, project the final position from velocity (`y + v * 0.15`) rather than
displacement, and dismiss if the projection passes 40% of panel height *or*
velocity exceeds ~800pt/s. The scrim opacity and the parent's recede must track
the drag continuously — that is what makes an iOS sheet feel attached to your
finger rather than played at you. The springs are already interruptible, which is
precisely the capability `motion.ts:6–13` says they were chosen for.

### Finding F2 — no detents

Every sheet is one height (`maxHeight: "90%"`). There are no medium/large
detents, no snap points, no expandable sheet. Half the sheets in the app — Quick
Log, Readiness, Follow-a-coach — are short content in a tall panel.

**Fix:** a `detents` prop (`["medium"]`, `["medium","large"]`, `["large"]`), the
panel snapping between them on the sheet spring, with the drag from F1 doing the
snapping. iOS 26's own sheets, and every app the brief benchmarks against
(Wallet, Journal, Freeform), are built on this.

### Finding F3 — the two clients' flagship modal does not run the same curve

`mobile/sheet.tsx:62–67`:
```ts
Animated.timing(slide, {
  duration: springDurationMs(springs.sheet),   // 378ms — the spring's duration
  easing: Easing.out(Easing.cubic),            // …but a cubic, not the spring
})
```

Web runs the exact spring, sampled into a `linear()` easing
(`globals.css`, `--e-sheet`).

So mobile takes the spring's *duration* and applies a completely different curve
to it. `springToRN()` exists for exactly this and is used correctly three files
away (`ui.tsx:93`, `ui.tsx:311`, `percent-program.tsx:368`) — the Sheet just
never adopted it. Meanwhile the file's own header comment claims it mirrors the
web Sheet "so both clients feel identical" (`sheet.tsx:16`). They don't: the
cubic has no overshoot, and `springs.sheet` at 0.86 damping deliberately peaks
0.5% past target. The mobile sheet lands dead; the web sheet lands with the
small settle that makes it feel like an object.

**Fix:** one line — `Animated.spring(slide, { toValue: 1, ...springToRN(springs.sheet), useNativeDriver: true })`.

### Finding F4 — the web sheet unmounts on a timer, not on the transition

`web/sheet.tsx:73`: `setTimeout(() => setMounted(false), 160)` racing a 160ms CSS
transition. If the main thread stalls for even a frame — and it will, because the
sheet's close often coincides with a data refetch — the node is removed while the
panel is still mid-flight and it **snaps**. Use `transitionend` on the panel with
the timeout as a fallback only.

### F5 — the upgrade paywall (mobile) is a sheet wearing a modal

`transparentModal` + `animation: "fade"` (`_layout.tsx:108`) with the component
animating its own panel. It bypasses the shared `Sheet`, so it gets no parent
recede, no scrim coordination, and no reference counting. It should be the shared
Sheet at a `.large` detent.

---

## 10. Cards

| Interaction | Today | Should be |
|---|---|---|
| **Tap** | Nothing on ~94% of cards (§13) | Scale to 0.97 on `springs.nav`, press-down 120ms / press-up 200ms |
| **Expand** | Accordion exists in the plan matrix and is *correct* — sheet spring in, exit curve out, Reduce Motion substitutes | Extend this pattern; it is the house standard |
| **Collapse** | As above | ✅ |
| **Dismiss** | n/a | — |
| **Drag** | `drag-handle.tsx` + `use-drag-reorder.ts` — lifts, haptic on pickup (Medium), selection tick per position change | ✅ **This is genuinely good.** Add a `scale(1.03)` + shadow lift on pickup so the dragged card visibly leaves the plane |
| **Reorder** | Rows swap instantly | ❌ Neighbours should *slide* to make room (§11) |
| **Delete** | Row vanishes, list teleports | ❌ See §11 |

The plan-matrix accordion (`percent-program.tsx:368`, and its web twin's
`0fr→1fr` grid-track transition) is the best non-navigation motion in the app —
it uses the real spring in, the accelerating exit curve out, clips collapsed
content, hides it from assistive tech, and substitutes a dissolve under Reduce
Motion. **Every expand/collapse in the app should be this.** Most aren't.

---

## 11. Lists — **3/10**

Verified: **zero** `LayoutAnimation` calls on mobile. **Zero** layout-transition
handling on web. There is no animated insertion, deletion, sort, filter or
reorder anywhere in the product.

Concretely, today:

- **Delete a set** — `onDelete` fires, the row is gone next render, every row
  below jumps up by its height. The user's own action produces a teleport.
- **Add a set** — appears fully formed, instantly, mid-list.
- **Filter/search** — the list is replaced wholesale.
- **Reorder commit** — rows swap with no travel; only the *dragged* row animated.

**Recommendations:**

| Event | Motion | Duration |
|---|---|---|
| Insert | Height 0→auto + fade in, from the insertion point | 180ms, `--e-sheet` |
| Delete | Row collapses height→0 while fading; neighbours close the gap on the same curve | 180ms, `--e-exit` |
| Reorder commit | Displaced neighbours translate to their new slots | `springs.slide` |
| Filter | Survivors *move* to new positions (FLIP); only genuine leavers fade | 200ms |
| Sort | Same — position is the information, so position must be animated |  |
| Loading more | New page fades in below; **never** move the scroll position |  |

Explicitly **not** recommended: staggered list entrance. The wave-3 note already
cut this ("Material idiom; iOS lists arrive as one unit and staggering delays
content") and that judgement is correct — it should stay cut.

On mobile this is `LayoutAnimation.configureNext` with a spring preset before the
state update, or Reanimated's `Layout` + `FadeIn`/`FadeOut` on the row (Reanimated
4.4 is already a declared dependency). On web it is FLIP with `getBoundingClientRect`
before/after, or `view-transition-name` per row now that the View Transitions
plumbing already exists.

---

## 12. Loading states — **4/10**

Counted: **43** `ActivityIndicator` sites on mobile; **4** `className="skeleton"`
sites on web. The `.skeleton` pulse exists in `globals.css`, is well-written
(`skelPulse`, 1.4s), and is essentially unused. Mobile has no skeleton primitive
at all.

So the two clients have *different loading languages*: web occasionally reserves
space and breathes; mobile spins.

**The principle:** a spinner is correct only when you cannot predict the shape of
what is coming. This app almost always can — a session card, a macro ring, a
chart, a set row. Every one of those should be a skeleton of its own geometry,
not a spinner in the middle of an empty screen.

**Recommendations:**

1. Ship a shared `Skeleton` primitive in both clients driven by the same pulse
   token in core, so the breathing rate can't drift.
2. Skeleton → content is a **250ms crossfade**, not a swap. The skeleton and the
   real content occupy the same box, so nothing reflows.
3. **Delete loading where the transition can hide it.** A push takes 403ms. If
   data lands inside that window the user never sees a loading state at all —
   prefetch on the tap that starts the transition, not on the destination's
   mount. This is the highest-value loading change in the list and it removes UI
   rather than adding it.
4. Spinners survive only for genuinely unbounded, shapeless waits (a sign-in
   round-trip, an AI generation) — and there they should be the system indicator,
   never a custom one.

---

## 13. Microinteractions — **4/10, the worst score in this audit**

### Finding M1 — 94% of taps on mobile produce nothing

```
<Pressable>   479 sites
<PressScale>   31 sites
```

React Native's `Pressable` has **no default feedback** — no ripple, no opacity
dip, nothing. So 448 tap targets in the app are visually silent.

`PressScale` (`ui.tsx:296`) is well-built: scales to 0.97 on `springs.nav`,
substitutes an opacity dip under Reduce Motion, skips the animated opacity when
disabled so a caller's static dim isn't clobbered. It is a correct primitive with
6% adoption.

Web is the same story: `.pressable` on **41** elements against **612** `<button>`s
— 93% of web buttons have no press state.

This is the highest-volume defect in the app. It is not a transition problem; it
is the reason the app can feel *inert* even when the navigation between screens
is beautiful. A user touches a button dozens of times per session and navigates
between screens a handful of times.

**Fix:** codemod. `Pressable` → `PressScale` in `apps/mobile`, `.pressable`
appended to every `<button>` in `apps/web`, with an explicit opt-out for the
handful of cases where the parent already animates (drag handles, swipe rows,
the lens itself). This is mechanical, low-risk, and it is the single change that
would most alter how the app *feels*.

### Per-control recommendations

| Control | Visual | Haptic |
|---|---|---|
| Button | scale 0.97, down 120ms / up 200ms | Impact Light on commit only |
| Toggle / Switch | thumb travels 80ms, track colour crossfades 120ms | **Impact Light** — not selection (see M2) |
| Checkbox | fill scales from centre 120ms, tick draws 80ms | Selection |
| Slider | thumb 1.15× on grab, shadow lifts | Selection **per detent only**, never continuously |
| Stepper | value uses `contentTransition(.numericText())` — digits roll | Selection per step |
| Menu / context menu | scale 0.92→1 + blur-in from the anchor point, 250ms | Impact Medium on open |
| Swipe action | see §14 | Impact Light at reveal threshold |

The stepper/counter case is worth calling out: this is a training app, so numbers
changing *is* the content. `contentTransition(.numericText())` (and its web
equivalent, per-digit `view-transition-name`) makes a weight going 80 → 82.5 roll
rather than swap. That is a small change with an outsized effect on perceived
quality, and it applies to the set logger, the rest timer, every stat tile, and
the macro rings.

---

## 14. Gesture design — **5/10**

### What exists
- iOS edge-swipe back (OS-owned, excellent, correctly disabled where wrong)
- Swipe-to-reveal-delete on set rows (both clients)
- Long-press drag-reorder (mobile, good)
- Pull-to-refresh (`RefreshControl` in history)

### Finding G1 — swipe actions ignore velocity

Mobile (`swipe-row.tsx:30`): `const open = openRef.current ? g.dx < 40 : g.dx < -40;`
Web (`swipe-row.tsx:69`): `const willOpen = open ? dx < 40 : dx < -44;`

Both decide purely on **displacement**. A fast flick that travels 35px snaps
closed — the exact opposite of what the user's hand asked for. iOS projects the
final position from velocity (`x + v * decelerationFactor`) and decides from
*that*.

`PanResponder` already hands you `g.vx`; pointer events give you the deltas to
compute it. This is a small fix with a large effect on whether the app feels like
it is listening.

### Finding G2 — no full-swipe-to-delete

iOS convention: swipe past ~60% of the row width and the action commits without a
second tap, with the action pane expanding to fill as you cross the threshold.
Both implementations clamp (mobile −110, web −120) and require the tap.

### Finding G3 — no resistance past the action width

Travel is linear to a hard clamp. Past the action width there should be
diminishing return (rubber-banding), which is what tells the finger it has
reached the end without a wall.

### Finding G4 — no haptic on swipe reveal or delete

The reveal crossing its threshold is a textbook detent and should tick (Impact
Light). Committing a destructive delete should be Notification Warning — this is
the one place in the app where a heavier haptic is *earned*.

### Finding G5 — the swipe rows are declared twins and share no numbers

| | Mobile | Web |
|---|---|---|
| Open position | −76 | −84 |
| Threshold | −40 | −44 |
| Clamp | −110 | −120 |
| Settle | `Animated.spring(bounciness: 0, speed: 20)` | `transform .2s ease` |

Four numeric drifts and two entirely different physics models in a component
whose header comment calls it "the web twin of the mobile SwipeRow." The
geometry belongs in core; the settle belongs to `springs.slide`.

### Missing gestures
- **Sheet drag-to-dismiss** (F1)
- **Pinch** — nowhere, and the charts want it
- **Interactive back on web** (N2)

---

## 15. Haptics — **6/10**

17 call sites. The workout ones are genuinely well-chosen — rest target reached,
set banked, drag picked up, reorder committed, pause toggled, timer finished are
all real detents, and firing on those and nothing else is the right instinct.

### Finding H1 — 4 of 17 sites ignore the user's setting

`prefs.haptics` exists (`packages/core/src/logger-prefs.ts:23`, default `true`)
and is surfaced in Settings with copy in three languages. These fire regardless:

- `aurora/liquid-seg.tsx:154` — the hub segmented control
- `aurora/volume.tsx:216` — landmark zone pick
- `aurora/volume.tsx:230` — block change
- `aurora/volume.tsx:458` — the `Toggle` pill

The wave-3 capability note states all sites are "user-gated by prefs.haptics."
That is **stale** — it was true when written, and `volume.tsx` grew three
ungated sites afterwards. The register needs correcting along with the code.

### Finding H2 — wrong flavour on switches

`volume.tsx:458` is a switch (`accessibilityRole: "switch"`) firing
`selectionAsync`. iOS uses **Impact Light** for a switch and reserves selection
feedback for scrolling through discrete values (a picker, a segmented control).
The segmented control at `liquid-seg.tsx:154` has it right; the switch doesn't.

### Finding H3 — web vibrates with no setting at all

`apps/web/components/aurora/logger.tsx:198, 269, 693` call `navigator.vibrate`
ungated. Mobile has a preference; web has the behaviour and no preference. Both
directions of the parity rule are broken by the same three lines.

### The map

| Feedback | Where it belongs |
|---|---|
| **Selection** | Segmented control, picker/stepper detents, drag-reorder crossing a slot |
| **Impact Light** | Button commit, switch flip, swipe reveal crossing threshold, sheet snapping to a detent |
| **Impact Medium** | Drag pickup (✅ already correct), context menu open, sheet dismissed by gesture |
| **Impact Heavy** | The rest timer hitting zero (✅ already correct at `workout.tsx:1850`) — and nowhere else |
| **Rigid** | A hard stop: rubber-band hitting its limit, a value clamped at max |
| **Soft** | A set banked — a soft landing, not a click |
| **Success** | PR achieved (✅), workout finished (✅) |
| **Warning** | Destructive confirm, delete committed (G4) |
| **Error** | Save failed, sync failed — **currently fires nowhere**, which is a gap: a silent failure on a phone is a failure the user doesn't notice |

---

## 16. Visual continuity — where things pop, flash and teleport

Every one of these is verified in code, ordered by how often a user hits it:

1. **Any tap, anywhere** — no press state, so touch produces nothing (M1)
2. **List row deleted** — vanishes; the list below teleports (§11)
3. **Card → screen** — hard cut; the object you touched is gone (§3)
4. **Skeleton → content** — swap, not crossfade (§12)
5. **Spinner → content** — the spinner is replaced by a fully-formed screen (§12)
6. **Reorder commit** — neighbours jump to new positions (§11)
7. **Filter applied** — list replaced wholesale (§11)
8. **Sheet close (web) under load** — the 160ms timer beats the transition (F4)
9. **Numbers changing** — every stat swaps rather than rolls (§13)
10. **Tab bar appearing/disappearing** on mobile push — system-owned and correct,
    but it means the web twin (persistent bar) has no equivalent moment (N5)
11. **Empty → populated** — first data arrival replaces the empty state instantly

---

## 17. State changes

| Transition | Recommended |
|---|---|
| Empty → populated | Empty state fades out 160ms; content fades **in place** 200ms with no positional move — the container is the constant |
| Collapsed → expanded | The plan-matrix accordion, everywhere (§10) |
| Editing on | Field lifts (shadow + 1px), siblings dim to 0.6, 180ms — editing is a mode |
| Saving | The commit button's label crossfades to a progress state **in place**; the button never resizes, or the layout shifts under the finger |
| Saved | Label crossfades to a tick, holds 800ms, returns. Notification Success |
| Deleting | Row collapses (§11) + Notification Warning |
| Completed | The existing PR reveal is excellent and should be the template |
| Error | Field shakes ±4px, 3 cycles, 250ms total; message expands below on the sheet spring; Notification Error. **Never a layout jump** |
| Offline | A persistent bar slides down from the top on `springs.sheet` and *stays*; content shifts down rather than being covered — an offline state is a condition, not a notification |
| Loading | §12 |

---

## 18. Spatial design — **6/10**

Ask the test question: *can a user build a mental map of where things live?*

**Partly.** The five tabs sit left-to-right in a fixed order and moving between
them travels in that order, which is a real and learnable spatial claim. Sheets
come from the bottom and the parent visibly stays behind them. Back is the exact
inverse of forward. Those three facts do most of the work.

What breaks the map:

- **Everything that isn't a tab arrives from the right**, whether it is deeper in
  the hierarchy (session detail) or a detour (Settings, editors). The app has one
  spatial gesture for two different relationships (N3).
- **Objects don't persist across the boundary** (§3), so the map has rooms but no
  doors — you don't see yourself carry anything through.
- **On web there is no way back out**, which is not a weak map; it is no map (N1).
- The two clients disagree about whether detail screens are inside the tab (N5).

Fix N3 and §3 and the model becomes: *tabs are rooms side by side; detail slides
in from the right and the thing you touched travels with you; tasks rise from the
bottom and you push them back down.* That is a complete, teachable spatial
grammar, and the app is roughly two changes away from it.

---

## 19. Comparison to Apple's own apps

| App | What it does | HYBRID |
|---|---|---|
| **Fitness** | Rings morph from summary into detail; the ring *is* the same object | Charts and rings hard-cut. Closest available win (§3) |
| **Photos** | Zoom transition, fully interactive — you can drag a photo back mid-open | One shared element, non-interactive |
| **Music** | Mini-player expands into the full player via matched geometry | The session accessory is correctly in the system slot but does **not** expand — it navigates. Highest-value single opportunity in the app |
| **Health** | Charts expand in place; axes persist while the frame grows | Full re-render |
| **Wallet** | Cards fan, lift and flip with real physics | n/a |
| **Journal** | Sheet detents, drag-to-dismiss, entries that morph | Sheets have neither (F1, F2) |
| **Freeform** | Direct manipulation everywhere; nothing is "played at" you | Only the masthead compression and drag-reorder qualify |
| **iOS system** | Every tap responds | 94% don't (M1) |

The masthead compression deserves singling out as the place the app *already*
matches Apple: it is driven continuously off scroll offset via a registered CSS
custom property, with no React re-render, and it is deliberately **not** suppressed
under Reduce Motion because it is direct manipulation rather than animation —
exactly as iOS keeps large titles collapsing. That reasoning is Apple's, arrived
at correctly and independently.

---

## 20. Brutal review

### The worst transitions

1. Browser Back exits the app (web) — N1
2. Sheet grab handle that responds to no gesture — F1
3. Every list deletion teleports the rows below — §11
4. 448 mobile tap targets with no press feedback — M1
5. 571 web buttons with no press state — M1
6. Session card → session detail, hard cut — §3
7. Plan cover → plan, hard cut — §3
8. Mobile sheet running a cubic where web runs the spring — F3
9. The hub lens at 629ms, 40% over the system's own ceiling — T1
10. Settings pushing like a drill-down — N3
11. Editors pushing like drill-downs — N3
12. Web sheet unmount racing its own transition — F4
13. Swipe actions ignoring flick velocity — G1
14. Reorder commit with no neighbour travel — §11
15. Spinner → fully-formed screen, 43 sites — §12
16. Skeleton → content as a swap — §12
17. Numbers swapping instead of rolling — §13
18. No full-swipe-to-delete — G2
19. Upgrade paywall bypassing the shared sheet — F5
20. Filter/search replacing the list wholesale — §11

### The most confusing navigation decisions

1. Back exits the app (web) — N1
2. Push and modal are visually identical on mobile — N3
3. The recede-push is defined in shared tokens and performed by one client — N4
4. Detail screens are inside the tab on mobile, outside it on web — N5
5. The tab-switch motion differs between clients (slide vs instant) — §8
6. The search slot beside the tab bar is reserved and empty — §4
7. `springs.nav` is named for a deleted component — F6
8. Two swipe-row implementations with four different constants — G5
9. Web vibrates with no setting; mobile has a setting — H3
10. Sheets are all one height regardless of content — F2
11. Entering the live logger looks like opening Settings — §2
12. No full-screen-cover vocabulary at all — §2
13. The exercise hero is the only object that survives a navigation — §3
14. Six hand-rolled springs alongside a four-token system — F7
15. Haptics fire against the user's explicit preference in 4 places — H1
16. Selection haptic on a switch where iOS uses impact — H2
17. Error haptics fire nowhere in the app — §15
18. Two loading languages across clients — §12
19. `durations.fast` doing duty as both push-exit and sheet-exit
20. The capabilities register describing a haptics state that no longer holds — H1

### The biggest opportunities for delight

1. **Session accessory → full logger, matched geometry.** The Apple Music
   mini-player moment. The system slot is already correct; it just needs to
   expand rather than navigate.
2. Session card → detail, with the headline figure travelling
3. Plan cover → plan detail, full hero geometry
4. Sheet drag-to-dismiss with the scrim and recede tracking the finger
5. Sheet detents that snap with an Impact Light
6. `numericText`-style digit rolls on every weight, rep and timer
7. PR badge flying from the set row into the Done summary (wave-3 item 4 — the
   keyframes already exist, only the handoff is missing)
8. Chart expansion where the axes persist and the frame grows
9. Press feedback on everything (M1) — the highest-volume delight in the app
10. Full-swipe-to-delete with the action pane expanding to fill
11. Live-logger entry as a full-screen cover with a focus blur (wave-3 item 3)
12. Rest timer as a Live Activity (already planned)
13. Coach avatar → coach page
14. List insert/delete with real height animation
15. Interactive back on web, interruptible mid-drag
16. Pull-to-refresh that reveals rather than spins
17. Streak/flame count rolling on increment
18. Readiness face morphing between states rather than swapping
19. Calendar day → day detail with the cell as the source frame
20. The nav lens → FAB merge (wave-3 item 2, blocked on `@expo/ui`)

---

## 21. Redesign specifications — the top items

### R1 · Browser history (web)

**Current** — `setScreen` mutates `useState`; Back exits the app.
**Problem** — the primary navigation control on the primary client is destructive.
**Solution** — `setScreen` pushes `history.pushState({screen}, "", url)`; a
`popstate` listener calls the transitioning setter with `back = true` so
`screenTransition` yields the exact inverse. Deep links already round-trip
through `onDeepLinkChange`, so the URL vocabulary exists.
**Motion** — unchanged; this makes the *existing* pop reachable.
**Haptics** — none (web).
**Emotional response** — the app stops being a trap.

### R2 · Sheet drag-to-dismiss

**Current** — a grab handle with no gesture.
**Problem** — the app displays iOS's universal "drag me" glyph and ignores the drag.
**Solution** — pan on the panel, 1:1 downward, rubber-banded upward
(`resistance = 1 - e^(-x/200)`). Scrim opacity interpolates
`motion.scrimWithRecede → 0` across the drag; the parent's recede interpolates
`0.92 → 1.0` on the same input, so the whole stack is attached to the finger. On
release, project `y + vy * 0.15`; dismiss if the projection passes 40% of panel
height or `|vy| > 800`, otherwise spring home.
**Animation** — `springs.sheet` (0.38 / 0.86) for both the snap-home and the
dismiss; the spring is interruptible, which is the entire reason `motion.ts`
chose springs.
**Duration** — physics, not authored (~378ms nominal).
**Haptics** — Impact Light on dismiss commit; none while dragging.
**Reduce Motion** — the gesture stays (direct manipulation is not animation); only
the *un-dragged* entrance substitutes a dissolve, as today.
**Emotional response** — the sheet stops being a picture and becomes an object.

### R3 · Press feedback everywhere

**Current** — `PressScale` 31 / `Pressable` 479; `.pressable` 41 / `<button>` 612.
**Problem** — the app is inert under the finger.
**Solution** — mechanical sweep, with opt-outs for parents that already animate.
**Animation** — scale 0.97, opacity 0.9. **Down 120ms, up 200ms** — release is a
recovery, not an input, and should be gentler than the press.
**Spring** — `springs.nav` (0.32 / 0.74) — correct physics, and this sweep is the
moment to rename it `springs.press` (F6).
**Haptics** — Impact Light on *commit only*, never on press-down.
**Reduce Motion** — opacity dip substitutes, already implemented.
**Emotional response** — the app starts answering.

### R4 · Session card → session detail

**Current** — hard cut.
**Solution** — `SHARED_ELEMENTS.sessionHero`; the card's headline figure is armed
at tap time and declared statically on the detail hero. The screen behind
cross-dissolves — `use-screen-transition.ts:88` already enforces this when a pair
is armed, so no new rule is needed.
**Animation** — `springs.zoom` (0.46 / 0.92), 429ms; content dissolves over
`durations.dissolve`.
**Matched geometry** — position, size, font-size on the figure.
**Haptics** — none. A navigation is not a detent.
**Emotional response** — you carried the thing you touched into the room.

### R5 · Mobile sheet on the real spring

**Current** — `Easing.out(Easing.cubic)` at the spring's duration (F3).
**Solution** — `Animated.spring(slide, { toValue: 1, ...springToRN(springs.sheet), useNativeDriver: true })`.
One line. The clients become identical, which is what the file already claims.

### R6 · List mutations

**Current** — instant, everywhere.
**Solution** — Reanimated `Layout` + `FadeIn`/`FadeOut` on rows (mobile; the
dependency is already declared), FLIP or per-row `view-transition-name` on web.
**Duration** — 180ms insert/delete, `springs.slide` for displacement.
**Haptics** — Notification Warning on destructive commit.
**Emotional response** — your edit had consequences you could watch.

### R7 · The accessory → logger expansion

**Current** — the accessory navigates.
**Solution** — matched geometry from the accessory's bounds to the logger's
header; the accessory's title and elapsed time are the persisting elements.
**Animation** — `springs.zoom`; the tab bar recedes as the cover rises.
**Haptics** — Impact Medium on expand.
**Emotional response** — the Music-player moment, and the most Apple thing this
app could ship.

### R8 · Retune the lens

**Current** — response 0.551 / damping 0.745 → **629ms** (T1).
**Solution** — `springs.lens = { response: 0.35, dampingFraction: 0.68 }` → ~390ms,
under the ceiling, *more* overshoot than today. Add it to the token set so
`motion.test.ts` guards it, and have both `liquid-seg` implementations read it.
**Emotional response** — the same playfulness, 240ms sooner.

### R9 · Swipe-row rewrite (both clients)

Geometry constants into core; velocity projection on release (G1); rubber-band
past the action width (G3); full-swipe commit at 60% with the pane expanding
(G2); Impact Light at the reveal threshold and Notification Warning on delete
(G4); settle on `springs.slide` on both clients (G5).

### R10 · Haptic correctness

Gate the four ungated sites on `prefs.haptics` (H1); switch → Impact Light (H2);
give web a preference and read it before `navigator.vibrate` (H3); add
Notification Error to the save/sync failure paths.

---

## Final verdict

| Dimension | Score | One-line reason |
|---|---|---|
| **Navigation** | **6/10** | Best-in-class hierarchy model; Back exits the app on web |
| **Motion** | **8/10** | The token system is genuinely excellent; six components ignore it |
| **Continuity** | **5/10** | One shared element; lists teleport; deletes pop |
| **Delight** | **5/10** | The PR reveal is superb and nearly alone |
| **Context preservation** | **6/10** | Sheet recede is exemplary; objects don't survive navigation |
| **Microinteractions** | **4/10** | 93–94% of taps produce no feedback |
| **Premium feel** | **7/10** | Native tab bar, Liquid Glass, real springs — undercut by inert touch |
| **Apple quality** | **6/10** | The thinking is Apple-tier; the coverage is not |
| **Overall motion system** | **6.5/10** | A 9/10 system with 5/10 adoption |

**Does this motion system feel invisible?**
Between screens, yes — the transitions carry meaning without announcing
themselves, and that is the hardest part to get right. Under the finger, no:
invisible motion is motion you'd miss if it vanished, and 94% of taps have
nothing to miss.

**Does it reduce cognitive load?**
Between tabs and into detail, genuinely yes. It increases load in three places:
web users cannot form a model of how to go back; mobile users cannot tell a
detour from a drill-down; and nobody can tell which object they opened.

**Does every animation communicate meaning?**
Almost. Every *screen* transition does — direction encodes hierarchy, back
inverts forward, unrelated leaves refuse to invent a direction. The exceptions
are the six ad-hoc springs, which communicate only that someone tuned them by
hand on a different afternoon.

**Would Apple ship these interactions?**
Apple would ship the motion tokens, the hierarchy model, the sheet recede, the
masthead compression, the native tab-bar adoption and the Reduce Motion
substitution philosophy — several of those are better than what ships in Apple's
own second-tier apps. Apple would **not** ship a grab handle that ignores a
drag, a Back button that exits the app, or a thousand tap targets that don't
respond. Those aren't taste disagreements; they're the platform's contract with
the user.

---

## The five highest-impact changes

1. **Browser history on web** (R1). Not the prettiest change — the one without
   which nothing else matters. ~30 lines; unblocks interruptible back.
2. **Press feedback everywhere** (R3). Mechanical, low-risk, and it changes how
   the app feels on *every single interaction* rather than the handful per session
   that are navigations. Highest ratio of felt-quality to effort in the codebase.
3. **Sheet drag-to-dismiss + detents** (R2, F2). Removes the app's most
   conspicuous broken promise and finally cashes in the interruptibility the
   spring system was chosen for.
4. **Shared elements on the top four card→screen pairs** (R4, §3). The mechanism
   is built, generic and tested. It has one participant. Giving it four more is
   the difference between "the app animates" and "the app has continuity."
5. **List mutation animation** (R6). Every delete, insert and reorder currently
   teleports — these are the moments a user *caused*, and they're the ones with
   no motion at all.

Do those five and the scores move to roughly: Navigation 8, Continuity 8,
Microinteractions 8, Apple Quality 8. Nothing in the list requires a new idea —
each one finishes something this codebase already started and already argued for
correctly in its own comments.
