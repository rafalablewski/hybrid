import { useCallback, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import {
  sessionBuckets,
  weeklyRecap,
  computePerformanceState,
  personalTrainingLog,
  toBiometrics,
  type StatRange,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions, fetchSignals, type CoreSignal } from "../lib/api";
import { useBodyweightLookup } from "../lib/use-bodyweight";
import { useTheme, txt } from "../lib/theme";
import { leading, fs, space, F } from "../lib/ui";
import { AuroraScreen, ACard, ASegment, RADIUS } from "../components/aurora/kit";
import { AuroraIcon } from "../components/aurora/icons";

const RANGES: { id: StatRange; label: string }[] = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
];

/** AURORA Statistics — real training stats (sessions + HPI) in the Figma layout:
 *  a Week/Month/Year segmented control, a bar chart of session activity, and
 *  summary cards. All values are computed from the athlete's logged sessions. */
export default function Statistics() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const [range, setRange] = useState<StatRange>("week");
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);

  const load = useCallback(() => {
    Promise.all([fetchSessions(), fetchSignals()]).then(([s, sig]) => {
      setSessions(s);
      setSignals(sig);
    });
  }, []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const buckets = useMemo(() => sessionBuckets(sessions, range), [sessions, range]);
  const bw = useBodyweightLookup();
  const recap = useMemo(() => weeklyRecap(sessions, Date.now(), bw), [sessions, bw]);
  const state = useMemo(() => {
    const bio = toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]);
    return computePerformanceState(personalTrainingLog(sessions), bio);
  }, [sessions, signals]);
  const hasData = sessions.length > 0;
  const maxVal = Math.max(1, ...buckets.buckets.map((b) => b.value));

  return (
    <AuroraScreen hero={{ rank: "title", title: "Your Statistics" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
        <View style={{ alignItems: "flex-end", marginTop: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>Weekly volume</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs, marginTop: 2 }}>
            <AuroraIcon name="arrow-up" size={16} color={txt(C, C.lime)} />
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{Math.round(recap.volume)} kg</Text>
          </View>
        </View>
      </View>

      <View style={{ marginTop: 18 }}>
        <ASegment options={RANGES} value={range} onPick={setRange} />
      </View>

      {/* Bar chart */}
      <ACard style={{ marginTop: 18, paddingBottom: 26 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>Sessions</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{buckets.total} in {range}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", height: 130, marginTop: 16, gap: 7 }}>
          {buckets.buckets.map((b, i) => (
            <View key={i} style={{ flex: 1, alignItems: "center", gap: space.xs }}>
              <View
                style={{
                  width: "100%",
                  height: Math.max(4, (b.value / maxVal) * 104),
                  borderRadius: 6,
                  backgroundColor: i === buckets.peakIndex ? C.lime : C.line,
                }}
              />
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{b.label}</Text>
            </View>
          ))}
        </View>
      </ACard>

      {/* Summary cards */}
      <View style={{ flexDirection: "row", gap: space.md, marginTop: 4 }}>
        <Mini icon="verified" label="Active days" value={hasData ? String(buckets.activeDays) : "—"} color={C.lime} />
        <Mini icon="heart" label="HPI" value={hasData ? String(state.hpi.score) : "—"} color={C.lime} />
      </View>
      <View style={{ flexDirection: "row", gap: space.md, marginTop: 12 }}>
        <Mini icon="navigation" label="Distance" value={hasData ? `${recap.distanceKm.toFixed(1)} km` : "—"} color={C.lime} />
        <Mini icon="play" label="Minutes" value={hasData ? String(Math.round(recap.minutes)) : "—"} color={C.lime} />
      </View>

      {!hasData && (
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, textAlign: "center", marginTop: 18, lineHeight: leading(fs.body) }}>
          Log a few workouts and your real training stats fill in here.
        </Text>
      )}
    </AuroraScreen>
  );
}

function Mini({ icon, label, value, color }: { icon: Parameters<typeof AuroraIcon>[0]["name"]; label: string; value: string; color: string }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.card, padding: 16 }}>
      <AuroraIcon name={icon} size={22} color={txt(C, color)} />
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 8 }}>{label}</Text>
      <Text style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk, marginTop: 2 }}>{value}</Text>
    </View>
  );
}
