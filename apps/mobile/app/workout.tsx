import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Modal, Animated, KeyboardAvoidingView, Platform, Dimensions, AccessibilityInfo } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useBodyweightLookup, refreshBodyweight } from "../lib/use-bodyweight";
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
  strengthPrDelta,
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
  displaySportDistance,
  parseSportDistance,
  formatCardioPr,
  cardioPace,
  blockSummary,
  lastStrengthByLift,
  supersetLabels,
  toggleSuperset,
  isSupersettedWithPrev,
  setType,
  cycleSetType,
  setTypeBadge,
  setFocus,
  addSetIsNext,
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
  volumeByMuscle,
  sessionFunFact,
  funFactText,
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
  type ReadinessFeeling,
} from "@hybrid/core";
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
import Sheet from "../components/aurora/sheet";
import { FeelPrompt } from "../components/feel-prompt";
import SwipeRow from "../components/swipe-row";
import DragHandle from "../components/drag-handle";
import { useDragReorder } from "../lib/use-drag-reorder";
import { saveGuestSession, listGuestSessions } from "../lib/guest";
import { loadDraft, saveDraft, clearDraft } from "../lib/draft";
import { shareWorkout, SlideStoryCard, type ShareBest, type SlideData } from "../lib/share";
import { useSession } from "../lib/session";
import { usePersona } from "../lib/persona";
import { readPlanMaxes } from "../lib/plan-maxes";
import { track } from "../lib/track";
import { useLoggerPrefs, setLoggerPref } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { fs, space, F, Mono, Card } from "../lib/ui";
import { useTheme, txt, type Palette } from "../lib/theme";
import { usePremiumAccent } from "../lib/premium-accent";
import { AuroraIcon } from "../components/aurora/icons";
import { useTemplate } from "../lib/template";
import { AuroraField, withAlpha } from "../components/aurora/kit";
import { GlassSurface, LIQUID_GLASS_SUPPORTED } from "../components/aurora/swiftui";
import { useReducedMotion } from "../lib/use-reduced-motion";

// Aurora rounds everything more — pill CTAs and softer cards/banners. These
// helpers let the live logger pick up the new look without duplicating its
// (large, stateful) logic; classic radii are preserved when not on Aurora.
const auroraRadii = (aurora: boolean) => ({
  cta: aurora ? 999 : 14,
  banner: aurora ? 16 : 12,
  field: aurora ? 16 : 10,
  chip: aurora ? 999 : 10,
});

const uid = () => Math.random().toString(36).slice(2);

// Present the rest-done notification even with the app foregrounded (sound +
// banner), so the cue lands whether the phone is in your hand or your pocket.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: false,
  }),
});

type WKind = "strength" | "cardio" | "conditioning";

type WSet = { uid: string; reps: string; load: string; rpe: string; vel?: string; done: boolean; drop?: boolean; role?: SetRole; rest?: number };

// Default rest the countdown targets before you pick a preset — so a new user
// always sees a counting-down timer (not a stopwatch climbing with no end).
const DEFAULT_REST = 90;
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

