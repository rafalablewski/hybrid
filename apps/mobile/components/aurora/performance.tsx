import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, ScrollView } from "react-native";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  prescribeSession, computePerformanceState, computeInjuryRisk, computeLoad, performanceTrajectory, weeklyRecap,
  runTotals, enduranceSessions, personalTrainingLog, toBiometrics,
  fmtWeight, strengthPrDelta,
  velocityProfiles, hpiRole, readinessRole, quickCheckinFeeling, READINESS_FACE, readinessWhy, SPORTS, LEVELS,
  localDayKey,
} from "@hybrid/core";
import { useSessionsRead, useSignalsRead, useMacrocycleRead, useCheckinsRead, combineReads } from "../../lib/queries";
import { useToday } from "../../lib/use-today";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLang } from "../../lib/i18n";
import { useSession } from "../../lib/session";
import { usePersona, setClientPersona } from "../../lib/persona";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { leading, fs, space, F, serifIf, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, ASub, RADIUS, Ring, Spark, withAlpha, ASection } from "./kit";
import AuroraVolume from "./volume";
import AuroraTrends from "./trends";
import { AuroraIcon } from "./icons";
import GroupMark from "./group-mark";
import TissueCard from "./tissue-card";
import ReadinessFace from "./readiness-face";
import FetchError from "./fetch-error";
import { CtaLabel } from "./cta-label";

type Palette = ReturnType<typeof useTheme>["palette"];
type Scheme = ReturnType<typeof useTheme>["scheme"];
const hpiColor = (b: string, C: Palette) => roleColor(C, hpiRole(b));
const readyColor = (v: number, C: Palette) => roleColor(C, readinessRole(v));
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, " ");

