/**
 * The athlete's saved sport selection (sport + level + per-sport markers),
 * persisted client-side by the Sport screen. Shared so the Today screen can
 * reconcile the sport's transfer work into the day without duplicating the
 * storage key or the (defensive) parse.
 */

export const SPORT_STORE_KEY = "hybrid.sport";

export interface SportSelection {
  sport?: string;
  levelIdx?: number;
  markers?: Record<string, string>;
}

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
