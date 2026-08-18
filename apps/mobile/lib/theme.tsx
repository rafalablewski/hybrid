import { createContext, useContext, type ReactNode } from "react";
import { THEMES, colors, ROLE_COLOR, deltaRole, type SemanticRole, type StatSubTone, type ThemeName, type ThemePalette } from "@hybrid/core";

/**
 * Mobile theme — AURORA (dark), the app's one theme. The four brand accents
 * (Wild Lime / Lyons Blue / Fleur De Lis / Muskmelon) are the fills, while
 * `accentText` carries the AA-guarded tone for the one accent that needs a
 * different value as TEXT. Palette values come from @hybrid/core THEMES so web
 * + mobile share one source.
 */
export interface Palette extends ThemePalette {
  lime: string;
  blue: string;
  amber: string;
  red: string;
  /** fixed near-black for text/icons ON a bright accent fill */
  onAccent: string;
}

const fillsFor = (t: ThemePalette) => ({
  lime: t.accent, // primary action fill (Wild Lime)
  blue: colors.blue,
  amber: colors.amber,
  red: colors.red,
  onAccent: t.onAccent,
});

export const paletteFor = (scheme: ThemeName): Palette => {
  const t = THEMES[scheme];
  return { ...t, ...fillsFor(t) };
};

/** Map a bright accent (or ash) used as TEXT to its accent-text colour. Accepts
 *  EITHER the fixed brand constant (colors.lime/…) OR the palette's own fill
 *  value (palette.lime/palette.blue) — the two match, so both resolve to the
 *  AA-guarded accent-TEXT tone instead of falling through to the raw fill hex. */
export function txt(palette: Palette, c: string): string {
  switch (c) {
    case palette.lime: // theme primary fill
    case colors.lime:
      return palette.accentText.lime;
    case palette.blue:
    case colors.blue:
      return palette.accentText.blue;
    case colors.amber:
      return palette.accentText.amber;
    case colors.red:
      return palette.accentText.red;
    case colors.ash:
      return palette.ash;
    default:
      return c;
  }
}

/** Resolve a SHARED semantic role (@hybrid/core semantic.ts) to a palette fill.
 *  The one client mapping every state colour goes through, so meaning lives in
 *  core and can't drift per-screen. Wrap with txt() when used as TEXT. */
export const roleColor = (palette: Palette, role: SemanticRole): string => palette[ROLE_COLOR[role]];


/** A DELTA'S COLOUR — direction → role → the accent-TEXT tone, in one call.
 *  Four surfaces used to each decide what a fall looks like (audit/12 §5.4);
 *  this is the only place that answers it now. `dir` is already
 *  valence-normalised upstream — see core deltaRole. */
export const deltaPaint = (palette: Palette, dir: StatSubTone): string =>
  txt(palette, roleColor(palette, deltaRole(dir)));

interface ThemeCtx {
  scheme: ThemeName;
  palette: Palette;
}

const Ctx = createContext<ThemeCtx>({
  scheme: "dark",
  palette: paletteFor("dark"),
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  return <Ctx.Provider value={{ scheme: "dark", palette: paletteFor("dark") }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
