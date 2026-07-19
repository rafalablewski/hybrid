/**
 * Theme palettes — the single source of truth for the app's light/dark surface,
 * text and FOREGROUND-accent colours.
 *
 * MIRRORED by apps/web/app/globals.css (the `:root` defaults + the
 * `[data-theme="light"]` overrides). Keep the two in lockstep — the contrast
 * test (theme.test.ts) guards the ratios, but it can only see THIS file.
 *
 * Note: the bright accents in brand.ts (lime/blue/…) are used for fills,
 * borders and chart strokes and stay fixed across themes; `accentText` here is
 * the darkened-on-light variant used when an accent is rendered as TEXT.
 *
 * AURORA SPECTRUM: the dark accents are the brand's coolors palette (chartreuse
 * / teal / sand / terracotta). The raw teal/terracotta fills are a touch dark to
 * read as small TEXT on the card, so `accentText.blue`/`.red` are lifted variants
 * that clear WCAG AA (guarded by palette.test.ts); chartreuse/sand are already
 * bright enough to use verbatim.
 */
export interface ThemePalette {
  /** page background */
  ink: string;
  /** raised surface */
  ink2: string;
  /** card surface (the usual text background) */
  card: string;
  /** hairline borders */
  line: string;
  /** primary text */
  chalk: string;
  /** muted text */
  ash: string;
  /** the PRIMARY action fill for this theme (a filled button / FAB / progress).
   *  Per-theme so light stops borrowing the fixed dark-theme chartreuse fill —
   *  dark keeps chartreuse; light (Kyoto Hour) uses pine. */
  accent: string;
  /** text/icon colour that sits ON the `accent` fill (guarded ≥ AA vs `accent`). */
  onAccent: string;
  /** rating GOLD (coach ★ ratings) — a Pantone-gold, lifted on dark / deepened on
   *  light so it reads as gold on either surface. Decorative (not AA-guarded). */
  gold: string;
  /** accent colours when used as foreground text */
  accentText: { lime: string; blue: string; violet: string; amber: string; red: string };
}

export type ThemeName = "dark" | "light";

/**
 * Two disciplined themes (see reference/today-cockpit-design-concepts and
 * design/japandi-light-10-kyoto-hour.html):
 * - `dark`  = AURORA — a true neutral charcoal ramp; chartreuse is the single
 *             accent fill, red is kept strictly for risk.
 * - `light` = KYOTO HOUR — the true-Japandi light theme. Warm washi-ivory
 *             surfaces (lifted well above the old midtone oat ground so cards
 *             actually float), sumi-ink text, and a deep PINE green primary
 *             action carrying an ivory ink. The old brick-clay fill is retired:
 *             on the midtone ground it read as mud. Vermilion (the hanko-seal
 *             red) rides the `red` accent-text channel — a mark, never a fill.
 * Both `accent`/`onAccent` (the action fill + its ink) and `accentText` are
 * per-theme, so every action and every accent-as-text clears AA on the theme's
 * own surfaces (guarded by palette.test.ts).
 */
export const THEMES: Record<ThemeName, ThemePalette> = {
  dark: {
    ink: "#0c0d0c",
    ink2: "#141614",
    card: "#151715",
    line: "#242724",
    chalk: "#f3f4ef",
    ash: "#8b8f86",
    // AURORA keeps the bright chartreuse action fill with near-black ink on top.
    accent: "#c6f84f",
    onAccent: "#0c0d0c",
    gold: "#e6c34e", // bright gold on the dark card
    // SPECTRUM accent-text: chartreuse + sand read on dark as-is; teal/terracotta
    // are lifted (#6cb6bd / #e58a5c) to clear AA on the card; `violet` (now a
    // steel/slate blue coach accent) is lifted to #8ba0cc for the same reason.
    accentText: { lime: "#c6f84f", blue: "#6cb6bd", violet: "#8ba0cc", amber: "#d0cd94", red: "#e58a5c" },
  },
  // KYOTO HOUR — the warm light theme. Surfaces run as a WASHI ramp:
  // ground #f6f3ea → raised #efebdf → near-white card #fcfaf3, each a clear step
  // so cards float, with a soft warm hairline #e6e1d2. The PRIMARY action is a
  // deep PINE (#44584c) carrying an ivory ink (#f2f5ef, 6.95:1). The SAGE
  // secondary (#5f6d4b) lives on the `blue`/conditioning channel (see
  // globals.css --color-blue + mobile paletteFor). accent-text: `lime` is the
  // pine-as-text tone, `blue` is the sage-as-text tone, `red` is the hanko
  // VERMILION (#a3442f) — violet/amber keep their darkened hues. Every value
  // clears WCAG AA on the washi card (guarded by palette.test.ts). MIRROR any
  // change in apps/web/app/globals.css ([data-theme="light"]) and
  // apps/mobile/lib/theme.tsx.
  light: {
    ink: "#f6f3ea",
    ink2: "#efebdf",
    card: "#fcfaf3",
    line: "#e6e1d2",
    chalk: "#2b2a26",
    ash: "#6f6b5e",
    accent: "#44584c", // pine — the primary action fill
    onAccent: "#f2f5ef", // ivory ink on the pine fill
    gold: "#b58a24", // deep antique gold — reads as gold on the washi card
    accentText: { lime: "#3c4f43", blue: "#4f5c3a", violet: "#4c5a78", amber: "#875427", red: "#a3442f" },
  },
};