/** AURORA Performance — the merged athlete hub (ex-Cockpit + the standalone
 *  Performance State screen, one page — mirrors web), organised into FOUR
 *  NAMED CLUSTERS under the same headline-tier GroupMark grammar as the home
 *  tab's daily loop: living masthead, then STATE (Performance State → 14-day
 *  trajectory → injury risk → return-to-play) → TRAINING (this week →
 *  breakdown → volume → trend) → SEASON (goal + season) → EXPLORE (the
 *  horizon doors). Same live engines; nothing removed — RTP moved up beside
 *  the injury card it serves, the horizon doors close the page. */
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
  //
  // This replaced a useState([]) + useEffect(Promise.all) load, which is what
  // made the screen announce "log a session", "No season yet" and "No active
  // protocols" to an athlete with years of history for the second the fetch was
  // in flight — then swap in an HPI of 51. The empty array was never an answer;
  // it was the absence of one.
  const sessionsRead = useSessionsRead();
  const signalsRead = useSignalsRead();
  const macroRead = useMacrocycleRead();
  const checkinsRead = useCheckinsRead();
  // Each claim is gated on ITS OWN source, never on the combined gate: a single
  // failing endpoint (check-ins, say) must not pin the whole page in a skeleton
  // when sessions answered fine. `combineReads` is used only for the screen-wide
  // spinner and the has-anything-failed check.
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
  // TODAY's readiness FEELING (the one-tap check-in) → prescribeSession, so the
  // readiness block reflects + explains the load nudge the pick applies
  // (the Today screen no longer previews it). Mirrors web.
  // `today` is a DEPENDENCY, not a call to the clock inside the memo: without
  // it this only recomputed when `checkins` changed, so a screen alive across
  // midnight kept treating yesterday's check-in as today's. See use-today.ts.
  const today = useToday();
  // The readiness ANSWER, not `checkinFeeling`'s average of four different
  // questions — the readiness nudge below renders this feeling's own face next
  // to the words "you're feeling flat today", so it must be what the athlete
  // said rather than a number derived from their sleep and mood.
  const todayFeeling = useMemo(
    () => quickCheckinFeeling(checkins.find((x) => x && x.weekOf && localDayKey(x.weekOf) === today) ?? null),
    [checkins, today],
  );
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
  // Same reason as todayFeeling: the recap's week window is anchored on "now",
  // so it has to re-derive when the calendar day turns over.
  const recap = useMemo(() => weeklyRecap(sessions, Date.now(), bw), [sessions, bw, today]); // eslint-disable-line react-hooks/exhaustive-deps
  // "Endurance" = real endurance cardio (runs, swims, rides, rows) — drop
  // racket/team/combat sports so a tennis session doesn't inflate the summary.
  const totals = useMemo(() => runTotals(enduranceSessions(sessions)), [sessions]);
  const profiles = useMemo(() => velocityProfiles(sessions), [sessions]);
  // Only a legitimate reading once SESSIONS have answered: before that an empty
  // list means "we haven't asked", not "you have nothing logged".
  const hasData = sessionsRead.ready && sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];
  // Season completion %, guarded against a 0 / malformed totalWeeks.
  const seasonPct = macro && macro.totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / macro.totalWeeks) * 100)) : 0;
  const maxBar = 96;

  const season = macro ? `${macro.goalOrSport} – ${t("w.home.cockpit.week")} ${currentWeek} ${t("w.home.cockpit.of")} ${macro.totalWeeks}` : "";
  return (
    <AuroraScreen
      refreshing={refreshing}
      onRefresh={load}
      top={top}
      // The "living masthead" this screen invented — mono season caption over
      // an oversized headline — turns out to BE the hero: the caption is the
      // eyebrow (what kind of thing this is), the headline the title. So it
      // stops being a bespoke masthead and becomes the system's, at the
      // system's size. As a hub tab Today owns the head, so it renders inline.
      hero={top ? undefined : { rank: "title", title: t("w.home.cockpit.commandCenter"), eyebrow: season || undefined }}
    >
      {top && (
        <>
          <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{season || " "}</Text>
          <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 32, letterSpacing: -1, color: C.chalk, marginTop: 6 }}>{t("w.home.cockpit.commandCenter")}</Text>
        </>
      )}
      <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: top ? 2 : 0 }}>{t("w.home.cockpit.commandSub")}</Text>
      {(macro || hasData) && (
        // Full-bleed chip rail — clips at the screen edge, rests on the column.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginHorizontal: -16 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
          {phaseBlock && <MetaPill C={C} dot={C.lime}><Text style={{ fontFamily: F.bold, color: C.chalk }}>{phaseBlock.label}</Text> {t("w.home.today.phase")}</MetaPill>}
          {macro?.eventInWeeks != null && <MetaPill C={C} icon={<AuroraIcon name="calendar-event" size={13} color={C.chalk} />}><Text style={{ fontFamily: F.bold, color: C.chalk }}>{macro.eventInWeeks} {t("w.home.cockpit.wk")}</Text> {t("w.home.cockpit.eventIn")}</MetaPill>}
          {/* ACWR rides on training data, not on having a season — a planless
              athlete still gets their workload ratio at a glance. */}
          {hasData && <MetaPill C={C} icon={<AuroraIcon name="arrow-up" size={13} color={C.chalk} />}>{loadState.enoughHistory ? `ACWR ${loadState.acwr.toFixed(2)}` : t("w.home.cockpit.building")}</MetaPill>}
          {/* The headline number is visible before any scroll. */}
          {hasData && <MetaPill C={C} dot={hpiColor(state.hpi.band, C)}>HPI <Text style={{ fontFamily: F.bold, color: C.chalk }}>{state.hpi.score}</Text> – {state.hpi.band}</MetaPill>}
        </ScrollView>
      )}

      {/* A load FAILURE is its own state, never emptiness. Only shown when we
          have nothing cached to fall back on — if a previous value is in hand
          the page keeps rendering it and the pull-to-refresh retry sits on top,
          which beats blanking a screen the athlete was reading. */}
      {failed && !sessionsRead.ready && <FetchError onRetry={load} style={{ marginTop: 16 }} />}

      {/* ═════ GROUP: STATE — how the body is doing right now: the headline
          read, its 14-day trajectory, what's at risk, and the protocols for
          what already broke. First of the FOUR named clusters this page is
          organised into (State / Training / Season / Explore) — the same
          headline-tier GroupMark grammar as the home tab's daily loop, so the
          two hub scrolls read as siblings. Mirrors web performance.tsx. ═════ */}
      <GroupMark label={t("w.home.group.state")} />

      {/* 2 · PERFORMANCE STATE — the headline read (the classic anatomy):
          big HPI + band/limiter caption + sparkline, STR/END/REC in three
          columns, the top driver, and today's readiness (with the check-in
          nudge) below. */}
      <ACard solid style={{ marginTop: 16 }}>
        <ASection title={t("w.home.cockpit.perfTwin")} />
        {hasData ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: 44, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginBottom: 4 }}>HPI – {state.hpi.band} – {t("w.home.cockpit.limiter")} {state.hpi.limiter}</Text>
                <Spark series={hpiSeries} color={hpiColor(state.hpi.band, C)} height={22} />
              </View>
            </View>
            <View style={{ flexDirection: "row", marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
              <Comp C={C} scheme={scheme} label={t("w.home.cockpit.tab.strength")} value={`${state.hpi.components.strength}`} />
              <Comp C={C} scheme={scheme} label={t("w.home.cockpit.tab.endurance")} value={`${state.hpi.components.endurance}`} />
              <Comp C={C} scheme={scheme} label={t("w.home.cockpit.recovery")} value={`${state.hpi.components.recovery >= 0 ? "+" : ""}${state.hpi.components.recovery}`} />
            </View>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
              <Ring value={rx.readiness} size={48} color={readyColor(rx.readiness, C)} track={C.line}>
                <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.chalk }}>{rx.readiness}</Text>
              </Ring>
              {/* The "why" is split into its sentences and rendered as separate
                  lines so the engine's multi-clause explanation scans instead of
                  reading as one wall of text. Mirrors web. */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{t("w.home.cockpit.todayReadiness")}</Text>
                <View style={{ gap: 5, marginTop: 5 }}>
                  {whyLines.map((line, i) => (
                    <Text key={i} style={{ fontFamily: F.reg, fontSize: fs.body, color: i === 0 ? C.chalk : C.ash, lineHeight: leading(fs.body) }}>{line}</Text>
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
        ) : sessionsRead.ready ? (
          /* A real answer: the athlete genuinely has no logged training. */
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{t("w.home.cockpit.twinEmpty")}</Text>
        ) : (
          /* UNKNOWN, or the read failed (the retry card above says so). Showing
             twinEmpty here is what told athletes with years of history to "log
             a session". A skeleton claims nothing; the pull-to-refresh spinner
             already says we're working on it. `settled` keeps the skeleton from
             hanging forever — a failed read is never `ready`. */
          <StateSkeleton C={C} />
        )}
      </ACard>

      {/* 3 · TRAJECTORY — HPI as bars; Readiness as a per-day marker plotted on
          the same 0..100 scale → the same two series the web chart draws, with
          native primitives instead of an SVG chart (form carries the series
          identity: bar vs tick, hue second). */}
      {hasData && (
        <ACard solid style={{ marginTop: 16 }}>
          <ASection
            title={t("w.analyze.perf.trajectory")}
            meta={
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

      {/* 4 · TISSUE — injury risk AND return-to-play in ONE card. They were
          two siblings stating the same subject twice: a risk summary that
          showed no tissue, and an always-open seven-chip form for an event
          that happens twice a year. The merged card's SHAPE is the signal —
          short while nothing is wrong, opening itself the moment a tissue is
          flagged, and becoming the protocol once one is open. Mirrors web. */}
      <TissueCard risk={risk} load={loadState} hasData={hasData} />

      {/* ═════ GROUP: TRAINING — the work itself: what this week produced,
          per discipline, the week's dose against the athlete's own landmarks,
          and the eight-week trend. ═════ */}
      <GroupMark label={t("w.home.group.training")} />

      {/* 6 · THIS WEEK — recap & PRs */}
      {hasData && (
        <Pressable onPress={() => router.push("/statistics")} style={{ marginTop: 16 }}>
          <ACard solid>
            <ASection
              title={t("w.home.today.yourWeek")}
              meta={recap.prs.length > 0 ? <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 3 }}><AuroraIcon name="trophy" size={13} color={C.onAccent} /><Text style={{ fontFamily: F.mono, fontSize: fs.micro, fontWeight: "700", color: C.onAccent }}>{recap.prs.length} {t("w.home.cockpit.newPrs")}</Text></View> : undefined}
            />
            <View style={{ flexDirection: "row" }}>
              <View style={{ flex: 1 }}><Stat C={C} label={t("w.home.today.sessions")} value={`${recap.sessions}`} /></View>
              <View style={{ flex: 1 }}><Stat C={C} label={`${t("w.home.today.volume")} kg`} value={recap.volume.toLocaleString()} /></View>
              <View style={{ flex: 1 }}><Stat C={C} label={t("w.home.today.sets")} value={`${recap.sets}`} /></View>
            </View>
            {recap.prs.length > 0 && (
              <View style={{ marginTop: 16 }}>
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

      {/* 7 · BREAKDOWN — disciplines, tabbed */}
      {hasData && <Breakdown C={C} scheme={scheme} state={state} recap={recap} totals={totals} sport={sport} profiles={profiles} onOpen={(h) => router.push(h)} />}

      {/* 8 · VOLUME — this week's hard sets against the athlete's own
          MEV/MAV/MRV: the hero shape, the block ramp, the week's prescription,
          the per-muscle rails (each carrying its own eight-week history),
          whose numbers these are, and the band glossary. Was its own screen
          until the Performance page absorbed it; nothing was dropped on the way
          over except the SECOND copy of the muscle breakdown, which Trends used
          to draw off the same volumeStatus(). See `performance-unified`. */}
      <View style={{ marginTop: 16 }}><AuroraVolume unified /></View>

      {/* 9 · TREND — the eight-week series (weekly sets, weekly tonnage) and the
          sortable exercise-analytics table. Its muscle-breakdown card and its
          add/ease-off advice line are gone: both were the same engines
          (volumeStatus / volumeAdvice) the Volume sections above already state,
          in more detail and with the landmarks attached. */}
      <View style={{ marginTop: 16 }}><AuroraTrends unified /></View>

      {/* ═════ GROUP: SEASON — the long arc: the goal, the phase, how far
          through, and the setup that changes them. ═════ */}
      <GroupMark label={t("w.home.group.season")} />

      {/* 10 · GOAL + SEASON — two separate widgets (like Today's RECOVER duo) */}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 16 }}>
        {/* widget 1 — goal */}
        <ACard solid style={{ flex: 1 }}>
          <ASection title={t("w.home.cockpit.goal")} titleStyle={{ fontSize: fs.bodyLg }} />
          {macro ? (
            <>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.subtitle, color: C.chalk }}>{macro.goalOrSport}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.violet), marginTop: 6 }}>{phaseBlock ? `${phaseBlock.label} – ` : ""}{t("w.home.cockpit.week")} {currentWeek}/{macro.totalWeeks}</Text>
            </>
          ) : macroRead.settled ? (
            /* Settled: the server said "not enrolled", or the read failed and
               the retry card above owns that — either way, stop waiting. */
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: leading(fs.caption) }}>{t("w.home.cockpit.noSeason")}</Text>
          ) : (
            <Rule C={C} w="80%" h={14} />
          )}
        </ACard>
        {/* widget 2 — season progress / plan controls */}
        <ACard solid style={{ flex: 1 }}>
          {/* The HEADING itself is a claim ("Set up" vs "Season") — hold it
              until enrollment is known, or an enrolled athlete is briefly told
              to set up a season they already have. */}
          <ASection title={!macroRead.settled ? " " : macro ? t("w.home.cockpit.season") : t("w.home.cockpit.setUp")} meta={macro ? `${seasonPct}%` : undefined} titleStyle={{ fontSize: fs.bodyLg }} />
          {macro ? (
            <View style={{ height: 6, borderRadius: RADIUS.pill, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, overflow: "hidden", marginTop: 2, marginBottom: 10 }}>
              <View style={{ width: `${seasonPct}%`, height: 6, backgroundColor: C.violet }} />
            </View>
          ) : macroRead.settled ? (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2, marginBottom: 10, lineHeight: leading(fs.caption, "snug") }}>{t("w.home.cockpit.fourQuestions")}</Text>
          ) : (
            <View style={{ marginTop: 2, marginBottom: 10 }}><Rule C={C} w="90%" h={12} /></View>
          )}
          <View style={{ gap: 8 }}>
            {macro && <Pressable onPress={() => router.push("/periodize")}><CtaLabel label={`${t("w.home.cockpit.periodize")} →`} color={txt(C, C.lime)} fontSize={fs.caption} font={F.mono} /></Pressable>}
            <Pressable onPress={() => router.push("/onboarding")}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("w.home.cockpit.openSetup")}</Text></Pressable>
          </View>
        </ACard>
      </View>

      {/* ═════ GROUP: EXPLORE — beyond this page: the doors to the deeper
          tools. Closes the scroll, exactly as Explore closes the home tab. ═════ */}
      <GroupMark label={t("w.home.group.explore")} />

      {/* 11 · HORIZON — Sport S&C, Velocity, Endurance, AI Coach */}
      <ACard solid style={{ marginTop: 16 }}>
        <ASection title={t("w.home.cockpit.horizon")} />
        <Mod C={C} label={t("w.home.cockpit.sportSC")} value={sport ? `${sport.sport} – ${LEVELS[sport.levelIdx]}` : t("w.home.cockpit.sport")} onPress={() => (sport ? router.push({ pathname: "/sport-page", params: { name: sport.sport } }) : router.push("/sport"))} />
        <Mod C={C} label={t("w.home.cockpit.velocity")} value={t("w.home.cockpit.velocityValue")} mono onPress={() => router.push("/velocity")} />
        <Mod C={C} label={t("w.home.cockpit.endurance")} value={totals.efforts > 0 ? `${totals.efforts} – ${totals.distanceKm.toLocaleString()} km – ${totals.minutes.toLocaleString()} min` : t("w.home.cockpit.tab.endurance")} mono onPress={() => router.push("/endurance")} />
        {/* The AI coach's one door on mobile — the prescription lives here. */}
        <Mod C={C} label={t("w.home.cockpit.aiCoach")} value={t("w.home.cockpit.aiCoachValue")} mono onPress={() => router.push("/ai-coach")} last />
      </ACard>
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
    <ACard solid style={{ marginTop: 16 }}>
      <ASection title={t("w.home.cockpit.breakdown")} />
      {/* segmented tabs */}
      <View style={{ flexDirection: "row", gap: 0, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, padding: 4 }}>
        {TABS.map((x) => {
          const on = x.id === tab;
          return (
            <Pressable key={x.id} onPress={() => setTab(x.id)} style={{ flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: RADIUS.pill, backgroundColor: on ? C.chalk : "transparent" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: on ? C.onAccent : C.ash }}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ marginTop: 16 }}>
        {tab === "strength" && (
          <>
            <View style={{ flexDirection: "row", gap: 24 }}>
              <Stat C={C} label={t("w.home.cockpit.strIndex")} value={`${state.hpi.components.strength}`} />
              <Stat C={C} label={t("w.home.cockpit.lifts")} value={`${recap.lifts}`} />
              <Stat C={C} label={t("w.home.today.topMuscle")} value={recap.topMuscle ? cap(recap.topMuscle.muscle) : "—"} />
            </View>
            {state.drivers[0] && <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, marginTop: 16, lineHeight: leading(fs.body, "snug") }}>{state.drivers[0].detail}</Text>}
          </>
        )}
        {tab === "endurance" && (
          totals.efforts > 0 ? (
            <>
              <View style={{ flexDirection: "row", gap: 24 }}>
                <Stat C={C} label={t("w.home.cockpit.efforts")} value={`${totals.efforts}`} />
                <Stat C={C} label={t("w.home.cockpit.km")} value={totals.distanceKm.toLocaleString()} />
                <Stat C={C} label={t("w.home.cockpit.min")} value={totals.minutes.toLocaleString()} />
              </View>
              <Pressable onPress={() => onOpen("/endurance")} style={{ marginTop: 16 }}><CtaLabel label={`${t("w.home.cockpit.tab.endurance")} →`} color={txt(C, C.lime)} fontSize={fs.caption} font={F.mono} /></Pressable>
            </>
          ) : <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{t("w.home.cockpit.enduranceEmpty")}</Text>
        )}
        {tab === "sport" && (
          sport ? (
            <>
              <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.subtitle, color: C.chalk }}>{sport.sport} – {LEVELS[sport.levelIdx]}</Text>
              <Pressable onPress={() => onOpen({ pathname: "/sport-page", params: { name: sport.sport } })} style={{ marginTop: 12 }}><CtaLabel label={`${t("w.home.cockpit.sport")} →`} color={txt(C, C.lime)} fontSize={fs.caption} font={F.mono} /></Pressable>
            </>
          ) : <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{t("w.home.cockpit.sportEmpty")}</Text>
        )}
        {tab === "velocity" && (
          bestProfile ? (
            <>
              <View style={{ flexDirection: "row", gap: 24 }}>
                <Stat C={C} label={bestProfile[0]} value={`${Math.round(bestProfile[1].estimated1rm)}kg`} />
                <Stat C={C} label="R²" value={bestProfile[1].r2.toFixed(2)} />
                <Stat C={C} label={t("w.home.cockpit.points")} value={`${bestProfile[1].n}`} />
              </View>
              <Pressable onPress={() => onOpen("/velocity")} style={{ marginTop: 16 }}><CtaLabel label={`${t("w.home.cockpit.velocity")} →`} color={txt(C, C.lime)} fontSize={fs.caption} font={F.mono} /></Pressable>
            </>
          ) : <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{t("w.home.cockpit.velocityBlurb")}</Text>
        )}
      </View>
    </ACard>
  );
}

