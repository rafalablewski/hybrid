import { NextResponse } from "next/server";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { cleanTargetOverride, hasOverride, type TargetOverride } from "@hybrid/core";

// Per-user Nutrition preferences — the small bits of state the Nutrition hub
// must remember ACROSS devices + the email-confirm round-trip (the old
// per-device localStorage flags did not): whether the first-run onboarding is
// done, the chosen goal, and any custom "parts of the day" a Full user added.
//
// Stored under `answers.nutrition` on the shared OnboardingState row (no new
// table/column, so nothing to migrate) and soft-guarded: if OnboardingState
// isn't applied yet the GET returns an empty prefs object and the POST is a
// best-effort no-op, so the clients fall back to their local cache and the app
// keeps working. Owner-scoped by construction (keyed on the signed-in user).

type NutritionPrefs = {
  onboardedAt?: string | null;
  goal?: "lose" | "maintain" | "gain" | null;
  // Custom parts of the day (Full only) — keys carried on the log `source`.
  mealParts?: { key: string; label: string }[];
  // MANUAL TARGETS. Per-field: a field absent here keeps adapting. Null clears
  // the whole override and returns every figure to the engine.
  targets?: TargetOverride | null;
};

const GOALS = new Set(["lose", "maintain", "gain"]);

// Sanitize an incoming custom-parts list: trimmed labels, safe slug keys, capped
// count + length so a client can't stuff the JSON blob.
function cleanParts(v: unknown): { key: string; label: string }[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: { key: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 32) : "";
    if (!label) continue;
    let key = typeof r.key === "string" && r.key.trim() ? r.key.trim() : label;
    key = key.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label });
    if (out.length >= 12) break;
  }
  return out;
}

async function readAnswers(userId: string): Promise<Record<string, unknown> | null> {
  try {
    const state = await prisma.onboardingState.findUnique({ where: { userId } });
    return (state?.answers as Record<string, unknown> | null) ?? {};
  } catch {
    return null; // table not migrated yet
  }
}

export async function GET(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const answers = await readAnswers(user.id);
  const prefs = (answers?.nutrition as NutritionPrefs | undefined) ?? {};
  return NextResponse.json({ prefs });
}

export async function POST(request: Request) {
  const user = await getOrCreateDbUser(request);
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = await readJsonLimited<Record<string, unknown>>(request, 8 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  // Build a patch of only the recognised keys, so a POST can update one field
  // without knowing the others.
  const patch: NutritionPrefs = {};
  if (b.onboarded === true) patch.onboardedAt = new Date().toISOString();
  if (typeof b.goal === "string" && GOALS.has(b.goal)) patch.goal = b.goal as NutritionPrefs["goal"];
  const parts = cleanParts(b.mealParts);
  if (parts) patch.mealParts = parts;
  // `targets: null` is a deliberate CLEAR — the athlete handing the numbers
  // back to the engine — and must be distinguishable from "not in this patch".
  if (b.targets === null) patch.targets = null;
  else if (b.targets && typeof b.targets === "object") {
    const ov = cleanTargetOverride(b.targets);
    // An override with no field left after coercion IS a clear: the athlete
    // emptied every box, and storing `{ trainingFuel: true }` alone would leave
    // the screen claiming a manual target it does not have.
    patch.targets = hasOverride(ov) ? ov : null;
  }

  const existing = await readAnswers(user.id);
  if (existing == null) {
    // Unmigrated — accept the call so the client flow never hard-fails; the
    // client keeps its local cache until the migration lands.
    return NextResponse.json({ ok: true, persisted: false, prefs: patch });
  }
  const prevNutrition = (existing.nutrition as NutritionPrefs | undefined) ?? {};
  const nextNutrition: NutritionPrefs = { ...prevNutrition, ...patch };
  const nextAnswers = { ...existing, nutrition: nextNutrition };

  // UPDATE-ONLY (never create): the OnboardingState row is the GLOBAL onboarding
  // gate (/api/me marks any row as onboarded), so creating one here would
  // wrongly suppress the app's first-run questionnaire. If the row doesn't
  // exist yet the client just keeps its local cache — the row is created by the
  // global onboarding flow, after which nutrition prefs persist normally.
  let persisted = true;
  try {
    await prisma.onboardingState.update({
      where: { userId: user.id },
      data: { answers: nextAnswers as object },
    });
  } catch {
    persisted = false; // no row yet (or table unmigrated) — soft no-op
  }
  return NextResponse.json({ ok: true, persisted, prefs: nextNutrition });
}
