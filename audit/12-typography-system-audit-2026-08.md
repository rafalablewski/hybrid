# 12 — Typography System Audit (Aug 2026)

A reverse-engineering audit of the type system **as implemented**, across
`packages/core`, `apps/mobile` (the product), `apps/web` (backend + admin
panel), the iOS widget/Watch targets, and transactional email.

Nothing here was redesigned. Every number is quoted from a file, and every
count was measured against the tree at `f67d2df`. Where the codebase does not
answer a question, this document says **NOT FOUND IN CODEBASE** rather than
guessing.

**Method.** Static census over `apps/mobile/{app,components,lib}` and
`apps/web/{app,components,lib}` (`.ts`/`.tsx`, tests excluded), the CSS in
`apps/web/app/globals.css`, the Swift in `apps/mobile/targets/*`, plus a real
`npx expo export --platform ios` to measure what the binary actually carries.
The mobile ratchet counts (44 raw `fontSize`, 39 raw `lineHeight`, 0
`fontWeight`, 0 raw `letterSpacing`) are not estimates — `apps/mobile/lib/
design-tokens.test.ts` asserts them EXACTLY, so they are the live figures.

---

## 1. The fonts

### 1.1 Declared identity

`packages/core/src/theme/tokens.ts` states the whole identity in two faces:

```ts
export const fonts = {
  display: "Archivo",       // headings + body + figures
  mono: "JetBrains Mono",   // numbers / kickers
} as const;
```

A third face — **Archivo Narrow** (`condensed`) — was **retired in Aug 2026**.
The reason is written into the same file: the mobile app never loaded it, so it
existed as a webfont in the browser and a name in the tokens, and nowhere in
the shipping product. ~30 web call sites (all `/admin` chips) moved to Archivo.

### 1.2 Every font in the product

| Font family | Weight | Style | Where used | Native or custom |
|---|---|---|---|---|
| **Archivo** | 400 Regular | normal | Mobile `F.reg` — 229 sites: prose, inputs, empty-state bodies, `ASub` | Custom (`@expo-google-fonts/archivo`) |
| **Archivo** | 600 SemiBold | normal | Mobile `F.semi` — 71 sites: list-row names, secondary emphasis, **the native iOS tab-bar label** (`apps/mobile/app/(tabs)/_layout.tsx:126`) | Custom |
| **Archivo** | 700 Bold | normal | Mobile `F.bold` — 270 sites: card titles, button labels (`APill`), chip labels, hero inline title | Custom |
| **Archivo** | 900 Black | normal | Mobile `F.black` — 272 sites: every screen title, section head, hero/masthead title, the wordmark, most big figures | Custom |
| **Archivo** | 500 Medium | normal | **Never used.** Requested in the web `@import` and shipped inside the mobile bundle | Custom, dead |
| **Archivo** | 800 ExtraBold | normal | **Web only** — 63 `fontWeight: 800` sites in `apps/web`. No mobile equivalent face is loaded | Custom (web), absent on mobile |
| **Archivo** | 100/200/300 + all 9 italics | — | **Never used.** Present in the mobile bundle (see §1.5) | Custom, dead |
| **JetBrains Mono** | 400 Regular | normal | Mobile `F.mono` — **1 151 sites**, the single most-used face in the app: every uppercase eyebrow, all meta lines, small figures, unit suffixes | Custom (`@expo-google-fonts/jetbrains-mono`) |
| **JetBrains Mono** | 700 Bold | normal | Mobile `F.monoBold` — 115 sites: emphasised kickers, `CardFoot` values, `ActionPill`, 4 hero figures | Custom |
| **JetBrains Mono** | 500/600/800 + all italics | — | **Never used.** 500 + 600 are requested in the web `@import`; all are in the mobile bundle | Custom, dead |
| **San Francisco** (`.system`) | `.heavy` / `.bold` / `.semibold` / `.medium` / default | normal | **100 % of the iOS Home-Screen widget** (`apps/mobile/targets/widget/index.swift`) and **100 % of the Apple Watch app** (`apps/mobile/targets/watch/App.swift`) | Native / system |
| **Platform UI font** (SF on iOS, Roboto on Android) | 700 / 800 | normal | `apps/mobile/components/error-boundary.tsx` — **deliberate and documented**: the crash fallback is provider-free, because the font load may be what failed | Native / system |
| **Platform UI font** | — | normal | 72 top-level `<Text>` on mobile that set a size and no face — **accidental** (§4) | Native / system |
| **`system-ui` stack** | 400–900 | normal | 7 web surfaces: `/` landing, `/privacy`, `/terms`, `/invite/[token]`, `not-found`, `error`, `global-error` | Native / system |
| **`ui-monospace` stack** | 400 | normal | Kickers on `/` landing, `error`, `global-error` | Native / system |
| **Arial / Helvetica** | 800 (renders 700), 400 | normal | **All transactional email** — `apps/web/lib/email.ts:51` | Native / system |

### 1.3 Fallback stacks

| Surface | Display fallback | Mono fallback | Defined in |
|---|---|---|---|
| Web (CSS var) | `"Archivo", system-ui, sans-serif` | `"JetBrains Mono", ui-monospace, monospace` | `apps/web/app/globals.css:26-27` |
| Web (TSX constant) | `'Archivo', sans-serif` — **no `system-ui` rung** | `'JetBrains Mono', monospace` | `apps/web/lib/ui.tsx:139-141` |
| Mobile | None. React Native has no fallback chain: `fontFamily: "Archivo_700Bold"` either resolves or the OS substitutes silently | — | `apps/mobile/lib/ui.tsx:294` |

The two web stacks **disagree** (the TSX constant drops `system-ui`), and the
TSX constant is what nearly all web components actually use.

### 1.4 Font files and loading

**Mobile** — `apps/mobile/app/_layout.tsx:194-201`:

```ts
const [loaded] = useFonts({
  Archivo_400Regular, Archivo_600SemiBold, Archivo_700Bold, Archivo_900Black,
  JetBrainsMono_400Regular, JetBrainsMono_700Bold,
});
```

Six faces registered. The names are **expo-font aliases**, not PostScript
names — see `apps/mobile/lib/ui.tsx:315-360`, which carries `F_POSTSCRIPT` +
`nativeFace()` because SwiftUI's `Font.custom` goes to Core Text directly,
does not know the aliases, and **silently draws San Francisco** when it can't
resolve one. `apps/mobile/lib/native-face.test.ts` parses the `name` table
(ID 6) out of the shipped `.ttf` files and fails the build if the map drifts.

**Web** — `apps/web/app/globals.css:5`, mirroring
`packages/core/src/theme/tokens.ts` `fontImportUrl`:

```
https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap
```

Ten weights requested. Six are used (Archivo 400/600/700/800/900, JBM 400/700
— Archivo 500, JBM 500 and JBM 600 have **zero** call sites; no Tailwind
`font-*` weight utility appears anywhere either).

### 1.5 What the iOS binary actually carries — measured

`npx expo export --platform ios` produces **97 assets, of which 34 are `.ttf`,
totalling 4 044 KB.**

The cause is one import style. `apps/mobile/app/_layout.tsx:12` imports from
the package **barrel**:

```ts
import { useFonts, Archivo_400Regular, … } from "@expo-google-fonts/archivo";
```

