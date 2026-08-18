import { useMemo } from "react";
import {
  athleteLandmarks,
  measuredProfile, withMeasured, measuredFields,
  resolveExperience, effectiveAgeYears, birthYearFromAge,
  readReports, placeReads, QUICK_CHECKIN_METRIC,
  type AthleteVolumeProfile, type LoggedSession, type RecoveryReport,
} from "@hybrid/core";
import { useHeatSignalsQuery, useNutritionSignalsQuery } from "./queries";
import { useRecoveryReports } from "./use-recovery-reports";
import { useLoggerPrefs } from "./logger-prefs";
import { setQuestionnaire, useQuestionnaireSync } from "./questionnaire";
import { useAthleteHeight, useBodyFatPct, useBodyweight, useBodyweightPoints } from "./use-bodyweight";
import { useFitnessLevel } from "./use-fitness-level";

/**
 * THE VOLUME MODEL, RESOLVED ONCE.
 *
 * Everything that turns an athlete into a set of MEV/MAV/MRV landmarks: what
 * the app already knows about them (bodyweight, height, the check-in history),
 * what the log implies about their training age, what they typed, and what they
 * overrode. It used to live inline at the top of aurora/volume.tsx, which meant
 * the Volume screen was the ONLY thing that could resolve it.
 *
 * It is a hook rather than a helper because every input is a hook — the point
 * of extracting it is that the Volume screen and the settings route that edits
 * the model now read the identical resolution, so an edit and its effect can
 * never be computed two different ways.
 */
