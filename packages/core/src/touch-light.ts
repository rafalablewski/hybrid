/**
 * THE TOUCH LIGHT — what the material does under a finger, where the material
 * is not there to do it.
 *
 * iOS 26's Liquid Glass answers a press itself: a soft pool of light blooms
 * beneath the touch POINT, so the confirmation lands where the finger actually
 * is rather than as a property of the whole control. The kit already gets this
 * for free on the handful of controls it hands wholesale to SwiftUI —
 * `swiftui.tsx`'s leaves pass `glassEffect({ glass: { interactive: true } })`
 * and the system draws the rest.
 *
 * Everything else in the app is drawn by React Native, and React Native takes
 * the press. `ASatellite` says so in its own doc — the native branch gets "the
 * material answers the press itself, which is worth most on the controls a
 * chalked thumb hits without looking", and the RN branch beside it got the
 * shared `PressScale` and nothing more. A scale-down is a property of the
 * BUTTON; it tells you the button was pressed and not where. So the same
 * control confirms a tap two different ways depending on whether its mark
 * happened to exist as an SF Symbol, which is the kind of split that reads as
 * two controls.
 *
 * These numbers are that pool, written down once so the surfaces that draw it
 * cannot each pick their own. They are deliberately NOT the material's own
 * physics: this is a single soft radial fill, not refraction, and pretending
 * otherwise on a surface with no depth to refract would look like a stain.
 */
export const TOUCH_LIGHT = {
  /**
   * The pool's diameter in dp, at full bloom.
   *
   * A CONSTANT, not a fraction of the control — which is the whole point of
   * lighting the point rather than the surface. A pool sized to its host would
   * be a 44dp dot on a chip and a 350dp wash on a full-width pill, i.e. the
   * property-of-the-button feedback this exists to replace. 132 is a little
   * over a fingertip's contact patch (~45dp) plus its falloff: big enough to
   * read as light spilling out from under the finger, small enough that a
   * full-width `APill` is lit locally rather than flooded.
   */
  diameter: 132,
  /**
   * Opacity at the pool's CENTRE. The edge is always zero — a radial fill that
   * ends anywhere else draws a visible disc, and a disc under a finger is a
   * blob, not a light.
   */
  core: 0.22,
  /**
   * Where the falloff has already spent most of itself, as a fraction of the
   * radius, and the opacity there. Two stops make a linear ramp, which reads as
   * a cone; the third bends it so the pool is bright in the middle and fades
   * out long, the way a light source behind a diffuser actually falls off.
   */
  midStop: 0.55,
  mid: 0.07,
  /**
   * Scale the pool starts at. It grows INTO the touch rather than appearing at
   * full size, so the bloom has a direction — outward, from the point of
   * contact. Not from zero: a light that starts at nothing has to travel before
   * it is visible at all, which delays the confirmation it exists to give.
   */
  from: 0.45,
  /**
   * The bloom, in ms. Slower than the press scale's 120ms down: the scale is
   * the CONFIRMATION and must be immediate, while the light is the thing you
   * notice a beat later. Faster than that and the two land as one event and the
   * pool reads as a flash.
   */
  bloomMs: 220,
} as const;