`node_modules/@expo-google-fonts/archivo/index.js` is 18 top-level
`require('./…ttf')` calls (9 weights × roman + italic); jetbrains-mono is 16.
Metro has no tree-shaking for that shape, so **all 34 faces are bundled and
only 6 are registered**. Roman-only source weight for the six used faces is
**712 KB** — so roughly **3.3 MB of the app download is font data that can
never be drawn.**

The fix is the per-weight subpath import
(`@expo-google-fonts/archivo/400Regular`), which is what the packages provide
those directories for.

### 1.6 Platform differences

| Axis | Mobile (the product) | Web (admin + landings) | iOS widget / Watch |
|---|---|---|---|
| Weight mechanism | **A FACE** — `fontFamily: F.bold`. `fontWeight` is a build failure (`design-tokens.test.ts`, one exemption) | **A NUMBER** — `fontWeight: 800`, 137 sites over 5 weights | SwiftUI `.weight(.heavy)` etc. |
| Heading weight | 900 (`F.black`) or 700 (`F.bold`) | **800** (63 sites), 900 (6) | `.heavy` |
| Tracking | dp, tokenised (`tracking.*`, `trackFigure`) — 0 raw sites | em, **untokenised** — 12 distinct literals | none |
| Leading | ratio via `leading(size, role)` — 39 raw absolutes remain | 12 distinct raw ratios | SwiftUI default |
| Tabular numerals | `TABULAR` spread, enforced at the primitives | `tabular` const, enforced at the primitives | not set |
| Dynamic Type | honoured; capped at 1.4 (reflow) / 1.15 (fixed chrome) | browser zoom only | system |

The **weight mechanism is the sharpest divergence**: mobile's `F.black` is 900
and its `F.bold` is 700, while web's default heading weight is 800 — a face
the mobile app does not load. The two admin consoles, which project policy
requires to stay in step, therefore cannot draw the same heading.

### 1.7 Components that override the global typography

| Override | File | Sanctioned? |
|---|---|---|
| Share/Wrapped cards size type as a fraction of canvas width (`width * 0.072`, `* 0.092`, `* 0.3`) | `apps/mobile/lib/share.tsx` | **Yes** — exempted by name in `design-tokens.test.ts`; a PNG at arbitrary width is its own system |
| One-time-code fields use `letterSpacing: 8` / `3` to say "discrete digits" | `apps/mobile/components/aurora/login.tsx`, `…/mfa-settings.tsx` | **Yes** — exempted, semantic spacing |
| Crash fallback uses the platform font + `fontWeight` | `apps/mobile/components/error-boundary.tsx` | **Yes** — provider-free by design |
| Streak hairline mark at **9.5 dp**, below the app's own 10 dp floor | `packages/core/src/streak-mark.ts:37` | **Yes** — documented; it must not grow the 44 pt header row. Invisible to the mobile floor guard because the value lives in core |
| `HERO_FIGURE` at 76 dp, above the `fs.stat` ceiling | `packages/core/src/hero.ts:390` | **Yes** — a takeover panel is not "inside a page" |
| SwiftUI leaf hardcodes `size: 11` | `apps/mobile/components/aurora/swiftui.tsx:474` | **No** — invisible to the ratchet, which greps `fontSize:` not `size:` |
| iOS widget + Watch use SF at 9 hand-picked sizes | `apps/mobile/targets/*` | **Undocumented** — no comment states an intent either way |
| Email uses Arial/Helvetica | `apps/web/lib/email.ts` | **Undocumented** (defensible for email, but unwritten) |

---

## 2. The complete type scale, as implemented

### 2.1 The primitive ladders (`packages/core/src/scale.ts`)

**Sizes** — px on web, dp on mobile, one map for both clients:

| Rung | Value | Documented job | Mobile sites | Web sites |
|---|---|---|---|---|
| `fs.nano` | 10 | micro mono eyebrow labels | 449 | 62 |
| `fs.micro` | 11 | tiny secondary labels | 344 | 132 |
| `fs.caption` | 12 | meta / secondary text | 463 | 145 |
| `fs.body` | 13 | default reading text | 301 | 128 |
| `fs.bodyLg` | 14 | emphasised body / primary list line | 146 | 90 |
| `fs.note` | 15 | small lead | 149 | 9 |
| `fs.subtitle` | 16 | small headings | 122 | 14 |
| `fs.title` | 18 | section titles | 82 | 6 |
| `fs.heading` | 20 | screen sub-headings | 29 | 4 |
| `fs.headline` | 22 | head of a screen owning no hero | 22 | 1 |
| `fs.display` | 26 | screen headings | 31 | 2 |
| `fs.hero` | 34 | mastheads / cover titles | 3 | 2 |
| `fs.stat` | 46 | the ONE hero figure on a screen — the ceiling | 19 | 1 |

Totals: **2 160 tokenised sites on mobile, 596 on web.**

**Leading** — ratios, `leading(size, role)` returns dp:
`lh.tight 1.15` · `lh.snug 1.30` · `lh.normal 1.50` · `lh.relaxed 1.62`

**Tracking** — dp:
`tracking.display −0.5` · `tracking.normal 0` · `tracking.label 0.9` ·
`tracking.caps 1.2` · `trackFigure(size) = round(size × −0.035, 0.1)`

**Numerals** — `TABULAR_NUMS = "tabular-nums"`, `MONO_ADVANCE_EM = 0.6`,
`fitMonoFigure(text, width, sizes, scale)`.

### 2.2 Every meaningful style in the product

Face column: **Ar** = Archivo, **JBM** = JetBrains Mono. Mobile is the product,
so mobile values are given; web is noted where it differs.

