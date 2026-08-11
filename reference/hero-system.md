# THE HERO SYSTEM

**One screen head for the whole app.** Geometry, motion, navigation and type,
specified once and shared by web, React Native and the SwiftUI-native kit.

- Source of truth: `packages/core/src/hero.ts` (+ `hero.test.ts`)
- Clients: `apps/mobile/components/aurora/hero.tsx`, `apps/web/components/aurora/hero.tsx`
- Native kit: `apps/mobile/components/aurora/swiftui.tsx` (capability `swiftui-kit`)

---

## 0. The diagnosis

Three shipped screens, side by side:

| | History | Wrapped (Swimming) | Plan / Goal (Olympic Weightlifting) |
|---|---|---|---|
| back button | 44×44, radius 14, hairline border, no fill | 40×40, radius 12, black-40% fill | 38×38, **circle**, white-12% fill |
| its y | in content flow, **scrolls away** | `safeTop + 6`, fixed | `safeTop + 4`, in a collapsing bar |
| title size | 26 | **40** (off the type ladder) | 31 |
| title position | **on the same row as the button** | under a gold eyebrow | bottom of a 252dp cover |
| "what kind" label | bordered pill toggle ("Archived") | gold mono kicker ("✦ YOUR WORKOUT, WRAPPED") | filled white chip ("STRENGTH") |
| ground | ambient field | near-black + glows | accent wash + emblem |
| collapse | none | none | 1:1 with scroll, snaps |
| status bar | theme | light | light |

Nothing there is wrong on its own screen. Together they are three products.

**Why each inconsistency costs something real:**

- **Back button geometry (3 sizes, 3 radii, 3 materials).** This is the loudest
  one, because back is the only control a user reaches for *without looking*.
  Three geometries means the thumb re-acquires the target on every push.
- **Back button y (3 positions, one of which scrolls away).** On History, "back"
  exists only at the top of the page — scroll down and the way out is gone.
- **Title size (26 / 31 / 40, one of them off the shared ladder).** Type size is
  how the eye ranks a screen. Three unrelated sizes means rank is unreadable:
  Wrapped's 40 says "more important than a plan", which is not true.
- **Title on the rail row (History).** A two-line History title would push the
  segmented control down — layout that depends on string length.
- **Three names for "what kind of thing this is".** A chip, a kicker and a
  toggle are three visual languages for one semantic slot.
- **Hero height (none / full-screen / 252).** Nothing establishes how deep the
  screen sits in the hierarchy.
- **Gutters (16 / 24 / 18–20).** Titles on adjacent screens don't share an
  optical left edge, so pushing feels like a jump-cut.
- **Materials (border-only / black-40% / white-12%).** Three answers to "what
  floats over content", none of them the platform's.
- **Motion (none / none / collapse+snap).** Two of three screens have no
  relationship between scrolling and the head, so scrolling means different
  things on different screens.
- **Toolbar placement.** History puts its one action in the title row, the plan
  puts its label in the bar, Wrapped has none. There is no "where actions live".
- **Safe area.** Three different reconstructions of `insets.top + n`.

---

## Part 1 — Taxonomy

**Three ranks, and they are the same object at different rest states.**

| rank | what it is | used by |
|---|---|---|
| `bar` | the rail alone | settings sub-pages, pickers, editors, sheets |
| `title` | the large-title hero | History, Statistics, Analytics, Profile, enrolled Plans |
| `cover` | the art hero | Goal, Plan, Recipe, Exercise, Workout |

`bar` **is** `title` at collapse = 1. `title` **is** `cover` with its art
removed. That is the whole system: one container, one collapse track, one rail,
one nav button, one title that scales along the track, one metadata language.

**A fourth type ("Immersive") was considered and rejected as a rank.** Wrapped is
not a bigger hero — it is a different *mode*. It keeps every anatomy rule and
changes exactly two things, both of which follow from having no scroll-to-
collapse: the rail is fixed, and the nav button dismisses instead of pops. That
is `mode: "takeover"`, not a rank. Encoding it as a mode is what keeps the
taxonomy at three, which was the goal — the smallest system that covers every
screen.

```ts
type HeroRank = "bar" | "title" | "cover";
type HeroMode = "page" | "takeover";
```

---

## Part 2 — Shared anatomy

Every number below is exported from `HERO` in core. Nothing on a hero is
arbitrary; if a screen needs a number that isn't here, it has the wrong rank.