const emptySet = (from?: WSet): WSet => ({
  uid: uid(),
  reps: from?.reps ?? "",
  load: from?.load ?? "",
  rpe: from?.rpe ?? "",
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


type Summ = {
  /** The saved session's id (null for guests / offline) — backs the rename. */
  sessionId: string | null;
  title: string;
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
  const C = useTheme().palette;
  const pa = usePremiumAccent();
  const aurora = useTemplate().template === "aurora";
  const R = auroraRadii(aurora);
  const router = useRouter();
  const { t } = useLang();
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
  // Which exercise has its "Special ▾" add-set menu open (warm-up / ramp /
  // cool-down / drop). One primary "+ Add set" keeps the common path one tap.
  const [specialUid, setSpecialUid] = useState<string | null>(null);
  // Popular-preset rail: which exercise has its preset rail open. One tap lays
  // out the whole exercise before the first rep instead of "+ Add set" one-by-one.
  const [planUid, setPlanUid] = useState<string | null>(null);
  // LIVE active-set RPE: hidden behind a chip on the up-now card, expanded per
  // exercise (only one set is active per exercise, so keying by uid is enough).
  const [rpeOpenUid, setRpeOpenUid] = useState<string | null>(null);
  // Which exercise has its detail sheet up (per-set bar speed + live summary).
  const [sheetUid, setSheetUid] = useState<string | null>(null);
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

  // Hold-and-drag reorder of exercise cards (the grip handle). We track each
  // card's measured position (onLayout) and translate ONLY the lifted card with
  // the finger; on release we drop it at the nearest card's slot. Refs (not
  // state) drive the live gesture so per-second timer re-renders don't disturb
  // it; dragUid is state only to restyle the lifted card.
  const [dragUid, setDragUid] = useState<string | null>(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const layouts = useRef<Record<string, { y: number; height: number }>>({});
  const dragUidRef = useRef<string | null>(null);
  const dragFrom = useRef(-1);
  const dragTo = useRef(-1);
  const exercisesRef = useRef<WExercise[]>([]);
  exercisesRef.current = exercises;

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
          if (prefs.haptics) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
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
    if (prefs.haptics) Haptics.selectionAsync().catch(() => {});
    const id = setTimeout(() => setCountdown((c) => (c == null ? null : c - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, prefs.haptics]);

  // Show the one-time logging guide until the athlete has banked a set before.
  useEffect(() => {
    AsyncStorage.getItem(TIP_KEY).then((v) => setShowTip(v !== "1")).catch(() => {});
  }, []);
  const dismissTip = () => {
    setShowTip(false);
    AsyncStorage.setItem(TIP_KEY, "1").catch(() => {});
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

  // Persist the in-progress draft as it changes (debounced) so it survives a
  // crash / kill. Only after the initial restore, so we never clobber a draft.
  useEffect(() => {
    if (!restored) return;
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

  const addExercise = (name: string, kind?: WKind) => {
    const clean = name.trim();
    if (!clean) return;
    setExercises((xs) => [...xs, newExercise(clean, kind)]);
    setPickerOpen(false);
  };
  const removeExercise = (u: string) => setExercises((xs) => xs.filter((x) => x.uid !== u));
  // Drop reorder (hold the grip handle and drag): move from one index to another.
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
  const setSetField = (u: string, i: number, k: keyof WSet, v: string | boolean) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, [k]: v } : s)) } : x)),
    );
  const condField = (u: string, k: "minutes" | "rpe" | "distance" | "incline" | "stroke" | "elevation" | "zone", v: string) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, [k]: v } : x)));
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
  const addSet = (u: string) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: [...x.sets, emptySet(prefs.carryOver ? x.sets[x.sets.length - 1] : undefined)] } : x)),
    );
  // Popular preset schemes (⋯ menu) — lay out the whole exercise's working sets
  // in one tap. Each rep count is a SINGLE number (project rule), carrying the
  // current load. Banked sets are kept; the un-banked plan is replaced.
  const applyPreset = (u: string, count: number, reps: number) =>
    setExercises((xs) =>
      xs.map((x) => {
        if (x.uid !== u) return x;
        const done = x.sets.filter((s) => s.done);
        const load = [...x.sets].reverse().find((s) => s.load)?.load ?? "";
        const work: WSet[] = Array.from({ length: count }, () => ({ uid: uid(), load, reps: String(reps), rpe: "", done: false }));
        return { ...x, sets: [...done, ...work] };
      }),
    );
  // A drop set is a lighter continuation of the previous set (no rest), added pre-flagged.
  const addDropSet = (u: string) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: [...x.sets, { ...emptySet(), drop: true }] } : x)),
    );
  // A warm-up ramp set — excluded from working volume/PRs, kept for the velocity profile.
  const addWarmupSet = (u: string) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: [...x.sets, { ...emptySet(), role: "warmup" as SetRole }] } : x)),
    );
  // A cool-down set — light back-off work, excluded from working volume/PRs like a warm-up.
  const addCooldownSet = (u: string) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: [...x.sets, { ...emptySet(), role: "cooldown" as SetRole }] } : x)),
    );
  // Auto warm-up ramp: prepend ~40/60/80% sets up to the heaviest working load.
  const addWarmupRamp = (u: string) =>
    setExercises((xs) =>
      xs.map((x) => {
        if (x.uid !== u) return x;
        const workingMax = Math.max(
          0,
          ...x.sets.filter((s) => s.role !== "warmup" && s.role !== "cooldown").map((s) => parseFloat(s.load)).filter((n) => Number.isFinite(n)),
        );
        const ramp = warmupRamp(workingMax);
        if (!ramp.length) return x;
        const rampSets: WSet[] = ramp.map((step) => ({ uid: uid(), load: String(step.load), reps: String(step.reps), rpe: "", done: false, role: "warmup" }));
        return { ...x, sets: [...rampSets, ...x.sets] };
      }),
    );
  // Tap the set badge to cycle its type: working → warm-up → cool-down → drop.
  const cycleType = (u: string, i: number) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.map((s, j) => (j === i ? cycleSetType(s) : s)) } : x)),
    );
  // Superset: group this exercise with the one directly above it (A1/A2/A3…).
  const supersetWithPrev = (u: string) =>
    setExercises((xs) => toggleSuperset(xs, xs.findIndex((x) => x.uid === u), uid));
  const removeSet = (u: string, i: number) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.filter((_, j) => j !== i) } : x)));
  const toggleDone = (u: string, i: number, val: boolean) => {
    // Banking a set also records the rest that preceded it — the gap since the
    // last set was banked (the live timer) is saved on the set as real data.
    const restTaken = val && restSince != null ? Math.floor((Date.now() - restSince) / 1000) : undefined;
    setExercises((xs) =>
      xs.map((x) =>
        x.uid === u
          ? {
              ...x,
              // Un-ticking clears the recorded rest too, so a stale value can't
              // persist if you re-do the set without the timer running.
              sets: x.sets.map((s, j) => (j === i ? { ...s, done: val, rest: val ? restTaken : undefined } : s)),
            }
          : x,
      ),
    );
    if (!val) return;
    if (showTip) dismissTip(); // first banked set — the guide has done its job
    if (prefs.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
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
      setRestSince(null); // suppress any lingering rest banner (or timer disabled)
      return;
    }
    setRestSince(Date.now());
    setRestNow(0);
    restFired.current = false;
  };
  // --- Drag-to-reorder exercise cards (grip handle) ---
  const beginDrag = (u: string) => {
    const i = exercisesRef.current.findIndex((x) => x.uid === u);
    if (i < 0) return;
    dragUidRef.current = u;
    dragFrom.current = i;
    dragTo.current = i;
    dragY.setValue(0);
    setDragUid(u);
    if (prefs.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  };
  const moveDrag = (dy: number) => {
    dragY.setValue(dy);
    const u = dragUidRef.current;
    const L = u ? layouts.current[u] : undefined;
    if (!u || !L) return;
    // Drop next to whichever card's centre is closest to the lifted card's —
    // robust across variable card heights and the gaps (margins) between them.
    const center = L.y + L.height / 2 + dy;
    let to = dragFrom.current;
    let best = Infinity;
    exercisesRef.current.forEach((x, k) => {
      const Lk = layouts.current[x.uid];
      if (!Lk) return;
      const dist = Math.abs(Lk.y + Lk.height / 2 - center);
      if (dist < best) {
        best = dist;
        to = k;
      }
    });
    dragTo.current = to;
  };
  const endDrag = () => {
    const { current: from } = dragFrom;
    const { current: to } = dragTo;
    if (from >= 0 && to >= 0 && from !== to) {
      moveExerciseTo(from, to);
      if (prefs.haptics) Haptics.selectionAsync().catch(() => {});
    }
    dragUidRef.current = null;
    dragFrom.current = -1;
    dragTo.current = -1;
    dragY.setValue(0);
    setDragUid(null);
  };
  // Drag-to-reorder SET ROWS (grip on each row), grouped per exercise — a drag
  // never crosses into another exercise's ledger.
  const setDrag = useDragReorder(
    (group, from, to) => setExercises((xs) => xs.map((x) => (x.uid === group ? { ...x, sets: moveItemTo(x.sets, from, to) } : x))),
    prefs.haptics,
  );

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
    if (prefs.haptics) Haptics.selectionAsync().catch(() => {});
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

    setSummary({
      sessionId,
      title: payload.title,
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

  if (phase === "done" && summary) return <Summary summary={summary} prior={prior.current} router={router} t={t} units={prefs.units} haptics={prefs.haptics} />;

  const ssLabels = supersetLabels(exercises);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top"]}>
      {/* Aurora's ambient blob field behind the logger — the live screen owns its
          own shell (sticky timer header), so it drops in the same backdrop the
          rest of the Aurora app uses rather than wrapping in AuroraScreen. */}
      {aurora && <AuroraField />}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 64 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.teams.coach.cancel")}</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: paused ? txt(C, C.amber) : C.chalk, letterSpacing: 0.9 }}>{mmss(elapsed)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: paused ? txt(C, C.amber) : C.ash, letterSpacing: 0.9 }}>{paused ? t("workout.paused") : t("workout.elapsed")}</Text>
        </View>
        <Pressable onPress={finish} disabled={saving} style={{ width: 64, alignItems: "flex-end" }} hitSlop={10}>
          <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: saving ? C.ash : txt(C, C.lime) }}>
            {saving ? "…" : t("workout.finish")}
          </Text>
        </Pressable>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        {/* No session-title input — the workout auto-titles itself; a name is
            only entered on the summary (Save as routine / optional rename). */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginBottom: 14 }}>
          <Mono style={{ flex: 1 }}>
            {exercises.length
              ? `${exercises.length} ${t("workout.exercises")} – ${t("workout.tapAsYouGo")}`
              : t("workout.firstExercise")}
          </Mono>
          {/* On-demand rest-timer switch — same persisted pref as Logger settings,
              so flipping it mid-workout sticks for next time too. */}
          <Pressable
            onPress={() => {
              const next = !prefs.restTimer;
              setLoggerPref("restTimer", next);
              if (!next) setRestSince(null);
            }}
            hitSlop={8}
            accessibilityLabel={t("loggerPrefs.restTimer")}
            style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: R.field, borderWidth: 1, borderColor: prefs.restTimer ? C.blue : C.line }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: prefs.restTimer ? txt(C, C.blue) : C.ash }}>
              ⏱ {prefs.restTimer ? `${prefs.restSeconds}s` : t("common.off")}
            </Text>
          </Pressable>
          <Pressable onPress={() => setRpeHelp(true)} hitSlop={8}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.blue) }}>{t("w.train.blocks.whatsRpe")}</Text>
          </Pressable>
        </View>

        {/* Live in-session scoreboard — appears once the first set is logged. */}
        {live.sets > 0 && (
          <View style={{ flexDirection: "row", gap: space.sm, marginBottom: 14 }}>
            <LiveStat C={C} label={t("w.train.logger.liveExercises")} value={String(live.exercises)} />
            <LiveStat C={C} label={t("live.sets")} value={String(live.sets)} />
            <LiveStat C={C} label={t("w.train.logger.liveVolume")} value={fmtTonnage(live.volume, prefs.units)} />
            {live.prs + live.cardioPrs > 0 && (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", borderRadius: R.field, paddingVertical: 8, backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: C.lime }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <AuroraIcon name="trophy" size={fs.subtitle + 2} color={txt(C, C.lime)} />
                  <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>{live.prs + live.cardioPrs}</Text>
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: txt(C, C.lime), letterSpacing: 0.9, marginTop: 2 }}>{live.prs + live.cardioPrs === 1 ? t("live.pr") : t("live.prs")}</Text>
              </View>
            )}
          </View>
        )}

        {/* Bodyweight nudge — a bodyweight lift is on the board but no weight is
            on file, so its tonnage would read 0. Set it inline; the live volume
            recomputes and the card self-dismisses. */}
        {needsBw && <BodyweightNudge C={C} R={R} t={t} units={prefs.units} />}

        {showTip && (
          <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: R.banner, padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("workout.tipTitle")}</Text>
              <Pressable onPress={dismissTip} hitSlop={8}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{t("workout.tipGot")}</Text>
              </Pressable>
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.chalk, lineHeight: 19 }}>{t("workout.tipBody")}</Text>
          </View>
        )}

        {restSince != null && (() => {
          // Countdown: show the time LEFT against the target, ticking to zero;
          // once reached it flips to "Rest done" and shows how long you've gone
          // over. With no target it falls back to a plain elapsed stopwatch.
          const remaining = restTarget != null ? restTarget - restNow : null;
          const done = remaining != null && remaining <= 0;
          const accent = done ? C.lime : C.blue;
          const clock =
            restTarget == null
              ? mmss(restNow)
              : done
                ? `+${mmss(restNow - restTarget)}`
                : `${mmss(remaining!)} ${t("workout.restLeft")}`;
          return (
            <View style={{ backgroundColor: `${accent}14`, borderWidth: 1, borderColor: `${accent}44`, borderRadius: R.banner, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, accent) }}>
                  {done ? t("workout.restDone") : t("workout.resting")} – {clock}
                </Text>
                <Pressable
                  onPress={() => setRestSince(null)}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.field, borderWidth: 1, borderColor: accent }}
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
                      style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: R.field, borderWidth: 1, borderColor: on ? C.blue : C.line, backgroundColor: on ? `${C.blue}22` : "transparent" }}
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
          const dragging = dragUid === x.uid;
          return (
          <Animated.View
            key={x.uid}
            onLayout={(e) => {
              const { y, height } = e.nativeEvent.layout;
              layouts.current[x.uid] = { y, height };
            }}
            style={
              dragging
                ? { transform: [{ translateY: dragY }], zIndex: 20, elevation: 8, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 6 } }
                : undefined
            }
          >
          {/* Press-and-hold anywhere on a strength card opens its exercise
              sheet (user-picked entry, review round 3). A bare long-press
              wrapper: taps still fall through to the card's own controls, and
              interactive children (inputs, buttons, grips) own their touches. */}
          <Pressable
            onLongPress={x.kind === "strength" ? () => {
              if (prefs.haptics) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
              setSheetUid(x.uid);
            } : undefined}
            delayLongPress={400}
          >
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 10 }}>
              <DragHandle onStart={() => beginDrag(x.uid)} onMove={moveDrag} onEnd={endDrag} color={dragging ? C.chalk : C.ash} />
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: x.kind === "strength" ? txt(C, C.lime) : x.kind === "cardio" ? txt(C, C.blue) : txt(C, C.violet) }}>
                {x.kind.toUpperCase()}
              </Text>
              {ssLabels[xi] && (
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>⛓ {ssLabels[xi]}</Text>
              )}
              <TextInput value={x.name} onChangeText={(v) => rename(x.uid, v)} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk }} />
              {/* Superset with the exercise BELOW — placed on the upper card so
                  even the FIRST exercise can start a superset (no rest between). */}
              {x.kind === "strength" && exercises[xi + 1]?.kind === "strength" && (() => {
                const joined = isSupersettedWithPrev(exercises, xi + 1);
                const nextUid = exercises[xi + 1]!.uid;
                return (
                  <Pressable
                    onPress={() => supersetWithPrev(nextUid)}
                    hitSlop={6}
                    style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.field, borderWidth: 1, borderColor: joined ? withAlpha(C.chalk, 0.4) : C.line, backgroundColor: joined ? withAlpha(C.chalk, 0.08) : "transparent" }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: joined ? C.chalk : C.ash }}>⛓ {joined ? t("w.train.blocks.joined") : t("workout.superset")}</Text>
                  </Pressable>
                );
              })()}
              <Pressable onPress={() => removeExercise(x.uid)} hitSlop={14}>
                <Text style={{ color: C.ash, fontSize: fs.note }}>✕</Text>
              </Pressable>
            </View>

            {x.kind === "strength" ? (
              <>
                {(() => {
                  // "Last time" reference — the most recent prior session's sets
                  // for this lift, so progressive overload has a target to beat.
                  const last = lastByLift.get(x.name);
                  return last ? (
                    <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginBottom: 8 }}>
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
                  return x.sets.map((s, i) => {
                    const lifted = setDrag.dragKey === setDrag.key(x.uid, i);
                    const focus = setFocus(x.sets, i);
                    const st = setType(s);
                    const typeAccent = st === "warmup" ? C.amber : st === "cooldown" ? C.blue : st === "drop" ? C.lime : null;
                    const grip = (
                      <DragHandle onStart={() => setDrag.begin(x.uid, i, x.sets.length)} onMove={setDrag.move} onEnd={setDrag.end} color={lifted ? C.chalk : C.ash} size={fs.note} />
                    );
                    return (
                      <Animated.View
                        key={s.uid ?? i}
                        onLayout={setDrag.onRowLayout(x.uid, i)}
                        style={lifted ? { transform: [{ translateY: setDrag.dragY }], zIndex: 20, elevation: 6 } : undefined}
                      >
                      <SwipeRow label={t("w.analyze.hist.delete")} onDelete={() => removeSet(x.uid, i)}>
                        {focus === "active" ? (
                          // FLAT active section — no inner card (the exercise card
                          // is the one surface): the set you're on reads as focus
                          // by SCALE (big numbers) and breathing room, not by a
                          // second border/tint. De-greened: the only lime left in
                          // the loop is the Log CTA itself.
                          <View style={{ paddingVertical: 12 }}>
                            {/* Label row — grip on the left (matching the recede
                                rows), kicker, planned-rest hint, then the type badge
                                on the right. */}
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                              {grip}
                              <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>
                                {`${t("workout.setWord")} ${i + 1}${planned ? ` ${t("workout.ofWord")} ${total}` : ""} — ${t("workout.upNow")}`}
                              </Text>
                              <View style={{ marginLeft: "auto", flexDirection: "row", alignItems: "center", gap: 8 }}>
                                {prefs.restTimer && (
                                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>
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
                                      onPress={() => setRpeOpenUid((u) => (u === x.uid ? null : x.uid))}
                                      hitSlop={6}
                                      style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, borderWidth: 1, borderColor: set ? withAlpha(C.amber, 0.5) : C.line, backgroundColor: set ? withAlpha(C.amber, 0.1) : "transparent" }}
                                    >
                                      <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 0.9, color: set ? txt(C, C.amber) : C.ash }}>{prefs.rpeAsRir ? "RIR" : "RPE"}</Text>
                                      <Text style={{ fontFamily: F.mono, fontSize: 10, fontWeight: "700", color: set ? txt(C, C.amber) : C.ash }}>{rpeShown || "–"}</Text>
                                    </Pressable>
                                  );
                                })()}
                                <Pressable
                                  onPress={() => cycleType(x.uid, i)}
                                  hitSlop={8}
                                  style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: R.field, borderWidth: typeAccent ? 1 : 0, borderColor: typeAccent ?? "transparent", backgroundColor: typeAccent ? `${typeAccent}1f` : "transparent" }}
                                >
                                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: typeAccent ? txt(C, typeAccent) : C.ash }}>{typeAccent ? setTypeBadge(s, i) : "＋"}</Text>
                                </Pressable>
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
                                  style={{ fontFamily: F.black, fontSize: 46, letterSpacing: -1.5, color: C.chalk, padding: 0, textAlign: "center", minWidth: 44 }}
                                />
                                <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash, marginLeft: 5 }}>{bw ? measureLabel : unitLabel}</Text>
                              </Pressable>
                              {!bw && (
                                <>
                                  <Text style={{ fontFamily: F.reg, fontSize: 24, color: C.ash, marginHorizontal: 3 }}>×</Text>
                                  <Pressable style={{ flexDirection: "row", alignItems: "baseline", paddingHorizontal: 4 }} onPress={() => inputRefs.current[`${x.uid}:reps`]?.focus()}>
                                    <TextInput
                                      ref={(r) => { inputRefs.current[`${x.uid}:reps`] = r; }}
                                      value={s.reps}
                                      onChangeText={(v) => setSetField(x.uid, i, "reps", v)}
                                      keyboardType="numeric"
                                      placeholder="0"
                                      placeholderTextColor={C.ash}
                                      style={{ fontFamily: F.black, fontSize: 46, letterSpacing: -1.5, color: C.chalk, padding: 0, textAlign: "center", minWidth: 44 }}
                                    />
                                    <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash, marginLeft: 5 }}>{measureLabel}</Text>
                                  </Pressable>
                                </>
                              )}
                            </View>
                            {/* RPE — ONE TAP, not another input row: tapping the
                                chip reveals a single row of value pills (the core
                                RPE scale, RIR-labelled when swapped); tapping a
                                pill sets the number and closes. Tap the picked
                                value again to clear it. */}
                            {prefs.detailed && rpeOpenUid === x.uid && (
                              <View style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6 }}>
                                <Pressable onPress={() => setLoggerPref("rpeAsRir", !prefs.rpeAsRir)} hitSlop={6} accessibilityRole="button" accessibilityLabel={`${prefs.rpeAsRir ? "RIR" : "RPE"} — ${t("rpe.rir")}`}>
                                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 0.9 }}>{`${prefs.rpeAsRir ? "RIR" : "RPE"} ⇄`}</Text>
                                </Pressable>
                                {[...RPE_SCALE].reverse().map((step) => {
                                  const val = String(step.rpe);
                                  const on = s.rpe === val;
                                  return (
                                    <Pressable
                                      key={val}
                                      onPress={() => { setSetField(x.uid, i, "rpe", on ? "" : val); setRpeOpenUid(null); }}
                                      accessibilityRole="button"
                                      accessibilityState={{ selected: on }}
                                      style={{ flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? C.chalk : C.line, backgroundColor: on ? withAlpha(C.chalk, 0.12) : C.ink2 }}
                                    >
                                      <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: on ? "700" : "400", color: on ? C.chalk : C.ash }}>{prefs.rpeAsRir ? step.rir : val}</Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            )}
                            {/* Primary action — a proper, sized Log button (the old
                                floating ＋ is retired). Banks the set + starts rest.
                                The screen's one lime fill in the logging loop. */}
                            <Pressable onPress={() => toggleDone(x.uid, i, true)} accessibilityRole="button" accessibilityLabel={t("workout.logSet")} style={{ marginTop: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: R.cta, backgroundColor: C.lime, paddingVertical: 14, shadowColor: "#000", shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 }}>
                              <Text style={{ fontFamily: F.black, fontSize: fs.body, color: C.onAccent }}>✓</Text>
                              <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.onAccent }}>{t("workout.logSet")}</Text>
                            </Pressable>
                          </View>
                        ) : (() => {
                          // Banked / queued → quiet one-line row (tap a banked one
                          // to re-open it as the active card).
                          const loadPart = !bw && s.load ? `${displayLoad(s.load, prefs.units)} ${unitLabel}` : "";
                          const repsPart = s.reps ? `${s.reps} ${measureLabel}` : "";
                          const summary = [loadPart, repsPart].filter(Boolean).join(" × ") || "—";
                          return (
                            // Quiet ledger row — a plain hairline-separated line,
                            // not a boxed mini-card (no card-in-card).
                            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingVertical: 12, paddingHorizontal: 2, borderBottomWidth: 1, borderBottomColor: withAlpha(C.line, 0.6), opacity: focus === "done" ? 0.62 : 0.72 }}>
                              {grip}
                              <Text style={{ width: 20, fontFamily: F.mono, fontSize: fs.caption, color: typeAccent ? txt(C, typeAccent) : C.ash }}>{setTypeBadge(s, i)}</Text>
                              <Pressable style={{ flex: 1 }} onPress={s.done ? () => toggleDone(x.uid, i, false) : undefined}>
                                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{summary}</Text>
                              </Pressable>
                              <Text style={{ fontFamily: F.black, fontSize: fs.body, color: s.done ? txt(C, C.lime) : C.ash }}>{s.done ? "✓" : "○"}</Text>
                            </View>
                          );
                        })()}
                      </SwipeRow>
                      </Animated.View>
                    );
                  });
                })()}
                {/* "+ Add set" is a split glass tile: the wide zone quick-adds one
                    carry-over set (the incremental lifter's tap loop); the ⋯ zone
                    opens the plan-ahead panel to queue several at once. "⚡ Special"
                    holds warm-up / ramp / cool-down / drop. */}
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "stretch", marginTop: 8 }}>
                  {(() => {
                    const ghost = addSetIsNext(x.sets);
                    return (
                      // "Next move" emphasis is a brighter hairline + bold text —
                      // not another lime fill (de-greened; the Log CTA keeps lime).
                      <View style={{ flexGrow: 1, flexDirection: "row", alignItems: "stretch", borderRadius: R.cta, overflow: "hidden", backgroundColor: C.ink2, borderWidth: 1, borderColor: ghost ? withAlpha(C.chalk, 0.35) : C.line }}>
                        <Pressable onPress={() => addSet(x.uid)} style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 14 }}>
                          <View style={{ width: 20, height: 20, borderRadius: 999, borderWidth: 1.5, borderColor: ghost ? C.chalk : C.ash, alignItems: "center", justifyContent: "center" }}>
                            <Text style={{ fontFamily: F.reg, fontSize: 14, lineHeight: 16, color: ghost ? C.chalk : C.ash }}>＋</Text>
                          </View>
                          <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{t("workout.addSet").replace(/^\+\s*/, "")}</Text>
                        </Pressable>
                        <Pressable onPress={() => { setPlanUid((u) => (u === x.uid ? null : x.uid)); setSpecialUid(null); }} accessibilityLabel={t("w.train.blocks.presetsTitle")} style={{ paddingHorizontal: 14, alignItems: "center", justifyContent: "center", borderLeftWidth: 1, borderLeftColor: ghost ? withAlpha(C.chalk, 0.25) : C.line }}>
                          <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.ash, letterSpacing: 0.9 }}>⋯</Text>
                        </Pressable>
                      </View>
                    );
                  })()}
                  {/* Special = glyph only (the ⚡). Opens the special-set menu. */}
                  <Pressable
                    onPress={() => { setSpecialUid((u) => (u === x.uid ? null : x.uid)); setPlanUid(null); }}
                    accessibilityRole="button"
                    accessibilityLabel={t("w.train.blocks.special")}
                    style={{ width: 48, alignItems: "center", justifyContent: "center", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: R.cta }}
                  >
                    <AuroraIcon name="bolt" size={18} color={txt(C, C.amber)} />
                  </Pressable>
                </View>
                {/* Popular-preset rail — one tap lays out the whole exercise. A
                    single horizontal rail replaces the old nested grid + manual
                    planner; it bleeds to the card's edges (negative margin =
                    card gutter, matching inner padding) so cards slide under the
                    edge, matching the exercise-widget idiom. */}
                {planUid === x.uid && (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash, marginBottom: 10 }}>{t("w.train.blocks.presetsTitle")}</Text>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      style={{ marginHorizontal: -space.lg }}
                      contentContainerStyle={{ paddingHorizontal: space.lg, gap: 10 }}
                    >
                      {([
                        { sets: 3, reps: 3, k: "workout.schemeHeavy" },
                        { sets: 5, reps: 5, k: "workout.schemeStrength" },
                        { sets: 3, reps: 12, k: "workout.schemeHypertrophy" },
                        { sets: 4, reps: 8, k: "workout.schemeVolume" },
                        { sets: 10, reps: 10, k: "workout.schemeGvt" },
                      ] as const).map((p, pi) => (
                        <Pressable
                          key={p.k}
                          onPress={() => { applyPreset(x.uid, p.sets, p.reps); setPlanUid(null); }}
                          style={{ width: 116, paddingVertical: 16, paddingHorizontal: 16, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: pi === 0 ? withAlpha(C.chalk, 0.3) : C.line }}
                        >
                          <Text style={{ fontFamily: F.black, fontSize: 28, letterSpacing: -1, color: C.chalk }}>{p.sets}<Text style={{ fontFamily: F.reg, fontSize: 19, color: C.ash }}>×</Text>{p.reps}</Text>
                          <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, marginTop: 8 }}>{t(p.k)}</Text>
                          <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, marginTop: 10 }}>{p.sets * p.reps} {t("w.train.blocks.presetReps")}</Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}
                {specialUid === x.uid && (
                  <View style={{ marginTop: 8, borderWidth: 1, borderColor: C.line, borderRadius: R.banner, backgroundColor: C.ink2, overflow: "hidden" }}>
                    {[
                      { run: addWarmupSet, c: C.amber, badge: "W", label: t("workout.warmupSetTitle"), desc: t("workout.warmupSetDesc") },
                      { run: addWarmupRamp, c: C.amber, badge: "↗", label: t("workout.warmupRampTitle"), desc: t("workout.warmupRampDesc") },
                      { run: addCooldownSet, c: C.blue, badge: "C", label: t("workout.cooldownSetTitle"), desc: t("workout.cooldownSetDesc") },
                      { run: addDropSet, c: C.ash, badge: "↓", label: t("workout.dropSetTitle"), desc: t("workout.dropSetDesc") },
                    ].map((it, ii) => (
                      <Pressable
                        key={it.badge}
                        onPress={() => { it.run(x.uid); setSpecialUid(null); }}
                        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderTopWidth: ii === 0 ? 0 : 1, borderTopColor: C.line }}
                      >
                        <View style={{ width: 30, height: 30, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: `${it.c}29` }}>
                          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, fontWeight: "700", color: txt(C, it.c) }}>{it.badge}</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{it.label}</Text>
                          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{it.desc}</Text>
                        </View>
                      </Pressable>
                    ))}
                  </View>
                )}
                {/* Quick-increment + plate hint for the last set's load */}
                {(prefs.quickIncrement > 0 || prefs.plateCalc) && (() => {
                  const last = x.sets[x.sets.length - 1];
                  const loadKg = last ? parseFloat(last.load) : NaN;
                  return (
                    <View style={{ marginTop: 8, gap: space.xs }}>
                      {prefs.quickIncrement > 0 && (
                        <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }}>
                          {([-prefs.quickIncrement, prefs.quickIncrement] as const).map((d) => (
                            <Pressable key={d} onPress={() => bumpLastLoad(x.uid, d)} style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: R.field, borderWidth: 1, borderColor: C.line }}>
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
                      <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{parts.join(" – ")}</Text>
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
          </Card>
          </Pressable>
          </Animated.View>
          );
        })}

        {/* Field-styled trigger → searchable modal (matches the sport picker). */}
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 4, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 }}
        >
          <AuroraIcon name="add" size={18} color={txt(C, C.lime)} />
          <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{t("workout.addExercise")}</Text>
          <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.ash }}>▾</Text>
        </Pressable>

        {/* Empty-state quick-starts (parity with the web logger): pull today's
            AI-prescribed session, or load a saved routine, without leaving. */}
        {exercises.length === 0 && (
          <View style={{ marginTop: 12, gap: space.sm }}>
            <Pressable
              onPress={loadPrescribed}
              // free users see the sand "Full" upsell accent; athletes (already unlocked) keep lime — parity with the web logger
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: isAthlete ? C.lime : pa.fill, borderRadius: R.cta, paddingVertical: 12, paddingHorizontal: 16, backgroundColor: `${isAthlete ? C.lime : pa.fill}14` }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: isAthlete ? txt(C, C.lime) : pa.text }}>✦ {t("train.start")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{!isAthlete ? t("train.premium") : recent.length > 0 ? t("train.aiReadiness") : t("train.aiCoach")}</Text>
            </Pressable>
            {routines.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.cta, padding: 12 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 0.9, color: C.ash, marginBottom: 8 }}>{t("train.routines")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                  {routines.map((r) => (
                    <Pressable key={r.id} onPress={() => loadRoutine(r)} style={{ borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, borderRadius: R.chip, paddingVertical: 8, paddingHorizontal: 12 }}>
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
          title={t("workout.pickExercise")}
          recent={recent.map((r) => ({ name: r.name, kind: r.kind }))}
        />

        {/* Exercise detail sheet — per-set pills, live totals, and per-set
            bar-speed (m/s) entry with a set-by-set velocity strip (manual VBT;
            live sensor capture is the blocked vbt-capture capability). */}
        {(() => {
          const x = exercises.find((e) => e.uid === sheetUid) ?? null;
          return (
            <ExerciseSheet
              x={x}
              last={x ? (() => { const l = lastByLift.get(x.name); return l ? blockSummary(l) : undefined; })() : undefined}
              units={prefs.units}
              bodyweightKg={bodyweightKg}
              onVel={(u, i, v) => setSetField(u, i, "vel", v)}
              onClose={() => setSheetUid(null)}
              t={t}
            />
          );
        })()}

        {!!error && <View accessibilityLiveRegion="assertive" accessibilityRole="alert"><Mono color={C.red} style={{ marginTop: 14, textAlign: "center" }}>{error}</Mono></View>}

        {exercises.length > 0 && (
          <View style={{ flexDirection: "row", gap: space.ms, marginTop: 18 }}>
            {/* Pause/hold sits next to Finish — freeze the clock for a phone call,
                a long queue for the rack, or a between-blocks breather. */}
            <Pressable
              onPress={togglePause}
              style={{ paddingHorizontal: 18, borderRadius: R.cta, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: paused ? C.amber : C.line, backgroundColor: paused ? `${C.amber}1f` : "transparent" }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: paused ? txt(C, C.amber) : C.ash }}>
                {paused ? `▶ ${t("workout.resume")}` : `❚❚ ${t("workout.pause")}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={finish}
              disabled={saving}
              style={{ flex: 1, backgroundColor: C.lime, borderRadius: R.cta, paddingVertical: 16, alignItems: "center", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? <ActivityIndicator color={C.onAccent} /> : <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.onAccent }}>{t("w.train.logger.finishWorkout")}</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>
      </KeyboardAvoidingView>

      <RpeHelpModal visible={rpeHelp} onClose={() => setRpeHelp(false)} t={t} />

      {/* Get-ready count-in — covers the screen on a fresh start until GO. */}
      {countdown != null && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, letterSpacing: 3, marginBottom: 12 }}>
            {t("workout.getReady").toUpperCase()}
          </Text>
          <Text style={{ fontFamily: F.black, fontSize: countdown > 0 ? 132 : 96, color: txt(C, C.lime) }}>
            {countdown > 0 ? countdown : t("workout.go")}
          </Text>
        </View>
      )}
    </SafeAreaView>
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
  last,
  units,
  bodyweightKg,
  onVel,
  onClose,
  t,
}: {
  x: WExercise | null;
  last?: string;
  units: WeightUnit;
  bodyweightKg?: number | null;
  onVel: (u: string, i: number, v: string) => void;
  onClose: () => void;
  t: (k: string) => string;
}) {
  const C = useTheme().palette;
  const [sel, setSel] = useState(0);
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
          <View style={{ marginTop: 18 }}>
            {/* Flat totals — big number over a small mono label, no boxes. */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 36 }}>
              <View>
                <Text style={{ fontFamily: F.black, fontSize: 26, letterSpacing: -0.5, color: C.chalk }}>{fmtTonnage(ls.volumeKg, units)}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, marginTop: 3 }}>{t("workout.totalVolume")}</Text>
              </View>
              <View>
                <Text style={{ fontFamily: F.black, fontSize: 26, letterSpacing: -0.5, color: C.chalk }}>{setLine}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, marginTop: 3 }}>{`${t("workout.setWord")} ${i + 1}`}</Text>
              </View>
            </View>

            {/* ONE velocity module — the unit is named once, with the mean. */}
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginTop: 24, marginBottom: 12 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{`${t("workout.barSpeed")} (m/s)`}</Text>
              {ls.meanVel != null && (
                <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.chalk }}>{`${t("workout.meanWord")} ${ls.meanVel}`}</Text>
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
                        style={{ fontFamily: F.mono, fontSize: 13, fontWeight: "700", color: C.chalk, textAlign: "center", minWidth: 46, padding: 0, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: withAlpha(C.chalk, 0.55), marginBottom: 6 }}
                      />
                    ) : (
                      <Text style={{ fontFamily: F.mono, fontSize: 11, color: v != null ? C.chalk : C.ash, marginBottom: 8 }}>{v != null ? String(v) : "–"}</Text>
                    )}
                    <View style={{ alignSelf: "stretch", marginHorizontal: 10, height: h, borderTopLeftRadius: 3, borderTopRightRadius: 3, backgroundColor: on ? txt(C, C.lime) : v != null ? withAlpha(C.chalk, 0.4) : withAlpha(C.line, 1) }} />
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
              {x.sets.map((st, j) => (
                <Pressable key={st.uid ?? j} onPress={() => setSel(j)} style={{ flex: 1, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.mono, fontSize: 9, color: j === i ? C.chalk : C.ash }}>
                    {`${j + 1}${st.done ? " ✓" : ""}`}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, lineHeight: 15, marginTop: 16 }}>{t("workout.velHint")}</Text>
          </View>
        );
      })()
    : null;

  return (
    <Sheet visible={!!x} onClose={onClose} title={x?.name} sub={last ? `${t("workout.lastTime")} – ${last}` : undefined}>
      {body}
    </Sheet>
  );
}

// The RPE cheatsheet — same scale (from @hybrid/core) the web logger shows.
function RpeHelpModal({ visible, onClose, t }: { visible: boolean; onClose: () => void; t: (k: string) => string }) {
  const C = useTheme().palette;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line, padding: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.train.blocks.rpeHelpTitle")}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("rpe.close")}</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, lineHeight: 19, marginBottom: 16 }}>{RPE_INTRO}</Text>
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            <Text style={{ width: 40, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 0.9 }}>RPE</Text>
            <Text style={{ width: 56, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 0.9 }}>{t("rpe.rir")}</Text>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 0.9 }}>{t("rpe.feels")}</Text>
          </View>
          {RPE_SCALE.map((step) => (
            <View key={step.rpe} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ width: 40, fontFamily: F.bold, fontSize: fs.bodyLg, color: txt(C, C.lime) }}>{step.rpe}</Text>
              <Text style={{ width: 56, fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>{step.rir}</Text>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, color: C.chalk }}>{step.meaning}</Text>
            </View>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
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
  const aurora = useTemplate().template === "aurora";
  const R = auroraRadii(aurora);
  const bodyweightKg = useBodyweightLookup()();
  const bwLookup = useBodyweightLookup();
  // "vs your usual" on the feel prompt — the athlete against THEMSELVES over the
  // last month, from the sessions they'd already rated before this one.
  const feelBaseline = useMemo(() => loadBaseline(feelSamples(prior, bwLookup)), [prior, bwLookup]);
  // Carousel: one ref per slide's off-screen story card; Share captures the
  // currently-visible slide. Story capture width is a touch under the screen so
  // the device pixel ratio scales the exported PNG up toward 1080px.
  const slideW = Dimensions.get("window").width - 36;
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
    if (haptics) Haptics.selectionAsync().catch(() => {});
  };
  // The ★ satellite expands the save-as-routine composer beneath the cluster.
  const [routineOpen, setRoutineOpen] = useState(false);
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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (milestone) {
        knock = setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {}), 150);
      }
    }
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 5, tension: 90, useNativeDriver: true }),
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
  // What a PR row says on the right — shared with web so the three-way branch
  // can't drift ("+0 kg" would read as no progress at all).
  const prDelta = (p: PrHit) =>
    strengthPrDelta(p, { first: t("summary.firstTime"), moreReps: t("summary.morePrReps") }, units);

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

  // ── Build the shareable slides (Overview · PRs & bests · Muscle · Fun) ──
  const muscleVol = volumeByMuscle(summary.blocks, false, bodyweightKg);
  const muscleMax = muscleVol[0]?.volume ?? 0;
  const funFact = sessionFunFact(summary.blocks, bodyweightKg);
  const prRows: { left: string; right: string; hot?: boolean }[] = [
    ...prs.map((p) => ({ left: p.lift, right: prDelta(p), hot: true })),
    ...cardioPrs.map((p) => ({ left: cardioPrLine(p, t), right: "", hot: true })),
    ...bests.filter((b) => !prs.some((p) => p.lift === b.name)).slice(0, 6).map((b) => ({ left: b.name, right: fmtWeight(b.weight, units) })),
  ];
  // Pluralized, matching web — "1 new PR", not "1 new PRs".
  const prHeadline = prs.length > 0
    ? `🏆 ${prs.length} ${prs.length > 1 ? t("w.train.logger.newPrs") : t("w.train.logger.newPr")}`
    : cardioPrs.length > 0
      ? `🏃 ${cardioPrs.length} ${cardioPrs.length > 1 ? t("w.train.logger.cardioPrs") : t("w.train.logger.cardioPr")}`
      : t("summary.todaysBests");
  const slides: SlideData[] = [
    { kind: "overview", eyebrow: t("summary.slide.overview"), stats: { title, minutes: summary.minutes, sets: summary.sets, volume: summary.volume, bests }, firstEver },
    { kind: "stat", eyebrow: t("summary.slide.time"), value: String(summary.minutes), unit: t("summary.minutes") },
    { kind: "stat", eyebrow: t("summary.slide.load"), value: fmtTonnage(summary.volume, units), unit: t("summary.volumeMoved") },
    { kind: "prs", eyebrow: t("summary.slide.prs"), headline: prHeadline, rows: prRows.length ? prRows : [{ left: t("summary.noPrsYet"), right: "" }] },
    ...(muscleVol.length ? [{ kind: "muscle", eyebrow: t("summary.slide.muscle"), bars: muscleVol.slice(0, 6).map((m) => ({ label: t(`muscle.${m.muscle}`), pct: muscleMax ? Math.round((m.volume / muscleMax) * 100) : 0, value: fmtWeight(m.volume, units) })) } as SlideData] : []),
    ...(funFact ? [{ kind: "fun", eyebrow: t("summary.slide.fun"), emoji: funFact.emoji, text: funFactText(funFact, units, t) } as SlideData] : []),
  ];
  const activeIdx = Math.min(active, slides.length - 1);

  // LIQUID FIELD — the card floats in an intensified Aurora field; every control
  // is the same glass material. Share is the one filled (lime) action; routine +
  // analysis are glass satellites at its sides; exit is a glass ✕ up top.
  const shareNow = () => shareWorkout({ current: storyRefs.current[activeIdx] ?? null }, shareText, t("summary.shareStory"));
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top", "bottom"]}>
      {aurora && <AuroraField />}
      <FinishField />
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 28, flexGrow: 1 }}>
        {/* The one exit — where dismissal muscle memory expects it. Guests leave
            to the welcome screen (there's no Today tab behind them). */}
        <SummaryOrb
          glyph="✕"
          size={40}
          a11y={t("summary.doneToday")}
          onPress={() => router.replace(summary.guest ? "/welcome" : "/(tabs)")}
        />

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
              style={{ width: i === activeIdx ? 18 : 6, height: 6, borderRadius: 3, backgroundColor: i === activeIdx ? C.lime : C.line }}
            />
          ))}
        </View>

        {/* One whisper of a hint — the current look + how to change it. */}
        <Mono color={C.ash} style={{ textAlign: "center", marginTop: 10, fontSize: fs.nano, letterSpacing: 1.2 }}>
          {`${t(st.nameKey)} — ${t("summary.cardHint")}`.toUpperCase()}
        </Mono>

        {/* "How did that feel?" — THE IMMEDIATE READ, asked here because this is
            the only moment it can be asked. Effort is sRPE; spentness now is the
            anchor the recovery read on Today is measured against hours later.
            The daily card asks the second half; it does not replace this one.
            See core/feel-schedule.ts. */}
        {!summary.guest && (
          <FeelPrompt compact sessionId={summary.sessionId} minutes={summary.minutes} baseline={feelBaseline} />
        )}

        {!summary.guest && <SummaryRename sessionId={summary.sessionId} value={title} onRenamed={setTitle} t={t} />}
        {!summary.guest && <SummaryNote sessionId={summary.sessionId} t={t} />}

        {summary.pending && (
          <View style={{ backgroundColor: `${C.amber}14`, borderWidth: 1, borderColor: `${C.amber}55`, borderRadius: 16, padding: 14, marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber) }}>⟲ {t("summary.pendingSync")}</Text>
          </View>
        )}

        <View style={{ flex: 1, minHeight: 20 }} />

        {summary.guest ? (
          <>
            <Pressable
              onPress={shareNow}
              style={{
                backgroundColor: `${C.lime}28`,
                borderWidth: 1,
                borderColor: `${C.lime}66`,
                borderRadius: R.cta,
                paddingVertical: 16,
                alignItems: "center",
                marginTop: 16,
              }}
            >
              <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>↗︎ {shareLabel}</Text>
            </Pressable>
            <View style={{ backgroundColor: `${C.violet}14`, borderWidth: 1, borderColor: `${C.violet}55`, borderRadius: 16, padding: 14, marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.violet) }}>✓ {t("summary.guestSaved")}</Text>
            </View>
            <Pressable
              onPress={() => router.replace("/login?mode=signup")}
              style={{ backgroundColor: C.violet, borderRadius: R.cta, paddingVertical: 16, alignItems: "center", marginTop: 12 }}
            >
              <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>{t("summary.guestSave")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.chalk, opacity: 0.8, marginTop: 3 }}>{t("summary.guestSaveSub")}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/welcome")} style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("summary.notNow")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            {/* The floating pill cluster — hierarchy by material: lime fill for
                Share, glass for the two satellites, nothing else competing. */}
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop: 16 }}>
              <SummaryOrb
                glyph="★"
                label={t("summary.orbRoutine")}
                a11y={t("summary.saveRoutine")}
                on={routineOpen}
                onPress={() => setRoutineOpen((v) => !v)}
              />
              <Pressable
                onPress={shareNow}
                style={{
                  flex: 1,
                  backgroundColor: `${C.lime}28`,
                  borderWidth: 1,
                  borderColor: `${C.lime}66`,
                  borderRadius: R.cta,
                  paddingVertical: 16,
                  alignItems: "center",
                }}
              >
                <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>↗︎ {shareLabel}</Text>
              </Pressable>
              <SummaryOrb
                glyph="→"
                label={t("summary.orbAnalysis")}
                a11y={t("summary.seeAnalysis")}
                onPress={() => router.replace("/history")}
              />
            </View>
            {routineOpen && <SaveRoutine key={title} title={title} blocks={summary.blocks} t={t} startOpen />}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A floating glass satellite — the Liquid-Field secondary action. A translucent
 *  chalk-tinted circle (a native SwiftUI glass surface when Liquid Glass is
 *  active) holding one glyph, with an optional micro label beneath. Secondary by
 *  material: the lime Share pill stays the only filled action on this screen. */
function SummaryOrb({
  glyph,
  a11y,
  onPress,
  size = 54,
  label,
  on,
}: {
  glyph: string;
  a11y: string;
  onPress: () => void;
  size?: number;
  label?: string;
  on?: boolean;
}) {
  const C = useTheme().palette;
  const glass = LIQUID_GLASS_SUPPORTED;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      hitSlop={6}
      style={{ alignItems: "center", width: label ? Math.max(size, 60) : size }}
    >
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: glass ? "transparent" : withAlpha(C.chalk, on ? 0.16 : 0.08),
          borderWidth: 1,
          borderColor: withAlpha(C.chalk, on ? 0.3 : 0.14),
        }}
      >
        {glass && <GlassSurface radius={size / 2} />}
        <Text style={{ fontFamily: F.bold, fontSize: Math.round(size * 0.36), color: C.chalk }}>{glyph}</Text>
      </View>
      {label != null && (
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, color: C.ash, marginTop: 6 }}>
          {label.toUpperCase()}
        </Text>
      )}
    </Pressable>
  );
}

/** The LIQUID FIELD environment — two oversized soft glow orbs (lime + teal)
 *  drifting slowly behind the finish screen: an intensified take on the ambient
 *  AuroraField, and the web Finish's .ff-a/.ff-b discs at parity. RN has no
 *  cheap blur/radial primitive, so each glow is three concentric translucent
 *  circles faking the falloff — the same technique as the story-card discs.
 *  Reduce Motion parks the drift at its midpoint; KYOTO HOUR swaps the accent
 *  glow for the warm washi tones the AuroraField light retint uses. */
function FinishField() {
  const { palette, scheme } = useTheme();
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
  const japandi = scheme === "light";
  const glowA = japandi ? "#e7e0cc" : palette.lime;
  const glowB = japandi ? "#d9ddd0" : palette.blue;
  // Outer→inner layer alphas (they stack, so the centre reads brightest).
  const alphas = japandi ? [0.2, 0.16, 0.13] : [0.045, 0.055, 0.07];
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
  const R = auroraRadii(useTemplate().template === "aurora");
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
    return <Mono color={C.lime} style={{ textAlign: "center", marginTop: 18 }}>{t("w.train.logger.savedRoutine")}</Mono>;

  // Free user at the routine limit → upsell card (a stale count that lets a
  // save through still lands here when it fails); logging/building stays free.
  if (!allowed || state === "upsell")
    return (
      <View style={{ borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}14`, borderRadius: 16, padding: 14, marginTop: 18 }}>
        <Mono color={C.lime} style={{ fontSize: fs.micro, letterSpacing: 0.9 }}>✦ {t("w.train.logger.routineFullTitle").toUpperCase()}</Mono>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6, lineHeight: 17 }}>{t("w.train.logger.routineFullBlurb")}</Text>
        <Pressable
          onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "save-routine" }); router.push("/upgrade"); }}
          style={{ backgroundColor: C.lime, borderRadius: R.cta, paddingVertical: 12, alignItems: "center", marginTop: 12 }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.onAccent }}>{t("w.train.logger.routineUnlock")}</Text>
        </Pressable>
      </View>
    );

  if (!open)
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}14`, borderRadius: R.cta, paddingVertical: 16, alignItems: "center", marginTop: 18 }}
      >
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: txt(C, C.lime) }}>★ {t("summary.saveRoutine")}</Text>
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
    <View style={{ borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}14`, borderRadius: 16, padding: 14, marginTop: 18 }}>
      <Mono color={C.lime} style={{ fontSize: fs.micro, letterSpacing: 0.9 }}>{t("summary.saveRoutine").toUpperCase()}</Mono>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Routine name"
        placeholderTextColor={C.ash}
        style={{ marginTop: 8, fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: R.field, paddingHorizontal: 12, paddingVertical: 10 }}
      />
      <Pressable
        onPress={save}
        disabled={state === "saving"}
        style={{ backgroundColor: C.lime, borderRadius: R.cta, paddingVertical: 12, alignItems: "center", marginTop: 10, opacity: state === "saving" ? 0.6 : 1 }}
      >
        <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.onAccent }}>{state === "saving" ? "…" : t("summary.saveRoutine")}</Text>
      </Pressable>
    </View>
  );
}