| Token / Name | Font | Weight | Size | Line height | Letter spacing | Usage |
|---|---|---|---|---|---|---|
| Hero cover title | Ar Black | 900 | `fs.hero` 34 (→28 if >28 chars) | 36 (→31) = 1.06 | −0.03em → **−1.02 dp** | Cover-rank screen heads. `hero.ts:334` |
| Hub masthead title | Ar Black | 900 | `fs.hero` 34 (→28) | 36 (→31) | `tracking.display` **−0.5 dp** | Tab-root mastheads. `hub-masthead.ts:63` |
| Takeover figure | Ar Black | 900 | **76** | 78 = 1.03 | −0.04em → −3.0 dp | Wrapped count-up. `hero.ts:390` |
| Screen title (`title` rank) | Ar Black | 900 | `fs.display` 26 | 32 = 1.23 | −0.02em → −0.52 dp | `hero.ts:333` |
| `AHeading` | Ar Black | 900 | `heroTitleType` (= `fs.display` 26) | from `heroTitleType` | `tracking.display` −0.5 | Screens with no hero. `kit.tsx:1539`. Rejects a caller-supplied size |
| Wordmark | Ar Black | 900 | **19** | — | `tracking.display` −0.5 | `app-header.ts:40` |
| Collapsed bar title | Ar Bold | 700 | `fs.subtitle` 16 | 20 = 1.25 | −0.01em → −0.16 dp | `HERO_INLINE_TITLE`, `hero.ts:327` |
| Section head title | Ar Black | 900 | `fs.title` 18 | `leading(18,"snug")` 23 | 0 | `ASection`, `kit.tsx:1506` (+42 hand-rolled `F.black`+`fs.title`) |
| Section head kicker | JBM | 400 | `fs.micro` 11 | — | `tracking.label` 0.9, UPPERCASE | `kit.tsx:1494` |
| H2 / sub-heading | Ar Black | 900 | `fs.heading` 20 | — | 0 or −0.5 | 29 sites; **both trackings in use** |
| Screen head, no hero | Ar Black | 900 | `fs.headline` 22 | — | — | 22 sites. Banned inside hub screens by `hub-masthead.test.ts` |
| Card title | Ar Bold | 700 | `fs.subtitle` 16 | — | 0 | 52 sites — the app's most common card title |
| Card title (alt) | Ar Black | 900 | `fs.subtitle` 16 | — | 0 | 26 sites — same role, heavier face |
| Empty-state title | Ar Black | 900 | `fs.subtitle` 16 | — | 0 | `Empty`, `kit.tsx:2162` |
| Empty-state body | Ar Reg | 400 | `fs.body` 13 | `leading(13)` 20 | 0 | centred, `maxWidth: 300`. `kit.tsx:2163` |
| Body | Ar Reg | 400 | `fs.body` 13 | `leading(13)` 20 | 0 | 44 sites carry the leading; 34 omit it |
| Body large | Ar Reg | 400 | `fs.bodyLg` 14 | `leading(14)` 21 | 0 | 21 sites with leading, 18 without |
| Lead / sub (`ASub`) | Ar Reg | 400 | `fs.note` 15 | `leading(15,"relaxed")` 24 | 0 | `kit.tsx:1939` |
| Secondary body | Ar Reg | 400 | `fs.caption` 12 | `leading(12)` 18 | 0 | 34 sites |
| Caption / meta | JBM | 400 | `fs.caption` 12 | — | 0 | **218 sites** — the biggest single combination |
| Meta line (`Meta`) | JBM | 400 | `fs.micro` 11 | — | 0, ash | `aurora/meta.tsx:17` |
| Hero metadata (all 3 slots) | JBM | 400 | `fs.micro` 11 | 14 = 1.27 | 0.08em → **0.88 dp**, UPPERCASE | `HERO_META_TYPE`, `hero.ts:409` |
| Hub masthead meta | JBM | 400 | `fs.micro` 11 | 15 = 1.36 | `tracking.label` **0.9 dp**, UPPERCASE | `hub-masthead.ts:59` |
| Eyebrow / kicker (A) | JBM | 400 | `fs.nano` 10 | — | `tracking.label` 0.9, UPPERCASE | **144 sites** |
| Eyebrow / kicker (B) | JBM | 400 | `fs.nano` 10 | — | `tracking.caps` 1.2, UPPERCASE | **64 sites** |
| Eyebrow at micro (A) | JBM | 400 | `fs.micro` 11 | — | `tracking.caps` 1.2, UPPERCASE | 58 sites |
| Eyebrow at micro (B) | JBM | 400 | `fs.micro` 11 | — | `tracking.label` 0.9, UPPERCASE | 22 sites |
| Untracked mono nano | JBM | 400 | `fs.nano` 10 | — | none, mixed case | 134 sites |
| Card-foot label | JBM | 400 | `fs.nano` 10 | — | `tracking.caps` 1.2, UPPERCASE | `kit.tsx:2206` |
| Card-foot value | JBM Bold | 700 | `fs.micro` 11 | — | `tracking.label` 0.9, UPPERCASE | `kit.tsx:2230` |
| Streak mark (hairline) | JBM | 400 | **9.5** | — | `tracking.caps` 1.2, UPPERCASE | `streak-mark.ts:37` — below the 10 dp floor, by decision |
| Streak mark (inline) | JBM | 400 | `fs.micro` 11 | — | 0, sentence case | `streak-mark.ts:38` |
| Button (`APill`) | Ar Bold | 700 | `fs.subtitle` 16 | — | 0 | `kit.tsx:840, 857` |
| Button, compact | Ar Bold | 700 | `fs.note` 15 | — | 0 | same file |
| Web button | Ar | **700** | `fs.note` 15 / `fs.body` 13 compact | — | 0 | `apps/web/lib/ui.tsx:317` |
| Action pill (mono) | JBM Bold | 700 | `fs.micro` 11 | — | `tracking.label` 0.9, UPPERCASE | `kit.tsx:2267` |
| Chip (`AChip`) | Ar Bold | 700 | `fs.body` 13 | — | 0 | `kit.tsx:973` |
| Chip count | JBM | 400 | `fs.caption` 12 | — | 0 | `kit.tsx:959` |
| Dock-rail chip | JBM | 400 | `fs.caption` 12 | — | `tracking.normal` **0 — explicitly zero** | `dock-rail.ts:68-77` |
| Segmented control | Ar Bold | 700 | `fs.body` 13 | — | 0 | `kit.tsx:1293` |
| Segment badge | JBM Bold | 700 | `fs.nano` 10 | — | 0 | `kit.tsx:1300` |
| Tab-bar label | Ar SemiBold | 600 | **NOT FOUND IN CODEBASE** — native `NativeTabs`, size is the system's | system | system | `app/(tabs)/_layout.tsx:126` |
| Input (`AField`) | Ar Reg | 400 | `fs.note` 15 | — | 0 | `kit.tsx:1142`, `paddingVertical: 17` |
| Admin input | JBM | 400 | `fs.bodyLg` 14 | — | 0 | `components/admin/_kit.tsx:93` |
| Input label | JBM | 400 | `fs.micro` 11 | — | 0 | `components/admin/_kit.tsx:84` |
| Stat label (`AStat`) | JBM | 400 | `fs.micro` 11 | — | `tracking.label` 0.9, UPPERCASE | `kit.tsx:1599` |
| Stat value (`AStat`) | Ar Black | 900 | `fs.hero` 34 | `leading(34,"tight")` 39 | 0, **tabular** | `kit.tsx:1607` |
| Stat delta | JBM | 400 | `fs.caption` 12 | — | 0 | `kit.tsx:1616` |
| Hero figure (A) | Ar Black | 900 | `fs.stat` 46 | `leading(46,"tight")` 53 **or** 46 **or** `leading(46)` 69 | `trackFigure(46)` −1.6 | 14 sites |
| Hero figure (B) | **JBM Bold** | 700 | `fs.stat` 46 | `leading(46,"tight")` | `trackFigure(46)` −1.6 | 4 sites — `builder.tsx:254`, `sport-page.tsx:258,284`, `feed-card.tsx:281` |
| Scrub-field figure | Ar Black | 900 | `fs.hero` 34 | `leading(34,"tight")` | `tracking.display` −0.5 | `kit.tsx:1853` |
| Stepper value (hero) | Ar Black | 900 | `fs.title` 18 | — | 0 | `kit.tsx:1727` |
| Stepper value | JBM | 400 | `fs.bodyLg` 14 | — | 0 | `kit.tsx:1728` |
| Meter label | Ar Bold/SemiBold | 700/600 | `fs.caption` 12 | — | 0 | `kit.tsx:1436` — face varies with `emphasis` |
| Meter value | JBM | 400 | `fs.caption` 12 | — | 0 | `kit.tsx:1442` |
| Price | Ar Black | 900 | **28 (raw)** | — | `tracking.display` −0.5 | `aurora/upgrade.tsx:143` |
| Price unit | Ar Reg | 400 | `fs.bodyLg` 14 | — | 0 | same line |
| Toast | JBM | 400 | `fs.caption` 12 | — | `tracking.label` 0.9, UPPERCASE | `aurora/toast.tsx:109` |
| Error message (A) | JBM | 400 | `fs.caption` 12 | `leading(12)` 18 | 0, red | 9 of 19 `role="alert"` sites |
| Error message (B) | Ar Reg | 400 | `fs.body` 13 | — | 0 | 2 sites |
| Error message (C) | JBM | 400 | `fs.bodyLg` 14 / `fs.body` 13 | — | 0 | 2 sites |
| Crash-screen title | platform | 800 | `fs.heading` 20 | — | 0 | `error-boundary.tsx:82` |
| Avatar initials | Ar Bold | 700 | `size × 0.36` | — | 0 | `kit.tsx:2125` |
| Brand mark glyph | Ar Black | 900 | `size × 0.42` | — | 0 | `kit.tsx:313` |
| Rail tail label | shared `w.explore.seeAll` | — | — | 15 | — | `aurora/rail-tail.tsx:91` |
| Web landing H1 | system-ui | 900 | **44** | — | −0.05em | `apps/web/app/page.tsx:41` |
| Web legal H1 / H2 / body | system-ui | 800 / 700 / 400 | 30 / 20 / 16 | 1.65 | 0 | `apps/web/app/{privacy,terms}/page.tsx` |
| Web admin panel title | Ar | **900** | `isMobile ? 24 : 30` | — | −0.03em | `apps/web/components/admin/panel.tsx:294` |
| Web admin table header | JBM | 400 | **9 px** | — | .08em, UPPERCASE | `apps/web/app/globals.css:387` |
| Widget streak figure | **SF** | `.heavy`, `.rounded` | 20 | — | — | `targets/widget/index.swift:73` |
| Widget title | **SF** | `.heavy` | 15 / 18 | — | — | `…:105` |
| Watch title | **SF** | `.heavy` | 17 | — | — | `targets/watch/App.swift:71` |
| Email wordmark / H1 / body | **Arial** | 800 / default / 400 | 20 / 20 / — | — | −0.02em | `apps/web/lib/email.ts:51-53` |

