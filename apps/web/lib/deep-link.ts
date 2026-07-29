"use client";

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
 *   - `replaceState` by default: a user tapping through five tabs should press
 *     Back once to leave, not five times.
 */

/** The params the shell owns. `s` = screen; the rest belong to a screen. */
export type DeepLinkParams = {
  /** the shell screen, e.g. "nutrition" */
  s?: string;
  /** a verified food's catalog id (nutrition) */
  food?: string;
  /** a verified source's id (nutrition) */
  source?: string;
};

const KEYS: (keyof DeepLinkParams)[] = ["s", "food", "source"];

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
    if (v && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v)) out[k] = v;
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

/** Mirror state into the URL. `push` only for real destinations — see the note
 *  at the top of this file about not costing five Back presses to leave. */
export function writeDeepLink(patch: DeepLinkParams, opts?: { push?: boolean }): void {
  if (typeof window === "undefined") return;
  const url = `${window.location.pathname}${applyDeepLink(window.location.search, patch)}${window.location.hash}`;
  try {
    if (opts?.push) window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  } catch {
    /* a sandboxed iframe can refuse history writes — the app still works */
  }
}

/** Subscribe to Back/Forward. Returns an unsubscribe. */
export function onDeepLinkChange(fn: (p: DeepLinkParams) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => fn(readDeepLink());
  window.addEventListener("popstate", handler);
  return () => window.removeEventListener("popstate", handler);
}

/** An absolute, shareable link to a verified product page. */
export function verifiedFoodUrl(id: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/app?s=nutrition&food=${encodeURIComponent(id)}`;
}

/** An absolute, shareable link to a verified source page. */
export function verifiedSourceUrl(id: string, origin?: string): string {
  const base = origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/app?s=nutrition&source=${encodeURIComponent(id)}`;
}
