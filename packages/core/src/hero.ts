// ─────────────────────────────────────────────────────────────────────────────
// THE HERO SYSTEM — one spatial contract for every screen head in the app.
//
// WHY THIS FILE EXISTS
// Before it, every screen invented its own hero. Three shipped examples, caught
// side by side:
//   • History   — 44×44 back square (radius 14, hairline border, no fill), title
//                 on the SAME row as the button, at 26; header scrolls away.
//   • Wrapped   — 40×40 back square (radius 12, black-40% fill), pinned at
//                 safeTop+6; title at 40 (off the type ladder) under a gold
//                 eyebrow; figure at 96.
//   • Plan/Goal — 38×38 back CIRCLE (white-12% fill), inside a collapsing bar at
//                 safeTop+4; title at 31 over a 252dp art cover, under a filled
//                 white chip.
// Three sizes, three radii, three materials, three vertical positions, three
// type sizes, three ways of naming the same thing. Nothing here was wrong on its
// own screen; together they read as three products. A back button that lands in
// a different place on every push is the single loudest of these, because it is
// the one control the user reaches for without looking.
//
// THE FIX IS NOT FOUR HERO DESIGNS — IT IS ONE HERO AT DIFFERENT COLLAPSE STATES.
// A `bar` is a `title` already collapsed. A `title` is a `cover` with its art
// removed. So the system is ONE container, ONE collapse track (p: 0→1), ONE
// rail, ONE nav button, ONE title that scales along the track, ONE metadata
// language — and three RANKS that only decide how much of it is showing at rest.
//
// This module is the pure, client-agnostic source of truth for that contract:
// geometry, the collapse track, the layer interpolations, the type ramp, the
// metadata language and the backdrop rules. Both clients import it, so web and
// mobile literally cannot drift — the thresholds that used to be hand-copied
// magic numbers in two trees (`delta * 0.62`, `delta * 0.45`, …) are computed
// here, once, and unit-tested.
//
// Clients:  apps/mobile/components/aurora/hero.tsx
//           apps/web/components/aurora/hero.tsx
// Spec:     reference/hero-system.md (incl. the SwiftUI-native architecture)
// ─────────────────────────────────────────────────────────────────────────────

import { fs } from "./scale";
import type { AuroraIconName } from "./theme/icons";

/* ── 1. TAXONOMY ─────────────────────────────────────────────────────────── */

/**
 * The smallest system that covers every screen in the app. Three RANKS — and
 * they are the same object, so a rank is a *rest state*, not a design.
 *
 * - `bar`   — no hero. The rail alone. Leaf screens with nothing to establish:
 *             settings sub-pages, pickers, sheets, editors. (= `title` at p=1.)
 * - `title` — the large-title hero. An INFORMATION page whose subject is a
 *             collection, not a thing: History, Statistics, Analytics, Profile,
 *             Plans-you're-enrolled-in. Backdrop is the ambient field; there is
 *             no art, because a collection has no portrait. (= `cover` minus art.)
 * - `cover` — the art hero. An IDENTITY page whose subject is one nameable
 *             thing with an accent and a mark: a goal, a plan, a recipe, an
 *             exercise, a workout. Full-bleed, fixed-dark, accent wash + emblem.
 *
 * A fourth type was considered and REJECTED as a rank: "immersive". Wrapped is
 * not a bigger hero, it is a different *mode* — a paged takeover with no
 * navigation stack under it. It keeps every anatomy rule (same rail, same nav
 * geometry, same type ramp, same metadata language) and changes only two
 * things, both of which follow from having no scroll-to-collapse: the rail is
 * fixed rather than collapsing, and the nav button dismisses rather than pops.
 * Encoding that as `mode` instead of a rank is what keeps the taxonomy at three.
 */
export type HeroRank = "bar" | "title" | "cover";

/**
 * `page` rides a navigation stack: the rail collapses with scroll and the nav
 * button pops. `takeover` is a full-screen paged experience presented over the
 * stack (Wrapped): the rail is fixed and the nav button dismisses.
 */
export type HeroMode = "page" | "takeover";

/** Which backdrop a hero is allowed to paint. See `heroBackdrop`. */
export type HeroBackdrop =
  /** The ambient Aurora field the whole app already sits on. */
  | "field"
  /** Duotone accent wash + radial hotspot over the fixed cover ink. */
  | "wash"
  /** `wash` plus the subject's mark as cover art (ghost glyph or full-colour). */
  | "art"
  /** The takeover's own ground: near-black + two soft accent glows. */
  | "story";

