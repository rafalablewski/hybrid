/**
 * PREMIUM ACCENT — the one colour every "buy Full" CTA wears (Go Full cards, the
 * upgrade sheet, locked-feature badges, the upsell strips). It is ADMIN-SETTABLE
 * at runtime via the `theme.premiumAccent` feature flag (no redeploy): the value
 * is either a brand-palette KEY (amber/lime/blue/red) or a custom `#hex`.
 * Default is `amber` (sand). Both clients resolve through here so web + mobile
 * can't drift, and the admin panel shows a live WCAG readout for custom hexes.
 */
import { colors } from "./theme/tokens";
import { THEMES, type ThemeName } from "./theme/palette";
import { contrastRatio, WCAG } from "./contrast";

/** The feature-flag key that carries the admin-chosen premium accent value. */
export const PREMIUM_ACCENT_FLAG = "theme.premiumAccent";

/** Palette keys offered as premium-accent presets (ash is not an accent). */
export const PREMIUM_ACCENT_PRESETS = ["amber", "lime", "blue", "red"] as const;
export type PremiumAccentPreset = (typeof PREMIUM_ACCENT_PRESETS)[number];

/** The default when no admin override is set — sand. */
export const PREMIUM_ACCENT_DEFAULT: PremiumAccentPreset = "amber";

/** Fixed inks for text sitting ON a solid accent fill (theme-independent). */
const INK_DARK = "#141614";
const INK_LIGHT = "#faf6ef";

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** Is this a valid `#rgb` / `#rrggbb` string? */
export function isHexColor(v: unknown): v is string {
  return typeof v === "string" && HEX_RE.test(v.trim());
}

/** Pick the ink (near-black or near-white) with the better contrast on a fill. */
export function bestInkFor(bgHex: string): string {
  return contrastRatio(INK_DARK, bgHex) >= contrastRatio(INK_LIGHT, bgHex) ? INK_DARK : INK_LIGHT;
}

/**
 * Coerce any stored flag value to a valid premium-accent token: a preset key,
 * a lowercased hex, or the default. Never throws.
 */
export function normalizePremiumAccent(value: unknown): string {
  if (typeof value === "string") {
    const v = value.trim();
    if ((PREMIUM_ACCENT_PRESETS as readonly string[]).includes(v)) return v;
    if (HEX_RE.test(v)) {
      const h = v.toLowerCase();
      // expand #abc → #aabbcc so `${fill}12` alpha suffixes (mobile) stay valid
      return h.length === 4 ? `#${h.slice(1).split("").map((c) => c + c).join("")}` : h;
    }
  }
  return PREMIUM_ACCENT_DEFAULT;
}

/** The three colours a premium surface needs, resolved for one theme. */
export interface ResolvedPremiumAccent {
  /** the stored token (preset key or hex) */
  raw: string;
  /** true when it's a custom hex rather than a palette preset */
  custom: boolean;
  /** fill — solid button bg / dots / borders / tints (theme-independent) */
  fill: string;
  /** accent-as-text on the dark/light card (AA on the theme's card) */
  text: string;
  /** ink for text sitting ON the `fill` (auto black/white by contrast) */
  ink: string;
}

/**
 * Resolve a flag value into fill/text/ink for a theme. Presets reuse the curated
 * palette (accentText already clears AA per theme); a custom hex is used as-is
 * for fill + text (the admin's responsibility, guided by the WCAG readout) with
 * an auto-picked ink.
 */
export function resolvePremiumAccent(value: unknown, theme: ThemeName = "dark"): ResolvedPremiumAccent {
  const raw = normalizePremiumAccent(value);
  if (HEX_RE.test(raw)) {
    return { raw, custom: true, fill: raw, text: raw, ink: bestInkFor(raw) };
  }
  const key = raw as PremiumAccentPreset;
  const fill = colors[key];
  const text = THEMES[theme].accentText[key];
  return { raw, custom: false, fill, text, ink: bestInkFor(fill) };
}

export type WcagGrade = "AAA" | "AA" | "fail";

/** WCAG rating of a foreground/background pair, for the admin contrast checker. */
export function wcagRating(fg: string, bg: string): { ratio: number; normal: WcagGrade; large: WcagGrade } {
  const r = contrastRatio(fg, bg);
  return {
    ratio: Math.round(r * 100) / 100,
    // normal text: AAA ≥ 7, AA ≥ 4.5
    normal: r >= WCAG.AAA ? "AAA" : r >= WCAG.AA ? "AA" : "fail",
    // large text: AAA ≥ 4.5, AA ≥ 3
    large: r >= WCAG.AA ? "AAA" : r >= WCAG.AA_LARGE ? "AA" : "fail",
  };
}
