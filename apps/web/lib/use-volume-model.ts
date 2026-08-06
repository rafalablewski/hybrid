"use client";

import { useEffect, useMemo, useState } from "react";
import {
  athleteLandmarks,
  measuredProfile, withMeasured, measuredFields,
  resolveExperience,
  readReports, placeReads, QUICK_CHECKIN_METRIC,
  type AthleteVolumeProfile, type LoggedSession, type RecoveryReport,
} from "@hybrid/core";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { useAthleteHeight, useBodyweight, useBodyweightPoints } from "@/lib/use-bodyweight";
import { useCheckins } from "@/lib/use-checkins";
import { useFitnessLevel } from "@/lib/use-fitness-level";
import { readIntake } from "@/lib/intake";

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
 *
 * Mirrors apps/mobile/lib/use-volume-model.ts.
 */
export function useVolumeModel(sessions: LoggedSession[]) {
  const prefs = useLoggerPrefs();

  // What we already know about the athlete elsewhere in the app fills the gaps
  // the volume profile leaves — nobody should have to type their bodyweight
  // twice, and sleep and energy availability are MEASURED here, not guessed.
  // Anything stored on the profile itself wins over all of it.
  const bodyweight = useBodyweight();
  const bodyweightPoints = useBodyweightPoints();
  // Height comes from the body log the athlete already filled in (Profile →
  // Body & progress) rather than being asked for a second time here.
  const loggedHeightCm = useAthleteHeight();
  const checkins = useCheckins();
  const [intake, setIntake] = useState<{ experience?: AthleteVolumeProfile["experience"]; daysPerWeek?: number }>({});
  useEffect(() => setIntake(readIntake()), []);

  // The daily check-in on the engine's own terms: same 1–5 scales, no
  // reinterpretation — and a day is EVERY READ it carries, not one value. A day
  // can hold "wrecked at 09:30" and "good at 22:00", which is precisely the
  // pair `athleteClearance` needs to measure how fast this athlete drains a
  // session. See core/readiness-reads.ts.
  const sessionEnds = useMemo(
    () => sessions.map((s) => Date.parse(s.completedAt ?? s.startedAt ?? "")).filter((t) => Number.isFinite(t)),
    [sessions],
  );
  const recovery = useMemo<RecoveryReport[]>(
    () =>
      (checkins.data ?? []).flatMap((c) => {
        const day: RecoveryReport = { date: c.weekOf, soreness: c.soreness, sleep: c.sleep, energy: c.energy, mood: c.mood, loggedAt: c.createdAt ?? null };
        const rows = (c.reads ?? []).filter((r) => r.metric === QUICK_CHECKIN_METRIC);
        if (rows.length < 2) return [day];
        return readReports(day, placeReads(rows.map((r) => ({ value: r.value, at: Date.parse(r.loggedAt) })), sessionEnds)) as RecoveryReport[];
      }),
    [checkins.data, sessionEnds],
  );
  const measured = useMemo(() => measuredProfile({ checkins: recovery, bodyweight: bodyweightPoints, heightCm: loggedHeightCm }), [recovery, bodyweightPoints, loggedHeightCm]);
  const measuredKeys = useMemo(() => {
    const keys = measuredFields(prefs.volumeProfile, measured);
    // Body mass is measured too — it comes from the bodyweight log, not the form.
    if (prefs.volumeProfile.bodyweightKg === undefined && bodyweight != null) keys.add("bodyweightKg");
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
  const statedExperience = prefs.volumeProfile.experience ?? intake.experience;
  const experience = useMemo(() => resolveExperience(statedExperience, levelEstimate), [statedExperience, levelEstimate]);

  const profile = useMemo<AthleteVolumeProfile>(() => ({
    ...withMeasured(prefs.volumeProfile, measured),
    experience: experience.experience,
    daysPerWeek: prefs.volumeProfile.daysPerWeek ?? intake.daysPerWeek,
    bodyweightKg: prefs.volumeProfile.bodyweightKg ?? bodyweight ?? undefined,
  }), [prefs.volumeProfile, measured, intake, bodyweight, experience.experience]);

  const resolved = useMemo(
    () => athleteLandmarks({
      profile,
      overrides: prefs.landmarkOverrides,
      sessions,
      recovery,
      adaptive: prefs.adaptiveLandmarks,
      includeWarmups: prefs.countWarmupsInVolume,
      fractional: prefs.fractionalVolume,
    }),
    [profile, prefs.landmarkOverrides, prefs.adaptiveLandmarks, prefs.countWarmupsInVolume, prefs.fractionalVolume, sessions, recovery],
  );

  /**
   * THE SAME RESOLUTION WITHOUT THE ATHLETE'S OWN EDITS.
   *
   * This is what makes an edit legible. A number typed into a landmark field
   * silently rewrites every band, every prescription and every verdict on the
   * Volume screen, and the athlete had no way to see what their change did —
   * or to tell an edit apart from the model's own estimate. Resolving the same
   * profile with `overrides: {}` gives the baseline to diff against, so the
   * settings route can show "you moved chest MRV from 18 to 22".
   */
  const baseline = useMemo(
    () => athleteLandmarks({
      profile,
      overrides: {},
      sessions,
      recovery,
      adaptive: prefs.adaptiveLandmarks,
      includeWarmups: prefs.countWarmupsInVolume,
      fractional: prefs.fractionalVolume,
    }),
    [profile, prefs.adaptiveLandmarks, prefs.countWarmupsInVolume, prefs.fractionalVolume, sessions, recovery],
  );

  const setProfile = (patch: Partial<AthleteVolumeProfile>) => {
    const next = { ...prefs.volumeProfile, ...patch };
    for (const k of Object.keys(next) as (keyof AthleteVolumeProfile)[]) if (next[k] === undefined) delete next[k];
    setLoggerPref("volumeProfile", next);
  };

  return { prefs, recovery, measured, measuredKeys, levelEstimate, experience, profile, resolved, baseline, setProfile };
}
