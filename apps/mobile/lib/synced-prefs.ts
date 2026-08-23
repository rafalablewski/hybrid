import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  SYNCED_PREFS_CACHE_KEY,
  isSyncedPrefKey,
  reconcileSyncedPrefs,
  sanitizeSyncedPrefs,
} from "@hybrid/core";
import { getSyncedPrefs, putSyncedPrefs } from "./api";

// THE SYNCED PREFERENCE STORE — one module every per-account setting reads and
// writes through, replacing the dozen hand-rolled AsyncStorage stores that each
// kept their own copy of this logic and none of which left the phone.
//
// THE DEVICE IS A CACHE, NOT THE RECORD. That inversion is the whole change:
// AsyncStorage still holds every value, because a gym has no signal and a cold
// start must paint the right units before any network call could return — but
// the account is now the source of truth, so a reinstall or a second phone
// arrives with your pins, your units and your rest days already set.
//
// THREE RULES, and each one is a bug that would otherwise ship:
//
//  1. LOCAL PAINTS FIRST, ALWAYS. The cache is read synchronously into the
//     module so the first render has real values. A store that waited for the
//     server would flash defaults on every launch — visibly worse than the
//     device-only version it replaces.
//
//  2. NOTHING ALREADY CHOSEN IS LOST. An athlete upgrading into this has
//     months of settings on the device and an empty account. `reconcile` keeps
//     local wherever the server has not spoken and hands those keys back as
//     `pending`, which are pushed up on the first sync. The upgrade is
//     therefore lossless in the only direction that matters.
//
//  3. A FAILED WRITE IS NOT A LOST WRITE. Until reference/sql-user-prefs.sql is
//     applied the route answers 503, so every write stays queued in `pending`
//     and goes up on the next sync. The feature turns itself on when the column
//     lands, with no app update and nothing for the athlete to do.

type PrefMap = Record<string, unknown>;

let prefs: PrefMap = {};
/** Keys written locally that the server has not accepted yet. */
let pending: PrefMap = {};
let hydrated = false;
let syncing = false;

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const persist = () => {
  AsyncStorage.setItem(SYNCED_PREFS_CACHE_KEY, JSON.stringify(prefs)).catch(() => {});
};

/** Read the device cache. Runs once at import so the first paint has values. */
const hydrate = AsyncStorage.getItem(SYNCED_PREFS_CACHE_KEY)
  .then((raw) => {
    if (raw) {
      try {
        prefs = sanitizeSyncedPrefs(JSON.parse(raw));
      } catch {
        /* a corrupt blob is no worse than an empty one */
      }
    }
    hydrated = true;
    emit();
  })
  .catch(() => {
    hydrated = true;
  });

/**
 * Pull the account's preferences and fold them over the cache, then push
 * anything the server has not got. Safe to call on every launch and every
 * sign-in; concurrent calls collapse.
 */
export async function syncPrefs(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    await hydrate;
    const server = await getSyncedPrefs();
    const { merged, pending: missing } = reconcileSyncedPrefs(prefs, server);
    prefs = merged;
    pending = { ...missing, ...pending };
    persist();
    emit();

    if (Object.keys(pending).length > 0) {
      const sent = pending;
      pending = {};
      const ok = await putSyncedPrefs(sent);
      // Not persisted (503 before the migration, or offline) — put it back so
      // the next sync retries rather than dropping the athlete's choice.
      if (!ok) pending = { ...sent, ...pending };
    }
  } finally {
    syncing = false;
  }
}

/** The current value for a key, or `fallback`. Reads the cache, so it is
 *  correct offline and on the very first frame. */
export function getPref<T>(key: string, fallback: T): T {
  const v = prefs[key];
  return v === undefined || v === null ? fallback : (v as T);
}

/**
 * Write a preference: local + cache immediately (so the UI never waits on a
 * network), then best-effort to the account. `null` forgets the key.
 */
export function setPref(key: string, value: unknown): void {
  if (!isSyncedPrefKey(key)) {
    if (__DEV__) console.warn(`[synced-prefs] "${key}" is not in the allowlist — add it to core synced-prefs.ts`);
    return;
  }
  if (value === null || value === undefined) delete prefs[key];
  else prefs[key] = value;
  persist();
  emit();

  const patch = { [key]: value ?? null };
  putSyncedPrefs(patch).then((ok) => {
    if (!ok) pending = { ...pending, ...patch };
  });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Subscribe to one preference.
 *
 * `normalize` runs on every read, so a value written by an older build — or by
 * a hostile payload that reached the row — can never break a screen. It is the
 * same contract each hand-rolled store had for its own shape; keeping it here
 * means every preference gets it rather than the ones whose author remembered.
 */
export function useSyncedPref<T>(key: string, normalize: (raw: unknown) => T): T {
  const raw = useSyncExternalStore(
    subscribe,
    () => prefs[key],
    () => prefs[key],
  );
  return normalize(raw);
}

/**
 * Forget everything on sign-out.
 *
 * The AsyncStorage cache is already dropped by session.tsx's `hybrid.*` sweep,
 * but the MODULE holds a copy, and a module outlives a sign-out — so without
 * this the next account on a shared handset would paint the previous one's
 * pins and units until the first sync returned. The same reason `resetPersona`
 * and `resetPlanMaxes` exist beside it.
 *
 * `pending` is dropped rather than kept: an unsent write belongs to the account
 * that made it, and replaying it into the next one would be worse than losing
 * it.
 */
export function resetSyncedPrefs(): void {
  prefs = {};
  pending = {};
  AsyncStorage.removeItem(SYNCED_PREFS_CACHE_KEY).catch(() => {});
  emit();
}

/** Whether the device cache has been read yet — for a screen that must not
 *  render a zero-state before the real values arrive. */
export const prefsHydrated = (): boolean => hydrated;