// Optional rename of the just-finished session — "you can add a name after you
// finish", but it's optional (most never do). Collapsed to a subtle link;
// expands to an input that PATCHes the saved session's title.
function SummaryRename({ sessionId, value, onRenamed, t }: { sessionId: string | null; value: string; onRenamed: (title: string) => void; t: (k: string) => string }) {
  const C = useTheme().palette;
  const R = auroraRadii(useTemplate().template === "aurora");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(value);

  if (!open)
    return (
      <Pressable onPress={() => setOpen(true)} style={{ alignSelf: "center", marginTop: 14, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: R.cta, paddingVertical: 8, paddingHorizontal: 16 }}>
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
    <View style={{ flexDirection: "row", gap: 8, marginTop: 14, alignItems: "center" }}>
      <TextInput
        value={name}
        onChangeText={setName}
        autoFocus
        onSubmitEditing={commit}
        placeholder={t("workout.nameWorkout")}
        placeholderTextColor={C.ash}
        style={{ flex: 1, fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: R.field, paddingHorizontal: 12, paddingVertical: 10, textAlign: "center" }}
      />
      <Pressable onPress={commit} style={{ backgroundColor: C.lime, borderRadius: R.field, paddingVertical: 10, paddingHorizontal: 16 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.onAccent }}>✓</Text>
      </Pressable>
    </View>
  );
}

