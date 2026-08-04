import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, ScrollView } from "react-native";
import Svg, { Path, Line, Circle, Rect } from "react-native-svg";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession, computePerformanceState, computeInjuryRisk, computeLoad, performanceTrajectory,
  capabilityTrend, stateVerdict, trajectoryPlot, sessionDaysAgo,
  runTotals, enduranceSessions, personalTrainingLog, toBiometrics,
  weeklyVolumeTrend, fmtTonnage, fmtWeight, paceClock,
  velocityProfiles, hpiRole, readinessRole, quickCheckinFeeling, READINESS_FACE, SPORTS, LEVELS,
  readinessReasons, readinessVerdict, readinessReasonsKey, readinessDeficit, readinessRingTicks,
  localDayKey, INJURY_AREA_KEY,
  type CapabilityMovement,
} from "@hybrid/core";
import { useSessionsRead, useSignalsRead, useMacrocycleRead, useCheckinsRead, combineReads } from "../../lib/queries";
import { useToday } from "../../lib/use-today";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useSession } from "../../lib/session";
import { usePersona, setClientPersona } from "../../lib/persona";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { leading, fs, space, F, serifIf, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, ASub, RADIUS, Ring, withAlpha, ASection } from "./kit";
import AuroraVolume from "./volume";
import { AuroraIcon } from "./icons";
import TissueCard from "./tissue-card";
import ReadinessFace from "./readiness-face";
import FetchError from "./fetch-error";
import { CtaLabel } from "./cta-label";

type Palette = ReturnType<typeof useTheme>["palette"];
type Scheme = ReturnType<typeof useTheme>["scheme"];
const hpiColor = (b: string, C: Palette) => roleColor(C, hpiRole(b));
const readyColor = (v: number, C: Palette) => roleColor(C, readinessRole(v));
/** The plot's box — the SAME box web uses, because both clients now stroke the
 *  same paths from the same shared geometry. react-native-svg is already in the
 *  app (the injury mannequin), so mobile no longer has to approximate the chart
 *  with bars and markers: the fourteen days have one shape on both clients. */
const PLOT = { width: 318, height: 104, pad: 10 };

/**
 * AURORA Performance (mobile) — the athlete hub, at SIX surfaces. Mirrors
 * apps/web/components/aurora/performance.tsx exactly.
 *
 * It was twenty. Volume and Trends had been absorbed whole and took roughly two
 * thirds of the scroll; eleven cards restated something a neighbour had already
 * said, or said something that belongs on a screen of its own. What is left:
 * masthead with a computed VERDICT sentence → YOUR STATE (freshness, the
 * wearable's signed contribution, the limiter as a sentence, two freshness
 * columns, the CAPABILITY trend, the fourteen-day plot with its sessions
 * marked, readiness) → TISSUE → this week's VOLUME hero + a door → SEASON →
 * the exits.
 *
 * Cut: the HPI and ACWR chips, "Your week" (its PRs moved to Today's activity
 * card, which owns the week on a real calendar window), the Breakdown tabs
 * (three of four panels duplicated the exit rows), the band glossary and the
 * four group markers.
 *
 * See audit/10-performance-tab-element-audit-2026-08.md.
 */
export default function AuroraPerformance({ top }: { top?: ReactNode }) {
  const persona = usePersona();
  const { entitlement } = useSession();
  const router = useRouter();
  if (persona === "casual") {
    return <Teaser paid={entitlement === "paid"} onUnlock={() => (entitlement === "paid" ? setClientPersona("athlete", true) : router.push("/upgrade"))} top={top} />;
  }
  return <Full top={top} />;
}

