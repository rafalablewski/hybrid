import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { View, Text, TextInput, Pressable, type DimensionValue } from "react-native";
import {
  volumeStatus,
  volumeAdvice,
  resolveLandmarks,
  ALL_MUSCLES,
  type LoggedSession,
  type MuscleVolumeStatus,
  type VolumeZone,
  type VolumeLandmark,
  type MuscleGroup,
} from "@hybrid/core";
import { fetchSessions } from "../lib/api";
import { useLoggerPrefs, setLoggerPref } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { fs, space, Screen, Card, Kicker, H1, Mono, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraVolume from "../components/aurora/volume";

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads",
  glutes: "Glutes",
  posterior: "Posterior chain",
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  triceps: "Triceps",
};

/** Volume landmarks (MV/MEV/MAV/MRV) — weekly working sets per muscle vs the
 *  per-muscle landmarks, with a per-muscle nudge. Mobile port of the web Volume
 *  screen; reads the same pure @hybrid/core engine. */
export default function Volume() {
  if (useTemplate().template === "aurora") return <AuroraVolume />;
  return <ClassicVolume />;
}

function ClassicVolume() {
  const C = useTheme().palette;
  const { t } = useLang();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    fetchSessions().then(setSessions).finally(() => setRefreshing(false));
  };
  useFocusEffect(useCallback(load, []));

  const prefs = useLoggerPrefs();
  const iw = prefs.countWarmupsInVolume;
  const lm = useMemo(() => resolveLandmarks(prefs.landmarkOverrides), [prefs.landmarkOverrides]);
  const fr = prefs.fractionalVolume;
  const rows = useMemo(() => volumeStatus(sessions, { includeWarmups: iw, fractional: fr, landmarks: lm }), [sessions, iw, fr, lm]);
  const advice = useMemo(() => volumeAdvice(sessions, { includeWarmups: iw, fractional: fr, landmarks: lm }), [sessions, iw, fr, lm]);
  const trained = rows.some((r) => r.sets > 0);
  const [editing, setEditing] = useState(false);
  const customized = Object.keys(prefs.landmarkOverrides).length > 0;
  const editField = (m: MuscleGroup, k: keyof VolumeLandmark, raw: string) => {
    const next = { ...prefs.landmarkOverrides, [m]: { ...prefs.landmarkOverrides[m] } };
    if (raw.trim() === "") delete next[m]![k];
    else next[m]![k] = Math.max(0, Math.round(Number(raw) || 0));
    if (!Object.keys(next[m]!).length) delete next[m];
    setLoggerPref("landmarkOverrides", next);
  };

  const ZONE: Record<VolumeZone, { label: string; c: string }> = {
    under: { label: "below MEV", c: C.amber },
    productive: { label: "productive", c: C.lime },
    peak: { label: "near MRV", c: C.blue },
    overreaching: { label: "over MRV", c: C.red },
  };

  const adviceLine = (s: MuscleVolumeStatus): string => {
    if (s.action === "add")
      return `Add ~${Math.round(s.deltaSets)} set${Math.round(s.deltaSets) === 1 ? "" : "s"}/wk — below the minimum to grow${s.maintaining ? " (only maintaining)" : ""}.`;
    if (s.action === "reduce")
      return `Over your recoverable ceiling — drop ~${Math.round(Math.abs(s.deltaSets))} set${Math.round(Math.abs(s.deltaSets)) === 1 ? "" : "s"}/wk or deload.`;
    if (s.action === "progress") return `Productive — room for ~${s.deltaSets} more if recovery allows.`;
    return "Top of your productive range — hold.";
  };

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker>{t("nav.volume")}</Kicker>
        <Pressable onPress={() => setEditing((v) => !v)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: editing || customized ? C.lime : C.line, backgroundColor: editing || customized ? `${C.lime}1a` : "transparent" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: editing || customized ? txt(C, C.lime) : C.ash }}>{editing ? "Done" : customized ? "Landmarks ✎" : "Edit"}</Text>
        </Pressable>
      </View>
      <H1>Volume landmarks</H1>
      <Mono style={{ marginTop: 6, lineHeight: 18 }}>
        Weekly working sets per muscle vs MEV (grow) · MAV (productive) · MRV (ceiling). Warm-ups don&apos;t count. Last
        7 days.
      </Mono>

      {editing && (
        <Card style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Kicker color={C.lime}>Your landmarks · weekly sets</Kicker>
            {customized && (
              <Pressable onPress={() => setLoggerPref("landmarkOverrides", {})}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>Reset</Text>
              </Pressable>
            )}
          </View>
          <View style={{ flexDirection: "row", marginTop: 12, marginBottom: 2 }}>
            <View style={{ width: 96 }} />
            {(["MV", "MEV", "MAVlo", "MAVhi", "MRV"] as const).map((h) => (
              <Text key={h} style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.5 }}>{h}</Text>
            ))}
          </View>
          {ALL_MUSCLES.map((m) => (
            <View key={m} style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
              <Mono color={C.chalk} style={{ width: 96, fontSize: fs.micro }}>{MUSCLE_LABEL[m] ?? m}</Mono>
              {(["mv", "mev", "mavLow", "mavHigh", "mrv"] as const).map((k) => (
                <TextInput
                  key={k}
                  defaultValue={String(lm[m][k])}
                  onEndEditing={(e) => editField(m, k, e.nativeEvent.text)}
                  keyboardType="number-pad"
                  style={{ flex: 1, marginHorizontal: 2, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 6 }}
                />
              ))}
            </View>
          ))}
          <Mono style={{ fontSize: fs.micro, marginTop: 10, lineHeight: 16 }}>
            Tune to your own recovery. Values clamp to a sane order; blank a field to restore its default.
          </Mono>
        </Card>
      )}

      {!trained && (
        <Card style={{ marginTop: 14, alignItems: "center", paddingVertical: 30 }}>
          <Mono color={C.chalk} style={{ textAlign: "center", lineHeight: 19 }}>
            No working strength sets in the last 7 days. Log some lifts and your per-muscle volume — and where it sits
            against MEV/MAV/MRV — shows up here.
          </Mono>
        </Card>
      )}

      {trained && advice.length > 0 && (
        <Card style={{ marginTop: 14 }}>
          <Kicker color={C.lime}>This week — adjust volume</Kicker>
          <View style={{ marginTop: 10, gap: space.sm }}>
            {advice.map((s) => (
              <View key={s.muscle} style={{ flexDirection: "row", gap: space.sm }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, fontWeight: "700", color: s.action === "reduce" ? C.red : C.amber, width: 110 }}>
                  {s.action === "reduce" ? "↓" : "↑"} {MUSCLE_LABEL[s.muscle] ?? s.muscle}
                </Text>
                <Mono style={{ flex: 1, fontSize: fs.caption, lineHeight: 17 }}>{adviceLine(s)}</Mono>
              </View>
            ))}
          </View>
        </Card>
      )}

      {trained && (
        <Card style={{ marginTop: 14 }}>
          <Kicker color={C.blue}>By muscle · sets this week</Kicker>
          <View style={{ marginTop: 14, gap: space.lg }}>
            {rows.map((r) => (
              <LandmarkBar key={r.muscle} s={r} zone={ZONE[r.zone]} />
            ))}
          </View>
        </Card>
      )}
    </Screen>
  );
}

