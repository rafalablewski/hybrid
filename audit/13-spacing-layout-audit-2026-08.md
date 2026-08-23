# 13 — Spacing & layout audit (Aug 2026)

**Scope:** every `padding*`, `margin*`, `gap`/`rowGap`/`columnGap` value in
`apps/mobile`, `apps/web` and `packages/core`, plus the constants and shared
primitives that are supposed to supply them.

**Method:** exhaustive comment-blind scan of `app/`, `components/` and `lib/`
on both clients, followed by call-site tracing of every value that could not be
a rung of the shared `space` ladder. Every figure below is measured at the
commit that introduced this file, not estimated. Sibling components were then
read side by side, because a number is only a defect once something else
disagrees with it.

---

## 0. Executive summary

The spacing system is not missing. `packages/core/src/scale.ts` has carried a
shared eleven-rung ladder — `0 4 6 8 10 12 16 20 24 32 40` — for both clients
since the scale landed, with `sheetPadBottom` for the one pad that had been
written four different ways, `GUTTER` for the side inset, `CARD_PAD` for a
card's interior, and a documented rule in CLAUDE.md for each. It is a better
foundation than most products this size have.

**The finding is that almost nothing reads it, and nothing ever failed when a
call site didn't.**

| | mobile | web |
|---|---|---|
| raw numeric spacing literals | **3,129** | **504** |
| distinct values in use | **42** | 27 |
| off the ladder entirely | **604** | 136 |
| `space.*` token reads | 678 | — |
| **token adoption** | **~18%** | ~0% |

For contrast, the axes that *were* guarded came out clean. The side gutter
(`screen-gutter.test.ts`) and the card surface (`card-surface.test.ts`) are
both consistent, and they are consistent for exactly one reason: a test fails
when they aren't. The vertical axis had every token and no guard, and it is
where all five structural defects below live.

This is the same conclusion `design-tokens.test.ts` reached about type and
colour, restated one axis over: *the token system is not wrong, nothing
enforced it.*

---

## 1. The vertical rhythm has no rule, so every screen invents one

`marginTop` is written **1,262 times across 25 distinct values**:

```
 1  2  3  4  5  6  7  8  9  10  11  12  14  16  18  20  22  24  26  28
```

Nothing anywhere says which of those means "the seam between two blocks" and
which means "a label above its value", so each screen decides again. `gap`
carries 19 distinct values, `paddingVertical` 24.

**Today, the screen an athlete opens every morning, separates its top-level
blocks at 12, 16, 20 and 24 dp** — four different seams down one scroll, with
no property distinguishing them. This is not drift away from a standard; there
was no standard to drift from.

*Status: measured and ratcheted (§7). Not swept — a 604-site sweep is a
separate, reviewable change, and doing it blind would have been 604 guesses.*

---

## 2. The section seam was spelled five ways

`ASection` is the shared section head and it states the seam: `space.xxl`
above, `space.ms` below. Five screens hand-rolled the same head — same
anatomy, black display title with a mono meta opposite — and each re-picked
the pair:

| where | above | below |
|---|---|---|
| `ASection` (the standard) | 24 | **10** |
| Today, "Train your way" | 24 | **12** |
| Today, "Follow a coach" | 24 | **12** |
| Explore / exercises | 24 | **12** |
| nutrition hub | **28** | 10 |
| exercise favourites sheet | **16** | 10 |
| `RangeHead` | — | **8** |

Four of these are crossed in a single session. The nutrition hub's 28 is not
even on the ladder.

*Status: **fixed.** Today's two heads now render through `ASection`; the rest
are normalised onto the tier's tokens. `ASection` gained a `sub` slot so the
title-plus-descriptor variant — which three screens had each hand-rolled at a
different gap (3, 6 and 10) — is expressible by the standard instead of around
it.*

---

## 3. An undocumented "content column, plus two"

Twenty-one heads, subtitles and blocks carried `marginHorizontal: 2` — with no
comment anywhere saying what it was for. One site had dressed it up as
`space.xxs / 2`, which is a magic number wearing a token's clothes.

