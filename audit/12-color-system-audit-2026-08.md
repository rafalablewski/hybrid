# 12 — Colour-system audit (Aug 2026)

> **SUPERSEDED IN PART — the palette was retinted the same month.** The brand
> accents are now the PANTONE four (Wild Lime `#c3d363`, Muskmelon `#ec935e`,
> Lyons Blue rendered `#2f7893`, Fleur De Lis `#daa51d`); `violet` and `gold`
> are retired; the ΔE-18 guard now runs over every role pair and passes. See
> capability `pantone-four-palette`. **Everything below is the measurement of
> the palette as it stood before that change** and is kept as the dated record —
> the findings it lists that were NOT fixed by the retint (the semantic layer,
> the eleven accent unions, the `card`/`ink2` duplicate, the disabled token, the
> 19 goal hues) are all still live, and §10's plan still stands for them.

**Scope:** every colour value in `packages/core`, `apps/mobile`, `apps/web`.
**Method:** exhaustive grep of hex / rgb / rgba / hsl / named colours / CSS
variables / token exports / accent unions, followed by call-site tracing and
numerical verification (WCAG 2.x contrast + CIEDE2000) computed from the
literal values in the repo.

Every figure below is measured, not estimated. Where something could not be
determined it says **NOT FOUND IN CODEBASE**.

---

## 0. Executive summary

HYBRID has a **real, unusually well-defended colour system** — one theme, ten
tokens, a six-rung alpha ladder, a shared semantic layer, and CI ratchets that
already police hex literals and hand-rolled alphas on mobile. It is far above
the median for a product this size. Its problems are **not** "too many random
colours". They are four specific structural gaps:

1. **The semantic layer is bypassed.** `ROLE_COLOR` (6 roles) is resolved at
   only 16 call sites on mobile and 5 on web, while the raw accent tokens are
   referenced ~1 280 times. Meaning is therefore re-decided per screen — and it
   has drifted (four different colours for "this number went down").
2. **Eleven parallel accent unions** re-declare subsets of the same six keys
   (`AccentKey`, `LoadColor`, `FeelTone`, `ReadinessAccent`, `ActivityAccent`,
   `FeedAccent`, `CoachAccent`, `BadgeAccent`, `RecipeTint`, notes `tone`,
   `PremiumAccentPreset`). None of them is `AccentKey`.
3. **The audit's own distinctness floor is not met by its own palette.**
   `DISTINCT_ROLE_DE = 18` — and `lime`/`amber` sit at **ΔE 17.4**. The guard in
   `palette.test.ts` only tests `danger`/`info`/`caution`, so the `go`/`caution`
   pair — the most common adjacency in the product — is unguarded and failing.
4. **The web half has no guard at all.** Mobile has `design-tokens.test.ts` +
   `error-boundary-palette.test.ts`. Web has neither, and it shows: the stale
   hairline `#2a2d2a` — the exact value `tokens.ts` names as the bug — is still
   live in `apps/web/app/error.tsx` and `global-error.tsx`.

