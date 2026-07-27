"use client";

import type { UseQueryResult } from "@tanstack/react-query";

/**
 * THE SAFE-CACHE CONTRACT — the three-state read every data-driven screen uses.
 * The web twin of mobile's lib/queries.ts `Read`; same contract, same reason,
 * so the two clients cannot drift on what "we don't know yet" looks like.
 *
 * The bug this exists to make unrepresentable: a screen that holds `[]` before
 * its first fetch answers cannot distinguish "the user has no training history"
 * from "we haven't asked yet", so it renders the zero-state as fact — "log a
 * session", "No season yet" — at an athlete with years of data, then swaps it
 * for the truth a second later. That is not slowness; it is the app asserting
 * something it does not know.
 *
 * So a read is one of three things, never a bare value:
 *   • `ready: false`  — UNKNOWN. Nothing has ever resolved. Render a skeleton.
 *     NEVER a zero-state, an empty list, or a computed number: every one of
 *     those is a claim we cannot support yet.
 *   • `ready: true`   — we have a real value the server actually returned.
 *     Render it, even while `refreshing` — that is the whole point of the
 *     cache, and it is safe because the value was true when it was fetched and
 *     any change WE made has already invalidated it.
 *   • `failed: true`  — we asked and could not get an answer. Render the error,
 *     never emptiness. (Still `ready` when a previous value is cached: the last
 *     known truth beats blanking a page someone was reading, with the retry on
 *     top of it.)
 *
 * `refreshing` drives refresh affordances and NOTHING else. It must never gate
 * content — dropping a rendered card back to a skeleton because a background
 * revalidate started is the same lie in reverse.
 */
export type Read<T> = {
  data: T | undefined;
  /** A real, server-returned value is in hand. False = unknown, show a skeleton. */
  ready: boolean;
  /** A fetch is in flight. Drives refresh UI only — never gates content. */
  refreshing: boolean;
  /** The last attempt failed. Show an error, never an empty state. */
  failed: boolean;
  /** We have STOPPED WAITING — either an answer arrived or the attempt failed.
   *  Gate anything that must not hang on this rather than on `ready`: a read
   *  that errors is never `ready`, so a skeleton gated on `ready` alone would
   *  stay up forever. `settled && !ready` is precisely the error case. */
  settled: boolean;
  retry: () => void;
};

/** Wraps a useQuery result in the Read contract above. */
export function toRead<T>(q: UseQueryResult<T>): Read<T> {
  return {
    data: q.data,
    // isSuccess (not `!isPending`) is the honest test: it means a fetch
    // RESOLVED. A query that is merely no longer pending because it errored has
    // no value to show, and `data !== undefined` keeps a cached value readable
    // through a later failed refetch.
    ready: q.isSuccess || q.data !== undefined,
    refreshing: q.isFetching,
    failed: q.isError,
    settled: q.isSuccess || q.isError || q.data !== undefined,
    retry: () => { void q.refetch(); },
  };
}

/** Combine several reads into one screen-level gate. A screen is only `ready`
 *  when EVERY read it renders from is — otherwise half the page states facts
 *  while the other half invents them. */
export function combineReads(...reads: { ready: boolean; refreshing: boolean; failed: boolean; settled: boolean }[]) {
  return {
    ready: reads.every((r) => r.ready),
    refreshing: reads.some((r) => r.refreshing),
    failed: reads.some((r) => r.failed),
    settled: reads.every((r) => r.settled),
  };
}
