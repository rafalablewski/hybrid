import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { THEMES, colors, type ThemeName, type ThemePalette } from "@hybrid/core";

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

export const paletteFor = (scheme: ThemeName): Palette => ({ ...THEMES[scheme], ...ACCENTS });

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
