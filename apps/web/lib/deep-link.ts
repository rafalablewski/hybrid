"use client";

import { sportSlug } from "@hybrid/core";

/**
 * Deep links for the app shell.
 *
 * The shell switches screens in local state, which is fast and keeps the
 * transition system simple — but it meant NOTHING in the app had an address.
 * A verified product page couldn't be sent to anyone, bookmarked, or landed on
 * from an email; refreshing the tab always dumped you back on Today.
 *
 * This is the smallest thing that fixes that without turning every screen into
 * a Next route: the current screen (and a screen's own sub-target, e.g. which
 * verified food is open) live in the QUERY STRING, written with
 * `history.replaceState` so we don't stack a history entry per tab press, and
 * read back on mount. Deliberately not `next/router` — pushing a real route
 * would remount the shell and throw away the screen transition.
 *
 * The rules that keep this from becoming a mess:
 *   - the URL is a MIRROR of state, never the source of truth. State changes,
 *     then the URL is updated to match. Reading only happens on mount and on
 *     `popstate`.
 *   - a param that isn't recognised is ignored rather than error. A link from
 *     an older build must never land the user on a broken screen.
 *   - a SCREEN change pushes; a screen's own sub-target replaces. This file
 *     used to replace for everything, on the reasoning that tapping through
 *     five tabs shouldn't cost five Back presses to leave. That reasoning was
 *     wrong in the only way that matters: because the shell holds its location
 *     in React state and nothing else pushed either, Back had no app entry to
 *     return to and left the app ENTIRELY — from any depth, including the
 *     Android system back. Walking back through your own navigation is what
 *     every user expects the button to do; leaving the app on the first press
 *     is not a shortcut, it is a trapdoor.
 */

/** The params the shell owns. `s` = screen; the rest belong to a screen. */
export type DeepLinkParams = {
  /** the shell screen, e.g. "nutrition" */
  s?: string;
  /** a verified food's catalog id (nutrition) */
  food?: string;
  /** a verified source's id (nutrition) */
  source?: string;
  /** which sport's page is open, as its slug (see core `sportSlug`) */
  sport?: string;
  /** which POST is open, as its `<subjectType>:<subjectId>` key (core
   *  `feedSubjectKey`) — what makes a shared post land ON the post. */
  post?: string;
  /** whose PAGE is open, as their @handle (core `userPageHref`) — what makes a
   *  shared profile land ON the person. */
  u?: string;
};

const KEYS: (keyof DeepLinkParams)[] = ["s", "food", "source", "sport", "post", "u"];

/** A post key carries a colon (`session:abc`); every other param we own is a
 *  plain id. Both are still bounded and pattern-checked — this is the one place
 *  an attacker-controlled string becomes screen state. */
const PATTERN: Partial<Record<keyof DeepLinkParams, RegExp>> = { post: /^[A-Za-z0-9_:-]+$/ };
const DEFAULT_PATTERN = /^[A-Za-z0-9_-]+$/;

// ── The pure half ──────────────────────────────────────────────────────────
// Parsing and serialising are plain string functions so they can be tested
// without a DOM — the same pure-core / thin-shell split the rest of the
// codebase uses. The DOM wrappers below are the only part that touches
// `window`, and they contain no logic worth testing.

/**
 * Parse a query string into the params we own.
 *
 * This is the ONE place in the app where an attacker-controlled string — the
 * contents of somebody's URL bar — is read into screen state, so every value is
 * bounded and pattern-checked before it can reach a catalog lookup or the
 * screen. Anything that isn't a plain id is dropped rather than rejected
 * loudly: a link from an older build must degrade to "the app opened", never to
 * an error page.
 */
export function parseDeepLink(search: string): DeepLinkParams {
  const q = new URLSearchParams(search);
  const out: DeepLinkParams = {};
  for (const k of KEYS) {
    const v = q.get(k);
    if (v && v.length <= 80 && (PATTERN[k] ?? DEFAULT_PATTERN).test(v)) out[k] = v;
  }
  return out;
}

