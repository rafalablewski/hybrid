import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, ScrollView, ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Dimensions, AccessibilityInfo } from "react-native";
import * as Notifications from "expo-notifications";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getPref, setPref } from "../lib/synced-prefs";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useBodyweightLookup, refreshBodyweight } from "../lib/use-bodyweight";
import { haptic } from "../lib/haptics";
import { ConcernLine } from "../components/aurora/concern-line";
import { allowFieldValue } from "../lib/field-guard";
import { animateListChange } from "../lib/list-motion";
import { useSharedSurfaceSource, useSharedSurfaceTarget } from "../lib/shared-element";
import {
  needsBodyweight,
  prescribeSession,
  feelSamples,
  loadBaseline,
  personalTrainingLog,
  velocityProfiles,
  planProgramToday,
  sessionVolume,
  blockTopLoad,
  formatStrengthPr,
  workoutShareCaption,
  newPrsInSession,
  newCardioPrsInSession,
  liveSessionStats,
  exerciseLiveStats,
  exerciseHistory,
  inferBlockKind,
  migrateBlocks,
  exerciseProfile,
  loadUnitCount,
  timedSportOnly,
  sportDistanceUnit,
  allowsTyping,
  cardioDiscipline,
  inspectEffort,
  inspectSet,
  distanceBounds,
  loadBounds,
  repsBounds,
  ELEVATION_BOUNDS,
  INCLINE_BOUNDS,
  MINUTES_BOUNDS,
  RPE_BOUNDS,
  VELOCITY_BOUNDS,
  ZONE_BOUNDS,
  type Bounds,
  displaySportDistance,
  parseSportDistance,
  formatCardioPr,
  cardioPace,
  blockSummary,
  strengthSetSummary,
  lastStrengthByLift,
  supersetLabels,
  toggleSuperset,
  isSupersettedWithPrev,
  setType,
  setTypeTo as setTypeToSet,
  type SetType,
  type StrengthBlock,
  setTypeBadge,
  setFocus,
  addSetIsNext,
  activeSetIndex,
  nextSetCursor,
  queuedSetCount,
  setIsLoggable,
  exerciseCountKey,
  moveItemTo,
  warmupRamp,
  defaultSessionTitle,
  rpeRirSwap,
  displayLoad,
  storeLoad,
  fmtWeight,
  fmtTonnage,
  platesPerSide,
  unitToKg,
  kgToUnit,
  type WeightUnit,
  type SetRole,
  RPE_SCALE,
  RPE_INTRO,
  sessionPanels,
  STORY_STYLES,
  DEFAULT_STORY_STYLE,
  storyStyle,
  type StoryStyleId,
  FUNNEL,
  canSaveRoutine,
  isFullAccess,
  mmss,
  MOODS,
  SUGGESTED_TAGS,
  MAX_TAGS,
  tagLabelKey,
  type SessionBlock,
  type LoggedSession,
  type PrHit,
  type CardioPrHit,
  type ExerciseUse,
  quickCheckinFeeling,
  localDayKey,
  localTodayKey,
  springs,
  springToRN,
  livePrLifts,
  SHARED_ELEMENTS,
  HERO,
  SATELLITE,
  type ReadinessFeeling,
  ALPHA, FEEDBACK, STATE_OPACITY, LABEL_GAP } from "@hybrid/core";
import { fetchSessions, createSession, renameSession, patchSessionNote, logBodyweight, fetchRoutines, createRoutine, fetchMacrocycle, fetchCheckins, type NewSession, type Routine } from "../lib/api";

// Today's one-tap readiness feeling from the check-in list → scales the AI
// session's load so a Started session matches the readout on Home.
//
// The readiness ANSWER, through the shared day-key helper. This read
// `checkinFeeling` (the average of four different questions) against its own
// `toDateString()` comparison, so the session an athlete actually started could
// be scaled off a different feeling, on a different definition of "today", than
// the one Home was showing them.
function todayFeelingOf(list: { weekOf: string; energy: number | null; sleep: number | null; soreness: number | null; mood: number | null }[]): ReadinessFeeling | null {
  const today = localTodayKey();
  return quickCheckinFeeling(list.find((x) => x?.weekOf && localDayKey(x.weekOf) === today) ?? null);
}
import { useRevalidate } from "../lib/queries";
import ExercisePickerSheet from "../components/aurora/exercise-picker";
import { AuroraExerciseAvatar } from "../components/aurora/exercise-media";
import { ArrowGlyph } from "../components/aurora/cta-label";
import { RollingNumber } from "../components/aurora/rolling-number";
import Sheet from "../components/aurora/sheet";
import { useConfirm } from "../components/aurora/confirm";
import { FeelPrompt } from "../components/feel-prompt";
import { scheduleRecoveryReminder } from "../lib/recovery-reminder";
import SwipeRow from "../components/swipe-row";
import HoldDragRow from "../components/hold-drag-row";
import { useDragReorder } from "../lib/use-drag-reorder";
import { saveGuestSession, listGuestSessions } from "../lib/guest";
import { loadDraft, saveDraft, clearDraft } from "../lib/draft";
import { shareCardImage, SlideStoryCard, panelSlides, heroFigure, prRowDelta, type ShareBest, type SlideData } from "../lib/share";
import { useSession } from "../lib/session";
import { usePersona } from "../lib/persona";
import { readPlanMaxes } from "../lib/plan-maxes";
import { track } from "../lib/track";
import { useLoggerPrefs, setLoggerPref } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { F, FIXED_FONT_SCALE, MAX_FONT_SCALE, Mono, PressScale as Pressable, fs, kernPad, leading, space, trackFigure, tracking, ty, useRowEntrance} from "../lib/ui";
import { useTheme, txt, type Palette } from "../lib/theme";
import { usePremiumAccent } from "../lib/premium-accent";
import { AuroraIcon, Glyph } from "../components/aurora/icons";
import type { AuroraIconName } from "@hybrid/core";
import { AuroraField, withAlpha, ACard, cardStack, GUTTER , RADIUS} from "../components/aurora/kit";
import { GlassSelectMenu, GlassToolbarGroup, LIQUID_GLASS_RENDERED } from "../components/aurora/swiftui";
import ASatellite from "../components/aurora/satellite";
import { SHARE_MARK } from "../components/aurora/share-mark";
import { HeroNav } from "../components/aurora/hero";
import { useReducedMotion } from "../lib/use-reduced-motion";
import { coverInsets, coverPadBottom } from "../lib/layout";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Mark } from "../components/aurora/mark";

// THE LOGGER'S PRIVATE RADIUS VOCABULARY IS GONE. It was a four-name ladder —
// cta / banner / field / chip — built by a helper that took a boolean and
// returned one of two sets. The boolean was `template === "aurora"`, and
// `TemplateName` is a union of ONE, so the second set could never render: a
// dead branch feeding a private vocabulary, in the app's most-used screen. The
// live values were 999 / 16 / 16 / 999, which are exactly the kit's own
// `RADIUS.pill` and `RADIUS.field`, so the whole thing said in four local names
// what the design system already said in two shared ones. Call sites read
// RADIUS directly now.

const uid = () => Math.random().toString(36).slice(2);

// The foreground presentation rule (rest cue: sound + banner, but never a row
// left in Notification Centre) moved to lib/push.ts, which the app shell
// imports. `setNotificationHandler` is GLOBAL and last-writer-wins, so with one
// here and one there, which rule was live depended on which screen the athlete
// happened to open first. One handler, branching on remote-vs-local.

type WKind = "strength" | "cardio" | "conditioning";

type WSet = { uid: string; reps: string; load: string; rpe: string; vel?: string; done: boolean; drop?: boolean; role?: SetRole; rest?: number };

// Default rest the countdown targets before you pick a preset — so a new user
// always sees a counting-down timer (not a stopwatch climbing with no end).
const DEFAULT_REST = 90;

/** The rest durations, in one place: the capsule's inline picker and the rest
 *  banner's preset row are the same four numbers and must not drift. */
const REST_PRESETS = [60, 90, 120, 180] as const;
/** "What kind of set" — the picker section, then the rows that follow it.
 *  One question, one menu: these three tables replaced a ＋ that cycled, a ⚡
 *  tile and a ⋯ zone. */
const SET_TYPE_OPTIONS: { id: SetType; k: string }[] = [
  { id: "working", k: "workout.setTypeWorking" },
  { id: "warmup", k: "workout.warmupSetTitle" },
  { id: "drop", k: "workout.dropSetTitle" },
  { id: "cooldown", k: "workout.cooldownSetTitle" },
];
const SET_SCHEMES = [
  { key: "3x3", sets: 3, reps: 3, k: "workout.schemeHeavy" },
  { key: "5x5", sets: 5, reps: 5, k: "workout.schemeStrength" },
  { key: "3x12", sets: 3, reps: 12, k: "workout.schemeHypertrophy" },
  { key: "4x8", sets: 4, reps: 8, k: "workout.schemeVolume" },
  { key: "10x10", sets: 10, reps: 10, k: "workout.schemeGvt" },
] as const;
const SET_EXTRAS: { key: string; k: string }[] = [
  { key: "ramp", k: "workout.warmupRampTitle" },
  ...SET_SCHEMES.map((p) => ({ key: p.key, k: p.k })),
];

const REST_OPTIONS: { id: string; label: string }[] = [
  { id: "off", label: "Off" },
  ...REST_PRESETS.map((s) => ({ id: String(s), label: s < 120 ? `${s} s` : `${s / 60} min` })),
];
// Sources that are always a deliberate fresh start (so we can show the get-ready
// count-in from the first frame). An empty source may instead resume a draft.
const FRESH_SOURCES = new Set(["new", "ai", "last", "template", "plan", "plan-day", "sport"]);
// One-time "how logging works" coach tip — shown until the athlete completes
// their first-ever set or dismisses it.
const TIP_KEY = "hybrid.workoutTipSeen";
type WExercise = {
  uid: string;
  name: string;
  kind: WKind;
  sets: WSet[];
  minutes: string;
  rpe: string;
  distance: string;
  /** Cardio extras — which of these SHOW is decided by the exercise-profile
   *  model (incline for treadmill work, stroke for swims, elevation for
   *  outdoor climb sports, HR zone for any cardio). Held as raw text. */
  incline: string;
  stroke: string;
  elevation: string;
  zone: string;
  /** Superset group key — exercises sharing it are performed together (A1/A2…). */
  group?: string;
};

/**
 * A fresh set, optionally carrying the previous one's numbers forward.
 *
 * Load and reps carry; EFFORT DOES NOT. Carry-over exists so the next set
 * arrives as a plan you only have to correct — but an RPE is not a plan, it is
 * an observation of a set that has happened, and copying it forward had the
 * logger assert an effort for work not yet done: a brand-new set arrived
 * pre-rated at 8 on an amber chip, indistinguishable from one the athlete had
 * actually judged, and if they never touched it that guess was what got saved.
 * (The BUILDER's carry-over does copy it, and should: there an RPE is a
 * prescription — a target to hit, authored in advance.)
 */
const emptySet = (from?: WSet): WSet => ({
  uid: uid(),
  reps: from?.reps ?? "",
  load: from?.load ?? "",
  rpe: "",
  done: false,
});

const newExercise = (name: string, kind: WKind = inferBlockKind(name)): WExercise => ({
  uid: uid(),
  name,
  kind,
  sets: [emptySet()],
  minutes: "",
  rpe: "",
  distance: "",
  incline: "",
  stroke: "",
  elevation: "",
  zone: "",
});


/**
 * Carry a lift's last session forward as its opening queue.
 *
 * Only the WORKING sets, and only their numbers — the previous session's
 * warm-up ramp is not this session's plan, and nothing is marked done. If the
 * lift is new, or last time was a single empty set, the exercise arrives as it
 * always did: one blank set to type into.
 */
const seedFromLast = (x: WExercise, last?: StrengthBlock): WExercise => {
  if (x.kind !== "strength" || !last) return x;
  const carried = last.sets.filter((s) => setType(s) === "working" && (s.reps || s.load));
  if (!carried.length) return x;
  return {
    ...x,
    sets: carried.map((s) => ({ uid: uid(), load: s.load ?? "", reps: s.reps ?? "", rpe: "", done: false })),
  };
};

type Summ = {
  /** The saved session's id (null for guests / offline) — backs the rename. */
  sessionId: string | null;
  title: string;
  /** The session's own clock — the share deck is built from a LoggedSession,
   *  and core needs the real timestamps to place it against the history. */
  startedAt: string;
  /** ISO — when the session ended. The finish screen reads the feel prompt's
   *  lag from this; without it the read classifies as "unknown" and the line
   *  promising a second ask never renders. */
  completedAt: string;
  blocks: SessionBlock[];
  volume: number;
  sets: number;
  minutes: number;
  guest: boolean;
  pending: boolean;
  /** true when this is the athlete's first-ever logged session — a milestone. */
  firstEver: boolean;
  bests: ShareBest[];
  prs: PrHit[];
  cardioPrs: CardioPrHit[];
};

/** A localized one-liner for a cardio PR (distance furthest / pace fastest) —
 *  delegates to the shared core formatter (renders in the sport's natural unit). */
export function cardioPrLine(p: CardioPrHit, t: (k: string) => string): string {
  return formatCardioPr(p, t("summary.firstTime"));
}

const guestToLogged = (g: { title: string; startedAt?: string; savedAt: string; blocks: unknown[] }): LoggedSession => ({
  id: g.savedAt,
  title: g.title,
  startedAt: g.startedAt ?? g.savedAt,
  blocks: migrateBlocks(g.blocks),
});

