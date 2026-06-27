import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession, computePerformanceState, computeInjuryRisk, performanceTrajectory, weeklyRecap,
  runTotals, toTrainingLog, toBiometrics,
  velocityProfiles, hpiRole, riskRole, readinessRole, SPORTS, LEVELS, type LoggedSession, type Macrocycle,
} from "@hybrid/core";
import { fetchSessions, fetchMacrocycle, fetchSignals, type CoreSignal } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { usePersona, setClientPersona } from "../../lib/persona";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, ASub, RADIUS, Ring, Spark } from "./kit";
import { AuroraIcon } from "./icons";

type Palette = ReturnType<typeof useTheme>["palette"];
const hpiColor = (b: string, C: Palette) => roleColor(C, hpiRole(b));
const riskColor = (b: string, C: Palette) => roleColor(C, riskRole(b));
const readyColor = (v: number, C: Palette) => roleColor(C, readinessRole(v));

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
  const hpiSeries = useMemo(() => [...performanceTrajectory(log, 14)].sort((a, b) => b.daysAgo - a.daysAgo).map((p) => p.hpi), [log]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const recap = useMemo(() => weeklyRecap(sessions), [sessions]);
  const totals = useMemo(() => runTotals(sessions), [sessions]);
  const hasData = sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <AHeading style={{ fontSize: 28 }}>{t("w.home.cockpit.commandCenter")}</AHeading>
      <ASub style={{ marginTop: 8 }}>{t("w.home.cockpit.commandSub")}</ASub>

      <Section C={C} title={t("w.home.cockpit.goalSeason")} openLabel={macro ? t("w.home.cockpit.periodize") : t("w.home.cockpit.setUp")} onOpen={() => router.push(macro ? "/periodize" : "/onboarding")}>
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
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{t("w.home.cockpit.setUpChange")}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{t("w.home.cockpit.fourQuestions")}</Text>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.cockpit.openSetup")}</Text>
        </Pressable>
      </Section>

      <Section C={C} title={hasData ? `${t("w.home.cockpit.todayReadiness")} ${rx.readiness}/100` : t("w.home.cockpit.today")} openLabel={hasData ? t("common.start") : t("w.home.cockpit.startFirstSection")} onOpen={() => router.push((hasData ? "/workout?source=ai" : "/workout?source=empty") as Href)}>
        <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{hasData ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : t("w.home.cockpit.calibrate")}</Text>
        {hasData && <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 4, lineHeight: 18 }}>{rx.why}</Text>}
      </Section>

      <Section C={C} title={t("w.home.cockpit.perfTwin")} openLabel={t("w.home.cockpit.performance")} onOpen={() => router.push("/performance")}>
        {hasData ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Text style={{ fontFamily: F.black, fontSize: 40, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginBottom: 4 }}>HPI · {state.hpi.band} · {t("w.home.cockpit.limiter")} {state.hpi.limiter}</Text>
                <Spark series={hpiSeries} color={hpiColor(state.hpi.band, C)} height={22} />
              </View>
            </View>
            <View style={{ flexDirection: "row", gap: 14, marginTop: 8 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>STR <Text style={{ fontFamily: F.bold, color: C.chalk }}>{state.hpi.components.strength}</Text></Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>END <Text style={{ fontFamily: F.bold, color: C.chalk }}>{state.hpi.components.endurance}</Text></Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>REC <Text style={{ fontFamily: F.bold, color: C.chalk }}>{state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Text></Text>
            </View>
            {state.drivers[0] && <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 8, lineHeight: 18 }}>{state.drivers[0].detail}</Text>}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
              <Ring value={rx.readiness} size={48} color={readyColor(rx.readiness, C)} track={C.line}>
                <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{rx.readiness}</Text>
              </Ring>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{t("w.home.cockpit.todayReadiness")}</Text>
                <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 3, lineHeight: 16 }}>{rx.why}</Text>
              </View>
            </View>
          </>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.twinEmpty")}</Text>
        )}
      </Section>

      {/* READINESS & INJURY RISK — moved here from Today (recovery state lives on the command center). */}
      {hasData && (
        <ACard style={{ marginTop: 14 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.red) }}>{t("w.home.today.injuryRisk")}</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm, marginTop: 8 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.heading, color: txt(C, riskColor(risk.band, C)) }}>{risk.band}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{risk.overall}/100</Text>
          </View>
          <View style={{ height: 9, borderRadius: 5, backgroundColor: C.ink, overflow: "hidden", marginTop: 8 }}>
            <View style={{ width: `${risk.overall}%`, height: 9, backgroundColor: riskColor(risk.band, C) }} />
          </View>
          {risk.flagged.length === 0 ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: 10 }}>{t("w.home.today.noTissues")}</Text>
          ) : (
            <View style={{ marginTop: 10, gap: space.xs }}>
              {risk.flagged.map((ti) => (
                <View key={ti.tissue} style={{ flexDirection: "row", alignItems: "baseline", gap: space.sm }}>
                  <View style={{ backgroundColor: `${riskColor(ti.band, C)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 2 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, riskColor(ti.band, C)) }}>{ti.risk}</Text>
                  </View>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk, textTransform: "capitalize" }}>{ti.tissue}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, flex: 1 }}>{ti.drivers[0]?.label ?? ""}</Text>
                </View>
              ))}
            </View>
          )}
        </ACard>
      )}

      {/* YOUR WEEK — weekly recap moved here from Today (tap → Statistics). */}
      {hasData && (
        <Pressable onPress={() => router.push("/statistics")} style={{ marginTop: 14 }}>
          <ACard>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.home.today.yourWeek")}</Text>
              {recap.prs.length > 0 && <View style={{ backgroundColor: `${C.lime}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}><Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{recap.prs.length} PR</Text></View>}
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 22, marginTop: 12 }}>
              <Stat C={C} label={t("w.home.today.sessions")} value={`${recap.sessions}`} />
              <Stat C={C} label={t("w.home.today.volume")} value={`${recap.volume.toLocaleString()} kg`} />
              <Stat C={C} label={t("w.home.today.sets")} value={`${recap.sets}`} />
              {recap.distanceKm > 0 && <Stat C={C} label={t("w.home.today.distance")} value={`${recap.distanceKm} km`} />}
              <Stat C={C} label={t("w.home.today.activeDays")} value={`${recap.activeDays}`} />
            </View>
          </ACard>
        </Pressable>
      )}

      <Section C={C} title={t("w.home.cockpit.sportSC")} openLabel={t("w.home.cockpit.sport")} onOpen={() => router.push("/(tabs)/sport")}>
        {sport ? (
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }}>{sport.sport} · {LEVELS[sport.levelIdx]}</Text>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.sportEmpty")}</Text>
        )}
      </Section>

      <Section C={C} title={t("w.home.cockpit.velocityTechnique")} openLabel={t("w.home.cockpit.velocity")} onOpen={() => router.push("/(tabs)/velocity")}>
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.velocityBlurb")}</Text>
      </Section>

      <Section C={C} title={t("w.home.cockpit.endurance")} openLabel={t("w.home.cockpit.running")} onOpen={() => router.push("/(tabs)/running")}>
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