function LandmarkBar({ s, zone }: { s: MuscleVolumeStatus; zone: { label: string; c: string } }) {
  const C = useTheme().palette;
  const max = Math.max(s.landmark.mrv * 1.15, s.sets * 1.05, 1);
  const pct = (v: number): DimensionValue => `${Math.min(100, (v / max) * 100)}%` as DimensionValue;
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
        <Mono color={C.chalk} style={{ fontSize: fs.body }}>{MUSCLE_LABEL[s.muscle] ?? s.muscle}</Mono>
        <Mono style={{ fontSize: fs.caption }}>
          <Text style={{ color: zone.c, fontFamily: F.mono, fontWeight: "700" }}>{s.sets} sets</Text>
          <Text style={{ color: C.ash }}> · {zone.label}</Text>
        </Mono>
      </View>
      <View style={{ height: 12, backgroundColor: C.ink2, borderRadius: 6, borderWidth: 1, borderColor: C.line }}>
        {/* MAV productive band */}
        <View style={{ position: "absolute", left: pct(s.landmark.mev), width: `${Math.max(0, ((s.landmark.mavHigh - s.landmark.mev) / max) * 100)}%` as DimensionValue, top: 0, bottom: 0, backgroundColor: `${C.lime}22` }} />
        {/* filled value */}
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(s.sets), backgroundColor: zone.c, borderRadius: 6, opacity: 0.85 }} />
        {/* MEV + MRV markers */}
        <View style={{ position: "absolute", left: pct(s.landmark.mev), top: -2, bottom: -2, width: 2, backgroundColor: C.amber }} />
        <View style={{ position: "absolute", left: pct(s.landmark.mrv), top: -2, bottom: -2, width: 2, backgroundColor: C.red }} />
      </View>
      <View style={{ flexDirection: "row", gap: space.md, marginTop: 5 }}>
        <Tick c={C.amber} label={`MEV ${s.landmark.mev}`} />
        <Tick c={C.lime} label={`MAV ${s.landmark.mavLow}–${s.landmark.mavHigh}`} />
        <Tick c={C.red} label={`MRV ${s.landmark.mrv}`} />
      </View>
    </View>
  );
}

function Tick({ c, label }: { c: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
      <Mono style={{ fontSize: 9, letterSpacing: 0.5 }}>{label}</Mono>
    </View>
  );
}
