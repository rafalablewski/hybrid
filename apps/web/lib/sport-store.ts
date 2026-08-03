/**
 * The athlete's saved sport selection (sport + level + per-sport markers and
 * their history), persisted client-side by the Sport screens. Shared so Today
 * can reconcile the sport's transfer work into the day without duplicating the
 * storage key or the (defensive) parse.
 *
 * The SHAPE lives in @hybrid/core (`SportStore`) and the key is the same string
 * mobile writes under AsyncStorage, so the two clients keep one selection model
 * rather than two that drift.
 */
import type { SportStore } from "@hybrid/core";

export const SPORT_STORE_KEY = "hybrid.sport";

export type SportSelection = SportStore;

/** Read the saved selection, or null if none / storage unavailable / corrupt. */
export function readSportSelection(): SportSelection | null {
  try {
    const raw = localStorage.getItem(SPORT_STORE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as SportSelection | null;
    return s && typeof s === "object" ? s : null;
  } catch {
    return null;
  }
}

/** Persist the selection. Silent on a storage failure — a private-mode browser
 *  must not take the screen down with it. */
export function writeSportSelection(s: SportSelection): void {
  try {
    localStorage.setItem(SPORT_STORE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}
