import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, ScrollView, Dimensions, type TextStyle, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  HERO,
  HERO_FIGURE,
  heroGeometry,
  heroTitleType,
  heroMetaLine,
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
  isFullAccess,
  sessionVolume,
  sessionSpine,
  e1rmSeries,
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
import { HeroAction, HeroEyebrow, HeroNav } from "./aurora/hero";
import { SHARE_MARK } from "./aurora/share-mark";
import { CtaLabel } from "./aurora/cta-label";
import { FeelPrompt } from "./feel-prompt";
import SessionBody from "./aurora/session-body";
import { TonnageCurve, SetSpine } from "./aurora/session-spine";
import { LiftHistory, HISTORY_MIN_POINTS } from "./aurora/session-history";
import { SessionShareCard } from "./aurora/session-share-card";
import Sheet from "./aurora/sheet";
import { HeatSheet } from "./aurora/heat-sheet";
import { usePersona } from "../lib/persona";
import { usePremiumAccent } from "../lib/premium-accent";
import { useLang } from "../lib/i18n";
import { shareCardImage, heroFigure, type ShareBest } from "../lib/share";
import { leading, fs, space, F, TABULAR, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE, trackFigure , tracking} from "../lib/ui";
import { useSharedElementTarget } from "../lib/shared-element";
import { useTheme, txt, deltaPaint, type Palette } from "../lib/theme";
import { withAlpha } from "./aurora/field";
import { APill, RADIUS } from "./aurora/kit";

// `gold` is a THEME value, and this const is module scope — so it names the
// one theme the app has rather than copying its hex. (The light theme was
// deleted whole in Aug 2026; see the light-theme-removed capability.)
const GOLD = THEMES.dark.accentText.amber; // Fleur De Lis — the retired `gold` token sat ΔE 8.6 from it

/** The share card never grows past this, so a tablet gets a postable 9:16
 *  rather than a card the height of the window. */
const CARD_MAX_WIDTH = 420;
/** How many figures ride the card's foot beside the magnitude. */
const SHARE_CARD_STATS = 3;
/** How much of the window's height the PREVIEW of the card may take. A 9:16
 *  card at capture width is taller than a sheet, so the preview is sized to fit
 *  and the capture happens off-screen at full size — same component, same
 *  props, one composition. */
const SHARE_PREVIEW_H = 0.54;
/** Far enough left that no device width brings the capture node back on screen. */
const CAPTURE_OFFSCREEN = 10000;
/** Device lockup heights — the rail's and the inline chip's. */
const DEVICE_MARK_H = 15;
const DEVICE_MARK_SM = 13;

/** One ledger row under an instrument: a mono label, the figure, and an
 *  optional denominator that must never compete with it. */
function WorkRow({ label, value, note, C, last, tone }: { label: string; value: string; note?: string; C: Palette; last?: boolean; tone?: "up" | "down" }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md, paddingVertical: space.sm, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line }}>
      <View style={{ flexShrink: 1 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>{label}</Text>
        {/* The lift a figure belongs to, when the label alone does not say. */}
        {note ? <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: space.xxs }}>{note}</Text> : null}
      </View>
      <Text style={[TABULAR, { fontFamily: F.black, fontSize: fs.subtitle, color: tone ? deltaPaint(C, tone) : C.chalk }]}>{value}</Text>
    </View>
  );
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

/** How wide the dot is when it is the one you are on, and when it is not. */
const DOT_ON = 18;
const DOT_OFF = 6;
/** What a panel leaves clear at its foot for the dot rail. */
const DOCK_CLEARANCE = 44;
/** A chart never draws shorter than this, whatever the zone measured. */
const CHART_MIN = 90;
/** Room an instrument's own mono caption takes above its plot. */
const CHART_LABEL = 26;
/** The set spine's exercise names, drawn under its plot. */
const SPINE_LABELS = 20;

type PanelKey = "hero" | "record" | "body" | "work" | "premium" | "device" | "feel";

