import type { LoggedSession, TranslationOverrides, Macrocycle, MacroBlock, ScheduledAssignment, PersonaAccess } from "@hybrid/core";
import { sanitizePersonaAccess } from "@hybrid/core";
import { supabase } from "./supabase";

// The mobile client calls the SAME backend the web app uses (Vercel), with the
// Supabase access token as a Bearer header. So a session logged on the phone
// shows up on the web dashboard, and vice-versa.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "https://hybrid-web-rosy.vercel.app";

/** The HYBRID web app (same host) — for features that live on web only. */
export const WEB_APP_URL = `${API_URL}/app`;
/** The backend base (for browser-redirect flows like provider OAuth). */
export const API_BASE = API_URL;

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

// Coach applications — a client applies to become a verified coach; an admin
// approves (which promotes their role to COACH). Coach is no longer self-serve.
export type CoachApplication = {
  id: string;
  status: "pending" | "approved" | "denied";
  credentials: string;
  createdAt: string;
};

export async function fetchCoachApplication(): Promise<CoachApplication | null> {
  try {
    const res = await fetch(`${API_URL}/api/coach/apply`, { headers: await authHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as { application?: CoachApplication | null };
    return data.application ?? null;
  } catch {
    return null;
  }
}

/** Submit (or re-open) a coach application. Returns { ok } plus an error
 *  message when the backend rejects it (e.g. already a coach, not enabled). */
export async function applyForCoach(
  credentials: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ credentials }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? "Couldn't submit — try again." };
  } catch {
    return { ok: false, error: "Couldn't submit — check your connection." };
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

// A user's own feature-access requests + the ask. Admin approval adds the
// feature to their grants (which then flows back through the access map).
export type MyAccessRequest = { id: string; navId: string; status: string };

export async function fetchMyAccessRequests(): Promise<MyAccessRequest[]> {
  try {
    const res = await fetch(`${API_URL}/api/access-requests`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { requests?: MyAccessRequest[] };
    return data.requests ?? [];
  } catch {
    return [];
  }
}

export async function requestAccess(navId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/access-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ navId }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// The admin's per-persona nav-access override (which persona sees each feature),
// read from the feature-flags value. Empty → code defaults.
export async function fetchPersonaAccess(): Promise<PersonaAccess> {
  try {
    const res = await fetch(`${API_URL}/api/flags`, { headers: await authHeaders() });
    if (!res.ok) return {};
    const data = (await res.json()) as { values?: Record<string, unknown> };
    return sanitizePersonaAccess(data.values?.["access.personaNav"]);
  } catch {
    return {};
  }
}

// Incoming coach invites (mutual consent) — so a client can accept/decline a
// coach's link from anywhere, without the coach console.
export type CoachInvite = { id: string; status: string; coach?: { name: string | null; email: string } };

export async function fetchCoachInvites(): Promise<CoachInvite[]> {
  try {
    const res = await fetch(`${API_URL}/api/coach/links`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { asClient?: CoachInvite[] };
    return (data.asClient ?? []).filter((l) => l.status === "PENDING");
  } catch {
    return [];
  }
}

export async function actCoachInvite(id: string, action: "accept" | "end"): Promise<boolean> {
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

// --- Ported screens: state / connections / events / video ---

export type StateSnapshot = { hpi: number; injuryRisk: number; readiness: number; sessionCount: number };
export async function fetchState(): Promise<StateSnapshot | null> {
  try {
    const res = await fetch(`${API_URL}/api/state`, { headers: await authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as StateSnapshot;
  } catch {
    return null;
  }
}

export type Conn = { id: string; provider: string; status: string; lastSyncAt?: string };
export type Provider = { id: string; label: string; auth: "native" | "team" | "oauth"; provides: string[]; configured: boolean };
export async function fetchConnections(): Promise<{ connections: Conn[]; providers: Provider[] }> {
  try {
    const res = await fetch(`${API_URL}/api/connections`, { headers: await authHeaders() });
    if (!res.ok) return { connections: [], providers: [] };
    const d = (await res.json()) as { connections?: Conn[]; providers?: Provider[] };
    return { connections: d.connections ?? [], providers: d.providers ?? [] };
  } catch {
    return { connections: [], providers: [] };
  }
}
export async function syncConnection(providerId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/connect/${providerId}/sync`, { method: "POST", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

export type EventRow = { id: string; name: string; sport: string; date: string };
export async function fetchEvents(): Promise<EventRow[]> {
  try {
    const res = await fetch(`${API_URL}/api/events`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return (((await res.json()) as { events?: EventRow[] }).events) ?? [];
  } catch {
    return [];
  }
}
export async function createEvent(name: string, sport: string, date: string): Promise<EventRow | null> {
  try {
    const res = await fetch(`${API_URL}/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ name, sport, date }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { event?: EventRow }).event ?? null;
  } catch {
    return null;
  }
}

export type VideoAnalysis = {
  id: string;
  movement: string;
  metrics: { movement: string; reps: number; minKneeAngle?: number; kneeAsymmetryPct?: number; techniqueScore: number; flags: string[] };
  createdAt: string;
};
export async function fetchVideoAnalyses(): Promise<VideoAnalysis[]> {
  try {
    const res = await fetch(`${API_URL}/api/video`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return (((await res.json()) as { analyses?: VideoAnalysis[] }).analyses) ?? [];
  } catch {
    return [];
  }
}

// --- Talent graph + force-plate signal import ---

export type TalentProfile = { sport: string; sex: string; age: number; visibility: string; metrics: Record<string, number>; moderationStatus?: string };
export type TalentBench = { metric: string; value: number; percentile: number; cohortMean: number; potentialPercentile: number };
export type TalentReport = { cohort: { sport: string; sex: string; age: number }; benchmarks: TalentBench[]; overall: number; potential: number; modelVersion: string };
export type TalentResult = { id: string; name: string; sport: string; age: number; sex: string; percentile: number; potential: number };

export async function fetchTalent(): Promise<{ profile: TalentProfile | null; report: TalentReport | null; computedHpi: number }> {
  try {
    const res = await fetch(`${API_URL}/api/talent`, { headers: await authHeaders() });
    if (!res.ok) return { profile: null, report: null, computedHpi: 0 };
    return (await res.json()) as { profile: TalentProfile | null; report: TalentReport | null; computedHpi: number };
  } catch {
    return { profile: null, report: null, computedHpi: 0 };
  }
}

export async function saveTalentProfile(body: { sport: string; sex: string; age: number; visibility: string; metrics: Record<string, number | undefined> }): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/talent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function searchTalent(metric: string, minPct: string, sport?: string, byPotential?: boolean): Promise<TalentResult[]> {
  try {
    const p = new URLSearchParams({ metric, minPct, ...(sport ? { sport } : {}), ...(byPotential ? { byPotential: "1" } : {}) });
    const res = await fetch(`${API_URL}/api/talent/search?${p.toString()}`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return (((await res.json()) as { results?: TalentResult[] }).results) ?? [];
  } catch {
    return [];
  }
}

export async function reportProfile(targetId: string, reason: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ targetType: "talentProfile", targetId, reason }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Import one signal with an explicit ts/source (for CSV/force-plate import,
 *  where historical timestamps must be preserved). */
export async function importSignal(s: { kind: string; value: number; unit?: string; source?: string; ts?: string }): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ kind: s.kind, value: s.value, unit: s.unit, source: s.source ?? "forceplate", ts: s.ts }),
    });
    return res.ok;
  } catch {
    return false;
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
