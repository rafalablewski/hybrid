import { useSyncExternalStore } from "react";
import { Share } from "react-native";
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
import { sapi } from "./social-api";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * SAVED POSTS + SHARING (mobile). Twin of apps/web/lib/feed-actions.ts — the
 * state shape, the storage key, the SYNC POLICY and the share payload all come
 * from @hybrid/core (feed-actions.ts), so the two clients cannot drift on what
 * a "saved post" is, on what a shared link says, or on what happens when two
 * devices disagree.
 *
 * THE DEVICE COPY IS NOT A CACHE. AsyncStorage is what the UI reads, which is
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
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

AsyncStorage.getItem(FEED_SAVED_STORAGE_KEY)
  .then((v) => {
    if (!v) return;
    try {
      state = normalizeFeedSaved(JSON.parse(v));
      emit();
    } catch {
      /* a corrupt blob degrades to "nothing saved" — never a broken feed */
    }
  })
  .catch(() => {});

function persist(next: FeedSavedState): void {
  if (next === state) return;
  state = next;
  AsyncStorage.setItem(FEED_SAVED_STORAGE_KEY, JSON.stringify(state)).catch(() => {});
  emit();
}

/** Save / unsave one post. The store updates before the write, so the glyph
 *  fills on the same frame as the press. */
export function toggleSavedPost(ref: FeedSubjectRef): void {
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
  const before = state;
  persist(pruneFeedSaved(state, gone));
  if (before !== state && state.synced) void push({ unsave: gone });
}

async function push(ops: { save?: string[]; unsave?: string[] }): Promise<void> {
  try {
    await sapi<SavedSyncResponse>("/api/social/saved/sync", "PUT", ops);
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
  let server: SavedSyncResponse;
  try {
    server = await sapi<SavedSyncResponse>("/api/social/saved/sync");
  } catch {
    return;
  }
  if (server.unavailable || server.error || !Array.isArray(server.ids)) return;
  const { next, push: missing } = reconcileFeedSaved(state, server.ids);
  persist(next);
  if (missing.length) await push({ save: missing });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The saved set (empty until AsyncStorage answers, which is one frame). */
export function useFeedSaved(): FeedSavedState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}

/** Hand a post to the OS share sheet. Message + url, the shape every other
 *  share in the app uses (settings' profile share, the coach invite). */
export async function runShare(payload: FeedSharePayload): Promise<"shared" | null> {
  try {
    await Share.share({ message: `${payload.text}\n${payload.url}`, url: payload.url });
    return "shared";
  } catch {
    return null; // dismissed — not an error, and not something to report
  }
}

// NO copyLink here, deliberately: this Expo build carries no clipboard module
// (expo-clipboard isn't a dependency and RN dropped the core Clipboard), and
// adding a native module for one menu row would cost a fresh IPA. The OS share
// sheet above already contains Copy — which is why the overflow menu on BOTH
// clients offers no "copy link" row (see core feed-actions.ts).
