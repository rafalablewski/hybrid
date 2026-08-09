/**
 * THE PERSON SEED — what a row already knows, handed to the page it opens.
 *
 * The individual user page fetches the person it is opening, which is what
 * makes a shared link work for someone who has never scrolled past them. But
 * almost nobody arrives cold: they tap an avatar in the feed, a row in the
 * leaderboard, a coach in the directory — surfaces that are ALREADY holding
 * that person's name, handle and avatar. Fetching those three fields again
 * before painting anything means the page opens on a spinner and the identity
 * pops in a beat later, every single time, for data the previous screen had in
 * hand.
 *
 * The post screen solved this by taking the row as an `initial` prop. A person
 * can be opened from seven places on two clients, though, and threading a prop
 * through seven call sites twice is how the two clients drift. So the hand-over
 * is a tiny store instead: a row `seed()`s what it has on its way out, the page
 * `peek()`s it for its first paint, and the fetch confirms or corrects it a
 * moment later. Nothing here is authoritative — it is the identity fields only,
 * never stats, never the coaching block, never anything privacy-gated — so a
 * stale seed can be wrong about a display name for one frame and about nothing
 * else.
 *
 * Bounded on purpose: a long feed scroll would otherwise seed hundreds of
 * people into a map that never shrinks.
 */

import type { PersonCard } from "./social-dto";

/** The identity fields a page can paint before its fetch returns. Deliberately
 *  a subset of PersonCard: anything a viewer isn't entitled to see is not in
 *  here and cannot be, because no caller has it either. */
export interface PersonSeed {
  handle: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  coachVerified?: boolean;
}

/** How many people we remember. A feed scroll seeds one per row it opens, and
 *  nobody navigates back through more than a handful. */
export const PERSON_SEED_MAX = 40;

const store = new Map<string, PersonSeed>();

const key = (handle: string): string => handle.trim().toLowerCase();

/**
 * Remember what this row knows, on its way to the person's page. Called by the
 * OPENER, not the page — the opener is the one holding the card.
 */
export function seedPerson(card: Pick<PersonCard, "handle" | "displayName" | "avatarUrl" | "coachVerified">): void {
  const h = key(card.handle ?? "");
  if (!h) return;
  // Re-seeding moves the entry to the newest position, so the people you keep
  // opening are the ones that survive the bound.
  store.delete(h);
  store.set(h, {
    handle: h,
    displayName: card.displayName ?? null,
    avatarUrl: card.avatarUrl ?? null,
    coachVerified: card.coachVerified ?? false,
  });
  while (store.size > PERSON_SEED_MAX) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
}

/** What we know about this handle, or null. Non-destructive: opening the same
 *  person twice from the same row must paint the same both times. */
export function peekPerson(handle: string): PersonSeed | null {
  return store.get(key(handle ?? "")) ?? null;
}

/** Test/teardown only. */
export function clearPersonSeeds(): void {
  store.clear();
}
