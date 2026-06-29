import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import {
  computePerformanceState, computeInjuryRisk, performanceTrajectory, toTrainingLog, toBiometrics,
  hpiRole, riskRole,
  type LoggedSession,
} from "@hybrid/core";
import { fetchSessions, fetchSignals, type CoreSignal } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";
import RtpPanel from "./rtp-panel";

type Palette = ReturnType<typeof useTheme>["palette"];
const hpiColor = (b: string, C: Palette) => roleColor(C, hpiRole(b));
const riskColor = (b: string, C: Palette) => roleColor(C, riskRole(b));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** AURORA Performance — the Performance State (HPI cockpit, 14-day trajectory,
 *  tissue injury risk) reusing the exact engines as the classic. */
export default function AuroraPerformance() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    Promise.all([fetchSessions(), fetchSignals()]).then(([s, sig]) => { setSessions(s); setSignals(sig); }).finally(() => setRefreshing(false));
  };
  useEffect(() => { load(); }, []);

  const bio = useMemo(() => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]), [signals]);
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const traj = useMemo(() => performanceTrajectory(log, 14), [log]);

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
      <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")} onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
        <AuroraIcon name="back" size={20} color={C.chalk} />
      </Pressable>
      <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.perf.title")}</AHeading>
    </View>
  );

  if (sessions.length === 0) {
    return (
      <AuroraScreen refreshing={refreshing} onRefresh={load}>
        {header}
        <ACard style={{ marginTop: 16 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, lineHeight: 20 }}>{t("w.analyze.perf.emptyBody")}</Text>
        </ACard>
      </AuroraScreen>
    );
  }

  const maxBar = 96;

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {header}

      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.analyze.perf.twinHpi")}</Text>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.md, marginTop: 4 }}>
          <Text style={{ fontFamily: F.black, fontSize: 52, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
          <View>
            <View style={{ backgroundColor: `${hpiColor(state.hpi.band, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4, alignSelf: "flex-start" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.band}</Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 4 }}>{t("w.analyze.perf.limiter")} · {state.hpi.limiter}</Text>
          </View>
        </View>
        <View style={{ marginTop: 14, gap: space.ms }}>
          {([
            [t("w.analyze.perf.strength"), state.hpi.components.strength, C.lime] as const,
            [t("w.analyze.perf.endurance"), state.hpi.components.endurance, C.lime] as const,
            [t("w.analyze.perf.recovery"), Math.max(0, Math.min(100, Math.round(50 + state.hpi.components.recovery * (50 / 15)))), C.lime] as const,
          ]).map(([l, v, col]) => (
            <View key={l}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{l}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, col) }}>{v}</Text>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.ink, marginTop: 3, overflow: "hidden" }}>
                <View style={{ width: `${v}%`, height: "100%", backgroundColor: col }} />
              </View>
            </View>
          ))}
        </View>
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 12, lineHeight: 18 }}>{state.summary}</Text>
      </ACard>

      <ACard style={{ marginTop: 14 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.analyze.perf.trajectory")}</Text>
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: maxBar + 6, marginTop: 12 }}>
          {traj.map((p) => (
            <View key={p.daysAgo} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
              <View style={{ width: "100%", height: Math.max(2, (p.hpi / 100) * maxBar), backgroundColor: p.daysAgo === 0 ? C.lime : `${C.lime}66`, borderRadius: 3 }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>-13d</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.analyze.perf.today")} · HPI {traj[traj.length - 1]?.hpi ?? "—"}</Text>
        </View>
      </ACard>

      <ACard style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.red) }}>{t("w.analyze.perf.injuryRisk")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.analyze.perf.model")} {risk.modelVersion}</Text>
        </View>
        <View style={{ marginTop: 10 }}>
          {risk.tissues.map((t) => (
            <View key={t.tissue} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, flex: 1 }}>{cap(t.tissue)}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: t.risk > 0 ? C.chalk : C.ash, width: 70, textAlign: "right" }}>{(t.prob * 100).toFixed(1)}%</Text>
              <View style={{ width: 56, alignItems: "flex-end" }}>
                <View style={{ backgroundColor: `${(t.risk > 0 ? riskColor(t.band, C) : C.ash)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, t.risk > 0 ? riskColor(t.band, C) : C.ash) }}>{t.risk}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ACard>

      <RtpPanel />
    </AuroraScreen>
  );
}