/* ---------- primitives ---------- */
/** One skeleton bar — a placeholder that states nothing. Deliberately not a
 *  shimmer: the pull-to-refresh spinner already carries "we're working on it",
 *  and a second animated element competing with it just adds noise. */
/**
 * A sized rectangle — a hairline or a spacer rule. A layout helper, not a
 * meter: the caller passes an explicit width and height, and nothing here reads
 * a value.
 */
function Rule({ C, w, h, mt }: { C: Palette; w: number | `${number}%`; h: number; mt?: number }) {
  return <View style={{ width: w, height: h, borderRadius: h / 2, backgroundColor: C.line, opacity: 0.45, marginTop: mt }} />;
}

/** The Performance State card's unknown state. Occupies roughly the shape of
 *  the real thing (a big number, a caption, the three component columns) so the
 *  card doesn't resize under the reader when the data lands. */
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
        <View style={{ flex: 1, gap: 8 }}><Rule C={C} w="55%" h={18} /><Rule C={C} w="80%" h={9} /></View>
      </View>
    </View>
  );
}

/** SectionHead — the golden-standard card header (Explore's SectionHead idiom):
 *  a bold display-face title on the left, any meta/action as small mono
 *  uppercase (or a pill) on the RIGHT of the same row. No decorative dot. */
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