| | value | why |
|---|---|---|
| safe area | hero reserves `safeTop`; content starts below the full hero | one `heroGeometry()`, never a hand-rolled `insets.top + n` |
| rail | 44pt tall, `safeTop + 4` from the top | **the system's spatial constant** |
| collapsed bar | `safeTop + 56` (= 4 + 44 + 8) | every rank collapses to the same bar |
| hero height | bar 56 · title 132 · cover 252 (below `safeTop`) | title = rail + 8 + title(32) + meta(16) + 12 |
| screen gutter | 16 | matches both clients' existing page gutter |
| hero gutter | 18 | a 34/900 display title needs 2pt more to *optically* align with 16pt body text below it |
| nav button | 40pt visual, 44pt hit, radius 999 | Part 3 |
| title anchor | **bottom** | a 1-line and a 2-line title share a last baseline |
| corner radii | hero is square-topped (it runs under the status bar); chip 999; sheet-presented hero 28 | |
| spacing grid | eyebrow → title 10, title → meta 8, display block → hero bottom 18 | |
| blur | only where something floats over content: the nav button's glass, the docked sub-rail | never as decoration |
| status bar | always light content — every ground is dark | |
| hairline | the collapsed bar's bottom edge, white @ 16%, fades in from p = 0.5 | |

---

## Part 3 — The back button

**One control. One geometry. One position. Forever.**

- **Shape: circle.** Three reasons, in order. (1) It has to float over arbitrary
  art on `cover` and over nothing on `title`; a circle is the only shape that
  reads as an *object* rather than as a small card. History's radius-14 square
  reads as a tile — it competes with the app's own card language. (2) Apple's
  art-backed surfaces (Photos, the Music player, the App Store Today card) all
  use a circular glass button; the app should feel like it ships alongside them.
  (3) A circle is scale-invariant, so it survives Dynamic Type growth without a
  radius that has to be re-tuned.
