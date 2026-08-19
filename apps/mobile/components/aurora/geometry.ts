/**
 * THE GEOMETRY CONSTANTS — corner radii and the screen gutter.
 *
 * A LEAF, deliberately: it imports nothing from this directory, so anything may
 * read it without joining a cycle. These three used to live in aurora/kit.tsx,
 * which is the file every screen imports — and which itself imports hero.tsx
 * for HeroScreen. The moment a hero component needed the anchored menu (which
 * reads RADIUS), the graph closed into kit → hero → hold-menu → kit and
 * `RADIUS` evaluated as `undefined` in whichever module lost the race.
 *
 * kit.tsx re-exports all three, so `import { RADIUS } from "./kit"` still works
 * everywhere it already did.
 */

export const RADIUS = { mark: 3, inner: 12, field: 16, card: 28, pill: 999 } as const;

/**
 * CONCENTRIC RADIUS — a nested corner that shares its parent's centre.
 *
 * iOS 26 made this a rule rather than a taste: a child inset by `pad` inside a
 * container of radius `parent` is only truly concentric at `parent - pad`. Draw
 * it at some other value and the two arcs run on different centres — which is
 * why a 12dp tile inside a 28dp card reads as pasted on rather than set in,
 * even though nobody can say why.
 *
 * It applies to a block INSET ON ALL SIDES by the padding — a panel inside a
 * card, a row group inside a sheet. It does NOT apply to a 40dp glyph tile that
 * happens to sit near an edge: that one is a mark, and marks take `RADIUS.inner`.
 * Clamped at `mark` so a deep pad can't hand back a negative or a hairline
 * corner that reads as a mistake.
 */
export const concentricRadius = (parent: number, pad: number): number =>
  Math.max(RADIUS.mark, Math.round(parent - pad));

/** The screen's side gutter, in dp — matches the web app-shell's mobile
 *  --page-pad-x (12px) so content fills the same share of the screen on both
 *  clients. Full-bleed rails bleed by exactly this (see the slider rule in
 *  CLAUDE.md); HERO.gutter.edge in core carries the same value for the hero
 *  system. Vertical rhythm is separate (AuroraScreen's `padding`, 16).
 *
 *  A SCREEN THAT OWNS ITS OWN SCROLLER MUST IMPORT THIS. AuroraScreen and the
 *  hero scaffold apply the gutter for you, so a screen that opts out of them
 *  (Today's hub — its custom entrance + pager; History and the feed — their
 *  own FlatList) is the one place the value can drift. It did: the 16 -> 12
 *  sweep moved every rail on Today to bleed 12 while Today's own ScrollView
 *  stayed at 16, leaving a 4dp sliver of gutter beside every cut card and
 *  shifting the hub chrome 4dp between Dashboard and Performance/Feed. Read
 *  the token, never a number. */
export const GUTTER = 12;
