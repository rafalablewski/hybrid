import type { LoggedSession, SessionBlock, TranslationOverrides, Macrocycle, MacroBlock, ScheduledAssignment, PersonaAccess } from "@hybrid/core";
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

export async function fetchSessions(opts?: { archived?: boolean }): Promise<LoggedSession[]> {
  try {
    const qs = opts?.archived ? "?archived=1" : "";
    const res = await fetch(`${API_URL}/api/sessions${qs}`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { sessions?: LoggedSession[] };
    return data.sessions ?? [];
  } catch {
    return [];
  }
}

/** Soft-archive (hide from History, recoverable) or restore one of your own
 *  workouts. */
export async function archiveSession(id: string, archived: boolean): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ archived }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Permanently delete one of your own workouts. */
export async function deleteSession(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/sessions/${id}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

/** Mirror a guest (no-account) workout to the backend so an admin sees real
 *  pre-signup usage. No auth — there's no account yet. Best-effort. */
export async function logAnonSession(payload: NewSession & { deviceId?: string; platform?: string }): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/anon-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
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

// Reusable workout routines (WorkoutTemplate) the user owns — save a workout,
// then load it to start a live session.
export type Routine = {
  id: string;
  name: string;
  description?: string | null;
  blocks: SessionBlock[];
  createdAt: string;
};

export async function fetchRoutines(): Promise<Routine[]> {
  try {
    const res = await fetch(`${API_URL}/api/templates`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { templates?: Routine[] };
    return data.templates ?? [];
  } catch {
    return [];
  }
}

export async function createRoutine(name: string, blocks: unknown[]): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ name, blocks }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteRoutine(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/templates/${id}`, { method: "DELETE", headers: await authHeaders() });
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

// ---- billing (Stripe Checkout + entitlement) ----

/** The signed-in user's billing state. Returns null on failure so callers can
 *  fall back to the free experience. */
export async function fetchBillingStatus(): Promise<{ entitlement: "free" | "paid"; subscriptionStatus: string | null; configured: boolean } | null> {
  try {
    const res = await fetch(`${API_URL}/api/billing/status`, { headers: await authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as { entitlement: "free" | "paid"; subscriptionStatus: string | null; configured: boolean };
  } catch {
    return null;
  }
}

/** Start a hosted Stripe Checkout session. On success returns the URL to open;
 *  on failure (incl. 503 when billing isn't configured) returns the error. */
export async function startCheckout(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/billing/checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
    });
    if (res.ok) {
      const data = (await res.json()) as { url?: string };
      return { ok: true, url: data.url };
    }
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? "Couldn't start checkout — try again." };
  } catch {
    return { ok: false, error: "Couldn't start checkout — check your connection." };
  }
}

/** Verify a completed App Store purchase server-side (App Store Server API) and
 *  grant Full. Pass the StoreKit transactionId; returns ok or an error string. */
export async function verifyIapPurchase(transactionId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/billing/iap/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ transactionId }),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: data.error ?? "Couldn't verify the purchase." };
  } catch {
    return { ok: false, error: "Couldn't reach the server to verify the purchase." };
  }
}

/** Download everything tied to the signed-in account as one JSON document
 *  (GET /api/account/export — same payload the web "Download my data" button
 *  serves). Returns the JSON text, or null on failure. */
export async function exportAccountData(): Promise<string | null> {
  try {
    const res = await fetch(`${API_URL}/api/account/export`, { headers: await authHeaders() });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
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

// ---- AI coach ----
// The server-side AI coach: builds context from your real sessions + recovery
// and asks Claude for a personalized note (falls back to the engine rationale
// when no key is set). Mirrors the web AskCoach call.
export type CoachNote = { text: string; source: "ai" | "engine" | ""; readiness?: number; hpi?: number };

export async function askAiCoach(): Promise<CoachNote> {
  try {
    const res = await fetch(`${API_URL}/api/ai-coach`, { method: "POST", headers: await authHeaders() });
    if (res.status === 401) return { text: "Sign in to get a personalized coaching note.", source: "" };
    if (!res.ok) return { text: "Couldn't reach the coach — try again.", source: "" };
    const j = (await res.json()) as { text?: string; source?: "ai" | "engine"; readiness?: number; hpi?: number };
    return { text: j.text ?? "", source: j.source ?? "", readiness: j.readiness, hpi: j.hpi };
  } catch {
    return { text: "Couldn't reach the coach — check your connection.", source: "" };
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

// ---- daily check-ins ----
export type Checkin = {
  id: string;
  weekOf: string; // the day the check-in covers (legacy column name)
  bodyMassKg: number | null;
  energy: number | null;
  sleep: number | null;
  soreness: number | null;
  mood: number | null;
  adherencePct: number | null;
  note: string | null;
  coachReply: string | null;
  repliedAt: string | null;
  sharedWithCoach?: boolean;
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

export async function enrollPlan(goal: string, planId?: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/macrocycles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ goal, ...(planId ? { planId } : {}) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

type MacroRow = { id: string; goal: string; planId?: string | null; blocks: MacroBlock[]; startedAt: string };

// The athlete's active (latest) enrolled macrocycle reconstructed into the
// engine shape, plus which week of it is "this week" (derived from startedAt)
// and the enrolled named-plan id (when they picked a real plan).
export async function fetchMacrocycle(): Promise<{ macro: Macrocycle; currentWeek: number; planId: string | null } | null> {
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
      planId: row.planId ?? null,
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

/** The boolean feature flags evaluated for the signed-in user (admin → Flags). */
export async function fetchFeatureFlags(): Promise<Record<string, boolean>> {
  try {
    const res = await fetch(`${API_URL}/api/flags`, { headers: await authHeaders() });
    if (!res.ok) return {};
    const data = (await res.json()) as { flags?: Record<string, boolean> };
    return data.flags ?? {};
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

// ---- coach-led client onboarding (invite a brand-new client) ----
export type CoachInviteRow = { id: string; token: string; email: string | null; phone: string | null; url: string; expiresAt: string };

export async function getCoachInvites(): Promise<{ invites: CoachInviteRow[]; unavailable: boolean }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/invite`, { headers: await authHeaders() });
    if (!res.ok) return { invites: [], unavailable: false };
    const d = (await res.json()) as { invites?: CoachInviteRow[]; unavailable?: boolean };
    return { invites: d.invites ?? [], unavailable: Boolean(d.unavailable) };
  } catch {
    return { invites: [], unavailable: false };
  }
}

