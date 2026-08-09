// THE APP HEADER — the lockup row at the top of a bottom-nav tab root.
//
// Avatar on the left, the HYBRID wordmark (with the day-streak on the line
// under it) in the centre, notifications on the right. It is the app's
// identity strip: who you are, where you are, what is waiting. It sits at the
// very top of a TAB ROOT and nowhere else — a pushed screen has a hero rail
// instead, and a sub-view inside a tab has its own back-header.
//
// It shipped as forty lines of JSX typed twice — once inside
// apps/mobile/components/aurora/home.tsx and once inside
// apps/web/components/aurora/today.tsx — under a comment on each side saying
// "mirrors the other". They had already drifted where it counts: the flanking
// tiles were 42 on the phone against 44 in the browser (and 42 is under the
// 44 pt minimum tap target), and an athlete with no name got "·" on one client
// and "A" on the other. Both are now stated once, here, and rendered by twin
// components (apps/{web,mobile}/components/aurora/app-header.tsx) that no
// screen may pass a style to.
//
// THE THREE-COLUMN RULE is the reason the numbers matter. The row is a fixed
// tile / flexible centre / fixed tile grid, so the wordmark is centred BY
// CONSTRUCTION rather than by the two flanks happening to weigh the same. The
// streak used to be a pill in the right flank, which pushed the brand ~69 off
// centre and moved it again with every extra digit; it is the lockup's second
// line now, and it costs no height — wordmark (19) plus caption (~16) still
// sits inside the tile.

import { fs, space, tracking } from "./scale";

/**
 * THE CONTRACT. Four clusters, and the row is fully specified.
 */
export const APP_HEADER = {
  /** The flanking tiles: the avatar on the left, the bell on the right. 44 is
   *  the platform minimum tap target — the phone's 42 was a near miss nobody
   *  had a reason for. It is also the row's height, so the lockup between them
   *  must fit inside it. */
  tile: { size: 44, radius: 12 },
  /** The wordmark. One size, one tracking, on both clients — web stated the
   *  tracking in em (-.03em ≈ -0.57 at 19) where mobile stated it in dp; the
   *  app's tracking scale is in dp (see hub-masthead.ts for the same note). */
  wordmark: { size: 19, tracking: tracking.display },
  /** The day-streak caption under the wordmark. A HAIRLINE: deliberately below
   *  the type scale's smallest rung (fs.nano, 10), because it is a mark on the
   *  lockup rather than a line of copy, and because it has to stay one line in
   *  every locale ("-dniowa seria", "-Tage-Serie") inside the tile's height. */
  streak: { size: 9.5, tracking: tracking.caps, icon: 11, gap: space.xxs, top: 3 },
  /** The unread badge riding the bell's top-right corner. */
  badge: { size: 18, inset: -5, ring: 2, text: fs.nano },
  /** The gap under the row, to whatever the tab puts first — its hub pills, or
   *  its masthead. */
  gap: { below: space.none },
} as const;

/** The row's height at rest. The tiles set it; the lockup fits inside it. */
export const APP_HEADER_HEIGHT = APP_HEADER.tile.size;

/**
 * The avatar's initials, from a display name — up to two, uppercased.
 *
 * ONE placeholder for a nameless athlete, and it is the middot: a standalone
 * `·` used as CONTENT is an empty-avatar glyph, not the separator the house
 * style forbids. Web shipped "A" (for nothing in particular), which read as a
 * real initial belonging to someone else.
 */
export function avatarInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "·";
  return parts.slice(0, 2).map((w) => w[0]!).join("").toUpperCase();
}

/** The badge's label — a count, capped so two digits can never widen the tile. */
export function unreadLabel(count: number): string {
  return count > 9 ? "9+" : String(count);
}