export default function Workout() {
  const reducedMotion = useReducedMotion();
  const { palette: C, scheme } = useTheme();
  const pa = usePremiumAccent();
  const router = useRouter();
  const { t, lang } = useLang();
  const { session, ready } = useSession();
  const revalidate = useRevalidate();
  const guest = !session;
  // AI-prescribed sessions are a premium (paid) feature. A casual/free user or a
  // guest can't generate one — they're funnelled instead: guests to register,
  // free users to the upgrade paywall.
  const isAthlete = usePersona() !== "casual";
  const gateAI = (from: string): boolean => {
    if (isAthlete) return true;
    track(FUNNEL.upgradeEntryClick, { client: "mobile", source: from });
    router.replace(guest ? "/login?mode=signup" : "/upgrade");
    return false;
  };
  const prefs = useLoggerPrefs();
  // Bodyweight-aware tonnage: 10 BW pull-ups at 70 kg = 700 kg of work.
  const bw = useBodyweightLookup();
  const bodyweightKg = bw();
  const { source, templateId, sport } = useLocalSearchParams<{ source?: string; templateId?: string; sport?: string }>();

  // Auto-titled — no name input while logging; a name is only entered on the
  // summary (Save as routine, or the optional rename). Seeded by source below.
  const [title, setTitle] = useState(() => defaultSessionTitle());
  // Which exercise has its SET-OPTIONS panel open — the RN floor for the one
  // menu that answers "what kind of set": the type, the warm-up/ramp/cool-down/
  // drop rows, and the rep schemes. It replaced a ＋ that cycled, a ⚡ tile and
  // a ⋯ zone, and absorbed the standalone preset rail with them.
  const [specialUid, setSpecialUid] = useState<string | null>(null);
  // LIVE active-set RPE: hidden behind a chip on the up-now card, expanded per
  // SET. It was keyed by EXERCISE, on the reasoning that only one set is active
  // per exercise — true, but the state outlived the set it was opened for:
  // banking never cleared it, so opening the pill row, picking nothing and
  // logging the set left the row sitting open on the NEXT set. A set's own uid
  // is unique across the session, so the row closes with the set that owns it.
  const [rpeOpenSet, setRpeOpenSet] = useState<string | null>(null);
  // Which exercise has its detail sheet up (per-set bar speed + live summary).
  const [sheetUid, setSheetUid] = useState<string | null>(null);
  // Finish, tapped: the dock swaps to a confirm IN PLACE rather than throwing a
  // sheet. It is what buys back the word the glass satellite doesn't carry —
  // the label lives in the moment it is read, instead of taxing the primary's
  // width for the whole session.
  const [confirmFinish, setConfirmFinish] = useState(false);
  // Refs to the active set's load/reps inputs (keyed `${uid}:load|reps`) so
  // tapping the unit label focuses the field — the RN twin of a web <label for>.
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const [exercises, setExercises] = useState<WExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [phase, setPhase] = useState<"active" | "done">("active");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [restSince, setRestSince] = useState<number | null>(null);
  // Disarming the timer UNMOUNTS the rest banner — a block the height of two rows
  // leaving the top of the scroller. `stopRest` is the one door for that, so the
  // three ways to dismiss it (the banner's own ■ Stop rest, the capsule's toggle,
  // the "off" pref) can't disagree about whether it travels.
  const stopRest = () => {
    animateListChange(reducedMotion);
    setRestSince(null);
  };
  const [restNow, setRestNow] = useState(0);
  const [restTarget, setRestTarget] = useState<number | null>(DEFAULT_REST);
  const restFired = useRef(false);
  const [readiness, setReadiness] = useState<number | undefined>(undefined);
  const [summary, setSummary] = useState<Summ | null>(null);
  const [restored, setRestored] = useState(false);
  const [recent, setRecent] = useState<ExerciseUse[]>([]);

  // Exercise picking is the shared ExercisePickerSheet (aurora/exercise-picker)
  // — Rooms/A–Z views, unified rows; the logger only feeds it `recent`.
  // Saved routines for the empty-state quick-load (parity with the web logger,
  // which offers AI-prescribe + your routines right on the logging screen).
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [rpeHelp, setRpeHelp] = useState(false);
  const [showTip, setShowTip] = useState(false);
  // Get-ready countdown on entering a fresh workout (5→1→GO) before the clock
  // starts; null once it finishes or when resuming an in-progress draft.
  // Seed it synchronously for an explicit fresh start (source is known on the
  // first render) so the count-in is the VERY FIRST thing on screen — never a
  // flash of the workout (and a stray elapsed second) while sessions load.
  const initialCountdown = FRESH_SOURCES.has(source ?? "") && prefs.countIn ? 5 : null;
  const [countdown, setCountdown] = useState<number | null>(initialCountdown);
  const didCountdown = useRef(initialCountdown != null);
  // Pause/hold — freezes the elapsed clock (and any running rest) until resumed.
  const [paused, setPaused] = useState(false);
  const pausedAt = useRef(0);

  // NO GRIP ON THE CARDS. Reorder exists — it lives in the exercise sheet's
  // Order block, where you HOLD a lift and drag it (ExerciseSheet below) — but
  // nothing on this screen advertises it. The ⠿ used to sit at the head of every
  // exercise card and every set row, ahead of the lift's own avatar, so the card
  // header read as a handle rather than as the lift, and the ledger was indented
  // for a gesture nobody reaches for mid-set. Moving it into the sheet costs a
  // long-press to get there and buys back both columns.
  //
  // The card's long-press is what OPENS that sheet, which is also why a
  // hold-and-drag could not simply be moved onto the cards themselves: the two
  // gestures are the same gesture.

  const startedAt = useRef(new Date());
  const prior = useRef<LoggedSession[]>([]);

  useEffect(() => {
    // Don't advance the clock during the get-ready countdown or while paused —
    // and never before the initial restore has resolved whether we count in
    // (otherwise a fresh start leaks a stray elapsed second before the count-in).
    if (phase !== "active" || paused || countdown !== null || !restored) return;
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.current.getTime()) / 1000));
      if (restSince) {
        const rn = Math.floor((Date.now() - restSince) / 1000);
        setRestNow(rn);
        // Buzz once when the chosen rest target is reached — eyes-off cue.
        if (restTarget && rn >= restTarget && !restFired.current) {
          restFired.current = true;
          haptic.success();
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [phase, restSince, restTarget, paused, countdown, restored]);

  // Drive the get-ready countdown: 5→1, a brief "GO", then start the clock from
  // zero so the elapsed time reflects actual training, not the count-in.
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      startedAt.current = new Date();
      setElapsed(0);
      const id = setTimeout(() => setCountdown(null), 700);
      return () => clearTimeout(id);
    }
    haptic.selection();
    const id = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, prefs.haptics]);

  // Show the one-time logging guide until the athlete has banked a set before.
  useEffect(() => {
    setShowTip(!getPref<boolean>(TIP_KEY, false));
  }, []);
  const dismissTip = () => {
    // A whole card leaving the top of the scroller, so it travels like any other
    // removal — otherwise everything below it jumps up by the card's height. The
    // one call from toggleDone already has an animation armed for that commit;
    // arming it twice is the same config and costs nothing.
    animateListChange(reducedMotion);
    setShowTip(false);
    setPref(TIP_KEY, true);
  };

  // Keep the screen on while logging — no dimming/sleep mid-set (chalky hands,
  // no taps). Released the moment the workout finishes or the screen unmounts.
  useEffect(() => {
    if (phase !== "active" || !prefs.keepAwake) return;
    activateKeepAwakeAsync("workout").catch(() => {});
    return () => {
      deactivateKeepAwake("workout").catch(() => {});
    };
  }, [phase, prefs.keepAwake]);

  // Apply the default rest target from prefs (and clear it entirely when the
  // auto rest timer is turned off). Runs when prefs land/change, not mid-set.
  useEffect(() => {
    setRestTarget(prefs.restTimer ? prefs.restSeconds : null);
  }, [prefs.restTimer, prefs.restSeconds]);

  // Ask for notification permission once (best-effort) so the rest-done alert
  // can fire while the app is backgrounded / the phone is locked.
  useEffect(() => {
    Notifications.requestPermissionsAsync().catch(() => {});
  }, []);

  // Schedule (and keep in sync) a local notification for when the rest
  // countdown ends — so you get an audible cue even with the app pocketed. Re-
  // fires whenever a new rest starts or the target changes; cancelled on stop.
  const restNotifId = useRef<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (phase !== "active" || restSince == null || restTarget == null || !prefs.restNotify) return;
      const remaining = restTarget - Math.floor((Date.now() - restSince) / 1000);
      if (remaining <= 0) return;
      try {
        const idn = await Notifications.scheduleNotificationAsync({
          content: { title: t("workout.restDone"), body: t("notif.restBody"), sound: prefs.restSound },
          trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: remaining },
        });
        if (cancelled) await Notifications.cancelScheduledNotificationAsync(idn).catch(() => {});
        else restNotifId.current = idn;
      } catch {
        // notifications unavailable (e.g. permission denied) — silent no-op
      }
    })();
    // Cancel the scheduled alert when the rest changes/stops OR the screen
    // unmounts — otherwise a "Rest's up" notification leaks after you've left
    // or finished the workout. `cancelled` also catches an in-flight schedule.
    return () => {
      cancelled = true;
      if (restNotifId.current) {
        Notifications.cancelScheduledNotificationAsync(restNotifId.current).catch(() => {});
        restNotifId.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restSince, restTarget, phase, prefs.restNotify, prefs.restSound]);

  // Load prior sessions once — to detect PRs at the finish, and to prefill an
  // AI / repeat-last start. Guests read their own on-device history. An empty
  // start resumes an in-progress draft if one exists (never lose a workout).
  // Seed the session ONCE, and only after the auth session has resolved
  // (`ready`). Previously this depended on `guest = !session`, so on a cold start
  // into the logger (draft resume / deep link) it ran first as a guest, then RE-RAN
  // when the session landed — re-applying loadDraft() / re-seeding and clobbering
  // any sets the user had already ticked. Gating on `ready` + a run-once ref makes
  // `guest` final before we touch state.
  const seeded = useRef(false);
  useEffect(() => {
    if (!ready || seeded.current) return;
    seeded.current = true;
    (async () => {
      const sessions = guest
        ? (await listGuestSessions()).map(guestToLogged)
        : await fetchSessions();
      prior.current = sessions;
      setRecent(exerciseHistory(sessions));

      // Resuming a live draft keeps its running clock — everything else is a
      // fresh start that gets the get-ready count-in.
      let resumedDraft = false;
      if (source === "last") {
        await clearDraft();
        const last = sessions[0];
        if (last) {
          setTitle(last.title || "Workout");
          setExercises(blocksToExercises(last.blocks));
        }
      } else if (source === "ai") {
        await clearDraft();
        // AI prescription is premium — bounce a guest/free user to the funnel
        // instead of fabricating a session for them.
        if (!gateAI("workout-ai")) return;
        const log = personalTrainingLog(sessions);
        const feeling = todayFeelingOf(await fetchCheckins().catch(() => []));
        const rx = prescribeSession(log, undefined, { profiles: velocityProfiles(sessions), subjectiveReadiness: feeling ?? undefined });
        setReadiness(rx.readiness);
        setTitle("AI session");
        setExercises(blocksToExercises(rx.blocks as SessionBlock[]));
      } else if (source === "template" && templateId) {
        await clearDraft();
        const routine = (await fetchRoutines()).find((r) => r.id === templateId);
        if (routine) {
          setTitle(routine.name || "Workout");
          setExercises(blocksToExercises(routine.blocks));
        }
      } else if (source === "plan") {
        // The enrolled discipline-shaped program's exact day prefills the session.
        await clearDraft();
        const m = await fetchMacrocycle();
        const today = planProgramToday(m?.planId, sessions.length, readPlanMaxes());
        if (today) {
          setTitle(`${today.planName} – ${today.day}`);
          setExercises(blocksToExercises(today.blocks));
        }
      } else if (source === "plan-day") {
        // The week rail's selected day (its EXACT date-anchored blocks) prefills
        // the session — handed off via AsyncStorage so "Do it now" / "Start early"
        // launch the day you tapped, not the count-based today.
        await clearDraft();
        try {
          const raw = await AsyncStorage.getItem("hybrid.pendingPlanSession");
          if (raw) {
            const p = JSON.parse(raw) as { title?: string; blocks?: SessionBlock[] };
            if (p.blocks?.length) {
              if (p.title) setTitle(p.title);
              setExercises(blocksToExercises(p.blocks));
            }
            await AsyncStorage.removeItem("hybrid.pendingPlanSession");
          }
        } catch {
          /* fall back to an empty session */
        }
      } else if (source === "sport" && sport) {
        // Manual sport session from the Sport tab — seed a cardio activity
        // named after the sport (no wearable needed).
        await clearDraft();
        setTitle(sport);
        setExercises([newExercise(sport, "cardio")]);
      } else if (source === "sport-transfer") {
        // The sport page's prescribed S&C session — the same blocks web hands
        // its logger (core's transferSessionBlocks), handed off through storage
        // exactly as "plan-day" does.
        await clearDraft();
        try {
          const raw = await AsyncStorage.getItem("hybrid.pendingSportSession");
          if (raw) {
            const p = JSON.parse(raw) as { title?: string; blocks?: SessionBlock[] };
            if (p.blocks?.length) {
              if (p.title) setTitle(p.title);
              setExercises(blocksToExercises(p.blocks));
            }
            await AsyncStorage.removeItem("hybrid.pendingSportSession");
          }
        } catch {
          /* fall back to an empty session */
        }
      } else if (source === "new") {
        // Deliberate fresh start — drop any interrupted draft.
        await clearDraft();
      } else {
        const draft = await loadDraft();
        if (draft) {
          startedAt.current = new Date(draft.startedAt);
          setTitle(draft.title);
          setExercises(draft.exercises as WExercise[]);
          resumedDraft = true;
        }
      }
      // Count the athlete in on a fresh workout (once per mount), starting the
      // clock only when it hits GO (see the countdown effect above).
      if (!resumedDraft && !didCountdown.current) {
        didCountdown.current = true;
        startedAt.current = new Date();
        if (prefs.countIn) setCountdown(5); // else the clock just starts now
      }
      setRestored(true);
    })();
  }, [ready, guest, source, templateId, sport]);

  /**
   * THE TWO EXITS — deliberately unequal.
   *
   * MINIMIZE is the top-level glyph and costs nothing: the draft is already
   * persisted on every change, so leaving the route hands the running session
   * to the tab-bar accessory rather than ending it. This is what the header's
   * left slot always DID — it called router.back() under the word "Cancel",
   * which is why people read the only safe exit as the destructive one.
   *
   * DISCARD is the irreversible one, so it is not a peer: it lives a layer down
   * in the ⋯ menu and behind a confirm. Two adjacent unlabelled glyphs — one
   * reversible, one not — in the corner a thumb rests on is precisely the
   * arrangement that loses sessions.
   */
  const { confirm } = useConfirm();
  const [menuOpen, setMenuOpen] = useState(false);
  const discarded = useRef(false);

  const minimize = useCallback(() => {
    router.back();
  }, [router]);

  const discard = useCallback(async () => {
    setMenuOpen(false);
    const ok = await confirm({
      title: t("workout.discardTitle"),
      message: t("workout.discardBody"),
      confirmLabel: t("train.discard"),
      destructive: true,
    });
    if (!ok) return;
    discarded.current = true;
    await clearDraft();
    router.back();
  }, [confirm, router, t]);

  // Persist the in-progress draft as it changes (debounced) so it survives a
  // crash / kill. Only after the initial restore, so we never clobber a draft.
  //
  // `discarded` latches once the athlete has thrown the session away: the save
  // is on a 500ms timer, so without the latch a write scheduled just before the
  // discard could land AFTER clearDraft() and resurrect the very session they
  // just confirmed away — which the accessory would then cheerfully offer to
  // resume.
  useEffect(() => {
    if (!restored || discarded.current) return;
    const id = setTimeout(() => {
      if (exercises.length) saveDraft({ title, startedAt: startedAt.current.toISOString(), exercises });
      else clearDraft();
    }, 500);
    return () => clearTimeout(id);
  }, [exercises, title, restored]);

  // Saved routines for the empty-state quick-load (guests get none).
  useEffect(() => {
    fetchRoutines().then(setRoutines).catch(() => {});
  }, []);

  // Empty-state quick-starts (parity with the web logger): pull today's
  // AI-prescribed session, or load one of your saved routines, without leaving
  // the live screen.
  const loadPrescribed = async () => {
    if (!gateAI("workout-ai")) return;
    const log = personalTrainingLog(prior.current);
    const feeling = todayFeelingOf(await fetchCheckins().catch(() => []));
    const rx = prescribeSession(log, undefined, { profiles: velocityProfiles(prior.current), subjectiveReadiness: feeling ?? undefined });
    setReadiness(rx.readiness);
    setTitle("AI session");
    setExercises(blocksToExercises(rx.blocks as SessionBlock[]));
  };
  const loadRoutine = (r: Routine) => {
    setTitle(r.name || "Workout");
    setExercises(blocksToExercises(r.blocks));
  };

  // EVERY MUTATION OF EITHER LIST TRAVELS. `animateListChange` before the commit
  // animates all of its consequences at once — the row arriving or leaving AND
  // the rows below opening or closing the gap. Without it the user's own edit
  // is the one moment in the app with no motion at all: a card appears fully
  // formed mid-list, or vanishes and everything under it teleports up.
  //
  // This sentence used to say "the list", singular, and mean only the EXERCISE
  // mutations below — which is how six of the seven SET mutations went on
  // teleporting under a comment that read like a guarantee. The set list has its
  // own door now (`commitSets`); a claim this broad is worth only as much as the
  // narrowest path it actually covers.
  const addExercise = (name: string, kind?: WKind) => {
    addExercises([{ name, kind }]);
  };
  /** Add a whole set of movements at once, in the order they were chosen — the
   *  picker's queue. One state commit and ONE layout animation, so six lifts
   *  arrive together instead of six sheets opening and closing. */
  const addExercises = (picks: { name: string; kind?: WKind }[]) => {
    const clean = picks.map((p) => ({ ...p, name: p.name.trim() })).filter((p) => p.name);
    if (!clean.length) return;
    animateListChange(reducedMotion);
    // SEEDED FROM LAST TIME. A lift you have done before arrives with its last
    // session's sets already queued and their numbers filled IN — chalk, not a
    // grey placeholder zero — so logging set one is a single tap instead of a
    // tap, a keyboard, a number and a dismissal. The default is the answer;
    // it is also, unlike a 0, a true statement about your training.
    setExercises((xs) => [
      ...xs,
      ...clean.map((p) => seedFromLast(newExercise(p.name, p.kind), lastByLift.get(p.name))),
    ]);
    setPickerOpen(false);
  };
  const removeExercise = (u: string) => {
    animateListChange(reducedMotion);
    setExercises((xs) => xs.filter((x) => x.uid !== u));
  };
  // Reorder — driven ONLY from the exercise sheet's Order block (hold a lift and
  // drag it). The cards on the logger itself carry no handle: see the note by
  // the drag comment above.
  const moveExerciseTo = (from: number, to: number) => setExercises((xs) => moveItemTo(xs, from, to));
  const rename = (u: string, name: string) =>
    setExercises((xs) =>
      xs.map((x) => {
        if (x.uid !== u) return x;
        if (x.kind === "cardio" && x.distance.trim()) {
          // A timed sport (tennis, judo, …) hides the distance field — drop the
          // value so it can't be saved as a phantom distance/pace.
          if (timedSportOnly(name)) return { ...x, name, distance: "" };
          // Otherwise the distance string is held in the OLD sport's unit; if the
          // new sport uses a different unit, re-express it so the real-world
          // distance (km) is preserved instead of changing 1000× on save.
          if (sportDistanceUnit(x.name) !== sportDistanceUnit(name)) {
            const km = parseSportDistance(x.distance, x.name);
            return { ...x, name, distance: km != null ? displaySportDistance(km, name) : x.distance };
          }
        }
        return { ...x, name };
      }),
    );
  /** Which bounds a SET field is judged against — the load and rep ceilings read
   *  the exercise itself, since 120 is ordinary on a barbell and impossible on a
   *  kettlebell, and the rep field holds seconds for a hold and metres for a
   *  carry. A field with no numeric meaning gets none. */
  const setFieldBounds = (name: string, k: keyof WSet): Bounds | null => {
    if (k === "load") return loadBounds(name);
    if (k === "reps") return repsBounds(name);
    if (k === "rpe") return RPE_BOUNDS;
    // The live logger captures mean velocity only; the stored shape carries a
    // peak too (VBT sensors report both) and the editor may yet write it.
    if (k === "vel") return VELOCITY_BOUNDS;
    return null;
  };

  const setSetField = (u: string, i: number, k: keyof WSet, v: string | boolean) =>
    setExercises((xs) =>
      xs.map((x) => {
        if (x.uid !== u) return x;
        // The load field is entered in the athlete's unit and stored in kg by
        // the caller, so what arrives here is already the stored figure and is
        // judged against the stored bound. The MESSAGE still has to speak the
        // athlete's unit, or a lb user is told "max 1500 kg" about a field
        // showing pounds.
        if (typeof v === "string") {
          const bounds = setFieldBounds(x.name, k);
          // The load arrives already converted to kg by the caller, so it is
          // judged against the stored bound — but the MESSAGE has to speak the
          // athlete's own unit, or a lb user is told "max 1500 kg" about a
          // field showing pounds.
          const lb = k === "load" && prefs.units === "lb";
          const shown = lb ? displayLoad(v, "lb") : v;
          const opts = lb && bounds ? { max: Math.floor(kgToUnit(bounds.max, "lb")), unit: "lb" } : undefined;
          if (!allowFieldValue(t, shown, bounds, opts)) return x;
        }
        return { ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, [k]: v } : s)) };
      }),
    );

  const condField = (u: string, k: "minutes" | "rpe" | "distance" | "incline" | "stroke" | "elevation" | "zone", v: string) =>
    setExercises((xs) =>
      xs.map((x) => {
        if (x.uid !== u) return x;
        // DISTANCE IS ENTERED IN THE SPORT'S OWN UNIT — metres for a pool swim,
        // kilometres on the road — so "5200" in a swim field is 5.2 km and is
        // perfectly legal, while the same digits in a run field are a unit slip.
        // Judging the raw string against a km bound would refuse the pool and
        // wave through the road, which is exactly backwards.
        if (k === "distance") {
          const km = parseSportDistance(v, x.name);
          const b = distanceBounds(cardioDiscipline(x.name));
          const unit = sportDistanceUnit(x.name);
          const inUnit = unit === "m" ? { max: Math.round(b.max * 1000), unit } : undefined;
          // Judged in the field's OWN unit: the value shown is metres for a pool
          // swim and kilometres on the road, and comparing the raw string to a
          // km bound would refuse the pool and wave through the road.
          if (km != null && !allowFieldValue(t, unit === "m" ? String(km * 1000) : String(km), b, inUnit)) return x;
          return { ...x, [k]: v };
        }
        const bounds =
          k === "minutes" ? MINUTES_BOUNDS
          : k === "rpe" ? RPE_BOUNDS
          : k === "incline" ? INCLINE_BOUNDS
          : k === "elevation" ? ELEVATION_BOUNDS
          : k === "zone" ? ZONE_BOUNDS
          : null;
        if (!allowFieldValue(t, v, bounds)) return x;
        return { ...x, [k]: v };
      }),
    );
  // Quick +/- the last set's load by the chosen increment (in display units).
  const bumpLastLoad = (u: string, deltaDisplay: number) =>
    setExercises((xs) =>
      xs.map((x) => {
        if (x.uid !== u || !x.sets.length) return x;
        const i = x.sets.length - 1;
        const curKg = parseFloat(x.sets[i]!.load) || 0;
        const nextDisplay = Math.max(0, kgToUnit(curKg, prefs.units) + deltaDisplay);
        const nextKg = String(Math.round(unitToKg(nextDisplay, prefs.units) * 100) / 100);
        return { ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, load: nextKg } : s)) };
      }),
    );
  /**
   * THE ONE DOOR every change to a SET LIST goes through — and it animates.
   *
   * This is a door rather than a habit because the habit had already failed.
   * `animateListChange` sat on the EXERCISE mutations (add, remove, reorder) and
   * on exactly one of the set mutations — plain "Add set" — while six others
   * teleported: the presets rail replacing a whole queue, all three special-set
   * adders, the auto warm-up ramp, and, worst of all, BANKING A SET. Banking is
   * the most-repeated interaction in the app and by far the biggest layout
   * change on the screen (a hero block the height of four rows is replaced by a
   * one-line ledger row, while the next set's hero opens below it) — and it was
   * the one moment with no motion at all. Nothing about a scattered call before
   * each `setExercises` makes the next one added remember, so the reminder is
   * now the only route in.
   *
   * NOT everything that writes a set belongs here, and the exclusions are the
   * point: `setSetField` runs per KEYSTROKE and `bumpLoad` per tap — a value
   * changing inside a row that stays put is not a layout change, and animating
   * it would spring the card on every digit. `removeSet` stays out too, because
   * its only caller is a SwipeRow and closing the gap after a swipe belongs to
   * the gesture that opened it.
   */
  const commitSets = (u: string, fn: (sets: WSet[]) => WSet[]) => {
    animateListChange(reducedMotion);
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, sets: fn(x.sets) } : x)));
  };
  const addSet = (u: string) =>
    commitSets(u, (sets) => [...sets, emptySet(prefs.carryOver ? sets[sets.length - 1] : undefined)]);
  // Popular preset schemes (⋯ menu) — lay out the whole exercise's working sets
  // in one tap. Each rep count is a SINGLE number (project rule), carrying the
  // current load. Banked sets are kept; the un-banked plan is replaced.
  const applyPreset = (u: string, count: number, reps: number) =>
    commitSets(u, (sets) => {
      const done = sets.filter((s) => s.done);
      const load = [...sets].reverse().find((s) => s.load)?.load ?? "";
      const work: WSet[] = Array.from({ length: count }, () => ({ uid: uid(), load, reps: String(reps), rpe: "", done: false }));
      return [...done, ...work];
    });
  // A drop set is a lighter continuation of the previous set (no rest), added pre-flagged.
  const addDropSet = (u: string) =>
    commitSets(u, (sets) => [...sets, { ...emptySet(), drop: true }]);
  // A warm-up ramp set — excluded from working volume/PRs, kept for the velocity profile.
  const addWarmupSet = (u: string) =>
    commitSets(u, (sets) => [...sets, { ...emptySet(), role: "warmup" as SetRole }]);
  // A cool-down set — light back-off work, excluded from working volume/PRs like a warm-up.
  const addCooldownSet = (u: string) =>
    commitSets(u, (sets) => [...sets, { ...emptySet(), role: "cooldown" as SetRole }]);
  // Auto warm-up ramp: prepend ~40/60/80% sets up to the heaviest working load.
  const addWarmupRamp = (u: string) =>
    commitSets(u, (sets) => {
      const workingMax = Math.max(
        0,
        ...sets.filter((s) => s.role !== "warmup" && s.role !== "cooldown").map((s) => parseFloat(s.load)).filter((n) => Number.isFinite(n)),
      );
      const ramp = warmupRamp(workingMax);
      if (!ramp.length) return sets;
      const rampSets: WSet[] = ramp.map((step) => ({ uid: uid(), load: String(step.load), reps: String(step.reps), rpe: "", done: false, role: "warmup" }));
      return [...rampSets, ...sets];
    });
  // The set's type, CHOSEN rather than cycled — the control behind it is a
  // picker now, so tapping four times to reach the fourth state is over.
  const setTypeTo = (u: string, i: number, type: SetType) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.map((s, j) => (j === i ? setTypeToSet(s, type) : s)) } : x)),
    );
  // The rest of "what kind of set" — the rows that follow the type picker in
  // the same menu, so warm-ups, ramps, drops and the rep schemes are all
  // answers to one question in one place instead of a ⚡ tile and a ⋯ zone.
  const runSetExtra = (u: string, key: string) => {
    if (key === "warmup") return addWarmupSet(u);
    if (key === "ramp") return addWarmupRamp(u);
    if (key === "cooldown") return addCooldownSet(u);
    if (key === "drop") return addDropSet(u);
    const scheme = SET_SCHEMES.find((p) => p.key === key);
    if (scheme) applyPreset(u, scheme.sets, scheme.reps);
  };
  // Superset: group this exercise with the one directly above it (A1/A2/A3…).
  // Joining puts a ⛓ A1/A2 badge into the card header and swaps the control's
  // label, which reflows the lift's name beside it — small, but a layout change
  // the user asked for, so it travels like the rest.
  const supersetWithPrev = (u: string) => {
    animateListChange(reducedMotion);
    setExercises((xs) => toggleSuperset(xs, xs.findIndex((x) => x.uid === u), uid));
  };
  // No animateListChange here: the only caller is a SwipeRow, and closing the
  // gap after a swipe-delete belongs to SwipeRow itself now.
  const removeSet = (u: string, i: number) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.filter((_, j) => j !== i) } : x)));
  const toggleDone = (u: string, i: number, val: boolean) => {
    // Banking a set also records the rest that preceded it — the gap since the
    // last set was banked (the live timer) is saved on the set as real data.
    const restTaken = val && restSince != null ? Math.floor((Date.now() - restSince) / 1000) : undefined;
    // Through commitSets, so the collapse TRAVELS. Banking swaps a hero block
    // for a one-line row and opens the next set's hero underneath — the largest
    // layout change the screen makes, and until now the only one that happened
    // between two frames with nothing in between. Re-opening a banked row is the
    // same change played backwards and gets the same motion.
    commitSets(u, (sets) =>
      // Un-ticking clears the recorded rest too, so a stale value can't
      // persist if you re-do the set without the timer running.
      sets.map((s, j) => (j === i ? { ...s, done: val, rest: val ? restTaken : undefined } : s)),
    );
    if (!val) return;
    if (showTip) dismissTip(); // first banked set — the guide has done its job
    // SOFT, not light (§15's map asks for it by name): banking a set is a soft
    // landing, not a button click. It is the most-repeated haptic in the app —
    // dozens per session — and the one that most decides what the app feels
    // like in the hand.
    haptic.soft();
    // No rest when this set flows straight into a drop set, or into the next
    // exercise of a superset — you keep moving; the rest comes after the
    // sequence (banking the last drop / the last superset exercise).
    const ex = exercises.find((x) => x.uid === u);
    // Auto-advance: banking the last set appends a fresh one so you can keep going.
    if (prefs.autoAdvance && ex && i === ex.sets.length - 1) addSet(u);
    const nextIsDrop = !!ex?.sets[i + 1]?.drop;
    let midSuperset = false;
    if (ex?.group) {
      const members = exercises.filter((x) => x.group === ex.group);
      midSuperset = members[members.length - 1]?.uid !== ex.uid;
    }
    if (nextIsDrop || midSuperset || !prefs.restTimer) {
      stopRest(); // suppress any lingering rest banner (or timer disabled)
      return;
    }
    setRestSince(Date.now());
    setRestNow(0);
    restFired.current = false;
  };

  const pickRest = (sec: number) => {
    setRestTarget((cur) => (cur === sec ? null : sec));
    restFired.current = false;
  };
  // Pause/resume the workout: on resume, shift the clock (and any running rest)
  // forward by the held duration so neither jumps when the timer wakes back up.
  const togglePause = () => {
    if (paused) {
      const held = Date.now() - pausedAt.current;
      startedAt.current = new Date(startedAt.current.getTime() + held);
      if (restSince != null) setRestSince(restSince + held);
      setPaused(false);
    } else {
      pausedAt.current = Date.now();
      setPaused(true);
    }
    haptic.selection();
  };

  const buildBlocks = (): SessionBlock[] => {
    const blocks: SessionBlock[] = [];
    for (const x of exercises) {
      if (x.kind === "cardio") {
        const minutes = parseFloat(x.minutes);
        // The editor holds distance in the sport's unit (metres for swimming /
        // rowing); convert to the stored km here so the math stays single-unit.
        const distance = parseSportDistance(x.distance, x.name);
        if (!Number.isFinite(minutes) && distance == null) continue;
        // `?? ""` guards: a resumed pre-upgrade draft deserializes without the
        // new extras fields.
        const incline = parseFloat(x.incline ?? "");
        const elevation = parseFloat(x.elevation ?? "");
        const zone = parseFloat(x.zone ?? "");
        const stroke = (x.stroke ?? "").trim();
        blocks.push({
          kind: "cardio",
          name: x.name,
          ...(distance != null ? { distance } : {}),
          ...(Number.isFinite(minutes) ? { minutes } : {}),
          ...(Number.isFinite(incline) ? { incline } : {}),
          ...(stroke ? { stroke } : {}),
          ...(Number.isFinite(elevation) ? { elevation } : {}),
          ...(Number.isFinite(zone) ? { zone } : {}),
        });
      } else if (x.kind === "conditioning") {
        const minutes = parseFloat(x.minutes);
        if (!Number.isFinite(minutes)) continue;
        blocks.push({
          kind: "conditioning",
          name: x.name,
          ...(Number.isFinite(minutes) ? { minutes } : {}),
        });
      } else {
        const sets = x.sets
          .filter((s) => s.reps.trim() || s.load.trim())
          .map((s) => ({
            load: s.load.trim(),
            reps: s.reps.trim(),
            ...(s.rpe.trim() ? { rpe: s.rpe.trim() } : {}),
            ...(s.vel?.trim() ? { vel: s.vel.trim() } : {}),
            ...(s.drop ? { drop: true } : {}),
            ...(s.role ? { role: s.role } : {}),
            ...(s.rest != null ? { rest: s.rest } : {}),
          }));
        if (sets.length) blocks.push({ kind: "strength", name: x.name, sets, ...(x.group ? { group: x.group } : {}) });
      }
    }
    return blocks;
  };

  // Live in-session scoreboard — running exercises / sets / volume / PRs off the
  // shared core helper (same numbers the finish summary + share card show).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const live = useMemo(() => liveSessionStats(buildBlocks(), prior.current, { bodyweightKg }), [exercises, bodyweightKg]);
  // Which LIFTS are records so far — the per-lift half of `live.prs`, for the
  // PR badge on the matching exercise card (and the finish flight it seeds).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const prLifts = useMemo(() => livePrLifts(buildBlocks(), prior.current, { bodyweightKg }), [exercises, bodyweightKg]);
  // The badge nodes by lift, so finish() can arm the record's badge as the
  // source of the prBadge flight into the summary's trophy chip.
  const prBadgeRefs = useRef<Record<string, View | null>>({});
  const armPrBadge = useSharedSurfaceSource();

  // Nudge to set a bodyweight when the session has a bodyweight lift (dips,
  // pull-ups…) and none is on file — otherwise its tonnage reads 0.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const needsBw = useMemo(() => needsBodyweight(buildBlocks(), bodyweightKg), [exercises, bodyweightKg]);

  const finish = async () => {
    const blocks = buildBlocks();
    if (!blocks.length) {
      setError(t("workout.minSet"));
      AccessibilityInfo.announceForAccessibility(t("workout.minSet"));
      return;
    }
    setSaving(true);
    setError("");
    const now = new Date();
    const payload: NewSession = {
      title: title.trim() || "Workout",
      readiness,
      startedAt: startedAt.current.toISOString(),
      completedAt: now.toISOString(),
      blocks,
    };

    let pending = false;
    let sessionId: string | null = null;
    if (guest) {
      // No account yet — keep it on the device until they sign up.
      await saveGuestSession(payload);
    } else {
      sessionId = await createSession(payload);
      if (!sessionId) {
        // Offline / server hiccup — never lose the workout. Stash it locally;
        // it syncs on the next foreground / sign-in (see lib/guest + session).
        await saveGuestSession(payload);
        pending = true;
      } else {
        // Revalidate the shared sessions cache so Home/History + every
        // session-derived screen reflects the new workout without a manual refresh.
        revalidate.sessions();
      }
    }
    await clearDraft();

    // The recovery read has a clock, and until now nothing carried it to a
    // pocketed phone. Schedule it against THIS session's end — six hours out,
    // moved into waking hours — so the second ask arrives on the day rather
    // than waiting for a fixed 07:00 nudge with no relation to when you
    // trained. Guests included: the read is local either way, and a guest who
    // signs up later keeps the habit. See lib/recovery-reminder.ts.
    void scheduleRecoveryReminder({
      sessionEnd: payload.completedAt,
      sessionId,
      title: payload.title,
      lang,
    });

    setSaving(false);
    const sets = blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);

    // PRs: compare this session against everything done before it.
    const finished: LoggedSession = {
      id: "new",
      title: payload.title,
      startedAt: payload.startedAt!,
      completedAt: payload.completedAt,
      blocks,
    };
    const prs = newPrsInSession(finished, prior.current, bw);
    const cardioPrs = newCardioPrsInSession(finished, prior.current);
    const prSet = new Set(prs.map((p) => p.lift));
    // Per-lift bests = the HEAVIEST weight actually moved (#231), never an e1RM.
    const bestMap = new Map<string, number>();
    for (const b of blocks)
      if (b.kind === "strength") {
        const w = blockTopLoad(b, bodyweightKg);
        if (w > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, w));
      }
    const bests: ShareBest[] = [...bestMap.entries()]
      .map(([name, weight]) => ({ name, weight, pr: prSet.has(name) }))
      .sort((a, b) => b.weight - a.weight);

    // The record lift's badge flies into the summary's trophy chip
    // (SHARED_ELEMENTS.prBadge). Armed HERE, after the awaited save and
    // immediately before the phase swap — the arm has a 1.2s TTL, and a save
    // round-trip from the finish tap can outlive it. prs[0] is the heaviest
    // record, the same one the celebration headlines.
    if (prs.length > 0) {
      const lift = prs[0]!.lift;
      armPrBadge(SHARED_ELEMENTS.prBadge, prBadgeRefs.current[lift] ?? null, (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, flex: 1, backgroundColor: withAlpha(C.lime, ALPHA.solid), borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill }}>
          <AuroraIcon name="trophy" size={11} color={txt(C, C.lime)} />
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>PR</Text>
        </View>
      ));
    }
    setSummary({
      sessionId,
      title: payload.title,
      startedAt: startedAt.current.toISOString(),
      // main's source, not `now`: the payload's own end stamp is what the feel
      // prompt's lag is measured from, so the two must be the same instant.
      completedAt: payload.completedAt!,
      blocks,
      volume: sessionVolume(blocks, false, bodyweightKg),
      sets,
      minutes: Math.max(1, Math.round((now.getTime() - startedAt.current.getTime()) / 60000)),
      guest,
      pending,
      firstEver: prior.current.length === 0,
      bests,
      prs,
      cardioPrs,
    });
    setPhase("done");
  };

  // "Last time" reference per lift — computed once from history (which is fixed
  // for the session), not re-sorted on every per-second timer re-render.
  // Must stay ABOVE the early return below — hooks can't run conditionally.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const lastByLift = useMemo(() => lastStrengthByLift(prior.current), [restored]);
  // Same reason, and it was NOT above the return: finishing a session dropped
  // this hook from the render and blew up the summary handoff.
  const insets = useSafeAreaInsets();

  if (phase === "done" && summary) return <Summary summary={summary} prior={prior.current} router={router} t={t} units={prefs.units} haptics={prefs.haptics} />;

  const ssLabels = supersetLabels(exercises);

  // ── THE DOCK ────────────────────────────────────────────────────────────
  // The primary used to live inside each set, so it never had to be told which
  // set it meant. One button at the bottom of the screen does: the shared
  // cursor resolves the session's ONE active set, and everything the dock says
  // — the label, the count, what happens after — reads off it.
  const cursor = nextSetCursor(exercises.map((x) => ({ sets: x.kind === "strength" ? x.sets : undefined })));
  const cursorEx = cursor ? exercises[cursor.index] : undefined;
  const cursorName = cursorEx?.name ?? exercises[0]?.name ?? "";
  const cursorSet = cursorEx?.kind === "strength" ? cursorEx.sets[cursor!.setIndex] : undefined;
  const cursorTotal = cursorEx?.kind === "strength" ? cursorEx.sets.length : 0;
  const canLog = !!cursorSet && setIsLoggable(cursorSet);
  const queued = queuedSetCount(exercises.map((x) => ({ sets: x.kind === "strength" ? x.sets : undefined })));
  // THE LOGGER IS A COVER, so it stands in the WINDOW's insets — a native
  // SafeAreaView inside a fullScreenModal never applies its top edge, which is
  // how the header came to sit on the status bar. See lib/layout coverInsets.
  const safe = coverInsets(insets);
  // The dock sits ON the bottom edge, so the home-indicator inset is the FLOOR
  // of its pad, never an addition to it — the same arithmetic a sheet uses.
  const dockPad = Math.max(safe.bottom, 12);

  // The rest timer's readout: the live countdown while one is running, the
  // armed duration otherwise. One piece of state, and the capsule is a clock
  // when there is a clock to show and a switch the rest of the time.
  const restLeft = restSince != null && restTarget != null ? restTarget - restNow : null;
  const restReadout =
    restLeft != null ? (restLeft > 0 ? mmss(restLeft) : `+${mmss(-restLeft)}`) : mmss(prefs.restSeconds);
  const toggleRestArmed = () => {
    const next = !prefs.restTimer;
    haptic.light();
    setLoggerPref("restTimer", next);
    if (!next) stopRest();
  };
  const pickRestPref = (v: string) => {
    if (v === "off") { setLoggerPref("restTimer", false); stopRest(); return; }
    setLoggerPref("restTimer", true);
    setLoggerPref("restSeconds", Number(v));
  };
  // Bank the session's active set — what the docked primary does.
  const logActiveSet = () => {
    if (!cursor || !cursorEx || !canLog) return;
    toggleDone(cursorEx.uid, cursor.setIndex, true);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      {/* Aurora's ambient blob field behind the logger — the live screen owns its
          own shell (sticky timer header), so it drops in the same backdrop the
          rest of the Aurora app uses rather than wrapping in AuroraScreen.

          OUTSIDE the padded box on purpose: the field is `absoluteFill`, and an
          absolute child is laid out inside its parent's PADDING box, so putting
          it under the safe-area pad would stop the wash at the status bar and
          draw a seam across the top of the screen. */}
      <AuroraField />
      {/* The safe-area pad is the SCREEN's, applied here rather than by a native
          SafeAreaView — see `safe` above. */}
      <View style={{ flex: 1, paddingTop: safe.top }}>
      {/* THE HEADER stands where every other screen's nav rail stands: HERO.rail
          measured from the safe area — a 44pt row, 4pt below the inset and 8pt
          of breathing under it (the collapsed bar's own height) — and the
          screen's own GUTTER at the sides, so the chevron sits on the same
          column as the cards below it. A cover has no HeroNav to inherit that
          constant from, so it keeps it by hand; the alternative is a header
          measured on its own, a few points in from and above every back circle
          in the app, on the screen an athlete looks at most. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: HERO.rail.top + HERO.rail.height + HERO.rail.bottom, paddingHorizontal: GUTTER, paddingTop: HERO.rail.top, paddingBottom: HERO.rail.bottom, borderBottomWidth: 1, borderBottomColor: C.line }}>
        {/* MINIMIZE — a chevron pointing DOWN, at where the session goes: the
            accessory strip above the tab bar. The direction is the affordance,
            and it is the same direction as the drag that will eventually do the
            same job. The flanks both take flex:1 so the clock stays optically
            centred whatever the side content measures. */}
        <View style={{ flex: 1, alignItems: "flex-start" }}>
          {/* IT IS HeroNav — the app's one navigation control, not a copy of it.
              The old comment here claimed "the same control family as HeroNav's
              back circle" while drawing 34pt at chalk-6% against HeroNav's 40pt
              in a 44pt hit box at HERO.alpha.navFill: the claim was in the
              prose and nowhere in the numbers, on the button that leaves the
              most-used screen in the app. `takeover` is what the logger IS — a
              cover — and it is what turns the mark into the chevron-down that
              points at where the session goes; the label override is because
              this one MINIMIZES (the session keeps running in the tab bar's
              accessory strip) where every other dismiss closes. */}
          <HeroNav
            onPress={minimize}
            label={t("workout.minimize")}
            mode="takeover"
            onDark={scheme === "dark"}
          />
        </View>
        {/* WHERE YOU ARE, then how long you have been there. The clock used to
            be the largest type on the screen — 22pt black, centred — which is
            the wrong claim: the set is the content, the clock is context. It
            reads small and mono now, and goes amber when held. */}
        <View style={{ alignItems: "center" }}>
          {cursorName ? (
            <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk, maxWidth: 160 }}>{cursorName}</Text>
          ) : null}
          <Text style={{ fontFamily: F.mono, fontSize: cursorName ? fs.micro : fs.body, color: paused ? txt(C, C.amber) : C.ash, letterSpacing: tracking(cursorName ? fs.micro : fs.body, "caps") }}>
            {mmss(elapsed)}{paused ? ` – ${t("workout.paused").toUpperCase()}` : ""}
          </Text>
        </View>
        {/* THE TOOLBAR CAPSULE — the rest timer and the way in to everything
            that must not be one tap, fused into one lozenge of glass. The
            timer keeps its own tap because you arm it mid-workout; its
            DURATION is a preference, so it sits one level in, in the menu
            beside it. Finish is not here any more: it lives in the dock with
            Pause, where the thumb is. */}
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "flex-end" }}>
          {LIQUID_GLASS_RENDERED ? (
            <GlassToolbarGroup
              // ONE mark, `timer` — SF Symbols 7 has no `timer.slash`, and two
              // different drawings for one control would read as two controls.
              // The state is carried by colour and, for anyone not reading
              // colour, by the accessibility label naming the value.
              toggleGlyph="timer"
              toggleReadout={prefs.restTimer ? restReadout : undefined}
              toggleColor={prefs.restTimer ? txt(C, C.blue) : C.ash}
              toggleLabel={`${t("workout.armRest")} – ${prefs.restTimer ? restReadout : t("common.off")}`}
              onToggle={toggleRestArmed}
              menuLabel={t("workout.sessionOptions")}
              options={REST_OPTIONS.map((o) => ({ id: o.id, label: o.id === "off" ? t("common.off") : o.label }))}
              value={prefs.restTimer ? String(prefs.restSeconds) : "off"}
              onPick={pickRestPref}
              actions={[
                { key: "rpe", label: t("w.train.blocks.whatsRpe") },
                { key: "discard", label: t("workout.discardSession"), destructive: true },
              ]}
              onAction={(k) => (k === "rpe" ? setRpeHelp(true) : discard())}
              glyphColor={C.ash}
              fontFamily={F.mono}
            />
          ) : (
            /* The capsule's floor wears the SATELLITE rim — it is the same
               material as the buttons in the dock, so it is the same fill and
               the same ring, not a third pair of alphas. */
            <View style={{ flexDirection: "row", alignItems: "center", gap: 2, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: withAlpha(C.chalk, SATELLITE.alpha.stroke), backgroundColor: withAlpha(C.chalk, SATELLITE.alpha.fill), padding: 3 }}>
              <Pressable
                onPress={toggleRestArmed}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityState={{ selected: prefs.restTimer }}
                accessibilityLabel={`${t("workout.armRest")} – ${prefs.restTimer ? restReadout : t("common.off")}`}
                style={{ flexDirection: "row", alignItems: "center", gap: 5, height: 28, paddingHorizontal: 10, borderRadius: RADIUS.pill }}
              >
                <AuroraIcon name="stopwatch" size={13} color={prefs.restTimer ? txt(C, C.blue) : C.ash} />
                {prefs.restTimer ? (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.blue) }}>{restReadout}</Text>
                ) : null}
              </Pressable>
              <Pressable
                onPress={() => setMenuOpen(true)}
                hitSlop={6}
                accessibilityRole="button"
                accessibilityLabel={t("workout.sessionOptions")}
                style={{ height: 28, paddingHorizontal: 10, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.pill }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash, letterSpacing: tracking(fs.subtitle, "label") }}>⋯</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      {/* The logger owns its shell (no AuroraScreen), so it applies both of the
          shell's paddings itself: 16 of vertical rhythm, the kit's GUTTER at
          the sides — web's logger renders inside main's 12px gutter, and this
          is the mobile half of that parity. */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingHorizontal: GUTTER, paddingBottom: space.huge }} keyboardShouldPersistTaps="handled">
        {/* No session-title input — the workout auto-titles itself; a name is
            only entered on the summary (Save as routine / optional rename).

            The meta row that used to sit here — an exercise count, a permanent
            "tap ✓ as you go", the rest-timer chip and a standing "What's RPE?"
            link — is gone. The count restated the cards below it, the
            instruction is what the dismissible tip card is for, and the two
            controls moved into the header capsule where they cannot scroll
            away mid-workout. What is left is the one line that is genuinely a
            state: no exercises yet. */}
        {exercises.length === 0 && (
          <Mono style={{ marginBottom: 16 }}>{t("workout.firstExercise")}</Mono>
        )}

        {/* Live in-session scoreboard — appears once the first set is logged. */}
        {live.sets > 0 && (
          <View style={{ flexDirection: "row", gap: space.sm, marginBottom: 16 }}>
            <LiveStat C={C} label={t("w.train.logger.liveExercises")} value={String(live.exercises)} />
            <LiveStat C={C} label={t("live.sets")} value={String(live.sets)} />
            <LiveStat C={C} label={t("w.train.logger.liveVolume")} value={fmtTonnage(live.volume, prefs.units)} />
            {/* The PR cell is a CELL, not a fourth drawing: same component, an
                accent and a mark. It shipped hand-rolled beside its three
                siblings, which is how it came to be the only one whose figure
                did not roll as the count changed. */}
            {live.prs + live.cardioPrs > 0 && (
              <LiveStat
                C={C}
                accent={txt(C, C.lime)}
                mark="trophy"
                label={live.prs + live.cardioPrs === 1 ? t("live.pr") : t("live.prs")}
                value={String(live.prs + live.cardioPrs)}
              />
            )}
          </View>
        )}

        {/* Bodyweight nudge — a bodyweight lift is on the board but no weight is
            on file, so its tonnage would read 0. Set it inline; the live volume
            recomputes and the card self-dismisses. */}
        {needsBw && <BodyweightNudge C={C} t={t} units={prefs.units} />}

        {showTip && (
          <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 16, marginBottom: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("workout.tipTitle")}</Text>
              <Pressable onPress={dismissTip} hitSlop={8}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{t("workout.tipGot")}</Text>
              </Pressable>
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: leading(fs.body) }}>{t("workout.tipBody")}</Text>
          </View>
        )}

        {restSince != null && (() => {
          // Countdown: show the time LEFT against the target, ticking to zero;
          // once reached it flips to "Rest done" and shows how long you've gone
          // over. With no target it falls back to a plain elapsed stopwatch.
          const remaining = restTarget != null ? restTarget - restNow : null;
          const done = remaining != null && remaining <= 0;
          const accent = done ? C.lime : C.blue;
          // The CLOCK is the one figure on this screen that changes while you
          // watch it, so it rolls rather than swapping — its digits are split
          // out of the label for that reason (the words around them never move).
          const clock = restTarget == null ? mmss(restNow) : done ? `+${mmss(restNow - restTarget)}` : mmss(remaining!);
          return (
            <View style={{ backgroundColor: withAlpha(accent, ALPHA.wash), borderWidth: 1, borderColor: withAlpha(accent, ALPHA.edge), borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, accent) }}>
                    {done ? t("workout.restDone") : t("workout.resting")} –{" "}
                  </Text>
                  <RollingNumber value={clock} style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, accent) }} />
                  {restTarget != null && !done ? (
                    <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, accent) }}> {t("workout.restLeft")}</Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={stopRest}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: RADIUS.field, borderWidth: 1, borderColor: accent }}
                >
                  <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: txt(C, accent) }}>■ {t("workout.stopRest")}</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: space.xs, marginTop: 10 }}>
                {[60, 90, 120, 180].map((sec) => {
                  const on = restTarget === sec;
                  return (
                    <Pressable
                      key={sec}
                      onPress={() => pickRest(sec)}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: RADIUS.field, borderWidth: 1, borderColor: on ? C.blue : C.line, backgroundColor: on ? withAlpha(C.blue, ALPHA.fill) : "transparent" }}
                    >
                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: on ? txt(C, C.blue) : C.ash }}>{sec < 120 ? `${sec}s` : `${sec / 60}m`}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {exercises.map((x, xi) => {
          return (
          <View key={x.uid}>
          {/* Press-and-hold anywhere on a strength card opens its exercise
              sheet (user-picked entry, review round 3). A bare long-press
              wrapper: taps still fall through to the card's own controls, and
              interactive children (inputs, buttons) own their touches. */}
          <Pressable
            onLongPress={x.kind === "strength" ? () => {
              haptic.medium();
              setSheetUid(x.uid);
            } : undefined}
            delayLongPress={400}
          >
          <ACard style={cardStack}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 10 }}>
              {/* The lift's SQUARE avatar (shared — exercise-media): it carries
                  both what the old mono "STRENGTH" word said and the gear the
                  lift takes, and becomes the hand-drawn demo once that lift is
                  drawn. Square because a lift is a thing; a PERSON's avatar is
                  the circle (social-kit `Avatar`).

                  Ash, not the modality tint. On a LIST that mixes kinds the
                  tint is doing real work; here every card is the exercise you
                  are doing and the fields below already say which kind it is —
                  so it was just spending the accent. Chartreuse appears once on
                  this screen, on Log set. */}
              <AuroraExerciseAvatar name={x.name} size={36} glyph={20} tint={C.ash} label={x.kind} />
              {ssLabels[xi] && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 5, paddingVertical: 1 }}>
                  <Glyph name="link" size={fs.micro} color={C.chalk} />
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.chalk }}>{ssLabels[xi]}</Text>
                </View>
              )}
              <TextInput value={x.name} onChangeText={(v) => rename(x.uid, v)} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }} />
              {prLifts.includes(x.name) && (
                // A record was set on this lift THIS session — the badge
                // appears the moment the record set banks, and flies into the
                // finish summary's trophy chip when the workout ends
                // (SHARED_ELEMENTS.prBadge; finish() arms this node).
                <View ref={(r) => { prBadgeRefs.current[x.name] = r; }} collapsable={false} style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: withAlpha(C.lime, ALPHA.solid), borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <AuroraIcon name="trophy" size={11} color={txt(C, C.lime)} />
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>PR</Text>
                </View>
              )}
              {/* Superset with the exercise BELOW — placed on the upper card so
                  even the FIRST exercise can start a superset (no rest between). */}
              {x.kind === "strength" && exercises[xi + 1]?.kind === "strength" && (() => {
                const joined = isSupersettedWithPrev(exercises, xi + 1);
                const nextUid = exercises[xi + 1]!.uid;
                return (
                  <Pressable
                    onPress={() => supersetWithPrev(nextUid)}
                    hitSlop={6}
                    style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.field, borderWidth: 1, borderColor: joined ? withAlpha(C.chalk, ALPHA.rim) : C.line, backgroundColor: joined ? withAlpha(C.chalk, ALPHA.wash) : "transparent" }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <Glyph name="link" size={fs.micro} color={joined ? C.chalk : C.ash} />
                      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: joined ? C.chalk : C.ash }}>{joined ? t("w.train.blocks.joined") : t("workout.superset")}</Text>
                    </View>
                  </Pressable>
                );
              })()}
              <Pressable onPress={() => removeExercise(x.uid)} hitSlop={14}>
                <Text style={{ color: C.ash, fontSize: fs.bodyLg }}>✕</Text>
              </Pressable>
            </View>

            {x.kind === "strength" ? (
              <>
                {(() => {
                  // "Last time" reference — the most recent prior session's sets
                  // for this lift, so progressive overload has a target to beat.
                  const last = lastByLift.get(x.name);
                  return last ? (
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginBottom: 8 }}>
                      {t("workout.lastTime")} – {blockSummary(last)}
                    </Text>
                  ) : null;
                })()}
                {/* A bilateral dumbbell lift takes ONE dumbbell's weight;
                    tonnage counts both bells. Guide the athlete so the doubled
                    volume reads (parity with the Builder + web logger). */}
                {loadUnitCount(x.name) === 2 && (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.blue), marginBottom: 8 }}>
                    {t("w.train.blocks.dbPerHint")}
                  </Text>
                )}
                {/* Concept 01 — Glass + ghost add. No set table: the ACTIVE set
                    (first un-banked) is a frosted lime HERO card — a big editable
                    weight, its rep target, one Log button. Banked + queued sets
                    collapse to quiet one-line rows (tap a banked one to re-open).
                    Shared focus model (setFocus/addSetIsNext); presentation only. */}
                {(() => {
                  const sp = exerciseProfile(x.name).strength;
                  const bw = sp?.loadMode === "bodyweight";
                  const unitLabel = prefs.units === "lb" ? "lb" : "kg";
                  const measureLabel = sp?.measure === "time" ? "s" : sp?.measure === "distance" ? "m" : "reps";
                  const total = x.sets.length;
                  const planned = !addSetIsNext(x.sets); // a queue sits below → show "of N"
                  // ONE SPELLING FOR BOTH FIGURES — they are the same field
                  // twice (load, then reps), and they had been two identical
                  // literals, which is how the load one gets a fix the reps
                  // one does not.
                  //
                  // `paddingRight` is not decoration and it is not a gap: it
                  // is the trailing kern `trackFigure` adds to the LAST digit
                  // and never draws, given back so the text field — which
                  // clips to its bounds, unlike a Text — stops shaving the
                  // right side off it. See `kernPad` in core's scale.ts.
                  const figureField = { fontFamily: F.takeover, fontSize: fs.stat, lineHeight: leading(fs.stat, "flush"), letterSpacing: trackFigure(fs.stat), color: C.chalk, padding: 0, paddingRight: kernPad(trackFigure(fs.stat)), textAlign: "center", minWidth: 44 } as const;
                  return x.sets.map((s, i) => {
                    const focus = setFocus(x.sets, i);
                    const st = setType(s);
                    // Improbable but storable — the athlete is asked, never stopped.
                    const concern = inspectSet(x.name, s.load, s.reps);
                    const odd = concern.verdict !== "ok";
                    const typeAccent = st === "warmup" ? C.amber : st === "cooldown" ? C.blue : st === "drop" ? C.lime : null;
                    return (
                      <View key={s.uid ?? i}>
                      <SwipeRow label={t("w.analyze.hist.delete")} onDelete={() => removeSet(x.uid, i)} background="transparent">
                        {focus === "active" ? (
                          // FLAT active section — no inner card (the exercise card
                          // is the one surface): the set you're on reads as focus
                          // by SCALE (big numbers) and breathing room, not by a
                          // second border/tint. De-greened: the only lime left in
                          // the loop is the Log CTA itself.
                          <View style={{ paddingVertical: 12 }}>
                            {/* Label row — kicker, planned-rest hint, then the
                                type badge on the right. */}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                              <Text style={ty(C, "overline")}>
                                {`${t("workout.setWord")} ${i + 1}${planned ? ` ${t("workout.ofWord")} ${total}` : ""} — ${t("workout.upNow")}`}
                              </Text>
                              <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 }}>
                                {prefs.restTimer && (
                                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>
                                    {t("w.train.blocks.rest")} {Math.floor(prefs.restSeconds / 60)}:{String(prefs.restSeconds % 60).padStart(2, "0")}
                                  </Text>
                                )}
                                {/* RPE — a quiet chip, not a permanent field. Tap to
                                    reveal the one-tap pill row below; the value rides
                                    on the chip once set. Hidden entirely in Simple mode. */}
                                {prefs.detailed && (() => {
                                  const rpeShown = rpeRirSwap(s.rpe, prefs.rpeAsRir);
                                  const set = !!rpeShown;
                                  return (
                                    <Pressable
                                      // The pill row is a DISCLOSURE, so opening
                                      // it grows the card and shifts everything
                                      // below — the same kind of layout change as
                                      // a set arriving, and it was popping in
                                      // fully formed with the rows beneath
                                      // teleporting down.
                                      onPress={() => { animateListChange(reducedMotion); setRpeOpenSet((u) => (u === s.uid ? null : s.uid)); }}
                                      hitSlop={6}
                                      style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: set ? withAlpha(C.amber, 0.5) : C.line, backgroundColor: set ? withAlpha(C.amber, ALPHA.fill) : "transparent" }}
                                    >
                                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: set ? txt(C, C.amber) : C.ash }}>{prefs.rpeAsRir ? "RIR" : "RPE"}</Text>
                                      <Text style={{ fontFamily: F.monoBold, fontSize: fs.nano, color: set ? txt(C, C.amber) : C.ash }}>{rpeShown || "–"}</Text>
                                    </Pressable>
                                  );
                                })()}
                                {/* WHAT KIND OF SET — one control, one question.
                                    It used to be three: a bare ＋ here that
                                    CYCLED the type (a bare plus means "grows in
                                    place" everywhere else in the kit), a bolt tile
                                    for warm-up / ramp / cool-down / drop, and a
                                    ⋯ zone for the rep schemes. On iOS 26 it is
                                    the system menu — the type as an inline
                                    picker with a checkmark on the one in force,
                                    then the rest as action rows; elsewhere it
                                    opens the one RN panel below. */}
                                {LIQUID_GLASS_RENDERED ? (
                                  <GlassSelectMenu
                                    label={typeAccent ? setTypeBadge(s, i) : t("workout.setTypeWorking").toUpperCase()}
                                    fontFamily={F.mono}
                                    fontSize={10}
                                    labelColor={typeAccent ? txt(C, typeAccent) : C.ash}
                                    a11yLabel={t("workout.setOptions")}
                                    options={SET_TYPE_OPTIONS.map((o) => ({ id: o.id, label: t(o.k) }))}
                                    value={st}
                                    onPick={(v) => setTypeTo(x.uid, i, v)}
                                    extras={SET_EXTRAS.map((e) => ({ key: e.key, label: t(e.k) }))}
                                    onExtra={(k) => runSetExtra(x.uid, k)}
                                  />
                                ) : (
                                  <Pressable
                                    // Same disclosure as the RPE pill row: the
                                    // panel opens INSIDE the card and pushes the
                                    // sets below it down, so it grows rather than
                                    // appearing over them.
                                    onPress={() => { animateListChange(reducedMotion); setSpecialUid((u) => (u === x.uid ? null : x.uid)); }}
                                    hitSlop={8}
                                    accessibilityRole="button"
                                    accessibilityLabel={t("workout.setOptions")}
                                    style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: RADIUS.field, borderWidth: typeAccent ? 1 : 0, borderColor: typeAccent ?? "transparent", backgroundColor: typeAccent ? withAlpha(typeAccent, ALPHA.fill) : "transparent" }}
                                  >
                                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: typeAccent ? txt(C, typeAccent) : C.ash }}>
                                      {typeAccent ? setTypeBadge(s, i) : t("workout.setTypeWorking").toUpperCase()}
                                    </Text>
                                    <AuroraIcon name="chevron-down" size={10} color={typeAccent ? txt(C, typeAccent) : C.ash} />
                                  </Pressable>
                                )}
                              </View>
                            </View>
                            {/* Numbers centred; weight & reps read at one size and
                                share a baseline so "kg" and "reps" sit level. Tapping
                                a unit focuses its input (via inputRefs). */}
                            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "center", flexWrap: "wrap" }}>
                              <Pressable style={{ flexDirection: "row", alignItems: "baseline", paddingHorizontal: 4 }} onPress={() => inputRefs.current[`${x.uid}:load`]?.focus()}>
                                <TextInput
                                  ref={(r) => { inputRefs.current[`${x.uid}:load`] = r; }}
                                  value={bw ? s.reps : displayLoad(s.load, prefs.units)}
                                  onChangeText={(v) => (bw ? setSetField(x.uid, i, "reps", v) : setSetField(x.uid, i, "load", storeLoad(v, prefs.units)))}
                                  keyboardType="numeric"
                                  placeholder="0"
                                  placeholderTextColor={C.ash}
                                  style={figureField}
                                />
                                <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash, marginLeft: 5 }}>{bw ? measureLabel : unitLabel}</Text>
                              </Pressable>
                              {!bw && (
                                <>
                                  <Text style={{ fontFamily: F.reg, fontSize: fs.display, color: C.ash, marginHorizontal: 3 }}>×</Text>
                                  <Pressable style={{ flexDirection: "row", alignItems: "baseline", paddingHorizontal: 4 }} onPress={() => inputRefs.current[`${x.uid}:reps`]?.focus()}>
                                    <TextInput
                                      ref={(r) => { inputRefs.current[`${x.uid}:reps`] = r; }}
                                      value={s.reps}
                                      onChangeText={(v) => setSetField(x.uid, i, "reps", v)}
                                      keyboardType="numeric"
                                      placeholder="0"
                                      placeholderTextColor={C.ash}
                                      style={figureField}
                                    />
                                    <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash, marginLeft: 5 }}>{measureLabel}</Text>
                                  </Pressable>
                                </>
                              )}
                            </View>
                            <ConcernLine concern={concern} align="center" />
                            {/* RPE — ONE TAP, not another input row: tapping the
                                chip reveals a single row of value pills (the core
                                RPE scale, RIR-labelled when swapped); tapping a
                                pill sets the number and closes. Tap the picked
                                value again to clear it. */}
                            {prefs.detailed && rpeOpenSet === s.uid && (
                              // A REAL conditional mount, unlike the row above, so
                              // its entrance needs no component boundary to fire —
                              // but it gets the same native-driver rise for the same
                              // reason: `animateListChange` would open the gap and
                              // this makes the pills arrive into it even if that
                              // request is declined.
                              <RpeScaleRow>
                                <Pressable onPress={() => setLoggerPref("rpeAsRir", !prefs.rpeAsRir)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${prefs.rpeAsRir ? "RIR" : "RPE"} — ${t("rpe.rir")}`}>
                                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: tracking(fs.nano, "label") }}>{`${prefs.rpeAsRir ? "RIR" : "RPE"} ⇄`}</Text>
                                </Pressable>
                                {[...RPE_SCALE].reverse().map((step) => {
                                  const val = String(step.rpe);
                                  const on = s.rpe === val;
                                  return (
                                    <Pressable
                                      key={val}
                                      onPress={() => { animateListChange(reducedMotion); setSetField(x.uid, i, "rpe", on ? "" : val); setRpeOpenSet(null); }}
                                      accessibilityRole="button"
                                      accessibilityState={{ selected: on }}
                                      style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.chalk : C.line, backgroundColor: on ? withAlpha(C.chalk, ALPHA.fill) : C.ink2 }}
                                    >
                                      <Text style={{ fontFamily: on ? F.monoBold : F.mono, fontSize: fs.caption, color: on ? C.chalk : C.ash }}>{prefs.rpeAsRir ? step.rir : val}</Text>
                                    </Pressable>
                                  );
                                })}
                              </RpeScaleRow>
                            )}
                                                    </View>
                        ) : (() => {
                          // Banked / queued → quiet one-line row (tap a banked one
                          // to re-open it as the active card).
                          //
                          // The load × reps line is the SHARED per-set formatter —
                          // the same core function the "last time" reference a few
                          // lines above reads through. This row used to build its
                          // own, and the two had already drifted: it special-cased
                          // only pure bodyweight, so an assisted pull-up printed
                          // "20 kg × 5" here (as if you had ADDED 20) while the
                          // reference above it correctly wrote "−20×5".
                          const summary = strengthSetSummary(x.name, s, { style: "row", units: prefs.units });
                          // THE EFFORT SURVIVES THE COLLAPSE. It used not to: this
                          // row was built from load and reps alone, so the RPE you
                          // had just tapped on the chip above stopped being drawn
                          // the moment the set banked — stored on the set, saved
                          // onto the block, printed back in the session breakdown
                          // at home, and invisible on the one screen you read while
                          // actually training. Worse, the fresh set's chip then read
                          // "–", so the card claimed no effort had been rated
                          // anywhere in the exercise.
                          //
                          // It keeps the chip's own word and colour, so it reads as
                          // the same value that just collapsed rather than as a new
                          // fact, and it renders NOTHING when unset: the row only
                          // grows a fourth column when there is something to say,
                          // which is what makes a fourth column affordable on a
                          // small phone at all.
                          //
                          // AND THE EFFORT YIELDS THE COLOUR. This comment used to
                          // claim the token was "sand, not the summary's amber" —
                          // which is false, they are the same constant (C.amber IS
                          // sand), and a caution set therefore painted BOTH columns
                          // the same colour with nothing to say which fact was being
                          // reported. That is the objection that ruled out putting
                          // the effort inside the summary string; a weaker version of
                          // it applies to the column beside it. So: normally the
                          // token carries the chip's amber, because matching the chip
                          // is the entire argument for the token. On a FLAGGED set
                          // the amber belongs to the figures — "check this number" —
                          // and the effort drops to ash: still there, still legible,
                          // no longer competing for a meaning it does not own.
                          const effort = prefs.detailed ? rpeRirSwap(s.rpe, prefs.rpeAsRir) : "";
                          const effortLabel = effort ? `${prefs.rpeAsRir ? "RIR" : "RPE"} ${effort}` : "";
                          // A COMPONENT, not another inline <View> — and that is
                          // load-bearing, not tidiness. Both branches of this
                          // ternary used to render a plain <View>, which React
                          // reconciles as the SAME view updated in place: no
                          // unmount, no mount, so no entrance could ever fire and
                          // the whole collapse depended on LayoutAnimation being
                          // honoured. React always remounts across a type change,
                          // so rendering the row as `BankedSetRow` is what makes its
                          // native-driver entrance a guarantee instead of a hope.
                          return (
                            <BankedSetRow
                              badge={setTypeBadge(s, i)}
                              badgeColor={typeAccent ? txt(C, typeAccent) : C.ash}
                              summary={summary}
                              summaryColor={odd ? txt(C, concern.verdict === "refuse" ? C.red : C.amber) : C.ash}
                              effortLabel={effortLabel}
                              effortColor={odd ? C.ash : txt(C, C.amber)}
                              done={s.done}
                              dim={focus === "done" ? 0.62 : 0.72}
                              onReopen={s.done ? () => toggleDone(x.uid, i, false) : undefined}
                              C={C}
                            />
                          );
                        })()}
                      </SwipeRow>
                      </View>
                    );
                  });
                })()}
                {/* ADD SET grows the list in place, so per the kit's grammar it
                    is a BARE plus with no chrome at all — no ring, no fill, no
                    border. It used to be a ringed plus inside a filled,
                    bordered, rounded box at the end of a list, which is the
                    mark for something that LEAVES, three rules at once. The
                    split ⋯ zone and the bolt tile that sat beside it are gone
                    too: schemes and special sets are answers to "what kind of
                    set", which is one question and now one menu, on the set
                    row itself. */}
                <Pressable
                  onPress={() => addSet(x.uid)}
                  accessibilityRole="button"
                  accessibilityLabel={t("workout.addSet")}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 12, paddingHorizontal: 2, marginTop: 2 }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, lineHeight: leading(fs.subtitle, "tight"), color: addSetIsNext(x.sets) ? C.chalk : C.ash }}>＋</Text>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: addSetIsNext(x.sets) ? C.chalk : C.ash }}>{t("workout.addSet")}</Text>
                </Pressable>
                {/* Popular-preset rail — one tap lays out the whole exercise. A
                    single horizontal rail replaces the old nested grid + manual
                    planner; it bleeds to the card's edges (negative margin =
                    card gutter, matching inner padding) so cards slide under the
                    edge, matching the exercise-widget idiom. */}
                {/* THE SET-OPTIONS PANEL — the RN floor for what iOS gets as a
                    system menu, and it carries the SAME rows in the same order:
                    the type first (a selection, checkmarked), then everything
                    that adds sets. It absorbed the separate preset rail, which
                    is why there is no `planUid` any more. */}
                {specialUid === x.uid && (() => {
                  const ai = activeSetIndex(x.sets);
                  const current = ai >= 0 ? setType(x.sets[ai]!) : "working";
                  return (
                  <View style={{ marginTop: 8, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, backgroundColor: C.ink2, overflow: "hidden" }}>
                    {SET_TYPE_OPTIONS.map((o, ii) => (
                      <Pressable
                        key={o.id}
                        onPress={() => { if (ai >= 0) setTypeTo(x.uid, ai, o.id); setSpecialUid(null); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: current === o.id }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: ii === 0 ? 0 : 1, borderTopColor: C.line }}
                      >
                        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{t(o.k)}</Text>
                        {current === o.id ? <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>✓</Text> : null}
                      </Pressable>
                    ))}
                    {SET_EXTRAS.map((e) => (
                      <Pressable
                        key={e.key}
                        onPress={() => { runSetExtra(x.uid, e.key); setSpecialUid(null); }}
                        accessibilityRole="button"
                        style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 1, borderTopColor: C.line }}
                      >
                        <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.ash }}>{t(e.k)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  );
                })()}
                {/* Quick-increment + plate hint for the last set's load */}
                {(prefs.quickIncrement > 0 || prefs.plateCalc) && (() => {
                  const last = x.sets[x.sets.length - 1];
                  const loadKg = last ? parseFloat(last.load) : NaN;
                  return (
                    <View style={{ marginTop: 8, gap: space.xs }}>
                      {prefs.quickIncrement > 0 && (
                        <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }}>
                          {([-prefs.quickIncrement, prefs.quickIncrement] as const).map((d) => (
                            <Pressable key={d} onPress={() => bumpLastLoad(x.uid, d)} style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: RADIUS.field, borderWidth: 1, borderColor: C.line }}>
                              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{d > 0 ? `+${d}` : d}</Text>
                            </Pressable>
                          ))}
                          <Mono style={{ fontSize: fs.micro }}>{prefs.units}</Mono>
                        </View>
                      )}
                      {prefs.plateCalc && Number.isFinite(loadKg) && loadKg > 0 && (() => {
                        const pl = platesPerSide(loadKg, prefs.units);
                        return (
                          <Mono style={{ fontSize: fs.micro }}>
                            {pl.perSide.length ? `Per side: ${pl.perSide.join(" – ")}${pl.remainder ? " ≈" : ""}` : `Bar only (${pl.bar} ${prefs.units})`}
                          </Mono>
                        );
                      })()}
                    </View>
                  );
                })()}
                {/* Live exercise summary — sets banked, tonnage, top set (and
                    mean bar speed once entered). Tap to open the exercise sheet
                    with per-set m/s entry. */}
                {(() => {
                  const ls = exerciseLiveStats(x.name, x.sets, bodyweightKg);
                  const parts = [
                    `${ls.setsDone}/${ls.setsTotal} ${t("workout.setsWord")}`,
                    ...(ls.volumeKg > 0 ? [fmtTonnage(ls.volumeKg, prefs.units)] : []),
                    ...(ls.topKg > 0 ? [`${t("workout.topWord")} ${displayLoad(String(ls.topKg), prefs.units)} ${prefs.units}${ls.topReps ? ` × ${ls.topReps}` : ""}`] : []),
                    ...(ls.meanVel != null ? [`${t("workout.meanWord")} ${ls.meanVel} m/s`] : []),
                  ];
                  return (
                    <Pressable
                      onPress={() => setSheetUid(x.uid)}
                      accessibilityRole="button"
                      accessibilityLabel={t("workout.exDetail")}
                      style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: withAlpha(C.line, 0.7), flexDirection: "row", alignItems: "center", gap: 8 }}
                    >
                      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{parts.join(" – ")}</Text>
                      <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.ash }}>›</Text>
                    </Pressable>
                  );
                })()}
              </>
            ) : x.kind === "cardio" ? (
              <>
                <View style={{ flexDirection: "row", gap: space.sm }}>
                  {!timedSportOnly(x.name) && (
                    <View style={{ flex: 1 }}>
                      {/* Distance is entered in the sport's unit (metres for
                          swimming/rowing, km otherwise); stored as km. */}
                      <ColHead>{sportDistanceUnit(x.name) === "m" ? t("workout.distM") : t("workout.dist")}</ColHead>
                      <Cell value={x.distance ?? ""} onChange={(v) => condField(x.uid, "distance", v)} />
                    </View>
                  )}
                  <View style={{ flex: 1 }}>
                    <ColHead>MIN</ColHead>
                    <Cell value={x.minutes} onChange={(v) => condField(x.uid, "minutes", v)} />
                  </View>
                </View>
                {/* The two fields are judged TOGETHER: each can be ordinary
                    while the pace they imply is not, and that pair is where a
                    unit slip or a mistyped clock actually shows up. */}
                {(() => {
                  const c = inspectEffort({
                    discipline: cardioDiscipline(x.name),
                    distanceKm: parseSportDistance(x.distance ?? "", x.name),
                    minutes: parseFloat(x.minutes) || null,
                  });
                  return <ConcernLine concern={c} />;
                })()}
                {/* Modality extras — the exercise-profile model decides the
                    fields (incline / stroke / elevation / HR zone), matching
                    the Builder and the web logger. */}
                {(() => {
                  const has = (f: string) => exerciseProfile(x.name).fields.includes(f as never);
                  return (
                    <View style={{ flexDirection: "row", gap: space.sm, marginTop: 8 }}>
                      {has("incline") && (
                        <View style={{ flex: 1 }}>
                          <ColHead>{t("w.train.blocks.inclinePct")}</ColHead>
                          <Cell value={x.incline ?? ""} onChange={(v) => condField(x.uid, "incline", v)} />
                        </View>
                      )}
                      {has("stroke") && (
                        <View style={{ flex: 1 }}>
                          <ColHead>{t("w.train.blocks.stroke")}</ColHead>
                          <Cell value={x.stroke ?? ""} onChange={(v) => condField(x.uid, "stroke", v)} keyboard="default" />
                        </View>
                      )}
                      {has("elevation") && (
                        <View style={{ flex: 1 }}>
                          <ColHead>{t("w.train.blocks.elevation")}</ColHead>
                          <Cell value={x.elevation ?? ""} onChange={(v) => condField(x.uid, "elevation", v)} />
                        </View>
                      )}
                      <View style={{ flex: 1 }}>
                        <ColHead>{t("w.train.blocks.zone")}</ColHead>
                        <Cell value={x.zone ?? ""} onChange={(v) => condField(x.uid, "zone", v)} />
                      </View>
                    </View>
                  );
                })()}
                {(() => {
                  const pace = cardioPace({ name: x.name, distance: parseSportDistance(x.distance, x.name), minutes: parseFloat(x.minutes) });
                  return pace ? (
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.blue), marginTop: 8 }}>{t("workout.pace")} {pace}</Text>
                  ) : null;
                })()}
              </>
            ) : (
              <View style={{ flexDirection: "row", gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <ColHead>MIN</ColHead>
                  <Cell value={x.minutes} onChange={(v) => condField(x.uid, "minutes", v)} />
                </View>
              </View>
            )}
          </ACard>
          </Pressable>
          </View>
          );
        })}

        {/* ADD EXERCISE ends the exercise LIST, and it LEAVES — it opens the
            searchable picker — so per the kit's grammar it is a DOOR ROW: the
            list's own hairline, and a ringed chevron. It used to be a filled,
            bordered field wearing a lime ⊕, a literal "+" inside its own
            string (two plus signs on one control) and a ▾ that promised a
            dropdown and opened a full-screen sheet. */}
        <Pressable
          onPress={() => setPickerOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("workout.addExercise")}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.ms,
            marginTop: exercises.length ? 4 : 0,
            paddingVertical: 14,
            paddingHorizontal: 2,
            borderTopWidth: exercises.length ? 1 : 0,
            borderTopColor: C.line,
          }}
        >
          <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{t("workout.addExercise")}</Text>
          {/* The door's ring is the kit's ring: 32pt, a hairline in `line`, and
              NO fill — what week-verdict's DoorRow and the rail tail already
              draw. It shipped here as a filled chalk-6% plate, which is the
              satellite's material on a mark that is not a satellite: a door
              ring is a ring, and a filled one reads as a button sitting in a
              row of text. */}
          <View style={{ width: 32, height: 32, borderRadius: RADIUS.field, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.line }}>
            <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.ash }}>›</Text>
          </View>
        </Pressable>

        {/* Empty-state quick-starts (parity with the web logger): pull today's
            AI-prescribed session, or load a saved routine, without leaving. */}
        {exercises.length === 0 && (
          <View style={{ marginTop: 12, gap: space.sm }}>
            <Pressable
              onPress={loadPrescribed}
              // free users see the sand "Full" upsell accent; athletes (already unlocked) keep lime — parity with the web logger
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: isAthlete ? C.lime : pa.fill, borderRadius: RADIUS.pill, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: withAlpha(isAthlete ? C.lime : pa.fill, ALPHA.wash) }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: isAthlete ? txt(C, C.lime) : pa.text }}>✦ {t("train.start")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{!isAthlete ? t("train.premium") : recent.length > 0 ? t("train.aiReadiness") : t("train.aiCoach")}</Text>
            </Pressable>
            {routines.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, padding: 12 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking(fs.micro, "label"), color: C.ash, marginBottom: 8 }}>{t("train.routines")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                  {routines.map((r) => (
                    <Pressable key={r.id} onPress={() => loadRoutine(r)} style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, borderRadius: RADIUS.pill, paddingVertical: 8, paddingHorizontal: 12 }}>
                      <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: C.chalk }}>{r.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Searchable exercise picker — the shared Rooms/A–Z sheet, with the
            logger's recent lifts surfaced as "Your lifts" shortcuts. */}
        <ExercisePickerSheet
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
          onPick={(name, kind) => addExercise(name, kind)}
          onPickMany={(picks) => addExercises(picks)}
          title={t("workout.pickExercise")}
          // `count` is not decoration: the picker ranks the movements this
          // athlete actually trains above ones they have never touched.
          recent={recent.map((r) => ({ name: r.name, kind: r.kind, count: r.count }))}
        />

        {/* Exercise detail sheet — per-set pills, live totals, and per-set
            bar-speed (m/s) entry with a set-by-set velocity strip (manual VBT;
            live sensor capture is the blocked vbt-capture capability). */}
        {(() => {
          const x = exercises.find((e) => e.uid === sheetUid) ?? null;
          return (
            <ExerciseSheet
              x={x}
              all={exercises}
              last={x ? (() => { const l = lastByLift.get(x.name); return l ? blockSummary(l) : undefined; })() : undefined}
              units={prefs.units}
              bodyweightKg={bodyweightKg}
              onVel={(u, i, v) => setSetField(u, i, "vel", v)}
              onReorder={moveExerciseTo}
              onClose={() => setSheetUid(null)}
              t={t}
            />
          );
        })()}

        {!!error && <View accessibilityLiveRegion="assertive" accessibilityRole="alert"><Mono color={FEEDBACK.error.text} style={{ marginTop: 16, textAlign: "center" }}>{error}</Mono></View>}

      </ScrollView>

      {/* ── THE DOCK ─────────────────────────────────────────────────────────
          One primary, pinned, whatever the session's length — the button an
          athlete presses thirty times used to float in the middle of the
          screen and move further down it with every exercise added, while the
          brightest, largest, lowest control on the screen ENDED the workout.

          Pause and Finish flank it as glass satellites: not peers of Log set,
          and not drawn as peers — neither is chartreuse, both are 44pt against
          the primary's 56. It is the same shape the finish summary already
          uses (one filled pill, two glass orbs), because it is the same
          sentence: one thing you do, two things you can do to the session. */}
      {exercises.length > 0 && (
        <View
          style={{
            paddingHorizontal: GUTTER,
            paddingTop: 12,
            paddingBottom: dockPad,
            borderTopWidth: 1,
            borderTopColor: C.line,
            backgroundColor: withAlpha(C.ink2, 0.94),
          }}
        >
          {confirmFinish ? (
            /* FINISH, TAPPED — the confirm lands in the dock, in place, naming
               what is still queued. This is what buys back the word the glass
               satellite doesn't carry: the label lives in the moment it is
               read rather than taxing the primary's width all session. */
            <View accessibilityLiveRegion="polite">
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "caps"), textTransform: "uppercase", color: C.ash, marginBottom: 10 }}>
                {queued === 0 ? t("workout.setsWord") : queued === 1 ? t("workout.oneSetQueued") : `${queued} ${t("workout.setsQueued")}`}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("workout.finishConfirm")}</Text>
                {/* Keep going is a satellite too — a word-only capsule beside
                    the filled Finish, the same rim as Pause and Finish above
                    it rather than its own lighter fill inside a `line` ring. */}
                <ASatellite onPress={() => setConfirmFinish(false)} a11y={t("workout.keepGoing")} word={t("workout.keepGoing")} />
                <Pressable
                  onPress={() => { setConfirmFinish(false); void finish(); }}
                  disabled={saving}
                  accessibilityRole="button"
                  style={{ height: 44, paddingHorizontal: 20, justifyContent: "center", borderRadius: RADIUS.pill, backgroundColor: C.lime, opacity: saving ? STATE_OPACITY.busy : 1 }}
                >
                  {saving ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.onAccent }}>{t("workout.finish")}</Text>}
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {/* The hint line says what you are about to bank and what happens
                  after it — and becomes the rest countdown when one is running,
                  so a countdown costs a LINE rather than a banner that shoves
                  the layout down every time you finish a set. */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginBottom: 10 }}>
                <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "caps"), textTransform: "uppercase", color: restSince != null ? txt(C, C.blue) : C.ash }}>
                  {restSince != null
                    ? `${restLeft != null && restLeft <= 0 ? t("workout.restDone") : t("workout.resting")} – ${restReadout}`
                    : cursor
                      ? `${t("workout.setWord")} ${cursor.setIndex + 1}${cursorTotal > 1 ? ` ${t("workout.ofWord")} ${cursorTotal}` : ""}`
                      : t("workout.setsWord")}
                </Text>
                <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "caps"), textTransform: "uppercase", color: C.ash }}>
                  {prefs.restTimer ? `${t("w.train.blocks.rest")} ${mmss(prefs.restSeconds)}` : t("workout.noRestTimer")}
                </Text>
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                <ASatellite
                  onPress={togglePause}
                  glyph={paused ? "play.fill" : "pause.fill"}
                  mark={paused ? "play" : "pause"}
                  a11y={paused ? t("workout.resume") : t("workout.pause")}
                  fg={paused ? txt(C, C.amber) : C.chalk}
                />
                {/* THE ONE FILLED SURFACE ON THE SCREEN. Deliberately not a
                    SwiftUI button: a full-width chartreuse CTA has no system
                    counterpart, and `.glassProminent` would restyle the brand's
                    one "go" surface rather than nativize a control. It is 56pt
                    tall — taller than its satellites, not merely wider — because
                    height is the dimension a thumb hits without looking. */}
                <Pressable
                  onPress={logActiveSet}
                  disabled={!canLog}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !canLog }}
                  accessibilityLabel={t("workout.logSet")}
                  style={{
                    flex: 1,
                    height: 56,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    borderRadius: RADIUS.pill,
                    backgroundColor: canLog ? C.lime : withAlpha(C.lime, ALPHA.edge),
                    shadowColor: "#000",
                    shadowOpacity: canLog ? 0.22 : 0,
                    shadowRadius: 10,
                    shadowOffset: { width: 0, height: 5 },
                    elevation: canLog ? 3 : 0,
                  }}
                >
                  <Text style={{ fontFamily: F.black, fontSize: fs.body, color: canLog ? C.onAccent : C.ash }}>✓</Text>
                  <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: canLog ? C.onAccent : C.ash }}>{t("workout.logSet")}</Text>
                </Pressable>
                <ASatellite
                  onPress={() => setConfirmFinish(true)}
                  glyph="flag.checkered"
                  mark="flag"
                  a11y={t("w.train.logger.finishWorkout")}
                />
              </View>
            </>
          )}
        </View>
      )}
      </KeyboardAvoidingView>
      </View>

      <RpeHelpModal visible={rpeHelp} onClose={() => setRpeHelp(false)} t={t} />

      {/* The ⋯ menu. One row today, and that is the point: the header carries a
          single top-level exit, and the irreversible one is reached through a
          menu and then a confirm. Anything added here later inherits that
          protection for free. */}
      <Sheet visible={menuOpen} onClose={() => setMenuOpen(false)} title={t("workout.sessionOptions")}>
        {/* What the native Menu carries on iOS 26, for everywhere else. The
            rest DURATIONS live in the rest banner's preset row; the arm/disarm
            is the capsule's own tap. */}
        <Pressable
          onPress={() => { setMenuOpen(false); setRpeHelp(true); }}
          accessibilityRole="button"
          style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14 }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{t("w.train.blocks.whatsRpe")}</Text>
        </Pressable>
        <Pressable
          onPress={discard}
          accessibilityRole="button"
          accessibilityLabel={t("workout.discardSession")}
          style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14 }}
        >
          <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: txt(C, C.red) }}>
            {t("workout.discardSession")}
          </Text>
        </Pressable>
      </Sheet>

      {/* Get-ready count-in — covers the screen on a fresh start until GO, and
          the WHOLE screen: it sits outside the safe-area pad, so the count runs
          under the status bar the way a takeover should. */}
      {countdown != null && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, letterSpacing: tracking(fs.body, "caps"), marginBottom: 12 }}>
            {t("workout.getReady").toUpperCase()}
          </Text>
          <Text style={{ fontFamily: F.black, fontSize: countdown > 0 ? 132 : 96, color: txt(C, C.lime) }}>
            {countdown > 0 ? countdown : t("workout.go")}
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Exercise detail sheet — opened by tapping an exercise's live summary bar.
 * Flat totals (no boxed cells), then ONE velocity module: a bar chart that IS
 * the set selector — each set's m/s value rides above its bar, the selected
 * column's value is the editable input, set numbers sit under a shared
 * baseline. "m/s" appears exactly once (the module header, with the mean).
 */
function ExerciseSheet({
  x,
  all,
  last,
  units,
  bodyweightKg,
  onVel,
  onReorder,
  onClose,
  t,
}: {
  x: WExercise | null;
  /** The whole board — the Order block reorders it, the rest reads only `x`. */
  all: WExercise[];
  last?: string;
  units: WeightUnit;
  bodyweightKg?: number | null;
  onVel: (u: string, i: number, v: string) => void;
  onReorder: (from: number, to: number) => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const C = useTheme().palette;
  const [sel, setSel] = useState(0);
  const reduced = useReducedMotion();
  // The drag's own commit animates inside the hook; the a11y actions below go
  // straight to onReorder, so they animate here.
  const exDrag = useDragReorder((_g, from, to) => onReorder(from, to));
  // Re-anchor the selection to the active (first un-banked) set whenever the
  // sheet opens for a different exercise.
  const anchored = useRef<string | null>(null);
  useEffect(() => {
    if (!x) {
      anchored.current = null;
      return;
    }
    if (anchored.current === x.uid) return;
    anchored.current = x.uid;
    const active = x.sets.findIndex((s) => !s.done);
    setSel(active >= 0 ? active : Math.max(0, x.sets.length - 1));
  }, [x]);

  const body = x
    ? (() => {
        const ls = exerciseLiveStats(x.name, x.sets, bodyweightKg);
        const i = Math.min(sel, x.sets.length - 1);
        const s = x.sets[i]!;
        const known = ls.vels.filter((v): v is number => v != null);
        const maxVel = known.length ? Math.max(...known) : 0;
        const loadPart = s.load.trim() ? `${displayLoad(s.load, units)} ${units}` : "";
        const setLine = [loadPart, s.reps.trim()].filter(Boolean).join(" × ") || "–";
        return (
          <View style={{ marginTop: 16 }}>
            {/* Flat totals — big number over a small mono label, no boxes. */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 36 }}>
              <View>
                <Text style={{ fontFamily: F.takeover, fontSize: fs.display, letterSpacing: tracking(fs.display), color: C.chalk }}>{fmtTonnage(ls.volumeKg, units)}</Text>
                <Text style={{ ...ty(C, "kicker"), marginTop: LABEL_GAP  }}>{t("workout.totalVolume")}</Text>
              </View>
              <View>
                <Text style={{ fontFamily: F.takeover, fontSize: fs.display, letterSpacing: tracking(fs.display), color: C.chalk }}>{setLine}</Text>
                <Text style={{ ...ty(C, "kicker"), marginTop: LABEL_GAP  }}>{`${t("workout.setWord")} ${i + 1}`}</Text>
              </View>
            </View>

            {/* ONE velocity module — the unit is named once, with the mean. */}
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 24, marginBottom: 12 }}>
              <Text style={ty(C, "kicker")}>{`${t("workout.barSpeed")} (m/s)`}</Text>
              {ls.meanVel != null && (
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.chalk }}>{`${t("workout.meanWord")} ${ls.meanVel}`}</Text>
              )}
            </View>
            {/* The chart IS the selector: each set is a column — value above its
                bar (the selected one is the editable input), bars share a
                baseline, set numbers underneath. */}
            <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-end", borderBottomWidth: 1, borderBottomColor: withAlpha(C.line, 0.9) }}>
              {x.sets.map((st, j) => {
                const v = ls.vels[j];
                const on = j === i;
                const h = v != null && maxVel > 0 ? Math.max(12, Math.round((v / maxVel) * 56)) : 3;
                return (
                  <Pressable
                    key={st.uid ?? j}
                    onPress={() => setSel(j)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${t("workout.setWord")} ${j + 1}`}
                    style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}
                  >
                    {on ? (
                      <TextInput
                        value={s.vel ?? ""}
                        onChangeText={(val) => onVel(x.uid, i, val)}
                        keyboardType="numeric"
                        placeholder="0.00"
                        placeholderTextColor={C.ash}
                        style={{ fontFamily: F.monoBold, fontSize: fs.body, color: C.chalk, textAlign: "center", minWidth: 46, padding: 0, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: withAlpha(C.chalk, 0.55), marginBottom: 6 }}
                      />
                    ) : (
                      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: v != null ? C.chalk : C.ash, marginBottom: 8 }}>{v != null ? String(v) : "–"}</Text>
                    )}
                    <View style={{ alignSelf: "stretch", marginHorizontal: 10, height: h, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: on ? txt(C, C.lime) : v != null ? withAlpha(C.chalk, ALPHA.rim) : withAlpha(C.line, 1) }} />
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              {x.sets.map((st, j) => (
                <Pressable key={st.uid ?? j} onPress={() => setSel(j)} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: j === i ? C.chalk : C.ash }}>
                    {`${j + 1}${st.done ? " ✓" : ""}`}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, lineHeight: leading(fs.micro, "snug"), marginTop: 16 }}>{t("workout.velHint")}</Text>
          </View>
        );
      })()
    : null;

  /**
   * ORDER — the board, reordered by HOLDING a lift and dragging it.
   *
   * Reorder used to live on the logger itself, as a ⠿ at the head of every
   * exercise card and every set row: a handle in front of the lift's own name,
   * on the screen where you are training rather than arranging. It was dropped
   * with the grips, and this is where it comes back — one place, one list, and
   * no chrome on the cards behind it. There is nothing to reorder unless the
   * session has two lifts, so below that the block does not exist.
   *
   * The rows are deliberately INERT: a mark, a position, a name, a set count.
   * Nothing here is tappable, which is exactly what lets the whole row be the
   * handle (see components/hold-drag-row). The lift you opened the sheet on
   * reads in chalk so you can see where you are in the order you are changing.
   */
  const order = x && all.length > 1
    ? (
      <View style={{ marginTop: 28 }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 6 }}>
          <Text accessibilityRole="header" style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: tracking(fs.title), color: C.chalk }}>{t("workout.orderTitle")}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking(fs.micro, "label"), color: C.ash }}>{all.length}</Text>
        </View>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, lineHeight: leading(fs.micro, "snug"), marginBottom: 10 }}>{t("workout.orderHint")}</Text>
        {all.map((e, i) => {
          const here = e.uid === x.uid;
          const nudge = (dir: -1 | 1) => {
            const to = i + dir;
            if (to < 0 || to >= all.length) return;
            animateListChange(reduced);
            haptic.selection();
            onReorder(i, to);
          };
          return (
            <HoldDragRow
              key={e.uid}
              drag={exDrag}
              index={i}
              count={all.length}
              accessible
              accessibilityLabel={`${exDrag.slotOf("", i) + 1}. ${e.name}`}
              accessibilityActions={[
                { name: "moveUp", label: t("workout.moveUp") },
                { name: "moveDown", label: t("workout.moveDown") },
              ]}
              onAccessibilityAction={(ev) => nudge(ev.nativeEvent.actionName === "moveUp" ? -1 : 1)}
              // Opaque, because a lifted row travels OVER its neighbours: the
              // sheet's own panel colour, so at rest it is invisible.
              style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 10, paddingHorizontal: 2, backgroundColor: C.ink2 }}
            >
              {/* The PREVIEWED position, not the current one: while a card is
                  held the list has already parted around it, and a row sitting
                  in the slot the gap opened while still printing its old number
                  contradicts the gap beside it. */}
              <Text style={{ width: 16, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{exDrag.slotOf("", i) + 1}</Text>
              <AuroraExerciseAvatar name={e.name} size={28} />
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: here ? F.bold : F.reg, fontSize: fs.bodyLg, color: here ? C.chalk : C.ash }}>{e.name}</Text>
              {e.kind === "strength" && (
                <Text style={ty(C, "kicker")}>
                  {`${e.sets.length} ${t("workout.setsWord")}`}
                </Text>
              )}
            </HoldDragRow>
          );
        })}
      </View>
    )
    : null;

  return (
    <Sheet visible={!!x} onClose={onClose} title={x?.name} sub={last ? `${t("workout.lastTime")} – ${last}` : undefined}>
      {body}
      {order}
    </Sheet>
  );
}