export function useVolumeModel(sessions: LoggedSession[]) {
  const prefs = useLoggerPrefs();
  // Pull the account's answers once — whichever surface resolves the model
  // first. Everything below reads `prefs.volumeProfile`, so the hydrate lands
  // as an ordinary preference change and every reader re-resolves together.
  useQuestionnaireSync();

  // What we already know about the athlete elsewhere in the app fills the gaps
  // the volume profile leaves — nobody should have to type their bodyweight
  // twice, and sleep and energy availability are MEASURED here, not guessed.
  // Anything stored on the profile itself wins over all of it.
  const bodyweight = useBodyweight();
  const bodyweightPoints = useBodyweightPoints();
  // Height comes from the body log the athlete already filled in (Profile →
  // Body & progress) rather than being asked for a second time here.
  const loggedHeightCm = useAthleteHeight();
  // …and their composition, from the same log. It makes the body-mass factor
  // read LEAN mass (engines/athlete-profile.ts) and does nothing without one.
  const loggedBodyFatPct = useBodyFatPct();
  // Heat is a MEASURED profile field — there is no form for it and there is not
  // going to be one, because the athlete already told us by logging.
  const { data: heatSignals = [] } = useHeatSignalsQuery();
  // …and the food log, for the OTHER half of the nutrition join. Energy
  // availability now reads the diary where it can and the scale where it
  // cannot (engines/landmark-context.ts), and protein — which has no outcome
  // measure at all, since the scale cannot say how much of a kilogram was
  // muscle — reads the diary or nothing.
  const { data: nutritionSignals = [] } = useNutritionSignalsQuery();
  // THE INTAKE FALLBACK IS GONE, because it never worked. It read training age
  // and weekly frequency from `hybrid.experience` / `hybrid.daysPerWeek` —
  // device keys NOTHING on either client has ever written (`git log -S` finds
  // no writer in the whole history), so the fallback resolved to `{}` for every
  // athlete who ever used the app while appearing to carry setup's answers
  // forward. Setup writes those answers straight onto the questionnaire now
  // (lib/use-onboarding.ts), which is `prefs.volumeProfile` — read below like
  // any other answer, with no second path to disagree with it.

  // The check-in history on the engine's own terms — shared with the heat
  // clearance comparison via lib/use-recovery-reports.ts.
  const recovery = useRecoveryReports(sessions);

  const measured = useMemo(
    () => measuredProfile({ checkins: recovery, bodyweight: bodyweightPoints, heightCm: loggedHeightCm, bodyFatPct: loggedBodyFatPct, heatSignals, nutritionSignals }),
    [recovery, bodyweightPoints, loggedHeightCm, loggedBodyFatPct, heatSignals, nutritionSignals],
  );
  const measuredKeys = useMemo(() => {
    const keys = measuredFields(prefs.volumeProfile, measured);
    // BODY MASS IS ALWAYS MEASURED WHEN THE LOG HAS ONE, even if the profile
    // also carries a typed figure — because the log wins now (see the inversion
    // in core `withMeasured`). `measuredFields` cannot know that: it applies the
    // general rule, which is that a typed value beats a measured one.
    if (bodyweight != null) keys.add("bodyweightKg");
    return keys;
  }, [prefs.volumeProfile, measured, bodyweight]);

  // WHAT LEVEL THE BAR SAYS. Training age is the strongest input to the whole
  // model and it used to come from one onboarding tap. Relative strength on the
  // benchmark lifts is a better read, it is already in the log, and the
  // athlete's own answer still wins — the estimate only fills a gap, and any
  // disagreement is shown rather than silently applied.
  //
  // Read through useFitnessLevel so this screen, the Performance card and the
  // Profile badge are the SAME estimate rather than three calls that could
  // drift apart. Note resolveExperience deliberately reads only the STRENGTH
  // half of it: MEV/MRV are lifting landmarks, and a fast 10 km cannot say how
  // many sets of squats an athlete recovers from.
  const { estimate: levelEstimate } = useFitnessLevel(sessions);
  const statedExperience = prefs.volumeProfile.experience;
  const experience = useMemo(
    () => resolveExperience(statedExperience, levelEstimate),
    [statedExperience, levelEstimate],
  );

  const profile = useMemo<AthleteVolumeProfile>(() => ({
    ...withMeasured(prefs.volumeProfile, measured),
    experience: experience.experience,
    // AGE IS DERIVED FROM THE BIRTH YEAR, so it has a birthday. A stored age is
    // the same number five years later while the recovery factor moves 1.2% for
    // every one of them; the engine derives this itself, and so does this
    // profile, so the figure the screen prints and the figure the model uses
    // cannot be a year apart.
    ageYears: effectiveAgeYears(prefs.volumeProfile),
    // The newest weigh-in, always. `withMeasured` already prefers the log over
    // a typed figure; this only covers the case where the points list produced
    // a current weight the measured layer did not (an empty dated series).
    bodyweightKg: bodyweight ?? withMeasured(prefs.volumeProfile, measured).bodyweightKg,
  }), [prefs.volumeProfile, measured, bodyweight, experience.experience]);

  /**
   * EVERYTHING THAT MAKES A LANDMARK, MINUS THE LOG — as one object.
   *
   * `athleteLandmarks` takes the athlete (profile, overrides, the switches) and
   * the log in one call, and every OTHER surface that wants to re-resolve them
   * needs the athlete half unchanged: the monthly story replays the same
   * resolver at earlier weeks (see core engines/learned.ts), and a story
   * resolved from a hand-copied subset of these options would quietly report a
   * different athlete than the Volume screen shows. So the half that is not the
   * log is named once, here, and handed out.
   */
  const landmarkOptions = useMemo(
    () => ({
      profile,
      overrides: prefs.landmarkOverrides,
      adaptive: prefs.adaptiveLandmarks,
      includeWarmups: prefs.countWarmupsInVolume,
      fractional: prefs.fractionalVolume,
    }),
    [profile, prefs.landmarkOverrides, prefs.adaptiveLandmarks, prefs.countWarmupsInVolume, prefs.fractionalVolume],
  );

  const resolved = useMemo(
    () => athleteLandmarks({ ...landmarkOptions, sessions, recovery }),
    [landmarkOptions, sessions, recovery],
  );

  /**
   * THE SAME RESOLUTION WITHOUT THE ATHLETE'S OWN EDITS.
   *
   * This is what makes an edit legible. A number typed into a landmark field
   * silently rewrites every band, every prescription and every verdict on the
   * Volume screen, and the athlete had no way to see what their change did — or
   * to tell an edit apart from the model's own estimate. Resolving the same
   * profile with `overrides: {}` gives the baseline to diff against.
   */
  const baseline = useMemo(
    () => athleteLandmarks({ ...landmarkOptions, overrides: {}, sessions, recovery }),
    [landmarkOptions, sessions, recovery],
  );

  /**
   * Save an answer — on this device and on the ACCOUNT.
   *
   * It used to be a bare `setLoggerPref`, which is to say the questionnaire was
   * device-local: the same athlete got two different volume models on two
   * phones, and the server — which scores the public level badge — could not
   * read a word of it. lib/questionnaire.ts writes both, and carries the rule
   * for what happens when two devices disagree.
   */
  const setProfile = (patch: Partial<AthleteVolumeProfile>) => {
    const next: AthleteVolumeProfile = { ...prefs.volumeProfile, ...patch };
    // AN AGE IS STORED AS THE YEAR IT IMPLIES. The athlete is asked their age,
    // because that is the question a person answers without thinking; the year
    // is what survives, because an age does not age. Converted at the single
    // write path so no caller has to remember — and the stale `ageYears` from a
    // pre-Aug-2026 profile is dropped as it is replaced, rather than left
    // behind to be preferred by some future reader.
    if ("ageYears" in patch) {
      const age = patch.ageYears;
      delete next.ageYears;
      next.birthYear = age === undefined ? undefined : birthYearFromAge(age);
    }
    for (const k of Object.keys(next) as (keyof AthleteVolumeProfile)[]) if (next[k] === undefined) delete next[k];
    setQuestionnaire(next);
  };

  return { prefs, recovery, measured, measuredKeys, levelEstimate, experience, profile, landmarkOptions, resolved, baseline, setProfile };
}
