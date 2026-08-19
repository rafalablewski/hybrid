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
  hasActiveConnection,
  feelSamples,
  loadBaseline,
  doneReceipt,
  sessionCelebration,
  sessionMuscleMap,
  sessionPanels,
  muscleBaseline,
  muscleCoverage,
  springs,
  springToRN,
  isFullAccess,
  sessionVolume,
  brand,
  sessionSpine,
  SPINE_MIN_BARS,
  mmss,
  blockTopLoad,
  strengthPrDelta,
  workoutShareCaption,
  fmtWeight,
  heatAfterSession,
  fmtTemp,
  statCountUp,
  prsForSession,
  cardioPrsForSession,
  deviceComparisonRows,
  deviceImportedSession,
  deviceMarkFor,
  deviceSourceLabel,
  sessionEnergy,
  type DeviceWorkout,
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
import { TonnageCurve, SetSpine } from "./aurora/session-spine";
import { HeatSheet } from "./aurora/heat-sheet";
import { usePersona } from "../lib/persona";
import { usePremiumAccent } from "../lib/premium-accent";
import { useLang } from "../lib/i18n";
import { shareWorkout, heroFigure, type ShareBest } from "../lib/share";
import { leading, fs, F, TABULAR, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE, trackFigure , tracking} from "../lib/ui";
import { useSharedElementTarget } from "../lib/shared-element";
import { useTheme, txt, deltaPaint, type Palette } from "../lib/theme";
import { withAlpha } from "./aurora/field";
import { APill, RADIUS } from "./aurora/kit";

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
/** One ledger row under an instrument: a mono label, the figure, and an
 *  optional denominator that must never compete with it. */
