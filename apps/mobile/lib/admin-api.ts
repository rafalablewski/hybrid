import { supabase } from "./supabase";
import { API_BASE } from "./api";

// ---------------------------------------------------------------------------
// Mobile admin API client.
//
// The admin console talks to the SAME `/api/admin/*` backend the web console
// uses (lib/admin.ts → requireAdmin), authenticated with the Supabase access
// token as a Bearer header (the CSRF middleware exempts Bearer calls). The web
// admin components call `fetch("/api/admin/…")` directly; on mobile we go
// through this thin wrapper so every section gets the base URL + auth header +
// uniform `{ ok, status, data }` handling without repeating boilerplate.
// ---------------------------------------------------------------------------

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type AdminResult<T> = { ok: boolean; status: number; data: T | null; error?: string };

/** GET an admin endpoint. `path` is the API path (e.g. "/api/admin/stats"). */
export async function adminGet<T = unknown>(path: string): Promise<AdminResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, { headers: await authHeaders() });
    const data = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, data, error: errOf(res.ok, data) };
  } catch {
    return { ok: false, status: 0, data: null, error: "network error" };
  }
}

/** POST/PATCH/PUT/DELETE an admin endpoint with an optional JSON body. */
export async function adminSend<T = unknown>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<AdminResult<T>> {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(await authHeaders()),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json().catch(() => null)) as T | null;
    return { ok: res.ok, status: res.status, data, error: errOf(res.ok, data) };
  } catch {
    return { ok: false, status: 0, data: null, error: "network error" };
  }
}

function errOf(ok: boolean, data: unknown): string | undefined {
  if (ok) return undefined;
  if (data && typeof data === "object" && "error" in data && typeof (data as { error: unknown }).error === "string")
    return (data as { error: string }).error;
  return "request failed";
}