/**
 * Apply a patch to a query string. Keys set to `undefined`/`null` are REMOVED,
 * so leaving a product page drops `?food=` rather than leaving a stale address
 * pointing at a screen the user is no longer on. Keys absent from the patch are
 * left alone, so the shell and a screen can each own their own params without
 * clobbering each other.
 */
export function applyDeepLink(search: string, patch: DeepLinkParams): string {
  const q = new URLSearchParams(search);
  for (const k of KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

// ── The DOM half ───────────────────────────────────────────────────────────

/** Read the current link params. Empty object during SSR. */
export function readDeepLink(): DeepLinkParams {
  if (typeof window === "undefined") return {};
  return parseDeepLink(window.location.search);
}

/** What we keep in `history.state`. The index is a monotonically increasing
 *  position in OUR navigation, which is the only way to tell a Back from a
 *  Forward on `popstate` — the event itself says which entry you landed on, not
 *  which way you travelled. Without it, Forward would replay a backwards
 *  transition, which is a motion bug hiding inside a navigation fix. */
export type DeepLinkState = { hybridIdx?: number };

/** Mirror state into the URL.
 *
 *  `push` for a real screen change, so the browser Back button walks back
 *  through the app instead of leaving it (this shell holds its location in
 *  React state, so without a pushed entry Back exits the app from any depth).
 *  `replaceState` stays the default for a screen's OWN sub-target (which food
 *  is open, say) — that is a detail of where you already are, not a new place. */
export function writeDeepLink(patch: DeepLinkParams, opts?: { push?: boolean; state?: DeepLinkState }): void {
  if (typeof window === "undefined") return;
  const url = `${window.location.pathname}${applyDeepLink(window.location.search, patch)}${window.location.hash}`;
  try {
    const state = opts?.state ?? window.history.state ?? null;
    if (opts?.push) window.history.pushState(state, "", url);
    else window.history.replaceState(state, "", url);
  } catch {
    /* a sandboxed iframe can refuse history writes — the app still works */
  }
}

/** The index stored on the CURRENT history entry, or 0 if there isn't one
 *  (a fresh load, or an engine that refused the write). */
export function currentDeepLinkIndex(): number {
  if (typeof window === "undefined") return 0;
  const s = window.history.state as DeepLinkState | null;
  return typeof s?.hybridIdx === "number" ? s.hybridIdx : 0;
}

/**
 * Subscribe to Back/Forward. The callback receives the params and the INDEX of
 * the entry landed on; comparing it against the last index the caller pushed is
 * what says which way the user travelled.
 *
 * The comparison deliberately lives with the caller rather than in a closure
 * here. A local `last` updated only on popstate goes stale the moment a forward
 * navigation pushes — after three pushes it would still hold the index from
 * subscribe time, and the first Back would be reported as a Forward. The shell
 * already tracks its position for the push side, so there is exactly one
 * counter and it cannot drift from itself.
 */
export function onDeepLinkChange(fn: (p: DeepLinkParams, idx: number) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: PopStateEvent) => {
    const s = e.state as DeepLinkState | null;
    fn(readDeepLink(), typeof s?.hybridIdx === "number" ? s.hybridIdx : 0);
  };
  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}

/** An absolute, shareable link to a verified product page. */
export function verifiedFoodUrl(id: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/app?s=nutrition&food=${encodeURIComponent(id)}`;
}

/** An absolute, shareable link to one sport's page. Takes the display name and
 *  writes the slug, so a caller never has to know the URL shape. */
export function sportPageUrl(name: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/app?s=sportpage&sport=${encodeURIComponent(sportSlug(name))}`;
}

/** An absolute, shareable link to a verified source page. */
export function verifiedSourceUrl(id: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/app?s=nutrition&source=${encodeURIComponent(id)}`;
}
