/**
 * Theme palettes — the single source of truth for the app's light/dark surface,
 * text and FOREGROUND-accent colours.
 *
 * MIRRORED by apps/web/app/globals.css (the `:root` defaults + the
 * `[data-theme="light"]` overrides). Keep the two in lockstep — the contrast
 * test (theme.test.ts) guards the ratios, but it can only see THIS file.
 *
 * Note: the bright accents in brand.ts (lime/blue/…) are used for fills,
 * borders and chart strokes and stay fixed across themes; `accentText` here is
 * the darkened-on-light variant used when an accent is rendered as TEXT.
 *
 * AURORA SPECTRUM: the dark accents are the brand's coolors palette (chartreuse
 * / teal / sand / terracotta). The raw teal/terracotta fills are a touch dark to
 * read as small TEXT on the card, so `accentText.blue`/`.red` are lifted variants
 * that clear WCAG AA (guarded by palette.test.ts); chartreuse/sand are already
 * bright enough to use verbatim.
 */
export interface ThemePalette {
  /** page background */
  ink: string;
  /** raised surface */
  ink2: string;
  /** card surface (the usual text background) */
  card: string;
  /** hairline borders */
  line: string;
  /** primary text */
  chalk: string;
  /** muted text */
  ash: string;
  /** accent colours when used as foreground text */
  accentText: { lime: string; blue: string; violet: string; amber: string; red: string };
}

export type ThemeName = "dark" | "light";

/**
 * Two disciplined themes (see reference/today-cockpit-design-concepts):
 * - `dark`  = AURORA — a true neutral charcoal ramp; lime is the single accent,
 *             red is kept strictly for risk. (The old multi-accent rainbow is
 *             retired in the surfaces here and in the Today/Cockpit chrome.)
 * - `light` = JAPANDI — a warm oat-paper theme (soft warm hairlines, never pure
 *             white); chartreuse stays the accent (mossy dark-green as text),
 *             calm soft contrast. Mirrors reference/.../04-japandi.html.
 * `accentText` stays per-theme so any accent rendered as TEXT clears AA on the
 * theme's card (guarded by palette.test.ts).
 */
export const THEMES: Record<ThemeName, ThemePalette> = {
  dark: {
    ink: "#0c0d0c",
    ink2: "#141614",
    card: "#151715",
    line: "#242724",
    chalk: "#f3f4ef",
    ash: "#8b8f86",
    // SPECTRUM accent-text: chartreuse + sand read on dark as-is; teal/terracotta
    // are lifted (#6cb6bd / #e58a5c) to clear AA on the card; violet unchanged.
    accentText: { lime: "#c6f84f", blue: "#6cb6bd", violet: "#c9a9f0", amber: "#d0cd94", red: "#e58a5c" },
  },
  // JAPANDI — a warm, tactile light theme (oat paper, never pure white), matching
  // reference/today-cockpit-design-concepts/04-japandi.html. Surfaces run from an
  // oat-paper page → a soft surface → a warm off-white card, with a SOFT WARM
  // hairline (#e2d9c9) that reads as a quiet separation, not a hard black box. The
  // brand chartreuse STAYS the accent (as a mossy dark-green text variant #47630a);
  // blue/amber/red accent-text keep the darkened Spectrum hues so accent TEXT
  // matches the fixed brand FILLS. Text/muted are warm-neutral and clear WCAG AA
  // (guarded by palette.test.ts).
  light: {
    ink: "#efe9df",
    ink2: "#f5f0e6",
    card: "#fcfaf4",
    line: "#e2d9c9",
    chalk: "#3a352c",
    ash: "#6d665a",
    accentText: { lime: "#47630a", blue: "#2c5d6c", violet: "#6a4885", amber: "#875427", red: "#973a30" },
  },
};
