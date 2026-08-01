/**
 * UI TEMPLATE — Aurora is the ONE and ONLY look (the soft, rounded layout
 * adapted from the mobile Figma kit: pill nav, big radii, schedule-first home).
 * The old industrial "classic" template was removed — there is no longer a
 * skin switch. This registry is kept (collapsed to a single entry) so the
 * clients' template hooks keep a stable shape, but `template` is always
 * "aurora" everywhere.
 */
export type TemplateName = "aurora";

export interface TemplateDef {
  id: TemplateName;
  /** Short label. */
  label: string;
  /** One-line description of the look. */
  description: string;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "aurora",
    label: "Aurora",
    description: "Soft, rounded layout adapted from the mobile design kit — pill nav, big radii, schedule-first home.",
  },
];

/** The only template. */
export const DEFAULT_TEMPLATE: TemplateName = "aurora";

/**
 * Persistence key for the active template — kept for back-compat with stored
 * values (always coerced to "aurora" now). SHARED so web (localStorage) and
 * mobile (AsyncStorage) read the same key string.
 */
export const TEMPLATE_STORAGE_KEY = "hybrid.template";

// NOTE: the "Liquid Glass" per-device preference (LIQUID_GLASS_STORAGE_KEY)
// was removed: the native SwiftUI treatment is ALWAYS ON on iOS now — the
// look is the product, not a setting (see apps/mobile/components/aurora/
// swiftui.tsx LIQUID_GLASS_SUPPORTED). A stale "hybrid.liquid-glass" value
// may linger in AsyncStorage on old installs; it is simply never read.

/** Runtime guard. Only "aurora" is a valid template now. */
export function isTemplateName(v: unknown): v is TemplateName {
  return v === "aurora";
}

/** Coerce any persisted value to the only template (Aurora). */
export function resolveTemplate(_v: unknown): TemplateName {
  return "aurora";
}