- **Size:** 40pt visual inside a 44pt hit target (Apple's minimum). The extra
  2pt per side is negative margin, so the *visual* edge still lines up with the
  16pt gutter.
- **Position:** the rail's leading edge, `safeTop + 4`, in **every** rank and
  mode. It never moves between screens.
- **Does it float or attach?** It **attaches to the hero and counter-translates**
  — the hero frame slides up 1:1 with scroll while the rail translates down by
  exactly the same amount. Net on-screen movement: zero. So it is *visually*
  floating and *structurally* part of the hero, which is why it can never scroll
  away (History's bug) and never needs a second fixed-position copy (Wrapped's).
- **Material — the one thing that varies, and it varies with what is *behind*
  it, never with which screen it is on:**
  - over the plain field → `clear`: no fill, chalk glyph. A chip floating on an
    empty page is noise.
  - over art, or once content has scrolled under the rail → `glass`: **Liquid
    Glass** (`.glassEffect(.regular, in: .circle)`) where the platform has it;
    white-12% + `blur(14px) saturate(1.4)` as the fallback. Hairline at 18%.
  - The change is a cross-fade of fill and border on the *same circle* — the
    shape is never in motion.
- **Pressed:** 0.94 scale + fill to 20%, the app's existing `PressScale` /
  `.pressable`. **Hover (iPad / pointer):** fill to 18%, no scale.
- **Glyph:** `chevron.backward` on a page, `chevron.down` on a takeover — a
  takeover has no stack under it, and pretending otherwise is a lie about where
  the user is.
- **Accessibility:** the label names the **origin**, not the action — `"←
  Olympic Weightlifting"`, never `"Back"`. Under Accessibility Sizes the circle
  grows with the hit target; the glyph scales, the geometry does not change.

```ts
heroNavMaterial(backdrop, barred) // "clear" | "glass"
heroNavAction(mode)               // { role, glyph }
```

---

## Part 4 — Titles

One ramp, off the app's existing shared ladder (`fs`). No hero invents a size.

| context | size | line | tracking | max lines |
|---|---|---|---|---|
| `cover` / takeover display | `fs.hero` 34 | 36 | −0.03em | 2 |
| `title` display | `fs.display` 26 | 32 | −0.02em | 2 |
| collapsed inline (every rank) | `fs.subtitle` 16 | 20 | −0.01em | 1 |
| the takeover's one figure | 76 | 78 | −0.04em | 1 |

**Rules**

- **Do titles scale?** Yes, with Dynamic Type — but the *layout decision* is made
  on the unscaled string, so a user at 200% gets bigger type, not a different
  screen.
- **Do they collapse?** Yes: the display title fades out by p = 0.5 and the
  inline title fades in from p = 0.62. The gap is deliberate — the two are never
  on screen together, because that reads as a duplicate, not a transition.
- **Do they morph?** Between screens, yes (Part 7). Within one hero's collapse,
  no: a 34 → 16 scale of a real text node is where cross-platform type rendering
  falls apart. Two nodes, cross-faded, is cheaper and cleaner.
- **Do they move?** Only with the frame. The title block is **bottom-anchored**,
  so a one-line and a two-line title share the same last baseline and a long
  title grows *upward* into the art. Nothing below the hero ever moves because a
  name got longer. (This is exactly what History's title-on-the-rail-row breaks.)
- **Very long titles** step **down** one rung (34 → 28, 26 → 22) and take two
  lines. They never run to three lines, and they never ellipsize at rank scale —
  both make a masthead look broken.

```ts
heroTitleType(title, rank, dynamicTypeScale) // { size, lineHeight, tracking, maxLines }
```

---

## Part 5 — Metadata

Every non-title string on a hero is one of exactly **three** things.

| slot | position | content | example |
|---|---|---|---|
| `eyebrow` | one line **above** the title | what KIND of thing this is | `STRENGTH`, `✦ YOUR WORKOUT, WRAPPED` |
| `meta` | one line **below** the title | facts about this instance | `8 WEEKS – 4 DAYS/WK` |
| `accessory` | the rail's **trailing** slot | one label, or one control | `1 PLAN`, `ARCHIVED` |

**One type style for all three, in every rank:** mono, uppercase, 11pt,
+0.08em tracking, `dim` (82%) foreground. So metadata reads as a single voice,
not as a chip *plus* a kicker *plus* a pill.

- **Tone:** the eyebrow is tinted text by default. The accent-tinted white
  **chip** (`solid`) is reachable only over `art`, and only because an 11pt mono
  line has no contrast substrate there. Tone follows *contrast need*, never
  screen identity — which is how the plan cover ended up with a chip nobody else
  had.
- **Alignment:** eyebrow and meta are flush with the hero gutter (18). The
  accessory is flush right with the screen gutter (16). Never centred.
- **The accessory never repeats a fact the meta line carries.**
- **Joining:** `heroMetaLine()` joins with a spaced en dash `–`. Never a middot.

---

## Part 6 — Backgrounds

Four grounds, and **the rank picks the ground** — a screen cannot choose one.
`heroBackdrop(rank, mode, hasArt)` *is* the rule; wanting a different ground
means changing what the screen *is*.

| ground | recipe | allowed on |
|---|---|---|
| `field` | the app's ambient Aurora wash | `bar`, `title` — **required** |
| `wash` | duotone accent over `#0c0d0c` + radial hotspot | `cover` without a mark |
| `art` | `wash` + the subject's mark (ghost glyph, or full-colour) | `cover` with a mark |
| `story` | `#0a0b09` + two soft accent glows | `takeover` only |

**Forbidden, and unreachable through the API:**

- art or an accent wash behind a `title` hero — a collection has no portrait, and
  an accent wash on an information page makes it look like a product page;
- the ambient field behind a `cover` — a cover is a printed object with its own
  ink; the page's wash must not show through it;
- two washes stacked; a mesh gradient (it dates instantly and costs a frame);
- a photograph anywhere (there is no photography in this product, so one photo
  would become the app's loudest element by default);
- a wash whose light source disagrees with the level.

**Light source encodes hierarchy.** A *container* (goal, category, library) is lit
from the top-**left**; the *things inside it* from the top-**right**. So two
levels of one stack can never read as the same cover. `heroLight(level)`.

**Full-colour art must be gone by p = 0.77** (it smears behind the bar title);
a monochrome ghost survives to 40% as bar texture.

---

## Part 7 — Motion

**Every hero-to-hero move is one of exactly three transitions**, and all three
obey one law: **the rail is the fixed point.** The nav button does not animate,
does not fade, does not move. It is the same object in both screens.

| transition | when | what morphs |
|---|---|---|
| `lift` | a card becomes an identity page (History → Workout, Plans → Plan, Exercises → Exercise) | the card's **title** flies to the hero title (`matchedGeometryEffect`); the card's **accent** expands into the hero wash. Meta, art and eyebrow cross-fade. |
| `deepen` | same subject, more detail (Workout → Exercise → Analytics) | **nothing flies** — nothing changed identity. The title cross-fades in place on a shared baseline; the accent is inherited unchanged. |
| `raise` | a page becomes a takeover (Workout → Wrapped) | the page's title **rises** to the takeover's title position, the ground darkens under it, and the nav glyph cross-fades `chevron.backward → chevron.down` **in place**. The reverse lowers. |

There is no fourth. **If a move doesn't fit one of these, the destination has the
wrong rank** — that is the diagnostic, not a licence for a new transition.

**Collapse itself is not an animation.** It tracks the finger 1:1 off one scroll
value, so it is *not* suppressed under Reduce Motion — this is direct
manipulation, the same stance as the platform's own large-title compression.
Only the released-mid-track settle degrades (to an instant jump). A settle that
lands on a detent may fire selection feedback.

**Nothing teleports.** Every layer either counter-translates (rail), drifts
(art, at 0.55× the track for a poster and 0.66× for an emblem), fades on a
declared ramp, or is carried by the frame.

```ts
heroTransition(from, to)   // "lift" | "deepen" | "raise"
HERO_CHOREOGRAPHY[t]       // { fixed, morph, fade }
heroLayers(p, geom, opts)  // every layer's opacity + translate at collapse p
```

---

## Part 8 — SwiftUI architecture

Composition, not configuration. Prefer native APIs; no custom animation engine.

```swift
HeroContainer(rank: .cover, mode: .page) {          // owns safe area + the track
    HeroBackground(.art(accent: goal.accent, mark: goal.glyph, level: .container))
    HeroRail {                                       // the spatial constant
        HeroNavigationButton(from: "Olympic Weightlifting")
        Spacer()
        HeroAccessory("1 PLAN")
    }
    HeroContent {                                    // bottom-anchored
        HeroEyebrow("STRENGTH", tone: .solid)
        HeroTitle(plan.name)
        HeroMetadata(["8 WEEKS", "4 DAYS/WK"])
    }
} content: {
    PlanBody(plan)                                   // ordinary scrollable content
} dock: {
    EnrollButton(plan)
}
```

| component | responsibility | native API it leans on |
|---|---|---|
| `HeroContainer` | safe area, the 0→1 track, the pinned overlay, scroll clearance | `ScrollView` + `onScrollGeometryChange`, `safeAreaInset` |
| `HeroBackground` | the one legal ground for the rank | `LinearGradient`, `RadialGradient`, `.visualEffect` for parallax |
| `HeroRail` | the 44pt row at `safeTop + 4`; counter-translates | `.toolbar(.hidden)` + own layout — the system bar can't host a bottom-anchored title |
| `HeroNavigationButton` | the one control | `.glassEffect(.regular, in: .circle)`, `.buttonStyle(.plain)` |
| `HeroTitle` | the ramp, the 2-line cap, the bottom baseline | `Text` + `.minimumScaleFactor`, `@ScaledMetric` |
| `HeroMetadata` / `HeroEyebrow` / `HeroAccessory` | the three metadata slots, one style | `Text` + `.monospaced()` |
| `HeroContent` | bottom-anchored display block | `VStack(alignment: .leading)` in a `.bottom` overlay |
| `HeroToolbar` | the trailing slot's controls | `ToolbarItem(placement: .topBarTrailing)` when the rail is a real toolbar |
| `HeroTransition` | `lift` / `deepen` / `raise` | `NavigationTransition.zoom(sourceID:in:)`, `matchedGeometryEffect`, `contentTransition(.numericText)` for the takeover figure |

**Deliberately NOT used**

- `phaseAnimator` / `keyframeAnimator` for the collapse — the collapse is
  finger-driven, not time-driven. Both are the wrong tool and would fight the
  gesture.
- A custom `Animatable` height. Height animation causes relayout every frame;
  transform + opacity off one published number does not.
- `.navigationTitle` for the display title — it cannot bottom-anchor and cannot
  host an eyebrow. The *inline* title, however, is exactly `.inline` behaviour,
  which is why it looks like the platform's.

The RN and web clients render different primitives but read the **same numbers**
from `packages/core/src/hero.ts`, so a threshold can only be changed for all
three at once.

---

## Part 9 — Spatial rules

Every screen must answer these four **from a still frame**, with no animation
playing (`HERO_SPATIAL_CHECKLIST`):

1. **Where did I come from?** → the nav button's label names the origin.
2. **Where am I?** → the title, already at the baseline it will keep while I
   scroll.
3. **What changed?** → the rank (a level change) and the accent (a subject
   change).
4. **What stayed the same?** → the rail. Always. That is the whole trick.

If a transition loses continuity on any of the four, the destination's rank is
wrong. Fix the rank, not the animation.

---

## Part 10 — Rules, in one place

**Immersive vs information pages.** The distinction is not "how nice does it
look" — it is *what is the subject*:

- The subject is **a collection** (many things, no name of its own) → `title`
  rank, `field` ground, no art, no accent. History, Statistics, Analytics.
- The subject is **one nameable thing with an accent and a mark** → `cover` rank,
  `wash`/`art` ground. Goal, Plan, Recipe, Exercise, Workout.
- The subject is **a moment, presented over the stack, with nothing to navigate**
  → `takeover` mode. Wrapped, and nothing else today.

**Back navigation.** Every pushed screen has the nav button. Every takeover has
it as a dismiss. A root tab has no nav button and renders an empty leading slot —
the rail still exists, so the title's y is unchanged. A nav button never scrolls
away, and there is never a second copy of it.

---

## Part 11 — Migration

**The sweep is done.** Every screen head on both clients is the system's, with no exceptions.

| screen | rank / mode | status |
|---|---|---|
| History | `title` | shipped |
| Plan / Goal / Library / Recipe cover | `cover` | shipped |
| Workout Wrapped | `cover` + `takeover` | shipped |
| Statistics, Analytics, Trends, Volume, Velocity, Video, Force plate, Endurance, Longevity, Progress, Exercises, Exercise detail, Calendar, Check-in, Periodize, Builder, Run track, Sport, Coach, Connections, Competition, Talent, Tactical, Team monitor, Team compare, Org, AI coach, Logger settings, Profile edit, Coach apply, Notifications, Interval timer, Admin sections, Coaches, Discover, Leaderboard, Feed, Performance, Settings sub-pages | `title` | shipped |
| Login | `bar` | shipped |
| Nutrition | `title` + `bar` | shipped |

`ABack` — the 44x44 line-bordered square that 45 mobile files hand-rolled a
header row around — is **deleted**. Web's bare `<h1 style={{fontSize:
fs.display}}>` head is gone from every screen too.

### How a screen adopts it

One prop. `AuroraScreen` (mobile) and `HeroScreen` (web) take a `hero`:

```tsx
<AuroraScreen hero={{ rank: "title", title: t("nav.history") }}>
  {body}
</AuroraScreen>
```

`back` defaults to `router.back()`; pass `back={false}` on a root screen and the
rail keeps an empty leading slot, so the title's y never shifts between a root
and a pushed screen. `scroller` hands a screen the scroll props so it can keep
its own `FlatList` — a screen never trades virtualization for a hero.

### Judgement calls made during the sweep

- **Exercise detail is `title`, not `cover`.** The test for a cover is *one
  nameable thing with an accent and a mark*, and an exercise has neither in this
  codebase. Promoting it would mean inventing a per-exercise accent system, or
  giving every exercise page the same theme-primary wash — the "looks like a
  product page" failure the rank rule exists to prevent. It becomes a `cover`
  the day exercises get an accent, and not before.
- **Login is `bar`.** The brand mark and the form *are* the screen; there is no
  subject to name, so a display title would be chrome.
- **Presented sub-views take the `bar` rank in content.** The social-profile
  field editor and Nutrition's seven sub-views are presented over their host
  rather than pushed, so their head rides with the content instead of pinning —
  but every measurement is the system's: a 44pt row, the 40pt circular control,
  the inline-title type, one trailing slot.
- **Decoration was dropped, not relocated.** Calendar's calendar glyph,
  Longevity's heart, Check-in's heart and Endurance's GPS pin sat beside their
  titles. The rail's trailing slot carries one label or one control, so they are
  gone rather than moved.
- **Heads that were heroes in disguise became heroes.** Periodize's lime kicker
  is an eyebrow and its "now in <block>" line a meta line; Performance's "living
  masthead" is an eyebrow plus a title; Interval Timer's bordered lockup is a
  title plus a meta line; Notifications' unread count and Volume's
  Edit-landmarks toggle are rail accessories.
- **Data stayed data.** Statistics' weekly-volume readout is a figure, not
  metadata, so it stayed in the body rather than riding the rail.

### The HUD that owned the rail

Nutrition used to keep a sticky HUD — four capsules carrying kcal and macros
left — pinned at exactly the rail's y. That made it the one screen whose head
could not be the system's: two bars competing for one 44pt row.

**It was removed, not docked.** `HeroScreen`'s `rail` slot could have taken it,
but a persistent numeric rail riding every sub-screen is a *second head*, and
the rank rule says a screen has one. The budget it carried is one tap away: the
hub's calorie ring and macro card are the source, and every sub-view's back
control returns there.

With the HUD gone, `AuroraScreen`'s `stickyTop` / `stickyTopReserve` /
`onScrollY` slot had no users left and was deleted with it — the slot existed
only to host a competing bar.

If a persistent budget rail is ever wanted again, it comes back through the
`rail` slot, which docks *beneath* the hero's rail rather than replacing it —
never as a screen-top overlay.

### One sequencing rule, still

Never migrate a screen and its transition in separate changes. `lift` needs
*both* ends on the system to have a matched geometry to fly between; ship one
end alone and the move degrades to a cut on exactly the screens the system
exists to connect.
