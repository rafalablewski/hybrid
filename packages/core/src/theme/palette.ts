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
  /** the PRIMARY action fill for this theme (a filled button / FAB / progress).
   *  Per-theme so light stops borrowing the fixed dark-theme chartreuse fill —
   *  dark keeps chartreuse; light (Japandi) uses clay. */
  accent: string;
  /** text/icon colour that sits ON the `accent` fill (guarded ≥ AA vs `accent`). */
  onAccent: string;
  /** accent colours when used as foreground text */
  accentText: { lime: string; blue: string; violet: string; amber: string; red: string };
}

export type ThemeName = "dark" | "light";

/**
 * Two disciplined themes (see reference/today-cockpit-design-concepts):
 * - `dark`  = AURORA — a true neutral charcoal ramp; chartreuse is the single
 *             accent fill, red is kept strictly for risk.
 * - `light` = JAPANDI · CLAY & SAGE — a warm OAT-paper theme (soft warm
 *             hairlines, never pure white) with a muted CLAY primary action and a
 *             calm SAGE secondary. The old acid-chartreuse fill (a dark-theme
 *             stroke colour) is retired here: on paper it failed contrast (white
 *             text on lime measured 1.34:1) and glared. Clay carries a paper ink
 *             ON the fill; chartreuse survives only as the mossy `accentText`
 *             green for small text/links, never as a full fill.
 * Both `accent`/`onAccent` (the action fill + its ink) and `accentText` are
 * per-theme, so every action and every accent-as-text clears AA on the theme's
 * own surfaces (guarded by palette.test.ts).
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
    // SPECTRUM accent-text: chartreuse + sand read on dark as-is; teal/terracotta
    // are lifted (#6cb6bd / #e58a5c) to clear AA on the card; violet unchanged.
    accentText: { lime: "#c6f84f", blue: "#6cb6bd", violet: "#c9a9f0", amber: "#d0cd94", red: "#e58a5c" },
  },
  // JAPANDI · CLAY & SAGE — the warm light theme. Surfaces run as an OAT ramp:
  // ground #eae3d4 → raised #f2ecdf → near-white card #f9f5ec, each a clear step
  // so cards float, with a soft warm hairline #e0d7c6. The PRIMARY action is a
  // muted CLAY (#a4543a) carrying a warm paper ink (#faf6ef, 4.99:1). The SAGE
  // secondary (#5f6d4b) lives on the `blue`/conditioning channel (see
  // globals.css --color-blue + mobile paletteFor). accent-text: `lime` is the
  // clay-as-text tone, `blue` is the sage-as-text tone; violet/amber/red keep
  // their darkened hues. Every value clears WCAG AA on the Oat card
  // (guarded by palette.test.ts). MIRROR any change in apps/web/app/globals.css
  // ([data-theme="light"]) and apps/mobile/lib/theme.tsx.
  light: {
    ink: "#eae3d4",
    ink2: "#f2ecdf",
    card: "#f9f5ec",
    line: "#e0d7c6",
    chalk: "#33302a",
    ash: "#6b6456",
    accent: "#a4543a", // clay — the primary action fill
    onAccent: "#faf6ef", // warm paper ink on the clay fill
    accentText: { lime: "#8f4a30", blue: "#4f5c3a", violet: "#6a4885", amber: "#875427", red: "#973a30" },
  },
};
