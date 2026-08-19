import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { APill , RADIUS} from "./aurora/kit";
import { View, Text, ScrollView, Dimensions, Animated, Easing, type TextStyle, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  HERO,
  HERO_FIGURE,
  heroGeometry,
  heroTitleType,
  SHARED_ELEMENTS,
  sessionWrapped,
  fitScale,
  STAT_FIT_EM,
  hasActiveConnection,
  feelSamples,
  loadBaseline,
  doneReceipt,
  sessionCelebration,
  sessionMuscleMap,
  muscleBaseline,
  muscleCoverage,
  springs,
  springToRN,
  isFullAccess,
  volumeByMuscle,
  sessionFunFact,
  funFactText,
  sessionVolume,
  sessionSignature,
  SIGNATURE_MIN_BARS,
  blockTopLoad,
  strengthPrDelta,
  formatCardioPr,
  workoutShareCaption,
  fmtWeight,
  formatSportPace,
  heatAfterSession,
  fmtTemp,
  formatSportDistance,
  statCountUp,
  prsForSession,
  cardioPrsForSession,
  storyStyle,
  STORY_STYLES,
  DEFAULT_STORY_STYLE,
  deviceComparisonRows,
  deviceImportedSession,
  deviceMarkFor,
  deviceSourceLabel,
  deviceTrueSession,
  sessionEnergy,
  type DeviceWorkout,
  type StoryStyleId,
  HERO_TAKEOVER_INK,
  HERO_TAKEOVER_RAISED,
  type LoggedSession,
  type WeightUnit,
  type BodyweightLookup,
  ALPHA,
  THEMES, STATE_OPACITY } from "@hybrid/core";
import { fetchConnections, patchSessionDevice } from "../lib/api";
import { healthKitAvailability } from "../lib/healthkit";
import { useHeatSignalsQuery, useRevalidate } from "../lib/queries";
import { DeviceMatchSheet } from "./device-match";
import { DeviceMark } from "./aurora/device-mark";
import { AuroraIcon } from "./aurora/icons";
import { HeroEyebrow, HeroNav } from "./aurora/hero";
import { CtaLabel } from "./aurora/cta-label";
import { FeelPrompt } from "./feel-prompt";
import SessionBody from "./aurora/session-body";
import { HeatSheet } from "./aurora/heat-sheet";
import { usePersona } from "../lib/persona";
import { usePremiumAccent } from "../lib/premium-accent";
import { useLang } from "../lib/i18n";
import { SlideStoryCard, shareWorkout, type SlideData, type ShareBest } from "../lib/share";
import { leading, fs, F, TABULAR, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE , tracking} from "../lib/ui";
import { useSharedElementTarget } from "../lib/shared-element";
import { useTheme, txt, deltaPaint } from "../lib/theme";
import Sheet from "./aurora/sheet";
import { withAlpha } from "./aurora/field";

// `gold` is a THEME value, and this const is module scope — so it names the
// one theme the app has rather than copying its hex. (The light theme was
// deleted whole in Aug 2026; see the light-theme-removed capability.)
const GOLD = THEMES.dark.accentText.amber; // Fleur De Lis — the retired `gold` token sat ΔE 8.6 from it

// Deterministic confetti fan for the reveal (module-level → stable positions).
const CONFETTI = Array.from({ length: 16 }, (_, i) => {
  const a = (i / 16) * Math.PI * 2;
  const d = 70 + (i % 4) * 22;
  return { tx: Math.round(Math.cos(a) * d), ty: Math.round(Math.sin(a) * d - 26), ci: i % 4 };
});

// A soft translucent glow disc — the RN parity of the artifact's radial-gradients.
function Glow({ size, color, top, left, right, bottom }: { size: number; color: string; top?: number; left?: number; right?: number; bottom?: number }) {
  return <View pointerEvents="none" style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color, top, left, right, bottom }} />;
}

// A number that ticks up from 0 → final on mount, then rests on the exact value.
function CountUp({ value, style }: { value: string; style: TextStyle }) {
  const [disp, setDisp] = useState(value);
  useEffect(() => {
    const { target, format } = statCountUp(value);
    if (!target) { setDisp(value); return; }
    const dur = 900, t0 = Date.now();
    let raf: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      if (p < 1) { setDisp(format(target * e)); raf = requestAnimationFrame(tick); }
      else setDisp(value);
    };
    setDisp(format(0));
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  // TABULAR, and this is the case that proves the rule: the value is re-rendered
  // every frame for 900ms, so a proportional numeral resizes the figure under
  // itself all the way up and the count reads as a wobble rather than a climb.
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[TABULAR, style]} numberOfLines={1} adjustsFontSizeToFit>{disp}</Text>;
}

/**
 * WORKOUT WRAPPED — the individual-session view, rendered as the reference
 * prototype (reference/pr-wrapped-flow.html): open a session and it IS the
 * experience — the PR reveal (if any) → the premium Wrapped panels you scroll
 * through → the story-share sheet. The workout's set breakdown + manage actions
 * ride along as a final `details` section. Web parity: components/aurora/
 * workout-wrapped.tsx.
 */
