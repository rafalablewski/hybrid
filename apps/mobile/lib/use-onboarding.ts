import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  onboardingQuestionsForClient,
  recommendFromAnswers,
  questionnaireFromAnswers,
  extractEngineAnswers,
  isEmptyVolumeProfile,
  DEFAULT_ONBOARDING_QUESTIONS,
  type OnboardingQuestion,
  type OnboardingAnswerMap,
  type OnboardingPlan,
} from "@hybrid/core";
import { fetchOnboardingQuestions, submitOnboarding as apiSubmit } from "./api";
import { setClientPersona } from "./persona";
import { getLoggerPrefs } from "./logger-prefs";
import { setQuestionnaire } from "./questionnaire";

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

/**
 * Persist onboarding: mirror persona into the persona store, CARRY THE ANSWERS
 * ONTO THE QUESTIONNAIRE, save + enroll, and set the same-device "done" flag.
 *
 * ── THE MIDDLE STEP IS NEW, AND IT SHOULD NEVER HAVE BEEN MISSING ──────────
 *
 * The answers went to the server and stopped. Three consumers read them back
 * from device keys — `hybrid.experience`, `hybrid.daysPerWeek`,
 * `hybrid.equipment` — that NO code on either client has ever written; `git
 * log -S` finds no writer in the whole history. The volume model's intake
 * fallback was therefore always empty, and `prescribeSession` on Today ran with
 * `experience: undefined` and `equipment: undefined` for every athlete who had
 * just been asked both. They answered, and the app forgot on the way out of the
 * room.
 *
 * So the questionnaire — which is read by every engine and now syncs to the
 * account — is the destination. Equipment is the one intake answer with no
 * questionnaire home (it shapes which movements may be prescribed, not how much
 * you recover), so it keeps a device key; the difference is that something
 * writes it now.
 */
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

  // The intake's answers win over anything already on the profile — they were
  // just given, deliberately, on a screen that asked for them. Skipped
  // questions contribute nothing (questionnaireFromAnswers applies no
  // defaults), so re-running setup can never blank an answer.
  const fromIntake = questionnaireFromAnswers(questions, answers);
  if (!isEmptyVolumeProfile(fromIntake)) {
    setQuestionnaire({ ...getLoggerPrefs().volumeProfile, ...fromIntake });
  }
  try {
    await AsyncStorage.setItem("hybrid.equipment", extractEngineAnswers(questions, answers).equipment);
  } catch { /* ignore */ }

  const ok = await apiSubmit(answers as Record<string, unknown>, plan ? { goalLabel: plan.goalLabel, planId: plan.planId } : null);
  try { await AsyncStorage.setItem("hybrid.onboarded", "1"); } catch { /* ignore */ }
  return ok;
}
