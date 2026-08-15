/**
 * HYBRID brand tokens — the single source of visual identity.
 * Imported by BOTH apps/web and apps/mobile so the look stays in lockstep.
 * Ported from the prototypes (HybridApp.jsx / HybridWeb.jsx).
 */

export const colors = {
  ink: "#0c0d0c", // near-black background
  ink2: "#141614", // raised surface
  // card + line MUST match THEMES.dark in palette.ts and the :root defaults in
  // apps/web/app/globals.css — these were stale (#161816/#2a2d2a) for a while,
  // which made every chart hairline draw in a different grey than every border.
  card: "#151715", // card surface
  line: "#242724", // hairline borders
  // AURORA SPECTRUM accents — the brand's coolors palette (chartreuse / teal /
  // sand / terracotta), layered over the unchanged dark surfaces. State meaning
  // routes through semantic.ts ROLE_COLOR; chartreuse stays the ONE action
  // accent. Surfaces above are untouched. (The old SECTION_COLOR per-section
  // decoration map was removed with its last consumer — colour now only ever
  // encodes state, never section identity.)
  // (The `violet` KEY is a legacy name: it now holds a steel/slate
  // BLUE and is the coach / non-premium 5th accent — the premium-upgrade cue
  // moved to sand/amber, see premium-accent-sand + coach-accent-steel.)
  lime: "#c6f84f", // chartreuse — the primary accent (action / "go" / Train)
  chalk: "#f3f4ef", // primary text
  ash: "#8b8f86", // muted text
  blue: "#3c787e", // teal — conditioning / info accent (Feel)
  violet: "#8296c4", // steel/slate blue — coach & non-premium accent (was #c9a9f0 lavender)
  amber: "#d0cd94", // sand — sport / caution accent (Plan) + the premium-upgrade cue
  red: "#d56f3e", // terracotta — alert / injury / streak (Connect)
  // MAROON — a SURFACE, never text. The only wash in the palette, and it exists
  // because the activity card's two marks are not symmetric: the rise is a
  // bright figure that glows, the fall is meant to read as a dark stain
  // underneath one. Terracotta text alone gave the fall the same visual weight
  // as the rise, and the whole point of the pair is that they do not weigh the
  // same.
  //
  // These are COMPOSITED values, not alphas: the column they sit in only ever
  // sits on `card`, so stating the result is exact where a wash-over-alpha is a
  // guess that drifts the moment the surface under it changes. `maroonLit` is
  // the same wash under a finger — the fall's column has to be able to register
  // a press without going PALER, which is what a tone-alpha selection wash
  // would have done to it.
  //
  // Both are guarded against `accentText.red` in palette.test.ts (5.8:1 and
  // 4.8:1): terracotta is what is printed ON this, so a wash that darkens until
  // it swallows its own figure is the failure mode to watch.
  maroon: "#3a1f19", // the FALL's resting wash, on `card`
  maroonLit: "#4e2a20", // …the same wash while its column is open
} as const;

export type ColorToken = keyof typeof colors;

/** Font families. The web app loads these via next/font or @import; the mobile
 *  app loads the matching expo-google-fonts packages. Names kept identical. */
export const fonts = {
  display: "Archivo", // headings + body
  condensed: "Archivo Narrow", // labels / chips
  mono: "JetBrains Mono", // numbers / kickers
} as const;

/** Google Fonts @import string (used by the web prototype + web app). */
export const fontImportUrl =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=Archivo+Narrow:wght@500;600;700&family=JetBrains+Mono:wght@400;500;600;700&display=swap";

/** Product surface labels. */
export const brand = {
  name: "HYBRID",
  tagline: "Strength & conditioning for hybrid athletes",
  web: "app.hybrid.app",
} as const;

/**
 * TINT STRENGTHS — the alpha rungs, for `withAlpha(colour, ALPHA.fill)`.
 *
 * Derived from 350 hand-rolled alphas, not invented. Once the colour arithmetic
 * was converted from hex suffixes to withAlpha() the values became readable as
 * a set for the first time, and the set turned out to be 58 distinct numbers
 * doing two jobs — eight of them inside the single band 7%–15%. Nobody chose
 * eight; each call site converted a percentage in its head and wrote the byte.
 *
 * TWO FAMILIES, because they tolerate completely different precision:
 *
 *   SURFACES (wash / fill / solid) are large areas, where a 4% shift is subtle
 *     but visible — so the rungs are close together, and the migration moved
 *     only 7 of 156 sites by more than 2%.
 *
 *   BORDERS (edge / line / rim) are ONE PIXEL wide. A 5% alpha shift on a
 *     hairline is not perceptible, so these can be coarser and still land.
 *
 * WHAT DELIBERATELY HAS NO RUNG, and this is the real finding: the alphas above
 * ~0.45, and every stop inside a LinearGradient. The full histogram is
 * CONTINUOUS from 0 to 1 rather than clustered, because a gradient ramp needs
 * arbitrary intermediate stops to read as smooth and a scrim is tuned against
 * the specific content behind it. Those are COMPOSITION, not a palette choice,
 * and snapping them to a ladder would be inventing a scale where none exists.
 * A token set that covers 71% of its axis honestly beats one that covers 100%
 * by pretending.
 */
export const ALPHA = {
  /** the faintest tinted surface — a hint of accent behind a row */
  wash: 0.08,
  /** the standard tinted fill — a selected chip, an active card */
  fill: 0.12,
  /** the strongest tinted fill; still a tint, not a colour */
  solid: 0.16,
  /** the quietest tinted hairline */
  edge: 0.25,
  /** the standard tinted border */
  line: 0.33,
  /** a border that has to hold against a busy ground */
  rim: 0.42,
} as const;

export type TintRole = keyof typeof ALPHA;
