import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, type DimensionValue } from "react-native";
import { useRouter } from "expo-router";
import {
  volumeStatus, volumeAdvice, resolveLandmarks, ALL_MUSCLES,
  type LoggedSession, type MuscleVolumeStatus, type VolumeZone, type VolumeLandmark, type MuscleGroup,
} from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLoggerPrefs, setLoggerPref } from "../../lib/logger-prefs";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, ASub, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const MUSCLE_LABEL: Record<string, string> = { quads: "Quads", glutes: "Glutes", posterior: "Posterior chain", back: "Back", chest: "Chest", shoulders: "Shoulders", triceps: "Triceps" };

/** AURORA Volume landmarks — weekly working sets vs MEV/MAV/MRV with the
 *  per-muscle nudge + landmark editor, reusing the exact @hybrid/core engine. */
export default function AuroraVolume() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => { setRefreshing(true); fetchSessions().then(setSessions).finally(() => setRefreshing(false)); };
  useEffect(load, []);

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
    under: { label: "below MEV", c: C.amber }, productive: { label: "productive", c: C.lime },
    peak: { label: "near MRV", c: C.blue }, overreaching: { label: "over MRV", c: C.red },
  };
  const adviceLine = (s: MuscleVolumeStatus): string => {
    if (s.action === "add") return `Add ~${Math.round(s.deltaSets)} set${Math.round(s.deltaSets) === 1 ? "" : "s"}/wk — below the minimum to grow${s.maintaining ? " (only maintaining)" : ""}.`;
    if (s.action === "reduce") return `Over your recoverable ceiling — drop ~${Math.round(Math.abs(s.deltaSets))} set${Math.round(Math.abs(s.deltaSets)) === 1 ? "" : "s"}/wk or deload.`;
    if (s.action === "progress") return `Productive — room for ~${s.deltaSets} more if recovery allows.`;
    return "Top of your productive range — hold.";
  };

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Pressable onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: 26 }}>Volume</AHeading>
        <Pressable onPress={() => setEditing((v) => !v)} style={{ marginLeft: "auto", paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: editing || customized ? C.lime : C.line, backgroundColor: editing || customized ? `${C.lime}1a` : "transparent" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: editing || customized ? txt(C, C.lime) : C.ash }}>{editing ? "Done" : customized ? "Landmarks ✎" : "Edit"}</Text>
        </Pressable>
      </View>
      <ASub style={{ marginTop: 10 }}>Weekly working sets per muscle vs MEV (grow) · MAV (productive) · MRV (ceiling). Warm-ups don&apos;t count. Last 7 days.</ASub>

      {editing && (
        <ACard style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>Your landmarks · weekly sets</Text>
            {customized && <Pressable onPress={() => setLoggerPref("landmarkOverrides", {})}><Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>Reset</Text></Pressable>}
          </View>
          <View style={{ flexDirection: "row", marginTop: 12, marginBottom: 2 }}>
            <View style={{ width: 90 }} />
            {(["MV", "MEV", "MAVlo", "MAVhi", "MRV"] as const).map((h) => (
              <Text key={h} style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.5 }}>{h}</Text>
            ))}
          </View>
          {ALL_MUSCLES.map((m) => (
            <View key={m} style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
              <Text style={{ width: 90, fontFamily: F.mono, fontSize: 11, color: C.chalk }}>{MUSCLE_LABEL[m] ?? m}</Text>
              {(["mv", "mev", "mavLow", "mavHigh", "mrv"] as const).map((k) => (
                <TextInput key={k} defaultValue={String(lm[m][k])} onEndEditing={(e) => editField(m, k, e.nativeEvent.text)} keyboardType="number-pad"
                  style={{ flex: 1, marginHorizontal: 2, textAlign: "center", fontFamily: F.mono, fontSize: 13, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 6 }} />
              ))}
            </View>
          ))}
          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, marginTop: 12, lineHeight: 15 }}>
            Tune to your own recovery. Values clamp to a sane order; blank a field to restore its default.
          </Text>
        </ACard>
      )}

      {!trained && (
        <ACard style={{ marginTop: 14, alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ fontFamily: F.reg, fontSize: 14, color: C.chalk, textAlign: "center", lineHeight: 19 }}>No working strength sets in the last 7 days. Log some lifts and your per-muscle volume — and where it sits against MEV/MAV/MRV — shows up here.</Text>
        </ACard>
      )}

      {trained && advice.length > 0 && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>This week — adjust volume</Text>
          <View style={{ marginTop: 10, gap: 9 }}>
            {advice.map((s) => (
              <View key={s.muscle} style={{ flexDirection: "row", gap: 8 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 13, fontWeight: "700", color: txt(C, s.action === "reduce" ? C.red : C.amber), width: 110 }}>{s.action === "reduce" ? "↓" : "↑"} {MUSCLE_LABEL[s.muscle] ?? s.muscle}</Text>
                <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 12, color: C.ash, lineHeight: 17 }}>{adviceLine(s)}</Text>
              </View>
            ))}
          </View>
        </ACard>
      )}

      {trained && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>By muscle · sets this week</Text>
          <View style={{ marginTop: 14, gap: 16 }}>
            {rows.map((r) => <LandmarkBar key={r.muscle} s={r} zone={ZONE[r.zone]} />)}
          </View>
        </ACard>
      )}
    </AuroraScreen>
  );
}

function LandmarkBar({ s, zone }: { s: MuscleVolumeStatus; zone: { label: string; c: string } }) {
  const { palette: C } = useTheme();
  const max = Math.max(s.landmark.mrv * 1.15, s.sets * 1.05, 1);
  const pct = (v: number): DimensionValue => `${Math.min(100, (v / max) * 100)}%` as DimensionValue;
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.chalk }}>{MUSCLE_LABEL[s.muscle] ?? s.muscle}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 12 }}>
          <Text style={{ color: txt(C, zone.c), fontWeight: "700" }}>{s.sets} sets</Text>
          <Text style={{ color: C.ash }}> · {zone.label}</Text>
        </Text>
      </View>
      <View style={{ height: 12, backgroundColor: C.ink, borderRadius: 6, borderWidth: 1, borderColor: C.line }}>
        <View style={{ position: "absolute", left: pct(s.landmark.mev), width: `${Math.max(0, ((s.landmark.mavHigh - s.landmark.mev) / max) * 100)}%` as DimensionValue, top: 0, bottom: 0, backgroundColor: `${C.lime}22` }} />
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(s.sets), backgroundColor: zone.c, borderRadius: 6, opacity: 0.85 }} />
        <View style={{ position: "absolute", left: pct(s.landmark.mev), top: -2, bottom: -2, width: 2, backgroundColor: C.amber }} />
        <View style={{ position: "absolute", left: pct(s.landmark.mrv), top: -2, bottom: -2, width: 2, backgroundColor: C.red }} />
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 5 }}>
        <Tick c={C.amber} label={`MEV ${s.landmark.mev}`} />
        <Tick c={C.lime} label={`MAV ${s.landmark.mavLow}–${s.landmark.mavHigh}`} />
        <Tick c={C.red} label={`MRV ${s.landmark.mrv}`} />
      </View>
    </View>
  );
}

function Tick({ c, label }: { c: string; label: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}