// Disciplined section header: a single lime accent (dot + Open link) over a
// neutral ash kicker — no per-section rainbow. Data colours live in the body.
function Section({ C, title, children, onOpen, openLabel }: { C: Palette; title: string; children: React.ReactNode; onOpen: () => void; openLabel: string }) {
  return (
    <ACard style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.lime }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{title}</Text>
        </View>
        <Pressable onPress={onOpen} style={{ flexDirection: "row", alignItems: "center", gap: space.xxs }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: txt(C, C.lime) }}>{openLabel}</Text>
          <AuroraIcon name="chevron-down" size={14} color={txt(C, C.lime)} style={{ transform: [{ rotate: "-90deg" }] }} />
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

const TEASE: { key: string }[] = [
  { key: "goalSeason" }, { key: "todayRoute" }, { key: "perfTwin" },
  { key: "sportSC" }, { key: "velocity" }, { key: "endurance" },
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
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.lime }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t(`w.home.cockpit.tease.${s.key}.kicker`)}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, marginTop: 4, lineHeight: 17 }}>{t(`w.home.cockpit.tease.${s.key}.blurb`)}</Text>
          </View>
          <AuroraIcon name="lock" size={18} color={C.ash} />
        </ACard>
      ))}
      <APill label={paid ? t("w.home.cockpit.switchToFull") : t("w.home.cockpit.upgradeToFull")} onPress={onUnlock} style={{ marginTop: 18 }} />
    </AuroraScreen>
  );
}
