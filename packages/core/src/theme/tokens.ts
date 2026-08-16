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
  // NO WASH TOKENS. `maroon` / `maroonLit` lived here for one consumer — the
  // activity card's fallen column, which sat in a dark stain so the fall would
  // outweigh the rise. It is gone (Aug 2026): a stain made that one column a
  // SURFACE while the other three were type on the card, so the row read as
  // three figures and one filled box, and the box was what the eye found first
  // whether or not the slip was the week's story. Both ends are foreground now,
  // separated by hue and by sign.
  //
  // The palette therefore has no composited surface colours at all, and that is
  // the state to keep it in: a background here is either a named SURFACE (ink /
  // ink2 / card) or a tint of a foreground colour through withAlpha(), never a
  // third kind of thing that has to be re-derived by hand whenever the surface
  // under it changes.
} as const;

export type ColorToken = keyof typeof colors;

/**
 * Font families. The web app loads these via @import (globals.css); the mobile
 * app loads the matching expo-google-fonts packages. Names kept identical.
 *
 * TWO FACES, AND THAT IS THE WHOLE IDENTITY:
 *   `display` — Archivo, in four weights. Headings, titles, body, big figures.
 *   `mono`    — JetBrains Mono, in two. Numbers, and every uppercase eyebrow.
 *
 * RETIRED — `condensed` (Archivo Narrow), Aug 2026. The brief specified three
 * faces and the token declared the third, but the PRODUCT is the mobile app and
 * the mobile app never loaded it: `app/_layout.tsx` calls `useFonts` with four
 * Archivo weights and two JetBrains Mono weights, and there is no
 * `@expo-google-fonts/archivo-narrow` in its package.json. So the third face
 * existed as a name in the tokens and a webfont in the browser, and nowhere in
 * the thing that ships.
 *
 * It was not unused on web — `cond` had ~30 call sites, all inside `/admin`,
 * all on the same small uppercase tracked chip/button. Which is exactly why
 * this had to be resolved rather than left: the project rule is that the two
 * admin consoles stay in step, and those chips were drawing in Archivo Narrow
 * on web and Archivo on the phone, because the phone had no other option.
 *
 * The tie-break was which face is doing the condensed face's JOB. Archivo
 * Narrow was declared for "labels / chips" — but the app's actual label voice
 * is the mono uppercase tracked eyebrow (`tracking.label` alone holds 216 call
 * sites), and that voice was never Narrow. A third face bought nothing but a
 * second answer to a question already answered, plus a webfont download.
 *
 * TO REVISIT IT: an argument for a genuinely condensed face has to start on
 * mobile — load it in `_layout.tsx`, give it a name in `F`, and name the job it
 * does that neither Archivo nor mono already does. Re-declaring it here without
 * that just recreates the dead token.
 */
export const fonts = {
  display: "Archivo", // headings + body + figures
  mono: "JetBrains Mono", // numbers / kickers
} as const;

/** Google Fonts @import string (used by the web prototype + web app). Mirror
 *  any change here in `apps/web/app/globals.css`, which carries the literal. */
export const fontImportUrl =
  "https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap";

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
