import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, TextInput, Pressable, type DimensionValue } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import {
  volumeStatus, weeklyMuscleSets, athleteLandmarks,
  replayLandmarks, testedMuscles, REPLAY_VERDICT_KEY, type LandmarkReplay,
  railGeometry, railScale, railX, bandRegion, BAND_KEYS, volumeSummary, sortByUrgency, setsLabel, deltaLabel,
  blockVolumePlan, blockRamp, blockKindKey, resolveBlock,
  measuredProfile, withMeasured, measuredFields,
  volumeProfileCompleteness, estimateFitnessLevel, resolveExperience, LEVEL_KEY, LEVEL_BASIS_KEY,
  formatPace, paceClock,
  VOLUME_PROFILE_FIELD_KEY, fmtWeight,
  sourceLabelKey, sourceWhyKey, factorLabelKey, factorPercent, targetVerdict, TARGET_VERDICT_KEY,
  readReports, placeReads, QUICK_CHECKIN_METRIC,
  type MuscleVolumeStatus, type VolumeZone, type VolumeLandmark, type MuscleGroup, type VolumeBandKey,
  type AthleteVolumeProfile, type VolumeBlock, type RampColumn, type BlockMuscleTarget, type Experience,
  type RecoveryReport, type LandmarkFactor, type WeightUnit,
} from "@hybrid/core";
import { useSessionsQuery, useCheckinsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useAthleteHeight, useBodyweight, useBodyweightPoints } from "../../lib/use-bodyweight";
import { useLoggerPrefs, setLoggerPref } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F, serifIf, FIXED_FONT_SCALE } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, AHeading, RADIUS, withAlpha } from "./kit";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.vol.muscleQuads", glutes: "w.analyze.vol.muscleGlutes", posterior: "w.analyze.vol.musclePosteriorChain", back: "w.analyze.vol.muscleBack", chest: "w.analyze.vol.muscleChest", shoulders: "w.analyze.vol.muscleShoulders", triceps: "w.analyze.vol.muscleTriceps" };
const ZONE_KEY: Record<VolumeZone, string> = { under: "w.analyze.vol.zoneUnder", productive: "w.analyze.vol.zoneProductive", peak: "w.analyze.vol.zonePeak", overreaching: "w.analyze.vol.zoneOver" };
const BAND_LABEL: Record<VolumeBandKey, string> = { mev: "MEV", mav: "MAV", mrv: "MRV" };
const GLOSS_KEY: Record<VolumeBandKey, string> = { mev: "w.analyze.vol.glossMev", mav: "w.analyze.vol.glossMav", mrv: "w.analyze.vol.glossMrv" };
const pct = (v: number): DimensionValue => `${v * 100}%` as DimensionValue;

/**
 * AURORA Volume — weekly working sets against the athlete's own MEV/MAV/MRV.
 *
 * The redesign leads with ONE hero: how many muscles are in range, drawn as a
 * seven-column week-shape you read before you read a word. Everything below it
 * is the same fact at increasing resolution — the week's prescription, then the
 * per-muscle rails, then (only if you ask) the landmark numbers and the
 * glossary. The rail geometry is normalised in @hybrid/core (`railX`) so every
 * muscle's band lands at the same x and the rows stack into one picture.
 * Mirrored by apps/web/components/aurora/volume.tsx.
 *
 * The landmarks come from ONE core call (`athleteLandmarks`), which layers
 * population table → profile estimate → what the log observed → the athlete's
 * own edits, and hands back the provenance so this screen never presents a
 * population average as a personal fact.
 */
