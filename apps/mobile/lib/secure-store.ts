import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// A Supabase auth `storage` adapter backed by the iOS Keychain / Android Keystore
// (expo-secure-store) instead of plaintext AsyncStorage. The Supabase session
// holds a long-lived REFRESH token; in AsyncStorage it's recoverable on a
// jailbroken device, via an unencrypted backup, or a forensic image (session
// theft). The Keychain is the platform-standard secure store for auth secrets.
//
// Two wrinkles handled here:
//   1. SIZE — SecureStore warns/΄fails above ~2KB per value, and a Supabase
//      session (JWT + refresh token + user) can exceed that, so we CHUNK the
//      value across multiple Keychain items with a small count marker.
//   2. MIGRATION — existing installs have the session in AsyncStorage under the
//      same key. On first read we transparently pull that value into the
//      Keychain and delete the plaintext copy, so nobody is forced to re-login.
//
// On web (the Expo web bundle) SecureStore isn't available, so we fall back to
// AsyncStorage — the native app is where the token-at-rest risk actually lives.

const CHUNK = 1800; // conservative: stay under SecureStore's per-value soft limit
const useSecure = Platform.OS !== "web";

// SecureStore keys must match [A-Za-z0-9._-]; Supabase's `sb-<ref>-auth-token`
// already qualifies, but sanitize defensively.
const safe = (k: string) => k.replace(/[^A-Za-z0-9._-]/g, "_");
const countKey = (k: string) => `${safe(k)}__n`;
const chunkKey = (k: string, i: number) => `${safe(k)}__${i}`;

async function chunkCount(key: string): Promise<number> {
  const raw = await SecureStore.getItemAsync(countKey(key));
  const n = raw ? parseInt(raw, 10) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function secureRemove(key: string): Promise<void> {
  const n = await chunkCount(key);
  for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(chunkKey(key, i));
  await SecureStore.deleteItemAsync(countKey(key));
}

async function secureSet(key: string, value: string): Promise<void> {
  await secureRemove(key); // clear any previous (possibly longer) chunk set first
  const n = Math.max(1, Math.ceil(value.length / CHUNK));
  for (let i = 0; i < n; i++) {
    await SecureStore.setItemAsync(chunkKey(key, i), value.slice(i * CHUNK, (i + 1) * CHUNK));
  }
  await SecureStore.setItemAsync(countKey(key), String(n));
}

async function secureGet(key: string): Promise<string | null> {
  const n = await chunkCount(key);
  if (n === 0) {
    // One-time migration: adopt a legacy AsyncStorage session into the Keychain.
    const legacy = await AsyncStorage.getItem(key);
    if (legacy != null) {
      await secureSet(key, legacy);
      await AsyncStorage.removeItem(key);
      return legacy;
    }
    return null;
  }
  let out = "";
  for (let i = 0; i < n; i++) {
    const part = await SecureStore.getItemAsync(chunkKey(key, i));
    if (part == null) return null; // partial/corrupt → treat as absent (forces re-auth)
    out += part;
  }
  return out;
}

export const SecureStoreAdapter = {
  getItem(key: string): Promise<string | null> {
    return useSecure ? secureGet(key) : AsyncStorage.getItem(key);
  },
  setItem(key: string, value: string): Promise<void> {
    return useSecure ? secureSet(key, value) : AsyncStorage.setItem(key, value);
  },
  removeItem(key: string): Promise<void> {
    return useSecure ? secureRemove(key) : AsyncStorage.removeItem(key);
  },
};
