import type { AuroraIconName } from "@hybrid/core";
import type { SFSymbol } from "./swiftui";

/**
 * THE SHARE MARK — one drawing of "send this somewhere", named once.
 *
 * Share is the app's most re-implemented affordance: the recipe cover asks for
 * the system's `square.and.arrow.up`, the finish summary drew a `↗︎` TEXT
 * character inside a hand-rolled chartreuse pill, Settings a bare `↗`. Three
 * marks for one verb, and none of them the platform's.
 *
 * The pair is the point. Every share affordance mounts a shared control
 * (`HeroAction` in a hero rail, `ASatellite` in a cluster) and both take the
 * same two names: the SF SYMBOL where Liquid Glass renders, and the house
 * VECTOR — an arrow leaving a tray, the same drawing — everywhere else. Naming
 * them here rather than at each call site is what stops the next screen from
 * picking a fourth.
 */
export const SHARE_MARK: { glyph: SFSymbol; fallback: AuroraIconName } = {
  glyph: "square.and.arrow.up",
  fallback: "share",
};