/** The RPE scale's row — the disclosure arriving, on the native driver.
 *  NOT named `…PillRow`: the design-token ratchet reads a `Chip|Pill|Tag`
 *  suffix as a hand-rolled chip primitive that should have converged on
 *  AChip, and it was right to — this holds the pills, it is not one. */
function RpeScaleRow({ children }: { children: React.ReactNode }) {
  const enter = useRowEntrance(6);
  return (
    <Animated.View style={[{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 }, enter]}>
      {children}
    </Animated.View>
  );
}

/**
 * A BANKED OR QUEUED SET — the quiet one-line ledger row a set collapses into.
 *
 * NOT `LedgerRow`: that name belongs to the readiness signature ring
 * (aurora/readiness-object.tsx) and core's one-ring guard fails any second
 * DEFINITION of it, because the Performance screen once kept its own copy of
 * that ring and its paint helpers. Two unrelated rows, one name, is how that
 * starts.
 *
 * A plain hairline-separated line, not a boxed mini-card (no card-in-card).
 *
 * IT IS A COMPONENT SO THAT IT MOUNTS. The active set and this row are the two
 * branches of one ternary, and while both rendered a bare <View> React
 * reconciled them as the same view and updated it in place — nothing mounted,
 * nothing unmounted, so there was no moment an entrance could attach to and the
 * entire collapse rode on LayoutAnimation being honoured by native. React always
 * remounts across a component-type change, so this boundary is what turns the
 * entrance below into a guarantee. See `useRowEntrance` for why a guarantee was
 * wanted: every way LayoutAnimation can be declined on the New Architecture
 * fails silently and looks exactly like a design with no animation in it.
 *
 * The two mechanisms are complementary, not redundant. `animateListChange` makes
 * the NEIGHBOURS travel — the rows below closing the gap, which no per-row
 * animation can reach. This makes the ARRIVING row travel, on the native driver,
 * whether or not the request was granted.
 */
