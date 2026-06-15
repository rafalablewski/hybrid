import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession,
  computePerformanceState,
  runTotals,
  toTrainingLog,
  toBiometrics,
  velocityProfiles,
  SPORTS,
  LEVELS,
  type LoggedSession,
  type Macrocycle,
} from "@hybrid/core";
import { fetchSessions, fetchMacrocycle, fetchSignals, type CoreSignal } from "../lib/api";
import { Screen, Card, Kicker, Mono, H1, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

const hpiColor = (b: string, C: ReturnType<typeof useTheme>["palette"]) =>
  b === "peak" || b === "primed" ? C.lime : b === "moderate" ? C.blue : b === "compromised" ? C.amber : C.red;

/**
 * The Athlete Cockpit — one screen that assembles the athlete's scattered depth
 * into a coherent path: goal/season → today's route → performance → sport →
 * velocity/technique → endurance. Each section shows a LIVE snapshot off the
 * athlete's real data and links out to the deep screen. (Phase 2.)
 */
export default function Cockpit() {
  const C = useTheme().palette;
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [macro, setMacro] = useState<Macrocycle | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [sport, setSport] = useState<{ sport: string; levelIdx: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    Promise.all([fetchSessions(), fetchMacrocycle(), fetchSignals()])
      .then(([s, m, sig]) => {
        setSessions(s);
        setMacro(m?.macro ?? null);
        setCurrentWeek(m?.currentWeek ?? 1);
        setSignals(sig);
      })
      .finally(() => {
        setLoading(false);
        setRefreshing(false);
      });
  };
  useEffect(() => {
    load();
    AsyncStorage.getItem("hybrid.sport")
      .then((raw) => {
        if (!raw) return;
        const s = JSON.parse(raw) as { sport?: string; levelIdx?: number } | null;
        if (s?.sport && SPORTS[s.sport]) {
          const lvl = typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length ? s.levelIdx : 0;
          setSport({ sport: s.sport, levelIdx: lvl });
        }
      })
      .catch(() => {});
  }, []);

  const bio = useMemo(
    () => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]),
    [signals],
  );
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles: velocityProfiles(sessions) }), [log, bio, sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const totals = useMemo(() => runTotals(sessions), [sessions]);
  const hasData = sessions.length > 0;

  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <Kicker>Athlete cockpit</Kicker>
      <H1>Your command center</H1>
      <Mono style={{ marginTop: 6 }}>Goal → season → today → performance → technique, in one place.</Mono>

      {/* 1 · GOAL & SEASON */}
      <Section
        C={C}
        kicker="Goal & season"
        color={C.violet}
        onOpen={() => router.push(macro ? "/calendar" : "/onboarding")}
        openLabel={macro ? "Calendar →" : "Set up a plan →"}
      >
        {macro ? (
          <>
            <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk }}>{macro.goalOrSport}</Text>
            <Mono color={C.ash} style={{ marginTop: 4 }}>
              {phaseBlock ? `${phaseBlock.label} · ` : ""}week {currentWeek}/{macro.totalWeeks}
              {macro.eventInWeeks != null ? ` · event in ${macro.eventInWeeks} wk` : ""}
            </Mono>
          </>
        ) : (
          <Mono color={C.chalk} style={{ lineHeight: 19 }}>No season yet — enroll a goal and your periodized plan drives the weeks.</Mono>
        )}
      </Section>

      {/* 2 · TODAY'S ROUTE */}
      <Section
        C={C}
        kicker={hasData ? `Today · readiness ${rx.readiness}/100` : "Today"}
        color={C.lime}
        onOpen={() => router.push((hasData ? "/workout?source=ai" : "/workout?source=empty") as Href)}
        openLabel={hasData ? "Start session →" : "Start your first →"}
      >
        <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>
          {hasData ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : "Log a session to calibrate your route"}
        </Text>
        {hasData && <Mono color={C.ash} style={{ marginTop: 4, lineHeight: 18 }}>{rx.why}</Mono>}
      </Section>

      {/* 3 · PERFORMANCE (Twin / HPI) */}
      <Section C={C} kicker="Performance · Athlete Twin" color={C.blue} onOpen={() => router.push("/(tabs)")} openLabel="Today →">
        {hasData ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
              <Text style={{ fontFamily: F.black, fontSize: 32, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>HPI · {state.hpi.band} · limiter {state.hpi.limiter}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
              <Mono color={C.lime}>STR {state.hpi.components.strength}</Mono>
              <Mono color={C.blue}>END {state.hpi.components.endurance}</Mono>
              <Mono color={C.violet}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Mono>
            </View>
            {state.drivers[0] && <Mono color={C.chalk} style={{ marginTop: 6, lineHeight: 18 }}>{state.drivers[0].detail}</Mono>}
          </>
        ) : (
          <Mono color={C.chalk} style={{ lineHeight: 19 }}>Your HPI, readiness and tissue load build from real training — log a session.</Mono>
        )}
      </Section>

      {/* 4 · SPORT */}
      <Section
        C={C}
        kicker="Sport S&C"
        color={C.amber}
        onOpen={() => router.push("/(tabs)/sport")}
        openLabel="Sport →"
      >
        {sport ? (
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.chalk }}>{sport.sport} · {LEVELS[sport.levelIdx]}</Text>
        ) : (
          <Mono color={C.chalk} style={{ lineHeight: 19 }}>Pick your sport — the engine ranks the strength & conditioning that transfers.</Mono>
        )}
      </Section>

      {/* 5 · VELOCITY / TECHNIQUE */}
      <Section C={C} kicker="Velocity & technique" color={C.blue} onOpen={() => router.push("/(tabs)/velocity")} openLabel="Velocity →">
        <Mono color={C.chalk} style={{ lineHeight: 19 }}>
          Bar speed → a velocity-estimated 1RM and autoregulated load. Log m/s per set to light it up.
        </Mono>
      </Section>

      {/* 6 · ENDURANCE */}
      <Section
        C={C}
        kicker="Endurance"
        color={C.lime}
        onOpen={() => router.push("/(tabs)/running")}
        openLabel="Running →"
      >
        {totals.efforts > 0 ? (
          <View style={{ flexDirection: "row", gap: 16 }}>
            <Stat C={C} label="efforts" value={`${totals.efforts}`} />
            <Stat C={C} label="km" value={totals.distanceKm.toLocaleString()} />
            <Stat C={C} label="min" value={totals.minutes.toLocaleString()} />
          </View>
        ) : (
          <Mono color={C.chalk} style={{ lineHeight: 19 }}>Log a run (distance + minutes) and your mileage, pace zones and PRs appear.</Mono>
        )}
      </Section>

      {loading && <Mono style={{ marginTop: 8, textAlign: "center" }}>Loading your data…</Mono>}
      <View style={{ height: 16 }} />
    </Screen>
  );
}

function Section({
  C,
  kicker,
  color,
  children,
  onOpen,
  openLabel,
}: {
  C: ReturnType<typeof useTheme>["palette"];
  kicker: string;
  color: string;
  children: React.ReactNode;
  onOpen: () => void;
  openLabel: string;
}) {
  return (
    <Card style={{ borderLeftWidth: 3, borderLeftColor: color, marginTop: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Kicker color={color}>{kicker}</Kicker>
        <Pressable onPress={onOpen}>
          <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, color) }}>{openLabel}</Text>
        </Pressable>
      </View>
      {children}
    </Card>
  );
}

function Stat({ C, label, value }: { C: ReturnType<typeof useTheme>["palette"]; label: string; value: string }) {
  return (
    <View>
      <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk }}>{value}</Text>
      <Mono color={C.ash} style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>{label}</Mono>
    </View>
  );
}
