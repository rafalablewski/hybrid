// THE APP HEADER — the lockup row at the top of a bottom-nav tab root.
//
// Avatar on the left, the HYBRID wordmark (with the day-streak on the line
// under it) in the centre, notifications on the right. It is the app's
// identity strip: who you are, where you are, what is waiting. It sits at the
// very top of a TAB ROOT and nowhere else — a pushed screen has a hero rail
// instead, and a sub-view inside a tab has its own back-header.
//
// It shipped as forty lines of JSX typed twice — once inside each client's
// home screen — under a comment on each side saying "mirrors the other". They
// had already drifted where it counts: the flanking tiles were 42 on the phone
// against 44 in the browser (and 42 is under the 44 pt minimum tap target), and
// an athlete with no name got "·" on one client and "A" on the other. The
// numbers are stated once, here, and rendered by a component that no
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
import { STREAK_MARK } from "./streak-mark";

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
  /** The day-streak's offset under the wordmark — the ONE thing about the mark
   *  that is the header's business. The mark itself (its size, its flame, its
   *  colour and where it goes when tapped) is the shared STREAK_MARK, at its
   *  `hairline` rung, so the header cannot dress the streak differently from
   *  the two other places it appears. */
  streak: { top: 3 },
  /** The unread badge riding the bell's top-right corner. */
  badge: { size: 18, inset: -5, ring: 2, text: fs.nano },
  /** The gap under the row, to whatever the tab puts first — its hub pills, or
   *  its masthead. */
  gap: { below: space.none },
} as const;

/** The row's height at rest. The tiles set it; the lockup fits inside it. */
export const APP_HEADER_HEIGHT = APP_HEADER.tile.size;

/** What the lockup actually occupies: the wordmark, the gap, and the streak
 *  mark's line. Stated so the guard can prove it clears the row rather than
 *  taking the comment's word for it. */
export const APP_HEADER_LOCKUP_HEIGHT =
  APP_HEADER.wordmark.size + APP_HEADER.streak.top + STREAK_MARK.hairline.size * 1.6;

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