/** Where the light comes from — the ONE thing that tells you which level of a
 *  hierarchy you are on without reading a word. Category/goal heroes are lit
 *  from the LEFT, the things inside them from the RIGHT. Never both on one
 *  screen, never a third direction. */
export type HeroLight = "left" | "right";

/* ── 2. SHARED ANATOMY — the numbers every hero obeys ────────────────────── */

export const HERO = {
  /** The RAIL: a 44pt row, `railTop` below the safe area, present on EVERY
   *  screen in EVERY rank and mode, at exactly this y. This is the system's
   *  spatial constant — the reason a push never moves the back button. */
  rail: { height: 44, top: 4, /** rail + top + bottom breathing = the collapsed bar */ bottom: 8 },

  /** Side gutters. `edge` is the screen gutter every client uses (12 — dropped
   *  from 16 in the density pass: wider content, less dead space at the edges);
   *  `hero` is the hero's own inset — 2pt wider so a display title's optical
   *  left edge lines up with body text below it, which at 34/900 it does not
   *  when both are flush at the edge gutter. */
  gutter: { edge: 12, hero: 14 },

  /** Content height BELOW the safe-area inset, per rank, at rest.
   *  `bar` === the collapsed height, which is why `bar` has no collapse. */
  height: {
    bar: 56,
    /** rail(44) + top(4) + gap(8) + title(32) + meta(16) + bottom(12) */
    title: 132,
    /** Proven on the shipped plan cover; deep enough for eyebrow + 2-line
     *  display title + meta without the art reading as a stripe. */
    cover: 252,
  },

  /** Corner radii. The hero itself is SQUARE at the top (it runs under the
   *  status bar) — `sheet` is only for a hero presented as a sheet. */
  radius: { nav: 999, chip: 999, sheet: 28 },

  /** The one navigation control. 40pt visual, 44pt hit target (Apple's
   *  minimum), perfectly circular. See `heroNav` for the reasoning. */
  nav: { size: 40, hit: 44, glyph: 17, stroke: 1 },

  /** The single collapse track's detents, as fractions of the track. Both
   *  clients interpolate off these — never off a re-copied literal. */
  detent: {
    /** Big title is gone by here. */
    titleOut: 0.5,
    /** Inline title starts arriving here — deliberately AFTER `titleOut`, so
     *  the two are never on screen together (that reads as a duplicate, not a
     *  transition). */
    inlineIn: 0.62,
    /** The bar's hairline edge starts drawing. */
    hairlineIn: 0.5,
    /** A docked CTA surfaces; also the snap midpoint for "which pole". */
    dock: 0.45,
    /** Released inside the track and past this fraction → settle collapsed. */
    snap: 0.5,
  },

  /** Parallax: how far the art drifts against the frame across the whole
   *  track, as a fraction of the track. Emblem art is bigger, so it drifts
   *  further to keep its apparent speed matched. */
  parallax: { art: 0.55, emblem: 0.66 },

  /** Opacity floors. A monochrome ghost mark may survive into the pinned bar
   *  as texture; full-colour art may not (it smears behind the bar title), so
   *  it must be gone before the bar arrives. */
  artFloor: { ghost: 0.4, colour: 0 },
  /** Fraction of the track over which full-colour art must fully retire. */
  colourArtOut: 0.77,

  /** Motion. One family, one curve — the standard iOS interactive spring.
   *  Collapse itself is NOT animated: it tracks the finger 1:1. These govern
   *  the discrete moves (dock arrival, snap settle, cross-fades). */
  motion: {
    /** iOS `.smooth`-equivalent — the app's one transition curve. */
    duration: 0.32,
    /** The snap settle after a release mid-track. */
    snapDuration: 0.26,
    spring: { response: 0.42, damping: 0.86 },
    /** How far a docked element rises as it arrives. */
    rise: 10,
  },

  /** Foreground alphas over a dark hero. `dim` is the ONE secondary tone —
   *  metadata, meta line and eyebrow all share it, so a hero never shows three
   *  greys. */
  alpha: { primary: 1, dim: 0.82, hairline: 0.16, navFill: 0.12, navStroke: 0.18 },
} as const;

/** The cover's base ink. Fixed-dark in BOTH themes: a cover is a printed object,
 *  and an object does not change colour because the room did. */