function Full({ top }: { top?: ReactNode }) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  // SAFE CACHE (lib/queries.ts `Read`): each source reports whether it has a
  // real, server-returned value — never a bare array that a first render can't
  // tell apart from "no training history". The screen renders cached values
  // instantly and revalidates behind the spinner; it renders CLAIMS (the
  // zero-states below) only once `ready`.
  const sessionsRead = useSessionsRead();
  const signalsRead = useSignalsRead();
  const macroRead = useMacrocycleRead();
  const checkinsRead = useCheckinsRead();
  const { refreshing, failed } = combineReads(sessionsRead, signalsRead, macroRead, checkinsRead);
  const sessions = sessionsRead.data ?? [];
  const signals = signalsRead.data ?? [];
  const checkins = checkinsRead.data ?? [];
  const macro = macroRead.data?.macro ?? null;
  const currentWeek = macroRead.data?.currentWeek ?? 1;
  const load = () => {
    sessionsRead.retry(); signalsRead.retry(); macroRead.retry(); checkinsRead.retry();
  };

  const [sport, setSport] = useState<{ sport: string; levelIdx: number } | null>(null);

  useEffect(() => {
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
  const log = useMemo(() => personalTrainingLog(sessions), [sessions]);
  const today = useToday();
  const todayFeeling = useMemo(
    () => quickCheckinFeeling(checkins.find((x) => x && x.weekOf && localDayKey(x.weekOf) === today) ?? null),
    [checkins, today],
  );
  // ONE velocityProfiles pass, shared by the prescription and the exits.
  const profiles = useMemo(() => velocityProfiles(sessions), [sessions]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles, subjectiveReadiness: todayFeeling ?? undefined }), [log, bio, profiles, todayFeeling]);
  // The block's face and what sits behind its door. `readinessReasons` is
  // `readinessWhy` minus its score line — the ring draws that number already.
  const whyLines = useMemo(() => readinessReasons(log, bio), [log, bio]);
  const verdictReadiness = useMemo(() => readinessVerdict(log, bio), [log, bio]);
  // The ring accounts for the whole 100: what today kept, and what each cause
  // took. `kept` IS the score the figure prints, so the arcs and the number can
  // never be two readings of the same day.
  const deficit = useMemo(() => readinessDeficit(log, bio), [log, bio]);
  const ringTicks = useMemo(() => readinessRingTicks(deficit), [deficit]);
  const [whyOpen, setWhyOpen] = useState(false);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const loadState = useMemo(() => computeLoad(sessions), [sessions]);
  const bw = useBodyweightLookup();
  // Capability — the half a "performance" screen was missing. Freshness says
  // whether you can train today; this says whether any of it is working.
  const capability = useMemo(() => capabilityTrend(sessions, { bw }), [sessions, bw]);
  // ONE trajectory pass, WITH the wearable, so the plot's last point is the
  // figure printed above it. It used to be computed twice and the copy feeding
  // the sparkline omitted `bio` — two numbers for the same day in one card.
  const traj = useMemo(() => performanceTrajectory(log, 14, bio), [log, bio]);
  const trained = useMemo(() => sessionDaysAgo(sessions.map((s) => s.startedAt), Date.now()), [sessions]);
  const plot = useMemo(() => trajectoryPlot(traj, trained, PLOT), [traj, trained]);
  const verdict = useMemo(() => stateVerdict(state.hpi, risk), [state.hpi, risk]);
  const totals = useMemo(() => runTotals(enduranceSessions(sessions)), [sessions]);
  // The Trends door's value — this week's two figures, from the SAME engine the
  // Trends screen leads with, so the door and what it opens agree.
  const prefs = useLoggerPrefs();
  const weeks = useMemo(() => weeklyVolumeTrend(sessions, 8, Date.now(), prefs.countWarmupsInVolume, bw), [sessions, prefs.countWarmupsInVolume, bw]);

  const hasData = sessionsRead.ready && sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];
  const seasonPct = macro && macro.totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / macro.totalWeeks) * 100)) : 0;

  const season = macro ? `${macro.goalOrSport} – ${t("w.home.cockpit.week")} ${currentWeek} ${t("w.home.cockpit.of")} ${macro.totalWeeks}` : "";
  // The verdict sentence: freshness, then the tissue worth watching. It says
  // nothing the two cards below don't also say in full — the only licence a
  // summary above the fold ever has.
  const verdictLine = !hasData
    ? t("w.home.cockpit.verdict.empty")
    : [t(verdict.headKey), verdict.tissueKey && verdict.tissue
        ? t(verdict.tissueKey).replace("{tissue}", t(INJURY_AREA_KEY[verdict.tissue]))
        : null].filter(Boolean).join(" ");

  return (
    <AuroraScreen
      refreshing={refreshing}
      onRefresh={load}
      top={top}
      hero={top ? undefined : { rank: "title", title: t("w.home.cockpit.commandCenter"), eyebrow: season || undefined }}
    >
      {top && (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{season || " "}</Text>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 32, letterSpacing: -1, color: C.chalk, marginTop: 6 }}>{t("w.home.cockpit.commandCenter")}</Text>
        </>
      )}
      <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: hasData ? C.chalk : C.ash, marginTop: top ? 6 : 4, lineHeight: leading(fs.body) }}>{verdictLine}</Text>
      {(phaseBlock || macro?.eventInWeeks != null) && (
        // Full-bleed chip rail — clips at the screen edge, rests on the column.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {phaseBlock && <MetaPill C={C} dot={C.lime}><Text style={{ fontFamily: F.bold, color: C.chalk }}>{phaseBlock.label}</Text> {t("w.home.today.phase")}</MetaPill>}
          {macro?.eventInWeeks != null && <MetaPill C={C} icon={<AuroraIcon name="calendar-event" size={13} color={C.chalk} />}><Text style={{ fontFamily: F.bold, color: C.chalk }}>{macro.eventInWeeks} {t("w.home.cockpit.wk")}</Text> {t("w.home.cockpit.eventIn")}</MetaPill>}
        </ScrollView>
      )}

      {/* A load FAILURE is its own state, never emptiness. */}
      {failed && !sessionsRead.ready && <FetchError onRetry={load} style={{ marginTop: 16 }} />}

      {/* 2 · YOUR STATE — the thesis, and the one block that got BIGGER. */}
      <ACard solid style={{ marginTop: 16 }}>
        <ASection title={t("w.home.cockpit.stateTitle")} />
        {hasData ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 44, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>
                  {t("w.home.cockpit.freshness")} — {state.hpi.band}
                </Text>
                {/* The wearable rides the headline as the signed adjustment it
                    is (±15), rather than standing as a peer of two 0..100
                    indices in a third column. */}
                {state.hpi.components.recovery !== 0 && (
                  <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>
                    {t("w.home.cockpit.wearableOf").replace("{n}", `${state.hpi.components.recovery > 0 ? "+" : ""}${state.hpi.components.recovery}`)}
                  </Text>
                )}
              </View>
            </View>
            {/* The limiter is the one actionable word on the card, so it gets a
                sentence — not the tail of a mono caption. The driver detail is
                the line the Breakdown card used to carry. */}
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 12, lineHeight: leading(fs.body) }}>
              <Text style={{ fontFamily: F.bold, color: C.chalk }}>{t(`w.home.cockpit.limiter.${state.hpi.limiter}`)}</Text>
              {state.drivers[0] ? ` ${state.drivers[0].detail}.` : ""}
            </Text>

            <View style={{ flexDirection: "row", marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
              <Comp C={C} scheme={scheme} label={t("w.home.cockpit.strengthFresh")} value={`${state.hpi.components.strength}`} />
              <Comp C={C} scheme={scheme} label={t("w.home.cockpit.enduranceFresh")} value={`${state.hpi.components.endurance}`} />
            </View>

            {/* CAPABILITY — freshness rises on a layoff; this does not. */}
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>
                  {t("w.home.cockpit.capability").replace("{n}", String(capability.weeks))}
                </Text>
                {capability.pct !== null && (
                  <Text style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: fs.subtitle, fontWeight: "700", color: txt(C, capability.pct >= 0 ? C.lime : C.amber) }}>
                    {capability.pct > 0 ? "+" : ""}{capability.pct}%
                  </Text>
                )}
              </View>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 5, lineHeight: leading(fs.caption) }}>
                {capability.pct === null ? t("w.home.cockpit.capabilityEmpty") : capabilityLine(capability.strength, capability.endurance)}
              </Text>
            </View>

            {/* THE PLOT. Mobile ships no SVG renderer, so freshness is drawn as
                bars and readiness as a per-day marker — but both are sized from
                the SHARED geometry (@hybrid/core trajectoryPlot), so the domain,
                the days and the session marks are identical to web's line. Form
                carries the series identity here, never hue alone. */}
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{t("w.home.cockpit.last14")}</Text>
                <Text style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>
                  {t("w.home.cockpit.shownRange").replace("{lo}", String(plot.lo)).replace("{hi}", String(plot.hi))}
                </Text>
              </View>
              <Svg width="100%" height={PLOT.height + 12} viewBox={`0 0 ${PLOT.width} ${PLOT.height + 12}`} style={{ marginTop: 8 }}>
                <Line x1={0} y1={plot.baselineY} x2={PLOT.width} y2={plot.baselineY} stroke={C.line} strokeWidth={1} />
                {/* Readiness is DASH-encoded, not hue-encoded — Kyoto Hour's
                    muted ramp can't separate two solid hues, so line style
                    carries the identity on both themes and both clients. */}
                <Path d={plot.readyD} fill="none" stroke={C.blue} strokeWidth={2} strokeDasharray="5,4" strokeLinejoin="round" strokeLinecap="round" />
                <Path d={plot.hpiD} fill="none" stroke={C.lime} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                <Circle cx={plot.last.x} cy={plot.last.y} r={3.4} fill={C.lime} />
                {/* SESSION MARKS — a dip nobody can attribute is decoration. */}
                {plot.sessionX.map((x, i) => (
                  <Rect key={i} x={x - 1} y={plot.baselineY + 4} width={2} height={8} rx={1} fill={C.ash} />
                ))}
              </Svg>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 6, lineHeight: leading(fs.nano) }}>{t("w.home.cockpit.trajectoryKey")}</Text>
            </View>

            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
              {/* THE DEFICIT RING — the kept run in the readiness role's own
                  colour, then one run per cause. The tick geometry is the one
                  the athlete already knows; only what the unlit ticks MEAN has
                  changed. Mirrors web. */}
              <Ring
                value={deficit.kept}
                size={56}
                color={readyColor(deficit.kept, C)}
                track={C.line}
                tickColors={ringTicks.map((s) => (s.kind === "kept" ? readyColor(deficit.kept, C) : roleColor(C, s.role)))}
              >
                <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{deficit.kept}</Text>
              </Ring>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{t("w.home.cockpit.todayReadiness")}</Text>
                {/* THE FACE — one line, naming the limiter and nothing else.
                    This block used to open with ~38 words of prose restating
                    figures the ring beside it already draws; the sentences now
                    live behind the door below, unedited. Mirrors web. */}
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 5, lineHeight: leading(fs.subtitle) }}>
                  {t(verdictReadiness.key).replace(
                    "{tissue}",
                    verdictReadiness.muscle ? t(`w.home.today.muscle.${verdictReadiness.muscle}`) : "",
                  )}
                </Text>
                {/* READINESS NUDGE — the one-tap check-in moved today's load;
                    glanceable, tinted in the feeling's own accent. Mirrors web. */}
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
                {/* THE DOOR — the derivation, one tap down. Nothing left the
                    product, only the default view: these are the same lines the
                    block used to lead with. It counts what is actually behind
                    it, so it can't promise three reasons and open onto two. */}
                {whyLines.length > 0 && verdictReadiness.kind !== "empty" && (
                  <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
                    <Pressable
                      onPress={() => setWhyOpen((v) => !v)}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: whyOpen }}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                    >
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>
                        {t(verdictReadiness.doorKey).replace("{n}", String(verdictReadiness.deficit))}
                      </Text>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.9, color: C.chalk }}>
                          {t(readinessReasonsKey(whyLines.length)).replace("{n}", String(whyLines.length))}
                        </Text>
                        <AuroraIcon name="chevron-down" size={12} color={C.ash} style={whyOpen ? { transform: [{ rotate: "180deg" }] } : undefined} />
                      </View>
                    </Pressable>
                    {whyOpen && (
                      <View style={{ marginTop: 11 }}>
                        {/* THE LEDGER — the arcs, as arithmetic you can audit.
                            Same points, same order, same colours as the ring
                            above; the engine guarantees the rows sum to the
                            figure inside it. */}
                        <View style={{ gap: 7 }}>
                          <LedgerRow C={C} label={t("w.home.readiness.baseline")} value="100" />
                          {deficit.costs.map((c, i) => (
                            <LedgerRow
                              key={i}
                              C={C}
                              swatch={roleColor(C, c.role)}
                              label={t(c.key).replace("{tissue}", c.muscle ? t(`w.home.today.muscle.${c.muscle}`) : "")}
                              value={`−${c.points}`}
                              tint={txt(C, roleColor(C, c.role))}
                            />
                          ))}
                          <View style={{ height: 1, backgroundColor: C.line }} />
                          <LedgerRow C={C} label={t("w.home.readiness.total")} value={String(deficit.kept)} strong />
                        </View>
                        <View style={{ gap: 5, marginTop: 12 }}>
                          {whyLines.map((line, i) => (
                            <Text key={i} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{line}</Text>
                          ))}
                        </View>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>
          </>
        ) : sessionsRead.ready ? (
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{t("w.home.cockpit.twinEmpty")}</Text>
        ) : (
          <StateSkeleton C={C} />
        )}
      </ACard>

      {/* 3 · TISSUE — its SHAPE is the signal: short while nothing is wrong,
          opening itself the moment a tissue is flagged. The running protocol
          moved to Today, where an injured athlete meets it on the morning they
          have to do it; this card keeps the status line and the door. */}
      <TissueCard risk={risk} load={loadState} hasData={hasData} onOpenToday={() => router.push("/")} />

      {/* 4 · THIS WEEK'S VOLUME — the hero shape, a verdict that names names,
          and the rest of it in a drawer. The block ramp, the prescriptions and
          the muscle rails now ease open UNDERNEATH the columns that raised the
          question rather than living on another screen; the provenance ladder
          and the working are dispatched from there as a sheet. */}
      <View style={{ marginTop: 16 }}>
        <AuroraVolume compact />
      </View>

      {/* 5 · SEASON — one card. The bar draws the fraction, so the line names
          the week once instead of restating it as a percentage. */}
      <ACard solid style={{ marginTop: 16 }}>
        <ASection
          title={!macroRead.settled ? " " : macro ? macro.goalOrSport : t("w.home.cockpit.setUp")}
          meta={macro && phaseBlock ? phaseBlock.label : undefined}
        />
        {macro ? (
          <>
            <View style={{ height: 6, borderRadius: RADIUS.pill, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, overflow: "hidden", marginTop: 2, marginBottom: 9 }}>
              <View style={{ width: `${seasonPct}%`, height: 6, backgroundColor: C.violet }} />
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>
              {t("w.home.cockpit.seasonWeekOf").replace("{n}", String(currentWeek)).replace("{total}", String(macro.totalWeeks))}
            </Text>
          </>
        ) : macroRead.settled ? (
          <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, lineHeight: leading(fs.caption) }}>{t("w.home.cockpit.fourQuestions")}</Text>
        ) : (
          <Rule C={C} w="90%" h={12} />
        )}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
          {macro && <Pressable onPress={() => router.push("/periodize")}><CtaLabel label={`${t("w.home.cockpit.periodize")} →`} color={txt(C, C.lime)} fontSize={fs.caption} font={F.mono} /></Pressable>}
          <Pressable onPress={() => router.push("/onboarding")}>
            <CtaLabel label={`${macro ? t("w.home.cockpit.changeSeason") : t("w.home.cockpit.setUp")} →`} color={txt(C, C.lime)} fontSize={fs.caption} font={F.mono} />
          </Pressable>
        </View>
      </ACard>

      {/* 6 · GO DEEPER — the exits. Every row carries a live value, because a
          door that tells you what is behind it is the only kind worth a row. */}
      <ACard solid style={{ marginTop: 16 }}>
        <ASection title={t("w.home.cockpit.deeper")} />
        <Mod C={C} label={t("w.home.cockpit.trends")} value={trendsValue(weeks, prefs.units, t) ?? t("w.home.cockpit.last7")} onPress={() => router.push("/trends")} />
        <Mod
          C={C}
          label={t("w.home.cockpit.endurance")}
          value={totals.efforts > 0 ? `${totals.efforts} ${t("w.home.cockpit.efforts")} – ${totals.distanceKm.toLocaleString()} km` : t("w.home.cockpit.tab.endurance")}
          onPress={() => router.push("/endurance")}
        />
        <Mod C={C} label={t("w.home.cockpit.velocity")} value={velocityValue(profiles) ?? t("w.home.cockpit.velocityValue")} onPress={() => router.push("/velocity")} />
        <Mod
          C={C}
          label={t("w.home.cockpit.sportSC")}
          value={sport ? `${sport.sport} – ${LEVELS[sport.levelIdx]}` : t("w.home.cockpit.sport")}
          onPress={() => (sport ? router.push({ pathname: "/sport-page", params: { name: sport.sport } }) : router.push("/sport"))}
        />
        <Mod C={C} label={t("w.home.cockpit.askCoach")} value={coachQuestion(t, hasData, verdict, capability, state.hpi.limiter)} onPress={() => router.push("/ai-coach")} last />
      </ACard>
    </AuroraScreen>
  );
}

