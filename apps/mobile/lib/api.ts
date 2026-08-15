import type { TargetOverride, DeviceWorkout, LoggedSession, SessionBlock, TranslationOverrides, Macrocycle, MacroBlock, ScheduledAssignment, PersonaAccess, LibraryMovement, MuscleGroup, Movement, RtpStage, PlanOverride, PlanOverrides, FoodHit, MicroFacts, NutritionGoal, NutritionMealPart } from "@hybrid/core";
import { sanitizePersonaAccess, setExerciseCatalog, setExerciseMediaCatalog, localDayKey, localTodayKey, heatSource, type HeatProtocol } from "@hybrid/core";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "./fetch";

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

/** Thrown by the `query*` fetchers below on a network error or non-2xx response,
 *  so React Query's isError / retry actually fire (the `fetch*` fetchers above
 *  deliberately SWALLOW errors to an empty value for optional/degradable reads;
 *  the `query*` ones THROW so a screen can show a real "couldn't load" state
 *  instead of a fake "no data yet" one). */
export class ApiError extends Error {
  constructor(public status: number, message?: string) {
    super(message ?? `Request failed (HTTP ${status})`);
    this.name = "ApiError";
  }
}

async function fetchJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetchWithTimeout(`${API_URL}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), ...(await authHeaders()) },
  });
  if (!res.ok) throw new ApiError(res.status);
  return (await res.json()) as T;
}

/** Sessions for React Query — THROWS on failure (see ApiError). */
export async function querySessions(opts?: { archived?: boolean }): Promise<LoggedSession[]> {
  await ensureExerciseCatalog();
  const qs = opts?.archived ? "?archived=1" : "";
  const data = await fetchJson<{ sessions?: LoggedSession[] }>(`/api/sessions${qs}`);
  return data.sessions ?? [];
}

/** Signals for React Query — THROWS on failure (see ApiError). */
export async function querySignals(): Promise<CoreSignal[]> {
  const data = await fetchJson<{
    signals?: { userId: string; kind: string; value: number; unit: string; source: string; ts: string }[];
  }>(`/api/signals`);
  return (data.signals ?? []).map((s) => ({
    athleteId: s.userId, kind: s.kind, value: s.value, unit: s.unit, source: s.source, ts: s.ts,
  }));
}

// The admin-managed custom exercise library (published rows). The client folds
// these over the built-in MOVEMENTS (mergeMovements) into the catalog the picker
// consumes — parity with web's useExercises. Empty when signed-out / none
// authored, so the app always falls back to the built-ins.
export async function fetchCustomExercises(): Promise<LibraryMovement[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/exercises`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      exercises?: Array<{ name: string; pattern: string; muscles: string[]; baseLoad: number | null; system: string | null; aliases: string[]; category: string | null; videoUrl?: string | null; thumbUrl?: string | null }>;
    };
    // The same rows carry each lift's admin-set DEMO MEDIA (video/thumb URL).
    // Publishing it here — global, admin-authored data, exactly like the catalog
    // — is what lets the exercise demo surface show a real asset instead of the
    // procedural placeholder (core: exercise-media). Parity with web's
    // lib/exercise-catalog.ts + lib/use-exercises.ts.
    setExerciseMediaCatalog((data.exercises ?? []).map((e) => ({ name: e.name, videoUrl: e.videoUrl ?? null, thumbUrl: e.thumbUrl ?? null })));
    return (data.exercises ?? []).map((e) => ({
      name: e.name,
      pattern: e.pattern,
      muscles: e.muscles as MuscleGroup[],
      baseLoad: e.baseLoad,
      system: (e.system ?? null) as Movement["system"],
      aliases: e.aliases,
      category: e.category ?? null,
    }));
  } catch {
    return [];
  }
}

// Publishes the admin-managed exercise library to the ENGINES (core's movement
// registry) — the mobile twin of web's lib/exercise-catalog.ts. Distinct from
// `useExercises()`, which feeds the PICKER: without this, a lift logged under a
// library name ("Barbell Deadlift", "Pull-up", "Dumbbell Bulgarian Split Squat")
// resolved to no Movement and added NOTHING to fatigue, ACWR, injury risk,
// volume-by-muscle, landmarks or muscle records — the tissue read as untrained.
//
// Ordering matters: the engines run on SESSION data, so both session fetchers
// await this before resolving. By the time a screen recomputes, the catalog is
// already published — no render race, no per-screen memo-dependency churn.
let catalogPending: Promise<void> | null = null;

/** Ensure the engine catalog is published. Idempotent; safe to await anywhere. */
export function ensureExerciseCatalog(): Promise<void> {
  if (!catalogPending) {
    // fetchCustomExercises swallows its own errors and degrades to [] — an empty
    // list simply leaves the engines on the built-in catalog.
    catalogPending = fetchCustomExercises()
      .then((custom) => { if (custom.length) setExerciseCatalog(custom); })
      .catch(() => {});
  }
  return catalogPending;
}

// Admin localization overrides, layered over the shipped strings. Empty when
// signed-out / none authored, so the app always falls back to the baseline.
export async function fetchTranslationOverrides(): Promise<TranslationOverrides> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/translations`, { headers: await authHeaders() });
    if (!res.ok) return {};
    const data = (await res.json()) as { overrides?: TranslationOverrides };
    return data.overrides ?? {};
  } catch {
    return {};
  }
}

export async function fetchSessions(opts?: { archived?: boolean }): Promise<LoggedSession[]> {
  try {
    await ensureExerciseCatalog();
    const qs = opts?.archived ? "?archived=1" : "";
    const res = await fetchWithTimeout(`${API_URL}/api/sessions${qs}`, { headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/sessions/${id}`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/sessions/${id}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

/** Mirror a guest (no-account) workout to the backend so an admin sees real
 *  pre-signup usage. No auth — there's no account yet. Best-effort. */