export const HERO_INK = "#0c0d0c";
/** The takeover's ground — a shade deeper than the cover, because a takeover has
 *  no page behind it to sit against. */
export const HERO_TAKEOVER_INK = "#0a0b09";
/**
 * The RAISED surface on a takeover — stat cells, comparison rows, the tap-target
 * pills that sit on the takeover's ground.
 *
 * This existed as the bare literal `#0e0f0d` at seven sites before it had a
 * name, which made it indistinguishable from a theme-token BUG: the same literal
 * was also being used on ordinary themed screens, where it does not flip under
 * Kyoto Hour and strands a control at the wrong end of the value scale. Naming
 * it separates the two cases — on a takeover, fixed-dark is the intent (a
 * printed object does not change colour because the room did); anywhere else,
 * this constant is the wrong tool and `palette.ink2` is the right one.
 */
export const HERO_TAKEOVER_RAISED = "#0e0f0d";

/* ── 3. GEOMETRY + THE COLLAPSE TRACK ────────────────────────────────────── */

export interface HeroGeometry {
  /** Full hero height including the safe-area inset. */
  height: number;
  /** Collapsed bar height including the safe-area inset. */
  barHeight: number;
  /** The collapse track's length in points. 0 for `bar` and for takeovers. */
  delta: number;
  /** y of the rail's top edge, measured from the hero's own top. */
  railTop: number;
}

/** The hero's box for a rank at a given safe-area inset. One function, so a
 *  screen never reconstructs `insets.top + 56` by hand again. */
export function heroGeometry(rank: HeroRank, safeTop: number, mode: HeroMode = "page"): HeroGeometry {
  const barHeight = safeTop + HERO.height.bar;
  const height = safeTop + HERO.height[rank];
  // A takeover has no scroll-to-collapse: its rail is fixed, so the track is 0
  // and every layer sits at p=0 forever.
  const delta = mode === "takeover" ? 0 : Math.max(0, height - barHeight);
  return { height, barHeight, delta, railTop: safeTop + HERO.rail.top };
}

/** The ONE number every hero layer reads: how collapsed the hero is, 0→1. */
export function heroCollapse(scrollY: number, geom: HeroGeometry): number {
  if (geom.delta <= 0) return 0;
  return Math.min(1, Math.max(0, scrollY / geom.delta));
}

/** Where a release inside the track should settle. `null` = already at a pole,
 *  leave it alone (so a settled hero never fights a flick). */
export function heroSnapTarget(scrollY: number, geom: HeroGeometry): number | null {
  if (geom.delta <= 0) return null;
  if (scrollY <= 6 || scrollY >= geom.delta) return null;
  return scrollY > geom.delta * HERO.detent.snap ? geom.delta : 0;
}

/** Every layer's state at collapse `p`. This is the anti-drift core: the web
 *  and mobile heroes render different primitives but read the SAME numbers, so
 *  a threshold can only be changed for both clients at once.
 *
 *  `translate` values are in points and always relative to the hero's frame,
 *  which itself slides up by `-p * delta`. */
export function heroLayers(p: number, geom: HeroGeometry, opts: { emblem?: boolean; colourArt?: boolean } = {}) {
  const c = Math.min(1, Math.max(0, p));
  const d = geom.delta;
  const ramp = (from: number, to: number) => (to <= from ? (c >= to ? 1 : 0) : Math.min(1, Math.max(0, (c - from) / (to - from))));
  const { titleOut, inlineIn, hairlineIn, dock } = HERO.detent;
  const drift = opts.emblem ? HERO.parallax.emblem : HERO.parallax.art;
  const artOpacity = opts.colourArt
    ? Math.max(0, 1 - c / HERO.colourArtOut)
    : 1 - ramp(0, 1) * (1 - HERO.artFloor.ghost);
  return {
    /** The hero frame itself — carried up 1:1 with the finger. */
    frame: { translateY: -c * d },
    /** Rail chrome counter-translates, so the nav button NEVER moves on screen. */
    rail: { translateY: c * d },
    /** Cover art: drifts against the frame, fades to its floor. */
    art: { opacity: artOpacity, translateY: c * d * drift },
    /** Legibility scrim under the big title — retired as the title leaves. */
    scrim: { opacity: 1 - c },
    /** Eyebrow + display title + meta line: gone by `titleOut`. */
    display: { opacity: 1 - ramp(0, titleOut) },
    /** The collapsed bar's inline title: arrives after the big one has left. */
    inline: { opacity: ramp(inlineIn, 1) },
    /** The bar's bottom edge. */
    hairline: { opacity: ramp(hairlineIn, 1) },
    /** A docked CTA rising into place. */
    dock: { opacity: ramp(dock, 1), translateY: (1 - ramp(dock, 1)) * HERO.motion.rise },
    /** True once the rail is reading as a bar — drives the nav button's
     *  material and the status-bar style on `title` rank. */
    barred: c >= hairlineIn,
  };
}