/* ---------- capability copy ---------- */
/** The evidence under the capability percent: one lift and one paced move, in
 *  their OWN units. A lift is kilograms and a run is a pace — they share a line
 *  but never a number. */
function capabilityLine(strength: CapabilityMovement | null, endurance: CapabilityMovement | null): string {
  const parts: string[] = [];
  if (strength) parts.push(`${strength.name} ${fmtWeight(strength.from, "kg")} → ${fmtWeight(strength.to, "kg")}`);
  if (endurance) parts.push(`${endurance.name} ${paceClock(endurance.from)} → ${paceClock(endurance.to)} /km`);
  return parts.join(". ");
}

/** The Trends door's value — the week's sets and tonnage, which is exactly what
 *  the Trends sheet leads with. A door that tells you what is behind it. */
function trendsValue(weeks: ReturnType<typeof weeklyVolumeTrend>, units: "kg" | "lb", t: (k: string) => string): string | null {
  const last = weeks[weeks.length - 1];
  if (!last || (last.sets === 0 && last.tonnage === 0)) return null;
  return `${last.sets} ${t("w.home.cockpit.sets").toLowerCase()} – ${fmtTonnage(last.tonnage, units)}`;
}

/**
 * THE COACH DOOR'S VALUE — the question it would ask now.
 *
 * "Ask about today" was a static string on a row whose whole pattern promises a
 * value, so it was the one door that could not be glanced. Generated from what
 * this page already holds, in priority order: a flagged tissue outranks a
 * stalled lift, which outranks the day's limiter. Mirrors web.
 */