export async function createCoachInvite(
  body: { email?: string; phone?: string },
): Promise<{ ok: boolean; url?: string; existingUser?: boolean; message?: string; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    const d = (await res.json().catch(() => ({}))) as { url?: string; existingUser?: boolean; message?: string; error?: string };
    return { ok: res.ok, ...d };
  } catch {
    return { ok: false, error: "network error" };
  }
}

export async function revokeCoachInvite(token: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/coach/invite/${token}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

export async function claimCoachInvite(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/invite/${token}/claim`, { method: "POST", headers: await authHeaders() });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, error: d.error };
  } catch {
    return { ok: false, error: "network error" };
  }
}

// ---- coach-assigned diet (macro targets, read-only for the client) ----
export type CoachDietRow = { kcal: number | null; protein: number | null; carbs: number | null; fat: number | null; note: string | null };

export async function getCoachDiet(linkId: string): Promise<{ diet: CoachDietRow | null; unavailable: boolean }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/links/${linkId}/diet`, { headers: await authHeaders() });
    if (!res.ok) return { diet: null, unavailable: false };
    const d = (await res.json()) as { diet?: CoachDietRow | null; unavailable?: boolean };
    return { diet: d.diet ?? null, unavailable: Boolean(d.unavailable) };
  } catch {
    return { diet: null, unavailable: false };
  }
}

export async function saveCoachDiet(
  linkId: string,
  body: { kcal?: number; protein?: number; carbs?: number; fat?: number; note?: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/links/${linkId}/diet`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    const d = (await res.json().catch(() => ({}))) as { error?: string };
    return { ok: res.ok, error: d.error };
  } catch {
    return { ok: false, error: "network error" };
  }
}

export async function getAssignedDiet(): Promise<{ diet: CoachDietRow | null; coachName?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/nutrition/assigned`, { headers: await authHeaders() });
    if (!res.ok) return { diet: null };
    return (await res.json()) as { diet: CoachDietRow | null; coachName?: string };
  } catch {
    return { diet: null };
  }
}

// ---- coach client groups (assign a plan to many clients at once) ----
export type CoachGroup = { id: string; name: string; clientIds: string[] };

export async function getCoachGroups(): Promise<{ groups: CoachGroup[]; unavailable: boolean }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/groups`, { headers: await authHeaders() });
    if (!res.ok) return { groups: [], unavailable: false };
    const d = (await res.json()) as { groups?: CoachGroup[]; unavailable?: boolean };
    return { groups: d.groups ?? [], unavailable: Boolean(d.unavailable) };
  } catch {
    return { groups: [], unavailable: false };
  }
}

export async function createCoachGroup(name: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/coach/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function patchCoachGroup(id: string, body: { name?: string; clientIds?: string[] }): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/coach/groups/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteCoachGroup(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/coach/groups/${id}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

export async function assignPlanToGroup(id: string, goal: string, planId?: string): Promise<{ ok: boolean; assigned?: number; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/groups/${id}/assign-plan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ goal, ...(planId ? { planId } : {}) }),
    });
    const j = (await res.json().catch(() => ({}))) as { assigned?: number; error?: string };
    return { ok: res.ok, assigned: j.assigned, error: j.error };
  } catch {
    return { ok: false, error: "network" };
  }
}

// ---- coach-authored multi-week programs ----
export type ProgramItem = { name: string; sr: string; rpe?: string };
export type ProgramDay = { day: string; items: ProgramItem[] };
export type ProgramWeek = { days: ProgramDay[] };
export type CoachProgram = { id: string; name: string; goal: string | null; weeks: ProgramWeek[] };

export async function getCoachPrograms(): Promise<{ programs: CoachProgram[]; unavailable: boolean }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/programs`, { headers: await authHeaders() });
    if (!res.ok) return { programs: [], unavailable: false };
    const d = (await res.json()) as { programs?: CoachProgram[]; unavailable?: boolean };
    return { programs: d.programs ?? [], unavailable: Boolean(d.unavailable) };
  } catch {
    return { programs: [], unavailable: false };
  }
}

export async function createCoachProgram(name: string): Promise<CoachProgram | null> {
  try {
    const res = await fetch(`${API_URL}/api/coach/programs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ name, weeks: [{ days: [] }] }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { program: CoachProgram }).program;
  } catch {
    return null;
  }
}

export async function updateCoachProgram(id: string, body: { name?: string; weeks?: ProgramWeek[] }): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/coach/programs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteCoachProgram(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/coach/programs/${id}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

export async function assignProgram(id: string, target: { linkId?: string; groupId?: string }, startDate: string): Promise<{ ok: boolean; assigned?: number; sessions?: number; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/coach/programs/${id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ ...target, startDate }),
    });
    const j = (await res.json().catch(() => ({}))) as { assigned?: number; sessions?: number; error?: string };
    return { ok: res.ok, assigned: j.assigned, sessions: j.sessions, error: j.error };
  } catch {
    return { ok: false, error: "network" };
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