export function WorkoutWrapped({
  session,
  all,
  units,
  bw,
  onBack,
  details,
}: {
  session: LoggedSession;
  all: LoggedSession[];
  units: WeightUnit;
  bw: BodyweightLookup;
  onBack: () => void;
  /** the workout's set breakdown + manage row, shown as the trailing section */
  details: ReactNode;
}) {
  const C = useTheme().palette;
  const { t } = useLang();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const premium = usePremiumAccent();
  const full = isFullAccess(usePersona());

  const win = Dimensions.get("window");
  const panelH = win.height;
  const previewW = Math.min(300, win.width - 84);

  const [panel, setPanel] = useState(0);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [heatOpen, setHeatOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [styleId, setStyleId] = useState<StoryStyleId>(DEFAULT_STORY_STYLE);
  // null = not known yet (don't flash a "connect a device" prompt at someone
  // who already has one connected).
  const [deviceConnected, setDeviceConnected] = useState<boolean | null>(null);
  // The device's read of THIS workout (Apple Watch match) — seeded from the
  // session, kept locally so a match/unlink reflects without a refetch.
  const [device, setDevice] = useState<DeviceWorkout | null>(session.device ?? null);
  const [matchOpen, setMatchOpen] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const revalidate = useRevalidate();
  // Only a binary with the native module can read the watch's workouts.
  const canMatch = healthKitAvailability() === "ready";

  /**
   * THE SAUNA THIS SESSION ALREADY HAS, if any.
   *
   * This screen is routinely opened HOURS after the training it describes — a
   * watch recording gets imported that evening, and the summary of a 13:00
   * workout is read at 21:00 — while the sauna at 14:00 was typed the moment it
   * ended. So "finish in the sauna?" cannot be an unconditional invitation: put
   * to an athlete who logged it seven hours ago, it is an invitation to log it
   * twice, and the sheet behind it opens defaulted to this session's own end,
   * an hour off the sitting already on the record. `heatAdjustment` would sum
   * both inside one 48 h window and the frequency tier that feeds MRV would
   * count two sittings the athlete never took.
   *
   * The prompt therefore READS the record first and states what it finds. It
   * still opens the sheet — a second round is a real thing and the sitting may
   * need correcting — but the athlete is answering a question about something
   * they can see rather than one that assumes nothing happened.
   */
  const { data: heatRows = [] } = useHeatSignalsQuery();
  const loggedHeat = useMemo(
    () => heatAfterSession(heatRows, session.completedAt ?? session.startedAt ?? null),
    [heatRows, session.completedAt, session.startedAt],
  );
  const pagerRef = useRef<ScrollView>(null);
  const storyRefs = useRef<Record<number, View | null>>({});

  useEffect(() => {
    let alive = true;
    fetchConnections().then((d) => {
      if (alive) setDeviceConnected(hasActiveConnection(d.connections));
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  const bwHere = bw(session.startedAt);
  // The session AS THE APP NOW READS IT: a match made on this screen is the
  // truth immediately, without waiting for the refetch to land.
  const view = useMemo(() => ({ ...session, device }), [session, device]);
  const wrapped = sessionWrapped(view, all, { units, bw });
  // Device-first (every figure on this screen) and the logged-only read, which
  // exists solely for the comparison panel's left column.
  const receipt = doneReceipt(view, { bodyweightKg: bwHere });
  const logged = doneReceipt(session, { bodyweightKg: bwHere, ignoreDevice: true });
  // "vs your usual" compares the athlete to THEMSELVES over the last month —
  // never a cohort, and never until there are enough rated sessions for the
  // comparison to mean anything (loadBaseline enforces the floor). Memoised:
  // feelSamples walks every logged session.
  const feelBaseline = useMemo(
    () => loadBaseline(feelSamples(all, bw), { excludeId: session.id }),
    [all, bw, session.id],
  );
  // WHERE THE WORK LANDED — the session's own muscle map, each row measured
  // against that muscle's 28-day norm from the sessions BEFORE this one (a
  // session cannot be part of its own baseline). Memoised together: the
  // baseline walks a month of sessions and coverage walks two, and both re-run
  // the whole map per session.
  const muscleRead = useMemo(() => {
    const prior = all.filter((s) => s.id !== session.id);
    const now = new Date(session.startedAt);
    const baseline = muscleBaseline(prior, { bw, now });
    return {
      map: sessionMuscleMap(view, { bw, baseline }),
      coverage: muscleCoverage(prior, { bw, now }),
    };
  }, [all, bw, session.id, session.startedAt, view]);
  const prs = prsForSession(all, session.id, bw);
  const cardioPrs = cardioPrsForSession(all, session.id);
  const cel = sessionCelebration(prs, cardioPrs);
  // The share card's minutes: the trusted (device-first) duration, falling back
  // to the wall-clock span for a session with nothing better.
  const minutes = receipt.durationMin ?? (session.completedAt ? Math.max(1, Math.round((new Date(session.completedAt).getTime() - new Date(session.startedAt).getTime()) / 60000)) : 0);
  const volume = sessionVolume(session.blocks, false, bwHere);
  const sets = session.blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);
  const signature = sessionSignature(session);

  // Per-lift bests = the HEAVIEST weight actually moved (#231), never an e1RM.
  const bestMap = new Map<string, number>();
  for (const b of session.blocks)
    if (b.kind === "strength") {
      const w = blockTopLoad(b, bwHere);
      if (w > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, w));
    }
  const prSet = new Set(prs.map((p) => p.lift));
  const bests: ShareBest[] = [...bestMap.entries()].map(([name, weight]) => ({ name, weight, pr: prSet.has(name) })).sort((a, b) => b.weight - a.weight);
  // No PR to celebrate → the hero shows the number that DEFINES this kind of
  // session (distance for a swim, tonnage for a lift, time for a match), not
  // tonnage for everything — which read "0.0 t" on every cardio log.
  // A pace PR reads in the MOVE's own split — a pool swim is "3:52 /100m", not
  // the "39:13 /km" a hard-coded per-km label made of it.
  const heroBig = cel
    ? cel.kind === "strength" ? fmtWeight(cel.topLoad, units) : cel.prKind === "distance" ? formatSportDistance(cel.value, cel.move) : formatSportPace(cel.value, cel.move)
    : wrapped.headline.value;
  // A record isn't always a heavier bar — more reps at the same load is a real
  // PR, and claiming "+0 kg" there would be a lie.
  const heroSub = cel
    ? cel.kind === "strength"
      ? `${cel.lift} — ${strengthPrDelta(cel, { first: t("summary.firstEver"), moreReps: t("summary.morePrReps") }, units)}`
      : cel.move
    : session.title;

  // What a PR row says on the right — shared with the other client so the
  // three-way branch can't drift ("+0 kg" would read as no progress at all).
  const prDelta = (p: { topLoad: number; previousTopLoad: number | null }) =>
    strengthPrDelta(p, { first: t("summary.firstTime"), moreReps: t("summary.morePrReps") }, units);

  // ── story slides for the share sheet (trophy + signature lead) ──
  const muscleVol = volumeByMuscle(session.blocks, false, bwHere);
  const muscleMax = muscleVol[0]?.volume ?? 0;
  // The fun fact is a distance/tonnage comparison — measured where a device
  // measured it.
  const funFact = sessionFunFact(deviceTrueSession(view).blocks, bwHere);
  const prRows: { left: string; right: string; hot?: boolean }[] = [
    ...prs.map((p) => ({ left: p.lift, right: prDelta(p), hot: true })),
    // The shared cardio formatter, same as the post-workout PR slide — raw km
    // would read a 400 m swim PR as "Swimming 0.4 km" and drop the delta.
    ...cardioPrs.map((p) => ({ left: formatCardioPr(p, t("summary.firstTime")), right: "", hot: true })),
    ...bests.filter((b) => !prs.some((p) => p.lift === b.name)).slice(0, 6).map((b) => ({ left: b.name, right: fmtWeight(b.weight, units) })),
  ];
  // Pluralized — "1 new PR", not "1 new PRs"; identical on both clients.
  const prHeadline = prs.length > 0 ? `${prs.length} ${prs.length > 1 ? t("w.train.logger.newPrs") : t("w.train.logger.newPr")}` : cardioPrs.length > 0 ? `${cardioPrs.length} ${cardioPrs.length > 1 ? t("w.train.logger.cardioPrs") : t("w.train.logger.cardioPr")}` : t("summary.todaysBests");
  const bespoke: SlideData[] = [
    ...(cel ? [{ kind: "trophy", eyebrow: t("summary.slide.prs"), value: heroBig, caption: cel.kind === "strength" ? cel.lift : cel.move, sub: cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne") } as SlideData] : []),
    ...(signature.length >= SIGNATURE_MIN_BARS ? [{ kind: "signature", eyebrow: t("session.wrapped.title"), bars: signature, value: heroBig, caption: session.title } as SlideData] : []),
  ];
  // The overview card is a GYM card (title + volume/sets/minutes): on a swim it
  // would read "1 set, 0.0 t", so it only rides along when the session actually
  // did that kind of work. The single-stat card headlines the same number the
  // hero does, so a cardio log leads with its distance instead of zero tonnage.
  const gymSession = wrapped.discipline === "strength" || wrapped.discipline === "mixed";
  const slides: SlideData[] = [
    ...bespoke,
    ...(gymSession
      ? [{ kind: "overview", eyebrow: t("summary.slide.overview"), stats: { title: session.title, minutes, sets, volume, bests }, firstEver: false } as SlideData]
      : []),
    { kind: "stat", eyebrow: t("summary.slide.load"), value: wrapped.headline.value, unit: t(wrapped.headline.labelKey) },
    { kind: "prs", eyebrow: t("summary.slide.prs"), headline: prHeadline, rows: prRows.length ? prRows : [{ left: t("summary.todaysBests"), right: "" }] },
    ...(muscleVol.length ? [{ kind: "muscle", eyebrow: t("summary.slide.muscle"), bars: muscleVol.slice(0, 6).map((m) => ({ label: t(`muscle.${m.muscle}`), pct: muscleMax ? Math.round((m.volume / muscleMax) * 100) : 0, value: fmtWeight(m.volume, units) })) } as SlideData] : []),
    ...(funFact ? [{ kind: "fun", eyebrow: t("summary.slide.fun"), mark: funFact.mark, text: funFactText(funFact, units, t) } as SlideData] : []),
  ];
  const activeIdx = Math.min(active, slides.length - 1);
  const st = storyStyle(styleId);
  const cycleStyle = () => setStyleId((cur) => STORY_STYLES[(STORY_STYLES.findIndex((s) => s.id === cur) + 1) % STORY_STYLES.length]!.id);
  // The caption headlines the SAME record the reveal hero showed — `cel`, not
  // prs[0] (which is ordered by e1RM gain and can be a different lift).
  const captionHeadline =
    cel && cel.kind === "strength"
      ? `\u{1F3C6} ${cel.lift} ${fmtWeight(cel.topLoad, units)}`
      : bests[0]
        ? `${t("share.topLift")}: ${bests[0].name} ${fmtWeight(bests[0].weight, units)}`
        : null;
  const shareText = workoutShareCaption({ title: session.title, minutes, sets, volume, headline: captionHeadline }, units, t);
  const shareNow = () => shareWorkout({ current: storyRefs.current[activeIdx] ?? null }, shareText, t("summary.shareStory"));

  // SHARED ELEMENT (destination) — see the HERO title below. Only claimed for a
  // non-celebration session; `cel` sessions own their panel's motion.
  // The flying clone must land on EXACTLY the destination's type, so it reads
  // the same hero ramp the panel's title does — not a hand-copied size.
  const titleType = heroTitleType(session.title, "cover");
  const titleStyle = { fontFamily: F.black, fontSize: titleType.size, color: C.chalk, letterSpacing: titleType.tracking * titleType.size, lineHeight: titleType.lineHeight } as const;
  const { ref: titleRef, hidden: titleHidden } = useSharedElementTarget(
    cel ? "" : SHARED_ELEMENTS.sessionHero,
    session.title,
    titleStyle,
  );

  // ── reveal animation ──
  const scale = useRef(new Animated.Value(cel ? 0 : 1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!cel) return;
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, ...springToRN(springs.pop), delay: 150 }).start();
    Animated.timing(burst, { toValue: 1, duration: 900, delay: 200, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 16000, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [cel, scale, burst, spin]);

  // The post-workout self-report ("How did that feel?") and the device panel:
  // once this session is MATCHED to a watch workout the panel shows the
  // measured read next to the logged one; until then (and only when nothing is
  // measuring this athlete) it is the connect-a-device prompt.
  const showDeviceAd = !device && deviceConnected === false && (wrapped.sparse || wrapped.energy == null);
  // A session the import CREATED has no logged side at all — its block is the
  // recording, copied. Showing those echoes as "you logged" would invent a
  // second reading out of our own rounding, so the panel goes single-column.
  const imported = device != null && deviceImportedSession({ ...session, device });
  // Both columns come from the LOGGED read — the device's own figures are the
  // other column, and passing the effective ones would print them twice.
  const comparison = device
    ? deviceComparisonRows(
        imported
          ? { device }
          : {
              device,
              durationMin: logged.durationMin,
              estimatedKcal: sessionEnergy(session, { bodyweightKg: bwHere, durationMin: logged.durationMin, ignoreDevice: true })?.kcal ?? null,
              distanceKm: logged.distanceKm,
              elevationM: logged.elevationM,
            },
      )
    : [];
  const deviceName = deviceSourceLabel(device);
  // Whether this connector ships artwork. When it doesn't, every lockup below
  // falls back to naming the device in text — same sentence, no glyph.
  const deviceMark = deviceMarkFor(device?.provider) != null;
  const onMatched = (d: DeviceWorkout | null) => {
    setDevice(d);
    void revalidate.sessions();
  };
  const unlinkDevice = async () => {
    if (unlinking) return;
    setUnlinking(true);
    const ok = await patchSessionDevice(session.id, null);
    setUnlinking(false);
    if (ok) onMatched(null);
  };

  // Which panels exist (dots + snap offsets), details rides after them.
  const keys: ("reveal" | "hero" | "body" | "feel" | "premium" | "device" | "signature")[] = [
    ...(cel ? ["reveal" as const] : []),
    "hero" as const,
    // A session with no mapped lifting (a run, a match, an all-custom day) has
    // no body to light, so the panel is absent rather than dark.
    ...(muscleRead.map.muscles.length ? ["body" as const] : []),
    "feel" as const,
    ...(wrapped.facts.length ? ["premium" as const] : []),
    ...(device || showDeviceAd ? ["device" as const] : []),
    "signature" as const,
  ];
  const detailsIndex = keys.length;
  const snapOffsets = keys.map((_, i) => i * panelH);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setPanel(Math.round(e.nativeEvent.contentOffset.y / panelH));
  const showDock = panel < detailsIndex;

  // The takeover keeps the HERO SYSTEM's metadata voice — same mono/uppercase/
  // tracked line the cover's chip and every rail accessory use, tinted gold and
  // carrying the ✦ premium signifier. It is an EYEBROW, not a third invention.
  const eyebrow = (label: string) => <HeroEyebrow label={label} tone="tint" accent={GOLD} mark="✦" />;
  const scrollHint = (
    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, textAlign: "center", marginTop: 16 }}>{t("session.wrapped.scroll")} ↑</Text>
  );
  // The takeover is rank `cover`, mode `takeover`: no collapse track, but the
  // rail sits at the system's y and the panels clear the same bar height every
  // other screen clears.
  const geom = heroGeometry("cover", insets.top, "takeover");
  const padTop = geom.barHeight;

  const Panel = ({ children, center, glows }: { children: ReactNode; center?: boolean; glows?: ReactNode }) => (
    <View style={{ height: panelH, paddingHorizontal: HERO.gutter.hero, paddingTop: padTop, paddingBottom: 150, justifyContent: center ? "center" : "flex-start", overflow: "hidden" }}>
      {glows}
      {children}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: HERO_TAKEOVER_INK }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        snapToOffsets={snapOffsets}
        snapToEnd={false}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
      >
        {/* ── REVEAL ── */}
        {cel && (
          <Panel center glows={<><View pointerEvents="none" style={{ position: "absolute", top: "34%", left: "50%", marginLeft: -230, marginTop: -230, width: 460, height: 460 }}><Animated.View style={{ flex: 1, opacity: 0.9, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}><LinearGradient colors={[withAlpha(GOLD, 0.15), "transparent", withAlpha(C.lime, 0.11), "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 230 }} /></Animated.View></View></>}>
            <View style={{ alignItems: "center" }}>
              {CONFETTI.map((c, i) => (
                <Animated.View key={i} pointerEvents="none" style={{ position: "absolute", top: -20, width: 7, height: 7, borderRadius: 2, backgroundColor: [C.lime, GOLD, C.blue, C.red][c.ci], opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, c.tx] }) }, { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, c.ty] }) }] }} />
              ))}
              <Animated.View style={{ transform: [{ scale }] }}><AuroraIcon name="trophy" size={84} color={GOLD} /></Animated.View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, letterSpacing: tracking.caps, color: GOLD, textTransform: "uppercase", marginTop: 24 }}>{cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne")}</Text>
              <CountUp value={heroBig} style={{ fontFamily: F.black, fontSize: HERO_FIGURE.size, lineHeight: HERO_FIGURE.lineHeight, color: C.chalk, letterSpacing: HERO_FIGURE.tracking * HERO_FIGURE.size, marginTop: 12 }} />
              <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk, marginTop: 6, textAlign: "center" }}>{heroSub}</Text>
            </View>
          </Panel>
        )}

        {/* ── HERO ── */}
        <Panel glows={<><Glow size={panelH * 0.5} color={withAlpha(C.blue, ALPHA.fill)} top={-40} right={-80} /><Glow size={panelH * 0.5} color={withAlpha(C.lime, ALPHA.wash)} bottom={panelH * 0.2} left={-90} /></>}>
          {eyebrow(t("session.wrapped.title"))}
          {/* SHARED ELEMENT (destination). The title the tapped row was showing
              flies here and scales up instead of the page re-rendering it.
              DECLINED while `cel` is true: a celebration session runs its own
              reveal on this panel, and a clone landing on a surface that is
              itself scaling from zero is two motions fighting — the arm simply
              expires and the ordinary push carries the change. */}
          <Text ref={titleRef} numberOfLines={titleType.maxLines} style={{ ...titleStyle, marginTop: 12, opacity: titleHidden ? 0 : 1 }}>
            {session.title}
          </Text>
          <View style={{ flex: 1 }} />
          <CountUp value={heroBig} style={{ fontFamily: F.black, fontSize: HERO_FIGURE.size, lineHeight: HERO_FIGURE.lineHeight, color: C.chalk, letterSpacing: HERO_FIGURE.tracking * HERO_FIGURE.size }} />
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: cel ? txt(C, C.lime) : C.chalk, marginTop: 10 }}>{heroSub}</Text>
          <View style={{ flexDirection: "row", marginTop: 20, borderRadius: RADIUS.field, borderWidth: 1, borderColor: C.line, overflow: "hidden" }}>
            {wrapped.basics.map((b, i) => (
              <View key={b.labelKey} style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 4, alignItems: "center", backgroundColor: HERO_TAKEOVER_RAISED, borderLeftWidth: i ? 1 : 0, borderLeftColor: C.line }}>
                {/* A modelled figure wears a "~" — it is never presented as a
                    measurement (see core/energy.ts). */}
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: F.black, fontSize: fs.headline * fitScale((b.estimate ? "~" : "") + b.value, STAT_FIT_EM), color: C.chalk }}>{b.estimate ? "~" : ""}{b.value}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, textTransform: "uppercase", marginTop: 4 }}>{t(b.labelKey)}</Text>
              </View>
            ))}
          </View>
          {/* The first thing after the numbers: pull the watch's read of this
              exact workout onto the row (or show that it's already there). */}
          {device ? (
            /* The lockup finishes the sentence, so the copy never repeats the
               device's name. Chip and mark are both chalk: the artwork can't be
               tinted, and a white logo next to lime text would read as two
               claims at once. See core/device-marks.ts. */
            <Pressable onPress={() => setMatchOpen(true)} style={{ marginTop: 16, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: withAlpha(C.chalk, ALPHA.line), borderRadius: RADIUS.pill, paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.chalk }}>{t("session.device.measuredOn")}</Text>
              {deviceMark ? (
                <DeviceMark provider={device.provider} height={16} on="dark" label={deviceName ?? undefined} />
              ) : (
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.chalk }}>{deviceName ?? t("session.device.matchedChip")}</Text>
              )}
            </Pressable>
          ) : canMatch ? (
            <Pressable onPress={() => setMatchOpen(true)} style={{ marginTop: 16, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: HERO_TAKEOVER_RAISED }}>
              <DeviceMark provider="apple" form="mark" height={13} on="dark" label="" />
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("session.device.matchCta")}</Text>
            </Pressable>
          ) : null}
          {scrollHint}
        </Panel>

        {/* ── WHERE THE WORK LANDED ── */}
        {/* The body, lit by this session's own share of effort. It follows the
            hero because the hero says HOW MUCH and this says WHERE — and it is
            the one panel nobody else's summary can produce. */}
        {muscleRead.map.muscles.length > 0 && (
          <Panel glows={<Glow size={panelH * 0.55} color={withAlpha(C.lime, ALPHA.wash)} top={panelH * 0.18} left={-80} />}>
            {eyebrow(t("session.body.title"))}
            <SessionBody map={muscleRead.map} coverage={muscleRead.coverage} units={units} />
          </Panel>
        )}

        {/* ── HOW DID THAT FEEL? ── */}
        {/* The immediate read, for a session opened later that was never rated.
            The card says what a late answer is worth rather than pretending it
            is the in-the-gym reading. See core/feel-schedule.ts. */}
        <Panel center glows={<Glow size={panelH * 0.45} color={withAlpha(C.lime, ALPHA.wash)} top={panelH * 0.05} left={-90} />}>
          <FeelPrompt
            sessionId={session.id}
            minutes={receipt.durationMin}
            initialFeel={session.feel ?? null}
            initialFatigue={session.fatigue ?? null}
            sessionEnd={session.completedAt ?? session.startedAt ?? null}
            baseline={feelBaseline}
            eyebrow={eyebrow}
          />

          {/* HEAT — the PRIMARY entry, and it lives here for a reason the
              Today row cannot match: this is the only moment where the gap
              from the session end is known exactly, which is what the decay in
              engines/heat.ts and the phase-4 pair matching both read. Passing
              the session's own end as the default means a sauna logged on the
              way home is dated to the sauna, not to the tap.

              It ASKS or it REPORTS, depending on what the log already holds —
              see `loggedHeat` above. An out-of-order import is exactly the case
              where the invitation arrives after the answer. */}
          <Pressable
            onPress={() => setHeatOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t(loggedHeat ? "w.recovery.heat.afterSessionDone" : "w.recovery.heat.afterSession")}
            style={{
              marginTop: 22, alignSelf: "stretch", flexDirection: "row", alignItems: "center",
              justifyContent: "space-between", gap: 12,
              borderWidth: 1, borderColor: withAlpha(C.amber, ALPHA.line), backgroundColor: withAlpha(C.amber, ALPHA.wash),
              borderRadius: 20, paddingVertical: 13, paddingHorizontal: 16,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.chalk }}>
                {t(loggedHeat ? "w.recovery.heat.afterSessionDone" : "w.recovery.heat.afterSession")}
              </Text>
              <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 3 }}>
                {loggedHeat
                  ? t("w.recovery.heat.afterSessionLogged")
                      .replace("{n}", String(loggedHeat.minutes))
                      .replace("{t}", fmtTemp(loggedHeat.tempC, units))
                      .replace("{at}", new Date(loggedHeat.ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }))
                  : t("w.recovery.heat.afterSessionSub")}
              </Text>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: txt(C, C.amber) }}>&#8594;</Text>
          </Pressable>
        </Panel>

        {/* ── PREMIUM ── */}
        {wrapped.facts.length > 0 && (
          <Panel center glows={<Glow size={panelH * 0.5} color={withAlpha(C.blue, ALPHA.wash)} top={0} left={-100} />}>
            {eyebrow(t("session.wrapped.premium"))}
            <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: C.chalk, marginTop: 8, marginBottom: 20 }}>{t("session.wrapped.premiumLead")}</Text>
            {wrapped.facts.map((f) => (
              <View key={f.labelKey + f.value} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.ash, textTransform: "uppercase" }}>{t(f.labelKey)}</Text>
                <Text style={{ fontFamily: F.black, fontSize: fs.display, color: f.labelKey === "session.wrapped.est1rm" ? txt(C, C.lime) : deltaPaint(C, !f.tone || f.tone === "neutral" ? "flat" : f.tone) }}>{f.value}</Text>
              </View>
            ))}
            {!full && (
              <Pressable onPress={() => { onBack(); router.push("/upgrade"); }} style={{ marginTop: 24, alignSelf: "flex-start", backgroundColor: premium.fill, borderRadius: RADIUS.pill, paddingVertical: 12, paddingHorizontal: 20 }}>
                <Text style={{ fontFamily: F.black, fontSize: fs.note, color: premium.ink }}>✦ {t("session.wrapped.unlock")}</Text>
              </Pressable>
            )}
          </Panel>
        )}

        {/* ── THE DEVICE'S READ (matched) ── */}
        {device && (
          <Panel center glows={<Glow size={panelH * 0.45} color={withAlpha(C.lime, ALPHA.wash)} top={panelH * 0.06} right={-90} />}>
            {eyebrow(t("session.device.panelTitle"))}
            <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk, letterSpacing: tracking.display, lineHeight: leading(28, "tight"), marginTop: 12 }}>{device.activityLabel}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: 17, color: C.ash, marginTop: 10 }}>{t(imported ? "session.device.leadImported" : "session.device.lead")}</Text>
            <View style={{ marginTop: 20, borderRadius: RADIUS.field, borderWidth: 1, borderColor: C.line, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 16, backgroundColor: HERO_TAKEOVER_RAISED }}>
                <View style={{ flex: 1.1 }} />
                {/* An imported session has no logged column — the recording IS the log. */}
                {!imported && (
                  <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, textTransform: "uppercase", textAlign: "right" }}>{t("session.device.appCol")}</Text>
                )}
                {/* The lockup heads the measured column instead of the device's
                    name, and the column's figures below are chalk with it — the
                    whole measured side reads in one ink. */}
                {deviceMark ? (
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <DeviceMark provider={device.provider} height={15} on="dark" label={deviceName ?? undefined} />
                  </View>
                ) : (
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.chalk, textTransform: "uppercase", textAlign: "right" }}>{deviceName ?? t("session.device.deviceCol")}</Text>
                )}
              </View>
              {comparison.map((r) => (
                <View key={r.labelKey} style={{ flexDirection: "row", alignItems: "baseline", paddingVertical: 12, paddingHorizontal: 16, backgroundColor: HERO_TAKEOVER_RAISED, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Text style={{ flex: 1.1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, textTransform: "uppercase" }}>{t(r.labelKey)}</Text>
                  {/* A modelled figure wears a "~" — never presented as a measurement. */}
                  {!imported && (
                    <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk, textAlign: "right" }}>{r.app != null ? `${r.appEstimate ? "~" : ""}${r.app}` : "—"}</Text>
                  )}
                  <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.bodyLg, color: C.chalk, textAlign: "right" }}>{r.device ?? "—"}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, lineHeight: leading(fs.nano, "relaxed"), color: C.ash, marginTop: 12 }}>{t(imported ? "session.device.truthImported" : "session.device.truth")}</Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 20 }}>
              <Pressable onPress={() => setMatchOpen(true)}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{t("session.device.rematch")}</Text>
              </Pressable>
              <Pressable onPress={() => void unlinkDevice()} disabled={unlinking} style={{ opacity: unlinking ? STATE_OPACITY.busy : 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("session.device.unlink")}</Text>
              </Pressable>
            </View>
          </Panel>
        )}

        {/* ── CONNECT A DEVICE ── */}
        {showDeviceAd && (
          <Panel center glows={<Glow size={panelH * 0.45} color={withAlpha(C.blue, ALPHA.wash)} top={panelH * 0.06} right={-90} />}>
            {eyebrow(t("session.wrapped.device.title"))}
            <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk, letterSpacing: tracking.display, lineHeight: leading(28, "tight"), marginTop: 12 }}>{t("session.wrapped.device.lead")}</Text>
            <View style={{ marginTop: 24, borderRadius: RADIUS.field, borderWidth: 1, borderColor: C.line, overflow: "hidden" }}>
              {([
                ["heart", C.red, "session.wrapped.device.hr"],
                ["flame", C.red, "session.wrapped.device.energy"],
                ["stopwatch", C.chalk, "session.wrapped.device.time"],
                ["moon", GOLD, "session.wrapped.device.recovery"],
              ] as const).map(([icon, tint, key], i) => (
                <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: HERO_TAKEOVER_RAISED, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                  <AuroraIcon name={icon} size={16} color={tint} />
                  <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t(key)}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => { onBack(); router.push("/connections"); }} style={{ marginTop: 24, alignSelf: "flex-start", backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, paddingHorizontal: 24 }}>
              <CtaLabel label={`${t("session.wrapped.device.cta")} →`} color={C.onAccent} fontSize={15} font={F.black} />
            </Pressable>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: 17, color: C.ash, marginTop: 16 }}>
              {bwHere ? t("session.wrapped.device.estimate") : t("session.wrapped.device.bodyweight")}
            </Text>
          </Panel>
        )}

        {/* ── SIGNATURE ── */}
        <Panel center glows={<Glow size={panelH * 0.55} color={withAlpha(GOLD, ALPHA.wash)} top={-panelH * 0.1} left={win.width / 2 - panelH * 0.275} />}>
          <View style={{ alignItems: "center" }}>
            {eyebrow(t("session.wrapped.title"))}
            {signature.length >= SIGNATURE_MIN_BARS && (
              <>
                <View style={{ flexDirection: "row", alignItems: "flex-end", height: 72, marginTop: 34, gap: 3 }}>
                  {signature.map((v, i) => (
                    <View key={i} style={{ width: 6, height: `${Math.round(v * 100)}%`, borderRadius: RADIUS.mark, backgroundColor: C.lime, opacity: 0.4 + v * 0.6 }} />
                  ))}
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, marginTop: 12 }}>{t("session.wrapped.signatureCap")}</Text>
              </>
            )}
          </View>
        </Panel>

        {/* ── DETAILS (breakdown + manage) ── */}
        <View style={{ backgroundColor: C.ink, paddingHorizontal: 16, paddingTop: 28, paddingBottom: insets.bottom + 40, minHeight: panelH }}>
          {details}
        </View>
      </ScrollView>

      {/* THE RAIL — the same 40pt circular control, at the same y, as every
          other screen. A takeover has no stack under it, so it DISMISSES
          (chevron-down) rather than pops; the geometry is untouched, which is
          why the thumb never has to re-find it. */}
      <View style={{ position: "absolute", top: geom.railTop, left: HERO.gutter.edge, right: HERO.gutter.edge, height: HERO.rail.height, flexDirection: "row", alignItems: "center", zIndex: 5 }}>
        <HeroNav onPress={onBack} mode="takeover" material="glass" onDark />
      </View>

      {/* Sticky share dock — over the wrapped panels only */}
      {showDock && (
        <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 20 }}>
          <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginBottom: 16 }}>
            {keys.map((_, i) => (
              <View key={i} style={{ width: i === Math.min(panel, keys.length - 1) ? 18 : 6, height: 6, borderRadius: RADIUS.mark, backgroundColor: i === Math.min(panel, keys.length - 1) ? C.lime : C.line }} />
            ))}
          </View>
          <APill label={`↗ ${t("summary.share")}`} onPress={() => { setActive(0); setSheetOpen(true); }} />
        </View>
      )}

      {/* ── HEAT SHEET ──
          Defaulted to the session's own end, so a sauna taken straight after
          is dated to the sauna rather than to whenever this screen was tapped.
          Invalidates the shared heat cache on save so Today's ring and the
          volume model both see it. */}
      <HeatSheet
        visible={heatOpen}
        onClose={() => setHeatOpen(false)}
        onLogged={revalidate.heat}
        weightUnit={units}
        initialAt={session.completedAt ? new Date(session.completedAt) : undefined}
      />

      {/* ── DEVICE MATCH SHEET ── */}
      <DeviceMatchSheet
        session={session}
        /* Ranking compares candidates against what the athlete LOGGED — scoring
           against an already-matched device duration would just re-elect it. */
        sessionDurationMin={logged.durationMin}
        visible={matchOpen}
        onClose={() => setMatchOpen(false)}
        onMatched={onMatched}
      />

      {/* ── SHARE SHEET ── */}
      <Sheet visible={sheetOpen} onClose={() => setSheetOpen(false)} title={t("session.wrapped.chooseStory")}>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", alignItems: "baseline", marginBottom: 16 }}>
              <Pressable onPress={() => setSheetOpen(false)}><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("summary.doneToday")}</Text></Pressable>
            </View>
            <ScrollView ref={pagerRef} horizontal pagingEnabled showsHorizontalScrollIndicator={false} onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / win.width))} snapToInterval={win.width} decelerationRate="fast">
              {slides.map((s, i) => (
                <View key={i} style={{ width: win.width - 32, alignItems: "center" }}>
                  <Pressable onPress={cycleStyle} style={{ borderRadius: previewW * 0.05, backgroundColor: st.bg, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 8 }}>
                    <SlideStoryCard ref={(r) => { storyRefs.current[i] = r; }} slide={s} t={t} units={units} width={previewW} styleId={styleId} animate={i === activeIdx} />
                  </Pressable>
                </View>
              ))}
            </ScrollView>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginVertical: 16 }}>
              {slides.map((_, i) => (
                <View key={i} style={{ width: i === activeIdx ? 20 : 7, height: 7, borderRadius: 4, backgroundColor: i === activeIdx ? C.lime : C.line }} />
              ))}
            </View>
            <APill label={`↗ ${t("summary.shareStory")}`} onPress={shareNow} />
      </Sheet>
    </View>
  );
}
