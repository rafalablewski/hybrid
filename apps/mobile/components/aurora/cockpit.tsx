import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession, computePerformanceState, runTotals, toTrainingLog, toBiometrics,
  velocityProfiles, hpiRole, SPORTS, LEVELS, type LoggedSession, type Macrocycle,
} from "@hybrid/core";
import { fetchSessions, fetchMacrocycle, fetchSignals, type CoreSignal } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { usePersona, setClientPersona } from "../../lib/persona";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, ASub, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

type Palette = ReturnType<typeof useTheme>["palette"];
const hpiColor = (b: string, C: Palette) => roleColor(C, hpiRole(b));

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
  const { t } = useLang();
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
      <AHeading style={{ fontSize: 28 }}>{t("w.home.cockpit.commandCenter")}</AHeading>
      <ASub style={{ marginTop: 8 }}>{t("w.home.cockpit.commandSub")}</ASub>

      <Section C={C} title={t("w.home.cockpit.goalSeason")} color={C.violet} openLabel={macro ? t("w.home.cockpit.periodize") : t("w.home.cockpit.setUp")} onOpen={() => router.push(macro ? "/periodize" : "/onboarding")}>
        {macro ? (
          <>
            <Text style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk }}>{macro.goalOrSport}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>{phaseBlock ? `${phaseBlock.label} · ` : ""}{t("w.home.cockpit.week")} {currentWeek}/{macro.totalWeeks}{macro.eventInWeeks != null ? ` · ${t("w.home.cockpit.eventIn")} ${macro.eventInWeeks} ${t("w.home.cockpit.wk")}` : ""}</Text>
          </>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.noSeason")}</Text>
        )}
        {/* SET UP / CHANGE PLAN — the onboarding funnel folded under Goal & season
            (the mobile analog of the web expander; parity with classic cockpit). */}
        <Pressable
          onPress={() => router.push("/onboarding")}
          style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.amber) }}>{t("w.home.cockpit.setUpChange")}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{t("w.home.cockpit.fourQuestions")}</Text>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber) }}>{t("w.home.cockpit.openSetup")}</Text>
        </Pressable>
      </Section>

      <Section C={C} title={hasData ? `${t("w.home.cockpit.todayReadiness")} ${rx.readiness}/100` : t("w.home.cockpit.today")} color={C.lime} openLabel={hasData ? "Start" : "Start first"} onOpen={() => router.push((hasData ? "/workout?source=ai" : "/workout?source=empty") as Href)}>
        <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{hasData ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : t("w.home.cockpit.calibrate")}</Text>
        {hasData && <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 4, lineHeight: 18 }}>{rx.why}</Text>}
      </Section>

      <Section C={C} title={t("w.home.cockpit.perfTwin")} color={C.blue} openLabel={t("w.home.cockpit.performance")} onOpen={() => router.push("/performance")}>
        {hasData ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.ms }}>
              <Text style={{ fontFamily: F.black, fontSize: 32, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>HPI · {state.hpi.band} · {t("w.home.cockpit.limiter")} {state.hpi.limiter}</Text>
            </View>
            <View style={{ flexDirection: "row", gap: 14, marginTop: 6 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>STR {state.hpi.components.strength}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.blue) }}>END {state.hpi.components.endurance}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.violet) }}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Text>
            </View>
            {state.drivers[0] && <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 6, lineHeight: 18 }}>{state.drivers[0].detail}</Text>}
          </>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.twinEmpty")}</Text>
        )}
      </Section>

      <Section C={C} title={t("w.home.cockpit.sportSC")} color={C.amber} openLabel={t("w.home.cockpit.sport")} onOpen={() => router.push("/(tabs)/sport")}>
        {sport ? (
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{sport.sport} · {LEVELS[sport.levelIdx]}</Text>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.sportEmpty")}</Text>
        )}
      </Section>

      <Section C={C} title={t("w.home.cockpit.velocityTechnique")} color={C.blue} openLabel={t("w.home.cockpit.velocity")} onOpen={() => router.push("/(tabs)/velocity")}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.velocityBlurb")}</Text>
      </Section>

      <Section C={C} title={t("w.home.cockpit.endurance")} color={C.lime} openLabel={t("w.home.cockpit.running")} onOpen={() => router.push("/(tabs)/running")}>
        {totals.efforts > 0 ? (
          <View style={{ flexDirection: "row", gap: 18 }}>
            <Stat C={C} label={t("w.home.cockpit.efforts")} value={`${totals.efforts}`} />
            <Stat C={C} label={t("w.home.cockpit.km")} value={totals.distanceKm.toLocaleString()} />
            <Stat C={C} label={t("w.home.cockpit.min")} value={totals.minutes.toLocaleString()} />
          </View>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.enduranceEmpty")}</Text>
        )}
      </Section>
    </AuroraScreen>
  );
}

function Section({ C, title, color, children, onOpen, openLabel }: { C: Palette; title: string; color: string; children: React.ReactNode; onOpen: () => void; openLabel: string }) {
  return (
    <ACard style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, color) }}>{title}</Text>
        </View>
        <Pressable onPress={onOpen} style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: txt(C, color) }}>{openLabel}</Text>
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
      <Text style={{ fontFamily: F.black, fontSize: fs.heading, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{label}</Text>
    </View>
  );
}

const TEASE: { key: string; color: (C: Palette) => string }[] = [
  { key: "goalSeason", color: (C) => C.violet },
  { key: "todayRoute", color: (C) => C.lime },
  { key: "perfTwin", color: (C) => C.blue },
  { key: "sportSC", color: (C) => C.amber },
  { key: "velocity", color: (C) => C.blue },
  { key: "endurance", color: (C) => C.lime },
];

function Teaser({ paid, onUnlock }: { paid: boolean; onUnlock: () => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <AuroraScreen>
      <AHeading style={{ fontSize: fs.display }}>{t("w.home.cockpit.teaseTitle")}</AHeading>
      <ASub style={{ marginTop: 8 }}>{t("w.home.cockpit.teaseSub1")}{t("w.home.cockpit.teaseSub2")}{t("w.home.cockpit.teaseSub3")}</ASub>
      {TEASE.map((s) => (
        <ACard key={s.key} style={{ marginTop: 12, opacity: 0.75, flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: s.color(C) }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, s.color(C)) }}>{t(`w.home.cockpit.tease.${s.key}.kicker`)}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, marginTop: 4, lineHeight: 17 }}>{t(`w.home.cockpit.tease.${s.key}.blurb`)}</Text>
          </View>
          <AuroraIcon name="lock" size={18} color={C.ash} />
        </ACard>
      ))}
      <APill label={paid ? t("w.home.cockpit.switchToFull") : t("w.home.cockpit.upgradeToFull")} onPress={onUnlock} style={{ marginTop: 18 }} />
    </AuroraScreen>
  );
}
