"use client";

import { createElement, useEffect, useMemo, useState, type CSSProperties } from "react";
import {
  fs, space, volumeStatus, weeklyMuscleSets, athleteLandmarks,
  replayLandmarks, testedMuscles, REPLAY_VERDICT_KEY, type LandmarkReplay,
  railGeometry, railScale, railX, bandRegion, BAND_KEYS, volumeSummary, sortByUrgency, setsLabel, deltaLabel,
  blockVolumePlan, blockRamp, blockKindKey, resolveBlock,
  measuredProfile, withMeasured, measuredFields,
  volumeProfileCompleteness, estimateFitnessLevel, resolveExperience, LEVEL_KEY, LEVEL_BASIS_KEY,
  formatPace, paceClock,
  VOLUME_PROFILE_FIELD_KEY, fmtWeight,
  sourceLabelKey, sourceWhyKey, factorLabelKey, factorPercent, targetVerdict, TARGET_VERDICT_KEY,
  readReports, placeReads, QUICK_CHECKIN_METRIC,
  type LoggedSession, type MuscleVolumeStatus, type VolumeZone, type VolumeLandmark, type MuscleGroup, type VolumeBandKey,
  type AthleteVolumeProfile, type VolumeBlock, type RampColumn, type BlockMuscleTarget, type RecoveryReport, type LandmarkFactor, type WeightUnit,
} from "@hybrid/core";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { useAthleteHeight, useBodyweight, useBodyweightPoints } from "@/lib/use-bodyweight";
import { useCheckins } from "@/lib/use-checkins";
import { readIntake } from "@/lib/intake";
import { useLang } from "@/lib/i18n";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.vol.muscleQuads", glutes: "w.analyze.vol.muscleGlutes", posterior: "w.analyze.vol.musclePosteriorChain", back: "w.analyze.vol.muscleBack", chest: "w.analyze.vol.muscleChest", shoulders: "w.analyze.vol.muscleShoulders", triceps: "w.analyze.vol.muscleTriceps" };
const ZONE_KEY: Record<VolumeZone, string> = { under: "w.analyze.vol.zoneUnder", productive: "w.analyze.vol.zoneProductive", peak: "w.analyze.vol.zonePeak", overreaching: "w.analyze.vol.zoneOver" };
const C = (v: string) => `var(--color-${v})`;
const mix = (token: string, amount: number) => `color-mix(in srgb, ${C(token)} ${amount}%, transparent)`;
const pct = (v: number) => `${v * 100}%`;
const BAND_LABEL: Record<VolumeBandKey, string> = { mev: "MEV", mav: "MAV", mrv: "MRV" };
const GLOSS_KEY: Record<VolumeBandKey, string> = { mev: "w.analyze.vol.glossMev", mav: "w.analyze.vol.glossMav", mrv: "w.analyze.vol.glossMrv" };

const ZONE_TOKEN: Record<VolumeZone, string> = { overreaching: "red", under: "amber", peak: "blue", productive: "lime" };