/* ── 4. TITLES — one ramp, one baseline rule ─────────────────────────────── */

export interface HeroTitleType {
  size: number;
  lineHeight: number;
  /** em; negative — display faces need optical tightening as they grow. */
  tracking: number;
  maxLines: number;
}

/** The collapsed bar's inline title — identical in every rank and mode, because
 *  a collapsed hero is a collapsed hero. */
export const HERO_INLINE_TITLE: HeroTitleType = { size: fs.subtitle, lineHeight: 20, tracking: -0.01, maxLines: 1 };

/** Base rung per rank. `bar` never shows a display title — its title IS the
 *  inline one, which is exactly what "a bar is a collapsed title" means. */
const TITLE_BASE: Record<HeroRank, HeroTitleType> = {
  bar: HERO_INLINE_TITLE,
  title: { size: fs.display, lineHeight: 32, tracking: -0.02, maxLines: 2 },
  cover: { size: fs.hero, lineHeight: 36, tracking: -0.03, maxLines: 2 },
};

/**
 * The display title's type for a given rank and string.
 *
 * Titles do NOT wrap to three lines and they do NOT ellipsize at rank scale —
 * both make a masthead look broken. Instead a long title steps DOWN one rung
 * (34→28, 26→22) and takes two lines, which is what a magazine does and what
 * `Text.minimumScaleFactor` does natively. Character count is a deterministic
 * proxy for width at these weights — good enough to pick a rung, and unit-
 * testable, which a measured width is not.
 *
 * `scale` is the platform's Dynamic Type / browser text-size multiplier: the
 * hero honours it, but caps the step-down decision at the unscaled string so a
 * user at 200% doesn't get a *different layout*, just bigger type.
 */
export function heroTitleType(title: string, rank: HeroRank, scale = 1): HeroTitleType {
  const base = TITLE_BASE[rank];
  if (rank === "bar") return base;
  const n = title.trim().length;
  // ≤ 16 chars fits one line at full size ("Swimming", "History").
  // 17–28 takes two lines at full size ("Olympic Weightlifting").
  // > 28 steps down a rung rather than running to a third line.
  const step = n > 28 ? 1 : 0;
  const size = step ? Math.round(base.size * 0.82) : base.size;
  const lineHeight = step ? Math.round(base.lineHeight * 0.86) : base.lineHeight;
  return { size: Math.round(size * scale), lineHeight: Math.round(lineHeight * scale), tracking: base.tracking, maxLines: base.maxLines };
}

/**
 * The BASELINE RULE, in one exported truth: a hero's title block is anchored to
 * the hero's BOTTOM edge, never its top. A one-line and a two-line title
 * therefore share the same last baseline and the title grows UPWARD into the
 * empty art, so nothing below the hero ever moves because a name got longer.
 * (This is the rule History currently breaks by putting its title on the rail
 * row: a two-line History title would push the segmented control down.)
 */
export const HERO_TITLE_ANCHOR = "bottom" as const;

/** The takeover's one figure — the count-up number on a Wrapped panel. It sits
 *  ABOVE the type ladder on purpose: `fs.stat` is the ceiling for a figure
 *  inside a page, and this is not inside a page. Anything else on a takeover
 *  panel uses the ordinary ramp. */
export const HERO_FIGURE = { size: 76, lineHeight: 78, tracking: -0.04 } as const;

/* ── 5. METADATA — one language, three slots ─────────────────────────────── */

/**
 * Every non-title string on a hero is one of exactly three things. Nothing else
 * is allowed on a hero, which is what stops "STRENGTH" (filled white pill),
 * "✦ YOUR WORKOUT, WRAPPED" (gold mono kicker) and "Archived" (bordered pill
 * toggle) from being three inventions of the same idea.
 *
 * - `eyebrow`   — one line directly ABOVE the title. What KIND of thing this is.
 * - `meta`      — one line directly BELOW the title. Facts about this instance.
 * - `accessory` — the rail's trailing slot. One label or one control. Never a
 *                 fact that the meta line already carries.
 */