export async function logAnonSession(payload: NewSession & { deviceId?: string; platform?: string }): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/anon-sessions`, {
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

// Returns the created session's id on success (used by the finish screen's
// optional rename), or null on any failure. Callers that only need success can
// still treat the result as truthy/falsy.
export async function createSession(payload: NewSession): Promise<string | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { session?: { id?: string } };
    return data.session?.id ?? null;
  } catch {
    return null;
  }
}

// Rename a saved session (optional — most people never name a workout). Best
// effort: returns true if the server accepted the new title.
export async function renameSession(id: string, title: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ title }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Log a bodyweight measurement (Profile → Private → Body & progress, or the
// logger's bodyweight nudge). Owner-only; best effort. The caller refreshes the
// bodyweight lookup on success so tonnage recomputes without a reload.
export async function logBodyweight(weightKg: number): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/body`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ weightKg }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── COPY A DAY ─────────────────────────────────────────────────────────────
// Write several diary entries in one round-trip. Each goes through the SAME
// server-side writer a hand-typed entry uses, so a copied entry is not a special
// kind of entry. The batch is deliberately not transactional (a FoodLog row is
// best-effort by design), so the result reports how many actually landed.
export async function copyFoodLogs(
  entries: Record<string, unknown>[],
): Promise<{ written: number; failed: number; ok: boolean }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/log/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ entries }),
    });
    if (!res.ok) return { written: 0, failed: entries.length, ok: false };
    const data = (await res.json()) as { written?: number; failed?: number };
    return { written: data.written ?? 0, failed: data.failed ?? 0, ok: true };
  } catch {
    return { written: 0, failed: entries.length, ok: false };
  }
}

// ── YOUR RECIPES ───────────────────────────────────────────────────────────
// A recipe the athlete authored. Its macros are DERIVED from its ingredients
// (@hybrid/core user-recipes.ts), so nothing on the wire carries a recipe-level
// macro figure — only the ingredient snapshots the totals are summed from.

export type UserRecipeIngredientRow = {
  id: string;
  name: string;
  qty: number;
  servingLabel: string;
  kcal: number; protein: number; carbs: number; fat: number;
  satFat?: number | null; sugar?: number | null; fiber?: number | null; salt?: number | null;
  productId?: string | null;
  verifiedId?: string | null;
  position: number;
};
export type UserRecipeRow = {
  id: string;
  name: string;
  note?: string | null;
  emoji?: string | null;
  servings: number;
  timeMins?: number | null;
  ingredients: UserRecipeIngredientRow[];
};

/** The athlete's recipes. Soft — the tables are a later migration, so an
 *  un-migrated database costs the shelf and never the whole screen. */
export async function fetchUserRecipes(): Promise<UserRecipeRow[]> {
  try {
    const data = await fetchJson<{ recipes?: UserRecipeRow[] }>(`/api/nutrition/recipes`);
    return data.recipes ?? [];
  } catch {
    return [];
  }
}

/** Create or replace a recipe. `id` absent → POST (create), present → PATCH.
 *  Returns the SERVER's row, which carries the real ingredient ids the editor
 *  keys its rows by. `upgrade` distinguishes the free cap from a real failure so
 *  the caller can route to the paywall instead of showing an error. */
export async function saveUserRecipe(
  body: Record<string, unknown>,
  id?: string,
): Promise<{ recipe: UserRecipeRow | null; upgrade: boolean }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/recipes${id ? `/${id}` : ""}`, {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    if (res.status === 403) return { recipe: null, upgrade: true };
    if (!res.ok) return { recipe: null, upgrade: false };
    const data = (await res.json()) as { recipe?: UserRecipeRow };
    return { recipe: data.recipe ?? null, upgrade: false };
  } catch {
    return { recipe: null, upgrade: false };
  }
}

export async function deleteUserRecipe(id: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/recipes/${id}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── WATER ──────────────────────────────────────────────────────────────────
// The water control appends one Signal per tap and takes a tap back by DELETING
// that reading — never by appending its negation, which would be a lie about
// the day that every downstream sum would faithfully carry. So the client needs
// the reading's id, which `querySignals` deliberately drops (CoreSignal is the
// engine's shape and has no id): these three helpers carry it.

/** One of today's water readings, addressable so it can be undone. */
export type WaterLog = { id: string; value: number; ts: string };

/** Today's water readings, newest first. Soft — returns [] rather than throwing,
 *  since a missing undo history must never fail the Nutrition screen. */
export async function fetchWaterLogs(): Promise<WaterLog[]> {
  try {
    const data = await fetchJson<{ signals?: { id?: string; value: number; ts: string }[] }>(`/api/signals?kind=water`);
    const today = localTodayKey();
    return (data.signals ?? [])
      .filter((s): s is { id: string; value: number; ts: string } => typeof s.id === "string" && localDayKey(Date.parse(s.ts)) === today)
      .map((s) => ({ id: s.id, value: s.value, ts: s.ts }))
      .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  } catch {
    return [];
  }
}

/** Log a drink. Returns the created reading so the caller can undo it. */
export async function logWater(ml: number, ts = new Date().toISOString()): Promise<WaterLog | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ kind: "water", value: ml, unit: "ml", source: "manual", ts }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { signal?: { id?: string } };
    return data.signal?.id ? { id: data.signal.id, value: ml, ts } : null;
  } catch {
    return null;
  }
}

/* ── HEAT (sauna) ──────────────────────────────────────────────────────────
 *
 * The one input no device will ever report, so both halves are typed. A sitting
 * is TWO Signals sharing an EXACT timestamp — that is what lets core's
 * `heatSittings` put them back together, the same way the food diary regroups
 * the eight rows one logged food writes. The two POSTs are sequential and the
 * temperature is written SECOND: if the network dies between them the athlete
 * has a sitting read at the reference and MARKED assumed, which is a degraded
 * truth rather than a temperature with no sitting attached (which core drops
 * entirely).
 */

/** One recorded sitting as the client holds it, with both row ids so it can be
 *  removed as a unit. */
export type HeatLog = { ids: string[]; minutes: number; tempC: number; protocol: HeatProtocol; ts: string };

/** Every sauna row this athlete owns, filtered server-side by kind so an
 *  unrelated stream (the food log writes up to eight rows per meal) can never
 *  evict them from an unfiltered window. */
export async function fetchHeatSignals(): Promise<CoreSignal[]> {
  const out: CoreSignal[] = [];
  for (const kind of ["sauna", "saunaTemp"]) {
    try {
      const data = await fetchJson<{ signals?: { id?: string; userId: string; kind: string; value: number; unit: string; source: string; ts: string }[] }>(
        `/api/signals?kind=${kind}`,
      );
      for (const s of data.signals ?? []) {
        out.push({ athleteId: s.userId, kind: s.kind, value: s.value, unit: s.unit, source: s.source, ts: s.ts, id: s.id });
      }
    } catch {
      /* soft — a missing heat history must never fail the screen it sits on */
    }
  }
  return out;
}

/** Record a sitting. `ts` is the sitting's own instant, so a back-dated entry
 *  keeps the clock the decay and the pair-matching both read. */
export async function logHeat(
  minutes: number,
  tempC: number,
  protocol: HeatProtocol = "sauna",
  ts = new Date().toISOString(),
): Promise<HeatLog | null> {
  // The protocol rides in `source` — no migration, and "manual" on its own
  // stays a dry sauna so every row written before this keeps its meaning.
  const source = heatSource(protocol);
  const post = async (kind: string, value: number, unit: string): Promise<string | null> => {
    try {
      const res = await fetchWithTimeout(`${API_URL}/api/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ kind, value, unit, source, ts }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { signal?: { id?: string } };
      return data.signal?.id ?? null;
    } catch {
      return null;
    }
  };
  const minId = await post("sauna", minutes, "min");
  if (!minId) return null;
  const tempId = await post("saunaTemp", tempC, "C");
  return { ids: tempId ? [minId, tempId] : [minId], minutes, tempC, protocol, ts };
}

