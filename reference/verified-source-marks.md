# Verified source marks — adding an operator's logo

A HYBRID Verified item names the business whose published table the numbers came
from. The provenance card in the portion editor can show that business's own
**mark** next to the name, so an athlete recognises the source at a glance
instead of reading it.

MAX ships with its real wordmark (`packages/core/src/source-marks.ts`), traced
to vector paths from the operator's own artwork. Lidl ships with its roundel,
which arrived as a vector already and needed only normalising (step 2).

A source **without** artwork is a supported state, not a broken one: both clients
fall back to the business's name set in our own display face inside a hairline
chip. That is deliberate — visibly our typography, so it can never be mistaken
for an approximation of someone's logo. Shipping a hand-drawn "close enough"
version of a real brand mark would undermine the exact thing the card exists to
establish.

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

   MAX's and Lidl's both came from artwork supplied by the HYBRID team. That is
   fine for an internal build; **confirm redistribution terms with the operator
   before a public release**, and record the outcome in the mark's `credit`.

   Where you can't get the artwork at all — and you will hit this; this sandbox's
   egress policy blocks `upload.wikimedia.org` outright — an icon set that
   publishes under a clear licence is the next best source (simple-icons is
   CC0-1.0 and is on npm, which *is* reachable: `npm pack simple-icons`). Two
   caveats. Its files are MONOCHROME, so a brand whose identity is its colours
   arrives unrecognisable and needs recolouring, which the `credit` must say. And
   **CC0 waives copyright, not trademark** — the two are separate rights and the
   waiver reaches only the first, so using the mark to identify a business still
   needs the operator's sign-off. Prefer the real vector whenever one exists.

2. **Make the SVG self-contained.** Strip anything that would reach the network
   or the device's font stack:
   - no `http(s):` references, no `<image>`, no external `<use>`/`xlink:href`
   - no `@font-face` — convert text to paths, or the wordmark silently falls
     back to whatever font the phone has
   - keep the `viewBox`; drop hard-coded `width`/`height`
   - **no painted white.** An exporter will happily wrap a badge in a white
     frame or fill a counter with white paint. White paint is not a hole: on the
     charcoal card it draws a keyline the real logo does not have. Lidl's vector
     arrived with exactly that — a 0.5-unit white frame with the blue field
     inset behind it — and it was dropped, the blue field run full-bleed
     instead. (A counter painted in the mark's OWN ground colour is fine, and
     Lidl's *d* keeps one: it always sits over the yellow disc, so it never
     depends on the card underneath.)

   `auditVerifiedCatalog()` enforces all of this and runs in the test suite, so a
   mark that would render as a broken box fails CI rather than an athlete's
   screen.

3. **Trace it to paths** — do not embed a raster. A PNG inside an `<svg>`
   defeats the point: it cannot take the card's background through its
   knockouts, it blurs on a Retina phone, and it is an order of magnitude
   larger. `potrace` (or `potracer`, its pure-Python port) run on the **alpha
   channel** of a transparent-background PNG gives one path whose counters are
   true holes:

   ```python
   mask = numpy.array(img.getchannel("A")) > 127     # the ink
   path = potrace.Bitmap(~mask).trace(turdsize=8)     # ctor inverts — pass the complement
   ```

   Check the result numerically rather than by eye alone: rasterize the trace
   back at source resolution and compare it with the mask. MAX's came out at an
   intersection-over-union of 0.9994 (0.034 % of pixels disagreeing), which is
   the bar to aim for.

4. **Add it** to `packages/core/src/source-marks.ts`, then set `mark:` on the
   source in `verified-foods.ts`. That is the whole change: both clients pick it
   up with no further edit — web renders it through a data URI on an `<img>`
   (never `innerHTML`, so a mark can't become an injection surface), mobile
   through `react-native-svg`'s `SvgXml`.

5. **Check both themes.** The card sits on a chartreuse-tinted panel on AURORA
   and a pine-tinted one on Kyoto Hour. This is where a raster, or a mark whose
   keylines are *painted* white, fails: it leaves white slabs on the charcoal
   card. Traced as **holes** they take the card's own colour and the mark reads
   on both grounds — which is why MAX's is a single `fill-rule="evenodd"` path
   rather than a red shape stacked under white strokes. A SOLID badge like
   Lidl's is the other valid answer: it carries its own ground and so depends on
   neither card.

   No simulator needed to check. Put the mark in an HTML file on both grounds at
   the sizes it actually renders at — 24/26/34 px on the cards, larger on the
   source hero — and screenshot it with the Chromium that is already installed:

   ```sh
   /opt/pw-browsers/chromium-*/chrome-linux/chrome --headless --no-sandbox \
     --force-device-scale-factor=2 --screenshot=out.png --window-size=680,340 check.html
   ```

   Render the untouched original beside your version: if a counter fills in or a
   letterform thickens, a `fill-rule` is wrong.

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
