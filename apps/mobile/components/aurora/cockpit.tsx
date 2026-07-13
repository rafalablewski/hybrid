import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession, computePerformanceState, computeInjuryRisk, computeLoad, performanceTrajectory, weeklyRecap,
  runTotals, toTrainingLog, toBiometrics,
  velocityProfiles, hpiRole, riskRole, readinessRole, SPORTS, LEVELS,
  type LoggedSession, type Macrocycle, type AcwrBand,
} from "@hybrid/core";
import { fetchSessions, fetchMacrocycle, fetchSignals, type CoreSignal } from "../../lib/api";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLang } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { usePersona, setClientPersona } from "../../lib/persona";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F, serifIf } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, ASub, ABack, RADIUS, Ring, Spark } from "./kit";
import { AuroraIcon } from "./icons";

type Palette = ReturnType<typeof useTheme>["palette"];
const hpiColor = (b: string, C: Palette) => roleColor(C, hpiRole(b));
const riskColor = (b: string, C: Palette) => roleColor(C, riskRole(b));
const readyColor = (v: number, C: Palette) => roleColor(C, readinessRole(v));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, " ");
const acwrColor = (b: AcwrBand, C: Palette): string =>
  b === "sweet-spot" ? C.lime : b === "caution" ? C.amber : b === "danger" ? C.red : b === "detraining" ? C.blue : C.ash;