export type HeroMetaSlot = "eyebrow" | "meta" | "accessory";

/** The ONE metadata type style. Mono, uppercase, tracked — identical in all
 *  three slots and all three ranks, so metadata reads as a single voice. */
export const HERO_META_TYPE = { size: fs.micro, lineHeight: 14, tracking: 0.08, uppercase: true, mono: true } as const;

/**
 * The eyebrow's tone. `tint` is the default everywhere; `solid` (an accent-
 * tinted white chip) is permitted ONLY over art, and only because an 11pt mono
 * line has no contrast substrate there. Tone follows contrast need — never
 * screen identity, which is how the plan cover ended up with a chip nobody
 * else had.
 */
export function heroEyebrowTone(rank: HeroRank, backdrop: HeroBackdrop): "tint" | "solid" {
  return rank === "cover" && backdrop === "art" ? "solid" : "tint";
}

/** Join meta parts into one line. The spaced en dash, per the project's
 *  no-middot rule — and the reason a hero never hand-joins its own parts. */
export function heroMetaLine(parts: (string | null | undefined | false)[]): string {
  return parts.filter((p): p is string => typeof p === "string" && p.trim().length > 0).join(" – ");
}

/* ── 6. BACKDROPS — what is allowed, and what is forbidden ───────────────── */

/**
 * The only legal backdrop for a rank. This function IS the rule: a screen that
 * wants a different ground has to change its rank, which is a decision about
 * what the screen *is*, not about how it should look.
 *
 * Forbidden, and unreachable through this API:
 *  - art or a wash behind a `title` hero — a collection has no portrait, and an
 *    accent wash on an information page makes it look like a product page;
 *  - the ambient field behind a `cover` — the cover is a printed object with its
 *    own ink, so the page's wash must not show through it;
 *  - two washes stacked, or a wash whose light source disagrees with the level.
 */
export function heroBackdrop(rank: HeroRank, mode: HeroMode, hasArt: boolean): HeroBackdrop {
  if (mode === "takeover") return "story";
  if (rank === "cover") return hasArt ? "art" : "wash";
  return "field";
}

/** Where the light comes from, by hierarchy level. A CONTAINER (a goal, a
 *  category) is lit from the left; the THINGS inside it from the right. Two
 *  levels of the same stack therefore never read as the same cover. */
export function heroLight(level: "container" | "item"): HeroLight {
  return level === "container" ? "left" : "right";
}

/** A cover is fixed-dark in both themes, so its status bar content is ALWAYS
 *  light. A `title` hero follows the theme — except once collapsed under a
 *  scrolled dark page, which the client resolves from `heroLayers().barred`. */
export function heroStatusBar(rank: HeroRank, mode: HeroMode, scheme: "light" | "dark"): "light" | "dark" {
  if (mode === "takeover" || rank === "cover") return "light";
  return scheme === "light" ? "dark" : "light";
}

/* ── 7. THE NAVIGATION BUTTON ────────────────────────────────────────────── */

/**
 * One control, one geometry, one position — forever.
 *
 * CIRCULAR, not a rounded rectangle. Three reasons, in order: (1) it has to
 * float over arbitrary art on `cover` and over nothing on `title`, and a circle
 * is the only shape that reads as an object rather than as a small card — a
 * rounded rectangle competes with the app's card language, which is exactly why
 * History's 14-radius square reads as a tile and not a control; (2) Apple's own
 * art-backed surfaces (Photos, Music's player, the App Store's Today card) all
 * use a circular glass button, and the app should feel like it ships with them;
 * (3) a circle is scale-invariant, so it survives Dynamic Type growth without a
 * radius that has to be re-tuned.
 *
 * 40pt visual inside a 44pt hit target. Always at the rail's leading edge, at
 * `safeTop + 4`, in every rank and mode. It NEVER moves between screens, and it
 * never scrolls away — on `title` rank the old header scrolled off, which meant
 * "back" existed only at the top of the page.
 *
 * MATERIAL is the one thing that varies, and it varies with what is behind it,
 * not with which screen it is on:
 *  - over the plain field → `clear`: no fill, chalk glyph. A chip floating on an
 *    empty page is noise.
 *  - over art, or once content has scrolled under the rail → `glass`: Liquid
 *    Glass where supported, white-12% + blur as the fallback, hairline at 18%.
 * The transition between the two is a cross-fade on the same circle, so the
 * control's SHAPE is never in motion.
 */
