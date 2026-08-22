import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  onboardingQuestionsForClient,
  recommendFromAnswers,
  questionnaireFromAnswers,
  bodyMassFromAnswers,
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
import { logWeighInNow } from "./weigh-in";

export type AnswerValue = string | number | string[];

/** Onboarding state: fetch the admin-editable question set, seed defaults,
 *  track answers, derive the recommendation. Falls back to the @hybrid/core
 *  built-in defaults when the API is unreachable. */
export function useOnboarding() {
  const [questions, setQuestions] = useState<OnboardingQuestion[]>(() =>
    onboardingQuestionsForClient(DEFAULT_ONBOARDING_QUESTIONS),
  );
  const [answers, setAnswers] = useState<OnboardingAnswerMap>({});
  /**
   * WHICH ANSWERS THE ATHLETE ACTUALLY GAVE.
   *
   * The map below is seeded from every question's `defaultValue`, because the
   * plan recommender needs a complete set and a choice step has to open with
   * its default shown as picked. But a seeded value is a GUESS, and the profile
   * is the one place "we don't know" must stay distinguishable from "we
   * guessed" — the body questions ship without defaults for exactly that
   * reason, and it is only half a guarantee while `experience` and `days` are
   * carried into the volume model by a value nobody chose. Skipping the
   * experience step wrote "beginner" onto the profile, where it moved the
   * landmark factors and then read back on the questionnaire as answered.
   *
   * So the seeds stay where they are useful (the wizard, the recommendation)
   * and stop at the profile.
   */
  const [touched, setTouched] = useState<ReadonlySet<string>>(() => new Set());
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

  const setAnswer = (key: string, value: AnswerValue) => {
    setAnswers((p) => ({ ...p, [key]: value }));
    setTouched((p) => (p.has(key) ? p : new Set(p).add(key)));
  };
  const plan = useMemo<OnboardingPlan | null>(() => recommendFromAnswers(questions, answers), [questions, answers]);

  return { questions, answers, touched, setAnswer, plan, loading };
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
  /** The keys the athlete actually touched — see `touched` in the hook. The
   *  full map still goes to the server and to the recommender; only the
   *  PROFILE is held to what was given. */
  touched: ReadonlySet<string>,
): Promise<boolean> {
  const given: OnboardingAnswerMap = {};
  for (const [k, v] of Object.entries(answers)) if (touched.has(k)) given[k] = v;

  const personaQ = questions.find((q) => q.engineKey === "persona");
  if (personaQ) {
    const v = answers[personaQ.key];
    if (v === "casual" || v === "athlete") setClientPersona(v);
  }

  // The intake's answers win over anything already on the profile — they were
  // just given, deliberately, on a screen that asked for them. Skipped
  // questions contribute nothing (questionnaireFromAnswers applies no
  // defaults), so re-running setup can never blank an answer.
  const fromIntake = questionnaireFromAnswers(questions, given);
  if (!isEmptyVolumeProfile(fromIntake)) {
    setQuestionnaire({ ...getLoggerPrefs().volumeProfile, ...fromIntake });
  }
  // BODY MASS IS NOT ONE OF THOSE ANSWERS — it is a reading with a date, so it
  // goes to the body log, which is the store the scale, bodyweight-aware
  // tonnage, e1RM and the nutrition maintenance fit already share. Writing it
  // here is also what stops the questionnaire falling back to a typed figure:
  // from the athlete's first session there is a real weigh-in to prefer.
  const kg = bodyMassFromAnswers(questions, given);
  if (kg !== undefined) await logWeighInNow(kg);
  try {
    await AsyncStorage.setItem("hybrid.equipment", extractEngineAnswers(questions, answers).equipment);
  } catch { /* ignore */ }

  const ok = await apiSubmit(answers as Record<string, unknown>, plan ? { goalId: plan.goalId, planId: plan.planId } : null);
  try { await AsyncStorage.setItem("hybrid.onboarded", "1"); } catch { /* ignore */ }
  return ok;
}