function WorkRow({ label, value, note, C, last }: { label: string; value: string; note?: string; C: Palette; last?: boolean }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingVertical: 8, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 5 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>{value}</Text>
        {note ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{note}</Text> : null}
      </View>
    </View>
  );
}

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

  const [panel, setPanel] = useState(0);
  const [heatOpen, setHeatOpen] = useState(false);
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
  // The session as its own sets — the hero's accumulation curve and the work
  // panel's spine read ONE model, so they cannot disagree about what a set
  // weighed. Memoised: it projects every set of every block.
  const spine = useMemo(() => sessionSpine(view, { bw }), [view, bw]);
  const hasSpine = spine.bars.length >= SPINE_MIN_BARS;

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
  // The record's own figure when there is one, else the session's headline —
  // resolved once, in the same helper the finish screen uses.
  const panels = useMemo(() => sessionPanels(view, all, { units, bw }), [view, all, units, bw]);
  const heroBig = heroFigure(panels, wrapped.headline.value, units);
  // A record isn't always a heavier bar — more reps at the same load is a real
  // PR, and claiming "+0 kg" there would be a lie.
  const heroSub = cel
    ? cel.kind === "strength"
      ? `${cel.lift} — ${strengthPrDelta(cel, { first: t("summary.firstEver"), moreReps: t("summary.morePrReps") }, units)}`
      : cel.move
    : session.title;

  // THE SHARE CAPTION — the text that rides beside the captured panel. It
  // headlines the SAME record the reveal hero showed (`cel`, not prs[0], which
  // is ordered by e1RM gain and can be a different lift).
  const captionHeadline =
    cel && cel.kind === "strength"
      ? `\u{1F3C6} ${cel.lift} ${fmtWeight(cel.topLoad, units)}`
      : bests[0]
        ? `${t("share.topLift")}: ${bests[0].name} ${fmtWeight(bests[0].weight, units)}`
        : null;
  const shareText = workoutShareCaption({ title: session.title, minutes, sets, volume, headline: captionHeadline }, units, t);

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
  const keys: ("reveal" | "hero" | "body" | "feel" | "premium" | "device" | "work")[] = [
    ...(cel ? ["reveal" as const] : []),
    "hero" as const,
    // A session with no mapped lifting (a run, a match, an all-custom day) has
    // no body to light, so the panel is absent rather than dark.
    ...(muscleRead.map.muscles.length ? ["body" as const] : []),
    "feel" as const,
    ...(wrapped.facts.length ? ["premium" as const] : []),
    ...(device || showDeviceAd ? ["device" as const] : []),
    // The set spine needs enough sets to be a shape; a two-set session has
    // nothing to draw, so the panel is absent rather than nearly empty.
    ...(hasSpine ? ["work" as const] : []),
  ];
  const detailsIndex = keys.length;
  /** A panel's position in the sequence — the capture reads the node by it. */
  const at = (k: (typeof keys)[number]) => keys.indexOf(k);
  // ── CAPTURE ──
  // The share control hands over the panel the athlete is looking at. Chrome
  // (the rail, the dots) drops for the frame the shot is taken on, and the
  // panel signs itself; nothing is re-laid-out, so what lands in the camera
  // roll is what was on the screen.
  const panelRefs = useRef<Record<number, View | null>>({});
  const [capturing, setCapturing] = useState(false);
  const captureStamp = `${new Date(session.startedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })} – ${session.title}`.toUpperCase();
  const sharePanel = async () => {
    const i = Math.min(panel, keys.length - 1);
    setCapturing(true);
    // Two frames: one for the chrome to leave, one for the footer to land.
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    try {
      await shareWorkout({ current: panelRefs.current[i] ?? null }, shareText, t("summary.shareStory"));
    } finally {
      setCapturing(false);
    }
  };
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

  // EVERY PANEL IS ITS OWN SHARE ASSET. The panel registers the node the
  // capture reads, and in capture mode it drops the pad that existed for the
  // dock and signs itself instead. What gets shared is the panel as rendered —
  // there is no second composition to keep in step with this one, which is
  // exactly how the old two story decks drifted.
  const Panel = ({ children, center, glows, index }: { children: ReactNode; center?: boolean; glows?: ReactNode; index: number }) => (
    <View
      ref={(n) => { panelRefs.current[index] = n; }}
      collapsable={false}
      style={{ height: panelH, paddingHorizontal: HERO.gutter.hero, paddingTop: padTop, paddingBottom: capturing ? 28 : 150, justifyContent: center ? "center" : "flex-start", overflow: "hidden", backgroundColor: HERO_TAKEOVER_INK }}
    >
      {glows}
      {children}
      {capturing && (
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: C.line, paddingTop: 9, marginTop: 14 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.caption, letterSpacing: tracking.label, color: C.chalk }}>{brand.name.toUpperCase()}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash }}>{captureStamp}</Text>
        </View>
      )}
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
          <Panel index={at("reveal")} center glows={<><View pointerEvents="none" style={{ position: "absolute", top: "34%", left: "50%", marginLeft: -230, marginTop: -230, width: 460, height: 460 }}><Animated.View style={{ flex: 1, opacity: 0.9, transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }] }}><LinearGradient colors={[withAlpha(GOLD, 0.15), "transparent", withAlpha(C.lime, 0.11), "transparent"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, borderRadius: 230 }} /></Animated.View></View></>}>
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
        <Panel index={at("hero")} glows={<><Glow size={panelH * 0.5} color={withAlpha(C.blue, ALPHA.fill)} top={-40} right={-80} /><Glow size={panelH * 0.5} color={withAlpha(C.lime, ALPHA.wash)} bottom={panelH * 0.2} left={-90} /></>}>
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
          {/* THE INSTRUMENT ZONE. What used to be here was a bare flex spacer:
              a title at the top, a figure at the bottom, and 380pt of untouched
              ink between them — on the first thing an athlete sees after
              training. The accumulation curve fills it with the session's own
              sets, and it is the one figure on this screen that shows the work
              as something that BUILT rather than a total that arrived.

              A session with too few sets to make a curve keeps the space: the
              spacer is the fallback, never the layout. */}
          {hasSpine ? (
            <View style={{ flex: 1, justifyContent: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
                {t("session.work.tonnageThrough")}
              </Text>
              <View style={{ marginTop: 10 }}>
                <TonnageCurve spine={spine} width={win.width - HERO.gutter.hero * 2} />
              </View>
            </View>
          ) : (
            <View style={{ flex: 1 }} />
          )}
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
          <Panel index={at("body")} glows={<Glow size={panelH * 0.55} color={withAlpha(C.lime, ALPHA.wash)} top={panelH * 0.18} left={-80} />}>
            {eyebrow(t("session.body.title"))}
            <SessionBody map={muscleRead.map} coverage={muscleRead.coverage} units={units} />
          </Panel>
        )}

        {/* ── HOW DID THAT FEEL? ── */}
        {/* The immediate read, for a session opened later that was never rated.
            The card says what a late answer is worth rather than pretending it
            is the in-the-gym reading. See core/feel-schedule.ts. */}
        <Panel index={at("feel")} center glows={<Glow size={panelH * 0.45} color={withAlpha(C.lime, ALPHA.wash)} top={panelH * 0.05} left={-90} />}>
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
          <Panel index={at("premium")} center glows={<Glow size={panelH * 0.5} color={withAlpha(C.blue, ALPHA.wash)} top={0} left={-100} />}>
            {eyebrow(t("session.wrapped.premium"))}
            <Text style={{ fontFamily: F.black, fontSize: fs.headline, color: C.chalk, marginTop: 8, marginBottom: 20 }}>{t("session.wrapped.premiumLead")}</Text>
            {wrapped.facts.map((f) => (
              <View key={f.labelKey + f.value} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.line }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.ash, textTransform: "uppercase" }}>{t(f.labelKey)}</Text>
                <Text style={{ fontFamily: F.black, fontSize: fs.display, color: f.labelKey === "session.wrapped.est1rm" ? txt(C, C.lime) : deltaPaint(C, !f.tone || f.tone === "neutral" ? "flat" : f.tone) }}>{f.value}</Text>
              </View>
            ))}
            {!full && (
              <APill
                label={t("session.wrapped.unlock")}
                color={premium.fill}
                glyph={(c) => <Text style={{ fontFamily: F.black, fontSize: fs.note, color: c }}>✦</Text>}
                onPress={() => { onBack(); router.push("/upgrade"); }}
                style={{ marginTop: 24, alignSelf: "flex-start" }}
              />
            )}
          </Panel>
        )}

        {/* ── THE DEVICE'S READ (matched) ── */}
        {device && (
          <Panel index={at("device")} center glows={<Glow size={panelH * 0.45} color={withAlpha(C.lime, ALPHA.wash)} top={panelH * 0.06} right={-90} />}>
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
          <Panel index={at("device")} center glows={<Glow size={panelH * 0.45} color={withAlpha(C.blue, ALPHA.wash)} top={panelH * 0.06} right={-90} />}>
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

        {/* ── THE WORK ── */}
        {/* What replaced the signature panel: six unlabelled bars captioned
            "your session's shape". Every set is here now, in order, at the load
            it actually moved — a ramp reads as a ramp, straight sets read as a
            wall — with the figures that describe how the session was RUN
            underneath. See core/session-spine.ts. */}
        {hasSpine && (
          <Panel index={at("work")} glows={<Glow size={panelH * 0.5} color={withAlpha(C.blue, ALPHA.wash)} bottom={panelH * 0.1} right={-90} />}>
            {eyebrow(t("session.work.title"))}
            {spine.topSet && (
              <>
                <Text style={{ fontFamily: F.black, fontSize: fs.hero, letterSpacing: trackFigure(fs.hero), color: C.chalk, marginTop: 12 }}>
                  {fmtWeight(spine.topSet.loadKg, units)}
                  {spine.topSet.reps ? <Text style={{ fontSize: fs.heading, color: C.ash }}> × {spine.topSet.reps}</Text> : null}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: txt(C, C.lime), marginTop: 2 }}>
                  {t("session.work.topSet")} – {spine.topSet.exercise}
                </Text>
              </>
            )}
            <View style={{ marginTop: 22 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
                {t("session.work.loadPerSet")}
              </Text>
              <View style={{ marginTop: 10 }}>
                <SetSpine spine={spine} width={win.width - HERO.gutter.hero * 2} />
              </View>
            </View>
            <View style={{ flex: 1 }} />
            <WorkRow label={t("session.work.workingSets")} value={`${spine.workingSets}`} note={t("session.work.ofTotal").replace("{n}", String(spine.totalSets))} C={C} />
            {spine.medianRestSec != null && (
              <WorkRow label={t("session.work.medianRest")} value={mmss(spine.medianRestSec)} C={C} />
            )}
            {spine.meanRpe != null && <WorkRow label={t("session.work.meanRpe")} value={`${spine.meanRpe}`} C={C} last={true} />}
          </Panel>
        )}

        {/* ── DETAILS (breakdown + manage) ── */}
        {/* THE LEDGER. It used to open in a different design language — bordered
            cards, its own gutter, its own ground — one scroll after six
            full-bleed panels, and the transition read as a seam between two
            products. It now stands on the panels' ground, at the panels' gutter,
            with the same hairline rows. */}
        <View style={{ backgroundColor: HERO_TAKEOVER_INK, paddingHorizontal: HERO.gutter.hero, paddingTop: 28, paddingBottom: insets.bottom + 40, minHeight: panelH }}>
          {details}
        </View>
      </ScrollView>

      {/* THE RAIL — the same 40pt circular control, at the same y, as every
          other screen. A takeover has no stack under it, so it DISMISSES
          (chevron-down) rather than pops; the geometry is untouched, which is
          why the thumb never has to re-find it. */}
      {!capturing && (
        <View style={{ position: "absolute", top: geom.railTop, left: HERO.gutter.edge, right: HERO.gutter.edge, height: HERO.rail.height, flexDirection: "row", alignItems: "center", zIndex: 5 }}>
          <HeroNav onPress={onBack} mode="takeover" material="glass" onDark />
          {/* SHARE, OPPOSITE DISMISS. Dismiss is top-left because that is where
              the back gesture lives, so the only other panel-level action takes
              the other corner — and holds it on every panel, so the thumb never
              has to hunt for it. It shares the panel in front of you. */}
          {showDock && (
            <Pressable
              onPress={sharePanel}
              accessibilityRole="button"
              accessibilityLabel={t("summary.share")}
              style={{ marginLeft: "auto", width: HERO.rail.height, height: HERO.rail.height, borderRadius: RADIUS.pill, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: withAlpha(C.lime, ALPHA.rim), backgroundColor: withAlpha(C.lime, ALPHA.fill) }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: txt(C, C.lime) }}>↗</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* WHERE YOU ARE IN THE SEQUENCE. The dock used to carry a share pill
          too; sharing moved to the rail, because the thing being shared is the
          panel and the control belongs on it rather than under it. */}
      {showDock && !capturing && (
        <View style={{ position: "absolute", left: 24, right: 24, bottom: insets.bottom + 20, flexDirection: "row", justifyContent: "center", gap: 6 }}>
          {keys.map((_, i) => (
            <View key={i} style={{ width: i === Math.min(panel, keys.length - 1) ? 18 : 6, height: 6, borderRadius: RADIUS.mark, backgroundColor: i === Math.min(panel, keys.length - 1) ? C.lime : C.line }} />
          ))}
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

    </View>
  );
}
