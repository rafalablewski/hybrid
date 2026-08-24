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
  system: boolean; order: number; personas?: string[] | null;
  groupKey?: string | null; groupTitle?: string | null;
};

/** Every column except the ones added with intake scoping and grouping, so a
 *  database without them can still be read. Prisma selects the whole model by default and errors on a column
 *  that is not there, which would take the entire questionnaire down rather
 *  than one field of it — the same soft-guard Macrocycle.planId uses. */
const WITHOUT_PERSONAS = {
  id: true, key: true, kind: true, title: true, subtitle: true, engineKey: true,
  choices: true, min: true, max: true, step: true, defaultValue: true,
  required: true, enabled: true, system: true, order: true,
} as const;

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
    // LOCKED FOR A BUILT-IN, exactly as kind and engineKey are, and for a
    // sharper reason: stored rows REPLACE the defaults for the client, so a row
    // that could widen a built-in's scope would put every tracker back on the
    // goal question with nothing in the editor to show why.
    personas: def ? def.personas : r.personas ?? undefined,
    // GROUPING IS PRESENTATION, so a stored row wins even for a built-in —
    // unlike `personas` above, regrouping cannot change who is asked or what
    // reads the answer. `null` means the row says nothing and the code default
    // applies; an empty string is an explicit ungrouping.
    group: r.groupKey ?? undefined,
    groupTitle: r.groupTitle ?? undefined,
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
    let found: Row[];
    try {
      found = (await prisma.onboardingQuestion.findMany({ orderBy: { order: "asc" } })) as Row[];
    } catch {
      // The `personas` column is not migrated yet — read everything else and
      // let custom questions fall back to "both", which is what they were
      // before the column existed (reference/sql-onboarding-scope-grouping.sql).
      found = (await prisma.onboardingQuestion.findMany({
        orderBy: { order: "asc" }, select: WITHOUT_PERSONAS,
      })) as Row[];
    }
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