/** Remove a sitting — every row it wrote, so a delete cannot orphan half of it. */
export async function deleteHeat(ids: string[]): Promise<boolean> {
  const results = await Promise.all(ids.map((id) => deleteSignal(id)));
  return results.every(Boolean);
}

/** Remove one reading you own — the undo behind the water control. */
export async function deleteSignal(id: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/signals/${id}`, {
      method: "DELETE",
      headers: await authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Set the PRIVATE post-workout reflection (note + mood + tags) on a saved
// session — the finish-screen note affordance. Owner-only; best effort.
export async function patchSessionNote(
  id: string,
  reflection: { note: string | null; mood: number | null; tags: string[] },
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(reflection),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Record the post-workout self-report ("How did that feel?") on a saved
// session: `feel` is perceived effort 1..5, `fatigue` is how spent the athlete
// is 1..5. Sent one field at a time as the athlete taps, so the first answer is
// safe even if they never give the second. Owner-only; best effort.
export async function patchSessionFeel(
  id: string,
  patch: { feel?: number; fatigue?: number },
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Correct a saved workout — the "Edit workout" sheet. Sends the whole block
// list (the server re-sanitises it; see core/session-edit.ts) plus the title, so
// a skipped distance or a fat-fingered load can be fixed without deleting the
// session and losing its records, feel report and device match. Owner-only.
export async function patchSessionEdit(
  id: string,
  patch: { title: string; blocks: SessionBlock[] },
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Attach (or, with null, unlink) the device's read of a saved workout — the
// summary's Apple Watch match. The server re-sanitises and stamps matchedAt;
// see core/session-device.ts. Owner-only; best effort.
export async function patchSessionDevice(id: string, device: DeviceWorkout | null): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ device }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * A row an import put into the log (or joined), named — so the client can ask
 * about it while the athlete is still standing in front of the import. A watch
 * measures everything about a session except how hard it felt, and that is the
 * one value session load is built from; without these the only way to supply it
 * is to go find the session and scroll its summary.
 */
export type DeviceImportLanded = {
  id: string;
  title: string;
  startedAt: string;
  completedAt: string;
  /** The device's own moving time — the trusted duration for the load figure. */
  minutes: number;
  /** True for an attach onto a session the athlete had already rated. */
  rated: boolean;
};

/** What an import changed, as the server counted it. */
export type DeviceImportResult = {
  created: number;
  attached: number;
  linked: number;
  skipped: number;
  landed: DeviceImportLanded[];
};

// Hand the device's recordings to the backend, which decides what each one
// means against the database and writes the sessions — see the route's header
// and core/device-import.ts. Null on any failure so a silent auto-sync can tell
// "nothing to do" (zeros) from "didn't happen".
export async function importDeviceWorkouts(workouts: DeviceWorkout[]): Promise<DeviceImportResult | null> {
  if (workouts.length === 0) return { created: 0, attached: 0, linked: 0, skipped: 0, landed: [] };
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/sessions/import-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ workouts }),
    });
    if (!res.ok) return null;
    const d = (await res.json().catch(() => ({}))) as Partial<DeviceImportResult>;
    return {
      created: d.created ?? 0,
      attached: d.attached ?? 0,
      linked: d.linked ?? 0,
      skipped: d.skipped ?? 0,
      // A build talking to an older deployment simply gets no rows to ask
      // about — the import still lands, the ask just falls back to the row.
      landed: Array.isArray(d.landed) ? d.landed : [],
    };
  } catch {
    return null;
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
  /** Starred → floated to the Quick-start sheet's Favourites rail. Defaults
   *  false (the GET reads false for everyone until the favourite column is
   *  migrated — see reference/sql-routine-favourite.sql). */
  favourite?: boolean;
};

export async function fetchRoutines(): Promise<Routine[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/templates`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { templates?: Routine[] };
    return data.templates ?? [];
  } catch {
    return [];
  }
}

// Status-aware so callers can tell the free template limit (403) from a
// missing sign-in (401) or a network failure (status null) and react properly.
export async function createRoutine(
  name: string,
  blocks: unknown[],
): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ name, blocks }),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

export async function deleteRoutine(id: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/templates/${id}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

// Toggle a routine's favourite star. Soft-degrades to false if the favourite
// column isn't migrated yet (the server returns 503) or on a network error, so
// the caller can optimistically flip and quietly revert on failure.
export async function favouriteRoutine(id: string, favourite: boolean): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/templates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ favourite }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Nutrition library — the user's own saved meals + custom products ──────────
// Every food row carries the optional LABEL PANEL (@hybrid/core MicroFacts —
// satFat/sugar/fiber/salt, null where the food never stated it) alongside the
// four macros, so the panel survives the whole round-trip: search → portion
// editor → log → diary, and library → log.
export type SavedMealRow = { id: string; name: string; subname: string | null; emoji: string | null; kcal: number; protein: number; carbs: number; fat: number } & MicroFacts;
export type FoodProductRow = { id: string; name: string; subname: string | null; servingLabel: string; servingGrams?: number | null; packSize?: number | null; packLabel?: string | null; kcal: number; protein: number; carbs: number; fat: number; verifiedId?: string | null } & MicroFacts;

