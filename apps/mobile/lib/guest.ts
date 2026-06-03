// Guest mode: a brand-new user can train BEFORE creating an account. Their
// workouts are saved on the device here; when they sign up, flushGuestSessions
// pushes everything to the real backend so nothing is lost.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSession, type NewSession } from "./api";

const KEY = "hybrid.guestSessions";

export type GuestSession = NewSession & { savedAt: string };

export async function clearGuestSessions(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

export async function listGuestSessions(): Promise<GuestSession[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as GuestSession[]) : [];
  } catch {
    return [];
  }
}

export async function saveGuestSession(payload: NewSession): Promise<void> {
  const list = await listGuestSessions();
  list.push({ ...payload, savedAt: new Date().toISOString() });
  await AsyncStorage.setItem(KEY, JSON.stringify(list)).catch(() => {});
}

export async function guestSessionCount(): Promise<number> {
  return (await listGuestSessions()).length;
}

let flushing = false;

/** After sign-in (or on foreground): push every locally-saved workout to the
 *  backend. Keeps any that fail to upload so a later attempt can retry. Returns
 *  the number successfully synced. Guarded so overlapping triggers can't
 *  double-post the same session. */
export async function flushGuestSessions(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    return await doFlush();
  } finally {
    flushing = false;
  }
}

async function doFlush(): Promise<number> {
  const list = await listGuestSessions();
  if (!list.length) return 0;
  const remaining: GuestSession[] = [];
  let synced = 0;
  for (const g of list) {
    const { savedAt: _savedAt, ...payload } = g;
    const ok = await createSession(payload);
    if (ok) synced++;
    else remaining.push(g);
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(remaining)).catch(() => {});
  return synced;
}
