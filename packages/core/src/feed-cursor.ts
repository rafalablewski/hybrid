/**
 * PAGING A TIMELINE — the cursor, and why it is keyset rather than an offset.
 *
 * A person's page shows their training newest-first. Paging that with
 * `skip`/`take` is wrong in the one way that matters here: the list MOVES while
 * you read it. Finish a workout mid-scroll and every subsequent offset shifts by
 * one, so page 2 repeats the last row of page 1 — or skips one. An offset
 * describes a position in a list that no longer exists.
 *
 * A KEYSET cursor describes the last thing you SAW: "everything strictly older
 * than this". New posts arriving at the top change nothing about what comes
 * after it, and a deleted item doesn't strand the page either, because the
 * cursor is a POSITION IN TIME, not a reference to a row that has to still be
 * there.
 *
 * The tiebreak matters. Two sessions can carry the same timestamp (a bulk
 * import, or two workouts finished in the same second), and `at` alone would
 * either drop one or loop forever on it. So the key is the PAIR — `(at, id)` —
 * ordered the same way the feed is: newer first, and among equal timestamps, by
 * id descending. That is a total order, which is what makes the paging stable.
 */

/** What a cursor names: the last item a page ended on. */
export interface FeedCursor {
  /** The item's sort timestamp (ms). */
  at: number;
  /** The item's id — the tiebreak among identical timestamps. */
  id: string;
}

/** The shape this module can page: anything the feed sorts. */
export interface CursorableItem {
  id: string;
  at: number;
}

/** Serialised form. Deliberately readable rather than base64 — it travels in a
 *  query string, it is not a secret, and an unreadable cursor is a debugging
 *  tax. The separator is `.` because a cuid contains no dot. */
export function encodeFeedCursor(c: FeedCursor): string {
  return `${Math.trunc(c.at)}.${c.id}`;
}

/**
 * Parse a cursor. Returns null for anything malformed rather than throwing:
 * this value arrives from a URL, so it is attacker-controlled, and a bad cursor
 * must degrade to "the first page" rather than to an error page.
 */
export function decodeFeedCursor(raw: string | null | undefined): FeedCursor | null {
  if (!raw) return null;
  const dot = raw.indexOf(".");
  if (dot <= 0 || dot === raw.length - 1) return null;
  const at = Number(raw.slice(0, dot));
  const id = raw.slice(dot + 1);
  if (!Number.isFinite(at) || at < 0) return null;
  // Same bound + character class the deep-link parser applies to ids.
  if (id.length > 64 || !/^[A-Za-z0-9_:-]+$/.test(id)) return null;
  return { at, id };
}

/** Is `item` strictly older than the cursor, in the feed's own total order? */
export function isAfterCursor(item: CursorableItem, c: FeedCursor): boolean {
  if (item.at !== c.at) return item.at < c.at;
  return item.id < c.id;
}

export interface FeedPage<T> {
  items: T[];
  /** Feed this back to get the next page. `null` means there is no next page —
   *  though see `capped` on the responses that carry one: "no more we can
   *  reach" is not the same claim as "no more exist". */
  nextCursor: string | null;
}

/**
 * Take one page from a newest-first list.
 *
 * `items` must already be in feed order (newest first). Everything at or newer
 * than the cursor is dropped, `limit` are taken, and a next cursor is emitted
 * only when something was actually left behind — so the last page ends cleanly
 * instead of offering a door onto nothing.
 */
export function pageFeedItems<T extends CursorableItem>(
  items: T[],
  cursor: string | null | undefined,
  limit: number,
): FeedPage<T> {
  const c = decodeFeedCursor(cursor);
  const rest = c ? items.filter((i) => isAfterCursor(i, c)) : items;
  const take = Math.max(1, Math.trunc(limit));
  const page = rest.slice(0, take);
  const last = page[page.length - 1];
  return {
    items: page,
    nextCursor: rest.length > page.length && last ? encodeFeedCursor({ at: last.at, id: last.id }) : null,
  };
}
