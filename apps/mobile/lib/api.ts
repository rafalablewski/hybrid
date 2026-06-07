import type { LoggedSession, TranslationOverrides, Macrocycle, MacroBlock, ScheduledAssignment } from "@hybrid/core";
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

// Admin localization overrides, layered over the shipped strings. Empty when
// signed-out / none authored, so the app always falls back to the baseline.
export async function fetchTranslationOverrides(): Promise<TranslationOverrides> {
  try {
    const res = await fetch(`${API_URL}/api/translations`, { headers: await authHeaders() });
    if (!res.ok) return {};
    const data = (await res.json()) as { overrides?: TranslationOverrides };
    return data.overrides ?? {};
  } catch {
    return {};
  }
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

// Wipe all of the signed-in user's data on the backend (keeps the login).
export async function resetAccount(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/account/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ confirm: "RESET" }),
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

// ---- weekly check-ins ----
export type Checkin = {
  id: string;
  weekOf: string;
  bodyMassKg: number | null;
  energy: number | null;
  sleep: number | null;
  soreness: number | null;
  mood: number | null;
  adherencePct: number | null;
  note: string | null;
  coachReply: string | null;
  repliedAt: string | null;
  createdAt: string;
};

export async function fetchCheckins(): Promise<Checkin[]> {
  try {
    const res = await fetch(`${API_URL}/api/checkins`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { checkins?: Checkin[] }).checkins ?? [];
  } catch {
    return [];
  }
}

export async function createCheckin(payload: Partial<Checkin>): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- assignments (workouts a coach scheduled for the athlete) ----
export type Assignment = { id: string; name: string; date: string; status: string; blocks: unknown[]; athleteId?: string; assignedById?: string; createdAt?: string };

export async function fetchAssignments(): Promise<Assignment[]> {
  try {
    const res = await fetch(`${API_URL}/api/assignments`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { assignments?: Assignment[] }).assignments ?? [];
  } catch {
    return [];
  }
}

export async function updateAssignment(id: string, status: "completed" | "skipped" | "assigned"): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ status }),
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

type MacroRow = { id: string; goal: string; blocks: MacroBlock[]; startedAt: string };

// The athlete's active (latest) enrolled macrocycle reconstructed into the
// engine shape, plus which week of it is "this week" (derived from startedAt).
export async function fetchMacrocycle(): Promise<{ macro: Macrocycle; currentWeek: number } | null> {
  try {
    const res = await fetch(`${API_URL}/api/macrocycles`, { headers: await authHeaders() });
    if (!res.ok) return null;
    const row = ((await res.json()) as { macrocycles?: MacroRow[] }).macrocycles?.[0];
    if (!row || !row.blocks?.length) return null;
    const blocks = row.blocks;
    const totalWeeks = blocks[blocks.length - 1]!.endWeek;
    const started = new Date(row.startedAt).getTime();
    const elapsed = Number.isFinite(started) ? Math.floor((Date.now() - started) / (7 * 86400000)) + 1 : 1;
    return {
      macro: { model: "", goalOrSport: row.goal, totalWeeks, eventInWeeks: null, blocks },
      currentWeek: Math.max(1, Math.min(totalWeeks, elapsed)),
    };
  } catch {
    return null;
  }
}

// Self-schedule: materialize the reconciled plan onto dated Assignments (the
// athlete authoring their own). They show on the Calendar alongside coach work.
// replace=true clears upcoming pending self-authored days first, so re-running
// after logging a day regenerates the rest of the week off real results.
export async function createSelfAssignments(items: ScheduledAssignment[], replace = false): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ items, replace }),
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
