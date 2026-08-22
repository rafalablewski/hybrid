/**
 * THE PERFORMANCE TAB — the Today hub's second pill.
 *
 * THE PAGE IS ORGANISED INTO FOUR RUNS, AND ONLY THREE OF THEM ARE NAMED.
 * State (this card + tissue) → TRAINING (level + volume) → SEASON → EXPLORE.
 * The numbered comments below have always described that order; from Aug 2026
 * the last three also carry a GroupMark, the same headline tier Today marks its
 * runs with, off the same w.home.group.* keys. Before that the order existed
 * only in this file, which is why the registry spent months claiming a
 * structure the screen never showed.
 *
 * THE FIRST RUN TAKES NO MARKER, and that is the rule, not an omission. It
 * opens directly under the masthead, so a name there announces what the screen
 * is visibly about — the defect that got "Train" deleted off Today in the same
 * week. It would also have been the one label that echoed the card beneath it
 * word for word: "State" over a card headed "Your state". Today's first run is
 * unmarked for the identical reason. One rule, both tabs: a marker names a TURN
 * in the scroll, and the opening run turns from nothing.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { View, Text, ScrollView } from "react-native";
import Svg, { Path, Line, Circle, Rect } from "react-native-svg";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  computePerformanceState, computeInjuryRisk, computeLoad, performanceTrajectory,
  capabilityTrend, stateVerdict, trajectoryPlot, sessionDaysAgo,
  runTotals, enduranceSessions, personalTrainingLog, toBiometrics,
  weeklyVolumeTrend, fmtTonnage, fmtWeight, paceClock,
  velocityProfiles, hpiRole, hpiBandKey, SPORTS, LEVELS,
  INJURY_AREA_KEY,
  freshnessExplain, wearableExplain, wearableSourcePhrase,
  type CapabilityMovement, type FreshnessPillar,
  type WearableExplain,
} from "@hybrid/core";
import { useSessionsRead, useSignalsRead, useMacrocycleRead, useRecoverySignalsQuery, useRecoverySignalsRead, combineReads } from "../../lib/queries";
import { useToday } from "../../lib/use-today";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLang } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useSession } from "../../lib/session";
import { usePersona, setClientPersona } from "../../lib/persona";
import { useTheme, txt, roleColor } from "../../lib/theme";
import { F, PressScale as Pressable, fs, leading, space, tracking, ty} from "../../lib/ui";
import { AuroraScreen, ACard, APill, AHeading, ASub, GUTTER, RADIUS, withAlpha, ASection } from "./kit";
import { HubMasthead } from "./hub-masthead";
import GroupMark from "./group-mark";
import AuroraVolume from "./volume";
import { AuroraIcon } from "./icons";
import TissueCard from "./tissue-card";
import LevelCard from "./level-card";
import FreshnessSheet from "./freshness-sheet";
import WearableSheet from "./wearable-sheet";
import FetchError from "./fetch-error";
import { CtaLabel } from "./cta-label";

type Palette = ReturnType<typeof useTheme>["palette"];
const hpiColor = (b: string, C: Palette) => roleColor(C, hpiRole(b));
// NO readiness anything here any more — not the ring, not the paint. The day's
// readiness reading belongs to Today, which opens on it; this screen carried a
// second copy of the same card halfway down a scroll, so an athlete met the
// figure twice in one session and could not tell which one was the reading.
// The object and its paint live beside each other in aurora/readiness-ring.tsx.
/** The plot's box — the SAME box web uses, because both clients now stroke the
 *  same paths from the same shared geometry. react-native-svg is already in the
 *  app (the injury mannequin), so mobile no longer has to approximate the chart
 *  with bars and markers: the fourteen days have one shape on both clients. */
const PLOT = { width: 318, height: 104, pad: 10 };

/** A signed point contribution, with a REAL minus (U+2212) rather than the
 *  hyphen `${-3}` leaves behind — a hyphen beside a tabular figure reads as a
 *  dash in a sentence, not as a sign. Mirrors web's signedPoints. */
const signedPoints = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/** What the ±15 line calls its own source. Resolved in @hybrid/core so a
 *  provider keeps its real name, a manual reading never borrows one, and both
 *  clients say the same thing. */
const wearableSource = (e: WearableExplain, t: (k: string) => string) => {
  const p = wearableSourcePhrase(e);
  return p.key ? t(p.key) : p.label ?? "";
};