function BankedSetRow({ badge, badgeColor, summary, summaryColor, effortLabel, effortColor, done, dim, onReopen, C }: {
  badge: string;
  badgeColor: string;
  summary: string;
  summaryColor: string;
  /** "RPE 8" / "RIR 2", already swapped for the pref. Empty = unrated, draw nothing. */
  effortLabel: string;
  effortColor: string;
  done: boolean;
  /** Resting opacity — banked reads quieter than queued. */
  dim: number;
  onReopen?: () => void;
  C: Palette;
}) {
  const enter = useRowEntrance();
  return (
    <Animated.View style={[{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: withAlpha(C.line, 0.6) }, enter, { opacity: Animated.multiply(enter.opacity, dim) }]}>
      <Text style={{ width: 20, fontFamily: F.mono, fontSize: fs.caption, color: badgeColor }}>{badge}</Text>
      {/* A collapsed row SIGNALS; the expanded one explains. A plausibility
          concern turns these figures amber rather than gaining a badge of its
          own — the row is narrow on a small phone, and tapping it re-opens the
          set where the full sentence is waiting.

          The effort rides INSIDE the re-open target, not beside it: the number
          you want to correct is the most likely reason to tap this row, so it
          had better be part of the button. */}
      <Pressable style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: space.sm }} onPress={onReopen}>
        <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: summaryColor }}>{summary}</Text>
        {effortLabel ? (
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), color: effortColor }}>{effortLabel}</Text>
        ) : null}
      </Pressable>
      <Text style={{ fontFamily: F.black, fontSize: fs.body, color: done ? txt(C, C.lime) : C.ash }}>{done ? "✓" : "○"}</Text>
    </Animated.View>
  );
}