**Dates** and **numbers-in-prose** have no dedicated token: dates render as
`Meta` (JBM `fs.micro` ash) or as caption mono. **NOT FOUND IN CODEBASE:** a
distinct date or timestamp type style.

---

## 3. Source of truth

### 3.1 Where each axis is defined

| Axis | Definitive file | Notes |
|---|---|---|
| Font families (names) | `packages/core/src/theme/tokens.ts` — `fonts` | Names only; carries the Archivo Narrow retirement rationale |
| Google Fonts URL | `packages/core/src/theme/tokens.ts` — `fontImportUrl` | **Literal duplicated** in `apps/web/app/globals.css:5`; the file comments ask that they be kept in step, nothing enforces it |
| Size ladder | `packages/core/src/scale.ts` — `fs` | 13 rungs, both clients |
| Leading | `packages/core/src/scale.ts` — `lh`, `leading()` | Ratios; `leading()` is the mobile entry point |
| Tracking | `packages/core/src/scale.ts` — `tracking`, `trackFigure()`, `TRACK_FIGURE_EM` | dp |
| Numerals | `packages/core/src/scale.ts` — `TABULAR_NUMS`, `MONO_ADVANCE_EM`, `fitMonoFigure()` | |
| Mobile face aliases | `apps/mobile/lib/ui.tsx:294` — `F` | expo-font aliases |
| Mobile PostScript names | `apps/mobile/lib/ui.tsx:346` — `F_POSTSCRIPT`, `nativeFace()` | For SwiftUI only |
| Mobile font registration | `apps/mobile/app/_layout.tsx:194` | |
| Dynamic Type caps | `apps/mobile/lib/ui.tsx:53-54` — `MAX_FONT_SCALE 1.4`, `FIXED_FONT_SCALE 1.15` | |
| Screen-head type ramp | `packages/core/src/hero.ts` — `TITLE_BASE`, `HERO_INLINE_TITLE`, `HERO_FIGURE`, `HERO_META_TYPE`, `heroTitleType()`, `titleStepDown()` | **em** |
| Hub masthead type | `packages/core/src/hub-masthead.ts` — `HUB_MASTHEAD` | **dp**, by explicit decision (lines 28-32) |
| App header type | `packages/core/src/app-header.ts` — `APP_HEADER.wordmark`, `.badge.text` | |
| Dock rail type | `packages/core/src/dock-rail.ts` — `DOCK_RAIL.chip` | |
| Streak mark type | `packages/core/src/streak-mark.ts` — `STREAK_MARK` | |
| Web CSS vars | `apps/web/app/globals.css:26-29` — `--font-display`, `--font-mono`, `--font-heading` | Tailwind v4 `@theme` |
| Web page face | `apps/web/app/globals.css:55` — `html, body { font-family: var(--font-display) }` | |
| Web TSX face constants | `apps/web/lib/ui.tsx:139-141` — `disp`, `mono`, `body` | |
| Web tabular | `apps/web/lib/ui.tsx:153` — `tabular` | |
| Component defaults | `apps/mobile/components/aurora/kit.tsx` (`ASection`, `AHeading`, `AStat`, `APill`, `AChip`, `AField`, `AMeter`, `ASub`, `Empty`, `CardFoot`, `ActionPill`, `ASegment`, `AStepper`, `AScrubField`, `Avatar`, `AuroraMark`) | The de-facto component-level type system |
| Enforcement | `apps/mobile/lib/design-tokens.test.ts`, `apps/mobile/lib/native-face.test.ts`, `apps/web/__tests__/feed-typography.test.ts`, `apps/web/__tests__/numeric-type.test.ts`, `packages/core/src/aurora-head.test.ts`, `…/hub-masthead.test.ts`, `…/app-header.test.ts` | |

### 3.2 Duplicated values — flagged

| Value | Spelled in | Risk |
|---|---|---|
| The Google Fonts URL | `theme/tokens.ts` `fontImportUrl` **and** `globals.css:5` literal | Two places, comment-enforced only |
| `"Archivo"` / `"JetBrains Mono"` as strings | `theme/tokens.ts` `fonts`; `globals.css` `--font-display`/`--font-mono`/`--font-heading`; `apps/web/lib/ui.tsx` `disp`/`mono`/`body` | **Three** spellings on web; the CSS vars are essentially unused by components |
| Display fallback stack | `globals.css` has `system-ui`; `lib/ui.tsx` does not | Divergent |
| Face names | `F` (aliases) **and** `F_POSTSCRIPT` (PostScript) | Necessary; guarded by `native-face.test.ts` |
| Masthead meta type | `HERO_META_TYPE` (11 / lh 14 / 0.08em) **and** `HUB_MASTHEAD.meta` (11 / lh 15 / 0.9 dp) | Same voice, two definitions, two units, different leading |
| Cover-title tracking | `hero.ts` −0.03em (= −1.02 dp) **and** `hub-masthead.ts` `tracking.display` (−0.5 dp) | Same rung, **2× different tracking** |
| `tracking.display` −0.5 | `scale.ts` token **and** `hero.ts`'s em equivalents | Two units for one axis |
| Uppercase label tracking | mobile dp (0.9 / 1.2) **and** web em (.08 / .12 / .1 / .18 / .25 / .3) | Web has no token at all |
| `lh` ratios | `scale.ts` (1.15/1.3/1.5/1.62) **and** 12 raw ratios in web TSX | Web never imports `lh` |
| Dark surface hexes in type contexts | `globals.css` `@theme` **and** literal `#f3f4ef`/`#0c0d0c`/`#8b8f86` in the 7 system-font web pages | Landings bypass the token layer entirely |

---

## 4. Inconsistencies

### GOOD — consistent and intentional

1. **One size ladder for two clients.** `fs` is 13 rungs shared by web and
   mobile, with 2 756 tokenised call sites. The ladder deliberately **ends at
   46** and states its two exceptions by name.