/**
 * AURORA Performance (mobile) — the athlete hub, at SIX surfaces.
 *
 * It was twenty. Volume and Trends had been absorbed whole and took roughly two
 * thirds of the scroll; eleven cards restated something a neighbour had already
 * said, or said something that belongs on a screen of its own. What is left:
 * masthead with a computed VERDICT sentence → YOUR STATE (freshness, the
 * wearable's signed contribution, the limiter as a sentence, two freshness
 * columns, the CAPABILITY trend, the fourteen-day plot with its sessions
 * marked) → TISSUE → this week's VOLUME hero + a door → SEASON → the exits.
 *
 * Cut: the HPI and ACWR chips, "Your week" (its PRs moved to Today's activity
 * card, which owns the week on a real calendar window), the Breakdown tabs
 * (three of four panels duplicated the exit rows), the band glossary, the
 * four group markers, and THE READINESS DAY CARD — Today opens on that reading,
 * above the fold, so a second copy of it here was the same figure met twice.
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
  const { palette: C } = useTheme();
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
  const { refreshing, failed } = combineReads(sessionsRead, signalsRead, macroRead);
  const sessions = sessionsRead.data ?? [];
  const macro = macroRead.data?.macro ?? null;
  const currentWeek = macroRead.data?.currentWeek ?? 1;
  const load = () => {
    sessionsRead.retry(); signalsRead.retry(); macroRead.retry();
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

  const today = useToday();
  // `today` is a DEPENDENCY, not a call to the clock inside the memo. The
  // recovery window (BIOMETRIC_FRESH_DAYS) is evaluated against Date.now() at
  // memo time, so without this an app left open across a day boundary keeps
  // treating a reading as fresh past its last day — the same defect the daily
  // check-in already guards this way.
  // BIOMETRICS READ THE RECOVERY STREAM, not the unfiltered one: the latter
  // returns the newest rows of any kind, and a few days of logged meals can
  // evict a week of wearable readings from it (see lib/api.ts).
  const { data: recoverySignals = [] } = useRecoverySignalsQuery();
  const bio = useMemo(() => toBiometrics(recoverySignals as unknown as Parameters<typeof toBiometrics>[0]), [recoverySignals, today]);
  const log = useMemo(() => personalTrainingLog(sessions), [sessions]);
  // ONE velocityProfiles pass, read by the exits.
  const profiles = useMemo(() => velocityProfiles(sessions), [sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  // WHICH FRESHNESS COLUMN IS OPEN, and the explanation behind it — computed
  // only while the sheet is up, from the SAME engine the columns print.
  const [freshOpen, setFreshOpen] = useState<FreshnessPillar | null>(null);
  const freshExplain = useMemo(
    () => (freshOpen ? freshnessExplain(freshOpen, log, bio) : null),
    [freshOpen, log, bio],
  );
  // THE ±15's provenance. Computed whenever there IS a reading, because the
  // card's own line needs the source name — not only the sheet.
  const [wearableOpen, setWearableOpen] = useState(false);
  const wearable = useMemo(() => (bio ? wearableExplain(bio) : null), [bio]);
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
      // Standing alone, the hero carries the same two facts the hub head does —
      // the season as its eyebrow and the phase as its meta — so the phase is
      // stated exactly once on both shapes of this screen.
      hero={top ? undefined : { rank: "title", title: t("w.home.cockpit.commandCenter"), eyebrow: season || undefined, meta: phaseBlock ? [phaseBlock.label] : undefined }}
    >
      {/* AS A HUB TAB the head is the SHARED hub masthead — the same component
          Dashboard and Feed render (aurora/hub-masthead.tsx). It replaces a
          hand-rolled 32 with the hub's one rung, and the eyebrow's `season || " "`
          — a space character reserving a line invisibly — with a meta row that
          reserves its own height properly. Standing alone the head is still the
          HERO's, which is right: a pushed screen has a rail and a back
          affordance, and a hub tab has neither. */}
      {top && (
        <HubMasthead
          eyebrow={season}
          // The PHASE, which used to be a pill in the rail below. One state
          // value in the meta row says it once; it was reading twice within
          // 30 pt, and orientation belongs in the head, not in a card.
          meta={phaseBlock?.label ?? null}
          metaTone="accent"
          title={t("w.home.cockpit.commandCenter")}
        />
      )}
      {macro?.eventInWeeks != null && (
        // Full-bleed chip rail — clips at the screen edge, rests on the column.
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: top ? 0 : 12, marginBottom: 16, marginHorizontal: -GUTTER }} contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER }}>
          <MetaPill C={C} icon={<AuroraIcon name="calendar-event" size={13} color={C.chalk} />}><Text style={{ fontFamily: F.bold, color: C.chalk }}>{macro.eventInWeeks} {t("w.home.cockpit.wk")}</Text> {t("w.home.cockpit.eventIn")}</MetaPill>
        </ScrollView>
      )}

      {/* A load FAILURE is its own state, never emptiness. */}
      {failed && !sessionsRead.ready && <FetchError onRetry={load} style={{ marginBottom: 16 }} />}

      {/* 2 · YOUR STATE — the thesis, and the one block that got BIGGER. */}
      {/* No top margin: the head above emits HUB_MASTHEAD.gap.below, and the
          rail between them (when there is one) emits the same gap downward. RN
          does not collapse margins and CSS does, so a block that kept its own
          would sit 16 lower here than on web. */}
      <ACard solid>
        <ASection title={t("w.home.cockpit.stateTitle")} />
        {/* THE VERDICT — freshness, then the tissue worth watching. It used to
            sit at the top of the screen as the head's subtitle; the hub head has
            no sub slot, and this sentence reads better beside the number it
            explains than above the whole page. It still says nothing the card
            below doesn't say in full — the only licence a summary ever has. */}
        <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: hasData ? C.chalk : C.ash, marginBottom: 12, lineHeight: leading(fs.body) }}>{verdictLine}</Text>
        {hasData ? (
          <>
            {/* THE HEADLINE — three levels, not two grey lines.
                It used to set the metric's NAME and the athlete's READING at
                identical weight ("FRESHNESS — COMPROMISED", one mono ash rule
                joined by a dash), so nothing said which of the two was the fact;
                the band went uncoloured beside a numeral that was coloured; and
                the band word itself was the raw engine identifier, English on
                every locale. Now: label, reading, provenance. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <Text style={{ fontFamily: F.black, fontSize: 44, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
              <View style={{ flex: 1 }}>
                <Text style={ty(C, "kicker")}>
                  {t("w.home.cockpit.freshness")}
                </Text>
                <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, hpiColor(state.hpi.band, C)), marginTop: 2 }}>
                  {t(hpiBandKey(state.hpi.band))}
                </Text>
                {/* The wearable rides the headline as the signed adjustment it
                    is (±15), rather than standing as a peer of two 0..100
                    indices in a third column. A real minus sign, not the hyphen
                    a template literal leaves behind. */}
                {state.hpi.components.recovery !== 0 && wearable && (
                  <Pressable
                    onPress={() => setWearableOpen(true)}
                    accessibilityRole="button"
                    accessibilityLabel={`${t("w.home.wearable.title")} — ${t("w.home.fresh.explain")}`}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}
                  >
                    <Text style={{ flexShrink: 1, fontFamily: F.reg, fontSize: fs.caption, color: C.ash }}>
                      {t("w.home.cockpit.wearableOf")
                        .replace("{n}", signedPoints(state.hpi.components.recovery))
                        .replace("{source}", wearableSource(wearable, t))}
                    </Text>
                    <AuroraIcon name="info" size={13} color={C.ash} />
                  </Pressable>
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

            {/* THE TWO PILLARS — each column is now a DOOR. They printed a bare
                numeral under a mono label with nothing behind it: no derivation,
                no inputs, no statement of what the figure refuses to claim. The
                ⓘ is the same affordance Today's readiness reading uses for
                "explain THIS number". */}
            <View style={{ flexDirection: "row", marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
              <Comp C={C} label={t("w.home.cockpit.strengthFresh")} value={`${state.hpi.components.strength}`} onExplain={() => setFreshOpen("strength")} explainLabel={t("w.home.fresh.explain")} />
              <Comp C={C} label={t("w.home.cockpit.enduranceFresh")} value={`${state.hpi.components.endurance}`} onExplain={() => setFreshOpen("endurance")} explainLabel={t("w.home.fresh.explain")} />
            </View>
            <FreshnessSheet explain={freshExplain} onClose={() => setFreshOpen(null)} />
            <WearableSheet explain={wearableOpen ? wearable : null} onClose={() => setWearableOpen(false)} />

            {/* CAPABILITY — freshness rises on a layoff; this does not. */}
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={ty(C, "kicker")}>
                  {t("w.home.cockpit.capability").replace("{n}", String(capability.weeks))}
                </Text>
                {capability.pct !== null && (
                  <Text style={{ marginLeft: "auto", fontFamily: F.monoBold, fontSize: fs.subtitle, color: txt(C, capability.pct >= 0 ? C.lime : C.amber) }}>
                    {capability.pct > 0 ? "+" : ""}{capability.pct}%
                  </Text>
                )}
              </View>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 5, lineHeight: leading(fs.caption) }}>
                {capability.pct === null ? t("w.home.cockpit.capabilityEmpty") : capabilityLine(capability.strength, capability.endurance)}
              </Text>
            </View>

            {/* THE PLOT — the fortnight, as two real lines. It used to be
                approximated with bars and per-day markers because mobile drew
                no SVG; react-native-svg was already in the app for the injury
                mannequin, so both series are stroked from the SHARED geometry
                (@hybrid/core trajectoryPlot) — the domain, the days and the
                session marks come off one engine. Form carries the series
                identity here, never hue alone: readiness is the DASHED line.
                This is a HISTORY, not the day's reading — the day's reading is
                the ring on Today, and it is the only readiness on this tab. */}
            <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: C.line }}>
              <View style={{ flexDirection: "row", alignItems: "baseline" }}>
                <Text style={ty(C, "kicker")}>{t("w.home.cockpit.last14")}</Text>
                <Text style={{ marginLeft: "auto", fontFamily: F.mono, fontSize: fs.nano, textTransform: "uppercase", letterSpacing: tracking(fs.nano, "label"), color: C.ash }}>
                  {t("w.home.cockpit.shownRange").replace("{lo}", String(plot.lo)).replace("{hi}", String(plot.hi))}
                </Text>
              </View>
              <Svg width="100%" height={PLOT.height + 12} viewBox={`0 0 ${PLOT.width} ${PLOT.height + 12}`} style={{ marginTop: 8 }}>
                <Line x1={0} y1={plot.baselineY} x2={PLOT.width} y2={plot.baselineY} stroke={C.line} strokeWidth={1} />
                {/* Readiness is DASH-encoded, not hue-encoded — line style
                    carries the identity on both clients, not a second solid
                    hue. */}
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

      {/* ═════ GROUP: TRAINING — the work itself: who the athlete is, then how
          much they did against what they should. Second of the page's runs and
          the FIRST to be marked — the run above it opens the screen and takes
          no name (see the head of this file). Shares Today's marker component
          and its vocabulary, so the hub's two long scrolls are organised by one
          grammar rather than two. ═════ */}
      <GroupMark label={t("w.home.group.training")} />

      {/* 4 · YOUR LEVEL — who the athlete is, before what they should train.
          That is also the causal order: training age is the strongest single
          input to the volume bands rendered directly below it. It sat four
          interactions deep inside the Volume working until Aug 2026. */}
      <LevelCard sessions={sessions} />

      {/* 5 · THIS WEEK'S VOLUME — the hero shape, a verdict that names names,
          and the rest of it in a drawer. The block ramp, the prescriptions and
          the muscle rails now ease open UNDERNEATH the columns that raised the
          question rather than living on another screen; the provenance ladder
          and the working are dispatched from there as a sheet. */}
      <View style={{ marginTop: 16 }}>
        {/* The model editor has to be reachable from HERE too: the drawer's
            provenance sheet offers "Next — Training age →", and without a
            destination that row renders its arrow and does nothing. */}
        <AuroraVolume onOpenModel={() => router.push("/questionnaire")} />
      </View>

      {/* ═════ GROUP: SEASON — the long arc. ═════ */}
      <GroupMark label={t("w.home.group.season")} />

      {/* 6 · SEASON — one card. The bar draws the fraction, so the line names
          the week once instead of restating it as a percentage. */}
      <ACard solid style={{ marginTop: 16 }}>
        <ASection
          title={!macroRead.settled ? " " : macro ? macro.goalOrSport : t("w.home.cockpit.setUp")}
          meta={macro && phaseBlock ? phaseBlock.label : undefined}
        />
        {macro ? (
          <>
            <View style={{ height: 6, borderRadius: RADIUS.pill, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, overflow: "hidden", marginTop: 2, marginBottom: 9 }}>
              <View style={{ width: `${seasonPct}%`, height: 6, backgroundColor: C.blue }} />
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

      {/* ═════ GROUP: EXPLORE — beyond this page. The SHARED key, not a second
          word for the same idea: Today closes on Explore too, and one label
          rendered by both tabs is what makes this one vocabulary. ═════ */}
      <GroupMark label={t("w.home.group.explore")} />

      {/* 7 · GO DEEPER — the exits. Every row carries a live value, because a
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

/**
 * One pillar column, and the door under it.
 *
 * The WHOLE column is the hit target — a nano mono label beside a 15pt ⓘ is not
 * a tap target anyone finds on a phone — with the ⓘ riding the label row as the
 * visible affordance, exactly as Today's readiness reading does it.
 */
function Comp({ C, label, value, onExplain, explainLabel }: {
  C: Palette; label: string; value: string;
  onExplain: () => void; explainLabel: string;
}) {
  return (
    <Pressable
      onPress={onExplain}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${value} – ${explainLabel}`}
      style={{ flex: 1, alignItems: "center" }}
    >
      <Text style={{ fontFamily: F.black, fontSize: fs.display, color: C.chalk, letterSpacing: tracking(fs.display) }}>{value}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 }}>
        <Text style={ty(C, "kicker")}>{label}</Text>
        {/* The glyph IS a ring — wrapping it in a second bordered circle, as the
            Today reading does at 18px, reads as noise beside a nano label. */}
        <AuroraIcon name="info" size={13} color={C.ash} />
      </View>
    </Pressable>
  );
}

function Mod({ C, label, value, onPress, last }: { C: Palette; label: string; value: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: withAlpha(C.line, 0.6) }}>
      <Text style={ty(C, "kicker")}>{label}</Text>
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
  const { palette: C } = useTheme();
  const { t } = useLang();
  // The teaser owns its own reads — it renders instead of `Full`, so it never
  // sees that component's data.
  const sessionsRead = useSessionsRead();
  const signalsRead = useSignalsRead();
  const sessions = sessionsRead.data ?? [];
  const today = useToday();
  // `today` is a DEPENDENCY, not a call to the clock inside the memo. The
  // recovery window (BIOMETRIC_FRESH_DAYS) is evaluated against Date.now() at
  // memo time, so without this an app left open across a day boundary keeps
  // treating a reading as fresh past its last day — the same defect the daily
  // check-in already guards this way.
  const recoveryRead = useRecoverySignalsRead();
  const bio = useMemo(() => toBiometrics((recoveryRead.data ?? []) as unknown as Parameters<typeof toBiometrics>[0]), [recoveryRead.data, today]);
  const log = useMemo(() => personalTrainingLog(sessions), [sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const hasData = sessionsRead.ready && sessions.length > 0;
  return (
    <AuroraScreen top={top} hero={top ? undefined : { rank: "title", title: t("w.home.cockpit.teaseTitle") }}>
      {/* The teaser is the SAME hub tab to the athlete, so it wears the same
          head — not the AHeading rung it used to borrow, which made Performance
          present its own name at two sizes depending on entitlement. */}
      {top && <HubMasthead title={t("w.home.cockpit.teaseTitle")} />}
      {hasData && (
        <ACard solid>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Text style={{ fontFamily: F.black, fontSize: 44, color: txt(C, hpiColor(state.hpi.band, C)) }}>{state.hpi.score}</Text>
            <View style={{ flex: 1 }}>
              <Text style={ty(C, "kicker")}>
                {t("w.home.cockpit.freshness")}
              </Text>
              <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, hpiColor(state.hpi.band, C)), marginTop: 2 }}>
                {t(hpiBandKey(state.hpi.band))}
              </Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 4, lineHeight: leading(fs.caption) }}>{t("w.home.cockpit.teaseYours")}</Text>
            </View>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, lineHeight: leading(fs.body) }}>
            {t(`w.home.cockpit.limiter.${state.hpi.limiter}`)}
          </Text>
        </ACard>
      )}
      <ASub style={{ marginTop: hasData ? 16 : 0 }}>{t("w.home.cockpit.teaseSub1")}{t("w.home.cockpit.teaseSub2")}{t("w.home.cockpit.teaseSub3")}</ASub>
      {TEASE.map((s) => (
        /* No leading marker: a dot in front of a label is decoration, and the
           house rule forbids it. The lock on the right is the semantic one. */
        <ACard solid key={s.key} style={{ marginTop: 12, opacity: 0.75, flexDirection: "row", alignItems: "center", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "caps"), color: C.ash }}>{t(`w.home.cockpit.tease.${s.key}.kicker`)}</Text>
            <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, marginTop: 4, lineHeight: leading(fs.caption) }}>{t(`w.home.cockpit.tease.${s.key}.blurb`)}</Text>
          </View>
          <AuroraIcon name="lock" size={18} color={C.ash} />
        </ACard>
      ))}
      <APill label={paid ? t("w.home.cockpit.switchToFull") : t("w.home.cockpit.upgradeToFull")} onPress={onUnlock} style={{ marginTop: 16 }} />
    </AuroraScreen>
  );
}
