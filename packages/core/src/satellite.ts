/**
 * THE SATELLITE — the neutral glass control, and the numbers both clients draw
 * it with.
 *
 * A satellite is the button that ORBITS a filled primary: Pause and Finish
 * beside Log set, the ✕ / ★ / → around Share on the finish summary. It carries
 * no brand paint (that is the primary's job and the primary's alone), so it is
 * exactly the control the system's own glass exists for — on iOS 26 the mobile
 * twin hands the whole button to SwiftUI (`GlassSatellite`), and everywhere
 * else both clients draw the floor these numbers describe.
 *
 * IT EXISTS BECAUSE THE SAME BUTTON WAS DRAWN FOUR WAYS. In one file — the live
 * logger — the dock's satellites were a 44pt circle at chalk 6% inside a 14%
 * ring, the summary's orbs a 40pt circle at 8% inside the same ring with a
 * different `on` state, the header's toolbar capsule a 5% fill inside `line`,
 * and the minimize button a 34pt circle that its own comment called "the same
 * control family as HeroNav's back circle" while HeroNav draws 40 in a 44 hit
 * box from `HERO.nav`. Four fills, three diameters, one control.
 *
 * The geometry is deliberately NOT `HERO.nav`'s. A nav button is the screen's
 * one exit and sits alone in the rail; a satellite sits in a cluster beside a
 * 56pt primary, where 44 is what keeps the row's thumb targets equal. They are
 * different controls that happen to share a material — so they share the RIM,
 * and nothing else.
 */
export const SATELLITE = {
  /** The circle's diameter, and the capsule's height. Apple's minimum target,
   *  and the figure the dock's row is measured against. */
  size: 44,
  /** The mark inside it. */
  glyph: 18,
  /** A labelled capsule's side padding — the one shape a satellite takes when
   *  its glyph cannot speak for itself. */
  wordPad: 17,
  /** The caption UNDER a satellite (the summary cluster's ROUTINE / ANALYSIS),
   *  measured from the circle's bottom edge. */
  captionGap: 6,
  /**
   * THE FLOOR'S RIM — what the control wears wherever the real material does
   * not render (Android, iOS < 26, and the web twin's non-glass ground).
   *
   * Chalk over the screen's own ground rather than a fixed white, so it tracks
   * the palette. `on` is the only state a satellite has,
   * and it is a fill-and-ring change rather than an accent: an accent here
   * would put a second "go" colour beside the primary, which is the one thing
   * the cluster is arranged to prevent.
   */
  alpha: { fill: 0.08, stroke: 0.14, onFill: 0.16, onStroke: 0.3 },
} as const;