`ASection` does not have it. Cards do not have it. So on Today a `GroupMark`
cluster name sat **2dp to the right of the `ASection` head above it and of
every card below it**, down the same scroll. It is small enough that nobody
can point at it and large enough to read as sloppy.

Git history gives no reason for the value; it arrived with `GroupMark` and was
copied outward from there.

*Status: **fixed** — all 21 sites removed, heads now share the content
column's left edge with the content they label.*

---

## 4. Three constants named `CARD_PAD`, holding two values

| file | value | what it actually is |
|---|---|---|
| `aurora/kit.tsx` | `space.xl` (20) | the definition |
| `aurora/week-rail.tsx` | `20` | a **copy** — `const CARD_PAD = 20`, not an import |
| `aurora/logbook-rail.tsx` | `20` | a second copy |
| `hold-menu.tsx` | `5` | a different object entirely |

The two rails had re-declared the kit's token rather than importing it, so the
kit's `CARD_PAD` could move and the two rails would silently not. `hold-menu`'s
is not a content card at all — it is the inset of a small anchored menu whose
children are rows, and its row radius is *derived* from it, so "fixing the
duplicate" by importing the kit's 20 would have quietly moved every row's
corner.

*Status: **fixed.** The rails import the token; `hold-menu`'s is `MENU_PAD`,
with that trap written down at the declaration.*

### 4a. …and the two rails are the same object at two different rhythms

`week-rail` and `logbook-rail` are the same card in two modes — the file's own
header says so ("Same anatomy as week-rail.tsx"). Both draw header row → day
row → full-bleed hairline → day detail. The hairline agreed at 16/16. The gap
between the header and the day row **did not**: 16 in one, 14 in the other.

An athlete who enrols in a plan sees the card they have been looking at all
month shift 2dp.

*Status: **fixed** — both at `space.lg`.*

---

## 5. The bottom-pad rule was written and then hand-spelled anyway

CLAUDE.md states it plainly — *"`max(insetBottom, 24)`, **max, never plus**"* —
and `sheetPadBottom` implements it for both clients. The live logger's cover
ignored both:

```
paddingBottom: 48                     // the scroller: a bare number, off-ladder
paddingBottom: safe.bottom + 28       // the finish summary: the exact anti-pattern
```

On any notched iPhone the second reserves **62dp where 34 is correct** — a dead
band under the last row of the summary an athlete sees at the end of every
session. It fails invisibly, and it fails hardest on the devices the developer
is not holding.

A third site (`workout-wrapped.tsx`) also added to the inset, but *legitimately*:
its ledger clears an absolutely-positioned dot rail. That is the one reading
under which `+` is correct — and it was indistinguishable from the bug, because
the number named nothing.

*Status: **fixed.** `lib/layout.ts` gained `coverPadBottom`, which delegates to
core's one number and clamps its argument to the window's inset so a caller
reaching for the ambient `insets.bottom` (the reading with the tab bar folded
in) cannot reintroduce the original defect. The legitimate site now reserves a
named `RAIL_CLEARANCE`. The rule in §7 accepts an ALL-CAPS clearance and
nothing else, so a `+` always says what is standing in the space.*

---

## 6. The shared vocabulary is itself off-ladder in 13 places

This is the one that compounds. A number in `kit.tsx` is not one violation —
it is the shape every caller inherits:

```
kit.tsx:1258   paddingHorizontal: 18     the search / text field
kit.tsx:1259   marginBottom: 13          field-to-field rhythm
kit.tsx:1276   paddingVertical: 17       the field's height
kit.tsx:2714   paddingVertical: 36       the empty state
kit.tsx:2759   marginBottom: 11          under a status overline
kit.tsx:1421   gap: 5                    a segment's label-to-count
kit.tsx:1771   marginBottom: 2
hero.tsx:347   paddingVertical: 5        the hero meta chip
nutrition-kit  paddingVertical: 5, 14 · marginTop: 3
```

"What padding does a field take?" has no answer a screen can read off the
system, which is why 19 distinct `paddingHorizontal` values exist downstream.

Two of the 13 are **not** debt and are exempted by name: the sparkline's and
the zone bar's `gap: 2` are instrument geometry, sized against the bar's own
width. Moving them to a rung would show as a redrawn chart.