function coachQuestion(
  t: (k: string) => string,
  hasData: boolean,
  verdict: ReturnType<typeof stateVerdict>,
  capability: ReturnType<typeof capabilityTrend>,
  limiter: string,
): string {
  if (!hasData) return t("w.home.cockpit.aiCoachValue");
  if (verdict.tissue) return t("w.home.cockpit.ask.tissue").replace("{tissue}", t(INJURY_AREA_KEY[verdict.tissue]).toLowerCase());
  const stalled = capability.movements.find((m) => m.pct < 0);
  if (stalled) return t("w.home.cockpit.ask.stalled").replace("{lift}", stalled.name);
  return t(`w.home.cockpit.ask.limiter.${limiter}`);
}

/** The velocity door's value — the profile it would actually open with. */
function velocityValue(profiles: ReturnType<typeof velocityProfiles>): string | null {
  const best = Object.entries(profiles).filter(([, p]) => p.estimated1rm > 0).sort((a, b) => b[1].estimated1rm - a[1].estimated1rm)[0];
  return best ? `${best[0]} ${Math.round(best[1].estimated1rm)}kg – R² ${best[1].r2.toFixed(2)}` : null;
}

/* ---------- primitives ---------- */
/**
 * A sized rectangle — a hairline or a spacer rule. A layout helper, not a
 * meter: the caller passes an explicit width and height, and nothing here reads
 * a value.
 */
