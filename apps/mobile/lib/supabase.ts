import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import { SecureStoreAdapter } from "./secure-store";

// Same Supabase project as the web app — same users, same data.
// URL is public; the anon (publishable) key is set at build time via EAS env.
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://hgufkvwccodogieqygyy.supabase.co";
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const isSupabaseConfigured = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

// `createClient` throws "supabaseKey is required." if the key is empty, which
// would crash the whole app at startup when EXPO_PUBLIC_SUPABASE_ANON_KEY isn't
// set (e.g. running in the Simulator before the key is configured). We don't
// want that: the app should still boot, just logged-out. So we hand createClient
// a harmless placeholder when the real key is missing — `isSupabaseConfigured()`
// stays false, so every auth/storage call is still gated and sign-in is disabled
// (the login screen shows the "set the key" hint instead of crashing).
const CLIENT_KEY = SUPABASE_ANON_KEY || "anon-key-not-configured";

export const supabase = createClient(SUPABASE_URL, CLIENT_KEY, {
  auth: {
    // Keychain/Keystore-backed (see lib/secure-store.ts) so the long-lived
    // refresh token isn't stored in plaintext AsyncStorage. Migrates an existing
    // AsyncStorage session in transparently on first read (no forced re-login).
    storage: SecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