*Status: ratcheted separately and dated first (§7). Deliberately not swept in
this change — `paddingVertical: 17` sets the height of every field in the app,
and eleven eyeballed nudges to the shared vocabulary is how the problem was
created, not how it gets fixed.*

---

## 7. What now stops it coming back

Five new rules, following this repo's own established discipline — a dated
burn-down, with slack itself a failure.

**`apps/mobile/lib/design-tokens.test.ts` → `describe("spacing")`**

| rule | kind | count | due |
|---|---|---|---|
| off-ladder spacing in the KIT → a `space.*` rung | burn-down | **11** | 2026-11-30 |
| off-ladder spacing on a screen → a `space.*` rung | burn-down | **591** | 2027-11-30 |
| no local constant shadows a kit spacing token | HARD | 0 | — |
| a bottom-edge pad takes the inset as a floor, never a term | HARD | 0 | — |
| `ASection` states the section seam, and states it in tokens | HARD | 0 | — |

**`apps/web/__tests__/design-tokens.test.ts` → `describe("spacing")`**

| rule | kind | count | due |
|---|---|---|---|
| off-ladder padding / margin / gap → a `space.*` rung | ratchet | **130** | 2027-06-30 |

Two deliberate choices in how the rules are drawn:

**The rule is about the VALUE, not the token.** `space.md` and a literal `12`
render identically, so demanding the token and nothing else would be style
policing. A `13`, a `17`, a `28` is different in kind: it cannot be any rung,
so nothing generated it, and nothing can say whether the next one belongs.
On-ladder literals are left alone — they are already the right size, and
converting them is a separate, lower-stakes sweep.

**Negative values are out of scope here.** A negative margin is never a rhythm
rung; it is a bleed out of a container's padding, and bleeds are already ruled
on *by name* in `screen-gutter.test.ts` ("every container bleed names what it
bleeds"). Counting them twice would put one site under two rules with
different remedies.

The KIT tier is dated **first and deliberately short**, because it is the tier
every other number is copied from.

### The rule that earned its keep immediately

The bottom-pad rule found a third `+` site during its first run, in a file this
audit had not opened. That is the argument for the whole exercise: the spacing
defects that matter are not the ones you can see in a screenshot, they are the
ones that are only visible on hardware you don't have.

---

## 8. What is left, honestly

- **604 off-ladder sites on mobile, 136 on web**, now dated. The heaviest are
  `aurora/nutrition.tsx` (60), `app/workout.tsx` (36), `aurora/side-menu.tsx`
  (17) and `aurora/user-recipes.tsx` (17). These are screen-at-a-time work: a
  sweep wants the screen open beside it, which is exactly why it is a burn-down
  and not a regex.
- **The `space.*` conversion of the ~2,500 on-ladder literals** is not
  ratcheted and should not be. They render correctly today; the value of the
  token there is legibility, and it is worth doing opportunistically rather
  than as a flag day.
- **`marginTop` as the carrier of vertical rhythm at all.** 1,262 sites express
  the seam as a margin on the *child* rather than a `gap` on the *parent*,
  which is why a block cannot be reordered or hidden without its neighbour's
  spacing going wrong. `cardStack`'s own comment already names this as the
  eventual sweep. It is the largest single structural improvement available on
  this axis and it is not attempted here.
- **Five hand-rolled section heads** still exist as components; they are on the
  existing `section-header component → ASection` burn-down (due 2026-10-31).
  Their *spacing* is normalised, their conversion is not done — converting them
  changes typography too (title tracking, meta case), which is that ratchet's
  business rather than this audit's.

---

## 9. Reading note

Every "fixed" above is fixed in the commit that added this file, and the
verification was the full gate: `@hybrid/core` (4,258 tests), `@hybrid/mobile`
(323), `@hybrid/web` (236), plus `typecheck` on both clients. The burn-down
ledger printed by `design-tokens.test.ts` now names spacing as **the single
largest design debt in the app — 591 of the 1,095 tracked sites**, which is the
most useful thing this audit produced: the number is no longer discoverable
only by writing a script.
