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