2. **Weight is a face, not a number, on mobile.** `fontWeight` is zero sites
   outside the crash boundary, and it is a HARD test failure. This closed a
   103-site bug where `fontFamily: F.mono` + `fontWeight: 700` resolved
   differently on iOS and Android.
3. **Tracking is fully tokenised on mobile** — 432 → 0 raw sites, with three
   named exemptions, each argued in the test file.
4. **Big-figure tracking is derived, not typed.** `trackFigure(size)` at
   −0.035em replaced twelve hand-multiplied spellings.
5. **Leading is a ratio.** `leading(size, role)` derives the line box from the
   size, which is what makes Dynamic Type work at all.
6. **Tabular numerals are enforced at the primitives**, not at call sites —
   `RollingNumber`, `AStat`, `CountUp` on both clients.
7. **Dynamic Type is honoured**, never disabled. `allowFontScaling={false}`
   appears zero times. Two named caps, and the 1.15 clamp is only legal in a
   component that declares a hard height.
8. **A 10 dp legibility floor**, HARD, after 98 sites at 8–9 dp were raised.
9. **The screen head is one system at three collapse states** — `hero.ts` is
   genuinely client-agnostic and both clients import it.
10. **The section head is a component**, not prose. `ASection` replaced eight
    re-implementations that agreed on shape and disagreed on every number.
11. **The SwiftUI face bug is fixed and guarded** by parsing the shipped
    `.ttf` `name` tables — an unusually rigorous guard for a silent fallback.
12. **The retired third face is documented**, with the conditions for
    revisiting it, rather than deleted.

### INCONSISTENT — accidental or duplicated

1. **The uppercase eyebrow has two trackings, and the split is inverted.**
   At `fs.nano`: 144 sites at `tracking.label` (0.9) vs 64 at `tracking.caps`
   (1.2). At `fs.micro`: 58 at `caps` vs 35 at `label`. So the *smaller* rung
   is mostly the *tighter* tracking — the opposite of what optical sizing
   wants. `scale.ts` says `label` is "the default for a kicker" and `caps` is
   for "wider, more architectural section labels", but nothing binds either to
   a rung or a role, so the choice is per call site.
2. **A third of the mono nano usage is untracked.** 134 sites at `F.mono` +
   `fs.nano` with no `letterSpacing` and no `textTransform` — 10 dp mono at
   natural sidebearings, beside 208 tracked uppercase siblings.
3. **Card titles use two faces at one rung.** `F.bold` + `fs.subtitle` (52
   sites) and `F.black` + `fs.subtitle` (26 sites) — same size, same job,
   700 vs 900.
4. **The hero figure uses two faces at one rung.** `fs.stat` is `F.black` at
   14 sites and `F.monoBold` at 4 (`builder.tsx:254`, `sport-page.tsx:258` and
   `:284`, `feed-card.tsx:281`).
5. **`fs.stat` has three line heights** — raw `fs.stat` (ratio 1.0),
   `leading(fs.stat, "tight")` (53), and `leading(fs.stat)` (69).
6. **Two masthead systems disagree on tracking at one size.** Both set a title
   at `fs.hero` 34; `hero.ts` gives −1.02 dp, `hub-masthead.ts` gives −0.5 dp.
7. **Two metadata definitions for one voice** — `HERO_META_TYPE` (lh 14,
   0.08em) vs `HUB_MASTHEAD.meta` (lh 15, 0.9 dp).
8. **Core states tracking in two units.** `scale.ts` and `hub-masthead.ts` in
   dp; `hero.ts` in em, converted at each render (`× type.size`).
9. **Body leading is optional in practice.** `F.reg` + `fs.body`: 44 sites
   carry `leading(fs.body)`, 34 do not (and fall to the platform default).
   Same split at `fs.bodyLg` (21 vs 18).
10. **44 raw `fontSize` values survive on mobile** — 19, 21, 22, 23, 25, 27,
    28, 30, 32, 38, 40, 42, 44, 96, and two fractional (11.5, 12.5). The
    burn-down is dated 2026-11-30.
11. **39 raw `lineHeight` values survive on mobile**, 13 of them the same
    `lineHeight: 18` inside `components/admin/*`.
12. **Web has no tracking or leading tokens at all** — 12 distinct em
    letter-spacings and 12 distinct line-height ratios, none imported from
    `scale.ts`, even though `lh` and `tracking` exist and web imports `fs`.
13. **Six hand-rolled section-head components remain** on mobile (ratchet
    ceiling 6, due 2026-10-31).
14. **`--font-heading` is defined and never consumed** — zero references
    outside its own declaration. `--font-display` has exactly one consumer
    (`html, body`); `--font-mono` has two. Every component instead uses the
    literal strings in `apps/web/lib/ui.tsx`.
15. **The web `@import` requests three unused weights** — Archivo 500,
    JetBrains Mono 500 and 600.
16. **Mobile has 48 styles that name a face and no size**, falling to React
    Native's implicit 14 dp default — a rung by accident, not by name.
17. **The web admin panel title is `isMobile ? 24 : 30`** — two off-ladder
    sizes for the panel's own H1, while its mobile twin is a tokenised head.

### PROBLEMATIC — hierarchy, readability, or product quality

1. **~3.3 MB of dead font data ships in the iOS app.** Measured: 34 `.ttf`,
   4 044 KB in the export; 6 faces registered; 712 KB of roman weights
   actually needed. Cause: barrel imports at `_layout.tsx:12-13`. This is the
   single highest-value fix in the audit and it is one import line per package.
   **Severity: High.**
2. **72 top-level `<Text>` set a size and no face — they draw in San Francisco
   beside Archivo.** Worst files: `app/u/[handle].tsx` (18 faceless style
   blocks), `components/coach-programs.tsx` (12), `components/admin/access.tsx`
   (11), `components/admin/content.tsx` (11), `components/aurora/nutrition.tsx`
   (10), `app/coaches.tsx` (7 — confirmed top-level at lines 67, 68, 76, 89,
   160). This is exactly the defect `apps/web/__tests__/feed-typography.test.ts`
   was written for, but that guard covers **three feed files only**. It is also
   precisely the symptom already reported once as "the font is totally bad and
   not consistent". **Severity: High.**
