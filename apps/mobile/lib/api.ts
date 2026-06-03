import type { LoggedSession } from "@hybrid/core";
import { supabase } from "./supabase";

// The mobile client calls the SAME backend the web app uses (Vercel), with the
// Supabase access token as a Bearer header. So a session logged on the phone
// shows up on the web dashboard, and vice-versa.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://hybrid-web-rosy.vercel.app";

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function fetchSessions(): Promise<LoggedSession[]> {
  try {
    const res = await fetch(`${API_URL}/api/sessions`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { sessions?: LoggedSession[] };
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

export type NewSession = {
  title: string;
  readiness?: number;
  startedAt?: string;
  completedAt?: string;
  blocks: unknown[];
};

export async function createSession(payload: NewSession): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- signals (Athlete Twin time-series: recovery, body mass, nutrition…) ----
export type CoreSignal = { athleteId: string; kind: string; value: number; unit: string; source: string; ts: string };

export async function fetchSignals(): Promise<CoreSignal[]> {
  try {
    const res = await fetch(`${API_URL}/api/signals`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { signals?: { userId: string; kind: string; value: number; unit: string; source: string; ts: string }[] };
    return (data.signals ?? []).map((s) => ({ athleteId: s.userId, kind: s.kind, value: s.value, unit: s.unit, source: s.source, ts: s.ts }));
  } catch {
    return [];
  }
}

export async function createSignal(kind: string, value: number, unit?: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ kind, value, unit, source: "manual" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function enrollPlan(goal: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/macrocycles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ goal }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- coach layer ----
export type Person = { id: string; name: string | null; email: string };
export type CoachLink = { id: string; status: "PENDING" | "ACTIVE" | "ENDED"; client?: Person; coach?: Person };
export type Note = { id: string; body: string; private: boolean; createdAt: string };

export async function getCoachLinks(): Promise<{ asCoach: CoachLink[]; asClient: CoachLink[] }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/links`, { headers: await authHeaders() });
    if (!res.ok) return { asCoach: [], asClient: [] };
    return (await res.json()) as { asCoach: CoachLink[]; asClient: CoachLink[] };
  } catch {
    return { asCoach: [], asClient: [] };
  }
}

export async function inviteClient(email: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ email }),
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: j.error };
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function actOnLink(id: string, action: "accept" | "end"): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/coach/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ action }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function getClientSessions(linkId: string): Promise<LoggedSession[]> {
  try {
    const res = await fetch(`${API_URL}/api/coach/links/${linkId}/sessions`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { sessions?: LoggedSession[] }).sessions ?? [];
  } catch {
    return [];
  }
}

export async function getNotes(linkId: string): Promise<Note[]> {
  try {
    const res = await fetch(`${API_URL}/api/coach/links/${linkId}/notes`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { notes?: Note[] }).notes ?? [];
  } catch {
    return [];
  }
}

export async function addNote(linkId: string, body: string, isPrivate: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/coach/links/${linkId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ body, private: isPrivate }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
