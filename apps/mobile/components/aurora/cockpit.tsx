import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession, computePerformanceState, runTotals, toTrainingLog, toBiometrics,
  velocityProfiles, SPORTS, LEVELS, type LoggedSession, type Macrocycle,
} from "@hybrid/core";
import { fetchSessions, fetchMacrocycle, fetchSignals, type CoreSignal } from "../../lib/api";
import { useSession } from "../../lib/session";
import { usePersona, setClientPersona } from "../../lib/persona";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, ASub, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

type Palette = ReturnType<typeof useTheme>["palette"];
const hpiColor = (b: string, C: Palette) => (b === "peak" || b === "primed" ? C.lime : b === "moderate" ? C.blue : b === "compromised" ? C.amber : C.red);

/** AURORA Athlete Cockpit — same live snapshots (goal/season → route →
 *  performance → sport → velocity → endurance) + freemium teaser as the classic. */
export default function AuroraCockpit() {
  const persona = usePersona();
  const { entitlement } = useSession();
  const router = useRouter();
  if (persona === "casual") {
    return <Teaser paid={entitlement === "paid"} onUnlock={() => (entitlement === "paid" ? setClientPersona("athlete") : router.push("/upgrade"))} />;
  }
  return <Full />;
}

function Full() {
  const { palette: C } = useTheme();
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [macro, setMacro] = useState<Macrocycle | null>(null);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [signals, setSignals] = useState<CoreSignal[]>([]);
  const [sport, setSport] = useState<{ sport: string; levelIdx: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = () => {
    setRefreshing(true);
    Promise.all([fetchSessions(), fetchMacrocycle(), fetchSignals()])
      .then(([s, m, sig]) => { setSessions(s); setMacro(m?.macro ?? null); setCurrentWeek(m?.currentWeek ?? 1); setSignals(sig); })
      .finally(() => setRefreshing(false));
  };
  useEffect(() => {
    load();
    AsyncStorage.getItem("hybrid.sport").then((raw) => {
      if (!raw) return;
      const s = JSON.parse(raw) as { sport?: string; levelIdx?: number } | null;
      if (s?.sport && SPORTS[s.sport]) {
        const lvl = typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length ? s.levelIdx : 0;
        setSport({ sport: s.sport, levelIdx: lvl });
      }
    }).catch(() => {});
  }, []);

  const bio = useMemo(() => toBiometrics(signals as unknown as Parameters<typeof toBiometrics>[0]), [signals]);
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles: velocityProfiles(sessions) }), [log, bio, sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const totals = useMemo(() => runTotals(sessions), [sessions]);
  const hasData = sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <AHeading style={{ fontSize: 28 }}>Your command center</AHeading>
      <ASub style={{ marginTop: 8 }}>Goal → season → today → performance → technique, in one place.</ASub>

      <Section C={C} title="Goal & season" color={C.violet} openLabel={macro ? "Periodize" : "Set up"} onOpen={() => router.push(macro ? "/periodize" : "/onboarding")}>
        {macro ? (
          <>
            <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk }}>{macro.goalOrSport}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash, marginTop: 4 }}>{phaseBlock ? `${phaseBlock.label} · ` : ""}week {currentWeek}/{macro.totalWeeks}{macro.eventInWeeks != null ? ` · event in ${macro.eventInWeeks} wk` : ""}</Text>
          </>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.chalk, lineHeight: 19 }}>No season yet — enroll a goal and your periodized plan drives the weeks.</Text>
        )}
      </Section>

      <Section C={C} title={hasData ? `Today · readiness ${rx.readiness}/100` : "Today"} color={C.lime} openLabel={hasData ? "Start" : "Start first"} onOpen={() => router.push((hasData ? "/workout?source=ai" : "/workout?source=empty") as Href)}>
        <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{hasData ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : "Log a session to calibrate your route"}</Text>
        {hasData && <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.ash, marginTop: 4, lineHeight: 18 }}>{rx.why}</Text>}
      </Section>

      <Section C={C} title="Performance · Athlete Twin" color={C.blue} openLabel="Performance" onOpen={() => router.push("/performance")}>
        {hasData ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 10 }}>
              <Text style={{ fontFamily: F.black, fontSize: 32, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>HPI · {state.hpi.band} · limiter {state.hpi.limiter}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.lime) }}>STR {state.hpi.components.strength}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.blue) }}>END {state.hpi.components.endurance}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.violet) }}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Text>
            </View>
            {state.drivers[0] && <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.chalk, marginTop: 6, lineHeight: 18 }}>{state.drivers[0].detail}</Text>}
          </>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.chalk, lineHeight: 19 }}>Your HPI, readiness and tissue load build from real training — log a session.</Text>
        )}
      </Section>

      <Section C={C} title="Sport S&C" color={C.amber} openLabel="Sport" onOpen={() => router.push("/(tabs)/sport")}>
        {sport ? (
          <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.chalk }}>{sport.sport} · {LEVELS[sport.levelIdx]}</Text>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.chalk, lineHeight: 19 }}>Pick your sport — the engine ranks the strength & conditioning that transfers.</Text>
        )}
      </Section>

      <Section C={C} title="Velocity & technique" color={C.blue} openLabel="Velocity" onOpen={() => router.push("/(tabs)/velocity")}>
        <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.chalk, lineHeight: 19 }}>Bar speed → a velocity-estimated 1RM and autoregulated load. Log m/s per set to light it up.</Text>
      </Section>

      <Section C={C} title="Endurance" color={C.lime} openLabel="Running" onOpen={() => router.push("/(tabs)/running")}>
        {totals.efforts > 0 ? (
          <View style={{ flexDirection: "row", gap: 18 }}>
            <Stat C={C} label="efforts" value={`${totals.efforts}`} />
            <Stat C={C} label="km" value={totals.distanceKm.toLocaleString()} />
            <Stat C={C} label="min" value={totals.minutes.toLocaleString()} />
          </View>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.chalk, lineHeight: 19 }}>Log a run (distance + minutes) and your mileage, pace zones and PRs appear.</Text>
        )}
      </Section>
    </AuroraScreen>
  );
}

