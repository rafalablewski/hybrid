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

export type StoryStyleId = "aurora" | "liquid-glass";

/** A soft radial glow disc, positioned as fractions of the card (x,y of width
 *  & height; r of width). `color` should already carry its alpha. */
export type StoryDisc = { x: number; y: number; r: number; color: string };

/** A diagonal gradient (top-left `from` → bottom-right `to`) painted over `bg`. */
export type StoryGradient = { from: string; to: string };

/** A translucent inset slab behind the content (Liquid Glass). The `border`
 *  (rim stroke) is optional — omit it for a borderless frosted slab. */
export type StoryPanel = { fill: string; border?: string };

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
  // 1 — Aurora: the signature dark membrane (ink + a lime glow).
  {
    id: "aurora",
    nameKey: "summary.style.aurora",
    bg: colors.ink,
    discs: [{ x: 0.78, y: 0.16, r: 0.58, color: "rgba(198,248,79,0.20)" }],
    text: colors.chalk,
    muted: colors.ash,
    accent: colors.lime,
    wordmark: colors.chalk,
    barTrack: colors.ink2,
    barFill: colors.lime,
    swatch: colors.lime,
  },
  // 2 — Liquid Glass: a frosted translucent slab over a lime×blue blur. The
  // app's signature Liquid Glass surface, as a share card. The default.
  {
    id: "liquid-glass",
    nameKey: "summary.style.liquidGlass",
    bg: colors.ink,
    discs: [
      { x: 0.24, y: 0.2, r: 0.58, color: "rgba(198,248,79,0.30)" },
      { x: 0.82, y: 0.78, r: 0.58, color: "rgba(60,120,126,0.28)" },
    ],
    // Borderless frosted slab — the rim stroke read as a "weird" floating box,
    // so the glass is just the translucent fill + the lime×blue glows behind it.
    panel: { fill: "rgba(255,255,255,0.08)" },
    text: colors.chalk,
    muted: "#b6bcb3",
    accent: colors.lime,
    wordmark: colors.chalk,
    barTrack: "rgba(255,255,255,0.12)",
    barFill: colors.lime,
    swatch: "#dfe6e2",
  },
] as const;

export const DEFAULT_STORY_STYLE: StoryStyleId = "liquid-glass";

/** Resolve a style by id, falling back to the default style (never returns null). */
export function storyStyle(id?: StoryStyleId | string | null): StoryStyle {
  return (
    STORY_STYLES.find((s) => s.id === id) ??
    STORY_STYLES.find((s) => s.id === DEFAULT_STORY_STYLE) ??
    STORY_STYLES[0]!
  );
}
