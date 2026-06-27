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
 * - `light` = JAPANDI — warm oat paper, clay/sage accents, calm contrast.
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
    accentText: { lime: "#c4f035", blue: "#7fd4e8", violet: "#c9a9f0", amber: "#f0b45e", red: "#e0625e" },
  },
  // JAPANDI — warm minimal. Oat-paper surfaces, clay/sage foreground accents.
  light: {
    ink: "#efe9df",
    ink2: "#f6f1e8",
    card: "#fcfaf4",
    line: "#e4dccd",
    chalk: "#2f2a22",
    ash: "#6b6456",
    accentText: { lime: "#566312", blue: "#2c5d6c", violet: "#6a4885", amber: "#875427", red: "#973a30" },
  },
};
