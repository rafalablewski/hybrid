/**
 * UI TEMPLATES — a swappable "skin" layer over the app's screens.
 *
 * A template is NOT a colour palette (that's theme.ts, which flips light/dark).
 * It selects the LAYOUT/structure/component shapes of a screen — e.g. the
 * industrial "classic" HYBRID look vs the soft, rounded "aurora" look adapted
 * from the mobile Figma kit. Both templates render the SAME data and reuse the
 * SAME brand tokens (brand.ts) + theme palettes — only the composition differs.
 *
 * The active template is a per-device preference on each client (mobile:
 * AsyncStorage; web: localStorage), defaulting to `aurora` — the main HYBRID
 * look on both clients. A user can still switch to `classic` from Settings (a
 * stored preference always wins over this default). This is the single source
 * of truth for the template registry both clients read.
 */
export type TemplateName = "classic" | "aurora";

export interface TemplateDef {
  id: TemplateName;
  /** Short label shown in the template switcher. */
  label: string;
  /** One-line description of the look. */
  description: string;
}

export const TEMPLATES: TemplateDef[] = [
  {
    id: "classic",
    label: "Classic",
    description: "The original HYBRID look — industrial, dense, Liquid Glass cards.",
  },
  {
    id: "aurora",
    label: "Aurora",
    description: "Soft, rounded layout adapted from the mobile design kit — pill nav, big radii, schedule-first home.",
  },
];

/** The look every user gets until they opt into another template. Aurora is the
 *  main HYBRID template on both web and mobile; Classic stays available via the
 *  Settings switcher for anyone who prefers it. */
export const DEFAULT_TEMPLATE: TemplateName = "aurora";

/**
 * Persistence key for the active template — SHARED so web (localStorage) and
 * mobile (AsyncStorage) can't drift apart. (Stores are still per-device; this
 * just keeps the key string identical on both clients.)
 */
export const TEMPLATE_STORAGE_KEY = "hybrid.template";

/** Runtime guard for a persisted/template-switch value. */
export function isTemplateName(v: unknown): v is TemplateName {
  return v === "classic" || v === "aurora";
}

/** Coerce any persisted value to a known template (falls back to the default). */
export function resolveTemplate(v: unknown): TemplateName {
  return isTemplateName(v) ? v : DEFAULT_TEMPLATE;
}