// The RPE cheatsheet — same scale (from @hybrid/core) the web logger shows.
function RpeHelpModal({ visible, onClose, t }: { visible: boolean; onClose: () => void; t: (k: string) => string }) {
  const C = useTheme().palette;
  return (
    <Sheet visible={visible} onClose={onClose} title={t("w.train.blocks.rpeHelpTitle")}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, lineHeight: leading(fs.body), marginBottom: 16 }}>{RPE_INTRO}</Text>
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            <Text style={{ width: 40, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: tracking(fs.nano, "label") }}>RPE</Text>
            <Text style={{ width: 56, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: tracking(fs.nano, "label") }}>{t("rpe.rir")}</Text>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: tracking(fs.nano, "label") }}>{t("rpe.feels")}</Text>
          </View>
          {RPE_SCALE.map((step) => (
            <View key={step.rpe} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ width: 40, fontFamily: F.bold, fontSize: fs.bodyLg, color: txt(C, C.lime) }}>{step.rpe}</Text>
              <Text style={{ width: 56, fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{step.rir}</Text>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{step.meaning}</Text>
            </View>
          ))}
    </Sheet>
  );
}

function Summary({
  summary,
  prior,
  router,
  t,
  units,
  haptics,
}: {
  summary: Summ;
  /** the athlete's sessions BEFORE this one — the "vs your usual" baseline. */
  prior: LoggedSession[];
  router: ReturnType<typeof useRouter>;
  t: (k: string) => string;
  units: WeightUnit;
  haptics: boolean;
}) {
  const C = useTheme().palette;
  // THE TROPHY CHIP — where the record lift's PR badge LANDS
  // (SHARED_ELEMENTS.prBadge): the badge that appeared on the exercise card
  // when the record set banked flies here, so the win arrives carried rather
  // than re-announced. "" declines the pair when nothing recorded.
  const { ref: prChipRef } = useSharedSurfaceTarget(summary.prs.length ? SHARED_ELEMENTS.prBadge : "");
  const bodyweightKg = useBodyweightLookup()();
  const bwLookup = useBodyweightLookup();
  // "vs your usual" on the feel prompt — the athlete against THEMSELVES over the
  // last month, from the sessions they'd already rated before this one.
  const feelBaseline = useMemo(() => loadBaseline(feelSamples(prior, bwLookup)), [prior, bwLookup]);
  // Carousel: one ref per slide's off-screen story card; Share captures the
  // currently-visible slide. Story capture width is a touch under the screen so
  // the device pixel ratio scales the exported PNG up toward 1080px.
  // A slide is EXACTLY the content column (screen minus the two gutters).
  // `pagingEnabled` snaps by the scroller's own width, so a slide that is not
  // the column width drifts by the difference on every page — it used to be a
  // hardcoded 36, which drifted 4pt a page against the old 16 gutter and would
  // drift 12 against this one.
  const slideW = Dimensions.get("window").width - GUTTER * 2;
  // The visible card IS a true 9:16 story (and the exact node we capture), sized
  // to fit comfortably in the page so the share is what-you-see-is-what-you-get.
  const previewW = Math.min(slideW, 320);
  const storyRefs = useRef<Record<number, View | null>>({});
  // The slide pager — a ref so tapping a dot can scroll to that slide (parity
  // with web; native swipe paging still works too).
  const pagerRef = useRef<ScrollView>(null);
  const [active, setActive] = useState(0);
  // The chosen "wrapped" style. No toggle any more — TAPPING the card cycles
  // through the shared looks (the control folded into the object itself).
  const [styleId, setStyleId] = useState<StoryStyleId>(DEFAULT_STORY_STYLE);
  const st = storyStyle(styleId);
  const cycleStyle = () => {
    setStyleId((cur) => {
      const i = STORY_STYLES.findIndex((s) => s.id === cur);
      return STORY_STYLES[(i + 1) % STORY_STYLES.length]!.id;
    });
    haptic.selection();
  };
  // The ★ satellite expands the save-as-routine composer beneath the cluster.
  const [routineOpen, setRoutineOpen] = useState(false);
  // The summary is the SAME cover as the live screen, so it stands in the same
  // window insets — a native SafeAreaView here dropped the top edge too, which
  // put the ✕ that leaves the session on the status bar.
  const insets = useSafeAreaInsets();
  const safe = coverInsets(insets);
  const { prs, bests, cardioPrs, firstEver } = summary;
  // Title can be renamed here (optional) — start from the auto-title.
  const [title, setTitle] = useState(summary.title);
  // A PR or a first-ever workout is the moment worth posting — the share is the
  // climax (and our download engine), so the CTA leans into it.
  const hasWin = prs.length > 0 || cardioPrs.length > 0;
  const milestone = firstEver || hasWin;

  // Finishing is the payoff — make it FELT. A success haptic (a heavier knock
  // layered on for a PR/first), and a spring entrance on the floating card so
  // the win lands instead of just appearing.
  const pop = useRef(new Animated.Value(milestone ? 0.6 : 0.85)).current;
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let knock: ReturnType<typeof setTimeout> | undefined;
    if (haptics) {
      haptic.success();
      if (milestone) {
        knock = setTimeout(() => haptic.heavy(), 150);
      }
    }
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, ...springToRN(springs.pop), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 320, useNativeDriver: true }),
    ]).start();
    return () => { if (knock) clearTimeout(knock); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const shareLabel = firstEver
    ? t("summary.shareFirst")
    : hasWin
      ? t("summary.sharePr")
      : t("summary.share");

  const prLine = (p: PrHit) =>
    formatStrengthPr(p, { first: t("summary.firstTime"), moreReps: t("summary.morePrReps") }, units);

  const captionHeadline = prs[0]
    ? `\u{1F3C6} ${prLine(prs[0])}`
    : cardioPrs[0]
      ? `\u{1F3C3} ${cardioPrLine(cardioPrs[0], t)}`
      : bests[0]
        ? `${t("share.topLift")}: ${bests[0].name} ${fmtWeight(bests[0].weight, units)}`
        : null;
  const shareText = workoutShareCaption(
    { title, minutes: summary.minutes, sets: summary.sets, volume: summary.volume, firstEver, headline: captionHeadline },
    units,
    t,
  );

  // ── the share deck ──
  // READ FROM CORE (session-panels.ts), not assembled here. This screen used to
  // build its own list: it dealt an overview card to every session, so a swim
  // shared as "1 SET, 0.0 t", and it dealt a second stat card for time while
  // the session review dealt one for the discipline's own headline. One
  // manifest now answers which panels a session has, on both screens.
  const logged: LoggedSession = useMemo(
    () => ({
      id: summary.sessionId ?? summary.startedAt,
      title,
      startedAt: summary.startedAt,
      completedAt: summary.completedAt,
      blocks: summary.blocks,
    }),
    [summary, title],
  );
  // The session has to be IN the history for records to resolve against it.
  const panels = useMemo(
    () => sessionPanels(logged, [...prior, logged], { units, bw: bwLookup }),
    [logged, prior, units, bwLookup],
  );
  const statPanel = panels.find((p) => p.kind === "stat");
  const heroBig = heroFigure(panels, statPanel?.kind === "stat" ? statPanel.value : fmtTonnage(summary.volume, units), units);
  const prRows: { left: string; right: string; hot?: boolean }[] = [
    ...prs.map((p) => ({ left: p.lift, right: prRowDelta(p, t, units), hot: true })),
    ...cardioPrs.map((p) => ({ left: cardioPrLine(p, t), right: "", hot: true })),
    ...bests.filter((b) => !prs.some((p) => p.lift === b.name)).slice(0, 6).map((b) => ({ left: b.name, right: fmtWeight(b.weight, units) })),
  ];
  // Pluralized — "1 new PR", not "1 new PRs".
  const prHeadline = prs.length > 0
    ? `${prs.length} ${prs.length > 1 ? t("w.train.logger.newPrs") : t("w.train.logger.newPr")}`
    : cardioPrs.length > 0
      ? `${cardioPrs.length} ${cardioPrs.length > 1 ? t("w.train.logger.cardioPrs") : t("w.train.logger.cardioPr")}`
      : t("summary.todaysBests");
  const slides: SlideData[] = panelSlides(panels, {
    t,
    units,
    overview: { title, minutes: summary.minutes, sets: summary.sets, volume: summary.volume, bests },
    firstEver,
    prHeadline,
    prRows,
    heroValue: heroBig,
  });
  const activeIdx = Math.min(active, slides.length - 1);

  // LIQUID FIELD — the card floats in an intensified Aurora field; every control
  // is the same glass material. Share is the one filled (lime) action; routine +
  // analysis are glass satellites at its sides; exit is a glass ✕ up top.
  const shareNow = () => shareCardImage({ current: storyRefs.current[activeIdx] ?? null }, shareText, t("summary.shareStory"));
  return (
    <View style={{ flex: 1, backgroundColor: C.ink }}>
      {/* Both backdrops sit OUTSIDE the safe-area pad — they are `absoluteFill`,
          and an absolute child lays out inside its parent's padding box, so
          padding above them would stop the field at the status bar. */}
      <AuroraField />
      <FinishField />
      <ScrollView contentContainerStyle={{ padding: 16, paddingHorizontal: GUTTER, paddingTop: safe.top + 16, paddingBottom: coverPadBottom(safe.bottom), flexGrow: 1 }}>
        {/* The one exit — where dismissal muscle memory expects it. Guests leave
            to the welcome screen (there's no Today tab behind them). The same
            satellite the dock's Pause and Finish are, at the same 44: this
            cluster and that one are the same sentence (one filled action, glass
            around it) and used to be drawn at two sizes by two components. */}
        <ASatellite
          mark="✕"
          glyph="xmark"
          a11y={t("summary.doneToday")}
          onPress={() => router.replace(summary.guest ? "/welcome" : "/(tabs)")}
        />

        {summary.prs.length > 0 && (
          <View style={{ alignItems: "center", marginTop: 10 }}>
            <View ref={prChipRef} collapsable={false} style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: withAlpha(C.lime, ALPHA.solid), borderWidth: 1, borderColor: C.lime, borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 4 }}>
              <AuroraIcon name="trophy" size={13} color={txt(C, C.lime)} />
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime) }}>{summary.prs[0]!.lift} PR</Text>
            </View>
          </View>
        )}

        {/* The floating card IS the screen — the real 9:16 story (what you see
            is what you share). Swipe for slides; TAP to cycle the wrapped look
            (the old style toggle folded into the object itself). */}
        <Animated.View style={{ opacity: fade, transform: [{ scale: pop }], marginTop: 6 }}>
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / slideW))}
          >
            {slides.map((s, i) => (
              <View key={i} style={{ width: slideW, alignItems: "center" }}>
                {/* Wrapper radius + bg match the story card (width * 0.05) so iOS
                    gets an efficient opaque shadow path and the float reads as
                    one object. */}
                <Pressable
                  onPress={cycleStyle}
                  accessibilityRole="button"
                  accessibilityLabel={`${t(st.nameKey)} — ${t("summary.cardHint")}`}
                  style={{ borderRadius: previewW * 0.05, backgroundColor: st.bg, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 24, shadowOffset: { width: 0, height: 14 }, elevation: 8 }}
                >
                  <SlideStoryCard ref={(r) => { storyRefs.current[i] = r; }} slide={s} t={t} units={units} width={previewW} styleId={styleId} animate={i === activeIdx} />
                </Pressable>
              </View>
            ))}
          </ScrollView>
        </Animated.View>

        {/* Dots — tappable (jump to that slide), matching web. */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12 }}>
          {slides.map((s, i) => (
            <Pressable
              key={i}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={s.eyebrow}
              onPress={() => pagerRef.current?.scrollTo({ x: i * slideW, animated: true })}
              style={{ width: i === activeIdx ? 18 : 6, height: 6, borderRadius: RADIUS.mark, backgroundColor: i === activeIdx ? C.lime : C.line }}
            />
          ))}
        </View>

        {/* One whisper of a hint — the current look + how to change it. */}
        <Mono color={C.ash} style={{ textAlign: "center", marginTop: 10, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "caps") }}>
          {`${t(st.nameKey)} — ${t("summary.cardHint")}`.toUpperCase()}
        </Mono>

        {/* "How did that feel?" — THE IMMEDIATE READ, asked here because this is
            the only moment it can be asked. Effort is sRPE; spentness now is the
            anchor the recovery read on Today is measured against hours later.
            The daily card asks the second half; it does not replace this one.
            See core/feel-schedule.ts. */}
        {!summary.guest && (
          <FeelPrompt
            compact
            sessionId={summary.sessionId}
            minutes={summary.minutes}
            sessionEnd={summary.completedAt}
            baseline={feelBaseline}
          />
        )}

        {!summary.guest && <SummaryRename sessionId={summary.sessionId} value={title} onRenamed={setTitle} t={t} />}
        {!summary.guest && <SummaryNote sessionId={summary.sessionId} t={t} />}

        {summary.pending && (
          <View style={{ backgroundColor: withAlpha(C.amber, ALPHA.wash), borderWidth: 1, borderColor: withAlpha(C.amber, ALPHA.line), borderRadius: RADIUS.field, padding: 16, marginTop: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}><Glyph name="sync" size={fs.caption} color={txt(C, C.amber) as string} /><Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber) }}>{t("summary.pendingSync")}</Text></View>
          </View>
        )}

        <View style={{ flex: 1, minHeight: 20 }} />

        {summary.guest ? (
          <>
            {/* The same control the signed-in cluster shares with — a row so
                the capsule can take its width from RN rather than from its own
                word. Here the ONE filled surface is Create an account below;
                share is the glass beside it. */}
            <View style={{ flexDirection: "row", marginTop: 16 }}>
              <ASatellite
                fill
                word={shareLabel}
                a11y={shareLabel}
                glyph={SHARE_MARK.glyph}
                mark={SHARE_MARK.fallback}
                fg={C.lime}
                onPress={shareNow}
              />
            </View>
            <View style={{ backgroundColor: withAlpha(C.blue, ALPHA.wash), borderWidth: 1, borderColor: withAlpha(C.blue, ALPHA.line), borderRadius: RADIUS.field, padding: 16, marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.blue) }}>✓ {t("summary.guestSaved")}</Text>
            </View>
            <Pressable
              onPress={() => router.replace("/login?mode=signup")}
              style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 16, alignItems: "center", marginTop: 12 }}
            >
              <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{t("summary.guestSave")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.onAccent, opacity: 0.72, marginTop: 3 }}>{t("summary.guestSaveSub")}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/welcome")} style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("summary.notNow")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* The floating cluster — ONE control drawn three times now. Share
                used to be a hand-rolled chartreuse pill with a text arrow
                in it, which made the finish screen's most-pressed
                button the only one on it that was neither the app's shared
                satellite nor the system's: on iOS 26 the recipe cover's share
                answered the thumb with real interactive glass and this one did
                not. It is the same ASatellite as its neighbours now, wearing
                the same SF Symbol the recipe wears (SHARE_MARK), and it keeps
                the primary's WIDTH — `fill` — because the cluster's proportions
                were never the point of the fill.

                The accent survives as the WORD AND MARK's colour, not a
                surface. A satellite carries no brand paint while a filled
                primary is beside it; there is no longer one beside it, and the
                screen's single "go" still belongs on the share. */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 16 }}>
              <ASatellite
                mark="★"
                caption={t("summary.orbRoutine")}
                a11y={t("summary.saveRoutine")}
                on={routineOpen}
                onPress={() => setRoutineOpen((v) => !v)}
              />
              <ASatellite
                fill
                word={shareLabel}
                a11y={shareLabel}
                glyph={SHARE_MARK.glyph}
                mark={SHARE_MARK.fallback}
                fg={C.lime}
                onPress={shareNow}
              />
              <ASatellite
                mark={<ArrowGlyph size={SATELLITE.glyph} color={C.chalk} />}
                caption={t("summary.orbAnalysis")}
                a11y={t("summary.seeAnalysis")}
                onPress={() => router.replace("/history")}
              />
            </View>
            {routineOpen && <SaveRoutine key={title} title={title} blocks={summary.blocks} t={t} startOpen />}
          </>
        )}
      </ScrollView>
    </View>
  );
}