function Section({ C, title, color, children, onOpen, openLabel }: { C: Palette; title: string; color: string; children: React.ReactNode; onOpen: () => void; openLabel: string }) {
  return (
    <ACard style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
          <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, color) }}>{title}</Text>
        </View>
        <Pressable onPress={onOpen} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <Text style={{ fontFamily: F.bold, fontSize: 12, color: txt(C, color) }}>{openLabel}</Text>
          <AuroraIcon name="chevron-down" size={14} color={txt(C, color)} style={{ transform: [{ rotate: "-90deg" }] }} />
        </Pressable>
      </View>
      {children}
    </ACard>
  );
}

function Stat({ C, label, value }: { C: Palette; label: string; value: string }) {
  return (
    <View>
      <Text style={{ fontFamily: F.black, fontSize: 20, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 10, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{label}</Text>
    </View>
  );
}

const TEASE: { kicker: string; blurb: string; color: (C: Palette) => string }[] = [
  { kicker: "Goal & season", color: (C) => C.violet, blurb: "Your periodized macrocycle — phase, week and event countdown." },
  { kicker: "Today's route", color: (C) => C.lime, blurb: "A velocity-aware daily prescription tuned to your readiness." },
  { kicker: "Performance · Athlete Twin", color: (C) => C.blue, blurb: "Your HPI, its pillars and limiter — your training's digital twin." },
  { kicker: "Sport S&C", color: (C) => C.amber, blurb: "The strength & conditioning that transfers to your sport, ranked." },
  { kicker: "Velocity & technique", color: (C) => C.blue, blurb: "Bar-speed 1RM, autoregulated load, force-plate & video analysis." },
  { kicker: "Endurance", color: (C) => C.lime, blurb: "Mileage, pace zones and running PRs from your whole history." },
];

function Teaser({ paid, onUnlock }: { paid: boolean; onUnlock: () => void }) {
  const { palette: C } = useTheme();
  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: 26 }}>Unlock your command center</AHeading>
      <ASub style={{ marginTop: 8 }}>Goal, season, your performance Twin, sport S&C, velocity and endurance — assembled into one screen. It&apos;s part of Full. Keep logging free; upgrade whenever you want the depth.</ASub>
      {TEASE.map((s) => (
        <ACard key={s.kicker} style={{ marginTop: 12, opacity: 0.75, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: s.color(C) }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, s.color(C)) }}>{s.kicker}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: 12, color: C.chalk, marginTop: 4, lineHeight: 17 }}>{s.blurb}</Text>
          </View>
          <AuroraIcon name="lock" size={18} color={C.ash} />
        </ACard>
      ))}
      <APill label={paid ? "Switch to Full" : "Upgrade to Full"} onPress={onUnlock} style={{ marginTop: 18 }} />
    </AuroraScreen>
  );
}
