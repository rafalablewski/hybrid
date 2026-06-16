import { useEffect, useMemo, useState } from "react";
import { View, Text, type DimensionValue } from "react-native";
import {
  volumeStatus,
  volumeAdvice,
  type LoggedSession,
  type MuscleVolumeStatus,
  type VolumeZone,
} from "@hybrid/core";
import { fetchSessions } from "../lib/api";
import { useLang } from "../lib/i18n";
import { Screen, Card, Kicker, H1, Mono, F } from "../lib/ui";
import { useTheme } from "../lib/theme";

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
  const C = useTheme().palette;
  const { t } = useLang();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    fetchSessions().then(setSessions).finally(() => setRefreshing(false));
  };
  useEffect(load, []);

  const rows = useMemo(() => volumeStatus(sessions), [sessions]);
  const advice = useMemo(() => volumeAdvice(sessions), [sessions]);
  const trained = rows.some((r) => r.sets > 0);

  const ZONE: Record<VolumeZone, { label: string; c: string }> = {
    under: { label: "below MEV", c: C.amber },
    productive: { label: "productive", c: C.lime },
    peak: { label: "near MRV", c: C.blue },
    overreaching: { label: "over MRV", c: C.red },
  };

  const adviceLine = (s: MuscleVolumeStatus): string => {
    if (s.action === "add")
      return `Add ~${s.deltaSets} set${s.deltaSets === 1 ? "" : "s"}/wk — below the minimum to grow${s.maintaining ? " (only maintaining)" : ""}.`;
    if (s.action === "reduce")
      return `Over your recoverable ceiling — drop ~${Math.abs(s.deltaSets)} set${Math.abs(s.deltaSets) === 1 ? "" : "s"}/wk or deload.`;
    if (s.action === "progress") return `Productive — room for ~${s.deltaSets} more if recovery allows.`;
    return "Top of your productive range — hold.";
  };

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Kicker>{t("nav.volume")}</Kicker>
      <H1>Volume landmarks</H1>
      <Mono style={{ marginTop: 6, lineHeight: 18 }}>
        Weekly working sets per muscle vs MEV (grow) · MAV (productive) · MRV (ceiling). Warm-ups don&apos;t count. Last
        7 days.
      </Mono>

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
          <View style={{ marginTop: 10, gap: 8 }}>
            {advice.map((s) => (
              <View key={s.muscle} style={{ flexDirection: "row", gap: 8 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 13, fontWeight: "700", color: s.action === "reduce" ? C.red : C.amber, width: 110 }}>
                  {s.action === "reduce" ? "↓" : "↑"} {MUSCLE_LABEL[s.muscle] ?? s.muscle}
                </Text>
                <Mono style={{ flex: 1, fontSize: 12, lineHeight: 17 }}>{adviceLine(s)}</Mono>
              </View>
            ))}
          </View>
        </Card>
      )}

      {trained && (
        <Card style={{ marginTop: 14 }}>
          <Kicker color={C.blue}>By muscle · sets this week</Kicker>
          <View style={{ marginTop: 14, gap: 16 }}>
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
        <Mono color={C.chalk} style={{ fontSize: 13 }}>{MUSCLE_LABEL[s.muscle] ?? s.muscle}</Mono>
        <Mono style={{ fontSize: 12 }}>
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
      <View style={{ flexDirection: "row", gap: 12, marginTop: 5 }}>
        <Tick c={C.amber} label={`MEV ${s.landmark.mev}`} />
        <Tick c={C.lime} label={`MAV ${s.landmark.mavLow}–${s.landmark.mavHigh}`} />
        <Tick c={C.red} label={`MRV ${s.landmark.mrv}`} />
      </View>
    </View>
  );
}

function Tick({ c, label }: { c: string; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: c }} />
      <Mono style={{ fontSize: 9, letterSpacing: 0.5 }}>{label}</Mono>
    </View>
  );
}