/**
 * THE INSTRUMENT ZONE — the part of a panel that ABSORBS THE SCREEN'S SLACK.
 *
 * This is the whole difference between this sequence and the one before it. A
 * panel is a fixed 844pt screen, so something on it has to take up whatever the
 * content does not. The first attempt gave that job to `<View style={{flex:1}}/>`
 * — a spacer — and four of its five screens came out as black holes with a
 * figure at the bottom. Here the job belongs to the PICTURE: the zone measures
 * itself and hands its height to the chart, so a taller screen draws a taller
 * curve rather than a longer gap.
 *
 * The render prop is called only once a height is known, so a chart is never
 * asked to draw into zero.
 */
function InstrumentZone({ render }: { render: (h: number) => ReactNode }) {
  const [h, setH] = useState(0);
  return (
    <View
      style={{ flex: 1, justifyContent: "center" }}
      onLayout={(e: LayoutChangeEvent) => {
        const next = Math.floor(e.nativeEvent.layout.height);
        // Only on a real change — a setState on every layout pass is a loop.
        setH((cur) => (Math.abs(cur - next) > 1 ? next : cur));
      }}
    >
      {h > 0 ? render(h) : null}
    </View>
  );
}

/**
 * ONE PANEL, ONE SCREEN — four zones, in this order, every time:
 *
 *   MARK        what this panel is        (mono, uppercase, no marker)
 *   SUBJECT     the one magnitude         (exactly one figure at display size)
 *   INSTRUMENT  the picture that proves it (takes the leftover height)
 *   LEDGER      the rows that qualify it
 *
 * THE RULE THAT KEEPS A PANEL FULL: a panel gets a screen only when it has
 * something to fill one with. When there is no instrument, the LEDGER takes the
 * flex instead and spreads its rows down the panel — so the space is distributed
 * through the content rather than pooled into a hole above it. Nothing here is
 * ever held open by a bare spacer, and `design-tokens.test.ts` asserts none
 * survives in this file.
 *
 * `fill` is the escape hatch for a child that owns all four zones itself
 * (SessionBody, whose figure is its own instrument zone).
 */
