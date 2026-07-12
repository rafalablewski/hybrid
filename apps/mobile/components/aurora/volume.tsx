import { useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, type DimensionValue } from "react-native";
import { useRouter } from "expo-router";
import {
  volumeStatus, volumeAdvice, resolveLandmarks, ALL_MUSCLES,
  type LoggedSession, type MuscleVolumeStatus, type VolumeZone, type VolumeLandmark, type MuscleGroup,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLoggerPrefs, setLoggerPref } from "../../lib/logger-prefs";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, AHeading, ASub, RADIUS } from "./kit";

const MUSCLE_KEY: Record<string, string> = { quads: "w.analyze.vol.muscleQuads", glutes: "w.analyze.vol.muscleGlutes", posterior: "w.analyze.vol.musclePosteriorChain", back: "w.analyze.vol.muscleBack", chest: "w.analyze.vol.muscleChest", shoulders: "w.analyze.vol.muscleShoulders", triceps: "w.analyze.vol.muscleTriceps" };

/** AURORA Volume landmarks — weekly working sets vs MEV/MAV/MRV with the
 *  per-muscle nudge + landmark editor, reusing the exact @hybrid/core engine. */
export default function AuroraVolume() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  const router = useRouter();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();

  const load = () => refetch();
  useRefreshOnFocus(refetch);

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
    under: { label: t("w.analyze.vol.zoneUnder"), c: C.amber }, productive: { label: t("w.analyze.vol.zoneProductive"), c: C.lime },
    peak: { label: t("w.analyze.vol.zonePeak"), c: C.blue }, overreaching: { label: t("w.analyze.vol.zoneOver"), c: C.red },
  };
  const adviceLine = (s: MuscleVolumeStatus): string => {
    if (s.action === "add") { const n = Math.round(s.deltaSets); return `${t("w.analyze.vol.adviceAddPre")}${n} ${n === 1 ? t("w.analyze.vol.adviceAddSet") : t("w.analyze.vol.adviceAddSets")}${t("w.analyze.vol.adviceAddTail")}${s.maintaining ? t("w.analyze.vol.adviceMaintaining") : ""}.`; }
    if (s.action === "reduce") { const n = Math.round(Math.abs(s.deltaSets)); return `${t("w.analyze.vol.adviceReducePre")}${n} ${n === 1 ? t("w.analyze.vol.adviceAddSet") : t("w.analyze.vol.adviceAddSets")}${t("w.analyze.vol.adviceReduceTail")}`; }
    if (s.action === "progress") return `${t("w.analyze.vol.adviceProgressPre")}${s.deltaSets}${t("w.analyze.vol.adviceProgressTail")}`;
    return t("w.analyze.vol.adviceHold");
  };

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.vol.title")}</AHeading>
        <Pressable onPress={() => setEditing((v) => !v)} style={{ marginLeft: "auto", paddingHorizontal: 14, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: editing || customized ? C.lime : C.line, backgroundColor: editing || customized ? `${C.lime}1a` : "transparent" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: editing || customized ? txt(C, C.lime) : C.ash }}>{editing ? t("w.analyze.vol.done") : customized ? t("w.analyze.vol.landmarksEdit") : t("w.analyze.vol.editLandmarks")}</Text>
        </Pressable>
      </View>
      <ASub style={{ marginTop: 10 }}>{t("w.analyze.vol.subtitle")}</ASub>

      {editing && (
        <ACard style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.vol.yourLandmarks")}</Text>
            {customized && <Pressable onPress={() => setLoggerPref("landmarkOverrides", {})}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("w.analyze.vol.resetDefaults")}</Text></Pressable>}
          </View>
          <View style={{ flexDirection: "row", marginTop: 12, marginBottom: 2 }}>
            <View style={{ width: 90 }} />
            {(["MV", "MEV", "MAVlo", "MAVhi", "MRV"] as const).map((h) => (
              <Text key={h} style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: 8, color: C.ash, letterSpacing: 0.5 }}>{h}</Text>
            ))}
          </View>
          {ALL_MUSCLES.map((m) => (
            <View key={m} style={{ flexDirection: "row", alignItems: "center", marginTop: 6 }}>
              <Text style={{ width: 90, fontFamily: F.mono, fontSize: fs.micro, color: C.chalk }}>{ml(m)}</Text>
              {(["mv", "mev", "mavLow", "mavHigh", "mrv"] as const).map((k) => (
                <TextInput key={k} defaultValue={String(lm[m][k])} onEndEditing={(e) => editField(m, k, e.nativeEvent.text)} keyboardType="number-pad"
                  style={{ flex: 1, marginHorizontal: 2, textAlign: "center", fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 8, paddingVertical: 6 }} />
              ))}
            </View>
          ))}
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 12, lineHeight: 15 }}>
            {t("w.analyze.vol.landmarksHelp")}
          </Text>
        </ACard>
      )}

      {!trained && (
        <ACard style={{ marginTop: 14, alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, textAlign: "center", lineHeight: 19 }}>{t("w.analyze.vol.empty")}</Text>
        </ACard>
      )}

      {trained && advice.length > 0 && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.analyze.vol.adjust")}</Text>
          <View style={{ marginTop: 10, gap: 9 }}>
            {advice.map((s) => (
              <View key={s.muscle} style={{ flexDirection: "row", gap: space.sm }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, fontWeight: "700", color: txt(C, s.action === "reduce" ? C.red : C.amber), width: 110 }}>{s.action === "reduce" ? "↓" : "↑"} {ml(s.muscle)}</Text>
                <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: 17 }}>{adviceLine(s)}</Text>
              </View>
            ))}
          </View>
        </ACard>
      )}

      {trained && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.analyze.vol.byMuscle")}</Text>
          <View style={{ marginTop: 14, gap: space.lg }}>
            {rows.map((r) => <LandmarkBar key={r.muscle} s={r} zone={ZONE[r.zone]} />)}
          </View>
        </ACard>
      )}
    </AuroraScreen>
  );
}

function LandmarkBar({ s, zone }: { s: MuscleVolumeStatus; zone: { label: string; c: string } }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const ml = (m: string) => (MUSCLE_KEY[m] ? t(MUSCLE_KEY[m]) : m);
  const max = Math.max(s.landmark.mrv * 1.15, s.sets * 1.05, 1);
  const pct = (v: number): DimensionValue => `${Math.min(100, (v / max) * 100)}%` as DimensionValue;
  return (
    <View>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 5 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{ml(s.muscle)}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption }}>
          <Text style={{ color: txt(C, zone.c), fontWeight: "700" }}>{s.sets} {t("w.analyze.vol.sets")}</Text>
          <Text style={{ color: C.ash }}> – {zone.label}</Text>
        </Text>
      </View>
      <View style={{ height: 12, backgroundColor: C.ink, borderRadius: 6, borderWidth: 1, borderColor: C.line }}>
        <View style={{ position: "absolute", left: pct(s.landmark.mev), width: `${Math.max(0, ((s.landmark.mavHigh - s.landmark.mev) / max) * 100)}%` as DimensionValue, top: 0, bottom: 0, backgroundColor: `${C.lime}22` }} />
        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(s.sets), backgroundColor: zone.c, borderRadius: 6, opacity: 0.85 }} />
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
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 0.5 }}>{label}</Text>
    </View>
  );
}
