import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  onboardingQuestionsForClient,
  recommendFromAnswers,
  DEFAULT_ONBOARDING_QUESTIONS,
  type OnboardingQuestion,
  type OnboardingAnswerMap,
  type OnboardingPlan,
} from "@hybrid/core";
import { fetchOnboardingQuestions, submitOnboarding as apiSubmit } from "./api";
import { setClientPersona } from "./persona";

export type AnswerValue = string | number | string[];

/** Onboarding state: fetch the admin-editable question set, seed defaults,
 *  track answers, derive the recommendation. Falls back to the @hybrid/core
 *  built-in defaults when the API is unreachable. */
export function useOnboarding() {
  const [questions, setQuestions] = useState<OnboardingQuestion[]>(() =>
    onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS),
  );
  const [answers, setAnswers] = useState<OnboardingAnswerMap>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchOnboardingQuestions()
      .then((rows) => { if (alive && rows) setQuestions(onboardingQuestionsForClient(rows)); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setAnswers((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const q of questions) {
        if (next[q.key] === undefined && q.defaultValue !== undefined) { next[q.key] = q.defaultValue; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [questions]);

  const setAnswer = (key: string, value: AnswerValue) => setAnswers((p) => ({ ...p, [key]: value }));
  const plan = useMemo<OnboardingPlan | null>(() => recommendFromAnswers(questions, answers), [questions, answers]);

  return { questions, answers, setAnswer, plan, loading };
}

/** Persist onboarding: mirror persona into the persona store, save answers +
 *  enroll, and set the same-device "done" fallback flag. */
export async function finishOnboarding(
  questions: OnboardingQuestion[],
  answers: OnboardingAnswerMap,
  plan: OnboardingPlan | null,
): Promise<boolean> {
  const personaQ = questions.find((q) => q.engineKey === "persona");
  if (personaQ) {
    const v = answers[personaQ.key];
    if (v === "casual" || v === "athlete") setClientPersona(v);
  }
  const ok = await apiSubmit(answers as Record<string, unknown>, plan ? { goalLabel: plan.goalLabel, planId: plan.planId } : null);
  try { await AsyncStorage.setItem("hybrid.onboarded", "1"); } catch { /* ignore */ }
  return ok;
}
