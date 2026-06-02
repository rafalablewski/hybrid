import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase is "configured" once the public env vars are present. Until then the
 * app runs on the demo session (see lib/session.tsx), so the deployed site keeps
 * working without any backend. Add the keys (Sprint 1 setup) to flip on real auth.
 */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