export default function AuroraVolume({ top, unified = false }: {
  top?: ReactNode;
  /** True when these sections render INSIDE the unified Performance page
   *  (aurora/performance.tsx) rather than as their own screen: no AuroraScreen
   *  wrapper (the page owns the scroller) and the page title demotes to a
   *  section head. Every section, control and number is otherwise identical. */
  unified?: boolean;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  useRefreshOnFocus(refetch);

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
  const { data: checkins = [] } = useCheckinsQuery();
  const [intake, setIntake] = useState<{ experience?: Experience; daysPerWeek?: number }>({});
  useEffect(() => {
    let alive = true;
    Promise.all([AsyncStorage.getItem("hybrid.experience"), AsyncStorage.getItem("hybrid.daysPerWeek")])
      .then(([exp, rawDays]) => {
        if (!alive) return;
        const days = Number(rawDays);
        setIntake({
          experience: exp === "beginner" || exp === "intermediate" || exp === "advanced" ? exp : undefined,
          daysPerWeek: Number.isFinite(days) && days > 0 ? days : undefined,
        });
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

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
      checkins.flatMap((c) => {
        const day: RecoveryReport = { date: c.weekOf, soreness: c.soreness, sleep: c.sleep, energy: c.energy, mood: c.mood, loggedAt: c.createdAt ?? null };
        const rows = (c.reads ?? []).filter((r) => r.metric === QUICK_CHECKIN_METRIC);
        if (rows.length < 2) return [day];
        return readReports(day, placeReads(rows.map((r) => ({ value: r.value, at: Date.parse(r.loggedAt) })), sessionEnds)) as RecoveryReport[];
      }),
    [checkins, sessionEnds],
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
  // was tapped (that row carries the definition, next to the finger).
  const [zone, setZone] = useState<{ key: VolumeBandKey; muscle: MuscleGroup } | null>(null);
  const pickZone = (key: VolumeBandKey, muscle: MuscleGroup) => {
    Haptics.selectionAsync().catch(() => {});
    setZone((z) => (z && z.key === key && z.muscle === muscle ? null : { key, muscle }));
  };
  const customized = Object.keys(prefs.landmarkOverrides).length > 0;

  const editField = (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => {
    const next = { ...prefs.landmarkOverrides, [m]: { ...prefs.landmarkOverrides[m] } };
    if (raw.trim() === "") delete next[m]![k];
    else next[m]![k] = Math.max(0, Math.round(Number(raw) || 0));
    if (!Object.keys(next[m]!).length) delete next[m];
    setLoggerPref("landmarkOverrides", next);
  };

  const setBlock = (patch: Partial<VolumeBlock>) => {
    Haptics.selectionAsync().catch(() => {});
    setLoggerPref("volumeBlock", resolveBlock({ ...block, ...patch }));
  };
  const setProfile = (patch: Partial<AthleteVolumeProfile>) => {
    const next = { ...prefs.volumeProfile, ...patch };
    for (const k of Object.keys(next) as (keyof AthleteVolumeProfile)[]) if (next[k] === undefined) delete next[k];
    setLoggerPref("volumeProfile", next);
  };
  const toggleEditing = () => {
    // Turning editing ON opens every row, so the fields are where the athlete
    // is already looking rather than in a separate table of unlabelled numbers.
    setEditing((v) => !v);
    setOpen(null);
  };

  const zoneColor = (z: VolumeZone) => (z === "overreaching" ? C.red : z === "under" ? C.amber : z === "peak" ? C.blue : C.lime);

  // The hero's one line: either the tapped muscle, or the week's verdict.
  const pickedRow = picked ? rows.find((r) => r.muscle === picked) : undefined;
  const verdict = (() => {
    if (summary.verdict === "none") return t("w.analyze.vol.verdictNone");
    if (summary.verdict === "balanced") return t("w.analyze.vol.verdictBalanced");
    const parts: string[] = [];
    if (summary.over.length) parts.push(`${summary.over.length}${t("w.analyze.vol.verdictOverTail")}`);
    if (summary.under.length) parts.push(`${summary.under.length}${t("w.analyze.vol.verdictUnderTail")}`);
    return `${parts.join(t("w.analyze.vol.verdictJoin"))}.`;
  })();

  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        {!top && !unified && <ABack />}
        <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.vol.title")}</AHeading>
        <Pressable
          onPress={toggleEditing}
          accessibilityRole="button"
          style={{ marginLeft: "auto", paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: editing ? C.lime : C.line, backgroundColor: editing ? withAlpha(C.lime, 0.12) : "transparent" }}
        >
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: editing ? txt(C, C.lime) : C.ash }}>
            {editing ? t("w.analyze.vol.done") : t("w.analyze.vol.editLandmarks")}
          </Text>
        </Pressable>
      </View>

      {/* ── HERO — the whole week as one number and one shape ─────────────── */}
      <ACard style={{ marginTop: 16, paddingBottom: 18 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.vol.range7d")}</Text>
          {customized && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.4, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.analyze.vol.customised")}</Text>
          )}
        </View>

        {summary.empty ? (
          <Text style={{ marginTop: 14, fontFamily: F.reg, fontSize: fs.note, lineHeight: 23, color: C.ash }}>{t("w.analyze.vol.empty")}</Text>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: 10 }}>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 68, lineHeight: 74, letterSpacing: -2.5, color: C.chalk }}>{summary.inRange}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.heading, color: C.ash, marginLeft: 4 }}>/{summary.total}</Text>
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: fs.note, lineHeight: 21, color: C.ash, marginTop: -2, maxWidth: 240 }}>{t("w.analyze.vol.heroCaption")}</Text>

            {/* The week-shape: one column per muscle, same normalised geometry
                as the rails below, so shape and list agree row for row. */}
            <View style={{ flexDirection: "row", gap: 6, marginTop: 22 }}>
              {rows.map((r) => {
                const on = picked === r.muscle;
                const label = ml(r.muscle);
                return (
                  <Pressable
                    key={r.muscle}
                    onPress={() => setPicked(on ? null : r.muscle)}
                    accessibilityRole="button"
                    accessibilityLabel={`${label} – ${setsLabel(r.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[r.zone])}`}
                    style={{ flex: 1, alignItems: "center" }}
                  >
                    <ShapeColumn s={r} color={zoneColor(r.zone)} dim={picked !== null && !on} />
                    <Text style={{ marginTop: 8, fontFamily: F.mono, fontSize: 9, letterSpacing: 0.6, color: on ? C.chalk : C.ash }}>
                      {label.slice(0, 3).toUpperCase()}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={{ marginTop: 16, fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: 20, color: C.chalk }}>
              {pickedRow ? (
                <>
                  {ml(pickedRow.muscle)}
                  <Text style={{ color: C.ash }}>{" — "}</Text>
                  <Text style={{ fontFamily: F.mono, color: txt(C, zoneColor(pickedRow.zone)) }}>{setsLabel(pickedRow.sets)} {t("w.analyze.vol.sets")}</Text>
                  <Text style={{ color: C.ash }}>, {t(ZONE_KEY[pickedRow.zone])}</Text>
                </>
              ) : (
                verdict
              )}
            </Text>
          </>
        )}
      </ACard>

      {/* ── WHERE THIS WEEK SITS IN THE BLOCK ─────────────────────────────── */}
      <BlockCard block={block} ramp={blockRamp(block, lm)} on={prefs.periodizeVolume} editing={editing} setBlock={setBlock} />

      {/* ── THE WEEK'S PRESCRIPTION — verb + magnitude, said once ─────────── */}
      <Prescription
        title={t("w.analyze.vol.easeOff")} why={t("w.analyze.vol.easeOffWhy")}
        items={summary.over} color={C.red} ml={ml} unit={t("w.analyze.vol.perWeek")}
      />
      <Prescription
        title={t("w.analyze.vol.addVolume")} why={t("w.analyze.vol.addVolumeWhy")}
        items={summary.under} color={C.amber} ml={ml} unit={t("w.analyze.vol.perWeek")}
      />

      {/* ── BY MUSCLE — one legend, then the stack of comparable rails ────── */}
      {!summary.empty && (
        <ACard style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
            <Text style={{ flex: 1, fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{t("w.analyze.vol.byMuscle")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.vol.range7d")}</Text>
          </View>

          <View style={{ marginTop: 4 }}>
            {ranked.map((r) => (
              <MuscleRow
                key={r.muscle} s={r} label={ml(r.muscle)} color={zoneColor(r.zone)}
                target={targetFor(r.muscle)} history={history[r.muscle] ?? []}
                expanded={editing || open === r.muscle} editing={editing}
                zone={zone?.key ?? null} showGloss={zone?.muscle === r.muscle}
                onToggle={() => setOpen(open === r.muscle ? null : r.muscle)}
                onZone={(k) => pickZone(k, r.muscle)}
                onEdit={editField}
              />
            ))}
          </View>
        </ACard>
      )}

      {/* ── WHOSE NUMBERS THESE ARE — provenance, then the profile behind it ─ */}
      <SourceCard resolved={resolved} tested={replay} profile={profile} stored={prefs.volumeProfile} measuredKeys={measuredKeys} adaptive={prefs.adaptiveLandmarks} editing={editing} setProfile={setProfile} ml={ml} level={levelEstimate} experience={experience} units={prefs.units} />

      {/* ── The glossary that used to be a wall of acronyms in the header ─── */}
      <ACard style={{ marginTop: 14 }}>
        <Pressable onPress={() => setGloss((v) => !v)} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.subtitle, color: C.chalk }}>{t("w.analyze.vol.whatBands")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{gloss ? "–" : "+"}</Text>
        </Pressable>
        {gloss && (
          <View style={{ marginTop: 14, gap: 12 }}>
            {([["MV", "w.analyze.vol.glossMv"], ["MEV", "w.analyze.vol.glossMev"], ["MAV", "w.analyze.vol.glossMav"], ["MRV", "w.analyze.vol.glossMrv"]] as const).map(([k, key]) => (
              <View key={k} style={{ flexDirection: "row", gap: space.md }}>
                <Text style={{ width: 42, fontFamily: F.monoBold, fontSize: fs.caption, color: txt(C, C.lime) }}>{k}</Text>
                <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{t(key)}</Text>
              </View>
            ))}
          </View>
        )}
      </ACard>

      {editing && customized && (
        <Pressable onPress={() => setLoggerPref("landmarkOverrides", {})} style={{ alignSelf: "center", marginTop: 16, paddingVertical: 10, paddingHorizontal: 18 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.analyze.vol.resetDefaults")}</Text>
        </Pressable>
      )}
    </>
  );

  // Inside the unified Performance page the host owns the scroller, the safe
  // area and the pull-to-refresh — wrapping again would nest two ScrollViews.
  if (unified) return body;
  return (
    <AuroraScreen refreshing={refreshing} onRefresh={refetch} top={top}>
      {body}
    </AuroraScreen>
  );
}

/** One column of the hero's week-shape — the same normalised rail, stood up. */
function ShapeColumn({ s, color, dim }: { s: MuscleVolumeStatus; color: string; dim: boolean }) {
  const { palette: C } = useTheme();
  const g = railGeometry(s);
  const H = 66;
  return (
    <View style={{ width: "100%", height: H, borderRadius: 7, backgroundColor: C.ink, overflow: "hidden", opacity: dim ? 0.35 : 1 }}>
      {/* the productive band, lit through the whole column width */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.bandStart), height: pct(g.bandEnd - g.bandStart), backgroundColor: withAlpha(C.lime, 0.13) }} />
      {/* the territory past the ceiling */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.mrv), top: 0, backgroundColor: withAlpha(C.red, 0.16) }} />
      {/* this week */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: pct(g.x), backgroundColor: color, opacity: 0.9, borderTopLeftRadius: 7, borderTopRightRadius: 7 }} />
      {/* the ceiling reads as a NOTCH in the column, so it survives the fill */}
      <View style={{ position: "absolute", left: 0, right: 0, bottom: pct(g.mrv), height: 2, backgroundColor: C.ink2 }} />
    </View>
  );
}

