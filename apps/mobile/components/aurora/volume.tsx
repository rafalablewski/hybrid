import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, type DimensionValue } from "react-native";
import {
  volumeStatus, resolveLandmarks,
  railGeometry, RAIL, volumeSummary, sortByUrgency, setsLabel, deltaLabel,
  type MuscleVolumeStatus, type VolumeZone, type VolumeLandmark, type MuscleGroup,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLoggerPrefs, setLoggerPref } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F, serifIf } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, AHeading, RADIUS, withAlpha } from "./kit";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.vol.muscleQuads", glutes: "w.analyze.vol.muscleGlutes", posterior: "w.analyze.vol.musclePosteriorChain", back: "w.analyze.vol.muscleBack", chest: "w.analyze.vol.muscleChest", shoulders: "w.analyze.vol.muscleShoulders", triceps: "w.analyze.vol.muscleTriceps" };
const ZONE_KEY: Record<VolumeZone, string> = { under: "w.analyze.vol.zoneUnder", productive: "w.analyze.vol.zoneProductive", peak: "w.analyze.vol.zonePeak", overreaching: "w.analyze.vol.zoneOver" };
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
 */
export default function AuroraVolume() {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  useRefreshOnFocus(refetch);

  const prefs = useLoggerPrefs();
  const lm = useMemo(() => resolveLandmarks(prefs.landmarkOverrides), [prefs.landmarkOverrides]);
  const rows = useMemo(
    () => volumeStatus(sessions, { includeWarmups: prefs.countWarmupsInVolume, fractional: prefs.fractionalVolume, landmarks: lm }),
    [sessions, prefs.countWarmupsInVolume, prefs.fractionalVolume, lm],
  );
  const summary = useMemo(() => volumeSummary(rows), [rows]);
  const ranked = useMemo(() => sortByUrgency(rows), [rows]);

  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<MuscleGroup | null>(null);
  const [picked, setPicked] = useState<MuscleGroup | null>(null);
  const [gloss, setGloss] = useState(false);
  const customized = Object.keys(prefs.landmarkOverrides).length > 0;

  const editField = (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => {
    const next = { ...prefs.landmarkOverrides, [m]: { ...prefs.landmarkOverrides[m] } };
    if (raw.trim() === "") delete next[m]![k];
    else next[m]![k] = Math.max(0, Math.round(Number(raw) || 0));
    if (!Object.keys(next[m]!).length) delete next[m];
    setLoggerPref("landmarkOverrides", next);
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

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={refetch}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
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
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.vol.sets")}</Text>
          </View>

          <LegendRail />

          <View style={{ marginTop: 4 }}>
            {ranked.map((r) => (
              <MuscleRow
                key={r.muscle} s={r} label={ml(r.muscle)} color={zoneColor(r.zone)}
                expanded={editing || open === r.muscle} editing={editing}
                onToggle={() => setOpen(open === r.muscle ? null : r.muscle)}
                onEdit={editField}
              />
            ))}
          </View>
        </ACard>
      )}

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

/** The shared landmark geometry, drawn once as the key for the whole stack. */
function LegendRail() {
  const { palette: C } = useTheme();
  return (
    <View style={{ marginTop: 16, marginBottom: 18 }}>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: C.ink, overflow: "hidden" }}>
        <View style={{ position: "absolute", left: pct(RAIL.mev), width: pct(RAIL.mavHigh - RAIL.mev), top: 0, bottom: 0, backgroundColor: withAlpha(C.lime, 0.3) }} />
      </View>
      <View style={{ height: 14 }}>
        {([["MEV", RAIL.mev], ["MAV", (RAIL.mev + RAIL.mavHigh) / 2], ["MRV", RAIL.mrv]] as const).map(([label, x]) => (
          <Text key={label} style={{ position: "absolute", left: pct(x), top: 4, marginLeft: -16, width: 32, textAlign: "center", fontFamily: F.mono, fontSize: 9, letterSpacing: 0.8, color: C.ash }}>{label}</Text>
        ))}
      </View>
    </View>
  );
}

/** One muscle: name, count, the normalised rail — and, on tap, the landmarks
 *  behind it (read-only, or as fields while editing). */
function MuscleRow({ s, label, color, expanded, editing, onToggle, onEdit }: {
  s: MuscleVolumeStatus; label: string; color: string; expanded: boolean; editing: boolean;
  onToggle: () => void; onEdit: (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const g = railGeometry(s);
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="button"
      accessibilityLabel={`${label} – ${setsLabel(s.sets)} ${t("w.analyze.vol.sets")}, ${t(ZONE_KEY[s.zone])}`}
      style={{ paddingVertical: 12 }}
    >
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.sm, marginBottom: 9 }}>
        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.note, color: C.chalk }}>{label}</Text>
        <Text style={{ fontFamily: F.monoBold, fontSize: fs.note, color: txt(C, color) }}>{setsLabel(s.sets)}</Text>
      </View>

      <View style={{ height: 11, borderRadius: 6, backgroundColor: C.ink, overflow: "hidden" }}>
        <View style={{ position: "absolute", left: pct(g.bandStart), width: pct(g.bandEnd - g.bandStart), top: 0, bottom: 0, backgroundColor: withAlpha(C.lime, 0.13) }} />
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(g.x), backgroundColor: color, opacity: 0.9, borderRadius: 6 }} />
        {/* MEV + MRV as notches cut out of the rail — always legible, filled or not */}
        <View style={{ position: "absolute", left: pct(g.mev), top: 0, bottom: 0, width: 2, backgroundColor: C.ink2 }} />
        <View style={{ position: "absolute", left: pct(g.mrv), top: 0, bottom: 0, width: 2, backgroundColor: C.ink2 }} />
      </View>

      {expanded && (
        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(["mv", "mev", "mavLow", "mavHigh", "mrv"] as const).map((k, i) => (
              <View key={k} style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.6, color: C.ash, textAlign: "center", marginBottom: 5 }}>
                  {["MV", "MEV", "MAV", "MAV", "MRV"][i]}
                </Text>
                {editing ? (
                  <TextInput
                    defaultValue={String(s.landmark[k])}
                    onEndEditing={(e) => onEdit(s.muscle, k, e.nativeEvent.text)}
                    keyboardType="number-pad"
                    accessibilityLabel={`${label} ${k}`}
                    style={{ textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 7 }}
                  />
                ) : (
                  <Text style={{ textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.chalk, paddingVertical: 8 }}>{s.landmark[k]}</Text>
                )}
              </View>
            ))}
          </View>
          {!editing && <Text style={{ marginTop: 12, fontFamily: F.reg, fontSize: fs.body, lineHeight: 19, color: C.ash }}>{rowAdvice(s, t)}</Text>}
        </View>
      )}
    </Pressable>
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
