"use client";

import { useEffect, useMemo, useState } from "react";
import {
  onboardingQuestionsForClient,
  recommendFromAnswers,
  DEFAULT_ONBOARDING_QUESTIONS,
  type OnboardingQuestion,
  type OnboardingAnswerMap,
  type OnboardingPlan,
} from "@hybrid/core";
import { setClientPersona } from "@/lib/persona";

export type AnswerValue = string | number | string[];

/** Shared onboarding state for both web templates (classic + aurora). Fetches
 *  the admin-editable question set, seeds defaults, tracks answers, and derives
 *  the recommended plan from the engine-relevant answers. Falls back to the
 *  built-in defaults if the API is unreachable, so onboarding always renders. */
export function useOnboarding() {
  const [questions, setQuestions] = useState<OnboardingQuestion[]>(() =>
    onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS),
  );
  const [answers, setAnswers] = useState<OnboardingAnswerMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetch("/api/onboarding/questions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { questions?: unknown[] }) => {
        if (alive) setQuestions(onboardingQuestionsForClient(d.questions ?? []));
      })
      .catch(() => {/* keep the built-in defaults */})
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Seed each question's default so steppers/selects start on a sensible value.
  useEffect(() => {
    setAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const q of questions) {
        if (next[q.key] === undefined && q.defaultValue !== undefined) {
          next[q.key] = q.defaultValue;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [questions]);

  const setAnswer = (key: string, value: AnswerValue) =>
    setAnswers((p) => ({ ...p, [key]: value }));

  const plan = useMemo<OnboardingPlan | null>(
    () => recommendFromAnswers(questions, answers),
    [questions, answers],
  );

  return { questions, answers, setAnswer, plan, loading };
}

/** Persist onboarding: mirror the persona choice into the persona store (so
 *  resolvePersona keeps working), then save the answers + enroll the plan in one
 *  call. Returns { ok, status } so the caller can surface the 401 demo notice. */
export async function submitOnboarding(
  questions: OnboardingQuestion[],
  answers: OnboardingAnswerMap,
  plan: OnboardingPlan | null,
): Promise<{ ok: boolean; status: number }> {
  const personaQ = questions.find((q) => q.engineKey === "persona");
  if (personaQ) {
    const v = answers[personaQ.key];
    if (v === "casual" || v === "athlete") setClientPersona(v);
  }
  const res = await fetch("/api/onboarding", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      answers,
      ...(plan ? { goal: plan.goalLabel, planId: plan.planId } : {}),
    }),
  });
  return { ok: res.ok, status: res.status };
}
