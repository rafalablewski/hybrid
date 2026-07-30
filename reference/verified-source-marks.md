# Verified source marks — adding an operator's logo

A HYBRID Verified item names the business whose published table the numbers came
from. The provenance card in the portion editor can show that business's own
**mark** next to the name, so an athlete recognises the source at a glance
instead of reading it.

MAX ships with its real wordmark (`packages/core/src/source-marks.ts`), traced
to vector paths from the operator's own artwork. Lidl ships with its roundel,
whose geometry came from a CC0 icon set rather than from our own tracing — see
**Sourcing it from a CC0 icon set** below.

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

   MAX's mark was traced from artwork supplied by the HYBRID team. That is fine
   for an internal build; **confirm redistribution terms with the operator
   before a public release**, and record the outcome in the mark's `credit`.

2. **Make the SVG self-contained.** Strip anything that would reach the network
   or the device's font stack:
   - no `http(s):` references, no `<image>`, no external `<use>`/`xlink:href`
   - no `@font-face` — convert text to paths, or the wordmark silently falls
     back to whatever font the phone has
   - keep the `viewBox`; drop hard-coded `width`/`height`

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
   rather than a red shape stacked under white strokes. Render it on `#1a1e17`
   and `#f7f6ec` and look before shipping.

## Sourcing it from a CC0 icon set

Tracing is step 3's answer when you *hold* the artwork. When you don't — and you
will not always be able to fetch it; `upload.wikimedia.org` is blocked outright
by this sandbox's egress policy — the next best source is an icon set that
publishes its artwork under a clear licence. [simple-icons][si] releases its
files **CC0-1.0** and is on npm, which is reachable here:

```sh
npm pack simple-icons && tar xzf simple-icons-*.tgz package/icons/<brand>.svg
```

Two things to get right when you do.

**Recolour it, and say that you did.** simple-icons ships one MONOCHROME path
per brand: fills become outlines, and the mark loses the thing that makes it
recognisable at 26 px. Lidl's is split at its subpath boundaries so each part
takes the brand's published colour — the square filled rather than outlined, the
ring laid over the disc, which is the logo's real construction. **Coordinates
stay untouched**; only `fill` and `fill-rule` are ours, and the `credit` says
so. Editing the geometry would put you straight back into "close enough",
which is the one thing this file rules out.

**CC0 waives copyright, not trademark.** The two are separate rights and the
waiver reaches only the first. A CC0 icon is safe to redistribute and safe to
adapt; using it to identify a business is still trademark use. Record that in
the mark's `credit` — Lidl's names the waiver and the residual restriction in
the same sentence — and confirm with the operator before a public release, the
same position MAX's mark is in for a different reason.

**Check it renders.** No simulator needed: point headless Chromium at an HTML
file holding the mark on `#1a1e17` and `#f7f6ec` and screenshot it.

```sh
/opt/pw-browsers/chromium-*/chrome-linux/chrome --headless --no-sandbox \
  --force-device-scale-factor=2 --screenshot=out.png --window-size=880,220 check.html
```

Render the untouched monochrome original beside your recoloured version: if a
counter fills in or a letterform thickens, the `fill-rule` is wrong (Lidl's
letters need `evenodd` — the bowl of the *d* is a hole).

[si]: https://github.com/simple-icons/simple-icons

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
