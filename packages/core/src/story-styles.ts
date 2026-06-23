/**
 * Shareable story STYLES — the looks a finished-workout "wrapped" card can be
 * rendered in (Spotify-Wrapped style). ONE source of truth consumed by BOTH
 * clients so the 9:16 card looks identical on web (<canvas> painter + DOM
 * preview) and mobile (react-native-view-shot capture).
 *
 * A style is expressed in renderer-agnostic terms so each platform can paint it:
 *   - `bg`        base background fill (also the picker-chip colour)
 *   - `gradient`  optional diagonal (top-left → bottom-right) gradient over `bg`
 *   - `discs`     soft radial glow discs (positions/radius as fractions of the
 *                 card so they scale to any size); web draws them as radial
 *                 gradients, mobile as translucent rounded <View>s
 *   - `panel`     optional translucent "glass slab" inset behind the content
 *                 (the Liquid-Glass look) — a fill + a rim border
 *   - the text / accent / bar colours used by every slide body
 *
 * Adding a style = one entry here; both clients pick it up automatically.
 */
import { colors } from "./theme/tokens";

export type StoryStyleId = "aurora" | "neon" | "liquid-glass" | "swiss" | "japandi" | "swiftui";

/** A soft radial glow disc, positioned as fractions of the card (x,y of width
 *  & height; r of width). `color` should already carry its alpha. */
export type StoryDisc = { x: number; y: number; r: number; color: string };

/** A diagonal gradient (top-left `from` → bottom-right `to`) painted over `bg`. */
export type StoryGradient = { from: string; to: string };

/** A translucent inset slab behind the content (Liquid Glass). */
export type StoryPanel = { fill: string; border: string };

export type StoryStyle = {
  id: StoryStyleId;
  /** i18n key for the human label shown in the style picker. */
  nameKey: string;
  /** Base background fill (and the colour of the picker chip). */
  bg: string;
  /** Optional diagonal gradient painted over `bg`. */
  gradient?: StoryGradient;
  /** Optional glow discs painted over the background. */
  discs: StoryDisc[];
  /** Optional translucent glass slab inset behind the content. */
  panel?: StoryPanel;
  /** Headline + stat values. */
  text: string;
  /** Labels, footer, secondary text. */
  muted: string;
  /** Eyebrow + brand dot. */
  accent: string;
  /** Wordmark ("HYBRID") text colour. */
  wordmark: string;
  /** Muscle-bar track (the unfilled groove). */
  barTrack: string;
  /** Muscle-bar fill + emphasised numbers (PR headline / hot rows). */
  barFill: string;
  /** A representative dot colour for the picker chip. */
  swatch: string;
};

export const STORY_STYLES: readonly StoryStyle[] = [
  // 1 — Aurora: the signature dark membrane (ink + a lime glow). The default.
  {
    id: "aurora",
    nameKey: "summary.style.aurora",
    bg: colors.ink,
    discs: [{ x: 0.78, y: 0.16, r: 0.58, color: "rgba(196,240,53,0.20)" }],
    text: colors.chalk,
    muted: colors.ash,
    accent: colors.lime,
    wordmark: colors.chalk,
    barTrack: colors.ink2,
    barFill: colors.lime,
    swatch: colors.lime,
  },
  // 2 — Neon: synthwave magenta×cyan glow on a deep violet night. Electric.
  {
    id: "neon",
    nameKey: "summary.style.neon",
    bg: "#0a0612",
    gradient: { from: "#1b0b3a", to: "#060410" },
    discs: [
      { x: 0.16, y: 0.12, r: 0.62, color: "rgba(255,45,149,0.45)" },
      { x: 0.86, y: 0.86, r: 0.62, color: "rgba(0,229,255,0.38)" },
    ],
    text: "#f4f2ff",
    muted: "#9a8fc0",
    accent: "#00e5ff",
    wordmark: "#ffffff",
    barTrack: "rgba(255,255,255,0.10)",
    barFill: "#ff2d95",
    swatch: "#ff2d95",
  },
  // 3 — Liquid Glass: a frosted translucent slab over a lime×blue blur. The
  // app's signature Liquid Glass surface, as a share card.
  {
    id: "liquid-glass",
    nameKey: "summary.style.liquidGlass",
    bg: colors.ink,
    discs: [
      { x: 0.24, y: 0.2, r: 0.58, color: "rgba(196,240,53,0.30)" },
      { x: 0.82, y: 0.78, r: 0.58, color: "rgba(127,212,232,0.28)" },
    ],
    panel: { fill: "rgba(255,255,255,0.08)", border: "rgba(255,255,255,0.22)" },
    text: colors.chalk,
    muted: "#b6bcb3",
    accent: colors.lime,
    wordmark: colors.chalk,
    barTrack: "rgba(255,255,255,0.12)",
    barFill: colors.lime,
    swatch: "#dfe6e2",
  },
  // 4 — Swiss: International Typographic — stark white, bold black type, one
  // red accent. Grid-clean, no glow.
  {
    id: "swiss",
    nameKey: "summary.style.swiss",
    bg: "#ffffff",
    discs: [],
    text: "#0a0a0a",
    muted: "#6b6b6b",
    accent: "#e2231a",
    wordmark: "#0a0a0a",
    barTrack: "rgba(0,0,0,0.08)",
    barFill: "#0a0a0a",
    swatch: "#e2231a",
  },
  // 5 — Japandi: warm Japanese×Scandinavian calm — clay paper, soft charcoal,
  // terracotta + sage accents.
  {
    id: "japandi",
    nameKey: "summary.style.japandi",
    bg: "#e7e0d4",
    discs: [{ x: 0.82, y: 0.16, r: 0.5, color: "rgba(176,122,90,0.18)" }],
    text: "#33302a",
    muted: "#8a8275",
    accent: "#9a6a4b",
    wordmark: "#33302a",
    barTrack: "rgba(51,48,42,0.08)",
    barFill: "#7f8a63",
    swatch: "#9a6a4b",
  },
  // 6 — SwiftUI: the iOS system look — a vibrant indigo→blue gradient, crisp
  // white type, system-rounded feel.
  {
    id: "swiftui",
    nameKey: "summary.style.swiftui",
    bg: "#0a84ff",
    gradient: { from: "#5e5ce6", to: "#0a84ff" },
    discs: [{ x: 0.8, y: 0.12, r: 0.5, color: "rgba(255,255,255,0.20)" }],
    text: "#ffffff",
    muted: "rgba(255,255,255,0.78)",
    accent: "#ffffff",
    wordmark: "#ffffff",
    barTrack: "rgba(255,255,255,0.24)",
    barFill: "#ffffff",
    swatch: "#ffffff",
  },
] as const;

export const DEFAULT_STORY_STYLE: StoryStyleId = "aurora";

/** Resolve a style by id, falling back to the default (never returns null). */
export function storyStyle(id?: StoryStyleId | string | null): StoryStyle {
  return STORY_STYLES.find((s) => s.id === id) ?? STORY_STYLES[0]!;
}