/** AURORA Athlete Cockpit — a command center mirroring web: context rail →
 *  Performance State → Injury risk → This week → Breakdown (tabbed) → Horizon → Goal. */
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
  const { palette: C, scheme } = useTheme();
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
  const loadState = useMemo(() => computeLoad(sessions), [sessions]);
  const bw = useBodyweightLookup();
  const recap = useMemo(() => weeklyRecap(sessions, Date.now(), bw), [sessions, bw]);
  const totals = useMemo(() => runTotals(sessions), [sessions]);
  const profiles = useMemo(() => velocityProfiles(sessions), [sessions]);
  const hasData = sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];
  // Exception-driven: slim all-clear row when nothing's flagged, full maroon otherwise.
  const calm = risk.flagged.length === 0;
  // Season completion %, guarded against a 0 / malformed totalWeeks.
  const seasonPct = macro && macro.totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / macro.totalWeeks) * 100)) : 0;

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {/* 1 · CONTEXT RAIL — title + season + sliding pills (scrolls like Today) */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: 24 }}>{t("w.home.cockpit.commandCenter")}</AHeading>
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>
        {macro ? `${macro.goalOrSport} – ${t("w.home.cockpit.week")} ${currentWeek} ${t("w.home.cockpit.of")} ${macro.totalWeeks}` : t("w.home.cockpit.commandSub")}
      </Text>
      {macro && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -2 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 2 }}>
          {phaseBlock && <Pill C={C} dot={C.lime}><Text style={{ fontFamily: F.bold, color: C.chalk }}>{phaseBlock.label}</Text> {t("w.home.today.phase")}</Pill>}
          {macro.eventInWeeks != null && <Pill C={C}>🏁 <Text style={{ fontFamily: F.bold, color: C.chalk }}>{macro.eventInWeeks} {t("w.home.cockpit.wk")}</Text> {t("w.home.cockpit.eventIn")}</Pill>}
          <Pill C={C}>📈 {loadState.enoughHistory ? `ACWR ${loadState.acwr.toFixed(2)}` : t("w.home.cockpit.building")}</Pill>
        </ScrollView>
      )}

      {/* 2 · PERFORMANCE STATE — STR/END/REC in three columns */}
      <Section C={C} title={t("w.home.cockpit.perfTwin")} openLabel={t("w.home.cockpit.performance")} onOpen={() => router.push("/performance")}>
        {hasData ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 44, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginBottom: 4 }}>HPI – {state.hpi.band} – {t("w.home.cockpit.limiter")} {state.hpi.limiter}</Text>
                <Spark series={hpiSeries} color={hpiColor(state.hpi.band, C)} height={22} />
              </View>
            </View>
            <View style={{ flexDirection: "row", marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: C.line }}>
              <Comp C={C} scheme={scheme} label={t("w.home.cockpit.tab.strength")} value={`${state.hpi.components.strength}`} />
              <Comp C={C} scheme={scheme} label={t("w.home.cockpit.tab.endurance")} value={`${state.hpi.components.endurance}`} />
              <Comp C={C} scheme={scheme} label={t("w.home.cockpit.recovery")} value={`${state.hpi.components.recovery >= 0 ? "+" : ""}${state.hpi.components.recovery}`} />
            </View>
            {state.drivers[0] && <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 12, lineHeight: 18 }}>{state.drivers[0].detail}</Text>}
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

      {/* 3 · INJURY RISK — exception-driven: slim all-clear row when nothing's
          flagged; the full maroon alert card only when a tissue needs attention. */}
      {hasData && (
        <ACard style={{ marginTop: 14, borderColor: calm ? C.line : `${C.red}73`, backgroundColor: calm ? undefined : `${C.red}12` }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: calm ? C.lime : C.red }} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: calm ? C.ash : txt(C, C.red) }}>{t("w.home.today.injuryRisk")}</Text>
            </View>
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, riskColor(risk.band, C)) }}>{cap(risk.band)} – {risk.overall}</Text>
          </View>
          {calm ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: 10 }}>{t("w.home.today.noTissues")}</Text>
          ) : (
            <>
              <View style={{ height: 9, borderRadius: 5, backgroundColor: C.ink, overflow: "hidden", marginTop: 10 }}>
                <View style={{ width: `${risk.overall}%`, height: 9, backgroundColor: riskColor(risk.band, C) }} />
              </View>
              <View style={{ marginTop: 12, gap: space.sm }}>
                {risk.flagged.map((ti) => (
                  <View key={ti.tissue} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <View style={{ borderWidth: 1, borderColor: `${riskColor(ti.band, C)}8c`, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, fontWeight: "700", color: txt(C, riskColor(ti.band, C)) }}>{ti.risk}</Text>
                    </View>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk, textTransform: "capitalize" }}>{ti.tissue}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, flex: 1, textAlign: "right" }}>{ti.drivers[0]?.label ?? `ACWR ${ti.acwr.toFixed(2)}`}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash, marginTop: 16, marginBottom: 8 }}>{t("w.home.cockpit.toWatch")}</Text>
          {loadState.enoughHistory ? (
            <View style={{ flexDirection: "row", gap: 1, backgroundColor: C.line, borderWidth: 1, borderColor: C.line, borderRadius: 12, overflow: "hidden" }}>
              <Watch C={C} label={t("w.home.cockpit.acwr")} value={loadState.acwr.toFixed(2)} color={txt(C, acwrColor(loadState.band, C))} />
              <Watch C={C} label={t("w.home.cockpit.srpe")} value={loadState.acute.toLocaleString()} />
              <Watch C={C} label={t("w.home.cockpit.monotony")} value={loadState.monotony.toFixed(1)} />
              <Watch C={C} label={t("w.home.cockpit.strain")} value={loadState.strain.toLocaleString()} />
            </View>
          ) : (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, lineHeight: 18 }}>{t("w.home.cockpit.watchBuilding")}</Text>
          )}
        </ACard>
      )}

      {/* 4 · THIS WEEK — recap & PRs */}
      {hasData && (
        <Pressable onPress={() => router.push("/statistics")} style={{ marginTop: 14 }}>
          <ACard>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.lime }} />
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.home.today.yourWeek")}</Text>
              </View>
              {recap.prs.length > 0 && <View style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}><Text style={{ fontFamily: F.mono, fontSize: fs.micro, fontWeight: "700", color: C.onAccent }}>🏆 {recap.prs.length} {t("w.home.cockpit.newPrs")}</Text></View>}
            </View>
            <View style={{ flexDirection: "row", marginTop: 14 }}>
              <View style={{ flex: 1 }}><Stat C={C} label={t("w.home.today.sessions")} value={`${recap.sessions}`} /></View>
              <View style={{ flex: 1 }}><Stat C={C} label={`${t("w.home.today.volume")} kg`} value={recap.volume.toLocaleString()} /></View>
              <View style={{ flex: 1 }}><Stat C={C} label={t("w.home.today.sets")} value={`${recap.sets}`} /></View>
            </View>
            {recap.prs.length > 0 && (
              <View style={{ marginTop: 14 }}>
                {recap.prs.slice(0, 4).map((p) => (
                  <View key={p.lift} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{p.lift} e1RM</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: txt(C, C.lime) }}>{p.e1rm}kg{p.previous == null ? "" : ` – +${p.e1rm - p.previous}`}</Text>
                  </View>
                ))}
              </View>
            )}
          </ACard>
        </Pressable>
      )}

      {/* 5 · BREAKDOWN — disciplines, tabbed */}
      {hasData && <Breakdown C={C} scheme={scheme} state={state} recap={recap} totals={totals} sport={sport} profiles={profiles} onOpen={(h) => router.push(h)} />}

      {/* 6 · HORIZON — Sport S&C · Velocity · Endurance */}
      <ACard style={{ marginTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 6 }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.lime }} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.home.cockpit.horizon")}</Text>
        </View>
        <Mod C={C} dot={C.amber} label={t("w.home.cockpit.sportSC")} value={sport ? `${sport.sport} – ${LEVELS[sport.levelIdx]}` : t("w.home.cockpit.sport")} onPress={() => router.push("/(tabs)/sport")} />
        <Mod C={C} dot={C.blue} label={t("w.home.cockpit.velocity")} value={t("w.home.cockpit.velocityValue")} mono onPress={() => router.push("/(tabs)/velocity")} />
        <Mod C={C} dot={C.lime} label={t("w.home.cockpit.endurance")} value={totals.efforts > 0 ? `${totals.efforts} – ${totals.distanceKm.toLocaleString()} km – ${totals.minutes.toLocaleString()} min` : t("w.home.cockpit.running")} mono onPress={() => router.push("/(tabs)/running")} last />
      </ACard>

      {/* 7 · GOAL + SEASON — two separate widgets (like Today's RECOVER duo) */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
        {/* widget 1 — goal */}
        <ACard style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 12 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.violet }} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.home.cockpit.goal")}</Text>
          </View>
          {macro ? (
            <>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.subtitle, color: C.chalk }}>{macro.goalOrSport}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.violet), marginTop: 6 }}>{phaseBlock ? `${phaseBlock.label} – ` : ""}{t("w.home.cockpit.week")} {currentWeek}/{macro.totalWeeks}</Text>
            </>
          ) : (
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 18 }}>{t("w.home.cockpit.noSeason")}</Text>
          )}
        </ACard>
        {/* widget 2 — season progress / plan controls */}
        <ACard style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 12 }}>
            <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.lime }} />
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{macro ? t("w.home.cockpit.season") : t("w.home.cockpit.setUp")}</Text>
          </View>
          {macro ? (
            <>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.heading, color: C.chalk }}>{seasonPct}%</Text>
              <View style={{ height: 6, borderRadius: 99, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, overflow: "hidden", marginTop: 8, marginBottom: 10 }}>
                <View style={{ width: `${seasonPct}%`, height: 6, backgroundColor: C.violet }} />
              </View>
            </>
          ) : (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2, marginBottom: 10, lineHeight: 16 }}>{t("w.home.cockpit.fourQuestions")}</Text>
          )}
          <View style={{ gap: 8 }}>
            {macro && <Pressable onPress={() => router.push("/periodize")}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.cockpit.periodize")} →</Text></Pressable>}
            <Pressable onPress={() => router.push("/onboarding")}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.cockpit.openSetup")}</Text></Pressable>
          </View>
        </ACard>
      </View>
    </AuroraScreen>
  );
}