/** The LIQUID FIELD environment — two oversized soft glow orbs (lime + teal)
 *  drifting slowly behind the finish screen: an intensified take on the ambient
 *  AuroraField, and the web Finish's .ff-a/.ff-b discs at parity. RN has no
 *  cheap blur/radial primitive, so each glow is three concentric translucent
 *  circles faking the falloff — the same technique as the story-card discs.
 *  Reduce Motion parks the drift at its midpoint. */
function FinishField() {
  const { palette } = useTheme();
  const reduced = useReducedMotion();
  const w = Dimensions.get("window").width;
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      drift.setValue(0.5);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 11000, useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 11000, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, drift]);
  const glowA = palette.lime;
  const glowB = palette.blue;
  // Outer→inner layer alphas (they stack, so the centre reads brightest).
  const alphas = [0.045, 0.055, 0.07];
  const layers = (color: string) =>
    [1, 0.68, 0.42].map((f, i) => {
      const d = w * f;
      return (
        <View
          key={i}
          style={{ position: "absolute", left: (w - d) / 2, top: (w - d) / 2, width: d, height: d, borderRadius: d / 2, backgroundColor: withAlpha(color, alphas[i]!) }}
        />
      );
    });
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" }}>
      <Animated.View
        style={{
          position: "absolute",
          top: -w * 0.18,
          left: -w * 0.3,
          width: w,
          height: w,
          transform: [{ translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, 26] }) }],
        }}
      >
        {layers(glowA)}
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          bottom: -w * 0.22,
          right: -w * 0.32,
          width: w,
          height: w,
          transform: [{ translateX: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -24] }) }],
        }}
      >
        {layers(glowB)}
      </Animated.View>
    </View>
  );
}

