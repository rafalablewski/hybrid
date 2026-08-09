import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  liftStanding,
  hasActiveConnection,
  feelSamples,
  loadBaseline,
  doneReceipt,
  sessionCelebration,
  isFullAccess,
  volumeByMuscle,
  sessionFunFact,
  funFactText,
  sessionVolume,
  sessionSignature,
  SIGNATURE_MIN_BARS,
  blockBestE1rm,
  blockTopLoad,
  strengthPrDelta,
  formatCardioPr,
  workoutShareCaption,
  fmtWeight,
  formatSportPace,
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
} from "@hybrid/core";
import { fetchTalent, fetchConnections, patchSessionDevice } from "../lib/api";
import { healthKitAvailability } from "../lib/healthkit";
import { useRevalidate } from "../lib/queries";
import { DeviceMatchSheet } from "./device-match";
import { DeviceMark } from "./aurora/device-mark";
import { AuroraIcon } from "./aurora/icons";
import { HeroEyebrow, HeroNav } from "./aurora/hero";
import { CtaLabel } from "./aurora/cta-label";
import { FeelPrompt } from "./feel-prompt";
import { usePersona } from "../lib/persona";
import { usePremiumAccent } from "../lib/premium-accent";
import { useLang } from "../lib/i18n";
import { SlideStoryCard, shareWorkout, type SlideData, type ShareBest } from "../lib/share";
import { fs, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../lib/ui";
import { useSharedElementTarget } from "../lib/shared-element";
import { useTheme, txt } from "../lib/theme";
import Sheet from "./aurora/sheet";

const GOLD = "#e6c34e";

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
  return <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={style} numberOfLines={1} adjustsFontSizeToFit>{disp}</Text>;
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
  const [active, setActive] = useState(0);
  const [styleId, setStyleId] = useState<StoryStyleId>(DEFAULT_STORY_STYLE);
  const [cohort, setCohort] = useState<{ sport: string; sex: "M" | "F"; age: number } | null>(null);
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
  const pagerRef = useRef<ScrollView>(null);
  const storyRefs = useRef<Record<number, View | null>>({});

  useEffect(() => {
    let alive = true;
    fetchTalent().then((d) => {
      const p = d?.profile;
      if (alive && p && typeof p.age === "number") setCohort({ sport: p.sport, sex: p.sex === "F" ? "F" : "M", age: p.age });
    }).catch(() => {});
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
  // "Where you stand" is a RELATIVE-STRENGTH percentile — the benchmark norms
  // are built on estimated 1RM, so this one keeps e1RM on purpose.
  const topE1rm = session.blocks.reduce((m, b) => (b.kind === "strength" ? Math.max(m, Math.round(blockBestE1rm(b, bwHere))) : m), 0);
  const standing = cohort && topE1rm > 0 && bwHere ? liftStanding(topE1rm, bwHere, cohort) : null;

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
  const prHeadline = prs.length > 0 ? `🏆 ${prs.length} ${prs.length > 1 ? t("w.train.logger.newPrs") : t("w.train.logger.newPr")}` : cardioPrs.length > 0 ? `🏃 ${cardioPrs.length} ${cardioPrs.length > 1 ? t("w.train.logger.cardioPrs") : t("w.train.logger.cardioPr")}` : t("summary.todaysBests");
  const bespoke: SlideData[] = [
    ...(cel ? [{ kind: "trophy", eyebrow: t("summary.slide.prs"), value: heroBig, caption: cel.kind === "strength" ? cel.lift : cel.move, sub: cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne") } as SlideData] : []),
    ...(signature.length >= SIGNATURE_MIN_BARS ? [{ kind: "signature", eyebrow: t("session.wrapped.title"), bars: signature, value: heroBig, caption: session.title } as SlideData] : []),
  ];
  // The overview card is a GYM card (title + minutes/sets/volume): on a swim it
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
    ...(funFact ? [{ kind: "fun", eyebrow: t("summary.slide.fun"), emoji: funFact.emoji, text: funFactText(funFact, units, t) } as SlideData] : []),
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
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120, delay: 150 }).start();
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
  const keys: ("reveal" | "hero" | "feel" | "premium" | "device" | "standing")[] = [
    ...(cel ? ["reveal" as const] : []),
    "hero" as const,
    "feel" as const,
    ...(wrapped.facts.length ? ["premium" as const] : []),
    ...(device || showDeviceAd ? ["device" as const] : []),
    "standing" as const,
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
    <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, color: C.ash, textAlign: "center", marginTop: 16 }}>{t("session.wrapped.scroll")} ↑</Text>
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
          <Panel center glows={<><View pointerEvents="none" style={{ position: "absolute", top: "34%", left: "50%", marginLeft: -230, marginTop: -230, width: 460, height: 460 }}><Animated.View style={{ flex: 1, opacity: 0.9, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}><LinearGradient colors={[`${GOLD}26`, "transparent", `${C.lime}1c`, "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 230 }} /></Animated.View></View></>}>
            <View style={{ alignItems: "center" }}>
              {CONFETTI.map((c, i) => (
                <Animated.View key={i} pointerEvents="none" style={{ position: "absolute", top: -20, width: 7, height: 7, borderRadius: 2, backgroundColor: [C.lime, GOLD, C.blue, C.violet][c.ci], opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, c.tx] }) }, { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, c.ty] }) }] }} />
              ))}
              <Animated.View style={{ transform: [{ scale }] }}><AuroraIcon name="trophy" size={84} color={GOLD} /></Animated.View>
              <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 3, color: GOLD, textTransform: "uppercase", marginTop: 24 }}>{cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne")}</Text>
              <CountUp value={heroBig} style={{ fontFamily: F.black, fontSize: HERO_FIGURE.size, lineHeight: HERO_FIGURE.lineHeight, color: C.chalk, letterSpacing: HERO_FIGURE.tracking * HERO_FIGURE.size, marginTop: 12 }} />
              <Text style={{ fontFamily: F.bold, fontSize: 18, color: C.chalk, marginTop: 6, textAlign: "center" }}>{heroSub}</Text>
            </View>
          </Panel>
        )}

        {/* ── HERO ── */}
        <Panel glows={<><Glow size={panelH * 0.5} color={`${C.violet}22`} top={-40} right={-80} /><Glow size={panelH * 0.5} color={`${C.lime}14`} bottom={panelH * 0.2} left={-90} /></>}>
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
          <Text style={{ fontFamily: F.bold, fontSize: 17, color: cel ? txt(C, C.lime) : C.chalk, marginTop: 10 }}>{heroSub}</Text>
          <View style={{ flexDirection: "row", marginTop: 20, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: "hidden" }}>
            {wrapped.basics.map((b, i) => (
              <View key={b.labelKey} style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 4, alignItems: "center", backgroundColor: HERO_TAKEOVER_RAISED, borderLeftWidth: i ? 1 : 0, borderLeftColor: C.line }}>
                {/* A modelled figure wears a "~" — it is never presented as a
                    measurement (see core/energy.ts). */}
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6} style={{ fontFamily: F.black, fontSize: 22 * fitScale((b.estimate ? "~" : "") + b.value, STAT_FIT_EM), color: C.chalk }}>{b.estimate ? "~" : ""}{b.value}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: C.ash, textTransform: "uppercase", marginTop: 4 }}>{t(b.labelKey)}</Text>
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
            <Pressable onPress={() => setMatchOpen(true)} style={{ marginTop: 16, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: `${C.chalk}52`, borderRadius: 999, paddingVertical: 8, paddingHorizontal: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, color: C.chalk }}>{t("session.device.measuredOn")}</Text>
              {deviceMark ? (
                <DeviceMark provider={device.provider} height={16} on="dark" label={deviceName ?? undefined} />
              ) : (
                <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, color: C.chalk }}>{deviceName ?? t("session.device.matchedChip")}</Text>
              )}
            </Pressable>
          ) : canMatch ? (
            <Pressable onPress={() => setMatchOpen(true)} style={{ marginTop: 16, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingVertical: 10, paddingHorizontal: 16, backgroundColor: HERO_TAKEOVER_RAISED }}>
              <DeviceMark provider="apple" form="mark" height={13} on="dark" label="" />
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: C.chalk }}>{t("session.device.matchCta")}</Text>
            </Pressable>
          ) : null}
          {scrollHint}
        </Panel>

        {/* ── HOW DID THAT FEEL? ── */}
        {/* The immediate read, for a session opened later that was never rated.
            The card says what a late answer is worth rather than pretending it
            is the in-the-gym reading. See core/feel-schedule.ts. */}
        <Panel center glows={<Glow size={panelH * 0.45} color={`${C.lime}12`} top={panelH * 0.05} left={-90} />}>
          <FeelPrompt
            sessionId={session.id}
            minutes={receipt.durationMin}
            initialFeel={session.feel ?? null}
            initialFatigue={session.fatigue ?? null}
            sessionEnd={session.completedAt ?? session.startedAt ?? null}
            baseline={feelBaseline}
            eyebrow={eyebrow}
          />
        </Panel>

        {/* ── PREMIUM ── */}
        {wrapped.facts.length > 0 && (
          <Panel center glows={<Glow size={panelH * 0.5} color={`${C.violet}14`} top={0} left={-100} />}>
            {eyebrow(t("session.wrapped.premium"))}
            <Text style={{ fontFamily: F.black, fontSize: 22, color: C.chalk, marginTop: 8, marginBottom: 20 }}>{t("session.wrapped.premiumLead")}</Text>
            {wrapped.facts.map((f) => (
              <View key={f.labelKey + f.value} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, color: C.ash, textTransform: "uppercase" }}>{t(f.labelKey)}</Text>
                <Text style={{ fontFamily: F.black, fontSize: 26, color: f.tone === "up" || f.labelKey === "session.wrapped.est1rm" ? txt(C, C.lime) : C.violet }}>{f.value}</Text>
              </View>
            ))}
            {!full && (
              <Pressable onPress={() => { onBack(); router.push("/upgrade"); }} style={{ marginTop: 24, alignSelf: "flex-start", backgroundColor: premium.fill, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 20 }}>
                <Text style={{ fontFamily: F.black, fontSize: 15, color: premium.ink }}>✦ {t("session.wrapped.unlock")}</Text>
              </Pressable>
            )}
          </Panel>
        )}

        {/* ── THE DEVICE'S READ (matched) ── */}
        {device && (
          <Panel center glows={<Glow size={panelH * 0.45} color={`${C.lime}14`} top={panelH * 0.06} right={-90} />}>
            {eyebrow(t("session.device.panelTitle"))}
            <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk, letterSpacing: -0.5, lineHeight: 32, marginTop: 12 }}>{device.activityLabel}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, lineHeight: 17, color: C.ash, marginTop: 10 }}>{t(imported ? "session.device.leadImported" : "session.device.lead")}</Text>
            <View style={{ marginTop: 20, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: "hidden" }}>
              <View style={{ flexDirection: "row", paddingVertical: 10, paddingHorizontal: 16, backgroundColor: HERO_TAKEOVER_RAISED }}>
                <View style={{ flex: 1.1 }} />
                {/* An imported session has no logged column — the recording IS the log. */}
                {!imported && (
                  <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: C.ash, textTransform: "uppercase", textAlign: "right" }}>{t("session.device.appCol")}</Text>
                )}
                {/* The lockup heads the measured column instead of the device's
                    name, and the column's figures below are chalk with it — the
                    whole measured side reads in one ink. */}
                {deviceMark ? (
                  <View style={{ flex: 1, alignItems: "flex-end" }}>
                    <DeviceMark provider={device.provider} height={15} on="dark" label={deviceName ?? undefined} />
                  </View>
                ) : (
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: C.chalk, textTransform: "uppercase", textAlign: "right" }}>{deviceName ?? t("session.device.deviceCol")}</Text>
                )}
              </View>
              {comparison.map((r) => (
                <View key={r.labelKey} style={{ flexDirection: "row", alignItems: "baseline", paddingVertical: 12, paddingHorizontal: 16, backgroundColor: HERO_TAKEOVER_RAISED, borderTopWidth: 1, borderTopColor: C.line }}>
                  <Text style={{ flex: 1.1, fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, color: C.ash, textTransform: "uppercase" }}>{t(r.labelKey)}</Text>
                  {/* A modelled figure wears a "~" — never presented as a measurement. */}
                  {!imported && (
                    <Text style={{ flex: 1, fontFamily: F.bold, fontSize: 14, color: C.chalk, textAlign: "right" }}>{r.app != null ? `${r.appEstimate ? "~" : ""}${r.app}` : "—"}</Text>
                  )}
                  <Text style={{ flex: 1, fontFamily: F.black, fontSize: 14, color: C.chalk, textAlign: "right" }}>{r.device ?? "—"}</Text>
                </View>
              ))}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: 10, lineHeight: 16, color: C.ash, marginTop: 12 }}>{t(imported ? "session.device.truthImported" : "session.device.truth")}</Text>
            <View style={{ flexDirection: "row", gap: 16, marginTop: 20 }}>
              <Pressable onPress={() => setMatchOpen(true)}>
                <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.chalk }}>{t("session.device.rematch")}</Text>
              </Pressable>
              <Pressable onPress={() => void unlinkDevice()} disabled={unlinking} style={{ opacity: unlinking ? 0.5 : 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>{t("session.device.unlink")}</Text>
              </Pressable>
            </View>
          </Panel>
        )}

        {/* ── CONNECT A DEVICE ── */}
        {showDeviceAd && (
          <Panel center glows={<Glow size={panelH * 0.45} color={`${C.violet}18`} top={panelH * 0.06} right={-90} />}>
            {eyebrow(t("session.wrapped.device.title"))}
            <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk, letterSpacing: -0.5, lineHeight: 32, marginTop: 12 }}>{t("session.wrapped.device.lead")}</Text>
            <View style={{ marginTop: 24, borderRadius: 16, borderWidth: 1, borderColor: C.line, overflow: "hidden" }}>
              {([
                ["heart", C.red, "session.wrapped.device.hr"],
                ["flame", C.red, "session.wrapped.device.energy"],
                ["stopwatch", C.chalk, "session.wrapped.device.time"],
                ["moon", GOLD, "session.wrapped.device.recovery"],
              ] as const).map(([icon, tint, key], i) => (
                <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: HERO_TAKEOVER_RAISED, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                  <AuroraIcon name={icon} size={16} color={tint} />
                  <Text style={{ fontFamily: F.bold, fontSize: 14, color: C.chalk }}>{t(key)}</Text>
                </View>
              ))}
            </View>
            <Pressable onPress={() => { onBack(); router.push("/connections"); }} style={{ marginTop: 24, alignSelf: "flex-start", backgroundColor: C.lime, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 24 }}>
              <CtaLabel label={`${t("session.wrapped.device.cta")} →`} color={C.onAccent} fontSize={15} font={F.black} />
            </Pressable>
            <Text style={{ fontFamily: F.mono, fontSize: 11, lineHeight: 17, color: C.ash, marginTop: 16 }}>
              {bwHere ? t("session.wrapped.device.estimate") : t("session.wrapped.device.bodyweight")}
            </Text>
          </Panel>
        )}

        {/* ── STANDING + SIGNATURE ── */}
        <Panel center glows={<Glow size={panelH * 0.55} color={`${GOLD}14`} top={-panelH * 0.1} left={win.width / 2 - panelH * 0.275} />}>
          <View style={{ alignItems: "center" }}>
            {standing ? (
              <>
                {eyebrow(t("session.wrapped.standing"))}
                <Text style={{ fontFamily: F.black, fontSize: 62, color: C.chalk, letterSpacing: -2, marginTop: 16, textAlign: "center" }}>{t("session.wrapped.top")}</Text>
                <Text style={{ fontFamily: F.black, fontSize: 62, color: txt(C, C.lime), letterSpacing: -2, lineHeight: 62, textAlign: "center" }}>{standing.topPct}%</Text>
                <Text style={{ fontFamily: F.bold, fontSize: 16, color: C.chalk, marginTop: 12, textAlign: "center" }}>{cohort!.sport} — {t("session.wrapped.estimate")}</Text>
              </>
            ) : (
              eyebrow(t("session.wrapped.title"))
            )}
            {signature.length >= SIGNATURE_MIN_BARS && (
              <>
                <View style={{ flexDirection: "row", alignItems: "flex-end", height: 72, marginTop: 34, gap: 3 }}>
                  {signature.map((v, i) => (
                    <View key={i} style={{ width: 6, height: `${Math.round(v * 100)}%`, borderRadius: 3, backgroundColor: C.lime, opacity: 0.4 + v * 0.6 }} />
                  ))}
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, color: C.ash, marginTop: 12 }}>{t("session.wrapped.signatureCap")}</Text>
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
              <View key={i} style={{ width: i === Math.min(panel, keys.length - 1) ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === Math.min(panel, keys.length - 1) ? C.lime : C.line }} />
            ))}
          </View>
          <Pressable onPress={() => { setActive(0); setSheetOpen(true); }} style={{ backgroundColor: C.lime, borderRadius: 16, paddingVertical: 16, alignItems: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: 16, color: C.onAccent }}>↗ {t("summary.share")}</Text>
          </Pressable>
        </View>
      )}

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
              <Pressable onPress={() => setSheetOpen(false)}><Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>{t("summary.doneToday")}</Text></Pressable>
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
            <Pressable onPress={shareNow} style={{ backgroundColor: C.lime, borderRadius: 16, paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.black, fontSize: 16, color: C.onAccent }}>↗ {t("summary.shareStory")}</Text>
            </Pressable>
      </Sheet>
    </View>
  );
}
