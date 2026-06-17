// Guest mode: a brand-new user can train BEFORE creating an account. Their
// workouts are saved on the device here; when they sign up, flushGuestSessions
// pushes everything to the real backend so nothing is lost.
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSession, logAnonSession, type NewSession } from "./api";

const KEY = "hybrid.guestSessions";
const DEVICE_KEY = "hybrid.deviceId";

export type GuestSession = NewSession & { savedAt: string };

// An opaque per-install id (not PII) so an admin can group a guest device's
// logged workouts. Generated once and persisted on-device.
async function deviceId(): Promise<string> {
  try {
    let id = await AsyncStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return "unknown";
  }
}

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
  // Best-effort: also mirror to the backend so an admin sees pre-signup usage.
  // Never blocks or fails the on-device save (the workout is already safe).
  deviceId()
    .then((id) => logAnonSession({ ...payload, deviceId: id, platform: Platform.OS }))
    .catch(() => {});
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
