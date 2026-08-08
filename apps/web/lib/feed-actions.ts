"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_FEED_SAVED,
  FEED_SAVED_STORAGE_KEY,
  feedSubjectKey,
  normalizeFeedSaved,
  toggleFeedSaved,
  type FeedSavedState,
  type FeedSharePayload,
  type FeedSubjectRef,
} from "@hybrid/core";

/**
 * SAVED POSTS + SHARING (web). Twin of apps/mobile/lib/feed-actions.ts — the
 * state shape, the storage key and the share payload all come from
 * @hybrid/core (feed-actions.ts), so the two clients cannot drift on what a
 * "saved post" is or on what a shared link says.
 *
 * PER-DEVICE, same contract as the notification read-state beside it
 * (lib/notif-read.ts): a small idempotent set of ids in localStorage. It needs
 * no migration on a database this sandbox cannot reach, and the worst case is
 * that a post saved on the phone isn't in the laptop's list. Server-side sync
 * is tracked as `feed-save-server-sync` in capabilities.ts.
 */

let state: FeedSavedState = DEFAULT_FEED_SAVED;
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function hydrate(): void {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(FEED_SAVED_STORAGE_KEY);
    if (raw) state = normalizeFeedSaved(JSON.parse(raw));
  } catch {
    /* a corrupt blob degrades to "nothing saved" — never a broken feed */
  }
}

/** Save / unsave one post. Optimistic by construction: the store updates before
 *  the write, so the glyph fills on the same frame as the press. */
export function toggleSavedPost(ref: FeedSubjectRef): void {
  hydrate();
  state = toggleFeedSaved(state, feedSubjectKey(ref));
  try {
    window.localStorage.setItem(FEED_SAVED_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* a full/blocked store must not break the screen */
  }
  emit();
}

function subscribe(l: () => void): () => void {
  hydrate();
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The saved set. The server render sees the default (nothing saved) and the
 *  client hydrates — an under-filled glyph for one frame beats a hydration
 *  mismatch on every row of the feed. */
export function useFeedSaved(): FeedSavedState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => DEFAULT_FEED_SAVED,
  );
}

/**
 * Hand a post to the OS. `navigator.share` where the browser has it (mobile
 * web, Safari, Edge); the clipboard otherwise, which is what a desktop browser
 * can actually honour. Returns "copied" when the caller should say so, and
 * null when nothing happened (the user dismissed the sheet).
 *
 * The same two-step is already used by the nutrition food share and the
 * profile share (lib/account-settings) — this keeps the feed on that idiom.
 */
export async function runShare(payload: FeedSharePayload): Promise<"shared" | "copied" | null> {
  if (typeof navigator === "undefined") return null;
  if (navigator.share) {
    try {
      await navigator.share({ title: payload.title, text: payload.text, url: payload.url });
      return "shared";
    } catch {
      return null; // dismissed — not an error, and not something to report
    }
  }
  return copyLink(payload);
}

/** The desktop fallback. Not exported: the overflow menu deliberately has no
 *  "copy link" row (see core feed-actions.ts) — this is only what `runShare`
 *  does on a browser with no share sheet. */
async function copyLink(payload: FeedSharePayload): Promise<"copied" | null> {
  try {
    // navigator.clipboard is undefined on non-HTTPS / older browsers.
    if (!navigator.clipboard) return null;
    await navigator.clipboard.writeText(payload.url);
    return "copied";
  } catch {
    return null;
  }
}
