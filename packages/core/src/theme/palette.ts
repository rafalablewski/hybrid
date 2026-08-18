/**
 * Theme palette — the single source of truth for the app's surface, text and
 * FOREGROUND-accent colours.
 *
 * MIRRORED by apps/web/app/globals.css (the `:root` defaults), because CSS cannot
 * import a TypeScript object. That copy is DIFFED against this file by
 * apps/web/__tests__/palette-mirror.test.ts, in both directions — a var that
 * drifts fails, and so does a var that outlives the token it mirrors. This
 * header used to say the contrast test "can only see THIS file", which was true
 * and was the hole: the second copy was checked by nobody, which is the same
 * failure that left a retired hairline drawing on the web crash pages.
 *
 * Note: the accents in tokens.ts (lime/blue/amber/red) are used for fills,
 * borders and chart strokes; `accentText` here is the variant used when an
 * accent is rendered as TEXT.
 *
 * THE PANTONE FOUR: Wild Lime / Muskmelon / Lyons Blue / Fleur De Lis, plus the
 * one Pantone NEUTRAL, Stalactite, which `chalk` carries — see tokens.ts, which
 * records what each one is, why Lyons Blue is rendered lifted on this ground,
 * why Stalactite needed no adaptation at all, and why there is still no fifth
 * accent and no separate gold. Only
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
 * - `dark` = AURORA — a near-black ground under a COOL raised ramp; chartreuse
 *            is the single accent fill, red is kept strictly for risk.
 *
 * IT IS NO LONGER "a true neutral charcoal ramp", which is what this line said
 * for as long as the surfaces were eyeballed, and the sentence is corrected
 * rather than left to contradict the tokens under it. `ink2` is PANTONE Black
 * Beauty and `line` is derived from it, both at Lab b ≈ −3.4/−4.5: a deliberate
 * cool cast on the two surfaces that are light enough to show one. `ink` stays
 * neutral because at L* 3.5 nothing shows.
 *
 * Both `accent`/`onAccent` (the action fill + its ink) and `accentText` clear
 * AA on the theme's surfaces (guarded by palette.test.ts), and so does `line`
 * against both of them — that last guard is new, and it exists because the
 * Black Beauty move put the old hairline at 1.06:1 against its own card with
 * nothing in the suite able to notice.
 */
export const THEMES: Record<ThemeName, ThemePalette> = {
  dark: {
    ink: "#0c0d0c",
    ink2: "#212126",
    line: "#2f2f36",
    chalk: "#f7f6f3",
    ash: "#8b8f86",
    // Wild Lime is the action fill, with near-black ink on top (11.89:1).
    accent: "#c3d363",
    onAccent: "#0c0d0c",
    // ACCENT-TEXT. Three of the four Pantone colours are already legible as type
    // on the card and are their own text colour — on Black Beauty, Wild Lime
    // 9.78, Fleur De Lis 7.16, Muskmelon 6.79, all clear of AA. Only BLUE needs
    // a second value: the fill (#2f7893) is the darkest thing the palette asks
    // anyone to read, so text takes the same Lyons Blue hue lifted further, to
    // 6.95 on the card.
    //
    // ALL FOUR LOST ABOUT 12% WHEN THE CARD DID, and that is the accepted cost
    // of a surface you can actually see: a lighter card means less contrast for
    // everything drawn on it. The floor that matters is `ash` at 4.86 — the most
    // used secondary text in the app, and the tightest thing on this surface.
    // Anything that lightens `ink2` further has to start by re-checking that
    // number, not this comment.
    accentText: { lime: "#c3d363", blue: "#6bb4d4", amber: "#daa51d", red: "#ec935e" },
  },
};