/* ---------- Breakdown (tabbed disciplines) ---------- */
type BreakTab = "strength" | "endurance" | "sport" | "velocity";
function Breakdown({ C, scheme, state, recap, totals, sport, profiles, onOpen }: {
  C: Palette; scheme: ReturnType<typeof useTheme>["scheme"];
  state: ReturnType<typeof computePerformanceState>;
  recap: ReturnType<typeof weeklyRecap>;
  totals: ReturnType<typeof runTotals>;
  sport: { sport: string; levelIdx: number } | null;
  profiles: ReturnType<typeof velocityProfiles>;
  onOpen: (h: Href) => void;
}) {
  const { t } = useLang();
  const TABS: { id: BreakTab; label: string }[] = [
    { id: "strength", label: t("w.home.cockpit.tab.strength") },
    { id: "endurance", label: t("w.home.cockpit.tab.endurance") },
    { id: "sport", label: t("w.home.cockpit.tab.sport") },
    { id: "velocity", label: t("w.home.cockpit.tab.velocity") },
  ];
  const [tab, setTab] = useState<BreakTab>("strength");
  const bestProfile = useMemo(() => Object.entries(profiles).filter(([, p]) => p.estimated1rm > 0).sort((a, b) => b[1].estimated1rm - a[1].estimated1rm)[0], [profiles]);

  return (
    <ACard style={{ marginTop: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 12 }}>
        <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.blue }} />
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.home.cockpit.breakdown")}</Text>
      </View>
      {/* segmented tabs */}
      <View style={{ flexDirection: "row", gap: 0, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, padding: 4 }}>
        {TABS.map((x) => {
          const on = x.id === tab;
          return (
            <Pressable key={x.id} onPress={() => setTab(x.id)} style={{ flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: RADIUS.pill, backgroundColor: on ? C.chalk : "transparent" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: on ? C.onAccent : C.ash }}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 16 }}>
        {tab === "strength" && (
          <>
            <View style={{ flexDirection: "row", gap: 22 }}>
              <Stat C={C} label={t("w.home.cockpit.strIndex")} value={`${state.hpi.components.strength}`} />
              <Stat C={C} label={t("w.home.cockpit.lifts")} value={`${recap.lifts}`} />
              <Stat C={C} label={t("w.home.today.topMuscle")} value={recap.topMuscle ? cap(recap.topMuscle.muscle) : "—"} />
            </View>
            {state.drivers[0] && <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 14, lineHeight: 18 }}>{state.drivers[0].detail}</Text>}
          </>
        )}
        {tab === "endurance" && (
          totals.efforts > 0 ? (
            <>
              <View style={{ flexDirection: "row", gap: 22 }}>
                <Stat C={C} label={t("w.home.cockpit.efforts")} value={`${totals.efforts}`} />
                <Stat C={C} label={t("w.home.cockpit.km")} value={totals.distanceKm.toLocaleString()} />
                <Stat C={C} label={t("w.home.cockpit.min")} value={totals.minutes.toLocaleString()} />
              </View>
              <Pressable onPress={() => onOpen("/(tabs)/running")} style={{ marginTop: 14 }}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.cockpit.running")} →</Text></Pressable>
            </>
          ) : <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.enduranceEmpty")}</Text>
        )}
        {tab === "sport" && (
          sport ? (
            <>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.subtitle, color: C.chalk }}>{sport.sport} – {LEVELS[sport.levelIdx]}</Text>
              <Pressable onPress={() => onOpen("/(tabs)/sport")} style={{ marginTop: 12 }}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.cockpit.sport")} →</Text></Pressable>
            </>
          ) : <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.sportEmpty")}</Text>
        )}
        {tab === "velocity" && (
          bestProfile ? (
            <>
              <View style={{ flexDirection: "row", gap: 22 }}>
                <Stat C={C} label={bestProfile[0]} value={`${Math.round(bestProfile[1].estimated1rm)}kg`} />
                <Stat C={C} label="R²" value={bestProfile[1].r2.toFixed(2)} />
                <Stat C={C} label={t("w.home.cockpit.points")} value={`${bestProfile[1].n}`} />
              </View>
              <Pressable onPress={() => onOpen("/(tabs)/velocity")} style={{ marginTop: 14 }}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.cockpit.velocity")} →</Text></Pressable>
            </>
          ) : <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.velocityBlurb")}</Text>
        )}
      </View>
    </ACard>
  );
}