function Rule({ C, w, h, mt }: { C: Palette; w: number | `${number}%`; h: number; mt?: number }) {
  return <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: C.line, opacity: 0.45, marginTop: mt }} />;
}

/** One row of the readiness ledger: the arc's own colour, what it is, what it
 *  cost. Tabular by construction — every value sits on the same right edge. */
function LedgerRow({
  C, label, value, swatch, tint, strong,
}: { C: Palette; label: string; value: string; swatch?: string; tint?: string; strong?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: swatch ?? "transparent" }} />
      <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: strong ? C.chalk : C.ash }} numberOfLines={2}>{label}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: strong ? "700" : "400", color: strong ? C.chalk : tint ?? C.ash }}>{value}</Text>
    </View>
  );
}

/** The state card's unknown state. Occupies roughly the shape of the real thing
 *  so the card doesn't resize under the reader when the data lands. */
function StateSkeleton({ C }: { C: Palette }) {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Rule C={C} w={64} h={40} />
        <View style={{ flex: 1, gap: 8 }}>
          <Rule C={C} w="70%" h={11} />
          <Rule C={C} w="100%" h={20} />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 12, marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
        <View style={{ flex: 1, gap: 8 }}><Rule C={C} w="55%" h={18} /><Rule C={C} w="80%" h={9} /></View>
        <View style={{ flex: 1, gap: 8 }}><Rule C={C} w="55%" h={18} /><Rule C={C} w="80%" h={9} /></View>
      </View>
    </View>
  );
}