export async function fetchSavedMeals(): Promise<SavedMealRow[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/meals`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { meals?: SavedMealRow[] }).meals ?? [];
  } catch {
    return [];
  }
}

// Status-aware so the caller can tell the free meal limit (403) from a missing
// sign-in (401) or a network failure (status null) and route to upgrade on 403.
export async function createSavedMeal(
  meal: { name: string; subname?: string; emoji?: string; kcal?: number; protein: number; carbs: number; fat: number } & MicroFacts,
): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/meals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(meal),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

export async function deleteSavedMeal(id: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/meals/${id}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Nutrition prefs — the small cross-device state the Nutrition hub remembers:
// onboarding completion, the chosen goal, and any custom parts of the day.
// `targets` is the MANUAL override — per field, so a field absent here keeps
// adapting; null clears the whole thing and hands every figure back.
export type NutritionPrefs = { onboardedAt?: string | null; goal?: NutritionGoal | null; mealParts?: NutritionMealPart[]; targets?: TargetOverride | null };
export async function getNutritionPrefs(): Promise<NutritionPrefs> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/prefs`, { headers: await authHeaders() });
    if (!res.ok) return {};
    return ((await res.json()) as { prefs?: NutritionPrefs }).prefs ?? {};
  } catch {
    return {};
  }
}
export async function saveNutritionPrefs(patch: { onboarded?: boolean; goal?: NutritionGoal; mealParts?: NutritionMealPart[]; targets?: TargetOverride | null }): Promise<void> {
  try {
    await fetchWithTimeout(`${API_URL}/api/nutrition/prefs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(patch),
    });
  } catch {
    /* best-effort — the client keeps its local cache */
  }
}

export async function fetchFoodProducts(): Promise<FoodProductRow[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/products`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { products?: FoodProductRow[] }).products ?? [];
  } catch {
    return [];
  }
}

export async function createFoodProduct(
  product: { name: string; subname?: string | null; servingLabel?: string; servingGrams?: number; packSize?: number | null; packLabel?: string | null; kcal?: number; protein: number; carbs: number; fat: number; verifiedId?: string | null } & MicroFacts,
): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/products`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(product),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}

// Amend a saved food — today, the pack it comes in. A food already in the
// pantry has to be able to gain a pack size WITHOUT being deleted and
// recreated: a new id breaks every recipe ingredient pointing at the old one.
export async function updateFoodProduct(
  id: string,
  patch: { packSize?: number | null; packLabel?: string | null },
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function deleteFoodProduct(id: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/products/${id}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Editable food log — the per-entry records the Diary lists + edit/delete.
// `derived` marks an entry the server rebuilt from its Signals because no
// FoodLog row exists for it (logged before the table shipped, or the migration
// hasn't run) — it edits by a relative scale instead of an absolute quantity.
export type FoodLogRow = { id: string; name: string; subname?: string | null; source: string; kcal: number; protein: number; carbs: number; fat: number; qty: number; ts: string; derived?: boolean }
  /** the portion AS ENTERED — 35 "g", 1 "bottle" — so the row can say what
   *  was logged instead of the quantity that scales the macros (portion.ts) */
  & { amount?: number | null; amountUnit?: string | null }
  & MicroFacts;
export async function fetchFoodLogs(): Promise<FoodLogRow[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/log`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { logs?: FoodLogRow[] }).logs ?? [];
  } catch {
    return [];
  }
}
// Log one food/meal → creates the editable entry AND the mirrored Signals the
// engines read. Macros are PER SERVING; qty scales them.
export async function createFoodLog(
  entry: { name: string; subname?: string | null; source: string; kcal: number; protein: number; carbs: number; fat: number; qty: number; amount?: number | null; amountUnit?: string | null; verifiedId?: string | null } & MicroFacts,
): Promise<{ ok: boolean; status: number | null }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(entry),
    });
    return { ok: res.ok, status: res.status };
  } catch {
    return { ok: false, status: null };
  }
}
export async function updateFoodLogQty(id: string, qty: number): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/log/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ qty }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
// Rescale a DERIVED entry (Signals only, no FoodLog row): it has no per-serving
// base, so the edit is a relative factor applied to the stored readings.
export async function scaleFoodLog(id: string, scale: number): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/log/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ scale }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
export async function deleteFoodLog(id: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/log/${encodeURIComponent(id)}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

// Search the Open Food Facts database (via our /api/nutrition/search proxy).
// `query` is text or a barcode number; returns normalized foods (empty on any
// failure so the UI can fall back to manual entry). See @hybrid/core FoodHit.
export async function searchFoods(query: string, opts?: { barcode?: boolean }): Promise<FoodHit[]> {
  const q = query.trim();
  if (!q) return [];
  const param = opts?.barcode ? `barcode=${encodeURIComponent(q)}` : `q=${encodeURIComponent(q)}`;
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/search?${param}`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { foods?: FoodHit[] }).foods ?? [];
  } catch {
    return [];
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/apply`, { headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/apply`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/billing/status`, { headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/billing/checkout`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/billing/iap/verify`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/account/export`, { headers: await authHeaders() });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// Wipe all of the signed-in user's data on the backend (keeps the login).
export async function resetAccount(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/account/reset`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ confirm: "RESET" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Permanently DELETE the signed-in user's account: all data, then the login
// itself (App Store 5.1.1(v) + GDPR erasure). Irreversible; the caller must
// sign out + clear local state afterwards.
export async function deleteAccount(): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/account`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ confirm: "DELETE" }),
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
    const res = await fetchWithTimeout(`${API_URL}/api/ai-coach`, { method: "POST", headers: await authHeaders() });
    if (res.status === 401) return { text: "Sign in to get a personalized coaching note.", source: "" };
    if (!res.ok) return { text: "Couldn't reach the coach — try again.", source: "" };
    const j = (await res.json()) as { text?: string; source?: "ai" | "engine"; readiness?: number; hpi?: number };
    return { text: j.text ?? "", source: j.source ?? "", readiness: j.readiness, hpi: j.hpi };
  } catch {
    return { text: "Couldn't reach the coach — check your connection.", source: "" };
  }
}

// ---- signals (Performance State time-series: recovery, body mass, nutrition…) ----
export type CoreSignal = { athleteId: string; kind: string; value: number; unit: string; source: string; ts: string; id?: string };

export async function fetchSignals(): Promise<CoreSignal[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/signals`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { signals?: { userId: string; kind: string; value: number; unit: string; source: string; ts: string }[] };
    return (data.signals ?? []).map((s) => ({ athleteId: s.userId, kind: s.kind, value: s.value, unit: s.unit, source: s.source, ts: s.ts }));
  } catch {
    return [];
  }
}

/**
 * The RECOVERY stream, fetched by kind.
 *
 * `fetchSignals()` above asks for everything and gets the 500 newest rows of
 * any kind — which is the right shape for the Nutrition screen (those rows ARE
 * the majority) and the wrong one for `toBiometrics`, because a logged meal
 * writes up to eight rows and an athlete who logs their food can push a week-old
 * HRV reading out of the window entirely. The wearable term then keeps printing,
 * quietly computed against fewer baseline samples than it asks for.
 *
 * So the surfaces that resolve BIOMETRICS ask for the four kinds they read.
 */
export async function fetchRecoverySignals(): Promise<CoreSignal[]> {
  try {
    const data = await fetchJson<{ signals?: { id?: string; userId: string; kind: string; value: number; unit: string; source: string; ts: string }[] }>(
      `/api/signals?kind=hrv,restingHr,sleep,sleepScore,bodyMass`,
    );
    return (data.signals ?? []).map((s) => ({ athleteId: s.userId, kind: s.kind, value: s.value, unit: s.unit, source: s.source, ts: s.ts, id: s.id }));
  } catch {
    return [];
  }
}

export async function createSignal(kind: string, value: number, unit?: string, source = "manual"): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/signals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ kind, value, unit, source }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type ScannedMacros = { name: string | null; kcal: number | null; protein: number | null; carbs: number | null; fat: number | null };

/** Send a nutrition-label photo (base64) to the AI scan endpoint (Full-only).
 *  Returns the parsed per-serving macros, or a status for the caller to message. */
export async function scanNutritionLabel(image: string, mediaType: string): Promise<{ ok: boolean; status: number; data?: ScannedMacros }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ image, mediaType }),
    });
    if (!res.ok) return { ok: false, status: res.status };
    return { ok: true, status: 200, data: (await res.json()) as ScannedMacros };
  } catch {
    return { ok: false, status: 0 };
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
  /**
   * Every readiness answer given on this day, oldest first. `energy` above is
   * the DECISIVE one (the latest not taken minutes after training); these are
   * what make it interpretable — "flat at 09:30" and "flat at 22:00" are two
   * measurements, not one corrected. Absent on a database that hasn't run
   * reference/sql-checkin-reads.sql, which every consumer treats as "one read,
   * the stored value". See core/readiness-reads.ts.
   */
  reads?: { metric: string; value: number; loggedAt: string; sinceSessionH?: number | null }[];
};

