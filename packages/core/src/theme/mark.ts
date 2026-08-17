/**
 * A MARK — the one way a row, tile, lane or card says "draw a picture here".
 *
 * THE FINDING THIS ANSWERS. The design audit found three icon languages sharing
 * one product: the line-glyph set, the drawn sport marks (used at exactly two
 * sites), and Apple emoji everywhere else. The emoji were not sprinkled by
 * accident — they were STRUCTURAL. A dozen data types across core each declared
 * `icon: string` or `emoji: string`, every one of them holding a literal
 * pictograph, and every renderer downstream drew it with `<Text>`. Sweeping the
 * call sites would have left the fields, and the fields would have refilled.
 *
 * So the field changes type. `Mark` is a closed union of the two languages the
 * product keeps:
 *
 *   • `glyph` — a name in the ONE vocabulary (core theme/icons.ts): the design
 *     kit, the nutrition extension, the Today hub's three, the product marks.
 *   • `sport` — a SPORT, by name, drawn through `sportMark()`'s resolution
 *     (theme/sport-marks.ts). The mark names the KIND, not the instance.
 *
 * There is no third member, and `string` is not one of them — which is why a
 * pictograph can no longer be typed into any of these fields at all. That is
 * the difference between a sweep and a fix.
 *
 * Rendered by `<Mark>` on both clients (aurora/mark.tsx in each app).
 */

import { glyphPaths, type GlyphName } from "./icons";
import { sportMarkPaths } from "./sport-marks";

export type Mark =
  | { kind: "glyph"; name: GlyphName }
  | { kind: "sport"; sport: string };

/** A mark that draws a named glyph. */
export const glyphMark = (name: GlyphName): Mark => ({ kind: "glyph", name });

/** A mark that draws a sport, resolved from its name. */
export const sportMarkOf = (sport: string): Mark => ({ kind: "sport", sport });

/**
 * A mark's stroke paths, for the surfaces that take PATH DATA rather than a
 * component — chiefly the Hero's cover art (`artPaths`), which draws the mark
 * at 150dp as ghosted geometry.
 *
 * That hero is why the covers mattered here. A recipe tile watermarked its dish
 * EMOJI at 78dp and a plan cover did the same at 118 — the two sizes the type
 * ratchet had to except as "artwork, not type" — and at that scale an emoji is
 * a full-colour illustration desaturated to grey, exactly the failure
 * sport-marks.ts was written to end for sport pages. Stroke geometry ghosts;
 * a picture smudges.
 *
 * A `sport` mark with no drawing returns [] — the caller's cue to fall back,
 * never to draw nothing at a size that reserved room for something.
 */
export function markPaths(mark: Mark): string[] {
  return mark.kind === "sport" ? sportMarkPaths(mark.sport) : glyphPaths(mark.name);
}