/** "Ease off" / "Add volume" — the prescription as chips, with the reason said
 *  ONCE underneath instead of repeated verbatim on every muscle. */
function Prescription({ title, why, items, color, ml, unit }: {
  title: string; why: string; items: MuscleVolumeStatus[]; color: string; ml: (m: string) => string; unit: string;
}) {
  const { palette: C, scheme } = useTheme();
  if (!items.length) return null;
  return (
    <ACard style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Text style={{ flex: 1, fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{unit}</Text>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 14 }}>
        {items.map((s) => (
          <View key={s.muscle} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 9, paddingHorizontal: 14, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(color, 0.35), backgroundColor: withAlpha(color, 0.1) }}>
            <Text style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{ml(s.muscle)}</Text>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.bodyLg, color: txt(C, color) }}>{deltaLabel(s)}</Text>
          </View>
        ))}
      </View>
      <Text style={{ marginTop: 14, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{why}</Text>
    </ACard>
  );
}

/** A pill switch — the same control the block and adaptive toggles both use. */
function Toggle({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  const { palette: C } = useTheme();
  return (
    <Pressable
      onPress={() => { Haptics.selectionAsync().catch(() => {}); onPress(); }}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      style={{ paddingHorizontal: 13, paddingVertical: 7, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? withAlpha(C.lime, 0.12) : "transparent" }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? txt(C, C.lime) : C.ash }}>{label}</Text>
    </Pressable>
  );
}

