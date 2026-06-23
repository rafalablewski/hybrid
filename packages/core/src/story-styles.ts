/**
 * Shareable story STYLES — the 4 looks a finished-workout "wrapped" card can be
 * rendered in (Spotify-Wrapped style). ONE source of truth consumed by BOTH
 * clients so the 9:16 card looks identical on web (<canvas> painter) and mobile
 * (react-native-view-shot capture).
 *
 * A style is expressed in renderer-agnostic terms so each platform can paint it:
 *   - `bg`      base background fill
 *   - `discs`   soft radial glow discs (positions/radius as fractions of the
 *               card so they scale to any size); web draws them as radial
 *               gradients, mobile as translucent rounded <View>s
 *   - the text / accent / bar colours used by every slide body
 *
 * Adding a 5th style = one entry here; both clients pick it up automatically.
 */
import { colors } from "./theme/tokens";

export type StoryStyleId = "aurora" | "punch" | "paper" | "nebula";

/** A soft radial glow disc, positioned as fractions of the card (x,y of width
 *  & height; r of width). `color` should already carry its alpha. */
export type StoryDisc = { x: number; y: number; r: number; color: string };

export type StoryStyle = {
  id: StoryStyleId;
  /** i18n key for the human label shown in the style picker. */
  nameKey: string;
  /** Base background fill. */
  bg: string;
  /** Optional glow discs painted over the background. */
  discs: StoryDisc[];
  /** Headline + stat values. */
  text: string;
  /** Labels, footer, secondary text. */
  muted: string;
  /** Eyebrow + brand dot + PR emphasis. */
  accent: string;
  /** Wordmark ("HYBRID") text colour. */
  wordmark: string;
  /** Muscle-bar track (the unfilled groove). */
  barTrack: string;
  /** Muscle-bar fill + emphasised numbers. */
  barFill: string;
  /** A representative swatch colour for the picker chip (usually the accent). */
  swatch: string;
};

const HONEY = "#4c6606"; // deep olive — the light-theme lime, readable on chalk

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
  // 2 — Punch: high-contrast flat lime with ink type. Loud and unmistakable.
  {
    id: "punch",
    nameKey: "summary.style.punch",
    bg: colors.lime,
    discs: [{ x: 0.82, y: 0.12, r: 0.55, color: "rgba(255,255,255,0.18)" }],
    text: colors.ink,
    muted: "rgba(12,13,12,0.62)",
    accent: colors.ink,
    wordmark: colors.ink,
    barTrack: "rgba(12,13,12,0.14)",
    barFill: colors.ink,
    swatch: colors.ink,
  },
  // 3 — Paper: editorial near-white with ink type and an olive accent. Clean.
  {
    id: "paper",
    nameKey: "summary.style.paper",
    bg: colors.chalk,
    discs: [{ x: 0.84, y: 0.14, r: 0.5, color: "rgba(196,240,53,0.22)" }],
    text: colors.ink,
    muted: "#6b6f66",
    accent: HONEY,
    wordmark: colors.ink,
    barTrack: "rgba(12,13,12,0.08)",
    barFill: colors.lime,
    swatch: colors.chalk,
  },
  // 4 — Nebula: a violet→blue night sky over ink. Premium, moody.
  {
    id: "nebula",
    nameKey: "summary.style.nebula",
    bg: colors.ink,
    discs: [
      { x: 0.18, y: 0.1, r: 0.72, color: "rgba(201,169,240,0.26)" },
      { x: 0.86, y: 0.82, r: 0.7, color: "rgba(127,212,232,0.20)" },
    ],
    text: colors.chalk,
    muted: colors.ash,
    accent: colors.lime,
    wordmark: colors.chalk,
    barTrack: colors.ink2,
    barFill: colors.lime,
    swatch: colors.violet,
  },
] as const;

export const DEFAULT_STORY_STYLE: StoryStyleId = "aurora";

/** Resolve a style by id, falling back to the default (never returns null). */
export function storyStyle(id?: StoryStyleId | string | null): StoryStyle {
  return STORY_STYLES.find((s) => s.id === id) ?? STORY_STYLES[0]!;
}