export async function fetchCheckins(): Promise<Checkin[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/checkins`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { checkins?: Checkin[] }).checkins ?? [];
  } catch {
    return [];
  }
}

/** Check-ins for React Query — THROWS on failure (see ApiError), so a screen
 *  can tell "you haven't checked in" from "we couldn't ask". */
export async function queryCheckins(): Promise<Checkin[]> {
  const data = await fetchJson<{ checkins?: Checkin[] }>(`/api/checkins`);
  return data.checkins ?? [];
}

export type CreateCheckinResult = { ok: boolean; cooldownMs?: number };

export async function createCheckin(payload: Partial<Checkin>): Promise<CreateCheckinResult> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/checkins`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(payload),
    });
    if (res.ok) return { ok: true };
    // 429 = the 6h re-log cooldown is still active; surface the remaining time.
    if (res.status === 429) {
      const body = (await res.json().catch(() => ({}))) as { retryAfterMs?: number };
      return { ok: false, cooldownMs: typeof body.retryAfterMs === "number" ? body.retryAfterMs : undefined };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Take back the readiness read just given — the one write in this area that
 * REMOVES a read instead of appending one, and only the day's last one, only
 * within READ_UNDO_MIN of the tap (the server re-checks that on its own clock).
 * Mirrors web POST /api/checkins/undo. See core/readiness-reads.ts.
 */
export async function undoCheckinRead(weekOf: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/checkins/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ weekOf }),
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
    const res = await fetchWithTimeout(`${API_URL}/api/assignments`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { assignments?: Assignment[] }).assignments ?? [];
  } catch {
    return [];
  }
}

/**
 * The notification read state, per account. Both of these resolve NULL on any
 * failure rather than an empty state, and the distinction matters: null means
 * "the server is not storing for us" (offline, signed out, or the table not yet
 * migrated), which tells the store to keep trusting the device — an empty state
 * would instead wipe what this phone already knew. See lib/notif-read.ts.
 */
