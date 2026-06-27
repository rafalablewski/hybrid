/**
 * HYBRID brand tokens — the single source of visual identity.
 * Imported by BOTH apps/web and apps/mobile so the look stays in lockstep.
 * Ported from the prototypes (HybridApp.jsx / HybridWeb.jsx).
 */

export const colors = {
  ink: "#0c0d0c", // near-black background
  ink2: "#141614", // raised surface
  card: "#161816", // card surface
  line: "#2a2d2a", // hairline borders
  // AURORA SPECTRUM accents — the brand's coolors palette (chartreuse / teal /
  // sand / terracotta), layered over the unchanged dark surfaces. Each daily
  // Today section maps onto one accent (see semantic.ts SECTION_COLOR), so the
  // app reads as a guided gradient rather than one flat lime. Surfaces above are
  // untouched. (violet has no palette member; it stays for the premium/coach slot.)
  lime: "#c7ef00", // chartreuse — the primary accent (action / "go" / Train)
  chalk: "#f3f4ef", // primary text
  ash: "#8b8f86", // muted text
  blue: "#3c787e", // teal — conditioning / info accent (Feel)
  violet: "#c9a9f0", // coach / premium accent
  amber: "#d0cd94", // sand — sport / caution accent (Plan)
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