const card: CSSProperties = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 };
const mono = (size: number): CSSProperties => ({ fontFamily: "var(--font-mono)", fontSize: size });
const eyebrow: CSSProperties = { ...mono(fs.nano), textTransform: "uppercase", letterSpacing: ".14em", color: C("ash") };
const sectionTitle: CSSProperties = { fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk"), margin: 0 };

/**
 * AURORA Volume (web) — weekly working sets against the athlete's own
 * MEV/MAV/MRV. Mirrors apps/mobile/components/aurora/volume.tsx exactly: one
 * hero (how many muscles are in range + the week drawn as a seven-column
 * shape), then where the athlete is in the block, then the week's prescription,
 * then the per-muscle rails, then — only on request — whose numbers these
 * actually are and the glossary. The rail geometry is normalised in
 * @hybrid/core (`railX`), so every muscle's band lands at the same x and the
 * rows stack into one readable picture.
 *
 * The landmarks themselves come from ONE core call (`athleteLandmarks`), which
 * layers population table → profile estimate → what the log observed → the
 * athlete's own edits, and hands back the provenance so this screen never
 * presents a population average as a personal fact.
 */
export default function AuroraVolume({ sessions, unified = false }: {
  sessions: LoggedSession[];
  /** True when these sections render INSIDE the unified Performance page
   *  (aurora/performance.tsx) rather than as their own screen: the page title
   *  demotes to a section head, since the page already has one masthead. Every
   *  section, control and number is otherwise identical. */
  unified?: boolean;
}) {
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
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

  // The daily check-in on the engine's own terms: same 1–5 scales, no reinterpretation.
  //
  // …and a day is EVERY READ it carries, not one value. The card asks again once
  // a session has drained, so a day can hold "wrecked at 09:30" and "good at
  // 22:00" — which is precisely the pair `athleteClearance` needs to measure how
  // fast this athlete drains a session, and which one stored value could never
  // express. `readReports` gives the day the DECISIVE read (freshness, sleep and
  // mood travel with it, answered once) and emits the others as timed reads of
  // their own; the estimator then weights each DAY to 1 regardless of how many
  // reads it holds. See core/readiness-reads.ts.
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
    // Body mass is measured too — it comes from the bodyweight log, not this form.
    if (prefs.volumeProfile.bodyweightKg === undefined && bodyweight != null) keys.add("bodyweightKg");
    return keys;
  }, [prefs.volumeProfile, measured, bodyweight]);

  // WHAT LEVEL THE BAR SAYS. Training age is the strongest input to the whole
  // model and it used to come from one onboarding tap. Relative strength on the
  // benchmark lifts is a better read, it is already in the log, and the
  // athlete's own answer still wins — the estimate only fills a gap, and any
  // disagreement is shown rather than silently applied.
  const levelEstimate = useMemo(
    () => estimateFitnessLevel(sessions, {
      bodyweightKg: prefs.volumeProfile.bodyweightKg ?? bodyweight,
      ageYears: prefs.volumeProfile.ageYears ?? null,
    }),
    [sessions, prefs.volumeProfile.bodyweightKg, prefs.volumeProfile.ageYears, bodyweight],
  );
  const statedExperience = prefs.volumeProfile.experience ?? intake.experience;
  const experience = useMemo(
    () => resolveExperience(statedExperience, levelEstimate),
    [statedExperience, levelEstimate],
  );

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
  const lm = resolved.landmarks;

  // HAS THE CEILING SETTLED? The same resolver re-run at every week of the
  // athlete's own history — a screen-level computation, deliberately memoised
  // apart from `resolved` because it costs one resolve per replayed week.
  const replay = useMemo(
    () =>
      prefs.adaptiveLandmarks
        ? testedMuscles(
            replayLandmarks(sessions, recovery, {
              profile,
              overrides: prefs.landmarkOverrides,
              includeWarmups: prefs.countWarmupsInVolume,
              fractional: prefs.fractionalVolume,
            }),
          )
        : [],
    [profile, prefs.landmarkOverrides, prefs.adaptiveLandmarks, prefs.countWarmupsInVolume, prefs.fractionalVolume, sessions, recovery],
  );

  const block = useMemo(() => resolveBlock(prefs.volumeBlock), [prefs.volumeBlock]);
  const plan = useMemo(
    () => (prefs.periodizeVolume
      ? blockVolumePlan(sessions, { block, landmarks: lm, includeWarmups: prefs.countWarmupsInVolume, fractional: prefs.fractionalVolume })
      : null),
    [prefs.periodizeVolume, block, lm, sessions, prefs.countWarmupsInVolume, prefs.fractionalVolume],
  );
  const targetFor = (m: MuscleGroup): BlockMuscleTarget | null => plan?.targets.find((x) => x.muscle === m) ?? null;

  const rows = useMemo(
    () => volumeStatus(sessions, { includeWarmups: prefs.countWarmupsInVolume, fractional: prefs.fractionalVolume, landmarks: lm }),
    [sessions, prefs.countWarmupsInVolume, prefs.fractionalVolume, lm],
  );
  const summary = useMemo(() => volumeSummary(rows), [rows]);
  const ranked = useMemo(() => sortByUrgency(rows), [rows]);
  // EIGHT-WEEK HISTORY, per muscle. This is the chart Trends used to hang off a
  // second set of muscle chips — the same weeklyMuscleSets() engine, over the
  // same muscles, drawn twice on two screens. It belongs on the row that names
  // the muscle: "18 sets" and "and it has been climbing for a month" are one
  // thought, and the athlete no longer picks a muscle in two places.
  const history = useMemo(() => {
    const out = {} as Record<MuscleGroup, number[]>;
    for (const r of rows) out[r.muscle] = weeklyMuscleSets(sessions, r.muscle, 8, Date.now(), prefs.countWarmupsInVolume, prefs.fractionalVolume);
    return out;
  }, [rows, sessions, prefs.countWarmupsInVolume, prefs.fractionalVolume]);

  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<MuscleGroup | null>(null);
  const [picked, setPicked] = useState<MuscleGroup | null>(null);
  const [gloss, setGloss] = useState(false);
  // Which landmark band is spotlighted across the list, and the row whose scale
  // was clicked (that row carries the definition, next to the pointer).
  const [zone, setZone] = useState<{ key: VolumeBandKey; muscle: MuscleGroup } | null>(null);
  const pickZone = (key: VolumeBandKey, muscle: MuscleGroup) =>
    setZone((z) => (z && z.key === key && z.muscle === muscle ? null : { key, muscle }));
  const customized = Object.keys(prefs.landmarkOverrides).length > 0;

  const editField = (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => {
    const next = { ...prefs.landmarkOverrides, [m]: { ...prefs.landmarkOverrides[m] } };
    if (raw.trim() === "") delete next[m]![k];
    else next[m]![k] = Math.max(0, Math.round(Number(raw) || 0));
    if (!Object.keys(next[m]!).length) delete next[m];
    setLoggerPref("landmarkOverrides", next);
  };

  const setBlock = (patch: Partial<VolumeBlock>) => setLoggerPref("volumeBlock", resolveBlock({ ...block, ...patch }));
  const setProfile = (patch: Partial<AthleteVolumeProfile>) => {
    const next = { ...prefs.volumeProfile, ...patch };
    for (const k of Object.keys(next) as (keyof AthleteVolumeProfile)[]) if (next[k] === undefined) delete next[k];
    setLoggerPref("volumeProfile", next);
  };

  const pickedRow = picked ? rows.find((r) => r.muscle === picked) : undefined;
  const verdict = (() => {
    if (summary.verdict === "none") return t("w.analyze.vol.verdictNone");
    if (summary.verdict === "balanced") return t("w.analyze.vol.verdictBalanced");
    const parts: string[] = [];
    if (summary.over.length) parts.push(`${summary.over.length}${t("w.analyze.vol.verdictOverTail")}`);
    if (summary.under.length) parts.push(`${summary.under.length}${t("w.analyze.vol.verdictUnderTail")}`);
    return `${parts.join(t("w.analyze.vol.verdictJoin"))}.`;
  })();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.md, maxWidth: "100%", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space.md }}>
        <div>
          {/* IDENTICAL styling either way — only the heading LEVEL changes, so
              the unified Performance page doesn't carry three <h1>s. Nothing
              here may restyle: this section must look exactly as it did when it
              was its own screen. */}
          {createElement(
            unified ? "h2" : "h1",
            { style: { fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: fs.display, margin: 0, letterSpacing: "-0.02em" } },
            t("w.analyze.vol.title"),
          )}
          <p style={{ fontSize: fs.bodyLg, color: C("ash"), marginTop: 6, marginBottom: 0 }}>{t("w.analyze.vol.subtitle")}</p>
        </div>
        <button
          onClick={() => { setEditing((v) => !v); setOpen(null); }}
          style={{ ...mono(fs.caption), whiteSpace: "nowrap", padding: "8px 14px", borderRadius: 999, cursor: "pointer", color: editing ? C("lime") : C("ash"), background: editing ? mix("lime", 12) : "transparent", border: `1px solid ${editing ? C("lime") : C("line")}` }}
        >
          {editing ? t("w.analyze.vol.done") : t("w.analyze.vol.editLandmarks")}
        </button>
      </div>

      {/* ── HERO — the whole week as one number and one shape ─────────────── */}
      <section style={{ ...card, paddingBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={eyebrow}>{t("w.analyze.vol.range7d")}</span>
          {customized && <span style={{ ...eyebrow, color: C("lime") }}>{t("w.analyze.vol.customised")}</span>}
        </div>

        {summary.empty ? (
          <p style={{ marginTop: 14, marginBottom: 0, fontSize: fs.note, lineHeight: 1.55, color: C("ash"), maxWidth: 460 }}>{t("w.analyze.vol.empty")}</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", marginTop: 10 }}>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 68, lineHeight: 1.06, letterSpacing: "-0.04em" }}>{summary.inRange}</span>
              <span style={{ ...mono(fs.heading), color: C("ash"), marginLeft: 4 }}>/{summary.total}</span>
            </div>
            <p style={{ fontSize: fs.note, lineHeight: 1.4, color: C("ash"), margin: 0, maxWidth: 260 }}>{t("w.analyze.vol.heroCaption")}</p>

            <div style={{ display: "grid", gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))`, gap: 6, marginTop: 22, maxWidth: 520 }}>
              {rows.map((r) => {
                const on = picked === r.muscle;
                const label = ml(r.muscle);
                return (
                  <button
                    key={r.muscle}
                    onClick={() => setPicked(on ? null : r.muscle)}
                    aria-label={`${label} – ${setsLabel(r.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[r.zone])}`}
                    style={{ background: "none", border: "none", padding: 0, cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center" }}
                  >
                    <ShapeColumn s={r} token={ZONE_TOKEN[r.zone]} dim={picked !== null && !on} />
                    <span style={{ marginTop: 8, ...mono(9), letterSpacing: ".06em", color: on ? C("chalk") : C("ash") }}>{label.slice(0, 3).toUpperCase()}</span>
                  </button>
                );
              })}
            </div>

            <p style={{ marginTop: 16, marginBottom: 0, fontSize: fs.bodyLg, lineHeight: 1.45, color: C("chalk") }}>
              {pickedRow ? (
                <>
                  {ml(pickedRow.muscle)}
                  <span style={{ color: C("ash") }}>{" — "}</span>
                  <span style={{ ...mono(fs.bodyLg), color: C(ZONE_TOKEN[pickedRow.zone]) }}>{setsLabel(pickedRow.sets)} {t("w.analyze.vol.sets")}</span>
                  <span style={{ color: C("ash") }}>, {t(ZONE_KEY[pickedRow.zone])}</span>
                </>
              ) : (
                verdict
              )}
            </p>
          </>
        )}
      </section>

      {/* ── WHERE THIS WEEK SITS IN THE BLOCK ─────────────────────────────── */}
      <BlockCard block={block} ramp={blockRamp(block, lm)} on={prefs.periodizeVolume} editing={editing} setBlock={setBlock} />

      {/* ── THE WEEK'S PRESCRIPTION — verb + magnitude, said once ─────────── */}
      <Prescription title={t("w.analyze.vol.easeOff")} why={t("w.analyze.vol.easeOffWhy")} items={summary.over} token="red" ml={ml} unit={t("w.analyze.vol.perWeek")} />
      <Prescription title={t("w.analyze.vol.addVolume")} why={t("w.analyze.vol.addVolumeWhy")} items={summary.under} token="amber" ml={ml} unit={t("w.analyze.vol.perWeek")} />

      {/* ── BY MUSCLE — one legend, then the stack of comparable rails ────── */}
      {!summary.empty && (
        <section style={card}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
            <h2 style={sectionTitle}>{t("w.analyze.vol.byMuscle")}</h2>
            <span style={eyebrow}>{t("w.analyze.vol.range7d")}</span>
          </div>

          <div>
            {ranked.map((r) => (
              <MuscleRow
                key={r.muscle} s={r} label={ml(r.muscle)} token={ZONE_TOKEN[r.zone]}
                target={targetFor(r.muscle)} history={history[r.muscle] ?? []}
                expanded={editing || open === r.muscle} editing={editing}
                zone={zone?.key ?? null} showGloss={zone?.muscle === r.muscle}
                onToggle={() => setOpen(open === r.muscle ? null : r.muscle)}
                onZone={(k) => pickZone(k, r.muscle)}
                onEdit={editField}
              />
            ))}
          </div>
        </section>
      )}

      {/* ── WHOSE NUMBERS THESE ARE — provenance, then the profile behind it ─ */}
      <SourceCard resolved={resolved} tested={replay} profile={profile} stored={prefs.volumeProfile} measuredKeys={measuredKeys} adaptive={prefs.adaptiveLandmarks} editing={editing} setProfile={setProfile} ml={ml} level={levelEstimate} experience={experience} units={prefs.units} />

      {/* ── The glossary that used to be a wall of acronyms in the header ─── */}
      <section style={card}>
        <button
          onClick={() => setGloss((v) => !v)} aria-expanded={gloss}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit" }}
        >
          <span style={{ ...sectionTitle, fontSize: fs.subtitle }}>{t("w.analyze.vol.whatBands")}</span>
          <span style={{ ...mono(fs.caption), color: C("ash") }}>{gloss ? "–" : "+"}</span>
        </button>
        {gloss && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
            {([["MV", "w.analyze.vol.glossMv"], ["MEV", "w.analyze.vol.glossMev"], ["MAV", "w.analyze.vol.glossMav"], ["MRV", "w.analyze.vol.glossMrv"]] as const).map(([k, key]) => (
              <div key={k} style={{ display: "flex", gap: space.md }}>
                <span style={{ ...mono(fs.caption), fontWeight: 700, color: C("lime"), width: 42, flexShrink: 0 }}>{k}</span>
                <span style={{ fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t(key)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {editing && customized && (
        <button onClick={() => setLoggerPref("landmarkOverrides", {})} style={{ alignSelf: "center", marginTop: 4, padding: "10px 18px", background: "none", border: "none", cursor: "pointer", ...mono(fs.caption), color: C("ash") }}>
          {t("w.analyze.vol.resetDefaults")}
        </button>
      )}
    </div>
  );
}

/** One column of the hero's week-shape — the same normalised rail, stood up. */
function ShapeColumn({ s, token, dim }: { s: MuscleVolumeStatus; token: string; dim: boolean }) {
  const g = railGeometry(s);
  return (
    <div style={{ position: "relative", width: "100%", height: 66, borderRadius: 7, background: C("ink"), overflow: "hidden", opacity: dim ? 0.35 : 1, transition: "opacity .18s ease" }}>
      <div style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.bandStart), height: pct(g.bandEnd - g.bandStart), background: mix("lime", 13) }} />
      {/* the territory past the ceiling */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.mrv), top: 0, background: mix("red", 16) }} />
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: pct(g.x), background: C(token), opacity: 0.9, borderRadius: "7px 7px 0 0", transition: "height .3s cubic-bezier(.2,.7,.2,1)" }} />
      {/* the ceiling reads as a NOTCH in the column, so it survives the fill */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.mrv), height: 2, background: C("ink2") }} />
    </div>
  );
}

/** "Ease off" / "Add volume" — the prescription as chips, with the reason said
 *  ONCE underneath instead of repeated verbatim on every muscle. */
function Prescription({ title, why, items, token, ml, unit }: {
  title: string; why: string; items: MuscleVolumeStatus[]; token: string; ml: (m: string) => string; unit: string;
}) {
  if (!items.length) return null;
  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <h2 style={sectionTitle}>{title}</h2>
        <span style={eyebrow}>{unit}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, marginTop: 14 }}>
        {items.map((s) => (
          <span key={s.muscle} style={{ display: "inline-flex", alignItems: "center", gap: space.sm, padding: "9px 14px", borderRadius: 999, border: `1px solid ${mix(token, 35)}`, background: mix(token, 10) }}>
            <span style={{ fontSize: fs.bodyLg, fontWeight: 600, color: C("chalk") }}>{ml(s.muscle)}</span>
            <span style={{ ...mono(fs.bodyLg), fontWeight: 700, color: C(token) }}>{deltaLabel(s)}</span>
          </span>
        ))}
      </div>
      <p style={{ marginTop: 14, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{why}</p>
    </section>
  );
}

/** A pill switch — the same control the block and adaptive toggles both use. */
function Toggle({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick} role="switch" aria-checked={on}
      style={{ ...mono(fs.caption), whiteSpace: "nowrap", padding: "7px 13px", borderRadius: 999, cursor: "pointer", color: on ? C("lime") : C("ash"), background: on ? mix("lime", 12) : "transparent", border: `1px solid ${on ? C("lime") : C("line")}` }}
    >
      {label}
    </button>
  );
}

/** A −/+ stepper for the small integer block settings. */
function Stepper({ label, value, suffix, min, max, onChange }: {
  label: string; value: number; suffix?: string; min: number; max: number; onChange: (v: number) => void;
}) {
  const btn: CSSProperties = { ...mono(fs.body), width: 30, height: 30, borderRadius: 10, cursor: "pointer", background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}` };
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
      <span style={{ fontSize: fs.body, color: C("ash") }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button style={btn} aria-label={`${label} −`} onClick={() => onChange(Math.max(min, value - 1))}>−</button>
        <span style={{ ...mono(fs.body), minWidth: 46, textAlign: "center" }}>{value}{suffix ? ` ${suffix}` : ""}</span>
        <button style={btn} aria-label={`${label} +`} onClick={() => onChange(Math.min(max, value + 1))}>+</button>
      </div>
    </div>
  );
}

/**
 * THIS BLOCK — the week you're in, and the block drawn as a ramp.
 *
 * The strip is the argument: a low introduction week, a climb toward MAV, and
 * the step down of the deload. Switched off, the card is just the case for
 * turning it on, so the landmark view stays exactly as it was.
 */
function BlockCard({ block, ramp, on, editing, setBlock }: {
  block: VolumeBlock; ramp: RampColumn[]; on: boolean; editing: boolean; setBlock: (p: Partial<VolumeBlock>) => void;
}) {
  const { t } = useLang();
  const current = ramp.find((c) => c.current) ?? ramp[0];
  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <h2 style={sectionTitle}>{t("w.analyze.vol.thisBlock")}</h2>
        <Toggle on={on} label={t("w.analyze.vol.periodize")} onClick={() => setLoggerPref("periodizeVolume", !on)} />
      </div>

      {!on ? (
        <p style={{ marginTop: 12, marginBottom: 0, fontSize: fs.body, lineHeight: 1.55, color: C("ash") }}>{t("w.analyze.vol.periodizeWhy")}</p>
      ) : (
        <>
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: fs.bodyLg, lineHeight: 1.45, color: C("chalk") }}>
            {t("w.analyze.vol.weekPre")}{block.week}{t("w.analyze.vol.weekOf")}{block.weeks}
            <span style={{ color: C("ash") }}>{" — "}</span>
            <span style={{ color: current?.kind === "deload" ? C("blue") : C("lime") }}>{current ? t(blockKindKey(current.kind)) : ""}</span>
          </p>

          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginTop: 16, height: 72, maxWidth: 420 }}>
            {ramp.map((c) => (
              <div key={c.week} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                <div style={{ width: "100%", height: 56, display: "flex", alignItems: "flex-end", background: C("ink"), borderRadius: 7, overflow: "hidden" }}>
                  <div
                    title={`${c.sets}`}
                    style={{ width: "100%", height: pct(c.height), background: c.kind === "deload" ? C("blue") : C("lime"), opacity: c.current ? 0.95 : 0.32, borderRadius: "7px 7px 0 0", transition: "height .3s cubic-bezier(.2,.7,.2,1)" }}
                  />
                </div>
                <span style={{ ...mono(9), letterSpacing: ".06em", color: c.current ? C("chalk") : C("ash") }}>{c.week}</span>
              </div>
            ))}
          </div>
          <p style={{ marginTop: 12, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t("w.analyze.vol.rampCaption")}</p>

          {editing && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C("line")}` }}>
              <Stepper label={t("w.analyze.vol.currentWeek")} value={block.week} min={1} max={block.weeks} onChange={(v) => setBlock({ week: v })} />
              <Stepper label={t("w.analyze.vol.blockLength")} value={block.weeks} suffix={t("w.analyze.vol.weeksShort")} min={1} max={16} onChange={(v) => setBlock({ weeks: v })} />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
                <span style={{ fontSize: fs.body, color: C("ash") }}>{t("w.analyze.vol.lastLoadWeek")}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {(["mav", "overreach"] as const).map((k) => (
                    <Toggle key={k} on={block.peakAt === k} label={t(k === "mav" ? "w.analyze.vol.peakMav" : "w.analyze.vol.peakOverreach")} onClick={() => setBlock({ peakAt: k })} />
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
                <span style={{ fontSize: fs.body, color: C("ash") }}>{t("w.analyze.vol.deloadLast")}</span>
                <Toggle on={!!block.deloadLast} label={t(block.deloadLast ? "w.analyze.vol.done" : "w.analyze.vol.deloadLast")} onClick={() => setBlock({ deloadLast: !block.deloadLast })} />
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

const NUTRITION_KEY = { deficit: "w.analyze.vol.nutDeficit", maintenance: "w.analyze.vol.nutMaintenance", surplus: "w.analyze.vol.nutSurplus" } as const;
const EXP_KEY = { beginner: "w.analyze.vol.expBeginner", intermediate: "w.analyze.vol.expIntermediate", advanced: "w.analyze.vol.expAdvanced" } as const;
/** Which profile field each personalization factor reads, so a measured field
 *  can be marked wherever its factor is shown. Partial on purpose: `clearance`
 *  is measured from the log and has no field to type into. */
const FACTOR_FIELD: Partial<Record<LandmarkFactor["key"], keyof AthleteVolumeProfile>> = {
  experience: "experience", age: "ageYears", bodyweight: "bodyweightKg",
  sleep: "sleep", stress: "stress", nutrition: "nutrition", frequency: "daysPerWeek",
};

/**
 * WHOSE NUMBERS ARE THESE — the honest label on the landmarks, the factors that
 * moved them, and the profile you can correct. Without this the screen quietly
 * passes off a textbook average as a personal measurement.
 */
function SourceCard({ resolved, tested, profile, stored, measuredKeys, adaptive, editing, setProfile, ml, level, experience, units }: {
  resolved: ReturnType<typeof athleteLandmarks>;
  /** The ceiling's own history, muscles the log has actually tested. */
  tested: LandmarkReplay[];
  profile: AthleteVolumeProfile;
  stored: AthleteVolumeProfile;
  /** Profile fields filled in from measurement rather than typed — marked, so a
   *  derived number never reads as something the athlete claimed. */
  measuredKeys: Set<keyof AthleteVolumeProfile>;
  adaptive: boolean;
  editing: boolean;
  setProfile: (p: Partial<AthleteVolumeProfile>) => void;
  ml: (m: string) => string;
  level: ReturnType<typeof estimateFitnessLevel>;
  experience: ReturnType<typeof resolveExperience>;
  /** The athlete's weight unit — lifts are shown in the unit they train in. */
  units: WeightUnit;
}) {
  const { t } = useLang();
  const confidence = Math.round(Math.max(resolved.profileConfidence, resolved.observedConfidence) * 100);
  const done = volumeProfileCompleteness(profile, measuredKeys);
  const field: CSSProperties = { ...mono(fs.body), width: "100%", textAlign: "center", background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 10, padding: "7px 4px", boxSizing: "border-box" };
  const fieldLabel: CSSProperties = { ...mono(9), letterSpacing: ".06em", color: C("ash"), textAlign: "center", marginBottom: 5 };

  return (
    <section style={card}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
        <h2 style={{ ...sectionTitle, fontSize: fs.subtitle }}>{t("w.analyze.vol.whose")}</h2>
        <span style={{ ...mono(fs.caption), color: resolved.source === "population" ? C("ash") : C("lime") }}>{t(sourceLabelKey(resolved.source))}</span>
      </div>
      <p style={{ marginTop: 10, marginBottom: 0, fontSize: fs.body, lineHeight: 1.55, color: C("ash") }}>{t(sourceWhyKey(resolved.source))}</p>

      {/* HOW COMPLETE THE PROFILE IS, weighted by influence rather than by
          counting boxes — and what the single most valuable missing answer
          would buy. "Estimated for you" should be able to say how well. */}
      <div style={{ marginTop: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
          <span style={{ ...mono(fs.caption), color: C("ash") }}>{Math.round(done.score * 100)}% {t("w.analyze.vol.knownAbout")}</span>
          {done.next && <span style={{ ...mono(fs.caption), color: C("lime") }}>{t("w.analyze.vol.nextUp")}: {t(VOLUME_PROFILE_FIELD_KEY[done.next.key])}</span>}
        </div>
        <div style={{ height: 5, borderRadius: 999, background: C("ink"), marginTop: 7, overflow: "hidden" }}>
          <div style={{ width: pct(done.score), height: "100%", background: C("lime"), transition: "width .3s cubic-bezier(.2,.7,.2,1)" }} />
        </div>
        {done.next && (
          <p style={{ marginTop: 9, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t(done.next.unlocksKey)}</p>
        )}
      </div>

      {/* YOUR LEVEL, FROM YOUR LIFTS. */}
      <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C("line")}` }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
          <h3 style={{ ...sectionTitle, fontSize: fs.body, margin: 0 }}>{t("w.analyze.vol.levelTitle")}</h3>
          {level.basis !== "none" && (
            <span style={{ ...mono(fs.caption), color: C("lime") }}>{t(LEVEL_KEY[level.level])}</span>
          )}
        </div>
        {level.basis === "none" ? (
          <p style={{ marginTop: 9, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t("w.analyze.vol.levelNoData")}</p>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 11 }}>
              {/* Two kinds of evidence, two units. A lift is kg and a multiple
                  of body mass; a run is a distance and a pace. They share a row
                  shape but never a number — see core/engines/fitness-level.ts. */}
              {level.evidence.slice(0, 3).map((e) => (
                <div key={e.kind + e.lift} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
                  <span style={{ fontSize: fs.body, color: C("chalk") }}>{e.lift}</span>
                  <span style={{ ...mono(fs.caption), color: C("ash") }}>
                    {e.kind === "strength" ? fmtWeight(e.e1rm!, units) : `${paceClock(Math.round(e.equivSec! / 5))} ${t("w.analyze.vol.levelEquiv")}`}
                  </span>
                  <span style={{ ...mono(fs.body), fontWeight: 700, minWidth: 74, textAlign: "right" }}>
                    {e.kind === "strength"
                      ? `${e.ratio.toFixed(2)} ${t("w.analyze.vol.ofBodyweight")}`
                      : `${formatPace(e.ratio)} ${t("w.analyze.vol.levelPace")}`}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 10, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>
              {t(LEVEL_BASIS_KEY[level.basis])} {Math.round(level.confidence * 100)}% {t("w.analyze.vol.confidence")}
            </p>
            {experience.disagrees && (
              <div style={{ display: "flex", alignItems: "center", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
                <p style={{ flex: 1, minWidth: 200, margin: 0, fontSize: fs.body, lineHeight: 1.5, color: C("amber") }}>{t("w.analyze.vol.levelDisagrees")}</p>
                <Toggle on={false} label={t("w.analyze.vol.levelUse")} onClick={() => setProfile({ experience: level.experience })} />
              </div>
            )}
          </>
        )}
      </div>

      {resolved.factors.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 14 }}>
          {resolved.factors.map((f) => (
            <div key={f.key} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
              <span style={{ fontSize: fs.body, color: C("chalk") }}>
                {t(factorLabelKey(f.key))}
                {!!FACTOR_FIELD[f.key] && measuredKeys.has(FACTOR_FIELD[f.key]!) && (
                  <span style={{ ...mono(fs.caption), color: C("ash"), marginLeft: 8 }}>{t("w.analyze.vol.measured")}</span>
                )}
              </span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span style={{ ...mono(fs.caption), color: C("ash") }}>{f.key === "experience" ? t(EXP_KEY[f.value as keyof typeof EXP_KEY] ?? "w.analyze.vol.expBeginner") : f.key === "nutrition" ? t(NUTRITION_KEY[f.value as keyof typeof NUTRITION_KEY]) : f.value}</span>
                <span style={{ ...mono(fs.body), fontWeight: 700, color: f.multiplier >= 1 ? C("lime") : C("amber"), minWidth: 44, textAlign: "right" }}>{factorPercent(f.multiplier)}</span>
              </span>
            </div>
          ))}
          {confidence > 0 && (
            <div style={{ ...mono(fs.caption), color: C("ash"), marginTop: 4 }}>{confidence}% {t("w.analyze.vol.confidence")}</div>
          )}
        </div>
      )}

      {/* The log's correction — what your own training proved. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C("line")}`, flexWrap: "wrap" }}>
        <span style={{ fontSize: fs.body, color: C("chalk"), flex: 1, minWidth: 160 }}>{t("w.analyze.vol.adaptive")}</span>
        <Toggle on={adaptive} label={adaptive ? t("w.analyze.vol.done") : t("w.analyze.vol.adaptive")} onClick={() => setLoggerPref("adaptiveLandmarks", !adaptive)} />
      </div>
      {adaptive && (
        <p style={{ marginTop: 10, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>
          {resolved.adapted.length
            ? `${resolved.adapted.map((m) => {
                // The estimate never ships without its stated interval — a
                // ceiling shown as a bare number reads as a measurement.
                const e = resolved.estimates[m];
                return e ? `${ml(m)} ${e.mrv} (${e.lo}–${e.hi})` : ml(m);
              }).join(", ")} — ${resolved.adapted.length} ${t("w.analyze.vol.adaptedCount")}`
            : t("w.analyze.vol.notEnoughEvidence")}
        </p>
      )}

      {/* HAS IT SETTLED? A ceiling is a claim, and the only evidence for it the
          app can offer is the shape of its own history: the same estimator, run
          at every week, with only the data that existed then. A number that
          stopped moving is worth training against; one that is still jumping
          says so. See core/engines/landmark-replay.ts. */}
      {adaptive && (
        <div style={{ marginTop: 14 }}>
          <h3 style={{ ...sectionTitle, fontSize: fs.body, margin: 0 }}>{t("w.analyze.vol.replayTitle")}</h3>
          {tested.length === 0 ? (
            <p style={{ marginTop: 8, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t("w.analyze.vol.replayNone")}</p>
          ) : (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 10 }}>
                {tested.slice(0, 4).map((r) => (
                  <div key={r.muscle} style={{ display: "flex", alignItems: "baseline", gap: space.sm }}>
                    <span style={{ flex: 1, minWidth: 80, fontSize: fs.body, color: C("chalk") }}>{ml(r.muscle)}</span>
                    {/* The trajectory itself, not a summary of it. */}
                    <span style={{ ...mono(fs.caption), color: C("ash"), letterSpacing: ".02em" }}>
                      {r.points.filter((p) => p.tested).slice(-5).map((p) => p.mrv).join(" → ")}
                    </span>
                    <span style={{ ...mono(fs.caption), minWidth: 78, textAlign: "right", color: r.verdict === "settled" ? "var(--lime-text)" : r.verdict === "unsettled" ? "var(--amber-text)" : C("ash") }}>
                      {t(REPLAY_VERDICT_KEY[r.verdict])}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ marginTop: 10, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t("w.analyze.vol.replayWhy")}</p>
            </>
          )}
        </div>
      )}

      {editing && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C("line")}` }}>
          <h3 style={{ ...sectionTitle, fontSize: fs.body, margin: 0 }}>{t("w.analyze.vol.aboutYou")}</h3>
          {measuredKeys.size > 0 && (
            <p style={{ marginTop: 8, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t("w.analyze.vol.measuredWhy")}</p>
          )}

          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {(["beginner", "intermediate", "advanced"] as const).map((e) => (
              <Toggle key={e} on={profile.experience === e} label={t(EXP_KEY[e])} onClick={() => setProfile({ experience: profile.experience === e ? undefined : e })} />
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 8, marginTop: 12 }}>
            {([
              ["ageYears", t("w.analyze.vol.fieldAge"), 10, 100],
              ["bodyweightKg", t("w.analyze.vol.fieldBodyweight"), 25, 300],
              ["heightCm", t("w.analyze.vol.fieldHeight"), 120, 230],
              ["sleep", t("w.analyze.vol.fieldSleep"), 1, 5],
              ["stress", t("w.analyze.vol.fieldStress"), 1, 5],
              ["daysPerWeek", t("w.analyze.vol.fieldDays"), 1, 14],
            ] as const).map(([key, label, min, max]) => {
              const isMeasured = measuredKeys.has(key);
              return (
                <div key={key}>
                  <div style={{ ...fieldLabel, color: isMeasured ? C("lime") : C("ash") }}>{label}</div>
                  <input
                    type="number" min={min} max={max} aria-label={label}
                    defaultValue={profile[key] ?? ""}
                    onBlur={(e) => setProfile({ [key]: e.target.value.trim() === "" ? undefined : Number(e.target.value) } as Partial<AthleteVolumeProfile>)}
                    style={{ ...field, color: isMeasured ? C("ash") : C("chalk"), borderColor: isMeasured ? mix("lime", 35) : C("line") }}
                  />
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {(["deficit", "maintenance", "surplus"] as const).map((n) => (
              <Toggle key={n} on={profile.nutrition === n} label={t(NUTRITION_KEY[n])} onClick={() => setProfile({ nutrition: profile.nutrition === n ? undefined : n })} />
            ))}
          </div>

          {Object.keys(stored).length > 0 && (
            <button
              onClick={() => setLoggerPref("volumeProfile", {})}
              style={{ marginTop: 14, padding: "8px 0", background: "none", border: "none", cursor: "pointer", ...mono(fs.caption), color: C("ash") }}
            >
              {t("w.analyze.vol.clearProfile")}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/** One muscle: name, count, the normalised rail — and, on tap, the landmarks
 *  behind it (read-only, or as fields while editing). */
function MuscleRow({ s, label, token, target, history, expanded, editing, zone, showGloss, onToggle, onZone, onEdit }: {
  s: MuscleVolumeStatus; label: string; token: string; expanded: boolean; editing: boolean;
  /** This week's block target, when volume is being periodized. */
  target: BlockMuscleTarget | null;
  /** Weekly hard sets for THIS muscle over the last eight weeks, oldest first. */
  history: number[];
  /** The band spotlighted across the whole list, if any. */
  zone: VolumeBandKey | null;
  /** True on the row whose scale was clicked — it carries the definition. */
  showGloss: boolean;
  onToggle: () => void; onZone: (k: VolumeBandKey) => void;
  onEdit: (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => void;
}) {
  const { t } = useLang();
  const g = railGeometry(s);
  const sc = railScale(s.landmark);
  const region = zone ? bandRegion(zone, s.landmark) : null;
  // The block target sits on the SAME normalised rail as everything else, so
  // "where I am" and "where the plan wants me" are one glance, not two.
  const targetX = target ? railX(target.target, s.landmark) : null;
  const verdict = target ? targetVerdict(s.sets, target.target) : null;
  return (
    <div style={{ padding: "12px 0" }}>
      <button
        onClick={onToggle} aria-expanded={expanded}
        aria-label={`${label} – ${setsLabel(s.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[s.zone])}`}
        style={{ width: "100%", background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left" }}
      >
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, marginBottom: 9 }}>
          <span style={{ flex: 1, fontSize: fs.note, fontWeight: 600 }}>{label}</span>
          <span style={{ ...mono(fs.note), fontWeight: 700, color: C(token) }}>{setsLabel(s.sets)} {t("w.analyze.vol.sets")}</span>
          <span style={{ ...mono(fs.caption), color: C("ash") }}>{target ? `${t("w.analyze.vol.target")} ${target.target}` : t(ZONE_KEY[s.zone])}</span>
        </div>
        <div style={{ position: "relative", height: 11, borderRadius: 6, background: C("ink"), overflow: "hidden" }}>
          {/* The track is itself the key: the productive band lit, the territory
              past the ceiling tinted, so the zones read even on an empty rail. */}
          <div style={{ position: "absolute", left: pct(g.bandStart), width: pct(g.bandEnd - g.bandStart), top: 0, bottom: 0, background: mix("lime", 13) }} />
          <div style={{ position: "absolute", left: pct(g.mrv), right: 0, top: 0, bottom: 0, background: mix("red", 16) }} />
          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(g.x), background: C(token), opacity: 0.9, borderRadius: 6, transition: "width .3s cubic-bezier(.2,.7,.2,1)" }} />
          {/* MEV + MRV as notches cut out of the rail — always legible, filled or not */}
          <div style={{ position: "absolute", left: pct(g.mev), top: 0, bottom: 0, width: 2, background: C("ink2") }} />
          <div style={{ position: "absolute", left: pct(g.mrv), top: 0, bottom: 0, width: 2, background: C("ink2") }} />
          {/* This week's block target — a bright caret ON the rail, so the gap
              between where you are and where the plan wants you is a distance. */}
          {targetX !== null && (
            <div style={{ position: "absolute", left: pct(targetX), top: -2, bottom: -2, width: 2, background: C("chalk"), transition: "left .3s cubic-bezier(.2,.7,.2,1)" }} />
          )}
          {/* SPOTLIGHT — clicking a landmark below scrims everything outside that
              band, on EVERY row at once, so the question "which part of the bar
              is my productive range" is answered by the chart itself. */}
          {region && (
            <>
              <div style={{ position: "absolute", left: 0, width: pct(region.from), top: 0, bottom: 0, background: mix("ink", 76), transition: "width .2s ease" }} />
              <div style={{ position: "absolute", left: pct(region.to), right: 0, top: 0, bottom: 0, background: mix("ink", 76), transition: "left .2s ease" }} />
              {/* Caliper edges, so the lit slice reads even when it is empty. */}
              <div style={{ position: "absolute", left: pct(region.from), width: pct(region.to - region.from), top: 0, bottom: 0, borderLeft: `1px solid ${mix("chalk", 45)}`, borderRight: `1px solid ${mix("chalk", 45)}` }} />
            </>
          )}
        </div>
      </button>

      {/* This muscle's OWN scale — a plain three-column table pinned to the left
          edge, so the values line up down the whole list instead of floating at
          three different indents. Each cell is a control: click it to spotlight
          that band and read what it means. */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: 7, maxWidth: 420 }}>
        {BAND_KEYS.map((k) => {
          const on = zone === k;
          return (
            <button
              key={k} onClick={() => onZone(k)} aria-pressed={on}
              aria-label={`${BAND_LABEL[k]} ${sc[k]} – ${t(GLOSS_KEY[k])}`}
              style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", ...mono(9), letterSpacing: ".05em", color: on ? C("lime") : C("ash"), opacity: zone && !on ? 0.4 : 1, transition: "opacity .2s ease, color .2s ease" }}
            >
              {BAND_LABEL[k]} <span style={{ fontSize: 11, color: C("chalk") }}>{sc[k]}</span>
            </button>
          );
        })}
      </div>

      {zone && showGloss && (
        <p style={{ marginTop: 8, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{t(GLOSS_KEY[zone])}</p>
      )}

      {/* Expanding adds only what the scale above does NOT already say: the
          maintenance floor and the prescription. Editing swaps in all five
          fields, since all five are editable. */}
      {expanded && !editing && (
        <div style={{ marginTop: 12 }}>
          <div style={{ ...mono(fs.caption), color: C("ash") }}>MV {s.landmark.mv}</div>
          {target && verdict && (
            <p style={{ marginTop: 7, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: verdict === "on" ? C("lime") : C("ash") }}>
              {t("w.analyze.vol.weekTarget")} {target.target} {t("w.analyze.vol.sets")}
              <span style={{ color: C("ash") }}>{" — "}</span>
              {t(TARGET_VERDICT_KEY[verdict])}
            </p>
          )}
          <p style={{ marginTop: 7, marginBottom: 0, fontSize: fs.body, lineHeight: 1.5, color: C("ash") }}>{rowAdvice(s, t)}</p>
          <MuscleHistory sets={history} />
        </div>
      )}
      {expanded && editing && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, minmax(0, 1fr))", gap: 6, marginTop: 12 }}>
          {(["mv", "mev", "mavLow", "mavHigh", "mrv"] as const).map((k, i) => (
            <div key={k}>
              <div style={{ ...mono(9), letterSpacing: ".06em", color: C("ash"), textAlign: "center", marginBottom: 5 }}>{["MV", "MEV", "MAV LO", "MAV HI", "MRV"][i]}</div>
              <input
                type="number" min={0} defaultValue={s.landmark[k]} aria-label={`${label} ${k}`}
                onBlur={(e) => onEdit(s.muscle, k, e.target.value)}
                style={{ ...mono(fs.body), width: "100%", textAlign: "center", background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 10, padding: "7px 4px", boxSizing: "border-box" }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Eight weeks of this muscle's hard sets, oldest to newest — the last column
 *  lit, since "this week" is the number stated above the rail. Silent when the
 *  muscle has never been trained: an empty row of stubs would state a history
 *  that doesn't exist. */
function MuscleHistory({ sets }: { sets: number[] }) {
  const { t } = useLang();
  if (sets.length === 0 || sets.every((n) => n === 0)) return null;
  const max = Math.max(...sets, 1);
  // Bar geometry and colour are LIFTED VERBATIM from the block ramp already in
  // this file (BlockCard): ink track, radius 7, the current column at .95 and
  // the rest at .32. Volume draws every bar that way and imports no chart
  // library, so this introduces no new visual vocabulary — a moved element must
  // not become a restyled one.
  return (
    <div>
      <div style={{ ...mono(9), letterSpacing: ".06em", textTransform: "uppercase", color: C("ash"), marginTop: 14, marginBottom: 8 }}>{t("w.analyze.trends.weeklySets8w")}</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 56, maxWidth: 420 }}>
        {sets.map((n, i) => (
          <div key={i} style={{ flex: 1, height: 56, display: "flex", alignItems: "flex-end", background: C("ink"), borderRadius: 7, overflow: "hidden" }}>
            <div title={`${n}`} style={{ width: "100%", height: pct(n / max), background: C("blue"), opacity: i === sets.length - 1 ? 0.95 : 0.32, borderRadius: "7px 7px 0 0" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function rowAdvice(s: MuscleVolumeStatus, t: (k: string) => string): string {
  if (s.action === "add") {
    const n = Math.round(s.deltaSets);
    return `${t("w.analyze.vol.adviceAddPre")}${n} ${n === 1 ? t("w.analyze.vol.adviceAddSet") : t("w.analyze.vol.adviceAddSets")}${t("w.analyze.vol.adviceAddTail")}${s.maintaining ? t("w.analyze.vol.adviceMaintaining") : ""}.`;
  }
  if (s.action === "reduce") {
    const n = Math.round(Math.abs(s.deltaSets));
    return `${t("w.analyze.vol.adviceReducePre")}${n} ${n === 1 ? t("w.analyze.vol.adviceAddSet") : t("w.analyze.vol.adviceAddSets")}${t("w.analyze.vol.adviceReduceTail")}`;
  }
  if (s.action === "progress") return `${t("w.analyze.vol.adviceProgressPre")}${s.deltaSets}${t("w.analyze.vol.adviceProgressTail")}`;
  return t("w.analyze.vol.adviceHold");
}
