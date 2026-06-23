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

export type StoryStyleId =
  | "aurora"
  | "liquid-glass"
  | "noir"
  | "ember"
  | "tidal"
  | "sage"
  | "gold"
  | "concrete"
  | "blush"
  | "carbon";

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
  // 2 — Liquid Glass: a frosted translucent slab over a lime×blue blur. The
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
  // 3 — Noir: pure monochrome. Near-black, crisp white type, a soft top light.
  // Timeless, editorial, zero colour.
  {
    id: "noir",
    nameKey: "summary.style.noir",
    bg: "#0d0d0d",
    discs: [{ x: 0.5, y: 0.08, r: 0.75, color: "rgba(255,255,255,0.07)" }],
    text: "#fafafa",
    muted: "#8a8a8a",
    accent: "#fafafa",
    wordmark: "#fafafa",
    barTrack: "rgba(255,255,255,0.10)",
    barFill: "#fafafa",
    swatch: "#fafafa",
  },
  // 4 — Ember: a warm magma gradient with orange embers. Energetic, fiery.
  {
    id: "ember",
    nameKey: "summary.style.ember",
    bg: "#160404",
    gradient: { from: "#b3210b", to: "#160404" },
    discs: [
      { x: 0.2, y: 0.86, r: 0.7, color: "rgba(255,138,0,0.40)" },
      { x: 0.86, y: 0.16, r: 0.55, color: "rgba(255,61,0,0.28)" },
    ],
    text: "#fff3e8",
    muted: "#c79a86",
    accent: "#ffae3d",
    wordmark: "#fff3e8",
    barTrack: "rgba(255,255,255,0.12)",
    barFill: "#ff8a00",
    swatch: "#ff6a00",
  },
  // 5 — Tidal: a deep teal→navy ocean with aqua light. Calm, premium.
  {
    id: "tidal",
    nameKey: "summary.style.tidal",
    bg: "#03101a",
    gradient: { from: "#0d3a4a", to: "#03101a" },
    discs: [
      { x: 0.8, y: 0.2, r: 0.6, color: "rgba(45,212,191,0.30)" },
      { x: 0.15, y: 0.9, r: 0.6, color: "rgba(56,135,190,0.26)" },
    ],
    text: "#eaf7f6",
    muted: "#7fa3a8",
    accent: "#2dd4bf",
    wordmark: "#eaf7f6",
    barTrack: "rgba(255,255,255,0.10)",
    barFill: "#2dd4bf",
    swatch: "#2dd4bf",
  },
  // 6 — Sage: a fresh eucalyptus light with deep forest type. Clean, natural.
  {
    id: "sage",
    nameKey: "summary.style.sage",
    bg: "#d9e4dc",
    discs: [{ x: 0.85, y: 0.15, r: 0.5, color: "rgba(95,140,110,0.16)" }],
    text: "#1f3026",
    muted: "#6a7d70",
    accent: "#2f6b4f",
    wordmark: "#1f3026",
    barTrack: "rgba(31,48,38,0.08)",
    barFill: "#3f8a63",
    swatch: "#2f6b4f",
  },
  // 7 — Gold: black with gold-foil accents. Luxe, premium, understated.
  {
    id: "gold",
    nameKey: "summary.style.gold",
    bg: "#070706",
    gradient: { from: "#1a160c", to: "#070706" },
    discs: [{ x: 0.5, y: 0.12, r: 0.72, color: "rgba(212,175,55,0.18)" }],
    text: "#f5efe0",
    muted: "#9a8f73",
    accent: "#d4af37",
    wordmark: "#f5efe0",
    barTrack: "rgba(212,175,55,0.14)",
    barFill: "#d4af37",
    swatch: "#d4af37",
  },
  // 8 — Concrete: cool brutalist grey, heavy black type, safety-orange accent.
  // Raw, bold, modern. No glow.
  {
    id: "concrete",
    nameKey: "summary.style.concrete",
    bg: "#c9c7c2",
    discs: [],
    text: "#161616",
    muted: "#5c5c58",
    accent: "#ff4d00",
    wordmark: "#161616",
    barTrack: "rgba(0,0,0,0.10)",
    barFill: "#ff4d00",
    swatch: "#ff4d00",
  },
  // 9 — Blush: a soft lilac→peach pastel with deep plum type. Airy, friendly.
  {
    id: "blush",
    nameKey: "summary.style.blush",
    bg: "#f3e3ef",
    gradient: { from: "#e9d4f0", to: "#fbe3d8" },
    discs: [{ x: 0.2, y: 0.15, r: 0.5, color: "rgba(255,255,255,0.35)" }],
    text: "#3a2740",
    muted: "#8a7790",
    accent: "#b5478a",
    wordmark: "#3a2740",
    barTrack: "rgba(58,39,64,0.08)",
    barFill: "#d06aa0",
    swatch: "#d06aa0",
  },
  // 10 — Carbon: corporate dark slate with an electric-blue accent. Clean,
  // technical, SaaS-grade.
  {
    id: "carbon",
    nameKey: "summary.style.carbon",
    bg: "#0e1014",
    gradient: { from: "#1b2230", to: "#0e1014" },
    discs: [{ x: 0.85, y: 0.18, r: 0.55, color: "rgba(59,130,246,0.22)" }],
    text: "#eef2f7",
    muted: "#8b93a1",
    accent: "#3b82f6",
    wordmark: "#eef2f7",
    barTrack: "rgba(255,255,255,0.08)",
    barFill: "#3b82f6",
    swatch: "#3b82f6",
  },
] as const;

export const DEFAULT_STORY_STYLE: StoryStyleId = "aurora";

/** Resolve a style by id, falling back to the default (never returns null). */
export function storyStyle(id?: StoryStyleId | string | null): StoryStyle {
  return STORY_STYLES.find((s) => s.id === id) ?? STORY_STYLES[0]!;
}