3. **The iOS widget and the Apple Watch app are 100 % San Francisco.** Sixteen
   `.font(.system(size:weight:))` calls across nine sizes (8, 10, 11, 12, 13,
   15, 17, 18, 20), none of them on the app's ladder, none in the app's faces,
   with no comment stating an intent. The widget is a *free daily impression
   on the athlete's home screen* by the strategy note in its own header — and
   it does not look like the product. **Severity: High** (brand), Medium
   (effort — custom fonts must be added to each target's bundle).
4. **The public web surface is not in the brand face.** `/`, `/privacy`,
   `/terms`, `/invite/[token]`, `not-found`, `error`, `global-error` all use
   `system-ui` with hardcoded hexes. These are the pages App Review and every
   invited athlete see first. `error`/`global-error` have a legitimate reason
   (they must render when the app's CSS may have failed); the landing, legal
   and invite pages do not. **Severity: Medium.**
5. **The heading weight differs by platform** — web 800, mobile 900/700. Since
   project policy requires the two admin consoles to stay in step, the same
   admin heading literally cannot be drawn the same on both. **Severity:
   Medium.**
6. **Error messages have four type treatments.** Across 19
   `accessibilityRole="alert"` sites: mono/caption ×9, reg/body ×2,
   mono/bodyLg ×1, mono/body ×1. An error is the moment hierarchy matters
   most. **Severity: Medium.**
7. **9 px uppercase tracked mono in the web admin table headers**
   (`globals.css:387`) — below the 10 dp floor the mobile client enforces as
   HARD, in the least legible combination available (mono + caps + tracked),
   and it is a *column header*, i.e. load-bearing. **Severity: Medium.**
8. **`swiftui.tsx:474` hardcodes `size: 11`** — the mobile ratchet greps
   `fontSize:`, so type inside `@expo/ui` `font({ size })` modifiers is
   entirely outside the guard. **Severity: Low** (one site today), but the
   whole native-leaf surface is ungoverned.
9. **`fs.headline` (22) is a rung the system half-disowns.** `scale.ts`
   documents it as "the head of a screen that owns no hero", `hub-masthead.
   test.ts` bans it inside hub screens, and `home.tsx:928` therefore carries a
   raw `22` for a *card* title because the rename tripped the ban. A rung whose
   correct use requires writing a literal is a rung with a naming problem.
10. **`--font-heading` is dead** — a token any new contributor will reasonably
    reach for, that resolves to nothing anybody else uses.
11. **Transactional email is Arial at `font-weight: 800`.** Arial has no 800,
    so it renders 700. Email being a system-font surface is defensible; the
    weight is simply wrong, and nothing says it was decided.

---

## 5. Reconstructed system

### 5.1 CURRENT IMPLEMENTATION — what the app actually uses

Read off the census, this is the hierarchy the code expresses today:

```
Takeover figure   Archivo Black 900  76 / 78  (1.03)  −3.0dp   [hero.ts HERO_FIGURE]
Hero figure       Archivo Black 900  46 / 53  (1.15)  −1.6dp   [fs.stat + trackFigure]
Cover title       Archivo Black 900  34 / 36  (1.06)  −1.02dp  [hero.ts cover]
Masthead title    Archivo Black 900  34 / 36  (1.06)  −0.5dp   [hub-masthead.ts]
Stat value        Archivo Black 900  34 / 39  (1.15)   0       [AStat]
Screen title      Archivo Black 900  26 / 32  (1.23)  −0.52dp  [hero.ts title, AHeading]
Screen head (no hero)  Archivo Black 900  22 / —          —    [fs.headline, 22 sites]
Sub-heading       Archivo Black 900  20 / —      0 or −0.5dp   [fs.heading, 29 sites]
Section head      Archivo Black 900  18 / 23  (1.30)   0       [ASection]
Card title        Archivo Bold 700   16 / —          0        [52 sites]
Card title (alt)  Archivo Black 900  16 / —          0        [26 sites]
Button            Archivo Bold 700   16 (compact 15)  0        [APill]
Lead / sub        Archivo Reg 400    15 / 24  (1.62)  0        [ASub]
Input             Archivo Reg 400    15 / —          0        [AField]
Body large        Archivo Reg 400    14 / 21  (1.50)  0
Body              Archivo Reg 400    13 / 20  (1.50)  0
Chip / segment    Archivo Bold 700   13 / —          0
Body small        Archivo Reg 400    12 / 18  (1.50)  0
Caption / meta    JetBrains Mono 400 12 / —          0        [218 sites]
Meta line         JetBrains Mono 400 11 / —          0        [Meta]
Hero meta         JetBrains Mono 400 11 / 14  UPPER  0.88dp
Masthead meta     JetBrains Mono 400 11 / 15  UPPER  0.9dp
Eyebrow (micro)   JetBrains Mono 400 11 / —   UPPER  1.2dp | 0.9dp   ← two
Eyebrow (nano)    JetBrains Mono 400 10 / —   UPPER  0.9dp | 1.2dp   ← two
Mono nano, untracked  JetBrains Mono 400 10 / —      0        [134 sites]
Streak hairline   JetBrains Mono 400  9.5 / — UPPER  1.2dp
Tab-bar label     Archivo SemiBold 600  system size
```

### 5.2 RECOMMENDED SYSTEM — what to standardise on

**Design intent: keep every number that exists. Fix the places where one role
has two answers, and close the platform gaps.** Of the twelve rows below, ten
are exactly what ships today; the two marked **CHANGE** are the deliberate
consolidations, and both are stated so the movement is visible rather than
silent.

```
Font family     Archivo (display + body) · JetBrains Mono (figures + labels)
                Mobile: 6 faces via per-weight subpath imports (CHANGE, §7.4)
                Web:    Archivo 400;600;700;900 + JBM 400;700 — drop 500, JBM 500/600
                Fallback: system-ui, sans-serif / ui-monospace, monospace (one stack, one place)

Display         Archivo Black 900 · 34 / 36 (1.06) · trackTitle(34) = −1.0dp
                CHANGE — hub masthead moves −0.5 → −1.0 to match the hero at the same rung

H1              Archivo Black 900 · 26 / 32 (1.23) · trackTitle(26) = −0.8dp
                CHANGE — AHeading moves −0.5 → −0.8

H2              Archivo Black 900 · 20 / 26 (1.30) · trackTitle(20) = −0.6dp
H3              Archivo Black 900 · 18 / 23 (1.30) · trackTitle(18) = −0.5dp   [= ASection today]

Card title      Archivo Bold 700 · 16 / 21 (1.30) · 0     [the 52-site majority wins over F.black]
Body            Archivo Regular 400 · 13 / 20 (1.50) · 0   [leading MANDATORY, not optional]
Body Small      Archivo Regular 400 · 12 / 18 (1.50) · 0
Label           JetBrains Mono 400 · 10 UPPERCASE / 15 · 0.9dp = 0.09em
                CHANGE — ONE tracking for the eyebrow. Collapses mobile's 0.9|1.2 split
                and web's .08|.1|.12|.18|.25|.3 spread onto TRACK_LABEL_EM = 0.09
Caption         JetBrains Mono 400 · 12 / 18 · 0           [the 218-site meta voice]
Button          Archivo Bold 700 · 16 (compact 15) · 0
Metric Large    Archivo Black 900 · 46 / 53 (1.15) · trackFigure(46) = −1.6dp · tabular
                — ONE face at this rung; the 4 F.monoBold sites move to F.black
Metric Medium   Archivo Black 900 · 34 / 39 (1.15) · trackFigure(34) = −1.2dp · tabular
Navigation      Archivo SemiBold 600 · system size (native tab bar) · 0
```

**Two new core primitives, both mirroring an argument `scale.ts` already
makes and wins:**

```ts
/** Titles tighten proportionally, exactly as figures do. Replaces the flat
 *  tracking.display (−0.5) and hero.ts's per-rank em values with ONE number,
 *  in ONE unit (dp), for the 13–34dp title band. */
export const TRACK_TITLE_EM = -0.03;
export const trackTitle = (size: number) => Math.round(size * TRACK_TITLE_EM * 10) / 10;

/** The uppercase eyebrow's tracking, derived from its rung. Removes the
 *  per-call-site choice between tracking.label and tracking.caps. */
export const TRACK_LABEL_EM = 0.09;
export const trackLabel = (size: number) => Math.round(size * TRACK_LABEL_EM * 10) / 10;
```

`tracking.display` / `.label` / `.caps` stay as the compatibility rungs during
the migration, then retire.

---

## 6. Premium product assessment

Measured against the visual language of Apple, Linear, Stripe, Nike, Whoop,
Oura, Strava and Tesla.

**Hierarchy — strong.** The `hero.ts` collapse system is genuinely
better-reasoned than most shipping products: one head at three collapse
states, a bottom-anchored baseline so a longer title never moves the content
below it, and a title that *steps down a rung* rather than wrapping to three
lines. That last rule is a magazine rule, and almost nobody implements it. It
is undercut by two mastheads that disagree on tracking at the same size, and
by `fs.headline` sitting in the ladder as a rung with contested legitimacy.

**Readability — good, with one soft spot.** A 13 dp body at 1.5 in Archivo
Regular on `#0c0d0c` is right for a dense training app. Dynamic Type is
honoured everywhere and never disabled, which is more than Whoop or Strava
manage. The soft spot is the mono eyebrow: 10 dp JetBrains Mono, uppercase,
tracked, in `ash` (#8b8f86) is the least legible combination the palette can
produce, and it is the app's most-used single style (208 tracked sites plus
134 untracked). Apple would set that at 11–12 with more weight; Oura sets its
equivalent larger and lighter.

**Density — appropriate and deliberate.** The 10–16 dp band carries 1 623 of
the 2 160 mobile call sites. That is a dashboard product's distribution, and
correct for an app whose content is figures. It is *close* to too dense — the
distance from `fs.nano` to `fs.body` is 3 dp carrying four named roles.

**Personality — distinctive, and the strongest thing here.** Archivo Black at
900 for every title is a real choice: grotesque, wide, athletic, not the
Inter/SF default that every fitness app converges on. JetBrains Mono for
figures and eyebrows gives the product an instrument-panel voice that suits
"the device's recording is the source of truth". This is Nike/Tesla territory
rather than Calm territory, and the two-face discipline (down from three, with
the third's removal argued in writing) is exactly right.

**Premium feel — held back by execution, not by design.** The system is
premium; the surfaces are not uniformly. San Francisco appearing on 72 mobile
text nodes, on the entire widget, on the entire Watch app, and on every public
web page is the specific thing that separates this from Linear or Stripe —
where the face is *never* wrong, anywhere, including the 404.

**Numerical presentation — excellent.** Tabular numerals enforced at the
primitives, proportional figure tracking via `trackFigure`, `fitMonoFigure`
deriving whether a figure fits *before* it is drawn, and per-digit rolling
that animates only the changed column. Whoop and Oura do the first; almost
nobody does the third and fourth. The one defect is real: the same hero-figure
rung drawn in two different faces.

**Headline strength — high.** 900-weight Archivo at 26–34 with proportional
negative tracking, capped at two lines, bottom-anchored. Reads like a product
that knows what its screens are called.

**Mobile readability — good.** The 10 dp floor is enforced; Dynamic Type
works; the 1.15 clamp is legal only where a hard height exists. One 9.5 dp
exception, argued.

**Consistency — the weakest axis, and unevenly so.** Mobile is 0 raw
`fontWeight`, 0 raw `letterSpacing`, 2 160 tokenised sizes against 44
literals. Web is 596 tokenised sizes against 52 literals, 137 raw weights, 12
raw trackings and 12 raw leadings. The system is real on the product and
advisory on the admin panel.

**Visual rhythm — good vertically, uneven horizontally.** Leading is a ratio,
which is right. But the eyebrow tracking split (0.9 vs 1.2, inverted against
size) means two labels of the same rank on adjacent cards can sit at visibly
different densities.

| Dimension | Score | Reasoning |
|---|---|---|
| **Visual quality** | **8 / 10** | Distinctive, athletic, well-reasoned faces. Loses points for SF leaking onto the widget, the Watch and the public web. |
| **Consistency** | **7 / 10** | Outstanding on mobile, advisory on web, absent on the native targets. Weighted toward mobile because mobile is the product. |
| **Readability** | **8 / 10** | Enforced floor, real Dynamic Type, sane body leading. The 10 dp tracked-mono-caps eyebrow is the ceiling on this score. |
| **Premium feel** | **7 / 10** | The system reads premium; the edges do not. Every San Francisco leak costs here, and there are four classes of them. |
| **Design-system maturity** | **9 / 10** | Exceptional. Executable guards with dated burn-downs, anti-slack assertions, a test that parses `.ttf` `name` tables, and rationale written next to every token. Short of 10 only because web is outside the guards and the burn-downs are not yet zero. |

---

## 7. APP TYPOGRAPHY SYSTEM

*The final standardised tokens recommended going forward.*

```
Font Family:
  Display / body   Archivo — 400 Regular, 600 SemiBold, 700 Bold, 900 Black
  Figures / labels JetBrains Mono — 400 Regular, 700 Bold
  Fallback         system-ui, sans-serif  /  ui-monospace, monospace
  Loaded once, per-weight subpath imports, six faces, both clients

Display:      Archivo Black 900 · 34 / 36 (1.06) · −1.0dp (−0.03em) · max 2 lines, steps to 28/31 over 28 chars
H1:           Archivo Black 900 · 26 / 32 (1.23) · −0.8dp
H2:           Archivo Black 900 · 20 / 26 (1.30) · −0.6dp
H3:           Archivo Black 900 · 18 / 23 (1.30) · −0.5dp
Body:         Archivo Regular 400 · 13 / 20 (1.50) · 0
Body Small:   Archivo Regular 400 · 12 / 18 (1.50) · 0
Label:        JetBrains Mono 400 · 10 / 15 · +0.9dp (0.09em) · UPPERCASE
Caption:      JetBrains Mono 400 · 12 / 18 · 0
Button:       Archivo Bold 700 · 16 (compact 15) · 0 · min target 44dp
Metric Large: Archivo Black 900 · 46 / 53 (1.15) · −1.6dp · tabular-nums
Metric Medium:Archivo Black 900 · 34 / 39 (1.15) · −1.2dp · tabular-nums
Navigation:   Archivo SemiBold 600 · system size · 0
```

Supporting roles, unchanged from what ships:
`Card title` Archivo Bold 700 · 16 / 21 · 0 —
`Lead` Archivo Regular 400 · 15 / 24 (1.62) · 0 —
`Input` Archivo Regular 400 · 15 · 0 —
`Meta` JetBrains Mono 400 · 11 · 0 —
`Takeover figure` Archivo Black 900 · 76 / 78 · −3.0dp.

### 7.1 Current typography

Two custom faces (Archivo, JetBrains Mono), six loaded mobile faces, a
13-rung shared size ladder, 4 leading ratios, 4 tracking rungs plus a derived
figure tracking, defined in `packages/core/src/{scale,theme/tokens,hero,
hub-masthead,app-header,dock-rail,streak-mark}.ts` and applied through
`apps/mobile/components/aurora/kit.tsx` on the product and
`apps/web/lib/ui.tsx` on the admin panel. 2 756 tokenised size call sites; 96
raw ones. Mobile is guarded by executable ratchets; web is not; the iOS
widget, the Watch app, the public web pages and transactional email use
system fonts.

### 7.2 Problems discovered

| # | Problem | Severity |
|---|---|---|
| 1 | 34 `.ttf` / 4 044 KB bundled in the iOS export; 6 faces used (~712 KB) — barrel imports | **Critical** |
| 2 | 72 top-level `<Text>` draw in San Francisco beside Archivo; guard covers 3 feed files only | **Critical** |
| 3 | iOS widget + Apple Watch app are 100 % San Francisco, 9 off-ladder sizes | **High** |
| 4 | Uppercase eyebrow has two trackings, split inverted against size (208 sites) | **High** |
| 5 | `fs.stat` drawn in two faces (`F.black` ×14, `F.monoBold` ×4) and three line heights | **High** |
| 6 | Web has zero tracking/leading tokens — 12 raw em trackings, 12 raw leadings | **High** |
| 7 | Two masthead systems, same rung, 2× different tracking (−1.02 vs −0.5 dp) | **High** |
| 8 | Heading weight differs by platform: web 800, mobile 900/700 | **Medium** |
| 9 | Public web pages (`/`, `/privacy`, `/terms`, `/invite`) are `system-ui` + hardcoded hexes | **Medium** |
| 10 | Error messages have 4 type treatments across 19 alert sites | **Medium** |
| 11 | 9 px tracked uppercase mono in web admin table headers (below the mobile HARD floor) | **Medium** |
| 12 | Card title at one rung in two faces (700 ×52, 900 ×26) | **Medium** |
| 13 | Body leading optional in practice — 34 `fs.body` sites carry no `leading()` | **Medium** |
| 14 | 44 raw `fontSize` + 39 raw `lineHeight` remain on mobile (dated burn-downs) | **Medium** |
| 15 | 3 unused weights in the web `@import`; `--font-heading` defined with zero consumers | **Low** |
| 16 | 48 mobile styles name a face and no size → implicit RN 14 dp | **Low** |
| 17 | `swiftui.tsx:474` `size: 11` — native leaves are outside the ratchet | **Low** |
| 18 | Two definitions of the masthead meta voice; two units for tracking in core | **Low** |
| 19 | Email `font-weight: 800` on Arial (renders 700), undocumented | **Low** |

### 7.3 Recommended typography system

§7 above. Two changes to shipped values, both named: title tracking becomes
proportional (`trackTitle`, −0.03em), and the eyebrow takes one tracking
(`trackLabel`, 0.09em). Everything else is the current implementation with the
duplicate answers removed.

### 7.4 Exact files that need modification

| Priority | Change | Files |
|---|---|---|
| **Critical** | Per-weight subpath imports so only 6 faces bundle | `apps/mobile/app/_layout.tsx:6-13` → `@expo-google-fonts/archivo/400Regular` etc. Verify with `npx expo export --platform ios` (expect 6 `.ttf`, ~712 KB). Add a guard to `apps/mobile/lib/design-tokens.test.ts` |
| **Critical** | Every `<Text>` names a face | `apps/mobile/app/u/[handle].tsx`, `components/coach-programs.tsx`, `components/admin/{access,content,overview,athlete-weeks,audit,security,guidance,exercises}.tsx`, `components/aurora/{nutrition,my-social-profile,coach-rail,quick-start,week-verdict,body-progress}.tsx`, `app/{coaches,workout,discover,notifications,leaderboard}.tsx`, `components/coach-groups.tsx` — 184 style blocks, 72 confirmed top-level |
| **Critical** | Promote the feed's face guard to the whole tree | `apps/web/__tests__/feed-typography.test.ts` → a HARD rule in `apps/mobile/lib/design-tokens.test.ts` ("a style with a `fontSize` and no `fontFamily` is a build failure"), with the `error-boundary.tsx` exemption |
| **High** | `trackTitle()` + `trackLabel()`; retire the em/dp split | `packages/core/src/scale.ts` (add), `packages/core/src/hero.ts:327,333,334,390,409` (em → dp), `packages/core/src/hub-masthead.ts:59,63`, `apps/mobile/components/aurora/hero.tsx:175,249,746`, `…/hub-masthead.tsx:63,125` |
| **High** | One face + one leading at `fs.stat` | `apps/mobile/components/aurora/builder.tsx:254`, `…/sport-page.tsx:258,284`, `apps/mobile/components/feed-card.tsx:281`; normalise `lineHeight` at the 19 `fs.stat` sites |
| **High** | Custom faces in the native targets | `apps/mobile/targets/widget/index.swift:73-117`, `apps/mobile/targets/watch/App.swift:61-89`, plus the font resources in each target's bundle and `apps/mobile/app.config.js` |
| **High** | Web adopts `lh` + tracking tokens | `apps/web/lib/ui.tsx` (export `lh`, an em tracking helper), then the ~137 sites across `apps/web/components/**` and `apps/web/app/**` |
| **Medium** | One heading weight across platforms | Decide 800-vs-900, then either add `Archivo_800ExtraBold` to `apps/mobile/app/_layout.tsx` + `F` + `F_POSTSCRIPT` + `native-face.test.ts`, or move the 63 web `fontWeight: 800` sites to 900 |
| **Medium** | Public web pages in the brand face | `apps/web/app/page.tsx`, `app/privacy/page.tsx`, `app/terms/page.tsx`, `app/invite/[token]/page.tsx`, `app/not-found.tsx` (leave `error.tsx` / `global-error.tsx` on system fonts, and say why in a comment) |
| **Medium** | One error-message type style | The 19 `accessibilityRole="alert"` sites across `apps/mobile/components/**`; codify it in `kit.tsx` as an `AAlert` text style |
| **Medium** | Raise the web admin table header off 9 px | `apps/web/app/globals.css:387` → `fs.nano` (10) minimum |
| **Medium** | Card title picks one face | 26 `F.black` + `fs.subtitle` sites → `F.bold`, or the reverse |
| **Medium** | `leading()` mandatory on prose rungs | The 34 `F.reg`+`fs.body` and 18 `F.reg`+`fs.bodyLg` sites with no leading; add a ratchet |
| **Medium** | Continue the two dated burn-downs | 44 raw `fontSize` (due 2026-11-30), 39 raw `lineHeight` (due 2026-11-30) — the 13 admin `lineHeight: 18` sites are one sweep |
| **Low** | Trim the `@import`; delete or adopt `--font-heading` | `packages/core/src/theme/tokens.ts` (`fontImportUrl`), `apps/web/app/globals.css:5,29` |
| **Low** | Size every faced style | The 48 mobile sites relying on RN's implicit 14 dp |
| **Low** | Extend the ratchet to native leaves | `apps/mobile/lib/design-tokens.test.ts` — also grep `font({ size: N })`; fix `apps/mobile/components/aurora/swiftui.tsx:474` |
| **Low** | One face-name source on web | `apps/web/lib/ui.tsx:139-141` → read the CSS vars; align the fallback stack with `globals.css:26-27` |
| **Low** | Email weight | `apps/web/lib/email.ts:52` — `800` → `700` |

### 7.5 Priority summary

- **Critical (3)** — the 3.3 MB of dead fonts, the 72 San Francisco text
  nodes, and the missing repo-wide face guard. All three are mobile, which is
  the product; all three are mechanical; the first is one import line.
- **High (5)** — tracking unification, the `fs.stat` face split, the native
  targets, the web token adoption, the masthead tracking disagreement.
- **Medium (8)** — cross-platform weight, public web pages, error messages,
  the 9 px header, card-title face, mandatory leading, and the two dated
  burn-downs.
- **Low (5)** — unused weights, the dead `--font-heading`, implicit sizes,
  native-leaf coverage, the web face-name duplication, email weight.

---

*Audit performed against `f67d2df` on branch
`claude/typography-system-audit-t3lovc`. Counts marked EXACT come from the
live ratchet assertions in `apps/mobile/lib/design-tokens.test.ts` (38 tests
passing at time of writing); the bundle figures come from a real
`npx expo export --platform ios`.*
