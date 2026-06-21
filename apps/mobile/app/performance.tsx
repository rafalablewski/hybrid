import { useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  computePerformanceState,
  computeInjuryRisk,
  performanceTrajectory,
  toTrainingLog,
  toBiometrics,
  hpiRole,
  riskRole,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions, fetchSignals, type CoreSignal } from "../lib/api";
import { fs, space, Screen, Card, Kicker, Mono, H1, Chip, F } from "../lib/ui";
import { useTheme, txt, roleColor } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraPerformance from "../components/aurora/performance";

type Palette = ReturnType<typeof useTheme>["palette"];
const hpiColor = (b: string, C: Palette) => roleColor(C, hpiRole(b));
const riskColor = (b: string, C: Palette) => roleColor(C, riskRole(b));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Performance — the Performance State: HPI cockpit, 14-day trajectory, tissue-level
 *  injury risk. Mobile port of the web Performance screen. */
export default function Performance() {
  if (useTemplate().template === "aurora") return <AuroraPerformance />;
  return <ClassicPerformance />;
}

function ClassicPerformance() {
  const C = useTheme().palette;
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    Promise.all([fetchSessions(), fetchSignals()])
      .then(([s, sig]) => { setSessions(s); setSignals(sig); })
      .finally(() => setRefreshing(false));
  };
  useEffect(() => { load(); }, []);

  const bio = useMemo(() => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]), [signals]);
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const traj = useMemo(() => performanceTrajectory(log, 14), [log]);

  if (sessions.length === 0) {
    return (
      <Screen refreshing={refreshing} onRefresh={load}>
        <Kicker>Performance State</Kicker>
        <H1>No training data yet</H1>
        <Card style={{ marginTop: 14 }}>
          <Mono color={C.chalk} style={{ lineHeight: 20 }}>
            Log a session and your Performance State — HPI, readiness, fatigue and tissue-level injury
            risk — appears here, computed from your real training.
          </Mono>
        </Card>
      </Screen>
    );
  }

  const maxBar = 96;

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Kicker>Performance State</Kicker>
      <H1>Your state</H1>

      {/* HPI cockpit */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: hpiColor(state.hpi.band, C), marginTop: 14 }}>
        <Kicker color={C.blue}>HPI</Kicker>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.ms, marginTop: 4 }}>
          <Text style={{ fontFamily: F.black, fontSize: 52, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
          <View>
            <Chip color={hpiColor(state.hpi.band, C)}>{state.hpi.band}</Chip>
            <Mono color={C.ash} style={{ marginTop: 4, fontSize: fs.micro }}>limiter · {state.hpi.limiter}</Mono>
          </View>
        </View>
        <View style={{ marginTop: 14, gap: space.ms }}>
          {([
            ["Strength", state.hpi.components.strength, C.lime] as const,
            ["Endurance", state.hpi.components.endurance, C.blue] as const,
            ["Recovery", Math.max(0, Math.min(100, Math.round(50 + state.hpi.components.recovery * (50 / 15)))), C.violet] as const,
          ]).map(([l, v, col]) => (
            <View key={l}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Mono color={C.ash} style={{ fontSize: fs.micro }}>{l}</Mono>
                <Mono color={col} style={{ fontSize: fs.micro }}>{v}</Mono>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.ink2, marginTop: 3, overflow: "hidden" }}>
                <View style={{ width: `${v}%`, height: "100%", backgroundColor: col }} />
              </View>
            </View>
          ))}
        </View>
        <Mono color={C.chalk} style={{ marginTop: 12, lineHeight: 18 }}>{state.summary}</Mono>
      </Card>

      {/* 14-day HPI trajectory — dependency-free bars (newest at the right) */}
      <Card style={{ marginTop: 14 }}>
        <Kicker>Trajectory · last 14 days</Kicker>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: maxBar + 6, marginTop: 12 }}>
          {traj.map((p) => (
            <View key={p.daysAgo} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
              <View style={{ width: "100%", height: Math.max(2, (p.hpi / 100) * maxBar), backgroundColor: p.daysAgo === 0 ? C.lime : `${C.lime}66`, borderRadius: 2 }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Mono color={C.ash} style={{ fontSize: fs.nano }}>-13d</Mono>
          <Mono color={C.ash} style={{ fontSize: fs.nano }}>today · HPI {traj[traj.length - 1]?.hpi ?? "—"}</Mono>
        </View>
      </Card>

      {/* Injury risk · tissue table */}
      <Card style={{ borderLeftWidth: 3, borderLeftColor: C.red, marginTop: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Kicker color={C.red}>Injury risk · tissue</Kicker>
          <Mono color={C.ash} style={{ fontSize: fs.nano }}>model {risk.modelVersion}</Mono>
        </View>
        <View style={{ marginTop: 10 }}>
          {risk.tissues.map((t) => (
            <View key={t.tissue} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{cap(t.tissue)}</Text>
              <Mono color={t.risk > 0 ? C.chalk : C.ash} style={{ width: 70, textAlign: "right", fontSize: fs.caption }}>{(t.prob * 100).toFixed(1)}%</Mono>
              <View style={{ width: 64, alignItems: "flex-end" }}>
                <Chip color={t.risk > 0 ? riskColor(t.band, C) : C.ash}>{t.risk}</Chip>
              </View>
            </View>
          ))}
        </View>
      </Card>
      <View style={{ height: 16 }} />
    </Screen>
  );
}
