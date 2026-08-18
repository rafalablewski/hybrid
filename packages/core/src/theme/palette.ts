/**
 * Theme palette — the single source of truth for the app's surface, text and
 * FOREGROUND-accent colours.
 *
 * MIRRORED by apps/web/app/globals.css (the `:root` defaults). Keep the two in
 * lockstep — the contrast test (theme.test.ts) guards the ratios, but it can
 * only see THIS file.
 *
 * Note: the accents in tokens.ts (lime/blue/amber/red) are used for fills,
 * borders and chart strokes; `accentText` here is the variant used when an
 * accent is rendered as TEXT.
 *
 * THE PANTONE FOUR: Wild Lime / Muskmelon / Lyons Blue / Fleur De Lis — see
 * tokens.ts, which records what each one is, why Lyons Blue is rendered lifted
 * on this ground, and why there is no fifth accent and no separate gold. Only
 * BLUE needs a distinct text variant here; the other three clear AA as type
 * verbatim (guarded by palette.test.ts, which now checks every pair rather than
 * a chosen three).
 */
export interface ThemePalette {
  /** page background */
  ink: string;
  /** raised surface */
  ink2: string;
  /** hairline borders */
  line: string;
  /** primary text */
  chalk: string;
  /** muted text */
  ash: string;
  /** the PRIMARY action fill (a filled button / FAB / progress) — Wild Lime. */
  accent: string;
  /** text/icon colour that sits ON the `accent` fill (guarded ≥ AA vs `accent`). */
  onAccent: string;
  /** accent colours when used as foreground text */
  accentText: { lime: string; blue: string; amber: string; red: string };
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
    line: "#242724",
    chalk: "#f3f4ef",
    ash: "#8b8f86",
    // Wild Lime is the action fill, with near-black ink on top (11.89:1).
    accent: "#c3d363",
    onAccent: "#0c0d0c",
    // ACCENT-TEXT. Three of the four Pantone colours are already legible as type
    // on the card and are their own text colour — Wild Lime 11.00, Fleur De Lis
    // 8.05, Muskmelon 7.64, all clear of AA. Only BLUE needs a second value: the
    // fill (#2f7893) is the darkest thing the palette asks anyone to read, so
    // text takes the same Lyons Blue hue lifted further, to 7.81 — parity with
    // the tone the outgoing teal used (7.78).
    accentText: { lime: "#c3d363", blue: "#6bb4d4", amber: "#daa51d", red: "#ec935e" },
  },
};
