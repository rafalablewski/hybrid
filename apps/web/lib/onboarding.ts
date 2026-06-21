import {
  DEFAULT_ONBOARDING_QUESTIONS,
  normalizeOnboardingQuestion,
  type OnboardingQuestion,
} from "@hybrid/core";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// Onboarding questionnaire — server helpers.
//
// The effective question set = the built-in DEFAULT_ONBOARDING_QUESTIONS,
// overlaid by any persisted OnboardingQuestion rows (matched by `key`), plus the
// admin's custom rows appended. This means onboarding always works with an empty
// (or unmigrated) table, and a built-in can be reworded/disabled but never lost.
// ---------------------------------------------------------------------------

const DEFAULT_KEYS = new Set(DEFAULT_ONBOARDING_QUESTIONS.map((q) => q.key));
const DEFAULT_BY_KEY = new Map(DEFAULT_ONBOARDING_QUESTIONS.map((q) => [q.key, q]));

type Row = {
  id: string; key: string; kind: string; title: string; subtitle: string | null;
  engineKey: string | null; choices: unknown; min: number | null; max: number | null;
  step: number | null; defaultValue: string | null; required: boolean; enabled: boolean;
  system: boolean; order: number;
};

function rowToQuestion(r: Row): OnboardingQuestion | null {
  // A built-in's kind/engineKey are locked to the code default (the editor only
  // changes copy/choices/order/enabled), so a row can never break the engine.
  const def = DEFAULT_BY_KEY.get(r.key);
  return normalizeOnboardingQuestion({
    id: r.id,
    key: r.key,
    kind: def ? def.kind : r.kind,
    title: r.title,
    subtitle: r.subtitle ?? undefined,
    engineKey: def ? def.engineKey : r.engineKey ?? undefined,
    choices: r.choices ?? (def ? def.choices : undefined),
    min: r.min ?? undefined,
    max: r.max ?? undefined,
    step: r.step ?? undefined,
    defaultValue: r.defaultValue ?? undefined,
    required: r.required,
    enabled: r.enabled,
    system: def ? true : r.system,
    order: r.order,
  });
}

/** The full question set (admin view — includes disabled), defaults overlaid by
 *  DB rows. `unavailable` is true when the table isn't migrated yet. */
export async function effectiveOnboardingQuestions(): Promise<{ questions: OnboardingQuestion[]; unavailable: boolean }> {
  let rows: OnboardingQuestion[] = [];
  let unavailable = false;
  try {
    const found = (await prisma.onboardingQuestion.findMany({ orderBy: { order: "asc" } })) as Row[];
    rows = found.map(rowToQuestion).filter((q): q is OnboardingQuestion => !!q);
  } catch {
    unavailable = true;
  }
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const merged: OnboardingQuestion[] = [];
  for (const d of DEFAULT_ONBOARDING_QUESTIONS) merged.push(byKey.get(d.key) ?? d);
  for (const r of rows) if (!DEFAULT_KEYS.has(r.key)) merged.push(r);
  merged.sort((a, b) => a.order - b.order);
  return { questions: merged, unavailable };
}

/** Whether a key belongs to a built-in (protected) question. */
export function isBuiltInQuestion(key: string): boolean {
  return DEFAULT_KEYS.has(key);
}

export { DEFAULT_BY_KEY };
