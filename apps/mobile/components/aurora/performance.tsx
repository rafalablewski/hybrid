import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView, TextInput } from "react-native";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession, computePerformanceState, computeInjuryRisk, computeLoad, performanceTrajectory, weeklyRecap,
  runTotals, enduranceSessions, toTrainingLog, toBiometrics,
  fmtWeight, strengthPrDelta, evaluateRtp, STAGE_LABEL,
  velocityProfiles, hpiRole, riskRole, readinessRole, checkinFeeling, READINESS_FACE, readinessWhy, SPORTS, LEVELS,
  RISK_DRIVER_LABEL_KEY, RISK_DRIVER_EXPLAIN_KEY,
  type LoggedSession, type Macrocycle, type AcwrBand, type RiskDriverKind,
} from "@hybrid/core";
import { fetchSessions, fetchMacrocycle, fetchSignals, fetchCheckins, fetchRtpProtocols, createRtpProtocol, mutateRtpProtocol, type CoreSignal, type Checkin, type RtpProtocol, type RtpAuditEntry } from "../../lib/api";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLang } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { usePersona, setClientPersona } from "../../lib/persona";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { fs, space, F, serifIf } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, ASub, ABack, RADIUS, Ring, Spark, withAlpha } from "./kit";
import { AuroraIcon } from "./icons";
import ReadinessFace from "./readiness-face";

type Palette = ReturnType<typeof useTheme>["palette"];
type Scheme = ReturnType<typeof useTheme>["scheme"];
const hpiColor = (b: string, C: Palette) => roleColor(C, hpiRole(b));
const riskColor = (b: string, C: Palette) => roleColor(C, riskRole(b));
const readyColor = (v: number, C: Palette) => roleColor(C, readinessRole(v));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, " ");
const acwrColor = (b: AcwrBand, C: Palette): string =>
  b === "sweet-spot" ? C.lime : b === "caution" ? C.amber : b === "danger" ? C.red : b === "detraining" ? C.blue : C.ash;

/** AURORA Performance — the merged athlete hub (ex-Cockpit + the standalone
 *  Performance State screen, one page — mirrors web): living masthead →
 *  Performance State (the classic card: big HPI + sparkline, STR/END/REC
 *  columns, readiness + nudge) → the 14-day trajectory → injury risk (summary
 *  card with the per-tissue probability table as a disclosure) → this week →
 *  breakdown → horizon → goal + season → return-to-play. */
