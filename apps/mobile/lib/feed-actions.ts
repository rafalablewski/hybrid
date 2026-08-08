import { useSyncExternalStore } from "react";
import { Share } from "react-native";
import {
  DEFAULT_FEED_SAVED,
  FEED_SAVED_STORAGE_KEY,
  feedSubjectKey,
  normalizeFeedSaved,
  pruneFeedSaved,
  toggleFeedSaved,
  type FeedSavedState,
  type FeedSharePayload,
  type FeedSubjectRef,
} from "@hybrid/core";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * SAVED POSTS + SHARING (mobile). Twin of apps/web/lib/feed-actions.ts — the
 * state shape, the storage key and the share payload all come from
 * @hybrid/core (feed-actions.ts), so the two clients cannot drift on what a
 * "saved post" is or on what a shared link says.
 *
 * PER-DEVICE, same contract as the notification read-state beside it
 * (lib/notif-read.ts): a small idempotent set of ids in AsyncStorage. Server-
 * side sync is tracked as `feed-save-server-sync` in capabilities.ts.
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
  persist(toggleFeedSaved(state, feedSubjectKey(ref)));
}

/** Forget keys the server reported as GONE — the row was deleted. Only ever
 *  called with that list: a post that merely turned invisible stays saved (see
 *  core `pruneFeedSaved`). */
export function forgetSavedPosts(gone: string[]): void {
  persist(pruneFeedSaved(state, gone));
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