export async function fetchNotifState(): Promise<{ state: unknown; synced: boolean } | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/notifications/state`, { headers: await authHeaders() });
    if (!res.ok) return null;
    const d = (await res.json()) as { state?: unknown; synced?: boolean };
    return { state: d.state, synced: d.synced === true };
  } catch {
    return null;
  }
}

export async function pushNotifOps(ops: unknown[]): Promise<{ state: unknown; synced: boolean } | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/notifications/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ ops }),
    });
    if (!res.ok) return null;
    const d = (await res.json()) as { state?: unknown; synced?: boolean };
    return { state: d.state, synced: d.synced === true };
  } catch {
    return null;
  }
}

export async function updateAssignment(id: string, status: "completed" | "skipped" | "assigned"): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/assignments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ status }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ── Verified Strength Record (tier 2 — witness co-signing) ──────────────────

export interface AttestInboxItem {
  id: string;
  sessionId: string;
  lift: string;
  e1rm: number | null;
  topLoad: number | null;
  ownerHandle: string | null;
  ownerName: string | null;
  createdAt: string;
}

export async function fetchAttestations(sessionId?: string): Promise<{
  attestations: import("@hybrid/core").PrAttestation[];
  inbox: AttestInboxItem[];
  unavailable?: boolean;
} | null> {
  try {
    const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
    const res = await fetchWithTimeout(`${API_URL}/api/records/attest${qs}`, { headers: await authHeaders() });
    if (!res.ok) return null;
    return (await res.json()) as { attestations: import("@hybrid/core").PrAttestation[]; inbox: AttestInboxItem[]; unavailable?: boolean };
  } catch {
    return null;
  }
}

export async function requestAttestation(sessionId: string, lift: string, witnessHandle: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/records/attest`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ sessionId, lift, witnessHandle }),
    });
    if (res.ok) return { ok: true };
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    return { ok: false, error: j?.error };
  } catch {
    return { ok: false };
  }
}

export async function respondAttestation(id: string, action: "cosign" | "decline"): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/records/attest/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ id, action }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// The Program Efficacy Index — the same PUBLIC k-anonymous dataset behind the
// web's /programs page (no auth: it contains no per-user data by construction).
export async function fetchEfficacyCard(planId: string): Promise<import("@hybrid/core").ProgramEfficacy | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/efficacy`);
    if (!res.ok) return null;
    const j = (await res.json()) as { rows?: { planId: string; card: import("@hybrid/core").ProgramEfficacy | null }[] };
    return j.rows?.find((r) => r.planId === planId)?.card ?? null;
  } catch {
    return null;
  }
}

export async function enrollPlan(goal: string, planId?: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/macrocycles`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ goal, ...(planId ? { planId } : {}) }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Leave (delete) an enrolled season. `deleteHistory` additionally hard-deletes
// the workouts logged while the plan was active — the athlete chooses this
// explicitly in the leave flow; plain leave keeps all History.
export async function leavePlan(macroId: string, deleteHistory: boolean): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/macrocycles/${macroId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ deleteHistory }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- onboarding (admin-editable questionnaire, shared with web) ----

/** Whether the signed-in user has finished/skipped onboarding (server source of
 *  truth). null when not onboarded or the call fails. Drives the entry gate. */
// Resolve whether the signed-in user has completed onboarding. Returns the
// timestamp (or null when genuinely not onboarded) ONLY for a successful
// response; THROWS on any network/HTTP failure so the caller can tell "not
// onboarded" apart from "couldn't reach the server". Conflating the two used to
// route an already-onboarded user (offline / new device) back into the
// questionnaire, whose submit re-enrolls a plan and clobbers their existing one.
export async function fetchOnboardedAt(): Promise<string | null> {
  const res = await fetchWithTimeout(`${API_URL}/api/me`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`onboarded check failed: HTTP ${res.status}`);
  const d = (await res.json()) as { onboardedAt?: string | null };
  return d.onboardedAt ?? null;
}

/** The admin-editable onboarding question set the client renders. Falls back to
 *  null (the caller then uses the @hybrid/core built-in defaults). */
export async function fetchOnboardingQuestions(): Promise<unknown[] | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/onboarding/questions`, { headers: await authHeaders() });
    if (!res.ok) return null;
    const d = (await res.json()) as { questions?: unknown[] };
    return d.questions ?? null;
  } catch {
    return null;
  }
}

/** Finish onboarding: save the answer map + mark onboarded, enrolling the chosen
 *  plan in the same call. Mirrors the web POST /api/onboarding. */
export async function submitOnboarding(
  answers: Record<string, unknown>,
  plan?: { goalLabel: string; planId: string } | null,
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ answers, ...(plan ? { goal: plan.goalLabel, planId: plan.planId } : {}) }),
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
export async function fetchMacrocycle(): Promise<{ macro: Macrocycle; currentWeek: number; planId: string | null; planStartedAt: string | null; macroId: string } | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/macrocycles`, { headers: await authHeaders() });
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
      // The plan's start date (Day 1 anchor) — the date-anchored week rail pins
      // the program onto consecutive calendar dates from here.
      planStartedAt: row.startedAt ?? null,
      // The DB row id — what leavePlan() targets.
      macroId: row.id,
    };
  } catch {
    return null;
  }
}

/** The enrolled macrocycle for React Query — THROWS on failure (see ApiError).
 *  `fetchMacrocycle` above swallows to null, which a screen cannot tell apart
 *  from "not enrolled" — so it renders the first-run chooser at an enrolled
 *  athlete whose request merely timed out. This variant lets isError fire. */
export async function queryMacrocycle(): Promise<{ macro: Macrocycle; currentWeek: number; planId: string | null; planStartedAt: string | null; macroId: string } | null> {
  const data = await fetchJson<{ macrocycles?: MacroRow[] }>(`/api/macrocycles`);
  const row = data.macrocycles?.[0];
  if (!row || !row.blocks?.length) return null;
  const blocks = row.blocks;
  const totalWeeks = blocks[blocks.length - 1]!.endWeek;
  const started = new Date(row.startedAt).getTime();
  const elapsed = Number.isFinite(started) ? Math.floor((Date.now() - started) / (7 * 86400000)) + 1 : 1;
  return {
    macro: { model: "", goalOrSport: row.goal, totalWeeks, eventInWeeks: null, blocks },
    currentWeek: Math.max(1, Math.min(totalWeeks, elapsed)),
    planId: row.planId ?? null,
    planStartedAt: row.startedAt ?? null,
    macroId: row.id,
  };
}