export function heroNavMaterial(backdrop: HeroBackdrop, barred: boolean): "clear" | "glass" {
  if (backdrop === "field") return barred ? "glass" : "clear";
  return "glass";
}

/** What the nav button DOES, which decides its glyph. A page pops (chevron); a
 *  takeover dismisses (chevron-down is Apple's dismiss for a presented
 *  full-screen, and it is the honest signal that there is no stack under it). */
export function heroNavAction(mode: HeroMode): { role: "pop" | "dismiss"; glyph: AuroraIconName } {
  return mode === "takeover" ? { role: "dismiss", glyph: "chevron-down" } : { role: "pop", glyph: "back" };
}

/* ── 8. TRANSITIONS — the one family ─────────────────────────────────────── */

/**
 * Every hero-to-hero move in the app is one of exactly three transitions, and
 * all three obey the same law: **the rail is the fixed point.** The nav button
 * does not animate, does not fade, does not move — it is the same object in
 * both screens, so the user's thumb never has to re-find it.
 *
 * - `lift`   — a card in a list becomes the destination's hero. The card's title
 *              is the matched geometry; the card's accent expands into the
 *              hero's wash. Used for History → Workout, Plans → Plan,
 *              Exercises → Exercise. The card is the hero, seen small.
 * - `deepen` — same subject, more detail (Workout → Exercise → Analytics). The
 *              hero rank stays or drops by one; the title cross-fades in place
 *              on a shared baseline while the backdrop's accent is inherited.
 *              Nothing flies, because nothing changed identity.
 * - `raise`  — a page becomes a takeover (Workout → Wrapped). The page's hero
 *              title rises to the takeover's title position and the ground
 *              darkens under it; the nav button cross-fades its glyph from
 *              chevron-back to chevron-down IN PLACE. The reverse lowers.
 *
 * There is no fourth. If a move doesn't fit one of these, the destination has
 * the wrong rank — that is the diagnostic, not a licence for a new transition.
 */
export type HeroTransition = "lift" | "deepen" | "raise";

/** Which transition a move uses, from the two screens' ranks and modes. */
export function heroTransition(from: { rank: HeroRank; mode?: HeroMode }, to: { rank: HeroRank; mode?: HeroMode }): HeroTransition {
  if ((to.mode ?? "page") === "takeover") return "raise";
  if ((from.mode ?? "page") === "takeover") return "raise";
  // Arriving at an identity page from a collection is always a card becoming a
  // hero; anything else is the same subject at a different depth.
  if (to.rank === "cover" && from.rank !== "cover") return "lift";
  return "deepen";
}

/** What each transition morphs, in the order the eye reads it. Exported so the
 *  clients (and the SwiftUI kit) declare the same choreography rather than each
 *  inventing one. `fixed` never animates — it is the spatial anchor. */
export const HERO_CHOREOGRAPHY: Record<HeroTransition, { fixed: string[]; morph: string[]; fade: string[] }> = {
  lift: { fixed: ["rail", "nav"], morph: ["title", "accent"], fade: ["meta", "art", "eyebrow"] },
  deepen: { fixed: ["rail", "nav", "accent"], morph: ["title"], fade: ["meta", "art", "eyebrow"] },
  raise: { fixed: ["rail"], morph: ["title", "nav.glyph", "ground"], fade: ["meta", "eyebrow", "page"] },
};

/* ── 9. THE SPATIAL QUESTIONS ────────────────────────────────────────────── */

/**
 * Every screen must be able to answer these four from its hero alone, with no
 * animation playing. This is the review checklist for any new hero, and the
 * reason the rules above are shaped the way they are.
 *
 * 1. Where did I come from? → the nav button's accessibility label names the
 *    origin ("← Olympic Weightlifting"), never a bare "Back".
 * 2. Where am I? → the title, at the same baseline it will keep while I scroll.
 * 3. What changed? → the backdrop's accent and rank. A rank change means a
 *    level change; an accent change means a subject change.
 * 4. What stayed the same? → the rail. Always. That is the whole trick.
 */
export const HERO_SPATIAL_CHECKLIST = [
  "Where did I come from — does the nav button name the origin?",
  "Where am I — is the title at its final baseline before any motion?",
  "What changed — does the rank or the accent encode it?",
  "What stayed the same — is the rail at the identical y as the previous screen?",
] as const;