/* ---------- primitives ---------- */
function Pill({ C, children, dot }: { C: Palette; children: React.ReactNode; dot?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
      {dot && <View style={{ width: 7, height: 7, borderRadius: 5, backgroundColor: dot }} />}
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.chalk }}>{children}</Text>
    </View>
  );
}

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
  const { scheme } = useTheme();
  return (
    <View>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.heading, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{label}</Text>
    </View>
  );
}

function Comp({ C, scheme, label, value }: { C: Palette; scheme: ReturnType<typeof useTheme>["scheme"]; label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 24, color: C.chalk, letterSpacing: -0.4 }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, textTransform: "uppercase", letterSpacing: 0.8, color: C.ash, marginTop: 6 }}>{label}</Text>
    </View>
  );
}

function Watch({ C, label, value, color }: { C: Palette; label: string; value: string; color?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: C.ink2, paddingVertical: 11, paddingHorizontal: 4, alignItems: "center" }}>
      <Text style={{ fontFamily: F.mono, fontWeight: "700", fontSize: fs.body, color: color ?? C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 8, textTransform: "uppercase", letterSpacing: 0.4, color: C.ash, marginTop: 4 }}>{label}</Text>
    </View>
  );
}

function Mod({ C, dot, label, value, onPress, mono, last }: { C: Palette; dot: string; label: string; value: string; onPress: () => void; mono?: boolean; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: `${C.line}99` }}>
      <View style={{ width: 7, height: 7, borderRadius: 5, backgroundColor: dot }} />
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{label}</Text>
      <Text style={{ marginLeft: "auto", fontFamily: mono ? F.mono : F.bold, fontSize: mono ? fs.caption : fs.body, color: mono ? C.ash : C.chalk }}>{value} →</Text>
    </Pressable>
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("w.home.cockpit.teaseTitle")}</AHeading>
      </View>
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