/**
 * A status READOUT — not a chip.
 *
 * It survives the chip consolidation because it is a different object: a
 * neutral ink2 surface (not an accent tint), sentence-case mixed-weight children
 * (not a single uppercase label), and a leading SEMANTIC dot or icon carrying
 * state. `Chip` in lib/ui is a tag; `AChip` in the kit is a filter; this reads a
 * value. Named for the job so the next person does not merge it by its old name.
 */
function MetaPill({ C, children, dot, icon }: { C: Palette; children: React.ReactNode; dot?: string; icon?: ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
      {dot && <View style={{ width: 7, height: 7, borderRadius: 5, backgroundColor: dot }} />}
      {icon}
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.chalk }}>{children}</Text>
    </View>
  );
}

function Comp({ C, scheme, label, value }: { C: Palette; scheme: Scheme; label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 24, color: C.chalk, letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash, marginTop: 6 }}>{label}</Text>
    </View>
  );
}

function Mod({ C, label, value, onPress, last }: { C: Palette; label: string; value: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: `${C.line}99` }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{label}</Text>
      <CtaLabel label={`${value} →`} color={C.ash} fontSize={fs.caption} font={F.mono} style={{ marginLeft: "auto", flexShrink: 1 }} />
    </Pressable>
  );
}

const TEASE: { key: string }[] = [
  { key: "goalSeason" }, { key: "todayRoute" }, { key: "perfTwin" },
  { key: "sportSC" }, { key: "velocity" }, { key: "endurance" },
];

