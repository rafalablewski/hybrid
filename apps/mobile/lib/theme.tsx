import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEMES, colors, ROLE_COLOR, type SemanticRole, type ThemeName, type ThemePalette } from "@hybrid/core";

/**
 * Mobile theme. Surfaces/text flip with the OS appearance (or an explicit
 * override); the bright brand accents (lime/blue/…) stay fixed for fills, while
 * `accentText` is the darkened-on-light variant for accent TEXT. Palette values
 * come from @hybrid/core THEMES so web + mobile share one source.
 */
export type ThemePref = "system" | ThemeName;

export interface Palette extends ThemePalette {
  lime: string;
  blue: string;
  violet: string;
  amber: string;
  red: string;
  /** fixed near-black for text/icons ON a bright accent fill */
  onAccent: string;
}

const ACCENTS = {
  lime: colors.lime,
  blue: colors.blue,
  violet: colors.violet,
  amber: colors.amber,
  red: colors.red,
  onAccent: colors.ink,
};

export const paletteFor = (scheme: ThemeName): Palette =>
  scheme === "light"
    ? // JAPANDI: the brand accent becomes a warm CLAY/terracotta (reference
      // concept 04) — the `lime` slot drives every accent fill, so clay lives
      // there; bright acid-lime breaks the warm palette. On-accent text flips to
      // light paper so it reads on the clay. Aurora (dark) keeps raw lime.
      { ...THEMES.light, ...ACCENTS, lime: "#a5573c", onAccent: "#faf8f3" }
    : { ...THEMES[scheme], ...ACCENTS };

/** Map a bright accent (or ash) used as TEXT to its theme-aware colour. */
export function txt(palette: Palette, c: string): string {
  switch (c) {
    case colors.lime:
      return palette.accentText.lime;
    case colors.blue:
      return palette.accentText.blue;
    case colors.violet:
      return palette.accentText.violet;
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

const KEY = "hybrid-theme-pref";

interface ThemeCtx {
  scheme: ThemeName;
  palette: Palette;
  pref: ThemePref;
  setPref: (p: ThemePref) => void;
}

const Ctx = createContext<ThemeCtx>({
  scheme: "dark",
  palette: paletteFor("dark"),
  pref: "system",
  setPref: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [pref, setPrefState] = useState<ThemePref>("system");

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v === "system" || v === "dark" || v === "light") setPrefState(v);
    });
  }, []);

  const setPref = (p: ThemePref) => {
    setPrefState(p);
    AsyncStorage.setItem(KEY, p).catch(() => {});
  };

  const scheme: ThemeName = pref === "system" ? (system === "light" ? "light" : "dark") : pref;
  const palette = useMemo(() => paletteFor(scheme), [scheme]);

  return <Ctx.Provider value={{ scheme, palette, pref, setPref }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
