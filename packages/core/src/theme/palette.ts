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

export const THEMES: Record<ThemeName, ThemePalette> = {
  dark: {
    ink: "#0c0d0c",
    ink2: "#141614",
    card: "#161816",
    line: "#2a2d2a",
    chalk: "#f3f4ef",
    ash: "#8b8f86",
    accentText: { lime: "#c4f035", blue: "#7fd4e8", violet: "#c9a9f0", amber: "#f0b45e", red: "#e0625e" },
  },
  light: {
    ink: "#e9ece6",
    ink2: "#dfe2da",
    card: "#f6f7f3",
    line: "#cdd0c6",
    chalk: "#14160f",
    ash: "#5a5e54",
    accentText: { lime: "#4c6606", blue: "#176577", violet: "#5f3f93", amber: "#8a5a12", red: "#a82e2a" },
  },
};
