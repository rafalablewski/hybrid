import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

// Same Supabase project as the web app — same users, same data.
// URL + anon (publishable) key are PUBLIC (the web app ships the same anon key
// openly; row-level security is what protects the data). Defaulted here so the
// app works in any build; EXPO_PUBLIC_* env vars still override if set.
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://hgufkvwccodogieqygyy.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhndWZrdndjY29kb2dpZXF5Z3l5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzOTY5MDYsImV4cCI6MjA5NTk3MjkwNn0.TvyLtZvVS6w8qtA4uWVT4wkDpZhjkLQdc6sWl1Po4gc";

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
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