function Panel({
  mark,
  markTone,
  meta,
  metaMark,
  metaTone,
  subject,
  instrument,
  ledger,
  children,
  fill,
  h,
  padTop,
  padBottom,
  gutter,
  C,
}: {
  mark?: string;
  markTone?: string;
  meta?: string;
  metaMark?: string;
  metaTone?: string;
  subject?: ReactNode;
  instrument?: (h: number) => ReactNode;
  ledger?: ReactNode;
  children?: ReactNode;
  fill?: boolean;
  h: number;
  padTop: number;
  padBottom: number;
  gutter: number;
  C: Palette;
}) {
  return (
    <View style={{ height: h, paddingHorizontal: gutter, paddingTop: padTop, paddingBottom: padBottom, overflow: "hidden", backgroundColor: HERO_TAKEOVER_INK }}>
      {mark ? (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md, marginBottom: space.lg }}>
          <Text numberOfLines={2} style={{ flexShrink: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: markTone ?? C.ash }}>
            {mark}
          </Text>
          {meta ? (
            <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: metaTone ?? C.ash }}>
              {metaMark ? `${metaMark} ` : ""}{meta}
            </Text>
          ) : null}
        </View>
      ) : null}
      {subject ? <View>{subject}</View> : null}
      {instrument ? <InstrumentZone render={instrument} /> : null}
      {/* No instrument → the ledger spreads instead of a gap opening above it. */}
      {ledger ? (
        <View style={instrument ? undefined : { flex: 1, justifyContent: "space-evenly" }}>{ledger}</View>
      ) : null}
      {fill ? <View style={{ flex: 1 }}>{children}</View> : children}
    </View>
  );
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
  const { t, lang } = useLang();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const premium = usePremiumAccent();
  const full = isFullAccess(usePersona());

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
  // The takeover is rank `cover`, mode `takeover`: no collapse track, but the
  // rail sits at the system's y and every panel clears the same bar height
  // every other screen clears.
  const geom = heroGeometry("cover", insets.top, "takeover");
  const padTop = geom.barHeight;
  const win = Dimensions.get("window");
  const panelH = win.height;
  const gutter = HERO.gutter.hero;
  const plotW = win.width - gutter * 2;

  // ── THE SHARE CARD ──
  // One composition, previewed, then captured. NOT a screenshot of whichever
  // panel you stopped on: that idea is what forced every panel to fill a 9:16
  // frame whether or not it had one to fill.
  const [shareOpen, setShareOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const cardRef = useRef<View | null>(null);
  const captureWidth = Math.min(plotW, CARD_MAX_WIDTH);
  const previewWidth = Math.min(captureWidth, Math.round(((win.height * SHARE_PREVIEW_H) * 9) / 16));
  const shareStamp = new Date(session.startedAt).toLocaleDateString(lang, {
    weekday: "short", day: "numeric", month: "short",
  });
  // Joined by core, never by the screen — one separator for every meta line on
  // the app (a spaced en dash; the house rule forbids a middot).
  const sessionStamp = heroMetaLine([
    shareStamp,
    new Date(session.startedAt).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }),
    typeof session.readiness === "number" ? `${t("home.readiness")} ${session.readiness}` : null,
  ]);
  /** The figure row, minus whatever is already set at display size above it. */
  const rowFigures = wrapped.basics.filter((b) => b.labelKey !== wrapped.headline.labelKey);
  const shareFigures = {
    title: session.title,
    stamp: shareStamp,
    headline: wrapped.headline.value,
    headlineLabel: t(wrapped.headline.labelKey),
    record: cel ? heroSub : null,
    stats: rowFigures.slice(0, SHARE_CARD_STATS).map((b) => ({
      label: t(b.labelKey),
      value: `${b.estimate ? "~" : ""}${b.value}`,
    })),
  };
  const doShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareCardImage(cardRef, shareText, t("summary.shareStory"));
    } finally {
      setSharing(false);
    }
  };

  // ── THE LIFT HISTORIES ──
  // A record is only legible AS A HISTORY, and the premium read's e1RM is only
  // legible beside the ones before it. Both panels draw the same instrument
  // from the same engine, so the two cannot disagree about a lift's past.
  const recordLift = cel && cel.kind === "strength" ? cel.lift : null;
  const recordHistory = useMemo(
    () => (recordLift ? e1rmSeries(all, recordLift, bw) : []),
    [all, recordLift, bw],
  );
  // THE PREMIUM PANEL'S FACTS. The session's headline is set at display size on
  // the hero, so it does not appear again here — one figure, one home, the same
  // rule the hero's own figure row follows.
  const panelFacts = wrapped.facts.filter((f) => f.labelKey !== wrapped.headline.labelKey);
  const topFactLift = panelFacts.find((f) => f.qualifier)?.qualifier ?? null;
  const factHistory = useMemo(
    () => (topFactLift ? e1rmSeries(all, topFactLift, bw) : []),
    [all, topFactLift, bw],
  );
  const factHistoryDrawable = factHistory.length >= HISTORY_MIN_POINTS;
  // THE SUBJECT AND THE INSTRUMENT MUST BE ABOUT THE SAME THING. Read off
  // `facts[0]` the panel led with the session's tonnage while the chart under it
  // drew a lift's estimated max — two different claims stacked as one. When
  // there is a history to draw, the figure it belongs to leads.
  const topFact = (factHistoryDrawable ? panelFacts.find((f) => f.qualifier) : null) ?? panelFacts[0] ?? null;
  const restFacts = panelFacts.filter((f) => f !== topFact);

  /**
   * WHICH PANELS EXIST — and the rule that keeps them full.
   *
   * A PANEL EXISTS ONLY WHEN IT HAS SOMETHING TO FILL A SCREEN WITH. That is
   * the rule the first sequence needed and did not have: it dealt a panel per
   * topic and padded the thin ones to 844pt with spacers, so four of its five
   * screens were mostly ink. Here a topic that cannot fill a screen does not
   * get one — the record rides the hero as a strip until it has a history to
   * draw, and nothing is ever held open by a spacer.
   */
  const hasRecordPanel = recordHistory.length >= HISTORY_MIN_POINTS;
  const keys: PanelKey[] = [
    "hero",
    ...(hasRecordPanel ? (["record"] as const) : []),
    ...(muscleRead.map.muscles.length ? (["body"] as const) : []),
    ...(hasSpine ? (["work"] as const) : []),
    // GATED ON WHAT ACTUALLY RENDERS. Read off the unfiltered list this deals a
    // dot, a snap offset and a screen for a panel whose only fact was the
    // headline — already shown on the hero — so the sequence would carry a
    // blank screen and the pager would count wrong.
    ...(panelFacts.length ? (["premium"] as const) : []),
    ...(device || showDeviceAd ? (["device"] as const) : []),
    "feel",
  ];
  const [panel, setPanel] = useState(0);
  const snapOffsets = keys.map((_, i) => i * panelH);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) =>
    setPanel(Math.round(e.nativeEvent.contentOffset.y / panelH));
  const showDock = panel < keys.length;

  /** Panels clear the dock; the ledger under them does not. */
  const padBottom = insets.bottom + DOCK_CLEARANCE;
  const panelProps = { h: panelH, padTop, padBottom, gutter, C };

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
        {/* ══ 01 — WHAT HAPPENED ══════════════════════════════════════════ */}
        <Panel
          {...panelProps}
          mark={sessionStamp}
          subject={
            <>
              {/* SHARED ELEMENT (destination) — the title the tapped row was
                  showing flies here rather than the page re-rendering it. */}
              <Text ref={titleRef} numberOfLines={titleType.maxLines} style={{ ...titleStyle, opacity: titleHidden ? 0 : 1 }}>
                {session.title}
              </Text>
              {/* THE MAGNITUDE IS THE SESSION'S OWN FIGURE. It used to be the
                  record's load, so "75 kg" was set at display size here, again
                  on the reveal before it, and a third time as the work panel's
                  top set — while the thing the session actually did sat in a
                  bordered tile. The record is a different fact. */}
              <CountUp
                value={wrapped.headline.value}
                style={{ fontFamily: F.black, fontSize: HERO_FIGURE.size, lineHeight: HERO_FIGURE.lineHeight, color: C.chalk, letterSpacing: HERO_FIGURE.tracking * HERO_FIGURE.size, marginTop: space.md }}
              />
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginTop: space.xxs }}>
                {t(wrapped.headline.labelKey)}
              </Text>
            </>
          }
          instrument={
            hasSpine
              ? (h) => (
                  <View>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginBottom: space.ms }}>
                      {t("session.work.tonnageThrough")}
                    </Text>
                    <TonnageCurve spine={spine} width={plotW} height={Math.max(CHART_MIN, h - CHART_LABEL)} />
                  </View>
                )
              : undefined
          }
          ledger={
            <>
              {/* A session too short to draw a curve puts its figures in the
                  instrument's place instead of leaving the place empty — the
                  ledger spreads, and the panel is composed either way. */}
              {rowFigures.length > 0 && (
                <View style={{ flexDirection: "row", paddingTop: space.md, borderTopWidth: 1, borderTopColor: C.line }}>
                  {rowFigures.map((b) => (
                    <View key={b.labelKey} style={{ flex: 1 }}>
                      {/* A modelled figure wears a "~" — never presented as a
                          measurement (core/energy.ts). */}
                      <Text
                        maxFontSizeMultiplier={FIXED_FONT_SCALE}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.6}
                        style={[TABULAR, { fontFamily: F.black, fontSize: fs.heading * fitScale((b.estimate ? "~" : "") + b.value, STAT_FIT_EM), color: C.chalk }]}
                      >
                        {b.estimate ? "~" : ""}{b.value}
                      </Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, textTransform: "uppercase", marginTop: space.xxs }}>
                        {t(b.labelKey)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
              {/* THE RECORD, when it has no history to fill a panel with. It is
                  a strip here rather than a screen of trophy and confetti. */}
              {cel && !hasRecordPanel && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg, paddingTop: space.md, borderTopWidth: 1, borderTopColor: withAlpha(GOLD, ALPHA.line) }}>
                  <AuroraIcon name="trophy" size={fs.heading} color={GOLD} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: GOLD, textTransform: "uppercase" }}>
                      {cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne")}
                    </Text>
                    <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk, marginTop: space.xxs }}>{heroSub}</Text>
                  </View>
                  <Text style={[TABULAR, { fontFamily: F.black, fontSize: fs.display, color: C.chalk }]}>{heroBig}</Text>
                </View>
              )}
              {device ? (
                <Pressable onPress={() => setMatchOpen(true)} style={{ marginTop: space.lg, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderColor: withAlpha(C.chalk, ALPHA.line), borderRadius: RADIUS.pill, paddingVertical: space.sm, paddingHorizontal: space.md }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.chalk }}>{t("session.device.measuredOn")}</Text>
                  {deviceMark ? (
                    <DeviceMark provider={device.provider} height={DEVICE_MARK_H} on="dark" label={deviceName ?? undefined} />
                  ) : (
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.chalk }}>{deviceName ?? t("session.device.matchedChip")}</Text>
                  )}
                </Pressable>
              ) : canMatch ? (
                <Pressable onPress={() => setMatchOpen(true)} style={{ marginTop: space.lg, alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: space.sm, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingVertical: space.ms, paddingHorizontal: space.lg }}>
                  <DeviceMark provider="apple" form="mark" height={DEVICE_MARK_SM} on="dark" label="" />
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("session.device.matchCta")}</Text>
                </Pressable>
              ) : null}
            </>
          }
        />

        {/* ══ 02 — WHAT YOU BEAT ══════════════════════════════════════════ */}
        {/* A record drawn AS A HISTORY. "75 kg" says nothing alone; the same
            figure over every previous session that never reached it is the
            thing worth looking at. What stood here was a trophy, sixteen
            confetti squares and a rotating gradient — a full screen that
            celebrated a record without ever showing it. */}
        {hasRecordPanel && cel && cel.kind === "strength" && (
          <Panel
            {...panelProps}
            mark={cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne")}
            markTone={GOLD}
            subject={
              <>
                <CountUp
                  value={heroBig}
                  style={{ fontFamily: F.black, fontSize: HERO_FIGURE.size, lineHeight: HERO_FIGURE.lineHeight, color: C.chalk, letterSpacing: HERO_FIGURE.tracking * HERO_FIGURE.size }}
                />
                <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: txt(C, C.lime), marginTop: space.sm }}>{heroSub}</Text>
              </>
            }
            instrument={(h) => (
              <View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginBottom: space.ms }}>
                  {t("session.record.history")}
                </Text>
                <LiftHistory points={recordHistory} width={plotW} height={Math.max(CHART_MIN, h - CHART_LABEL)} />
              </View>
            )}
            ledger={
              <>
                <WorkRow label={t("session.wrapped.est1rm")} value={fmtWeight(recordHistory[recordHistory.length - 1]!.e1rm, units, undefined, lang)} C={C} />
                <WorkRow
                  label={t("session.record.sessions")}
                  value={`${recordHistory.length}`}
                  note={cel.lift}
                  C={C}
                  last
                />
              </>
            }
          />
        )}

        {/* ══ 03 — WHERE IT LANDED ════════════════════════════════════════ */}
        {/* SessionBody owns its own three zones: the figure sits in a flex
            container that ABSORBS the panel's slack, which is a picture
            growing rather than a spacer holding a screen open. */}
        {muscleRead.map.muscles.length > 0 && (
          <Panel {...panelProps} mark={t("session.body.title")} fill>
            <SessionBody map={muscleRead.map} coverage={muscleRead.coverage} units={units} />
          </Panel>
        )}

        {/* ══ 04 — HOW YOU RAN IT ═════════════════════════════════════════ */}
        {hasSpine && (
          <Panel
            {...panelProps}
            mark={t("session.work.title")}
            meta={`${t("session.work.workingSets")} ${spine.workingSets}/${spine.totalSets}`}
            subject={
              spine.topSet ? (
                <>
                  <Text style={[TABULAR, { fontFamily: F.black, fontSize: fs.hero, letterSpacing: trackFigure(fs.hero), color: C.chalk }]}>
                    {fmtWeight(spine.topSet.loadKg, units, undefined, lang)}
                    {spine.topSet.reps ? <Text style={{ fontSize: fs.heading, color: C.ash }}> × {spine.topSet.reps}</Text> : null}
                  </Text>
                  <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: txt(C, C.lime), marginTop: space.xxs }}>
                    {t("session.work.topSet")} – {spine.topSet.exercise}
                  </Text>
                </>
              ) : null
            }
            instrument={(h) => (
              <View>
                {/* The legend names the warm-up treatment ONLY when a warm-up is
                    actually drawn. Printed unconditionally it explained a
                    convention that was not on the chart. */}
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginBottom: space.ms }}>
                  {t(spine.workingSets < spine.totalSets ? "session.work.loadPerSet" : "session.work.loadPerSetPlain")}
                </Text>
                <SetSpine spine={spine} width={plotW} height={Math.max(CHART_MIN, h - CHART_LABEL - SPINE_LABELS)} />
              </View>
            )}
            ledger={
              <>
                {spine.medianRestSec != null && (
                  <WorkRow label={t("session.work.medianRest")} value={mmss(spine.medianRestSec)} C={C} />
                )}
                {spine.meanRpe != null && (
                  <WorkRow label={t("session.work.meanRpe")} value={`${spine.meanRpe}`} C={C} last />
                )}
              </>
            }
          />
        )}

        {/* ══ 05 — WHAT IT COST ═══════════════════════════════════════════ */}
        {panelFacts.length > 0 && topFact && (
          <Panel
            {...panelProps}
            mark={t("session.wrapped.premiumLead")}
            meta={t("session.wrapped.premium")}
            metaMark="✦"
            metaTone={GOLD}
            subject={
              <>
                <Text style={[TABULAR, { fontFamily: F.black, fontSize: fs.hero, letterSpacing: trackFigure(fs.hero), color: topFact.tone === "up" || topFact.tone === "down" ? deltaPaint(C, topFact.tone) : C.chalk }]}>
                  {topFact.value}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginTop: space.xxs }}>
                  {t(topFact.labelKey)}
                </Text>
                {/* WHICH LIFT. `topLift` picks by highest estimated max, so the
                    e1RM and its trend routinely belong to a different lift than
                    the one the session leads with — an unlabelled red "−16 kg"
                    read as this session going backwards when it was a second
                    exercise's long-run trend. */}
                {topFact.qualifier ? (
                  <Text numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: space.xxs }}>{topFact.qualifier}</Text>
                ) : null}
              </>
            }
            instrument={
              factHistoryDrawable
                ? (h) => (
                    <View>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, marginBottom: space.ms }}>
                        {t("session.record.history")}
                      </Text>
                      <LiftHistory points={factHistory} width={plotW} height={Math.max(CHART_MIN, h - CHART_LABEL)} />
                    </View>
                  )
                : undefined
            }
            ledger={
              <>
                {restFacts.map((f, i, arr) => (
                  <WorkRow
                    key={f.labelKey + f.value}
                    label={t(f.labelKey)}
                    value={f.value}
                    note={f.qualifier}
                    tone={f.tone === "up" || f.tone === "down" ? f.tone : undefined}
                    C={C}
                    last={i === arr.length - 1 && full}
                  />
                ))}
                {!full && (
                  <View style={{ marginTop: space.lg }}>
                    <APill label={t("session.wrapped.unlock")} onPress={() => router.push("/account")} variant="outline" />
                  </View>
                )}
              </>
            }
          />
        )}

        {/* ══ 06 — WHAT THE WATCH SAW ═════════════════════════════════════ */}
        {device && (
          <Panel
            {...panelProps}
            mark={t("session.device.panelTitle")}
            subject={
              <>
                <Text style={{ fontFamily: F.black, fontSize: fs.display, color: C.chalk, letterSpacing: tracking.display, lineHeight: leading(fs.display, "tight") }}>
                  {device.activityLabel}
                </Text>
                {deviceMark ? (
                  <View style={{ alignSelf: "flex-start", marginTop: space.ms }}>
                    <DeviceMark provider={device.provider} height={DEVICE_MARK_H} on="dark" label={deviceName ?? undefined} />
                  </View>
                ) : (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.chalk, marginTop: space.ms }}>
                    {deviceName ?? t("session.device.deviceCol")}
                  </Text>
                )}
              </>
            }
            ledger={
              <>
                {comparison.map((r, i) => (
                  <View key={r.labelKey} style={{ flexDirection: "row", alignItems: "baseline", paddingVertical: space.md, borderBottomWidth: i === comparison.length - 1 ? 0 : 1, borderBottomColor: C.line }}>
                    <Text style={{ flex: 1.1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, textTransform: "uppercase" }}>{t(r.labelKey)}</Text>
                    {/* THE MEASURED FIGURE LEADS and the logged one qualifies it
                        — the hierarchy the device-truth rule states, which two
                        equal columns in a bordered table did not. */}
                    <Text style={[TABULAR, { flex: 1, fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk, textAlign: "right" }]}>{r.device ?? "—"}</Text>
                    {!imported && (
                      <Text style={[TABULAR, { flex: 1, fontFamily: F.mono, fontSize: fs.micro, color: C.ash, textAlign: "right" }]}>
                        {r.app != null ? `${t("session.device.appCol")} ${r.appEstimate ? "~" : ""}${r.app}` : ""}
                      </Text>
                    )}
                  </View>
                ))}
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, lineHeight: leading(fs.nano, "relaxed"), color: C.ash, marginTop: space.md }}>
                  {t(imported ? "session.device.truthImported" : "session.device.truth")}
                </Text>
                <View style={{ flexDirection: "row", gap: space.lg, marginTop: space.lg }}>
                  <Pressable onPress={() => setMatchOpen(true)}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>{t("session.device.rematch")}</Text>
                  </Pressable>
                  <Pressable onPress={() => void unlinkDevice()} disabled={unlinking} style={{ opacity: unlinking ? STATE_OPACITY.busy : 1 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{t("session.device.unlink")}</Text>
                  </Pressable>
                </View>
              </>
            }
          />
        )}

        {/* ══ 06b — CONNECT A DEVICE ══════════════════════════════════════ */}
        {showDeviceAd && (
          <Panel
            {...panelProps}
            mark={t("session.wrapped.device.title")}
            subject={
              <Text style={{ fontFamily: F.black, fontSize: fs.display, color: C.chalk, letterSpacing: tracking.display, lineHeight: leading(fs.display, "tight") }}>
                {t("session.wrapped.device.lead")}
              </Text>
            }
            ledger={
              <>
                {([
                  ["heart", C.red, "session.wrapped.device.hr"],
                  ["flame", C.red, "session.wrapped.device.energy"],
                  ["stopwatch", C.chalk, "session.wrapped.device.time"],
                  ["moon", GOLD, "session.wrapped.device.recovery"],
                ] as const).map(([icon, tint, key], i) => (
                  <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: C.line }}>
                    <AuroraIcon name={icon} size={fs.subtitle} color={tint} />
                    <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t(key)}</Text>
                  </View>
                ))}
                <Pressable onPress={() => { onBack(); router.push("/connections"); }} style={{ marginTop: space.xl, alignSelf: "flex-start", backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: space.md, paddingHorizontal: space.xxl }}>
                  <CtaLabel label={`${t("session.wrapped.device.cta")} →`} color={C.onAccent} fontSize={fs.note} font={F.black} />
                </Pressable>
              </>
            }
          />
        )}

        {/* ══ 07 — HOW IT FELT ════════════════════════════════════════════ */}
        <Panel
          {...panelProps}
          mark={t("session.feel.q")}
          ledger={
            <>
              <FeelPrompt
                sessionId={session.id}
                minutes={receipt.durationMin}
                initialFeel={session.feel ?? null}
                initialFatigue={session.fatigue ?? null}
                sessionEnd={session.completedAt ?? session.startedAt ?? null}
                baseline={feelBaseline}
                /* The panel's own mark already asks the question; the prompt's
                   kicker would ask it twice on one screen. */
                eyebrow={() => null}
              />
              {/* HEAT — the primary entry, and it lives here because this is the
                  only moment where the gap from the session end is known
                  exactly (engines/heat.ts reads that decay). It ASKS or it
                  REPORTS, depending on what the log already holds. */}
              <Pressable
                onPress={() => setHeatOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={t(loggedHeat ? "w.recovery.heat.afterSessionDone" : "w.recovery.heat.afterSession")}
                style={{ marginTop: space.xl, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, paddingTop: space.md, borderTopWidth: 1, borderTopColor: C.line }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>
                    {t(loggedHeat ? "w.recovery.heat.afterSessionDone" : "w.recovery.heat.afterSession")}
                  </Text>
                  <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: space.xxs }}>
                    {loggedHeat
                      ? t("w.recovery.heat.afterSessionLogged")
                          .replace("{n}", String(loggedHeat.minutes))
                          .replace("{t}", fmtTemp(loggedHeat.tempC, units))
                          .replace("{at}", new Date(loggedHeat.ts).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }))
                      : t("w.recovery.heat.afterSessionSub")}
                  </Text>
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: txt(C, C.amber) }}>&#8594;</Text>
              </Pressable>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, color: C.ash, textAlign: "center", marginTop: space.xl }}>
                {t("session.wrapped.scroll")} ↑
              </Text>
            </>
          }
        />

        {/* ══ THE LEDGER ══════════════════════════════════════════════════
            Not a panel: it is a list, and a list is as long as it is. It stands
            on the panels' ground at the panels' gutter with the same hairline
            rows, so the handover is not a seam between two design languages. */}
        <View style={{ backgroundColor: HERO_TAKEOVER_INK, paddingHorizontal: gutter, paddingTop: padTop, paddingBottom: insets.bottom + space.huge, minHeight: panelH }}>
          {details}
        </View>
      </ScrollView>

      {/* THE RAIL — the same 40pt circular control, at the same y, as every
          other screen. A takeover has no stack under it, so it DISMISSES
          (chevron-down) rather than pops; share is its twin in the opposite
          corner, and it holds that corner on every panel. */}
      <View style={{ position: "absolute", top: geom.railTop, left: HERO.gutter.edge, right: HERO.gutter.edge, height: HERO.rail.height, flexDirection: "row", alignItems: "center", zIndex: 5 }}>
        <HeroNav onPress={onBack} mode="takeover" material="glass" onDark />
        <HeroAction
          glyph={SHARE_MARK.glyph}
          fallbackGlyph={SHARE_MARK.fallback}
          label={t("summary.share")}
          onPress={() => setShareOpen(true)}
          style={{ marginLeft: "auto" }}
        />
      </View>

      {/* WHERE YOU ARE IN THE SEQUENCE. */}
      {showDock && (
        <View style={{ position: "absolute", left: HERO.gutter.edge, right: HERO.gutter.edge, bottom: insets.bottom + space.xl, flexDirection: "row", justifyContent: "center", gap: space.xs }}>
          {keys.map((k, i) => (
            <View
              key={k}
              style={{ width: i === Math.min(panel, keys.length - 1) ? DOT_ON : DOT_OFF, height: DOT_OFF, borderRadius: RADIUS.mark, backgroundColor: i === Math.min(panel, keys.length - 1) ? C.lime : C.line }}
            />
          ))}
        </View>
      )}

      {/* ── THE SHARE CARD, PREVIEWED ── */}
      <Sheet visible={shareOpen} onClose={() => setShareOpen(false)} title={t("summary.shareStory")}>
        <View style={{ alignItems: "center" }}>
          <SessionShareCard figures={shareFigures} map={muscleRead.map} units={units} width={previewWidth} locale={lang} />
        </View>
        <View style={{ marginTop: space.xl }}>
          <APill label={t("summary.share")} onPress={() => void doShare()} disabled={sharing} />
        </View>
      </Sheet>

      {/* THE CAPTURE NODE — the same card at export width, parked off-screen so
          the preview above can be sized to the sheet. One component, one props
          object; only the width differs. */}
      {shareOpen && (
        <View pointerEvents="none" style={{ position: "absolute", left: -CAPTURE_OFFSCREEN, top: 0, opacity: 0 }}>
          <SessionShareCard ref={cardRef} figures={shareFigures} map={muscleRead.map} units={units} width={captureWidth} locale={lang} />
        </View>
      )}

      {/* ── HEAT SHEET ──
          Defaulted to the session's own end, so a sauna taken straight after is
          dated to the sauna rather than to whenever this screen was tapped. */}
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
        sessionDurationMin={logged.durationMin}
        visible={matchOpen}
        onClose={() => setMatchOpen(false)}
        onMatched={onMatched}
      />
    </View>
  );
}