/**
 * THE TEASER — one real figure, then the locked depth.
 *
 * It used to be six identical padlocked rows: a wall that told a free user
 * nothing about what the feature would say about THEM. It now leads with the
 * athlete's own freshness, computed from their own log by the same engine the
 * full page uses, and locks what sits behind it. A teaser that demonstrates
 * beats a teaser that lists. Mirrors web.
 *
 * With no logged training there is no figure to show and none is invented.
 */
function Teaser({ paid, onUnlock, top }: { paid: boolean; onUnlock: () => void; top?: ReactNode }) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  // The teaser owns its own reads — it renders instead of `Full`, so it never
  // sees that component's data.
  const sessionsRead = useSessionsRead();
  const signalsRead = useSignalsRead();
  const sessions = sessionsRead.data ?? [];
  const bio = useMemo(() => toBiometrics((signalsRead.data ?? []) as unknown as Parameters<typeof toBiometrics>[0]), [signalsRead.data]);
  const log = useMemo(() => personalTrainingLog(sessions), [sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const hasData = sessionsRead.ready && sessions.length > 0;
  return (
    <AuroraScreen top={top} hero={top ? undefined : { rank: "title", title: t("w.home.cockpit.teaseTitle") }}>
      {top && <AHeading style={{ fontSize: fs.display }}>{t("w.home.cockpit.teaseTitle")}</AHeading>}
      {hasData && (
        <ACard solid style={{ marginTop: top ? 12 : 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 44, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>
                {t("w.home.cockpit.freshness")} — {state.hpi.band}
              </Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 4, lineHeight: leading(fs.caption) }}>{t("w.home.cockpit.teaseYours")}</Text>
            </View>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, lineHeight: leading(fs.body) }}>
            {t(`w.home.cockpit.limiter.${state.hpi.limiter}`)}
          </Text>
        </ACard>
      )}
      <ASub style={{ marginTop: hasData ? 16 : top ? 8 : 0 }}>{t("w.home.cockpit.teaseSub1")}{t("w.home.cockpit.teaseSub2")}{t("w.home.cockpit.teaseSub3")}</ASub>
      {TEASE.map((s) => (
        /* No leading marker: a dot in front of a label is decoration, and the
           house rule forbids it. The lock on the right is the semantic one. */
        <ACard solid key={s.key} style={{ marginTop: 12, opacity: 0.75, flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t(`w.home.cockpit.tease.${s.key}.kicker`)}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, marginTop: 4, lineHeight: leading(fs.caption) }}>{t(`w.home.cockpit.tease.${s.key}.blurb`)}</Text>
          </View>
          <AuroraIcon name="lock" size={18} color={C.ash} />
        </ACard>
      ))}
      <APill label={paid ? t("w.home.cockpit.switchToFull") : t("w.home.cockpit.upgradeToFull")} onPress={onUnlock} style={{ marginTop: 16 }} />
    </AuroraScreen>
  );
}