/** A −/+ stepper for the small integer block settings. */
function Stepper({ label, value, suffix, min, max, onChange }: {
  label: string; value: number; suffix?: string; min: number; max: number; onChange: (v: number) => void;
}) {
  const { palette: C } = useTheme();
  const btn = { width: 34, height: 34, borderRadius: 10, alignItems: "center" as const, justifyContent: "center" as const, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
      <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} −`} onPress={() => onChange(Math.max(min, value - 1))} style={btn}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>−</Text>
        </Pressable>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, minWidth: 52, textAlign: "center" }}>{value}{suffix ? ` ${suffix}` : ""}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={`${label} +`} onPress={() => onChange(Math.min(max, value + 1))} style={btn}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>+</Text>
        </Pressable>
      </View>
    </View>
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
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const current = ramp.find((c) => c.current) ?? ramp[0];
  return (
    <ACard style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Text style={{ flex: 1, fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{t("w.analyze.vol.thisBlock")}</Text>
        <Toggle on={on} label={t("w.analyze.vol.periodize")} onPress={() => setLoggerPref("periodizeVolume", !on)} />
      </View>

      {!on ? (
        <Text style={{ marginTop: 12, fontFamily: F.reg, fontSize: fs.body, lineHeight: 20, color: C.ash }}>{t("w.analyze.vol.periodizeWhy")}</Text>
      ) : (
        <>
          <Text style={{ marginTop: 12, fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: 20, color: C.chalk }}>
            {t("w.analyze.vol.weekPre")}{block.week}{t("w.analyze.vol.weekOf")}{block.weeks}
            <Text style={{ color: C.ash }}>{" — "}</Text>
            <Text style={{ color: txt(C, current?.kind === "deload" ? C.blue : C.lime) }}>{current ? t(blockKindKey(current.kind)) : ""}</Text>
          </Text>

          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 16 }}>
            {ramp.map((c) => (
              <View key={c.week} style={{ flex: 1, alignItems: "center", gap: 6 }}>
                <View style={{ width: "100%", height: 56, backgroundColor: C.ink, borderRadius: 7, overflow: "hidden" }}>
                  <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: pct(c.height), backgroundColor: c.kind === "deload" ? C.blue : C.lime, opacity: c.current ? 0.95 : 0.32, borderTopLeftRadius: 7, borderTopRightRadius: 7 }} />
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.6, color: c.current ? C.chalk : C.ash }}>{c.week}</Text>
              </View>
            ))}
          </View>
          <Text style={{ marginTop: 12, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{t("w.analyze.vol.rampCaption")}</Text>

          {editing && (
            <View style={{ gap: 10, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
              <Stepper label={t("w.analyze.vol.currentWeek")} value={block.week} min={1} max={block.weeks} onChange={(v) => setBlock({ week: v })} />
              <Stepper label={t("w.analyze.vol.blockLength")} value={block.weeks} suffix={t("w.analyze.vol.weeksShort")} min={1} max={16} onChange={(v) => setBlock({ weeks: v })} />
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, flexWrap: "wrap" }}>
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{t("w.analyze.vol.lastLoadWeek")}</Text>
                <View style={{ flexDirection: "row", gap: 6 }}>
                  {(["mav", "overreach"] as const).map((k) => (
                    <Toggle key={k} on={block.peakAt === k} label={t(k === "mav" ? "w.analyze.vol.peakMav" : "w.analyze.vol.peakOverreach")} onPress={() => setBlock({ peakAt: k })} />
                  ))}
                </View>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
                <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{t("w.analyze.vol.deloadLast")}</Text>
                <Toggle on={!!block.deloadLast} label={t(block.deloadLast ? "w.analyze.vol.done" : "w.analyze.vol.deloadLast")} onPress={() => setBlock({ deloadLast: !block.deloadLast })} />
              </View>
            </View>
          )}
        </>
      )}
    </ACard>
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
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const confidence = Math.round(Math.max(resolved.profileConfidence, resolved.observedConfidence) * 100);
  const done = volumeProfileCompleteness(profile, measuredKeys);
  const field = { textAlign: "center" as const, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 7 };

  return (
    <ACard style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <Text style={{ flex: 1, fontFamily: serifIf(scheme, F.black), fontSize: fs.subtitle, color: C.chalk }}>{t("w.analyze.vol.whose")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: resolved.source === "population" ? C.ash : txt(C, C.lime) }}>{t(sourceLabelKey(resolved.source))}</Text>
      </View>
      <Text style={{ marginTop: 10, fontFamily: F.reg, fontSize: fs.body, lineHeight: 20, color: C.ash }}>{t(sourceWhyKey(resolved.source))}</Text>

      {/* HOW COMPLETE THE PROFILE IS, weighted by influence rather than by
          counting boxes — and what the single most valuable missing answer
          would buy. "Estimated for you" should be able to say how well. */}
      <View style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{Math.round(done.score * 100)}% {t("w.analyze.vol.knownAbout")}</Text>
          {done.next ? <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.analyze.vol.nextUp")}: {t(VOLUME_PROFILE_FIELD_KEY[done.next.key])}</Text> : null}
        </View>
        <View style={{ height: 5, borderRadius: 999, backgroundColor: C.ink, marginTop: 7, overflow: "hidden" }}>
          <View style={{ width: pct(done.score), height: "100%", backgroundColor: C.lime }} />
        </View>
        {done.next ? (
          <Text style={{ marginTop: 9, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{t(done.next.unlocksKey)}</Text>
        ) : null}
      </View>

      {/* YOUR LEVEL, FROM YOUR LIFTS. */}
      <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
          <Text style={{ flex: 1, fontFamily: serifIf(scheme, F.black), fontSize: fs.body, color: C.chalk }}>{t("w.analyze.vol.levelTitle")}</Text>
          {level.basis !== "none" ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t(LEVEL_KEY[level.level])}</Text>
          ) : null}
        </View>
        {level.basis === "none" ? (
          <Text style={{ marginTop: 9, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{t("w.analyze.vol.levelNoData")}</Text>
        ) : (
          <>
            <View style={{ gap: 6, marginTop: 11 }}>
              {/* Two kinds of evidence, two units. A lift is kg and a multiple
                  of body mass; a run is a distance and a pace. They share a row
                  shape but never a number — see core/engines/fitness-level.ts. */}
              {level.evidence.slice(0, 3).map((e) => (
                <View key={e.kind + e.lift} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
                  <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{e.lift}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
                    {e.kind === "strength" ? fmtWeight(e.e1rm!, units) : `${paceClock(Math.round(e.equivSec! / 5))} ${t("w.analyze.vol.levelEquiv")}`}
                  </Text>
                  <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk, minWidth: 78, textAlign: "right" }}>
                    {e.kind === "strength"
                      ? `${e.ratio.toFixed(2)} ${t("w.analyze.vol.ofBodyweight")}`
                      : `${formatPace(e.ratio)} ${t("w.analyze.vol.levelPace")}`}
                  </Text>
                </View>
              ))}
            </View>
            <Text style={{ marginTop: 10, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>
              {t(LEVEL_BASIS_KEY[level.basis])} {Math.round(level.confidence * 100)}% {t("w.analyze.vol.confidence")}
            </Text>
            {experience.disagrees ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 12, flexWrap: "wrap" }}>
                <Text style={{ flex: 1, minWidth: 180, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: txt(C, C.amber) }}>{t("w.analyze.vol.levelDisagrees")}</Text>
                <Toggle on={false} label={t("w.analyze.vol.levelUse")} onPress={() => setProfile({ experience: level.experience })} />
              </View>
            ) : null}
          </>
        )}
      </View>

      {resolved.factors.length > 0 && (
        <View style={{ gap: 7, marginTop: 14 }}>
          {resolved.factors.map((f) => (
            <View key={f.key} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm }}>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>
                {t(factorLabelKey(f.key))}
                {!!FACTOR_FIELD[f.key] && measuredKeys.has(FACTOR_FIELD[f.key]!) && (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{"  "}{t("w.analyze.vol.measured")}</Text>
                )}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
                {f.key === "experience" ? t(EXP_KEY[f.value as keyof typeof EXP_KEY] ?? "w.analyze.vol.expBeginner") : f.key === "nutrition" ? t(NUTRITION_KEY[f.value as keyof typeof NUTRITION_KEY]) : f.value}
              </Text>
              <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, minWidth: 46, textAlign: "right", color: txt(C, f.multiplier >= 1 ? C.lime : C.amber) }}>{factorPercent(f.multiplier)}</Text>
            </View>
          ))}
          {confidence > 0 && (
            <Text style={{ marginTop: 4, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{confidence}% {t("w.analyze.vol.confidence")}</Text>
          )}
        </View>
      )}

      {/* The log's correction — what your own training proved. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
        <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{t("w.analyze.vol.adaptive")}</Text>
        <Toggle on={adaptive} label={adaptive ? t("w.analyze.vol.done") : t("w.analyze.vol.adaptive")} onPress={() => setLoggerPref("adaptiveLandmarks", !adaptive)} />
      </View>
      {adaptive && (
        <Text style={{ marginTop: 10, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>
          {resolved.adapted.length
            ? `${resolved.adapted.map(ml).join(", ")} — ${resolved.adapted.length} ${t("w.analyze.vol.adaptedCount")}`
            : t("w.analyze.vol.notEnoughEvidence")}
        </Text>
      )}

      {/* HAS IT SETTLED? A ceiling is a claim, and the only evidence for it the
          app can offer is the shape of its own history: the same estimator, run
          at every week, with only the data that existed then. A number that
          stopped moving is worth training against; one that is still jumping
          says so. See core/engines/landmark-replay.ts. */}
      {adaptive ? (
        <View style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.body, color: C.chalk }}>{t("w.analyze.vol.replayTitle")}</Text>
          {tested.length === 0 ? (
            <Text style={{ marginTop: 8, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{t("w.analyze.vol.replayNone")}</Text>
          ) : (
            <>
              <View style={{ gap: 7, marginTop: 10 }}>
                {tested.slice(0, 4).map((r) => (
                  <View key={r.muscle} style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                    <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{ml(r.muscle)}</Text>
                    {/* The trajectory itself, not a summary of it. */}
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>
                      {r.points.filter((p) => p.tested).slice(-5).map((p) => p.mrv).join(" → ")}
                    </Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, minWidth: 82, textAlign: "right", color: r.verdict === "settled" ? txt(C, C.lime) : r.verdict === "unsettled" ? txt(C, C.amber) : C.ash }}>
                      {t(REPLAY_VERDICT_KEY[r.verdict])}
                    </Text>
                  </View>
                ))}
              </View>
              <Text style={{ marginTop: 10, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{t("w.analyze.vol.replayWhy")}</Text>
            </>
          )}
        </View>
      ) : null}

      {editing && (
        <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.body, color: C.chalk }}>{t("w.analyze.vol.aboutYou")}</Text>
          {measuredKeys.size > 0 && (
            <Text style={{ marginTop: 8, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{t("w.analyze.vol.measuredWhy")}</Text>
          )}

          <View style={{ flexDirection: "row", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {(["beginner", "intermediate", "advanced"] as const).map((e) => (
              <Toggle key={e} on={profile.experience === e} label={t(EXP_KEY[e])} onPress={() => setProfile({ experience: profile.experience === e ? undefined : e })} />
            ))}
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
            {([
              ["ageYears", t("w.analyze.vol.fieldAge")],
              ["bodyweightKg", t("w.analyze.vol.fieldBodyweight")],
              ["heightCm", t("w.analyze.vol.fieldHeight")],
              ["sleep", t("w.analyze.vol.fieldSleep")],
              ["stress", t("w.analyze.vol.fieldStress")],
              ["daysPerWeek", t("w.analyze.vol.fieldDays")],
            ] as const).map(([key, label]) => {
              const isMeasured = measuredKeys.has(key);
              return (
                <View key={key} style={{ width: "31%" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.6, color: isMeasured ? txt(C, C.lime) : C.ash, textAlign: "center", marginBottom: 5 }}>{label}</Text>
                  <TextInput
                    defaultValue={profile[key] !== undefined ? String(profile[key]) : ""}
                    onEndEditing={(e) => setProfile({ [key]: e.nativeEvent.text.trim() === "" ? undefined : Number(e.nativeEvent.text) } as Partial<AthleteVolumeProfile>)}
                    keyboardType="number-pad"
                    accessibilityLabel={label}
                    style={{ ...field, color: isMeasured ? C.ash : C.chalk, borderColor: isMeasured ? withAlpha(C.lime, 0.35) : C.line }}
                  />
                </View>
              );
            })}
          </View>

          <View style={{ flexDirection: "row", gap: 6, marginTop: 12, flexWrap: "wrap" }}>
            {(["deficit", "maintenance", "surplus"] as const).map((n) => (
              <Toggle key={n} on={profile.nutrition === n} label={t(NUTRITION_KEY[n])} onPress={() => setProfile({ nutrition: profile.nutrition === n ? undefined : n })} />
            ))}
          </View>

          {Object.keys(stored).length > 0 && (
            <Pressable onPress={() => setLoggerPref("volumeProfile", {})} style={{ marginTop: 14, paddingVertical: 8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.analyze.vol.clearProfile")}</Text>
            </Pressable>
          )}
        </View>
      )}
    </ACard>
  );
}

/** One muscle: name, count, the normalised rail — and, on tap, the landmarks
 *  behind it (read-only, or as fields while editing). */
function MuscleRow({ s, label, color, target, history, expanded, editing, zone, showGloss, onToggle, onZone, onEdit }: {
  s: MuscleVolumeStatus; label: string; color: string; expanded: boolean; editing: boolean;
  /** This week's block target, when volume is being periodized. */
  target: BlockMuscleTarget | null;
  /** Weekly hard sets for THIS muscle over the last eight weeks, oldest first. */
  history: number[];
  /** The band spotlighted across the whole list, if any. */
  zone: VolumeBandKey | null;
  /** True on the row whose scale was tapped — it carries the definition. */
  showGloss: boolean;
  onToggle: () => void; onZone: (k: VolumeBandKey) => void;
  onEdit: (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const g = railGeometry(s);
  const sc = railScale(s.landmark);
  const region = zone ? bandRegion(zone, s.landmark) : null;
  // The block target sits on the SAME normalised rail as everything else, so
  // "where I am" and "where the plan wants me" are one glance, not two.
  const targetX = target ? railX(target.target, s.landmark) : null;
  const verdict = target ? targetVerdict(s.sets, target.target) : null;
  return (
    <View style={{ paddingVertical: 12 }}>
      <Pressable
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={`${label} – ${setsLabel(s.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[s.zone])}`}
      >
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, marginBottom: 9 }}>
          <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.note, color: C.chalk }}>{label}</Text>
          <Text style={{ fontFamily: F.monoBold, fontSize: fs.note, color: txt(C, color) }}>{setsLabel(s.sets)} {t("w.analyze.vol.sets")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{target ? `${t("w.analyze.vol.target")} ${target.target}` : t(ZONE_KEY[s.zone])}</Text>
        </View>

        <View style={{ height: 11, borderRadius: 6, backgroundColor: C.ink, overflow: "hidden" }}>
          {/* The track is itself the key: the productive band lit, the territory
              past the ceiling tinted, so the zones read even on an empty rail. */}
          <View style={{ position: "absolute", left: pct(g.bandStart), width: pct(g.bandEnd - g.bandStart), top: 0, bottom: 0, backgroundColor: withAlpha(C.lime, 0.13) }} />
          <View style={{ position: "absolute", left: pct(g.mrv), right: 0, top: 0, bottom: 0, backgroundColor: withAlpha(C.red, 0.16) }} />
          <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(g.x), backgroundColor: color, opacity: 0.9, borderRadius: 6 }} />
          {/* MEV + MRV as notches cut out of the rail — always legible, filled or not */}
          <View style={{ position: "absolute", left: pct(g.mev), top: 0, bottom: 0, width: 2, backgroundColor: C.ink2 }} />
          <View style={{ position: "absolute", left: pct(g.mrv), top: 0, bottom: 0, width: 2, backgroundColor: C.ink2 }} />
          {/* This week's block target — a bright caret ON the rail, so the gap
              between where you are and where the plan wants you is a distance. */}
          {targetX !== null && (
            <View style={{ position: "absolute", left: pct(targetX), top: 0, bottom: 0, width: 2, backgroundColor: C.chalk }} />
          )}
          {/* SPOTLIGHT — tapping a landmark below scrims everything outside that
              band, on EVERY row at once, so the question "which part of the bar
              is my productive range" is answered by the chart itself. */}
          {region && (
            <>
              <View style={{ position: "absolute", left: 0, width: pct(region.from), top: 0, bottom: 0, backgroundColor: withAlpha(C.ink, 0.76) }} />
              <View style={{ position: "absolute", left: pct(region.to), right: 0, top: 0, bottom: 0, backgroundColor: withAlpha(C.ink, 0.76) }} />
              {/* Caliper edges, so the lit slice reads even when it is empty. */}
              <View pointerEvents="none" style={{ position: "absolute", left: pct(region.from), width: pct(region.to - region.from), top: 0, bottom: 0, borderLeftWidth: 1, borderRightWidth: 1, borderColor: withAlpha(C.chalk, 0.45) }} />
            </>
          )}
        </View>
      </Pressable>

      {/* This muscle's OWN scale — a plain three-column table pinned to the left
          edge, so the values line up down the whole list instead of floating at
          three different indents. Each cell is a control: tap it to spotlight
          that band and read what it means. */}
      <View style={{ flexDirection: "row", marginTop: 7 }}>
        {BAND_KEYS.map((k) => {
          const on = zone === k;
          return (
            <Pressable
              key={k}
              onPress={() => onZone(k)}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${BAND_LABEL[k]} ${sc[k]} – ${t(GLOSS_KEY[k])}`}
              style={{ flex: 1, opacity: zone && !on ? 0.4 : 1 }}
            >
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.5, color: on ? txt(C, C.lime) : C.ash }}>
                {BAND_LABEL[k]} <Text style={{ fontSize: 11, color: C.chalk }}>{sc[k]}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>

      {zone && showGloss && (
        <Text style={{ marginTop: 8, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{t(GLOSS_KEY[zone])}</Text>
      )}

      {/* Expanding adds only what the scale above does NOT already say: the
          maintenance floor and the prescription. Editing swaps in all five
          fields, since all five are editable. */}
      {expanded && !editing && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>MV {s.landmark.mv}</Text>
          {target && verdict && (
            <Text style={{ marginTop: 7, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: verdict === "on" ? txt(C, C.lime) : C.ash }}>
              {t("w.analyze.vol.weekTarget")} {target.target} {t("w.analyze.vol.sets")}
              <Text style={{ color: C.ash }}>{" — "}</Text>
              {t(TARGET_VERDICT_KEY[verdict])}
            </Text>
          )}
          <Text style={{ marginTop: 7, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{rowAdvice(s, t)}</Text>
          <MuscleHistory sets={history} />
        </View>
      )}
      {expanded && editing && (
        <View style={{ flexDirection: "row", gap: 6, marginTop: 12 }}>
          {(["mv", "mev", "mavLow", "mavHigh", "mrv"] as const).map((k, i) => (
            <View key={k} style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.6, color: C.ash, textAlign: "center", marginBottom: 5 }}>
                {["MV", "MEV", "MAV LO", "MAV HI", "MRV"][i]}
              </Text>
              <TextInput
                defaultValue={String(s.landmark[k])}
                onEndEditing={(e) => onEdit(s.muscle, k, e.nativeEvent.text)}
                keyboardType="number-pad"
                accessibilityLabel={`${label} ${k}`}
                style={{ textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 7 }}
              />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/** Eight weeks of this muscle's hard sets, oldest to newest — the last column
 *  lit, since "this week" is the number stated above the rail. Silent when the
 *  muscle has never been trained: an empty row of stubs would state a history
 *  that doesn't exist. Mirrors web volume.tsx. */
function MuscleHistory({ sets }: { sets: number[] }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  if (sets.length === 0 || sets.every((n) => n === 0)) return null;
  const mx = Math.max(...sets, 1);
  // Geometry, radius, gap and colour are LIFTED VERBATIM from the chart this
  // replaces (the focus-muscle chart on the old Trends screen). Moving an
  // element must not restyle it.
  return (
    <View>
      <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.ash, marginTop: 14 }}>{t("w.analyze.trends.weeklySets8w")}</Text>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 56, gap: 5, marginTop: 8 }}>
        {sets.map((n, i) => (
          <View key={i} style={{ flex: 1, height: 4 + (n / mx) * 48, borderRadius: 3, backgroundColor: i === sets.length - 1 ? C.blue : `${C.blue}66` }} />
        ))}
      </View>
    </View>
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
