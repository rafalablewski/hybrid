# Verified source marks — adding an operator's logo

A HYBRID Verified item names the business whose published table the numbers came
from. The provenance card in the portion editor can show that business's own
**mark** next to the name, so an athlete recognises the source at a glance
instead of reading it.

Until a source has artwork, both clients render a **wordmark fallback**: the
business's name set in our own display face inside a hairline chip. That is
deliberate — visibly our typography, so it can never be mistaken for an
approximation of someone's logo. Shipping a hand-drawn "close enough" version of
a real brand mark would undermine the exact thing the card exists to establish.

## What the mark claims

It identifies **whose food this is**. Nothing more.

That distinction is load-bearing, because a third-party logo sitting inside a
product, beside a green tick, reads as a partnership unless the layout says
otherwise. It isn't one: these operators have not partnered with us and have not
reviewed the app. So the card is built to keep the two claims apart:

| Element | Claim | Whose |
|---|---|---|
| The operator's mark, under "Nutrition data published by" | this is who publishes these figures | theirs |
| The lime ✓ and "HYBRID Verified", below a divider | we transcribed and checked them | ours |
| The trademark line at the foot | the mark belongs to its owner, shown to identify a source | legal |

Never move the mark up next to the ✓, and never put a mark on picker rows. A
logo per row turns a food list into an advertising rail, and it starts to read as
"HYBRID endorses MAX" rather than "MAX published this".

## Adding one

1. **Get artwork you are entitled to display.** In order of preference: the
   operator's own press/brand kit, a direct grant from them, or a file whose
   licence you have read and recorded. A Wikimedia Commons logo is usually
   tagged `PD-textlogo` (below the threshold of originality) **plus**
   `trademarked` — read the actual tag on the file page rather than assuming,
   and note that the trademark restriction survives the copyright tag.

2. **Make the SVG self-contained.** Strip anything that would reach the network
   or the device's font stack:
   - no `http(s):` references, no `<image>`, no external `<use>`/`xlink:href`
   - no `@font-face` — convert text to paths, or the wordmark silently falls
     back to whatever font the phone has
   - keep the `viewBox`; drop hard-coded `width`/`height`

   `auditVerifiedCatalog()` enforces all of this and runs in the test suite, so a
   mark that would render as a broken box fails CI rather than an athlete's
   screen.

3. **Attach it** in `packages/core/src/verified-foods.ts`:

   ```ts
   const MAX_MARK: SourceMark = {
     svg: `<svg viewBox="0 0 1024 656" xmlns="http://www.w3.org/2000/svg">…</svg>`,
     aspect: 1024 / 656,
     alt: "MAX",
     credit: "Wikimedia Commons, File:Max (Restaurant) logo.svg — PD-textlogo + trademarked (checked 2026-07-29).",
   };
   ```

   then set `mark: MAX_MARK` on the source. That is the whole change: both
   clients pick it up with no further edit — web renders it through a data URI on
   an `<img>` (never `innerHTML`, so a mark can't become an injection surface),
   mobile through `react-native-svg`'s `SvgXml`.

4. **Check both themes.** The card sits on a chartreuse-tinted panel on AURORA
   and a pine-tinted one on Kyoto Hour. A mark with a white knockout will vanish
   on one of them — prefer a version that carries its own background, or one
   that is legible on both.

## Credits

`sourceMarkCredits()` returns every mark we display with its credit and
trademark line, so third-party artwork in the app stays enumerable instead of
scattered. Wire it into an attribution screen before shipping more than a couple
of marks.

## Why not just load the logo from a URL

It was the first thing tried, and it fails on every axis that matters here: it
breaks offline (the athlete is standing in a restaurant with poor signal), it
hotlinks somebody else's bandwidth, it leaks a request to a third party each time
a food is opened, and it is blocked outright by the CSP on our published-artifact
surface. The rest of the app already resolved this the same way — nutrition
glyphs and recipe heroes are vectors in code, never fetched assets.