// The athlete's training maxes (1RMs) stored on the account, so the plan card
// shows the same working kg on every device (mirrors the on-device store). Both
// soft-degrade to a no-op (empty / false) when signed out or the column isn't
// migrated (reference/sql-plan-maxes.sql).
export async function fetchPlanMaxes(): Promise<Record<string, number>> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/plan-maxes`, { headers: await authHeaders() });
    if (!res.ok) return {};
    const data = (await res.json()) as { maxes?: Record<string, number> };
    return data.maxes && typeof data.maxes === "object" ? data.maxes : {};
  } catch {
    return {};
  }
}

export async function savePlanMaxes(maxes: Record<string, number>): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/plan-maxes`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ maxes }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Per-day plan overrides (skip / postpone) for the enrolled-plan week rail —
// the server source of truth that syncs across devices. The mobile store
// (lib/plan-overrides.ts) hydrates its AsyncStorage cache from this on mount and
// writes through on every change. Both soft-degrade (empty / no-op) when signed
// out or the table isn't migrated, so the local cache alone keeps the rail working.
export async function fetchPlanOverrides(planId: string): Promise<PlanOverrides> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/plan-days?planId=${encodeURIComponent(planId)}`, { headers: await authHeaders() });
    if (!res.ok) return {};
    const d = (await res.json()) as { overrides?: PlanOverrides };
    return d.overrides ?? {};
  } catch {
    return {};
  }
}

export async function savePlanOverride(planId: string, date: string, override: PlanOverride | null): Promise<void> {
  try {
    await fetchWithTimeout(`${API_URL}/api/plan-days`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ planId, date, override }),
    });
  } catch {
    /* stays in the local cache; re-synced on the next successful write */
  }
}

// The admin's per-persona nav-access override (which persona sees each feature),
// read from the feature-flags value. Empty → code defaults.
export async function fetchPersonaAccess(): Promise<PersonaAccess> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/flags`, { headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/flags`, { headers: await authHeaders() });
    if (!res.ok) return {};
    const data = (await res.json()) as { flags?: Record<string, boolean> };
    return data.flags ?? {};
  } catch {
    return {};
  }
}

/** Flags AND their config values (e.g. theme.premiumAccent) in one fetch. */
export async function fetchFlagState(): Promise<{ flags: Record<string, boolean>; values: Record<string, unknown> }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/flags`, { headers: await authHeaders() });
    if (!res.ok) return { flags: {}, values: {} };
    const data = (await res.json()) as { flags?: Record<string, boolean>; values?: Record<string, unknown> };
    return { flags: data.flags ?? {}, values: data.values ?? {} };
  } catch {
    return { flags: {}, values: {} };
  }
}

// Incoming coach invites (mutual consent) — so a client can accept/decline a
// coach's link from anywhere, without the coach console.
export type CoachInvite = { id: string; status: string; coach?: { name: string | null; email: string } };

export async function fetchCoachInvites(): Promise<CoachInvite[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const data = (await res.json()) as { asClient?: CoachInvite[] };
    return (data.asClient ?? []).filter((l) => l.status === "PENDING");
  } catch {
    return [];
  }
}

export async function actCoachInvite(id: string, action: "accept" | "end"): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ action }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// --- Ported screens: state / connections ---

export type StateSnapshot = { hpi: number; injuryRisk: number; readiness: number; sessionCount: number };
export async function fetchState(): Promise<StateSnapshot | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/state`, { headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/connections`, { headers: await authHeaders() });
    if (!res.ok) return { connections: [], providers: [] };
    const d = (await res.json()) as { connections?: Conn[]; providers?: Provider[] };
    return { connections: d.connections ?? [], providers: d.providers ?? [] };
  } catch {
    return { connections: [], providers: [] };
  }
}
export async function syncConnection(providerId: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/connect/${providerId}/sync`, { method: "POST", headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/assignments`, {
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
export type Person = { id: string; name: string | null; email: string; coachVerified?: boolean };
export type CoachLink = { id: string; status: "PENDING" | "ACTIVE" | "ENDED"; client?: Person; coach?: Person };
export type Note = { id: string; body: string; private: boolean; createdAt: string };

export async function getCoachLinks(): Promise<{ asCoach: CoachLink[]; asClient: CoachLink[] }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links`, { headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/invite`, { headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/invite`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/invite/${token}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

export async function claimCoachInvite(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/invite/${token}/claim`, { method: "POST", headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}/diet`, { headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}/diet`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/nutrition/assigned`, { headers: await authHeaders() });
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/groups`, { headers: await authHeaders() });
    if (!res.ok) return { groups: [], unavailable: false };
    const d = (await res.json()) as { groups?: CoachGroup[]; unavailable?: boolean };
    return { groups: d.groups ?? [], unavailable: Boolean(d.unavailable) };
  } catch {
    return { groups: [], unavailable: false };
  }
}

export async function createCoachGroup(name: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/groups`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ name }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function patchCoachGroup(
  id: string,
  body: { name?: string; clientIds?: string[]; addClientId?: string; removeClientId?: string },
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/groups/${id}`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/groups/${id}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

export async function assignPlanToGroup(id: string, goal: string, planId?: string): Promise<{ ok: boolean; assigned?: number; error?: string }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/groups/${id}/assign-plan`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/programs`, { headers: await authHeaders() });
    if (!res.ok) return { programs: [], unavailable: false };
    const d = (await res.json()) as { programs?: CoachProgram[]; unavailable?: boolean };
    return { programs: d.programs ?? [], unavailable: Boolean(d.unavailable) };
  } catch {
    return { programs: [], unavailable: false };
  }
}

export async function createCoachProgram(name: string): Promise<CoachProgram | null> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/programs`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/programs/${id}`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/programs/${id}`, { method: "DELETE", headers: await authHeaders() });
    return res.ok;
  } catch {
    return false;
  }
}

export async function assignProgram(id: string, target: { linkId?: string; groupId?: string }, startDate: string): Promise<{ ok: boolean; assigned?: number; sessions?: number; error?: string }> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/programs/${id}/assign`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${id}`, {
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
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}/sessions`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { sessions?: LoggedSession[] }).sessions ?? [];
  } catch {
    return [];
  }
}

export async function getNotes(linkId: string): Promise<Note[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}/notes`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { notes?: Note[] }).notes ?? [];
  } catch {
    return [];
  }
}

export async function addNote(linkId: string, body: string, isPrivate: boolean): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ body, private: isPrivate }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- return-to-play (gated injury protocols) ----
// Same backend the web RtP panel uses (/api/rtp). Each protocol advances through
// the 5 gated stages in rtp.ts; the server enforces the gates + logs an audit
// trail (attest/advance/override). All best-effort → empty/false when signed out.
export type RtpAuditEntry = { action: string; by: string; role: string; ts: string; from?: string; to?: string; gate?: string; reason?: string };
export type RtpProtocol = { id: string; tissue: string; injuryDate: string; stage: RtpStage; completed: string[]; status: string; audit?: RtpAuditEntry[] };

export async function fetchRtpProtocols(): Promise<RtpProtocol[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/rtp`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const d = (await res.json()) as { protocols?: RtpProtocol[] };
    return (d.protocols ?? []).map((p) => ({ ...p, completed: p.completed ?? [], audit: p.audit ?? [] }));
  } catch {
    return [];
  }
}

