/**
 * Theme palette — the single source of truth for the app's surface, text and
 * FOREGROUND-accent colours.
 *
 * MIRRORED by apps/web/app/globals.css (the `:root` defaults). Keep the two in
 * lockstep — the contrast test (theme.test.ts) guards the ratios, but it can
 * only see THIS file.
 *
 * Note: the bright accents in brand.ts (lime/blue/…) are used for fills,
 * borders and chart strokes; `accentText` here is the variant used when an
 * accent is rendered as TEXT.
 *
 * AURORA SPECTRUM: the accents are the brand's coolors palette (chartreuse
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
  /** the PRIMARY action fill (a filled button / FAB / progress) — chartreuse. */
  accent: string;
  /** text/icon colour that sits ON the `accent` fill (guarded ≥ AA vs `accent`). */
  onAccent: string;
  /** rating GOLD (coach ★ ratings) — a Pantone-gold, lifted so it reads as gold
   *  on the dark card. Decorative (not AA-guarded). */
  gold: string;
  /** accent colours when used as foreground text */
  accentText: { lime: string; blue: string; violet: string; amber: string; red: string };
}

export type ThemeName = "dark";

/**
 * One disciplined theme (see reference/today-cockpit-design-concepts):
 * - `dark` = AURORA — a true neutral charcoal ramp; chartreuse is the single
 *            accent fill, red is kept strictly for risk.
 * Both `accent`/`onAccent` (the action fill + its ink) and `accentText` clear
 * AA on the theme's surfaces (guarded by palette.test.ts).
 */
export const THEMES: Record<ThemeName, ThemePalette> = {
  dark: {
    ink: "#0c0d0c",
    ink2: "#141614",
    card: "#151715",
    line: "#242724",
    chalk: "#f3f4ef",
    ash: "#8b8f86",
    // AURORA keeps the bright chartreuse action fill with near-black ink on top.
    accent: "#c6f84f",
    onAccent: "#0c0d0c",
    gold: "#e6c34e", // bright gold on the dark card
    // SPECTRUM accent-text: chartreuse + sand read on dark as-is; teal/terracotta
    // are lifted (#6cb6bd / #e58a5c) to clear AA on the card; `violet` (now a
    // steel/slate blue coach accent) is lifted to #8ba0cc for the same reason.
    accentText: { lime: "#c6f84f", blue: "#6cb6bd", violet: "#8ba0cc", amber: "#d0cd94", red: "#e58a5c" },
  },
};