There are **two genuine near-duplicate surface tokens** (`card` #151715 vs
`ink2` #141614 — ΔE **0.3**, i.e. the same colour) and **two live AA failures**
in shipping mobile CTAs.

Scores (§6): visual quality 8, consistency 6, accessibility 6, premium feel 8,
brand identity 7, design-system maturity 7.

---

## 1. Source of truth — where colour is defined

| Layer | File | What it holds |
|---|---|---|
| Primitives | `packages/core/src/theme/tokens.ts` | `colors` (10 keys), `ALPHA` (6 rungs), `fonts` |
| Theme palette | `packages/core/src/theme/palette.ts` | `THEMES.dark` — surfaces, text, `accent`, `onAccent`, `gold`, `accentText` |
| Semantics | `packages/core/src/semantic.ts` | `SemanticRole` (6), `AccentKey`, `ROLE_COLOR`, band→role functions |
| Measurement | `packages/core/src/contrast.ts` | WCAG ratio, CIE Lab, CIEDE2000, `DISTINCT_ROLE_DE = 18` |
| Premium accent | `packages/core/src/premium-accent.ts` | runtime-settable "buy Full" accent + WCAG readout |
| Mobile renderer | `apps/mobile/lib/theme.tsx` | `Palette`, `paletteFor`, `txt()`, `roleColor()` |
| Mobile alpha | `apps/mobile/components/aurora/field.tsx:16` | `withAlpha(hex, a)` — the ONLY alpha helper in the repo |
| Web renderer | `apps/web/app/globals.css:10–30` (`@theme`), `:root` at `34–40` and `175–221` | CSS custom properties |
| Web exports | `apps/web/lib/ui.tsx:41–110` | `INK/INK2/CARD/LINE/LIME/…`, `roleHex/roleVar/roleText`, `tint()` |

**There is exactly one theme.** `ThemeName = "dark"` (`palette.ts:44`),
`ThemeProvider` is static (`apps/mobile/lib/theme.tsx:71`), `html { color-scheme: dark }`
(`globals.css:79`), `"userInterfaceStyle": "dark"` (`apps/mobile/app.json:8`).
The Japandi / Kyoto-Hour light theme was deleted whole (capability
`light-theme-removed`). **There is no light mode to reconstruct** — §3 answers
that question in full.

---

## 2. The complete colour inventory

### 2.1 Primitive tokens (`theme/tokens.ts` + `theme/palette.ts`)

All are global tokens; all belong to the single dark theme; all are opaque
(alpha is applied at call sites via `withAlpha` / `color-mix`).

| Token | Value | Semantic meaning | Mobile uses | Web uses | Mirror |
|---|---|---|---|---|---|
| `ink` | `#0c0d0c` | app background | 138 | 40 | `--color-ink` |
| `ink2` | `#141614` | raised surface / **the real card fill** | 133 | 72 | `--color-ink2` |
| `card` | `#151715` | "card surface" — **effectively orphaned**, see §5.1 | 7 | 15 | `--color-card` |
| `line` | `#242724` | hairline border | 523 | 218 | `--color-line` |
| `chalk` | `#f3f4ef` | primary text | 923 | 199 | `--color-chalk` |
| `ash` | `#8b8f86` | muted text / neutral role | 1 600 | 378 | `--color-ash` |
| `lime` | `#c6f84f` | chartreuse — primary action / "go" | 807 | 160 | `--color-lime` |
| `blue` | `#3c787e` | teal — conditioning / info | 99 | 34 | `--color-blue` |
| `violet` | `#8296c4` | steel blue — coach / non-premium (legacy key name) | 62 | 54 | `--color-violet` |
| `amber` | `#d0cd94` | sand — caution / sport / premium | 164 | 144 | `--color-amber` |
| `red` | `#d56f3e` | terracotta — danger / injury | 149 | 95 | `--color-red` |
| `gold` | `#e6c34e` | rating gold (coach ★). Decorative, not AA-guarded | 10 | 0 | `--color-gold` |
| `onAccent` | `#0c0d0c` | ink on a bright accent fill | 70 | 21 | `--on-accent` |

### 2.2 Accent-TEXT channel (`THEMES.dark.accentText`)

The fills above are tuned to sit *under* something; these are the AA-guarded
tones for an accent rendered as type. Resolved by `txt()` (mobile, 598 sites)
and `txt()` / `roleText()` / `accentText()` (web, 126 sites).

| Token | Value | Δ from fill | Mirror |
|---|---|---|---|
| `accentText.lime` | `#c6f84f` | identical to fill | `--lime-text` |
| `accentText.blue` | `#6cb6bd` | lifted from `#3c787e` | `--blue-text` |
| `accentText.violet` | `#8ba0cc` | lifted from `#8296c4` | `--violet-text` |
| `accentText.amber` | `#d0cd94` | identical to fill | `--amber-text` |
| `accentText.red` | `#e58a5c` | lifted from `#d56f3e` | `--red-text` |

### 2.3 Alpha ladder (`ALPHA`, `tokens.ts`)

| Rung | Value | Job | Mobile call sites |
|---|---|---|---|
| `wash` | 0.08 | faintest tinted surface | 47 |
| `fill` | 0.12 | standard tinted fill | 53 |
| `solid` | 0.16 | strongest tint | 33 |
| `edge` | 0.25 | quietest tinted hairline | 23 |
| `line` | 0.33 | standard tinted border | 34 |
| `rim` | 0.42 | border on a busy ground | 40 |

Plus **119** `withAlpha(colour, <raw number>)` sites (gradient stops + scrims —
deliberately excluded from the ladder; `design-tokens.test.ts` documents why).
**`ALPHA` is used 196 times on mobile and 0 times on web.**

### 2.4 Fixed-dark cover inks (`packages/core/src/hero.ts`)

| Token | Value | Line | Note |
|---|---|---|---|
| `HERO_INK` | `#0c0d0c` | `hero.ts:198` | same value as `ink`, deliberately a separate name (a cover is a printed object) |
| `HERO_TAKEOVER_INK` | `#0a0b09` | `hero.ts:201` | ΔE **0.5** from `ink` |
| `HERO_TAKEOVER_RAISED` | `#0e0f0d` | `hero.ts:214` | ΔE **1.9** from `ink2` |
| `HERO.alpha` | `{primary:1, dim:0.82, hairline:0.16, navFill:0.12, navStroke:0.18}` | `hero.ts:193` | hero-local foreground alphas |

### 2.5 Fitness / data colours

| Domain | Where | Values |
|---|---|---|
| Macros | `apps/mobile/components/aurora/nutrition-kit.tsx:74` `MACRO_FILL` | protein → `blue`, carbs → `amber`, fat → `violet`; kcal → `lime` (nutrition.tsx passim) |
| Pantry macro class | `apps/mobile/components/aurora/pantry.tsx:41` | protein `blue`, carb `amber`, fat `violet`, mixed/light `ash` |
| Load intensity (%1RM) | `packages/core/src/plan-program.ts:238` `loadColor` | <65 `blue`, <75 `lime`, <85 `amber`, ≥85 `red`, bodyweight `ash` |
| RPE heat | `plan-program.ts:246` `rpeColor` | ≥10 `red`, ≥9 `amber`, ≥8 `blue`, else `ash` |
| Conditioning effort | `plan-program.ts:277` | recover `ash`, easy `blue`, moderate `lime`, hard `amber`, max `red` |
| Rep zone | `plan-program.ts:294` `repZoneColor` | ≤6 `amber`, ≤12 `lime`, >12 `blue` |
| Endurance workout type | `plan-program.ts:254` `workoutColor` | rest `ash`, long `red`, tempo/interval/hill `amber`, easy `blue` |
| Session slot | `plan-program.ts:265` `sessionColor` | AM `lime`, MID `amber`, PM `blue`, else cycles lime/amber/blue |
| Periodization phases | `packages/core/src/engines/periodization.ts:12–26` | raw hexes `#3c787e #c6f84f #d0cd94 #8296c4 #8b8f86` (× two macrocycles) |
| Readiness band | `semantic.ts:34` + `readiness-feeling.ts:22` | ≥80 `go`, ≥60 `info`, ≥40 `caution`, else `danger` |
| Injury risk / ACWR / HPI / accountability | `semantic.ts:47–86` | all → the 4-role ramp |
| Session feel / fatigue | `session-feel.ts:29,50–70` | easy/steady `blue`, solid `lime`, hard `amber`, all-out `red` |
| Mood note | `notes.ts:19–27` | rough `red`, ok `amber`, good/strong `lime` |
| Fitness-level badge | `engines/fitness-level.ts:592–599` | untrained/novice `ash`, intermediate `chalk`, advanced `lime`, **elite `gold`** |
| Exercise-card kind | `apps/mobile/components/aurora/exercise-widget.tsx:35` | strength `lime`, cardio `blue`, other `amber` |
| Exercise-page anatomy ramp | `apps/mobile/components/aurora/exercise-page.tsx:36–38` | `DEEP_BASE #84a01e`, `DEEP_HARD #bd871e`; `RAMP = #33420f #4c6414 #6f8f1c #9cc32d → colors.lime` |
| Team-compare series | `apps/mobile/components/aurora/team-compare.tsx:11–18` | `lime violet blue amber ash` |
| Trend direction | `apps/mobile/components/aurora/trends.tsx:86` | up `lime`, down **`amber`**, flat `ash` |
| Podium medals | `apps/mobile/app/leaderboard.tsx:16` | `#d4af37 #b9bcc0 #b3814f` (gold/silver/bronze, off-palette) |
| Goal identity | `packages/core/src/plans.ts:88–160` | **19 hand-authored hexes**, one per goal |
| Recipe tint | `packages/core/src/recipes.ts:340` | `amber blue red lime` |
| Story-card styles | `packages/core/src/story-styles.ts:63–98` | `rgba(198,248,79,.20/.30)`, `rgba(60,120,126,.28)`, `rgba(255,255,255,.08/.12)`, `#b6bcb3`, `#dfe6e2` |
| Web admin charts | `apps/web/components/admin/{overview,athlete-weeks,agent-hq}.tsx` | `LIME_HEX` / `BLUE` / `RED` / `LINE_HEX` (grid) / `ASH` (axes) |

**NOT FOUND IN CODEBASE:** heart-rate zone colours, sleep-stage colours, a
dedicated personal-record colour (PRs are marked with the ✦/★ glyph and `lime`,
not a hue of their own), a body-fat/hydration ramp. The body map
(`apps/mobile/components/aurora/body-map.tsx:124–137`) is a single-hue
`lime`-at-varying-opacity heat, not a multi-hue scale.

### 2.6 Non-token colour still in shipping source

62 distinct 6-digit hexes exist outside tests and `capabilities.ts`. After
removing the goal palette (19), the sport-mark ramps (6), third-party brand
logos in `source-marks.ts` (`#0050aa #e60a14 #ed1b24 #fff000` — legitimately
outside the palette) and comment-only mentions, the live off-palette set is:

| Value | Where | Verdict |
|---|---|---|
| `#2a2d2a` | `apps/web/app/error.tsx:60`, `apps/web/app/global-error.tsx:55` | **STALE** — the retired `line` value; ΔE 1.9 from `#242724` |
| `#2a2c2a` | `apps/web/lib/email.ts:51` | third `line`-alike |
| `#2a2e28` | `apps/web/app/invite/[token]/page.tsx:18` | fourth `line`-alike (ΔE 2.9) |
| `#f3f5ef` | `apps/web/app/invite/[token]/page.tsx:16` | ΔE **0.8** from `chalk` |
| `#a7ad9e` | `apps/web/app/invite/[token]/page.tsx:17` | ΔE 9.5 from `ash` |
| `#141614` as `const CARD` | `apps/web/app/invite/[token]/page.tsx:19` | `ink2` misnamed `CARD` |
| `#c6f135` | `apps/web/lib/email.ts:52` | a **second chartreuse** (ΔE 2.6 from `lime`) |
| `#e9e9e9`, `#ffffff` | `apps/web/lib/email.ts:51,53` | off-palette text |
| `#0a0b0a` | `apps/web/components/admin/audit.tsx:114` | ΔE **0.4** from `ink` |
| `#151715` as `CARD_DARK` | `apps/web/components/admin/flags.tsx:192` | re-declares `--color-card` |
| `#e06666` | `apps/web/components/admin/agents.tsx:721` | off-palette error red (ΔE 14.8 from `red`) |
| `#000a` / `#000b` | `apps/web/components/admin/users.tsx:352,499,739` | two modal scrims |
| `rgba(0,0,0,.5/.7/.75)` | web tsx | three more scrims |
| `#e8e8e8` + `#111` | `apps/mobile/components/aurora/profile.tsx:805,807` | deliberate iOS edit-badge mimicry, unnamed |
| `#5a5e56` | `apps/mobile/components/percent-program.tsx:295` | a fifth grey used as text (ΔE 19.5 from `ash`) |
| `#3a3d34` | `apps/mobile/components/aurora/nutrition.tsx:2621` | placeholder ink, contrast **1.64:1** |
| `#12170f` | `apps/mobile/components/aurora/run-track.tsx:90` | ink-on-amber, ΔE 5.8 from `ink` |
| `#0d0e0d` | `apps/mobile/components/aurora/hero.tsx:196` | ΔE **0.2** from `ink` |
| `rgba(8,9,11,.82)` | `apps/mobile/components/tour.tsx:36` | a third near-black scrim |
| `#faf6ef` | `packages/core/src/premium-accent.ts:25` `INK_LIGHT` | only near-white in core; legitimate (auto-ink picker) |
| 22 × `rgba(255,255,255,…)` | mobile cover art / hero | pure white — deliberately not `chalk` |

Mobile's own ratchet counts **61** quoted hex literals and is scheduled to zero
by 2026‑12‑31 (`apps/mobile/lib/design-tokens.test.ts:852`). **Web is not
ratcheted at all.**

### 2.7 Gradients, shadows, scrims

| Thing | Definition | Notes |
|---|---|---|
| Aurora ambient field (mobile) | `apps/mobile/components/aurora/field.tsx:38–58` | lime @0.14, violet @0.16, blue @0.10 → transparent |
| Aurora ambient field (web) | `globals.css:1057–1077` | `.lg-a` lime, `.lg-b` blue, `.lg-c` violet, blurred 70px |
| Card shadow (mobile) | `apps/mobile/lib/ui.tsx` `cardShadow()` | `#000` @0.18, r14, y8 |
| Card shadow (web) | `globals.css:39` `--shadow-card` | `rgba(0,0,0,0.55)` 0 6px 22px −12px |
| Start-CTA glow | mobile `startGlow()`; web `.start-glow` (`globals.css:110–122`) | accent-coloured halo, 0.32→0.55 on press / `color-mix … 55%` |
| Sheet scrim | `#000` at `motion.scrimWithRecede = 0.28` / `scrimFlat = 0.6` (`packages/core/src/motion.ts:137–141`) | opacity tokenised, **colour is not** |
| Glass material (web) | `globals.css:186–215` | `--glass-base 22,24,22`, `--glass-rgb 243,244,239`, `--rim-hi rgba(255,255,255,.6)`, `--inner-lo rgba(0,0,0,.45)`, `--drop rgba(0,0,0,.6)`, `--glass-glow-rgb 198,248,79` |
| Glass material (mobile) | native SwiftUI via `GlassSurface` (`aurora/swiftui`) | no colour in JS — the OS draws it |

**No HSL/HSLA anywhere. No CSS named colours anywhere.** 117 `"transparent"`.

---

## 3. Light mode vs dark mode

**The app is dark-only. There is no light mode.** Reconstructing "both systems
separately" is therefore not possible — the light column below is the honest
answer, not an omission.

| Semantic token | Dark (the only mode) | Light | Purpose |
|---|---|---|---|
| `background.primary` | `#0c0d0c` (`ink`) | NOT FOUND IN CODEBASE | screen ground |
| `background.secondary` | `#141614` (`ink2`) | — | raised surface, card fill |
| `surface.primary` | `#141614` (`ink2`, via `ACard`) | — | the card the app actually draws |
| `surface.elevated` | native glass (iOS 26) or `ink2` | — | `ACard` / `.liquid-glass` |
| `text.primary` | `#f3f4ef` (`chalk`) | — | body + headings |
| `text.secondary` | `#8b8f86` (`ash`) | — | meta, labels, placeholders |
| `text.tertiary` | **NOT FOUND IN CODEBASE** | — | expressed as `ash` + opacity |
| `text.disabled` | **NOT FOUND IN CODEBASE** | — | expressed as raw `opacity: 0.3–0.6` |
| `border.primary` | `#242724` (`line`) | — | hairlines |
| `accent.primary` | `#c6f84f` (`lime`) | — | the one action colour |
| `status.success` | `lime` (role `go`) | — | |
| `status.warning` | `amber` (roles `caution` **and** `premium`) | — | |
| `status.error` | `red` (role `danger`) | — | |
| `status.info` | `blue` (role `info`) | — | |

**How depth is expressed.** Not by luminance: `ink → ink2` is **1.07:1**,
`ink2 → card` is **1.01:1** (ΔE 0.3). Elevation is carried almost entirely by
**the 1px `line` hairline** (1.20:1 against `ink2`), **shadow**, and on iOS 26 by
**native SwiftUI Liquid Glass** (`ACard`, `apps/mobile/components/aurora/kit.tsx:421–450`).
Web uses **opacity-based glass** (`rgba(var(--glass-base), var(--lg-opacity))` +
`backdrop-filter: blur(18px) saturate(150%)`) — but the Aurora override at
`globals.css:250–257` switches `.liquid-glass` back to **solid `ink2`**, so the
web glass stack is defined and then disabled.

So: **layered surfaces + hairline + material**, not a tonal ramp. That is a
deliberate, coherent choice (it is what Linear and Apple's dark mode do) — but
it means the app has effectively **two** surface values, not four, and the third
(`card`) is dead weight.

---

## 4. Colour architecture as it stands

```
CURRENT
tokens.ts colors{10}          ← primitives AND semantics in one flat object
   ├─ palette.ts THEMES.dark  ← re-names 6 of them + adds accentText{5} + gold
   ├─ semantic.ts ROLE_COLOR  ← 6 roles → 6 accent keys   (21 call sites total)
   ├─ 11 parallel accent unions in core (LoadColor, FeelTone, …)
   └─ direct token reference  ← ~1 280 call sites, the real path
COMPONENT LAYER
   (none — every component composes from primitives inline)
```

The stack is **primitive → (thin, mostly bypassed) semantic → component**. There
is **no component-colour layer at all**: `button.primary`, `card.background`,
`input.background`, `chart.series` do not exist as tokens; each component spells
them out (`backgroundColor: C.lime` × 56, `backgroundColor: C.ink2` × 133).

**Should it change? Yes, but only in the middle.** The primitive layer is good
and must be preserved verbatim — it *is* the brand. The recommendation (§7/§8)
is to **thicken the semantic layer and make it the only public API**, add a
small component layer for the six surfaces that are hand-spelled everywhere,
and collapse the eleven accent unions onto `AccentKey`. Do **not** introduce a
50-step primitive ramp (Neutral 0–900 etc.) — this product has two surfaces and
one accent by design, and a tonal ramp would invent shades nobody needs.

---

## 5. Inconsistencies found

### 5.1 CRITICAL — `card` and `ink2` are the same colour, and the kit uses the other one

`#151715` vs `#141614`: **ΔE 0.3, contrast 1.01:1** — indistinguishable.
`ACard` (the app's card primitive) paints `palette.ink2`
(`apps/mobile/components/aurora/kit.tsx:437`). `C.card` survives at 7 hand-rolled
sites (`pr-attestation.tsx:42,109`, `swipe-row.tsx:204`, `feel-prompt.tsx:146`,
`app/help.tsx:58`, `app/session/[id].tsx:158`, `app/(tabs)/messages.tsx:40`) and
15 web sites. `--color-card` is referenced **0 times inside `globals.css`**.
Meanwhile `apps/web/components/admin/flags.tsx:192` declares
`const CARD_DARK = "#151715"` — a third copy of the same value.

### 5.2 CRITICAL — the palette fails its own distinctness floor

`contrast.ts:DISTINCT_ROLE_DE = 18`. Measured CIEDE2000 on the accent-TEXT
channel:

| Pair | ΔE | Guarded? |
|---|---|---|
| `go`/`caution` (lime/amber) | **17.4** | **no** — below floor |
| `info`/`neutral` (blue/ash) | 19.9 | no |
| `info`/`caution` | 28.4 | yes |
| `caution`/`danger` | 29.0 | yes |
| `info`/`danger` | 41.1 | yes |
| `amber`/`gold` (fills) | **12.9** | no |

`palette.test.ts:82` only tests `COST_ROLES = ["danger","info","caution"]`. The
lime/amber pair — readiness `go`→`caution`, `loadColor` 65–75 → 75–85,
`conditioningColor` moderate→hard, `trends` up→down, kcal ring under→over — is
the **most frequent adjacency in the product** and it is the one below the bar.

### 5.3 CRITICAL — stale palette values live in the unguarded web fallbacks

`apps/mobile/components/error-boundary.tsx` hardcodes the palette by design and
is held correct by `apps/mobile/lib/error-boundary-palette.test.ts`. Its **web
twins were never fixed**:

- `apps/web/app/error.tsx:60` — `border: "1px solid #2a2d2a"`
- `apps/web/app/global-error.tsx:55` — same
- plus `#0c0d0c #141614 #f3f4ef #8b8f86 #c6f84f` copied by hand in
  `error.tsx`, `global-error.tsx`, `not-found.tsx`, `page.tsx`, `privacy/page.tsx`,
  `terms/page.tsx` with nothing diffing them.

`#2a2d2a` is the exact value `tokens.ts:11` names as the bug that "made every
chart hairline draw in a different grey than every border".

### 5.4 HIGH — four different colours for "this number went down"

| Surface | File:line | down | flat |
|---|---|---|---|
| Trends table | `aurora/trends.tsx:86` | **`amber`** | `ash` |
| Week verdict | `aurora/week-verdict.tsx:635` | **`red`** | `chalk` |
| Endurance summary | `aurora/endurance-summary.tsx:98` | **`red`** | `ash` |
| Workout wrapped | `components/workout-wrapped.tsx:547` | **`violet`** | — |

`statSubTone()` exists in core (`stat-tile.ts`) and returns `up|down|flat`, but
has **0 consumers** — the tone→colour half was never written.

### 5.5 HIGH — two live WCAG AA failures in shipping mobile CTAs

| Site | Pair | Ratio | Verdict |
|---|---|---|---|
| `apps/mobile/app/workout.tsx:2833–2835` | `chalk` on `violet` fill (guest-save CTA, `fs.subtitle`) | **2.67:1** | FAIL; the sub-line adds `opacity: 0.8` → worse |
| `apps/mobile/components/aurora/user-recipes.tsx:541` | `#fff` on `red` fill (delete CTA, `fs.body`) | **3.40:1** | FAIL for normal text |

Neither is caught by `palette.test.ts`, which only guards `onAccent` against
`accent` (lime). For reference, `onAccent` on the other fills:
blue **3.88** (would fail), red 5.72, violet 6.59, amber 11.91, gold 11.39.

### 5.6 HIGH — five placeholder inks, four of them illegible

| Value | Sites | Contrast on `ink2` |
|---|---|---|
| `C.ash` | 70 | 5.52 ✅ |
| `withAlpha(C.ash, 0.533)` | 12 | **2.44** ❌ |
| `withAlpha(C.ash, 0.6)` | 1 | **2.79** ❌ |
| `C.line` | 2 (`nutrition.tsx:2181,2670`) | **1.20** ❌ |
| `"#3a3d34"` | 1 (`nutrition.tsx:2621`) | **1.64** ❌ |

Web deliberately distinguishes an *instructional* placeholder (`::placeholder`
at full `ash`, AA — `globals.css:86`) from a *suggested value*
(`.ghost-ph` at 55% + italic — `globals.css:94`). Mobile copied the 55% but not
the distinction, and then added two more inks on top.

### 5.7 HIGH — eleven parallel accent unions

`AccentKey` (`semantic.ts:23`) is the canonical set. These re-declare subsets of
it and never reference it:

`LoadColor` (`plan-program.ts:233`), `FeelTone` (`session-feel.ts:29`),
`ReadinessAccent` (`readiness-feeling.ts:18`), `ActivityAccent` (`activity.ts:10`),
`FeedAccent` (`social.ts:110`), `CoachAccent` (`social.ts:666`),
`BadgeAccent` (`engines/fitness-level.ts:592`), `RecipeTint` (`recipes.ts:26`),
`notes.ts:19` inline `tone`, `PremiumAccentPreset` (`premium-accent.ts:17`),
plus the inline `as const` set in `aurora/team-compare.tsx:11`.

Each needs its own resolver. Mobile has three
(`percent-program.tsx:48 loadHex`, `aurora/settings.tsx:135 toneColor`,
`lib/theme.tsx:62 roleColor`) plus `RECIPE_TINT_COLOR` in core — four resolvers
for one six-key lookup.

### 5.8 MEDIUM — colour still encodes identity, which `tokens.ts` says it does not

`tokens.ts:23` states "colour now only ever encodes state, never section
identity". Live counter-examples:

- `packages/core/src/plans.ts:88–160` — **19 hand-authored goal hues**. Measured:
  **31 of 171 pairs sit below the project's own ΔE 18 floor** (closest:
  cycling/hyrox 8.6, strongman/sport 9.8, power/tri 10.3). Three fail AA as text
  on the card: `run #3c787e` 3.59, `crossfit #b5533c` 3.66, `mobility #4f7f5e` 3.89.
- `plan-program.ts:265 sessionColor` — cycles lime/amber/blue by ordinal to make
  "Training 1/2/3" read as three blocks. That is identity, not state.
- `repZoneColor` **inverts** the intensity ramp: `amber` = low reps (strength)
  where `loadColor`/`conditioningColor` use `amber` = hard. Same hue, opposite
  meaning, both on the plan table.

### 5.9 MEDIUM — `amber` carries three meanings

`ROLE_COLOR` maps **both `caution` and `premium` to `amber`** (`semantic.ts:26–33`),
and `MACRO_FILL` uses `amber` for **carbs**. On the nutrition hub a sand figure
can mean "over target" (caution), "carbohydrate" (category) or "upgrade"
(commerce) in the same viewport.

### 5.10 MEDIUM — the alpha ladder is mobile-only

`ALPHA`: 196 mobile sites, **0 web sites**. Web tints via raw
`color-mix(in srgb, var(--color-lime) N%, transparent)` at
**7 / 10 / 11 / 12 / 13 / 20 / 26 / 33 / 45 / 55 %** — the exact
"eight values in one band" drift `ALPHA` was created to end.
`apps/web/lib/ui.tsx:94 tint()` exists as the fix and has **1 consumer**.

### 5.11 MEDIUM — five scrim colours

`#000` @0.28/0.6 (mobile sheets, `motion.ts`), `rgba(8,9,11,.82)`
(`components/tour.tsx:36`), `#000a` and `#000b` (`admin/users.tsx`),
`rgba(0,0,0,.5/.7/.75)` (web). The scrim *opacity* is tokenised; the scrim
*colour* is not.

### 5.12 MEDIUM — no disabled token

There is no `text.disabled` / `action.disabled`. Disabled and busy states are
raw opacity, and they drift: `0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6` across
~25 sites on each client.

### 5.13 LOW — dead colour in `globals.css`

With the web client retired, `globals.css` (1 079 lines) still defines and
nothing consumes: `--premium-accent`, `--premium-accent-text`,
`--premium-accent-ink`, `--accent-text`, `--back-surface`, `--back-shadow`,
`--cover-bleed`, `.aurora-navglass`, `.start-glow`, `.ghost-ph`, `.skip-link`,
the whole `::view-transition` block (~200 lines), `.motion-side-menu`,
`.motion-drawer`. `--color-red` and `--color-gold` are referenced only through
`roleVar()`/`accentText()` string interpolation, so they are live but invisible
to grep — worth a comment so nobody deletes them.

### 5.14 LOW — `AuroraIcon` defaults to pure black

`apps/mobile/components/aurora/icons.tsx:178` — `color ?? "#000"`. The same
file's header (line 77) argues at length that a default colour is exactly the
bug that shipped white-on-near-black icons. `#000` on `ink` is **1.08:1**:
invisible. Currently latent (all 105 call sites pass a colour) but the guard is
absent.

### 5.15 LOW — legacy names

`violet` holds a steel blue (`#8296c4`); the key was never renamed.
`accentText.violet` is `#8ba0cc`. `theme/index.ts:9` documents a
`templates.ts` that does not exist and describes `palette.ts` as holding
"light/dark surface + text palettes" when only dark remains.

---

## 6. Visual-language evaluation

**What is genuinely premium.** One accent, spent sparingly, on a true neutral
charcoal — that is the Linear / Whoop discipline, and this codebase enforces it
with CI rather than a style guide. The mono-uppercase eyebrow + display-black
figure pairing is a real voice. The `accentText` channel (a separate, lifted
tone for an accent used as type) is a level of care most consumer apps never
reach. The middot ban, the "no decorative dot before a header" rule and the
"ring = leaves, no ring = grows" grammar are the kind of decisions Apple ships
and almost nobody writes down.

**What reads as noise.** The five-accent spectrum is one accent more than the
product can spend meaningfully: `violet` has 62 mobile uses and no stable
meaning (coach, non-premium, comment, fat, season bar, "not up"), and `gold`
has 10 uses at ΔE 12.9 from `amber`. The 19-goal palette pulls hard against the
one-accent thesis — a Plans grid of 19 muted mid-tone hues is the single least
"Aurora" screen in the app.

**Data visualisation** is the weakest axis. Series colours are chosen per
component from the accent set; there is no ordered categorical palette, no
sequential ramp except one hand-built five-stop lime ramp in `exercise-page.tsx`,
and the only distinctness guard covers three roles out of the set.

**Dark-mode quality: high.** Ink at `#0c0d0c` (not pure black), chalk as a cool
off-white (not `#fff`), hairline separation rather than grey-on-grey — correct
choices throughout. **Light-mode quality: N/A** (removed by decision).

| Axis | Score | Why |
|---|---|---|
| Visual quality | **8/10** | genuinely distinctive; one accent, disciplined surfaces, a real voice |
| Consistency | **6/10** | 11 accent unions, 4 resolvers, 4 "down" colours, `amber` = 3 meanings |
| Accessibility | **6/10** | excellent machinery (`contrast.ts`, `palette.test.ts`) with 2 live AA failures, 4 illegible placeholder inks and the biggest role pair unguarded |
| Premium feel | **8/10** | glass + hairline + restraint land; the goal grid and `gold` undercut it |
| Brand identity | **7/10** | chartreuse-on-charcoal is ownable; the 5-accent spectrum dilutes it and `violet` has no job |
| Design-system maturity | **7/10** | ratchets, burn-downs and ΔE guards are top-decile — but they cover mobile only, and the semantic layer is bypassed 60:1 |

---

## 7. Recommended architecture

Keep primitives **exactly as they are** — no brand change is warranted. Add the
missing middle and top.

```
RECOMMENDED
PRIMITIVE  packages/core/src/theme/tokens.ts        (unchanged values)
   ink ink2 line chalk ash lime blue violet amber red gold + ALPHA{6}
      ↓
SEMANTIC   packages/core/src/theme/semantic-tokens.ts   (NEW — the only public API)
   background.primary/secondary   text.primary/secondary/tertiary/disabled/inverse
   border.subtle/default/focus    action.primary/secondary/disabled
   status.success/warning/error/info      data.*      chart.1–5
      ↓
COMPONENT  resolved per client, from semantic only
   card.background  input.background  input.placeholder  sheet.scrim
   button.primary.{fill,ink,glow}   chart.grid/axis
```

Rules to enforce with tests (mirroring the existing ratchet style):

1. A component may import **semantic** tokens only. Primitives become
   `@internal` to the theme folder.
2. `AccentKey` is the single accent union; every domain type becomes
   `type LoadColor = AccentKey` (or a `SemanticRole` alias) — no new unions.
3. Extend `palette.test.ts` to test **all** role pairs at ΔE ≥ 18, and
   `onAccent` against **every** fill, not just `accent`.
4. Port `design-tokens.test.ts`'s hex ratchet to `apps/web`.

---

## 8. CURRENT vs RECOMMENDED

| Concern | CURRENT | RECOMMENDED |
|---|---|---|
| Surfaces | `ink`, `ink2`, `card` (3, two identical) | `ink`, `ink2` (2). Retire `card`. |
| Accents | 5 + `gold` (6) | 4 + `gold`. Retire `violet` as a *semantic* accent; keep the hex for the ambient field + goal palette only. |
| Accent → text | `accentText{5}` ✅ | unchanged |
| Role layer | 6 roles, 21 call sites | 6 roles, **the only way to pick a state colour** |
| Accent unions | 11 | 1 (`AccentKey`) |
| Resolvers | 4 | 1 per client (`roleColor` / `roleVar`) |
| Alpha | `ALPHA{6}`, mobile-only | `ALPHA{6}`, both clients (web via `tint(colour, ALPHA.x)`) |
| Disabled | raw opacity ×7 values | `text.disabled` + `action.disabled` |
| Placeholder | 5 inks | 2 (`input.placeholder` = `ash`; `input.ghost` = the italic 55% suggested-value tone) |
| Scrim | 5 values | 1 (`overlay.scrim` = `ink` + `motion.scrim*`) |
| Charts | ad-hoc per component | `chart.1–5`, ordered and ΔE-guarded |
| Goal identity | 19 hues, 31 pairs under floor | 8-hue ordered set, assigned by category, ΔE-guarded |

---

## 9. APP COLOR SYSTEM — the definitive tokens

Dark is the only mode; the "LIGHT MODE" section below is answered honestly
rather than invented. Values are **unchanged from today** except where a
duplicate is collapsed.

```
BRAND
brand.primary:            #c6f84f   (chartreuse — the one action colour)
brand.secondary:          #3c787e   (teal — conditioning / info)
brand.accent:             #d0cd94   (sand — caution / sport / premium)

BACKGROUNDS
background.primary:       #0c0d0c   (ink — screen ground)
background.secondary:     #141614   (ink2 — raised surface)
surface.primary:          #141614   (the card fill; ACard/.liquid-glass)
surface.elevated:         native Liquid Glass (iOS 26) → #141614 fallback
                          (`card` #151715 is RETIRED — ΔE 0.3 from ink2)

TEXT
text.primary:             #f3f4ef   (chalk)
text.secondary:           #8b8f86   (ash)
text.tertiary:            withAlpha(#8b8f86, 0.72)      NEW — replaces raw opacity
text.disabled:            withAlpha(#8b8f86, 0.45)      NEW — replaces 7 raw values
text.inverse:             #0c0d0c   (onAccent — ink on a bright fill)
text.placeholder:         #8b8f86   (AA; instructional)
text.ghost:               withAlpha(#8b8f86, 0.55) + italic  (suggested value only)

BORDERS
border.subtle:            withAlpha(<accent>, ALPHA.edge  0.25)
border.default:           #242724   (line)
border.strong:            withAlpha(<accent>, ALPHA.rim   0.42)
border.focus:             #c6f84f   (2px outline, offset 2 — globals.css :focus-visible)

ACTIONS
action.primary:           #c6f84f    ink: #0c0d0c   (15.71:1 ✅)
action.primary.pressed:   #c6f84f + startGlow(0.55 / r22)   — no hue change
action.primary.hover:     #c6f84f + glow(0.32 / r14)        — web/pointer only
action.secondary:         transparent + border.default, text.primary
action.disabled:          text.disabled + opacity 0.45      NEW, replaces 0.3–0.6

STATUS
status.success:           #c6f84f  fill / #c6f84f  text     (role `go`)
status.warning:           #d0cd94  fill / #d0cd94  text     (role `caution`)
status.error:             #d56f3e  fill / #e58a5c  text     (role `danger`)
status.info:              #3c787e  fill / #6cb6bd  text     (role `info`)
status.neutral:           #8b8f86  both                     (role `neutral`)
premium:                  #d0cd94  fill / #d0cd94  text  — admin-overridable
                          (`theme.premiumAccent`; resolve via resolvePremiumAccent)

FITNESS / DATA
data.performance:         #c6f84f   (HPI / trajectory line)
data.strength:            #c6f84f   (kindStroke strength, e1RM)
data.cardio:              #6cb6bd   (kindStroke cardio, endurance lanes; fill #3c787e)
data.recovery:            #8ba0cc   (readiness kept-arc, recovery prompts; fill #8296c4)
data.nutrition.energy:    #c6f84f   (kcal ring)
data.nutrition.protein:   #6cb6bd   (fill #3c787e)
data.nutrition.carbs:     #d0cd94
data.nutrition.fat:       #8ba0cc   (fill #8296c4)
data.goal:                #c6f84f   (target met / on-track)
data.personalRecord:      #e6c34e   (gold — the ★/✦ mark and PR badges ONLY)
data.sleep:               NOT FOUND IN CODEBASE — do not invent one until the
                          surface exists
data.heartRate:           NOT FOUND IN CODEBASE — HR is rendered as figures, not
                          zone colour
data.intensity ramp:      #3c787e → #c6f84f → #d0cd94 → #d56f3e   (loadColor,
                          conditioningColor; `repZoneColor` MUST be re-ordered
                          onto this direction — see §5.8)

CHARTS   (ordered categorical; first three are the only ones most charts need)
chart.1:                  #c6f84f
chart.2:                  #6cb6bd
chart.3:                  #d0cd94        ← raise to ΔE ≥ 18 vs chart.1 (today 17.4)
chart.4:                  #8ba0cc
chart.5:                  #e58a5c
chart.grid:               #242724
chart.axis:               #8b8f86
chart.sequential:         #33420f #4c6414 #6f8f1c #9cc32d #c6f84f   (the existing
                          exercise-page ramp, promoted out of the component)

DARK MODE   — the only mode. Every value above IS the dark mapping.
LIGHT MODE  — NOT FOUND IN CODEBASE. Removed deliberately in Aug 2026
              (capability `light-theme-removed`). Reintroducing it means
              re-deriving `accentText` per theme; `contrast.ts` + `palette.test.ts`
              already loop over `ThemeName`, so the machinery survives.
```

Tokens deliberately **not** created: `background.tertiary` (there is no third
surface and inventing one would need a value nobody has designed),
`surface.secondary` (same), `action.secondary.hover` (no pointer on the product
surface), a `neutral-0…900` ramp (this app has two surfaces by design).

---

## 10. Implementation plan

Priorities: **CRITICAL** = actively wrong on screen or in CI; **HIGH** = fix
before the next TestFlight; **MEDIUM** = consistency; **LOW** = refinement.

### CRITICAL

| # | File | Change |
|---|---|---|
| C1 | `apps/web/app/error.tsx:60`, `apps/web/app/global-error.tsx:55` | `#2a2d2a` → `#242724`. Same stale value the mobile fallback was fixed for. |
| C2 | `apps/web/__tests__/` (new `fallback-palette.test.ts`) | Port `apps/mobile/lib/error-boundary-palette.test.ts` to the six web files that hardcode the palette (`error`, `global-error`, `not-found`, `page`, `privacy`, `terms`). Read as text, diff against `colors`. |
| C3 | `packages/core/src/theme/palette.test.ts:82` | Widen `COST_ROLES` to **all** role pairs. Expect `go`/`caution` to fail at 17.4 → retune `amber` (e.g. warm it or drop luminance until ΔE ≥ 18 vs `lime`) **or** lower `DISTINCT_ROLE_DE` with the argument written down. Do not leave the floor unenforced. |
| C4 | `packages/core/src/theme/palette.test.ts` | Add: `onAccent` vs **every** fill ≥ AA. Today only `accent` is tested; `blue` would fail at 3.88. |
| C5 | `apps/mobile/app/workout.tsx:2833–2835` | `chalk`-on-`violet` CTA is **2.67:1**. Repaint as the standard primary (`lime` fill + `onAccent`) or use `violet` as an outline with `txt(C, C.violet)` text. |
| C6 | `apps/mobile/components/aurora/user-recipes.tsx:541` | `#fff` on `red` is **3.40:1**. Use `onAccent` (5.72:1) or make it a destructive outline button. |

### HIGH

| # | File | Change |
|---|---|---|
| H1 | `packages/core/src/theme/tokens.ts`, `palette.ts`, `globals.css:13`, `apps/web/lib/ui.tsx:44` | **Retire `card`.** Migrate the 7 mobile + 15 web sites to `ink2` (they render identically). Keep the key as a deprecated alias for one release, then delete. Record as `retired` in `capabilities.ts`. |
| H2 | `apps/web/components/admin/flags.tsx:192` | delete `CARD_DARK`, use `INK2`. |
| H3 | `apps/mobile/components/aurora/{trends.tsx:86, week-verdict.tsx:635, endurance-summary.tsx:98}`, `components/workout-wrapped.tsx:547` | One `deltaRole(dir)` in core returning `go`/`danger`/`neutral`; wire `statSubTone()` (currently 0 consumers) to it. Pick **red** for down — three of four surfaces already do. |
| H4 | `apps/mobile/components/aurora/nutrition.tsx:2181,2621,2670` + the 13 `withAlpha(C.ash, .533/.6)` sites | Two placeholder tokens only: `text.placeholder` (`ash`, AA) and `text.ghost` (55% + italic, *suggested values only*). Delete `C.line` and `#3a3d34` as placeholder inks. |
| H5 | `packages/core/src/plan-program.ts:294` | `repZoneColor` inverts the intensity ramp. Re-order to `blue → lime → amber` in the same direction as `loadColor`, or rename it so it is not read as an intensity. |
| H6 | new `packages/core/src/theme/semantic-tokens.ts` | Introduce the §9 semantic layer. Mobile resolves via `lib/theme.tsx`, web via `globals.css` vars + `lib/ui.tsx`. |
| H7 | `apps/web/__tests__/` (new) | Port the hex-literal ratchet from `apps/mobile/lib/design-tokens.test.ts:814–852`, seeded at today's web count. |

### MEDIUM

| # | File | Change |
|---|---|---|
| M1 | `plan-program.ts:233`, `session-feel.ts:29`, `readiness-feeling.ts:18`, `activity.ts:10`, `social.ts:110,666`, `engines/fitness-level.ts:592`, `recipes.ts:26`, `notes.ts:19`, `aurora/team-compare.tsx:11` | Collapse the 11 unions onto `AccentKey` / `SemanticRole`. Delete `loadHex` (`percent-program.tsx:48`) and `toneColor` (`aurora/settings.tsx:135`) in favour of one resolver per client. |
| M2 | `apps/web/lib/ui.tsx:94`, 16 `color-mix` sites, `globals.css` | Route web tints through `tint(colour, ALPHA.x)`; retire the ten ad-hoc percentages. |
| M3 | `apps/mobile/components/tour.tsx:36`, `apps/web/components/admin/users.tsx:352,499,739` + 3 web rgba scrims | One `overlay.scrim` (`ink`) × `motion.scrim*`. |
| M4 | ~50 sites both clients | `text.disabled` / `action.disabled` instead of raw `opacity: 0.3–0.6`. |
| M5 | `packages/core/src/semantic.ts:26` | Split `premium` off `amber`, **or** write down why commerce and caution share a hue and ban them from co-occurring. |
| M6 | `packages/core/src/plans.ts:88–160` | Reduce 19 goal hues to an ordered 8-hue set assigned by category; add a ΔE guard. Fix the three that fail AA as text (`run`, `crossfit`, `mobility`). |
| M7 | `apps/web/lib/email.ts:51–53` | `#c6f135` → `#c6f84f`; `#2a2c2a` → `#242724`; `#e9e9e9`/`#ffffff` → `#f3f4ef`. |
| M8 | `apps/web/app/invite/[token]/page.tsx:14–19` | Replace the six-value local micro-palette with the tokens (`#f3f5ef`→chalk, `#a7ad9e`→ash, `#2a2e28`→line, `CARD`→`INK2`). |
| M9 | `apps/web/components/admin/agents.tsx:721`, `admin/audit.tsx:114` | `#e06666` → `RED`; `#0a0b0a` → `INK`. |

### LOW

| # | File | Change |
|---|---|---|
| L1 | `apps/mobile/components/aurora/icons.tsx:178` | Make `color` required on `AuroraIcon` (as `Glyph` already is). Remove the `?? "#000"` default. |
| L2 | `apps/web/app/globals.css` | Delete the orphaned block: `--premium-accent*`, `--accent-text`, `--back-surface`, `--back-shadow`, `--cover-bleed`, `.aurora-navglass`, `.start-glow`, `.ghost-ph`, `.skip-link`, `.motion-*`, the `::view-transition` section (~200 lines). Add a comment on `--color-red`/`--color-gold` noting they are reached only via `roleVar()`/`accentText()` interpolation. |
| L3 | `packages/core/src/theme/tokens.ts:22` | Rename `violet` → `steel` with a deprecated alias, or write the legacy-name note into the type. |
| L4 | `packages/core/src/theme/index.ts:9` | Remove the reference to the non-existent `templates.ts`; correct "light/dark surface palettes" to dark-only. |
| L5 | `apps/mobile/app/leaderboard.tsx:16`, `aurora/profile.tsx:805,807`, `aurora/run-track.tsx:90`, `aurora/hero.tsx:196`, `percent-program.tsx:295` | Name the deliberate off-palette literals (`MEDAL_INK` already is; the others are not) or move them onto tokens. `#0d0e0d` (ΔE 0.2 from ink) and `#5a5e56` should simply become `ink` and `ash`. |
| L6 | `apps/mobile/lib/ui.tsx` `cardShadow()` vs `globals.css:39` `--shadow-card` | 0.18 vs 0.55 opacity for "the one card shadow". Reconcile or document the platform difference. |

### Migration strategy

The system is large (~1 900 colour call sites) but the migration is safe because
**every step is value-preserving except the four that are deliberately not.**

1. **Land the guards first, red.** C2, C3, C4, H7. A failing test that names the
   number is the record of the decision; fix the values in the same PR.
2. **Fix the four real defects.** C1, C5, C6, H4 — these change pixels and are
   the only user-visible items in the whole plan besides M6.
3. **Collapse duplicates by aliasing, not by sweeping.** For H1/L3, keep the old
   key exported as a deprecated alias pointing at the survivor; the codebase
   compiles unchanged and every call site renders **byte-identically** (ΔE 0.3
   is not a visual change). Burn the alias down with a ratchet, then delete.
4. **Introduce the semantic layer additively.** H6 ships `semantic-tokens.ts`
   *alongside* the primitives. Nothing breaks; new code uses it. Then ratchet
   direct primitive imports in components down from ~1 280 with a dated burn-down,
   exactly as `design-tokens.test.ts` already does for `fontSize`.
5. **Unify the accent unions with type aliases.** M1 is `type LoadColor = AccentKey`
   — a compile-time-only change; the runtime values are already identical.
6. **Do the goal palette last (M6)**, because it is the only genuinely
   *designed* change in the list and needs a review pass, not a refactor.

Order 1→3 is one PR. 4→5 is a second. 6 is its own.

**Run after every step:** `pnpm --filter @hybrid/core test`,
`pnpm --filter @hybrid/mobile test` (this is where the design-token ratchets and
the Expo guard live — `typecheck` passing says nothing about them),
`pnpm --filter @hybrid/web typecheck && build`, and
`cd apps/mobile && npx expo export --platform ios --output-dir /tmp/x`.

---

## Appendix A — measured contrast (WCAG 2.x)

Foreground on each surface. `AA` = ≥ 4.5 (normal text); `AA-large` = ≥ 3.

| Colour | on `ink` | on `ink2` | on `card` | on `line` |
|---|---|---|---|---|
| `chalk` #f3f4ef | 17.61 | 16.45 | 16.30 | 13.66 |
| `ash` #8b8f86 | 5.91 | 5.52 | 5.47 | 4.58 |
| `lime` #c6f84f | 15.71 | 14.67 | 14.54 | 12.18 |
| `blue` #3c787e | **3.88** | **3.62** | **3.59** | **3.01** |
| `violet` #8296c4 | 6.59 | 6.16 | 6.10 | 5.11 |
| `amber` #d0cd94 | 11.91 | 11.12 | 11.02 | 9.23 |
| `red` #d56f3e | 5.72 | 5.35 | 5.30 | 4.44 |
| `gold` #e6c34e | 11.39 | 10.64 | 10.54 | 8.83 |
| `blue-text` #6cb6bd | 8.40 | 7.85 | 7.78 | — |
| `violet-text` #8ba0cc | 7.42 | 6.93 | 6.86 | — |
| `red-text` #e58a5c | 7.53 | 7.03 | 6.97 | — |

Surface separation: `ink`↔`ink2` **1.07**, `ink`↔`card` **1.08**,
`ink2`↔`card` **1.01**, `card`↔`line` **1.19**.

## Appendix B — measured CIEDE2000 (accent-text channel)

| | blue | violet | amber | red | ash |
|---|---|---|---|---|---|
| **lime** | 38.8 | 55.3 | **17.4** | 48.1 | 35.2 |
| **blue** | — | 20.0 | 28.4 | 41.1 | 19.9 |
| **violet** | | — | 41.1 | 37.2 | 22.5 |
| **amber** | | | — | 29.0 | 22.5 |
| **red** | | | | — | 27.1 |

Project floor: `DISTINCT_ROLE_DE = 18` (`packages/core/src/contrast.ts`).