/** Open a new protocol for a tissue (server starts it at the `acute` stage).
 *  `injuryDate` is when it actually started — omitted, the server stamps now,
 *  which is only right for an injury reported the day it happened. */
export async function createRtpProtocol(tissue: string, injuryDate?: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/rtp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ tissue, injuryDate }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Mutate a protocol: toggle a gate, advance a stage, or override past unmet
 *  gates with a reason. Mirrors the web PATCH /api/rtp/:id body. */
export async function mutateRtpProtocol(id: string, body: object): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/rtp/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Roster TAGS on a coach↔client link. The link detail carries the coach's tags;
// PATCH { action: "tags", tags } replaces them (mirrors web's saveTags).
export async function getCoachLinkTags(linkId: string): Promise<string[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}`, { headers: await authHeaders() });
    if (!res.ok) return [];
    const d = (await res.json()) as { link?: { tags?: string[] } };
    return d.link?.tags ?? [];
  } catch {
    return [];
  }
}

export async function saveCoachLinkTags(linkId: string, tags: string[]): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ action: "tags", tags }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Per-client scheduled workouts (Assignments) the coach has programmed.
export type CoachAssignment = { id: string; name: string; date: string; status: string };

export async function getCoachAssignments(linkId: string): Promise<CoachAssignment[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}/assignments`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { assignments?: CoachAssignment[] }).assignments ?? [];
  } catch {
    return [];
  }
}

// Assign one dated workout to this client (from a saved template, or one day of
// a generated week). Mirrors the web POST /api/coach/links/[id]/assignments.
export async function assignToClient(
  linkId: string,
  body: { name: string; blocks: unknown[]; date: string; templateId?: string },
): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}/assignments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// Enroll (persist) a macrocycle for this client so their Periodize/Today show
// the same season the coach programs against. Mirrors web's coach macrocycle POST.
export async function enrollClientMacrocycle(linkId: string, goal: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}/macrocycle`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ goal }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// The client's weekly check-ins, as the coach sees them (includes any reply).
export async function getCoachCheckins(linkId: string): Promise<Checkin[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/links/${linkId}/checkins`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { checkins?: Checkin[] }).checkins ?? [];
  } catch {
    return [];
  }
}

// Post (or update) the coach's reply on one check-in. Mirrors web PATCH /api/checkins/[id].
export async function replyToCheckin(checkinId: string, coachReply: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/checkins/${checkinId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({ coachReply }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---- coach roster (analytics) ----
// One row per ACTIVE, consented client with stats computed server-side. Same
// shape + endpoint the web coach analytics reads (web lib/use-roster.ts), so the
// two clients can't drift on what a roster row means.
export type RosterRow = {
  linkId: string;
  name: string;
  email: string;
  sessions: number;
  lastSession: string | null;
  readiness: number | null;
  adherence: number;
  volume: number;
};

export async function fetchRoster(): Promise<RosterRow[]> {
  try {
    const res = await fetchWithTimeout(`${API_URL}/api/coach/roster`, { headers: await authHeaders() });
    if (!res.ok) return [];
    return ((await res.json()) as { roster?: RosterRow[] }).roster ?? [];
  } catch {
    return [];
  }
}

/** Operator-scope platform stats — mirrors the web `AdminStats`. */
export type AdminStats = {
  totalUsers: number;
  sessions: number;
  coaches: number;
  mau: number;
  newUsers30: number;
  planPopularity: { goal: string; n: number }[];
  langSplit: { lang: string; n: number }[];
};

/** Platform stats for the operator scope. null when not an admin / on failure. */
export async function fetchAdminStats(): Promise<AdminStats | null> {
  try {
    return await fetchJson<AdminStats>("/api/admin/stats");
  } catch {
    return null;
  }
}

// ---- team surfaces (compare / squad monitor / org) ----
// Same endpoints the web team screens call, so the two clients can't disagree.

/** One athlete's comparable numbers on a lift — mirrors the web `Athlete`. */
export type TeamCompareAthlete = {
  linkId: string;
  name: string;
  e1rm: number;
  bestVel: number;
  volume: number;
  reps: number;
  sessions: number;
  estVel1rm: number;
};

export type TeamCompareResponse = { lift: string | null; lifts: string[]; athletes: TeamCompareAthlete[] };

/** Team comparison on a lift (empty lift = the server's default pick). */
export async function fetchTeamCompare(lift?: string): Promise<TeamCompareResponse> {
  const qs = lift ? `?lift=${encodeURIComponent(lift)}` : "";
  try {
    return await fetchJson<TeamCompareResponse>(`/api/coach/compare${qs}`);
  } catch {
    return { lift: null, lifts: [], athletes: [] };
  }
}

/** One athlete's morning-monitor row — mirrors the web `SquadRow`. */
export type SquadRow = {
  linkId: string;
  name: string;
  tags?: string[];
  sessions: number;
  lastSession: string | null;
  readiness: number;
  hpi: number;
  hpiBand: string;
  acwr: number;
  acwrBand: string;
  acute: number;
  strain: number;
  riskOverall: number;
  riskBand: string;
  flagged: string | null;
};

export type SquadSummary = { athletes: number; redReadiness: number; acwrFlags: number; injuryFlags: number };

/** The coach's squad + its summary strip. Empty on any failure. */
export async function fetchSquad(): Promise<{ squad: SquadRow[]; summary: SquadSummary | null }> {
  try {
    const d = await fetchJson<{ squad?: SquadRow[]; summary?: SquadSummary }>("/api/coach/squad");
    return { squad: d.squad ?? [], summary: d.summary ?? null };
  } catch {
    return { squad: [], summary: null };
  }
}
