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

/** Read the current link params. Empty object during SSR. */
export function readDeepLink(): DeepLinkParams {
  if (typeof window === "undefined") return {};
  const q = new URLSearchParams(window.location.search);
  const out: DeepLinkParams = {};
  for (const k of KEYS) {
    const v = q.get(k);
    // Bound the value: these end up in lookups and, in the worst case, on
    // screen. A link is attacker-controlled input like any other.
    if (v && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v)) out[k] = v;
  }
  return out;
}

/**
 * Mirror state into the URL. Keys set to `undefined`/`null` are removed, so
 * leaving a product page drops `?food=` rather than leaving a stale address
 * pointing at a screen the user is no longer on.
 */
export function writeDeepLink(patch: DeepLinkParams, opts?: { push?: boolean }): void {
  if (typeof window === "undefined") return;
  const q = new URLSearchParams(window.location.search);
  for (const k of KEYS) {
    if (!(k in patch)) continue;
    const v = patch[k];
    if (v) q.set(k, v);
    else q.delete(k);
  }
  const qs = q.toString();
  const url = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
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