// Save the just-finished workout as a reusable routine (WorkoutTemplate) so it
// can be loaded and started next time. Non-guest only (routines need an account).
// Free users can keep up to FREE_TEMPLATE_LIMIT saved routines (canSaveRoutine)
// — at the limit they get an upsell here instead of a "sign in and try again"
// error; logging/building one-offs stays free.
function SaveRoutine({ title, blocks, t, startOpen }: { title: string; blocks: SessionBlock[]; t: (k: string) => string; startOpen?: boolean }) {
  const C = useTheme().palette;
  const router = useRouter();
  const persona = usePersona();
  // The Liquid-Field summary opens the composer straight from the ★ satellite
  // (startOpen); elsewhere the card still starts as its collapsed pill.
  const [open, setOpen] = useState(!!startOpen);
  const [name, setName] = useState(title || "Routine");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "upsell">("idle");
  // Free users are capped — fetch the saved count so the card upsells up-front
  // at the limit instead of failing on save. Full users skip the round-trip.
  // fetchRoutines never rejects (it degrades to [] internally); if it does
  // degrade, the count stays 0 and a save at the limit still lands on the
  // upsell via the API's 403 — never a silent failure.
  const [savedCount, setSavedCount] = useState(0);
  const isFree = !isFullAccess(persona);
  useEffect(() => {
    if (isFree) fetchRoutines().then((rs) => setSavedCount(rs.length));
  }, [isFree]);
  const allowed = canSaveRoutine(persona, savedCount);

  if (state === "saved")
    return <Mono color={C.lime} style={{ textAlign: "center", marginTop: 16 }}>{t("w.train.logger.savedRoutine")}</Mono>;

  // Free user at the routine limit → upsell card (a stale count that lets a
  // save through still lands here when it fails); logging/building stays free.
  if (!allowed || state === "upsell")
    return (
      <View style={{ borderWidth: 1, borderColor: withAlpha(C.lime, ALPHA.line), backgroundColor: withAlpha(C.lime, ALPHA.wash), borderRadius: RADIUS.field, padding: 16, marginTop: 16 }}>
        <Mono color={C.lime} style={{ fontSize: fs.micro, letterSpacing: tracking(fs.micro, "label") }}>✦ {t("w.train.logger.routineFullTitle").toUpperCase()}</Mono>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6, lineHeight: leading(fs.micro) }}>{t("w.train.logger.routineFullBlurb")}</Text>
        <Pressable
          onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "save-routine" }); router.push("/upgrade"); }}
          style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center", marginTop: 12 }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.onAccent }}>{t("w.train.logger.routineUnlock")}</Text>
        </Pressable>
      </View>
    );

  if (!open)
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: withAlpha(C.lime, ALPHA.line), backgroundColor: withAlpha(C.lime, ALPHA.wash), borderRadius: RADIUS.pill, paddingVertical: 16, alignItems: "center", marginTop: 16 }}
      >
        <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: txt(C, C.lime) }}>★ {t("summary.saveRoutine")}</Text>
      </Pressable>
    );

  const save = async () => {
    setState("saving");
    const res = await createRoutine(name.trim() || "Routine", blocks);
    if (res.ok) { setState("saved"); return; }
    // 403 = the free template limit (a stale count let the save form show) —
    // land on the upsell card, never a silent failure.
    setState(res.status === 403 ? "upsell" : "idle");
  };

  return (
    <View style={{ borderWidth: 1, borderColor: withAlpha(C.lime, ALPHA.line), backgroundColor: withAlpha(C.lime, ALPHA.wash), borderRadius: RADIUS.field, padding: 16, marginTop: 16 }}>
      <Mono color={C.lime} style={{ fontSize: fs.micro, letterSpacing: tracking(fs.micro, "label") }}>{t("summary.saveRoutine").toUpperCase()}</Mono>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Routine name"
        placeholderTextColor={C.ash}
        style={{ marginTop: 8, fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 10 }}
      />
      <Pressable
        onPress={save}
        disabled={state === "saving"}
        style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 12, alignItems: "center", marginTop: 10, opacity: state === "saving" ? STATE_OPACITY.busy : 1 }}
      >
        <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.onAccent }}>{state === "saving" ? "…" : t("summary.saveRoutine")}</Text>
      </Pressable>
    </View>
  );
}