// A PRIVATE post-workout note — free text + a quick mood tap + context tags,
// PATCHed onto the just-finished session (owner-only). Collapsed to a subtle
// link like the rename; pill → composer → saved. Mirrors the web SessionNote.
function SummaryNote({ sessionId, t }: { sessionId: string | null; t: (k: string) => string }) {
  const C = useTheme().palette;
  const R = auroraRadii(useTemplate().template === "aurora");
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
      <Pressable onPress={() => setOpen(true)} style={{ alignSelf: "center", marginTop: 10, borderWidth: 1, borderColor: C.line, borderStyle: "dashed", borderRadius: R.cta, paddingVertical: 8, paddingHorizontal: 16 }}>
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
    <View style={{ width: "100%", marginTop: 12, borderWidth: 1, borderColor: C.line, borderRadius: 16, backgroundColor: C.ink2, padding: 14 }}>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={t("w.train.note.ph")}
        placeholderTextColor={C.ash}
        multiline
        style={{ minHeight: 44, fontFamily: F.reg, fontSize: fs.body, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: R.field, paddingHorizontal: 12, paddingVertical: 8, textAlignVertical: "top" }}
      />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.ash }}>{t("w.train.note.mood-q")}</Text>
        {MOODS.map((m) => {
          const on = mood === m.value;
          return (
            <Pressable key={m.value} onPress={() => setMood(on ? null : m.value)} accessibilityLabel={t(m.labelKey)} style={{ width: 32, height: 32, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: on ? `${C.lime}1a` : C.ink, borderWidth: 1, borderColor: on ? C.lime : C.line }}>
              <Text style={{ fontSize: 15 }}>{m.emoji}</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {SUGGESTED_TAGS.map((tg) => {
          const on = tags.includes(tg.slug);
          const k = tagLabelKey(tg.slug);
          return (
            <Pressable key={tg.slug} onPress={() => toggleTag(tg.slug)} style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: on ? C.lime : C.ink, borderWidth: 1, borderColor: on ? C.lime : C.line }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: on ? C.onAccent : C.ash }}>#{k ? t(k) : tg.slug}</Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable onPress={commit} disabled={saving} style={{ marginTop: 12, backgroundColor: C.lime, borderRadius: R.field, paddingVertical: 12, alignItems: "center", opacity: saving ? 0.6 : 1 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.onAccent }}>{t("common.save")}</Text>
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
function LiveStat({ C, label, value }: { C: Palette; label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 12, paddingVertical: 8, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line }}>
      <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 0.9, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

// Set-your-bodyweight nudge — a quiet amber card the logger shows when the
// session has a bodyweight lift and no weight is on file (its tonnage would
// read 0). Set it inline: POST /api/body then refreshBodyweight() recomputes
// the live volume and the card self-dismisses. Parity with the web logger.
function BodyweightNudge({ C, R, t, units }: { C: Palette; R: ReturnType<typeof auroraRadii>; t: (k: string) => string; units: WeightUnit }) {
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
    <View style={{ backgroundColor: `${a}12`, borderWidth: 1, borderColor: `${a}44`, borderRadius: R.banner, padding: 14, marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, a), flex: 1 }}>⚖️ {t("w.train.logger.bwNudgeTitle")}</Text>
        <Pressable onPress={() => setDismissed(true)} hitSlop={8} accessibilityLabel={t("w.train.logger.bwNudgeDismiss")}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.ash }}>✕</Text>
        </Pressable>
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk, lineHeight: 18, marginBottom: 10 }}>{t("w.train.logger.bwNudgeBody")}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: C.ink2, borderWidth: 1, borderColor: state === "error" ? C.red : C.line, borderRadius: R.field, paddingHorizontal: 12 }}>
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
        <Pressable onPress={save} disabled={state === "saving"} style={{ backgroundColor: a, borderRadius: R.cta, paddingVertical: 10, paddingHorizontal: 16, opacity: state === "saving" ? 0.6 : 1 }}>
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
  const R = auroraRadii(useTemplate().template === "aurora");
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType={keyboard}
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.subtitle, color: done ? C.ash : C.chalk, textAlign: "center", backgroundColor: active ? "transparent" : C.ink2, borderWidth: 1, borderColor: active ? `${C.lime}66` : C.line, borderRadius: R.field, paddingVertical: 10 }}
    />
  );
}

function ColHead({ children, w }: { children: React.ReactNode; w?: number }) {
  const C = useTheme().palette;
  return (
    <Text style={{ flex: w ? undefined : 1, width: w, textAlign: "center", fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 0.9 }}>
      {children}
    </Text>
  );
}