export default function AuroraPerformance() {
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
  const [checkins, setCheckins] = useState<Checkin[]>([]);
  const [sport, setSport] = useState<{ sport: string; levelIdx: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Injury-risk depth is a DISCLOSURE: the per-tissue probability table and the
  // plain-language driver explanations stay one tap away so the card itself
  // remains a glance. Mirrors web.
  const [tissueOpen, setTissueOpen] = useState(false);

  const load = () => {
    setRefreshing(true);
    Promise.all([fetchSessions(), fetchMacrocycle(), fetchSignals(), fetchCheckins().catch(() => [])])
      .then(([s, m, sig, ci]) => { setSessions(s); setMacro(m?.macro ?? null); setCurrentWeek(m?.currentWeek ?? 1); setSignals(sig); setCheckins(ci as Checkin[]); })
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
  // TODAY's readiness FEELING (the one-tap check-in) → prescribeSession, so the
  // readiness block reflects + explains the load nudge the pick applies
  // (the Today screen no longer previews it). Mirrors web.
  const todayFeeling = useMemo(() => {
    const today = new Date().toDateString();
    const c = checkins.find((x) => x && x.weekOf && new Date(x.weekOf).toDateString() === today);
    return c ? checkinFeeling(c) : null;
  }, [checkins]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles: velocityProfiles(sessions), subjectiveReadiness: todayFeeling ?? undefined }), [log, bio, sessions, todayFeeling]);
  // Truth-based readiness lines — every clause computed from the REAL log +
  // wearable baseline (readinessWhy, @hybrid/core). The old rx.why narrated the
  // session PICK ("Back Squat… I prescribed 4×5 @ 90kg") and invented a lift +
  // load for athletes with no history; that copy stays on the Today flow.
  const whyLines = useMemo(() => readinessWhy(log, bio), [log, bio]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const loadState = useMemo(() => computeLoad(sessions), [sessions]);
  // The real 14-day trajectory (both series, from the standalone Performance
  // screen) — its own card right under the state card.
  const traj = useMemo(() => performanceTrajectory(log, 14), [log]);
  const hpiSeries = useMemo(() => [...performanceTrajectory(log, 14)].sort((a, b) => b.daysAgo - a.daysAgo).map((p) => p.hpi), [log]);
  const bw = useBodyweightLookup();
  const recap = useMemo(() => weeklyRecap(sessions, Date.now(), bw), [sessions, bw]);
  // "Endurance" = real endurance cardio (runs, swims, rides, rows) — drop
  // racket/team/combat sports so a tennis session doesn't inflate the summary.
  const totals = useMemo(() => runTotals(enduranceSessions(sessions)), [sessions]);
  const profiles = useMemo(() => velocityProfiles(sessions), [sessions]);
  const hasData = sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];
  // Exception-driven: slim all-clear row when nothing's flagged, full maroon otherwise.
  const calm = risk.flagged.length === 0;
  // The distinct risk DRIVERS across flagged tissues, heaviest first — explained
  // in plain language inside the tissue-detail disclosure.
  const driverKinds = ((): RiskDriverKind[] => {
    const weight = new Map<RiskDriverKind, number>();
    for (const ti of risk.flagged) for (const d of ti.drivers) weight.set(d.kind, (weight.get(d.kind) ?? 0) + d.contribution);
    return [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  })();
  // Season completion %, guarded against a 0 / malformed totalWeeks.
  const seasonPct = macro && macro.totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / macro.totalWeeks) * 100)) : 0;
  const maxBar = 96;

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      {/* 1 · CONTEXT RAIL — a LIVING MASTHEAD in Today's idiom (mono season
          caption, one oversized editorial headline, a warm sub) + sliding pills.
          Deliberately the same masthead anatomy as the home tab so the two
          screens read as siblings: Today answers "what do I do?", this page
          answers "how am I doing?". */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <Text style={{ fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>
          {macro ? `${macro.goalOrSport} – ${t("w.home.cockpit.week")} ${currentWeek} ${t("w.home.cockpit.of")} ${macro.totalWeeks}` : " "}
        </Text>
      </View>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 32, letterSpacing: -1, color: C.chalk, marginTop: 6 }}>{t("w.home.cockpit.commandCenter")}</Text>
      <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 2 }}>{t("w.home.cockpit.commandSub")}</Text>
      {(macro || hasData) && (
        // Full-bleed chip rail — clips at the screen edge, rests on the column.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {phaseBlock && <Pill C={C} dot={C.lime}><Text style={{ fontFamily: F.bold, color: C.chalk }}>{phaseBlock.label}</Text> {t("w.home.today.phase")}</Pill>}
          {macro?.eventInWeeks != null && <Pill C={C}>🏁 <Text style={{ fontFamily: F.bold, color: C.chalk }}>{macro.eventInWeeks} {t("w.home.cockpit.wk")}</Text> {t("w.home.cockpit.eventIn")}</Pill>}
          {/* ACWR rides on training data, not on having a season — a planless
              athlete still gets their workload ratio at a glance. */}
          {hasData && <Pill C={C}>📈 {loadState.enoughHistory ? `ACWR ${loadState.acwr.toFixed(2)}` : t("w.home.cockpit.building")}</Pill>}
          {/* The headline number is visible before any scroll. */}
          {hasData && <Pill C={C} dot={hpiColor(state.hpi.band, C)}>HPI <Text style={{ fontFamily: F.bold, color: C.chalk }}>{state.hpi.score}</Text> – {state.hpi.band}</Pill>}
        </ScrollView>
      )}

      {/* 2 · PERFORMANCE STATE — the headline read (the classic anatomy):
          big HPI + band/limiter caption + sparkline, STR/END/REC in three
          columns, the top driver, and today's readiness (with the check-in
          nudge) below. */}
      <ACard style={{ marginTop: 14 }}>
        <SHead C={C} scheme={scheme} title={t("w.home.cockpit.perfTwin")} />
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
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
              <Ring value={rx.readiness} size={48} color={readyColor(rx.readiness, C)} track={C.line}>
                <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{rx.readiness}</Text>
              </Ring>
              {/* The "why" is split into its sentences and rendered as separate
                  lines so the engine's multi-clause explanation scans instead of
                  reading as one wall of text. Mirrors web. */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{t("w.home.cockpit.todayReadiness")}</Text>
                <View style={{ gap: 5, marginTop: 5 }}>
                  {whyLines.map((line, i) => (
                    <Text key={i} style={{ fontFamily: F.reg, fontSize: fs.body, color: i === 0 ? C.chalk : C.ash, lineHeight: 19 }}>{line}</Text>
                  ))}
                </View>
                {/* READINESS NUDGE — the one-tap check-in moved today's load;
                    glanceable, tinted in the feeling's own accent. Absent on a
                    neutral ("good") day. Mirrors web. */}
                {rx.readinessAdjust && (() => {
                  const adj = rx.readinessAdjust!;
                  const tint = C[READINESS_FACE[adj.feeling].accent];
                  const key = adj.loadPct === undefined ? "rxWreckedBw" : adj.feeling === "primed" ? "rxPrimed" : adj.feeling === "flat" ? "rxFlat" : "rxWrecked";
                  const label = t(`w.home.today.${key}`).replace("{pct}", String(adj.loadPct ?? ""));
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", marginTop: 8, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: withAlpha(tint, 0.12), borderWidth: 1, borderColor: withAlpha(tint, 0.34) }}>
                      <ReadinessFace feeling={adj.feeling} scale={0.5} />
                      <Text style={{ fontFamily: F.mono, fontSize: 11, fontWeight: "600", color: txt(C, tint) }}>{label}</Text>
                    </View>
                  );
                })()}
              </View>
            </View>
          </>
        ) : (
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("w.home.cockpit.twinEmpty")}</Text>
        )}
      </ACard>

      {/* 3 · TRAJECTORY — HPI as bars; Readiness as a per-day marker plotted on
          the same 0..100 scale → the same two series the web chart draws, with
          native primitives instead of an SVG chart (form carries the series
          identity: bar vs tick, hue second). */}
      {hasData && (
        <ACard style={{ marginTop: 14 }}>
          <SHead
            C={C} scheme={scheme}
            title={t("w.analyze.perf.trajectory")}
            metaNode={
              <View style={{ flexDirection: "row", gap: space.md }}>
                {([["HPI", C.lime], ["Readiness", C.blue]] as const).map(([l, col]) => (
                  <View key={l} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <View style={{ width: 10, height: 3, borderRadius: 2, backgroundColor: col }} />
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{l}</Text>
                  </View>
                ))}
              </View>
            }
          />
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: maxBar }}>
            {traj.map((p) => (
              <View key={p.daysAgo} style={{ flex: 1, height: maxBar, alignItems: "center", justifyContent: "flex-end" }}>
                <View style={{ width: "100%", height: Math.max(2, (p.hpi / 100) * maxBar), backgroundColor: p.daysAgo === 0 ? C.lime : `${C.lime}66`, borderRadius: 3 }} />
                <View pointerEvents="none" style={{ position: "absolute", left: 1, right: 1, bottom: Math.max(0, (p.readiness / 100) * maxBar - 1), height: 3, borderRadius: 2, backgroundColor: p.daysAgo === 0 ? C.blue : `${C.blue}99` }} />
              </View>
            ))}
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>-13d</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.analyze.perf.today")} – HPI {traj[traj.length - 1]?.hpi ?? "—"} – Readiness {traj[traj.length - 1]?.readiness ?? "—"}</Text>
          </View>
        </ACard>
      )}

      {/* 4 · INJURY RISK — exception-driven summary; the per-tissue calibrated
          probability table (the old standalone depth) lives in the "Tissue
          detail" disclosure so the glance stays a glance. */}
      {hasData && (
        <ACard style={{ marginTop: 14, borderColor: calm ? C.line : `${C.red}73`, backgroundColor: calm ? undefined : `${C.red}12` }}>
          <SHead
            C={C} scheme={scheme}
            title={t("w.home.today.injuryRisk")}
            titleColor={calm ? undefined : txt(C, C.red)}
            metaNode={<Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, riskColor(risk.band, C)) }}>{cap(risk.band)} – {risk.overall}</Text>}
          />
          {calm ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.today.noTissues")}</Text>
          ) : (
            <>
              <View style={{ height: 9, borderRadius: 5, backgroundColor: C.ink, overflow: "hidden" }}>
                <View style={{ width: `${risk.overall}%`, height: 9, backgroundColor: riskColor(risk.band, C) }} />
              </View>
              <View style={{ marginTop: 12, gap: space.sm }}>
                {risk.flagged.map((ti) => (
                  <View key={ti.tissue} style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                    <View style={{ borderWidth: 1, borderColor: `${riskColor(ti.band, C)}8c`, borderRadius: RADIUS.pill, paddingHorizontal: 9, paddingVertical: 2 }}>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, fontWeight: "700", color: txt(C, riskColor(ti.band, C)) }}>{ti.risk}</Text>
                    </View>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk, textTransform: "capitalize" }}>{ti.tissue}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, flex: 1, textAlign: "right" }}>{ti.drivers[0] ? t(RISK_DRIVER_LABEL_KEY[ti.drivers[0].kind]) : `ACWR ${ti.acwr.toFixed(2)}`}</Text>
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
          {/* A one-line plain-language gloss on ACWR — the ratio the "workload
              spike" driver is built on — so the bare number reads for everyone. */}
          {loadState.enoughHistory && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, lineHeight: 15, marginTop: 8 }}>{t("w.injury.acwrNote")}</Text>
          )}

          {/* TISSUE DETAIL — the depth the standalone screen used to own: the
              per-tissue calibrated probability table and the plain-language
              driver explanations. Mirrors web (which adds the SVG body map). */}
          <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <Pressable onPress={() => setTissueOpen((v) => !v)} hitSlop={6} accessibilityRole="button" accessibilityState={{ expanded: tissueOpen }} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, color: txt(C, calm ? C.lime : C.red) }}>{t("w.analyze.perf.tissueDetail")}</Text>
                <Text style={{ fontSize: 8, color: txt(C, calm ? C.lime : C.red) }}>{tissueOpen ? "▲" : "▼"}</Text>
              </Pressable>
              {/* The model-version annotation the old screen's header carried —
                  always visible, qualifying the risk numbers + the table. */}
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{t("w.analyze.perf.model")} {risk.modelVersion}</Text>
            </View>
            {tissueOpen && (
              <View style={{ marginTop: 10 }}>
                {/* Column header — Tissue · ACWR · P(injury) · Risk (the top driver
                    rides under the tissue name, so the same 5 columns as the web
                    table read on a phone-width row). */}
                <View style={{ flexDirection: "row", alignItems: "center", paddingBottom: 6 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash, flex: 1 }}>{t("w.analyze.perf.colTissue")}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash, width: 46, textAlign: "right" }}>{t("w.analyze.perf.colAcwr")}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash, width: 62, textAlign: "right" }}>{t("w.analyze.perf.colProb")}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.6, color: C.ash, width: 46, textAlign: "right" }}>{t("w.analyze.perf.colRisk")}</Text>
                </View>
                {risk.tissues.map((ti) => (
                  <View key={ti.tissue} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.line }}>
                    <View style={{ flex: 1, paddingRight: 6 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{cap(ti.tissue)}</Text>
                      <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 1 }}>{ti.drivers[0] ? t(RISK_DRIVER_LABEL_KEY[ti.drivers[0].kind]) : "—"}</Text>
                    </View>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: ti.enoughHistory ? C.chalk : C.ash, width: 46, textAlign: "right" }}>{ti.enoughHistory ? ti.acwr.toFixed(2) : "—"}</Text>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: ti.risk > 0 ? C.chalk : C.ash, width: 62, textAlign: "right" }}>{(ti.prob * 100).toFixed(1)}%</Text>
                    <View style={{ width: 46, alignItems: "flex-end" }}>
                      <View style={{ backgroundColor: `${(ti.risk > 0 ? riskColor(ti.band, C) : C.ash)}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3 }}>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, ti.risk > 0 ? riskColor(ti.band, C) : C.ash) }}>{ti.risk}</Text>
                      </View>
                    </View>
                  </View>
                ))}
                {/* WHY THE DASH — an athlete who IS training but has no chronic
                    baseline yet reads "—" in the ACWR column. Say why, rather
                    than leaving a blank that looks like a broken number. The
                    engine decides who sees this (awaitingBaseline), so web and
                    mobile can never disagree about it. */}
                {risk.awaitingBaseline.length > 0 && (
                  <View style={{ marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: `${C.ash}14` }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash, marginBottom: 4 }}>{t("w.injury.acwrPending")}</Text>
                    <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: 18, color: C.chalk }}>{t("w.injury.acwrPendingBody")}</Text>
                  </View>
                )}
                {/* WHAT'S RAISING THIS? — plain-language guidance for each driver
                    at play (workload spike, high load, return-from-lull, recovery). */}
                {driverKinds.length > 0 && (
                  <View style={{ marginTop: 12, gap: 10 }}>
                    {driverKinds.map((k) => (
                      <View key={k}>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: txt(C, riskColor(risk.band, C)), marginBottom: 3 }}>{t(RISK_DRIVER_LABEL_KEY[k])}</Text>
                        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: 18, color: C.chalk }}>{t(RISK_DRIVER_EXPLAIN_KEY[k])}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </View>
        </ACard>
      )}

      {/* 5 · THIS WEEK — recap & PRs */}
      {hasData && (
        <Pressable onPress={() => router.push("/statistics")} style={{ marginTop: 14 }}>
          <ACard>
            <SHead
              C={C} scheme={scheme}
              title={t("w.home.today.yourWeek")}
              metaNode={recap.prs.length > 0 ? <View style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}><Text style={{ fontFamily: F.mono, fontSize: fs.micro, fontWeight: "700", color: C.onAccent }}>🏆 {recap.prs.length} {t("w.home.cockpit.newPrs")}</Text></View> : undefined}
            />
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1 }}><Stat C={C} label={t("w.home.today.sessions")} value={`${recap.sessions}`} /></View>
              <View style={{ flex: 1 }}><Stat C={C} label={`${t("w.home.today.volume")} kg`} value={recap.volume.toLocaleString()} /></View>
              <View style={{ flex: 1 }}><Stat C={C} label={t("w.home.today.sets")} value={`${recap.sets}`} /></View>
            </View>
            {recap.prs.length > 0 && (
              <View style={{ marginTop: 14 }}>
                {recap.prs.slice(0, 4).map((p) => (
                  <View key={p.lift} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.line }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{p.lift}</Text>
                    {/* The weight actually lifted (#231) — this row and the session
                        summary describe the same PR, so they must agree. Formatted
                        through the shared helper: topLoad is 0.1-rounded, so a raw
                        subtraction would print +4.799999999999997. */}
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: txt(C, C.lime) }}>{fmtWeight(p.topLoad, "kg")}{p.previousTopLoad == null || p.topLoad <= p.previousTopLoad ? "" : ` – ${strengthPrDelta(p, { first: "", moreReps: "" })}`}</Text>
                  </View>
                ))}
              </View>
            )}
          </ACard>
        </Pressable>
      )}

      {/* 6 · BREAKDOWN — disciplines, tabbed */}
      {hasData && <Breakdown C={C} scheme={scheme} state={state} recap={recap} totals={totals} sport={sport} profiles={profiles} onOpen={(h) => router.push(h)} />}

      {/* 7 · HORIZON — Sport S&C · Velocity · Endurance · AI Coach */}
      <ACard style={{ marginTop: 14 }}>
        <SHead C={C} scheme={scheme} title={t("w.home.cockpit.horizon")} />
        <Mod C={C} label={t("w.home.cockpit.sportSC")} value={sport ? `${sport.sport} – ${LEVELS[sport.levelIdx]}` : t("w.home.cockpit.sport")} onPress={() => router.push("/(tabs)/sport")} />
        <Mod C={C} label={t("w.home.cockpit.velocity")} value={t("w.home.cockpit.velocityValue")} mono onPress={() => router.push("/(tabs)/velocity")} />
        <Mod C={C} label={t("w.home.cockpit.endurance")} value={totals.efforts > 0 ? `${totals.efforts} – ${totals.distanceKm.toLocaleString()} km – ${totals.minutes.toLocaleString()} min` : t("w.home.cockpit.tab.endurance")} mono onPress={() => router.push("/(tabs)/endurance")} />
        {/* The AI coach's one door on mobile — the prescription lives here. */}
        <Mod C={C} label={t("w.home.cockpit.aiCoach")} value={t("w.home.cockpit.aiCoachValue")} mono onPress={() => router.push("/ai-coach")} last />
      </ACard>

      {/* 8 · GOAL + SEASON — two separate widgets (like Today's RECOVER duo) */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 14 }}>
        {/* widget 1 — goal */}
        <ACard style={{ flex: 1 }}>
          <SHead C={C} scheme={scheme} title={t("w.home.cockpit.goal")} small />
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
          <SHead C={C} scheme={scheme} title={macro ? t("w.home.cockpit.season") : t("w.home.cockpit.setUp")} meta={macro ? `${seasonPct}%` : undefined} small />
          {macro ? (
            <View style={{ height: 6, borderRadius: 99, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, overflow: "hidden", marginTop: 2, marginBottom: 10 }}>
              <View style={{ width: `${seasonPct}%`, height: 6, backgroundColor: C.violet }} />
            </View>
          ) : (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2, marginBottom: 10, lineHeight: 16 }}>{t("w.home.cockpit.fourQuestions")}</Text>
          )}
          <View style={{ gap: 8 }}>
            {macro && <Pressable onPress={() => router.push("/periodize")}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.cockpit.periodize")} →</Text></Pressable>}
            <Pressable onPress={() => router.push("/onboarding")}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.cockpit.openSetup")}</Text></Pressable>
          </View>
        </ACard>
      </View>

      {/* 9 · RETURN-TO-PLAY — gated protocols (from the standalone screen).
          Bottom placement matches its cadence: empty most days; when a tissue is
          flagged above, the protocol you open lands on the same page. */}
      <RtpPanel />
    </AuroraScreen>
  );
}

/* ---------- Breakdown (tabbed disciplines) ---------- */
type BreakTab = "strength" | "endurance" | "sport" | "velocity";
function Breakdown({ C, scheme, state, recap, totals, sport, profiles, onOpen }: {
  C: Palette; scheme: Scheme;
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
      <SHead C={C} scheme={scheme} title={t("w.home.cockpit.breakdown")} />
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
              <Pressable onPress={() => onOpen("/(tabs)/endurance")} style={{ marginTop: 14 }}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.cockpit.tab.endurance")} →</Text></Pressable>
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
/** SectionHead — the golden-standard card header (Explore's SectionHead idiom):
 *  a bold display-face title on the left, any meta/action as small mono
 *  uppercase (or a pill) on the RIGHT of the same row. No decorative dot. */
function SHead({ C, scheme, title, meta, metaNode, titleColor, small }: {
  C: Palette; scheme: Scheme; title: string; meta?: string; metaNode?: React.ReactNode; titleColor?: string; small?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: 4, columnGap: 12, marginBottom: 12 }}>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: small ? fs.bodyLg : 18, letterSpacing: -0.2, color: titleColor ?? C.chalk }}>{title}</Text>
      {metaNode ?? (meta != null && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{meta}</Text>
      ))}
    </View>
  );
}

function Pill({ C, children, dot }: { C: Palette; children: React.ReactNode; dot?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
      {dot && <View style={{ width: 7, height: 7, borderRadius: 5, backgroundColor: dot }} />}
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.chalk }}>{children}</Text>
    </View>
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

function Comp({ C, scheme, label, value }: { C: Palette; scheme: Scheme; label: string; value: string }) {
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

function Mod({ C, label, value, onPress, mono, last }: { C: Palette; label: string; value: string; onPress: () => void; mono?: boolean; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: last ? 0 : 1, borderBottomColor: `${C.line}99` }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>{label}</Text>
      <Text style={{ marginLeft: "auto", fontFamily: mono ? F.mono : F.bold, fontSize: mono ? fs.caption : fs.body, color: mono ? C.ash : C.chalk }}>{value} →</Text>
    </Pressable>
  );
}

/* ---------- Return-to-play (from the retired standalone screen) ---------- */
const RTP_TISSUES = ["quads", "glutes", "posterior", "back", "chest", "shoulders", "triceps"];

function auditText(a: RtpAuditEntry): string {
  switch (a.action) {
    case "attest": return `attested "${a.gate}"`;
    case "retract": return `retracted "${a.gate}"`;
    case "advance": return `advanced ${a.from} → ${a.to}`;
    case "override": return `OVERRODE ${a.from} → ${a.to}: ${a.reason}`;
    case "abandon": return "abandoned protocol";
    default: return a.action;
  }
}

/** Return-to-play rails (parity with web's RtpPanel). Each protocol shows its
 *  gated stage; the athlete can't advance until every gate is met — the core
 *  engine (evaluateRtp) enforces it and the backend logs an audit trail. */
function RtpPanel() {
  const { palette: C } = useTheme();
  const [protocols, setProtocols] = useState<RtpProtocol[]>([]);
  const [tissue, setTissue] = useState("posterior");
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const refresh = () => { fetchRtpProtocols().then(setProtocols); };
  useEffect(() => { refresh(); }, []);

  const create = async () => { if (await createRtpProtocol(tissue)) refresh(); };
  const mutate = async (id: string, body: object) => { if (await mutateRtpProtocol(id, body)) refresh(); };
  const doOverride = async (id: string) => {
    if (!reason.trim()) return;
    await mutate(id, { action: "override", reason });
    setOverrideFor(null);
    setReason("");
  };

  const active = protocols.filter((p) => p.status !== "abandoned");

  return (
    <ACard style={{ marginTop: 14 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.red) }}>Return-to-play – gated protocols</Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
        {RTP_TISSUES.map((tt) => {
          const on = tt === tissue;
          return (
            <Pressable key={tt} onPress={() => setTissue(tt)} accessibilityRole="radio" accessibilityState={{ selected: on }} style={{ borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? `${C.lime}1f` : "transparent", paddingHorizontal: 12, paddingVertical: 6 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: on ? txt(C, C.lime) : C.ash, textTransform: "capitalize" }}>{tt}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={create} accessibilityRole="button" style={{ alignSelf: "flex-start", marginTop: 10, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 16, paddingVertical: 9 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Open protocol</Text>
      </Pressable>

      <View style={{ marginTop: 14, gap: space.md }}>
        {active.length === 0 && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>No active protocols. Open one when an athlete is injured.</Text>
        )}
        {active.map((p) => {
          const ev = evaluateRtp({ stage: p.stage, completed: p.completed });
          const cleared = p.stage === "cleared";
          const accent = cleared ? C.lime : C.blue;
          return (
            <View key={p.id} style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, textTransform: "capitalize" }}>{p.tissue}</Text>
                <View style={{ backgroundColor: `${accent}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 3 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, accent) }}>{STAGE_LABEL[p.stage]}</Text>
                </View>
              </View>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: C.ink, marginVertical: 10, overflow: "hidden" }}>
                <View style={{ width: `${Math.round(ev.progress * 100)}%`, height: "100%", backgroundColor: accent }} />
              </View>
              {!cleared && (
                <>
                  {ev.gates.map((g) => (
                    <Pressable key={g.key} onPress={() => mutate(p.id, { action: "toggleGate", gate: g.key })} accessibilityRole="checkbox" accessibilityState={{ checked: g.done }} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 5 }}>
                      {g.done
                        ? <AuroraIcon name="check-circle" size={18} color={C.lime} />
                        : <View style={{ width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: C.ash }} />}
                      <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: g.done ? txt(C, C.lime) : C.ash }}>{g.label}</Text>
                    </Pressable>
                  ))}
                  <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm, marginTop: 10 }}>
                    <Pressable onPress={() => mutate(p.id, { action: "advance" })} disabled={!ev.canAdvance} accessibilityRole="button" style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8, opacity: ev.canAdvance ? 1 : 0.4 }}>
                      <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Advance → {ev.nextStage ? STAGE_LABEL[ev.nextStage] : ""}</Text>
                    </Pressable>
                    {!ev.canAdvance && (
                      <>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.amber) }}>{ev.blockedBy.length} gate(s) remaining</Text>
                        <Pressable onPress={() => setOverrideFor(overrideFor === p.id ? null : p.id)} accessibilityRole="button" style={{ borderWidth: 1, borderColor: C.red, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8 }}>
                          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.red) }}>Override</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                  {overrideFor === p.id && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: 10 }}>
                      <TextInput
                        value={reason}
                        onChangeText={setReason}
                        placeholder="Reason (logged to audit)"
                        placeholderTextColor={C.ash}
                        accessibilityLabel="Override reason"
                        style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 9 }}
                      />
                      <Pressable onPress={() => doOverride(p.id)} accessibilityRole="button" style={{ backgroundColor: C.red, borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 9 }}>
                        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.onAccent }}>Force advance</Text>
                      </Pressable>
                    </View>
                  )}
                </>
              )}
              {p.audit && p.audit.length > 0 && (
                <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 1, color: C.ash }}>Audit trail</Text>
                  {p.audit.slice(-5).reverse().map((a, i) => (
                    <Text key={i} style={{ fontFamily: F.mono, fontSize: fs.micro, color: a.action === "override" ? txt(C, C.red) : C.ash, marginTop: 4 }}>
                      {new Date(a.ts).toLocaleDateString()} – {a.by} ({a.role.toLowerCase()}) – {auditText(a)}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </ACard>
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
