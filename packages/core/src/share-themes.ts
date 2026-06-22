/**
 * Share-card themes — the look a user can pick for their post-workout story
 * before sharing. ONE source of truth consumed by BOTH clients: the web canvas
 * painter (apps/web/lib/workout-share.ts) and the mobile RN story cards
 * (apps/mobile/lib/share.tsx). Keep palettes here so web ↔ mobile stay in
 * lockstep — see the parity rule in CLAUDE.md.
 *
 * Each theme carries a render-agnostic palette plus a `backdrop` hint; each
 * client draws that backdrop in its own way (canvas gradients vs RN views).
 */
import { colors } from "./brand";

export type ShareThemeId = "aurora" | "chrome" | "mesh" | "kinetic";

/** How the decorative backdrop is drawn behind the card content. */
export type ShareBackdrop =
  | "glow" // one soft accent glow disc (the original Aurora look)
  | "blobs" // several blurred multi-colour blobs
  | "mesh" // pale corner-to-corner gradient mesh (light card)
  | "ticker"; // faint repeated wordmark/eyebrow behind the content

export interface ShareTheme {
  id: ShareThemeId;
  /** Display name (a proper noun — shown in the picker, not translated). */
  name: string;
  /** Light cards use dark text; dark cards use light text. */
  mode: "dark" | "light";
  bg: string; // base backdrop colour
  fg: string; // primary text
  muted: string; // secondary / footer text
  accent: string; // wordmark dot, eyebrow, PR highlight, primary stat
  line: string; // hairline / divider
  surface: string; // raised surface (bar track etc.)
  /** Decorative blob/glow colours (already alpha-friendly hexes). */
  glow: string[];
  backdrop: ShareBackdrop;
}

export const SHARE_THEMES: readonly ShareTheme[] = [
  {
    id: "aurora",
    name: "Aurora",
    mode: "dark",
    bg: colors.ink,
    fg: colors.chalk,
    muted: colors.ash,
    accent: colors.lime,
    line: "#26271f",
    surface: colors.ink2,
    glow: [colors.lime, colors.blue, colors.violet],
    backdrop: "glow",
  },
  {
    id: "chrome",
    name: "Chrome",
    mode: "dark",
    bg: "#0a0d0a",
    fg: colors.chalk,
    muted: colors.ash,
    accent: colors.lime,
    line: "#26271f",
    surface: colors.ink2,
    glow: [colors.lime, colors.blue, colors.violet],
    backdrop: "blobs",
  },
  {
    id: "mesh",
    name: "Mesh",
    mode: "light",
    bg: "#eceadf",
    fg: colors.ink,
    muted: "#4a5044",
    accent: "#5f7508", // deep lime — legible on the light wash
    line: "rgba(12,13,12,0.18)",
    surface: "rgba(12,13,12,0.08)",
    glow: [colors.lime, colors.blue, colors.violet],
    backdrop: "mesh",
  },
  {
    id: "kinetic",
    name: "Kinetic",
    mode: "dark",
    bg: colors.ink,
    fg: colors.chalk,
    muted: colors.ash,
    accent: colors.lime,
    line: "#26271f",
    surface: colors.ink2,
    glow: [colors.lime],
    backdrop: "ticker",
  },
] as const;

export const SHARE_THEME_IDS = SHARE_THEMES.map((t) => t.id) as ShareThemeId[];
export const DEFAULT_SHARE_THEME_ID: ShareThemeId = "aurora";

/** Resolve a theme id (or undefined) to a theme, always falling back to Aurora. */
export function shareTheme(id?: ShareThemeId | null): ShareTheme {
  return SHARE_THEMES.find((t) => t.id === id) ?? SHARE_THEMES[0]!;
}