function Stat({ C, label, value }: { C: Palette; label: string; value: string }) {
  const { scheme } = useTheme();
  return (
    <View>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.heading, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{label}</Text>
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

function Mod({ C, label, value, onPress, mono, last }: { C: Palette; label: string; value: string; onPress: () => void; mono?: boolean; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: `${C.line}99` }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash }}>{label}</Text>
      <CtaLabel label={`${value} →`} color={mono ? C.ash : C.chalk} fontSize={mono ? fs.caption : fs.body} font={mono ? F.mono : F.bold} style={{ marginLeft: "auto" }} />
    </Pressable>
  );
}


const TEASE: { key: string }[] = [
  { key: "goalSeason" }, { key: "todayRoute" }, { key: "perfTwin" },
  { key: "sportSC" }, { key: "velocity" }, { key: "endurance" },
];

function Teaser({ paid, onUnlock, top }: { paid: boolean; onUnlock: () => void; top?: ReactNode }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <AuroraScreen top={top} hero={top ? undefined : { rank: "title", title: t("w.home.cockpit.teaseTitle") }}>
      {top && <AHeading style={{ fontSize: fs.display }}>{t("w.home.cockpit.teaseTitle")}</AHeading>}
      <ASub style={{ marginTop: top ? 8 : 0 }}>{t("w.home.cockpit.teaseSub1")}{t("w.home.cockpit.teaseSub2")}{t("w.home.cockpit.teaseSub3")}</ASub>
      {TEASE.map((s) => (
        <ACard solid key={s.key} style={{ marginTop: 12, opacity: 0.75, flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: C.lime }} />
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
