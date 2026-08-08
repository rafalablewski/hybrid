"use client";

import { useSyncExternalStore } from "react";
import {
  DEFAULT_FEED_SAVED,
  FEED_SAVED_STORAGE_KEY,
  feedSubjectKey,
  normalizeFeedSaved,
  pruneFeedSaved,
  reconcileFeedSaved,
  toggleFeedSaved,
  type FeedSavedState,
  type FeedSharePayload,
  type FeedSubjectRef,
  type SavedSyncResponse,
} from "@hybrid/core";
import { jget, jsend } from "@/components/social-ui";

/**
 * SAVED POSTS + SHARING (web). Twin of apps/mobile/lib/feed-actions.ts — the
 * state shape, the storage key, the SYNC POLICY and the share payload all come
 * from @hybrid/core (feed-actions.ts), so the two clients cannot drift on what
 * a "saved post" is, on what a shared link says, or on what happens when two
 * devices disagree.
 *
 * THE DEVICE COPY IS NOT A CACHE. localStorage is what the UI reads, which is
 * why a bookmark fills on the press frame and why the shelf still opens with no
 * network. The server (SavedPost) is the copy that makes it follow you to
 * another device; `syncSaved()` reconciles the two through core's
 * `reconcileFeedSaved` — union once per device, server-wins thereafter.
 *
 * A FAILED WRITE DOES NOT REVERT THE UI. Before a device has synced, the local
 * list holds the change and the next sync pushes it. After, a lost write costs
 * that one toggle at the next reconcile — accepted, because the alternative is
 * an offline queue for a bookmark, and the cost is re-tapping a glyph whose
 * state you can see.
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

function persist(next: FeedSavedState): void {
  if (next === state) return;
  state = next;
  try {
    window.localStorage.setItem(FEED_SAVED_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* a full/blocked store must not break the screen */
  }
  emit();
}

/** Save / unsave one post. Optimistic by construction: the store updates before
 *  the write, so the glyph fills on the same frame as the press. */
export function toggleSavedPost(ref: FeedSubjectRef): void {
  hydrate();
  const key = feedSubjectKey(ref);
  const saving = !state.ids.includes(key);
  persist(toggleFeedSaved(state, key));
  // Only a device that has already adopted the server's shelf sends ops; one
  // that hasn't hands its whole list over on the next sync anyway.
  if (state.synced) void push(saving ? { save: [key] } : { unsave: [key] });
}

/** Forget keys the server reported as GONE — the row was deleted. Only ever
 *  called with that list: a post that merely turned invisible stays saved (see
 *  core `pruneFeedSaved`). */
export function forgetSavedPosts(gone: string[]): void {
  hydrate();
  const before = state;
  persist(pruneFeedSaved(state, gone));
  if (before !== state && state.synced) void push({ unsave: gone });
}

async function push(ops: { save?: string[]; unsave?: string[] }): Promise<void> {
  try {
    await jsend<SavedSyncResponse>("/api/social/saved/sync", "PUT", ops);
  } catch {
    /* see the header: a bookmark does not get an offline queue */
  }
}

/**
 * Reconcile with the server. Called when a screen that shows saved state opens.
 *
 * Three outcomes, all quiet: no session or no table -> the device list stands
 * alone (exactly how saving shipped before SavedPost existed); first sync ->
 * union, then hand the server what it is missing; after that -> the server's
 * list wholesale, which is what makes an unsave stick everywhere.
 */
export async function syncSaved(): Promise<void> {
  hydrate();
  let server: SavedSyncResponse;
  try {
    server = await jget<SavedSyncResponse>("/api/social/saved/sync");
  } catch {
    return;
  }
  if (server.unavailable || server.error || !Array.isArray(server.ids)) return;
  const { next, push: missing } = reconcileFeedSaved(state, server.ids);
  persist(next);
  if (missing.length) await push({ save: missing });
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