// Optional rename of the just-finished session — "you can add a name after you
// finish", but it's optional (most never do). Collapsed to a subtle link;
// expands to an input that PATCHes the saved session's title.
function SummaryRename({ sessionId, value, onRenamed, t }: { sessionId: string | null; value: string; onRenamed: (title: string) => void; t: (k: string) => string }) {
  const C = useTheme().palette;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(value);

  if (!open)
    return (
      <Pressable onPress={() => setOpen(true)} style={{ alignSelf: "center", marginTop: 16, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: RADIUS.pill, paddingVertical: 8, paddingHorizontal: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>✎ {t("summary.nameOptional")}</Text>
      </Pressable>
    );

  const commit = () => {
    const next = name.trim();
    if (next && next !== value) {
      onRenamed(next);
      if (sessionId) renameSession(sessionId, next);
    }
    setOpen(false);
  };

  return (
    <View style={{ flexDirection: "row", gap: 8, marginTop: 16, alignItems: "center" }}>
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        onSubmitEditing={commit}
        placeholder={t("workout.nameWorkout")}
        placeholderTextColor={C.ash}
        style={{ flex: 1, fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 10, textAlign: "center" }}
      />
      <Pressable onPress={commit} style={{ backgroundColor: C.lime, borderRadius: RADIUS.field, paddingVertical: 10, paddingHorizontal: 16 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.onAccent }}>✓</Text>
      </Pressable>
    </View>
  );
}

// A PRIVATE post-workout note — free text + a quick mood tap + context tags,
// PATCHed onto the just-finished session (owner-only). Collapsed to a subtle
// link like the rename; pill → composer → saved. Mirrors the web SessionNote.
function SummaryNote({ sessionId, t }: { sessionId: string | null; t: (k: string) => string }) {
  const C = useTheme().palette;
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [note, setNote] = useState("");
  const [mood, setMood] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const toggleTag = (slug: string) => setTags((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : cur.length < MAX_TAGS ? [...cur, slug] : cur));

  if (saved)
    return <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.lime), marginTop: 12 }}>{t("w.train.note.saved")}</Text>;

  if (!open)
    return (
      <Pressable onPress={() => setOpen(true)} style={{ alignSelf: "center", marginTop: 10, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: RADIUS.pill, paddingVertical: 8, paddingHorizontal: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>✎ {t("w.train.note.add")}</Text>
      </Pressable>
    );

  const commit = async () => {
    const body = note.trim();
    if (sessionId && (body || mood != null || tags.length > 0)) {
      setSaving(true);
      const ok = await patchSessionNote(sessionId, { note: body || null, mood, tags });
      setSaving(false);
      setSaved(ok); // only collapse to "Note saved" when the write landed
      return;
    }
    setSaved(true); // nothing to write — just close the composer
  };

  return (
    <View style={{ width: "100%", marginTop: 12, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, backgroundColor: C.ink2, padding: 16 }}>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t("w.train.note.ph")}
        placeholderTextColor={C.ash}
        multiline
        style={{ minHeight: 44, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 12, paddingVertical: 8, textAlignVertical: "top" }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{t("w.train.note.mood-q")}</Text>
        {MOODS.map((m) => {
          const on = mood === m.value;
          return (
            <Pressable key={m.value} onPress={() => setMood(on ? null : m.value)} accessibilityLabel={t(m.labelKey)} style={{ width: 32, height: 32, borderRadius: RADIUS.inner, alignItems: "center", justifyContent: "center", backgroundColor: on ? withAlpha(C.lime, ALPHA.fill) : C.ink, borderWidth: 1, borderColor: on ? C.lime : C.line }}>
              <Mark mark={m.mark} size={fs.bodyLg + 3} color={on ? txt(C, C.lime) : C.ash} />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {SUGGESTED_TAGS.map((tg) => {
          const on = tags.includes(tg.slug);
          const k = tagLabelKey(tg.slug);
          return (
            <Pressable key={tg.slug} onPress={() => toggleTag(tg.slug)} style={{ borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: on ? C.lime : C.ink, borderWidth: 1, borderColor: on ? C.lime : C.line }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: on ? C.onAccent : C.ash }}>#{k ? t(k) : tg.slug}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={commit} disabled={saving} style={{ marginTop: 12, backgroundColor: C.lime, borderRadius: RADIUS.field, paddingVertical: 12, alignItems: "center", opacity: saving ? STATE_OPACITY.busy : 1 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.onAccent }}>{t("common.save")}</Text>
      </Pressable>
    </View>
  );
}

function blocksToExercises(blocks: SessionBlock[]): WExercise[] {
  return blocks.map((b) =>
    b.kind === "strength"
      ? {
          uid: uid(),
          name: b.name,
          kind: "strength" as const,
          sets: (b.sets.length ? b.sets : [{ load: "", reps: "", rpe: "" }]).map((s) => ({
            uid: uid(),
            load: s.load ?? "",
            reps: s.reps ?? "",
            rpe: s.rpe ?? "",
            done: false,
            ...(s.drop ? { drop: true } : {}),
            ...(s.role ? { role: s.role } : {}),
          })),
          minutes: "",
          rpe: "",
          distance: "",
          incline: "",
          stroke: "",
          elevation: "",
          zone: "",
          ...(b.group ? { group: b.group } : {}),
        }
      : {
          uid: uid(),
          name: b.name,
          kind: b.kind,
          sets: [emptySet()],
          minutes: b.minutes != null ? String(b.minutes) : "",
          rpe: b.rpe != null ? String(b.rpe) : "",
          // Stored km → the sport's display unit (metres for swimming/rowing).
          distance: b.kind === "cardio" && b.distance != null ? displaySportDistance(b.distance, b.name) : "",
          incline: b.kind === "cardio" && b.incline != null ? String(b.incline) : "",
          stroke: (b.kind === "cardio" && b.stroke) || "",
          elevation: b.kind === "cardio" && b.elevation != null ? String(b.elevation) : "",
          zone: b.kind === "cardio" && b.zone != null ? String(b.zone) : "",
        },
  );
}

// One live-scoreboard stat cell shown during the workout (parity with web).

function LiveStat({
  C,
  label,
  value,
  accent,
  mark,
}: {
  C: Palette;
  label: string;
  value: string;
  /** The cell's own colour, for the one cell that carries state (a PR). Every
   *  other cell is chalk on ink2 — a scoreboard is a readout, not a ranking. */
  accent?: string;
  /** A mark beside the figure, same reason. */
  mark?: AuroraIconName;
}) {
  const on = accent != null;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", borderRadius: RADIUS.inner, paddingVertical: 8, backgroundColor: on ? withAlpha(accent, ALPHA.fill) : C.ink2, borderWidth: 1, borderColor: on ? accent : C.line }}>
      {/* Every figure here moves as sets are banked — the scoreboard IS the
          feedback for banking one — so each rolls to its new value. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
        {mark ? <AuroraIcon name={mark} size={fs.subtitle + 2} color={accent ?? C.chalk} /> : null}
        <RollingNumber value={value} align="center" style={{ fontFamily: F.black, fontSize: fs.subtitle, color: accent ?? C.chalk }} />
      </View>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: accent ?? C.ash, letterSpacing: tracking(fs.nano, "label"), marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// Set-your-bodyweight nudge — a quiet amber card the logger shows when the
// session has a bodyweight lift and no weight is on file (its tonnage would
// read 0). Set it inline: POST /api/body then refreshBodyweight() recomputes
// the live volume and the card self-dismisses. Parity with the web logger.
function BodyweightNudge({ C, t, units }: { C: Palette; t: (k: string) => string; units: WeightUnit }) {
  const [val, setVal] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);
  const a = C.amber;
  if (dismissed) return null;
  const save = async () => {
    const n = parseFloat(val.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setState("error");
      return;
    }
    setState("saving");
    const ok = await logBodyweight(Math.round(unitToKg(n, units) * 10) / 10);
    if (!ok) {
      setState("error");
      return;
    }
    setState("saved");
    // Recompute tonnage everywhere; once the weight lands this card unmounts
    // (needsBodyweight flips false), so the "saved" flash is brief but honest.
    refreshBodyweight();
  };
  return (
    <View style={{ backgroundColor: withAlpha(a, ALPHA.wash), borderWidth: 1, borderColor: withAlpha(a, ALPHA.edge), borderRadius: RADIUS.field, padding: 16, marginBottom: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Glyph name="scale" size={fs.body + 2} color={txt(C, a) as string} />
        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, a), flex: 1 }}>{t("w.train.logger.bwNudgeTitle")}</Text>
        <Pressable onPress={() => setDismissed(true)} hitSlop={8} accessibilityLabel={t("w.train.logger.bwNudgeDismiss")}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.ash }}>✕</Text>
        </Pressable>
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: leading(fs.caption), marginBottom: 10 }}>{t("w.train.logger.bwNudgeBody")}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.ink2, borderWidth: 1, borderColor: state === "error" ? C.red : C.line, borderRadius: RADIUS.field, paddingHorizontal: 12 }}>
          <TextInput
            value={val}
            onChangeText={(v) => { setVal(v); if (state === "error") setState("idle"); }}
            keyboardType="numeric"
            placeholder={t("w.train.logger.bwNudgeTitle")}
            placeholderTextColor={C.ash}
            onSubmitEditing={save}
            style={{ flex: 1, fontFamily: F.mono, fontSize: fs.subtitle, color: C.chalk, paddingVertical: 10 }}
          />
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{units}</Text>
        </View>
        <Pressable onPress={save} disabled={state === "saving"} style={{ backgroundColor: a, borderRadius: RADIUS.pill, paddingVertical: 10, paddingHorizontal: 16, opacity: state === "saving" ? STATE_OPACITY.busy : 1 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.caption, color: C.onAccent }}>
            {state === "saving" ? t("live.bwNudgeSaving") : state === "saved" ? t("w.train.logger.bwNudgeSaved") : t("w.train.logger.bwNudgeSave")}
          </Text>
        </Pressable>
      </View>
      {state === "error" && <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.red), marginTop: 8 }}>{t("w.train.logger.bwNudgeError")}</Text>}
    </View>
  );
}

function Cell({ value, onChange, done, active, keyboard = "numeric" }: { value: string; onChange: (v: string) => void; done?: boolean; active?: boolean; keyboard?: "numeric" | "default" }) {
  const C = useTheme().palette;
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType={keyboard}
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.subtitle, color: done ? C.ash : C.chalk, textAlign: "center", backgroundColor: active ? "transparent" : C.ink2, borderWidth: 1, borderColor: active ? withAlpha(C.lime, ALPHA.rim) : C.line, borderRadius: RADIUS.field, paddingVertical: 10 }}
    />
  );
}

function ColHead({ children, w }: { children: React.ReactNode; w?: number }) {
  const C = useTheme().palette;
  return (
    <Text style={{ flex: w ? undefined : 1, width: w, textAlign: "center", fontFamily: F.mono, fontSize: fs.nano, color: C.ash, letterSpacing: tracking(fs.nano, "label") }}>
      {children}
    </Text>
  );
}
