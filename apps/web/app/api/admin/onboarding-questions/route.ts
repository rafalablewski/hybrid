import { NextResponse } from "next/server";
import { requireAdmin, audit } from "@/lib/admin";
import { rateLimit, readJsonLimited } from "@/lib/guard";
import { prisma } from "@/lib/db";
import { effectiveOnboardingQuestions, isBuiltInQuestion, DEFAULT_BY_KEY } from "@/lib/onboarding";
import { ONBOARDING_ENGINE_KEYS, type OnboardingEngineKey } from "@hybrid/core";

// The full questionnaire an admin manages: built-in defaults overlaid by any DB
// rows, including disabled ones. `unavailable` flags the unmigrated table.
export async function GET(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const { questions, unavailable } = await effectiveOnboardingQuestions();
  return NextResponse.json({ questions, unavailable });
}

type Body = {
  key?: unknown; kind?: unknown; title?: unknown; subtitle?: unknown; engineKey?: unknown;
  choices?: unknown; min?: unknown; max?: unknown; step?: unknown; defaultValue?: unknown;
  required?: unknown; enabled?: unknown; order?: unknown; personas?: unknown;
};

const KINDS = ["persona", "goal", "single", "multi", "number", "text"];
const slug = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

// Save one question (upsert by `key`). Creates a custom question or seeds/edits a
// built-in. A built-in's kind/engineKey are locked to the code default — the
// editor only changes copy, choices, order, required and enabled — so a row can
// never break the recommendation engine. Custom questions never drive the engine
// (engineKey is null); they're stored on the profile and ignored by plan matching.
export async function POST(request: Request) {
  const gate = await requireAdmin(request);
  if (gate.error) return gate.error;

  const limited = await rateLimit(request, { key: "admin-onboarding-post", limit: 40, windowMs: 60_000 });
  if (limited) return limited;

  const parsed = await readJsonLimited<Body>(request, 32 * 1024);
  if (parsed.error) return parsed.error;
  const b = parsed.data;

  const title = typeof b.title === "string" ? b.title.trim() : "";
  if (!title) return NextResponse.json({ error: "title is required" }, { status: 400 });

  // key: keep an existing/built-in key; derive one from the title for a new
  // custom question. Built-in keys are reserved and matched as-is.
  let key = typeof b.key === "string" && b.key.trim() ? slug(b.key) : slug(title);
  if (!key) return NextResponse.json({ error: "could not derive a key — give the question a name" }, { status: 400 });

  const builtIn = isBuiltInQuestion(key);
  const def = DEFAULT_BY_KEY.get(key);

  // kind/engineKey: locked for built-ins; for custom, validate kind and never
  // assign an engineKey (custom questions are informational only).
  let kind = builtIn ? def!.kind : (typeof b.kind === "string" && KINDS.includes(b.kind) ? b.kind : "single");
  if (kind === "persona" || kind === "goal") {
    if (!builtIn) return NextResponse.json({ error: "persona/goal are built-in question types" }, { status: 400 });
  }
  // ENGINE KEY. Locked to the code default for a built-in. For a CUSTOM
  // question the admin may now pick one from the recognised list, which is what
  // makes a retired built-in re-addable: `experience` and `sleep` stopped being
  // shipped questions when the app started measuring them, and an operator who
  // wants to ask anyway should be able to.
  //
  // THIS IS ONLY SAFE BECAUSE THE PROFILE MAPPING IS AN ALLOWLIST. Before
  // Aug 2026 `questionnaireFromAnswers` carried whatever engine key it found
  // onto the volume profile, so an engine key set here would have written a
  // self-assessed training age over a measured one. It now names the fields it
  // writes — sex, birth, stress — and nothing else can reach the profile
  // whatever an admin keys a question to. What an engine key still does is feed
  // the PLAN RECOMMENDER, which is a per-setup decision and safe to shape.
  const rawEngine = typeof b.engineKey === "string" ? b.engineKey : "";
  const engineKey = builtIn
    ? def!.engineKey ?? null
    : (ONBOARDING_ENGINE_KEYS as readonly string[]).includes(rawEngine)
      ? (rawEngine as OnboardingEngineKey)
      : null;
  // `persona` and `goal` drive the fork and the plan library; they are not
  // things a custom question may impersonate.
  if (!builtIn && (engineKey === "persona" || engineKey === "goal")) {
    return NextResponse.json({ error: "persona/goal are built-in question types" }, { status: 400 });
  }

  // WHICH INTAKE ASKS IT. Ignored for a built-in — its scope is the code's, for
  // the reason lib/onboarding.ts gives — and an empty list means both, never
  // nobody, because a question no persona can see has deleted itself.
  const CLIENT_PERSONAS = ["casual", "athlete"];
  const personas = Array.isArray(b.personas)
    ? [...new Set((b.personas as unknown[]).filter((v): v is string => typeof v === "string" && CLIENT_PERSONAS.includes(v)))]
    : [];

  const choices =
    Array.isArray(b.choices)
      ? (b.choices as unknown[])
          .map((c) => (c && typeof c === "object" ? (c as Record<string, unknown>) : null))
          .filter((c): c is Record<string, unknown> => !!c && typeof c.value === "string" && typeof c.label === "string")
          .map((c) => ({ value: String(c.value).slice(0, 64), label: String(c.label).slice(0, 120), ...(c.blurb ? { blurb: String(c.blurb).slice(0, 240) } : {}) }))
      : undefined;
  if ((kind === "single" || kind === "multi") && !builtIn && (!choices || choices.length === 0))
    return NextResponse.json({ error: "add at least one option" }, { status: 400 });

  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.trunc(v) : null);
  const data = {
    kind,
    title: title.slice(0, 200),
    subtitle: typeof b.subtitle === "string" && b.subtitle.trim() ? b.subtitle.trim().slice(0, 400) : null,
    engineKey,
    choices: choices ?? undefined,
    min: kind === "number" ? num(b.min) : null,
    max: kind === "number" ? num(b.max) : null,
    step: kind === "number" ? num(b.step) : null,
    defaultValue: typeof b.defaultValue === "string" ? b.defaultValue.slice(0, 64) : b.defaultValue != null ? String(b.defaultValue).slice(0, 64) : null,
    required: !!b.required,
    enabled: b.enabled === undefined ? true : !!b.enabled,
    system: builtIn,
    personas: builtIn ? [] : personas,
    order: num(b.order) ?? 0,
    authorId: gate.admin.id,
    authorEmail: gate.admin.email,
  };

  try {
    let saved;
    try {
      saved = await prisma.onboardingQuestion.upsert({ where: { key }, update: data, create: { key, ...data } });
    } catch {
      // The `personas` column is not migrated yet. Saving the rest of the
      // question is better than refusing the edit over one field the operator
      // may not have used — reference/sql-onboarding-personas.sql adds it.
      const { personas: _dropped, ...rest } = data;
      saved = await prisma.onboardingQuestion.upsert({ where: { key }, update: rest, create: { key, ...rest } });
    }
    await audit({
      actor: gate.admin,
      action: "onboarding.question.save",
      targetType: "onboarding-question",
      targetId: saved.id,
      summary: `Saved “${saved.title}” (${saved.kind}${saved.enabled ? "" : ", disabled"})`,
      metadata: { key: saved.key, builtIn, engineKey, personas: builtIn ? "locked" : personas },
      req: request,
    });
    return NextResponse.json({ question: saved }, { status: 201 });
  } catch (e) {
    console.error("[admin onboarding] save failed", e);
    return NextResponse.json({ error: "could not save the question (is the OnboardingQuestion table migrated? reference/sql-onboarding.sql)" }, { status: 500 });
  }
}
