import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Modal, Animated, PanResponder, KeyboardAvoidingView, Platform, Dimensions, AccessibilityInfo } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter, useLocalSearchParams } from "expo-router";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  planProgramToday,
  sessionVolume,
  blockBestE1rm,
  newPrsInSession,
  newCardioPrsInSession,
  liveSessionStats,
  exerciseHistory,
  inferBlockKind,
  migrateBlocks,
  olympicSportsByCategory,
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
  moveItem,
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
  MOVEMENTS,
  volumeByMuscle,
  sessionFunFact,
  funFactText,
  STORY_STYLES,
  DEFAULT_STORY_STYLE,
  type StoryStyleId,
  exercisesByCategory,
  FUNNEL,
  canSaveRoutine,
  type SessionBlock,
  type LoggedSession,
  type PrHit,
  type CardioPrHit,
  type ExerciseUse,
} from "@hybrid/core";
import { fetchSessions, createSession, renameSession, fetchRoutines, createRoutine, fetchMacrocycle, type NewSession, type Routine } from "../lib/api";
import { useRevalidate, useExercises } from "../lib/queries";
import { saveGuestSession, listGuestSessions } from "../lib/guest";
import { loadDraft, saveDraft, clearDraft } from "../lib/draft";
import { shareWorkout, SlideStoryCard, type ShareBest, type SlideData } from "../lib/share";
import { useSession } from "../lib/session";
import { usePersona } from "../lib/persona";
import { readPlanMaxes } from "../lib/plan-maxes";
import { track } from "../lib/track";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { fs, space, F, Mono, Card } from "../lib/ui";
import { useTheme, txt, type Palette } from "../lib/theme";
import { AuroraIcon } from "../components/aurora/icons";
import { useTemplate } from "../lib/template";
import { AuroraField } from "../components/aurora/kit";

// Aurora rounds everything more — pill CTAs and softer cards/banners. These
// helpers let the live logger pick up the new look without duplicating its
// (large, stateful) logic; classic radii are preserved when not on Aurora.
const auroraRadii = (aurora: boolean) => ({
  cta: aurora ? 999 : 14,
  banner: aurora ? 20 : 12,
  field: aurora ? 14 : 10,
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

type WSet = { uid: string; reps: string; load: string; rpe: string; done: boolean; drop?: boolean; role?: SetRole; rest?: number };

// Default rest the countdown targets before you pick a preset — so a new user
// always sees a counting-down timer (not a stopwatch climbing with no end).
const DEFAULT_REST = 90;
// Sources that are always a deliberate fresh start (so we can show the get-ready
// count-in from the first frame). An empty source may instead resume a draft.
const FRESH_SOURCES = new Set(["new", "ai", "last", "template", "plan", "sport"]);
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
});

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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
  const aurora = useTemplate().template === "aurora";
  const R = auroraRadii(aurora);
  const router = useRouter();
  const { t } = useLang();
  const { session } = useSession();
  const revalidate = useRevalidate();
  const { catalog, aliases, categoryByName } = useExercises();
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
  const { source, templateId, sport } = useLocalSearchParams<{ source?: string; templateId?: string; sport?: string }>();

  // Auto-titled — no name input while logging; a name is only entered on the
  // summary (Save as routine, or the optional rename). Seeded by source below.
  const [title, setTitle] = useState(() => defaultSessionTitle());
  // Which exercise has its "Special ▾" add-set menu open (warm-up / ramp /
  // cool-down / drop). One primary "+ Add set" keeps the common path one tap.
  const [specialUid, setSpecialUid] = useState<string | null>(null);
  const [exercises, setExercises] = useState<WExercise[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [custom, setCustom] = useState("");
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
  useEffect(() => {
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
        const log = toTrainingLog(sessions);
        const rx = prescribeSession(log, undefined, { profiles: velocityProfiles(sessions) });
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
          setTitle(`${today.planName} · ${today.day}`);
          setExercises(blocksToExercises(today.blocks));
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
  }, [source, guest, templateId, sport]);

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
  const loadPrescribed = () => {
    if (!gateAI("workout-ai")) return;
    const log = toTrainingLog(prior.current);
    const rx = prescribeSession(log, undefined, { profiles: velocityProfiles(prior.current) });
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
    setCustom("");
  };
  const removeExercise = (u: string) => setExercises((xs) => xs.filter((x) => x.uid !== u));
  const moveExercise = (u: string, dir: -1 | 1) =>
    setExercises((xs) => moveItem(xs, xs.findIndex((x) => x.uid === u), dir));
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
  const condField = (u: string, k: "minutes" | "rpe" | "distance", v: string) =>
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
  // Reorder a set within an exercise (the ↑/↓ controls on each row).
  const moveSet = (u: string, i: number, dir: -1 | 1) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, sets: moveItem(x.sets, i, dir) } : x)));
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
        blocks.push({
          kind: "cardio",
          name: x.name,
          ...(distance != null ? { distance } : {}),
          ...(Number.isFinite(minutes) ? { minutes } : {}),
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
  const live = useMemo(() => liveSessionStats(buildBlocks(), prior.current), [exercises]);

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
    const prs = newPrsInSession(finished, prior.current);
    const cardioPrs = newCardioPrsInSession(finished, prior.current);
    const prSet = new Set(prs.map((p) => p.lift));
    const bestMap = new Map<string, number>();
    for (const b of blocks)
      if (b.kind === "strength") {
        const e = Math.round(blockBestE1rm(b));
        if (e > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, e));
      }
    const bests: ShareBest[] = [...bestMap.entries()]
      .map(([name, e1rm]) => ({ name, e1rm, pr: prSet.has(name) }))
      .sort((a, b) => b.e1rm - a.e1rm);

    setSummary({
      sessionId,
      title: payload.title,
      blocks,
      volume: sessionVolume(blocks),
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

  if (phase === "done" && summary) return <Summary summary={summary} router={router} t={t} units={prefs.units} haptics={prefs.haptics} />;

  const ssLabels = supersetLabels(exercises);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top"]}>
      {/* Aurora's ambient blob field behind the logger — the live screen owns its
          own shell (sticky timer header), so it drops in the same backdrop the
          rest of the Aurora app uses rather than wrapping in AuroraScreen. */}
      {aurora && <AuroraField />}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 64 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("workout.cancel")}</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: paused ? txt(C, C.amber) : C.chalk, letterSpacing: 1 }}>{mmss(elapsed)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: paused ? txt(C, C.amber) : C.ash, letterSpacing: 1 }}>{paused ? t("workout.paused") : t("workout.elapsed")}</Text>
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
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Mono style={{ flex: 1 }}>
            {exercises.length
              ? `${exercises.length} ${t("workout.exercises")} · ${t("workout.tapAsYouGo")}`
              : t("workout.firstExercise")}
          </Mono>
          <Pressable onPress={() => setRpeHelp(true)} hitSlop={8}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.blue) }}>{t("workout.rpeWhat")}</Text>
          </Pressable>
        </View>

        {/* Live in-session scoreboard — appears once the first set is logged. */}
        {live.sets > 0 && (
          <View style={{ flexDirection: "row", gap: space.sm, marginBottom: 14 }}>
            <LiveStat C={C} label={t("live.exercises")} value={String(live.exercises)} />
            <LiveStat C={C} label={t("live.sets")} value={String(live.sets)} />
            <LiveStat C={C} label={t("live.volume")} value={fmtTonnage(live.volume, prefs.units)} />
            {live.prs + live.cardioPrs > 0 && (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", borderRadius: R.field, paddingVertical: 8, backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: C.lime }}>
                <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: txt(C, C.lime) }}>🏆 {live.prs + live.cardioPrs}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: 9, color: txt(C, C.lime), letterSpacing: 1, marginTop: 2 }}>{live.prs + live.cardioPrs === 1 ? t("live.pr") : t("live.prs")}</Text>
              </View>
            )}
          </View>
        )}

        {showTip && (
          <View style={{ backgroundColor: `${C.lime}12`, borderWidth: 1, borderColor: `${C.lime}44`, borderRadius: R.banner, padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.lime) }}>{t("workout.tipTitle")}</Text>
              <Pressable onPress={dismissTip} hitSlop={8}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: txt(C, C.lime) }}>{t("workout.tipGot")}</Text>
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
                  {done ? t("workout.restDone") : t("workout.resting")} · {clock}
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
                      style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: R.field, borderWidth: 1, borderColor: on ? C.blue : C.line, backgroundColor: on ? `${C.blue}22` : "transparent" }}
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
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: 10 }}>
              <DragHandle onStart={() => beginDrag(x.uid)} onMove={moveDrag} onEnd={endDrag} color={dragging ? txt(C, C.lime) : C.ash} />
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: x.kind === "strength" ? txt(C, C.lime) : x.kind === "cardio" ? txt(C, C.blue) : txt(C, C.violet) }}>
                {x.kind.toUpperCase()}
              </Text>
              {ssLabels[xi] && (
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime), backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: `${C.lime}55`, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>⛓ {ssLabels[xi]}</Text>
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
                    style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: R.field, borderWidth: 1, borderColor: joined ? C.lime : C.line, backgroundColor: joined ? `${C.lime}1f` : "transparent" }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: joined ? txt(C, C.lime) : C.ash }}>⛓ {joined ? t("workout.supersetJoined") : t("workout.superset")}</Text>
                  </Pressable>
                );
              })()}
              <Pressable onPress={() => moveExercise(x.uid, -1)} disabled={xi === 0} hitSlop={14}>
                <Text style={{ color: xi === 0 ? C.line : C.ash, fontSize: fs.note }}>↑</Text>
              </Pressable>
              <Pressable onPress={() => moveExercise(x.uid, 1)} disabled={xi === exercises.length - 1} hitSlop={14}>
                <Text style={{ color: xi === exercises.length - 1 ? C.line : C.ash, fontSize: fs.note }}>↓</Text>
              </Pressable>
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
                      {t("workout.lastTime")} · {blockSummary(last)}
                    </Text>
                  ) : null;
                })()}
                <View style={{ flexDirection: "row", gap: space.xs, marginBottom: 4 }}>
                  <ColHead w={28}>#</ColHead>
                  <ColHead>{prefs.units === "lb" ? "LB" : "KG"}</ColHead>
                  <ColHead>REPS</ColHead>
                  {prefs.detailed && <ColHead>{prefs.rpeAsRir ? "RIR" : "RPE"}</ColHead>}
                  <View style={{ width: 22 }} />
                  <View style={{ width: 40 }} />
                </View>
                {x.sets.map((s, i) => (
                  <SwipeRow key={s.uid ?? i} label={t("workout.deleteSet")} onDelete={() => removeSet(x.uid, i)}>
                    <View style={{ flexDirection: "row", gap: space.xs, alignItems: "center" }}>
                    {(() => {
                      const st = setType(s);
                      const accent = st === "warmup" ? C.amber : st === "cooldown" ? C.blue : st === "drop" ? C.lime : null;
                      return (
                        <Pressable
                          onPress={() => cycleType(x.uid, i)}
                          onLongPress={() => removeSet(x.uid, i)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          style={{ width: 28, height: 30, borderRadius: R.field, alignItems: "center", justifyContent: "center", borderWidth: accent ? 1 : 0, borderColor: accent ?? C.line, backgroundColor: accent ? `${accent}1f` : "transparent" }}
                        >
                          <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: accent ? txt(C, accent) : C.ash }}>{setTypeBadge(s, i)}</Text>
                        </Pressable>
                      );
                    })()}
                    <Cell value={displayLoad(s.load, prefs.units)} onChange={(v) => setSetField(x.uid, i, "load", storeLoad(v, prefs.units))} done={s.done} />
                    <Cell value={s.reps} onChange={(v) => setSetField(x.uid, i, "reps", v)} done={s.done} />
                    {prefs.detailed && <Cell value={rpeRirSwap(s.rpe, prefs.rpeAsRir)} onChange={(v) => setSetField(x.uid, i, "rpe", rpeRirSwap(v, prefs.rpeAsRir))} done={s.done} />}
                    <View style={{ width: 22, justifyContent: "center" }}>
                      <Pressable onPress={() => moveSet(x.uid, i, -1)} disabled={i === 0} hitSlop={12} style={{ alignItems: "center" }}>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: i === 0 ? C.line : C.ash }}>↑</Text>
                      </Pressable>
                      <Pressable onPress={() => moveSet(x.uid, i, 1)} disabled={i === x.sets.length - 1} hitSlop={12} style={{ alignItems: "center" }}>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: i === x.sets.length - 1 ? C.line : C.ash }}>↓</Text>
                      </Pressable>
                    </View>
                    <Pressable
                      onPress={() => toggleDone(x.uid, i, !s.done)}
                      style={{ width: 40, height: 40, borderRadius: R.field, alignItems: "center", justifyContent: "center", backgroundColor: s.done ? C.lime : C.ink2, borderWidth: 1, borderColor: s.done ? C.lime : C.line }}
                    >
                      <Text style={{ fontSize: fs.subtitle, color: s.done ? C.ink : C.ash, fontFamily: F.black }}>✓</Text>
                    </Pressable>
                    </View>
                  </SwipeRow>
                ))}
                {/* Add-set control: one primary "+ Add set", with warm-up / ramp
                    / cool-down / drop in a "Special ▾" menu (instead of a row of
                    five). The set badge still re-types a set with a tap. */}
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", marginTop: 4 }}>
                  <Pressable onPress={() => addSet(x.uid)} style={{ backgroundColor: C.lime, borderRadius: R.cta, paddingVertical: 9, paddingHorizontal: 18 }}>
                    <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: C.ink }}>{t("workout.addSet")}</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setSpecialUid((u) => (u === x.uid ? null : x.uid))}
                    style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: C.line, borderRadius: R.cta, paddingVertical: 8, paddingHorizontal: 14 }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("workout.special")} {specialUid === x.uid ? "▴" : "▾"}</Text>
                  </Pressable>
                </View>
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
                        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, paddingHorizontal: 14, borderTopWidth: ii === 0 ? 0 : 1, borderTopColor: C.line }}
                      >
                        <View style={{ width: 30, height: 30, borderRadius: 9, alignItems: "center", justifyContent: "center", backgroundColor: `${it.c}29` }}>
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
                              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: txt(C, C.lime) }}>{d > 0 ? `+${d}` : d}</Text>
                            </Pressable>
                          ))}
                          <Mono style={{ fontSize: fs.micro }}>{prefs.units}</Mono>
                        </View>
                      )}
                      {prefs.plateCalc && Number.isFinite(loadKg) && loadKg > 0 && (() => {
                        const pl = platesPerSide(loadKg, prefs.units);
                        return (
                          <Mono style={{ fontSize: fs.micro }}>
                            {pl.perSide.length ? `Per side: ${pl.perSide.join(" · ")}${pl.remainder ? " ≈" : ""}` : `Bar only (${pl.bar} ${prefs.units})`}
                          </Mono>
                        );
                      })()}
                    </View>
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
          </Animated.View>
          );
        })}

        {/* Field-styled trigger → searchable modal (matches the sport picker). */}
        <Pressable
          onPress={() => setPickerOpen(true)}
          style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 4, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 13 }}
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
              style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderWidth: 1, borderColor: C.violet, borderRadius: R.cta, paddingVertical: 13, paddingHorizontal: 16, backgroundColor: `${C.violet}14` }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: txt(C, C.violet) }}>✦ {t("train.start")} · AI</Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash }}>{!isAthlete ? t("train.premium") : recent.length > 0 ? t("train.aiReadiness") : "AI coach"}</Text>
            </Pressable>
            {routines.length > 0 && (
              <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.cta, padding: 12 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1, color: txt(C, C.lime), marginBottom: 8 }}>{t("train.routines")}</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.xs }}>
                  {routines.map((r) => (
                    <Pressable key={r.id} onPress={() => loadRoutine(r)} style={{ borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}1f`, borderRadius: R.chip, paddingVertical: 7, paddingHorizontal: 12 }}>
                      <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: txt(C, C.lime) }}>{r.name}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}
          </View>
        )}

        {/* Searchable exercise picker — grouped by muscle/pattern, mirroring the
            sport picker. Recent lifts first, then categories, then sports, then a
            "+ custom" row for a free-typed name. */}
        <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => { setPickerOpen(false); setCustom(""); }}>
          <Pressable onPress={() => { setPickerOpen(false); setCustom(""); }} style={{ flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }}>
            <Pressable onPress={() => {}} style={{ flex: 1, marginTop: 64, backgroundColor: C.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line, paddingTop: 20, paddingHorizontal: 20 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("workout.pickExercise")}</Text>
                <Pressable onPress={() => { setPickerOpen(false); setCustom(""); }} hitSlop={10}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("workout.close")}</Text>
                </Pressable>
              </View>
              {/* Search row — the canonical icon + TextInput pill (matches the sport picker). */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14 }}>
                <AuroraIcon name="search" size={18} color={C.ash} />
                <TextInput
                  value={custom}
                  onChangeText={setCustom}
                  placeholder={t("workout.search")}
                  placeholderTextColor={C.ash}
                  autoFocus
                  onSubmitEditing={() => addExercise(custom)}
                  style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, paddingVertical: 12 }}
                />
              </View>
              <ScrollView style={{ flex: 1, marginTop: 6 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8, paddingBottom: 28 }}>
                {(() => {
                  const q = custom.trim().toLowerCase();
                  const match = (n: string) => !q || n.toLowerCase().includes(q);
                  const recentNames = new Set(recent.map((r) => r.name));
                  const recentShown = recent.filter((r) => match(r.name)).slice(0, 12);
                  // Library exercises group under their muscle-group heading; built-ins by
                  // pattern. Aliased/superseded + already-shown-recent names are dropped.
                  const exGroups = exercisesByCategory(MOVEMENTS, catalog, categoryByName)
                    .map((g) => ({ ...g, names: g.names.filter((n) => !recentNames.has(n) && match(n) && !aliases.has(n)) }))
                    .filter((g) => g.names.length > 0);
                  const sportGroups = olympicSportsByCategory()
                    .map((g) => ({ category: g.category, sports: g.sports.filter((s) => match(s.name)) }))
                    .filter((g) => g.sports.length > 0);
                  const exact = [...recentNames, ...catalog].some((n) => n.toLowerCase() === q);
                  const kindColor = (k: WKind) => (k === "strength" ? C.lime : k === "cardio" ? C.blue : C.violet);
                  const head = (label: string) => (
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1.4, marginTop: 14, marginBottom: 4 }}>{label}</Text>
                  );
                  const row = (name: string, kind: WKind, key: string, icon?: string) => (
                    <Pressable key={key} onPress={() => addExercise(name, kind)} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 11, paddingHorizontal: 4 }}>
                      {icon
                        ? <Text style={{ fontSize: fs.subtitle, width: 22, textAlign: "center" }}>{icon}</Text>
                        : <View style={{ width: 22, alignItems: "center" }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: kindColor(kind) }} /></View>}
                      <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{name}</Text>
                    </Pressable>
                  );
                  return (
                    <>
                      {recentShown.length > 0 && (
                        <>
                          {head(t("workout.yourLifts"))}
                          {recentShown.map((r) => row(r.name, r.kind, `r-${r.name}`))}
                        </>
                      )}
                      {exGroups.map((g) => (
                        <View key={g.category}>
                          {head(g.labelKey ? t(g.labelKey) : g.label ?? g.category)}
                          {g.names.map((n) => row(n, inferBlockKind(n), `e-${n}`))}
                        </View>
                      ))}
                      {sportGroups.length > 0 && head(t("workout.sports"))}
                      {sportGroups.map((g) => (
                        <View key={g.category}>
                          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 8, marginBottom: 2 }}>{g.category}</Text>
                          {g.sports.map((s) => row(s.name, "cardio", `s-${s.name}`, s.icon))}
                        </View>
                      ))}
                      {q.length > 0 && !exact && (
                        <Pressable onPress={() => addExercise(custom)} style={{ marginTop: 16, borderRadius: R.cta, backgroundColor: C.lime, paddingVertical: 13, alignItems: "center" }}>
                          <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.ink }}>+ “{custom.trim()}”</Text>
                        </Pressable>
                      )}
                    </>
                  );
                })()}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>

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
              {saving ? <ActivityIndicator color={C.ink} /> : <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.ink }}>{t("workout.finishWorkout")}</Text>}
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

// The RPE cheatsheet — same scale (from @hybrid/core) the web logger shows.
function RpeHelpModal({ visible, onClose, t }: { visible: boolean; onClose: () => void; t: (k: string) => string }) {
  const C = useTheme().palette;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line, padding: 20, paddingBottom: 36 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("rpe.title")}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("rpe.close")}</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, lineHeight: 19, marginBottom: 16 }}>{RPE_INTRO}</Text>
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            <Text style={{ width: 40, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>RPE</Text>
            <Text style={{ width: 56, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>{t("rpe.rir")}</Text>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>{t("rpe.feels")}</Text>
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
  router,
  t,
  units,
  haptics,
}: {
  summary: Summ;
  router: ReturnType<typeof useRouter>;
  t: (k: string) => string;
  units: WeightUnit;
  haptics: boolean;
}) {
  const C = useTheme().palette;
  const aurora = useTemplate().template === "aurora";
  const R = auroraRadii(aurora);
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
  // The chosen "wrapped" style — one of the 4 shared looks.
  const [styleId, setStyleId] = useState<StoryStyleId>(DEFAULT_STORY_STYLE);
  const { prs, bests, cardioPrs, firstEver } = summary;
  // Title can be renamed here (optional) — start from the auto-title.
  const [title, setTitle] = useState(summary.title);
  // A PR or a first-ever workout is the moment worth posting — the share is the
  // climax (and our download engine), so the CTA leans into it.
  const hasWin = prs.length > 0 || cardioPrs.length > 0;
  const milestone = firstEver || hasWin;

  // Finishing is the payoff — make it FELT. A success haptic (a heavier knock
  // layered on for a PR/first), and a spring entrance on the hero badge so the
  // win lands instead of just appearing.
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
    p.previous == null
      ? `${p.lift} ${fmtWeight(p.e1rm, units)} (${t("summary.firstTime")})`
      : `${p.lift} ${fmtWeight(p.e1rm, units)} (+${fmtWeight(p.e1rm - p.previous, units)})`;

  const shareText = [
    firstEver ? t("share.firstWorkout") : null,
    `\u{1F4AA} ${title || "Workout"} — ${t("share.done")}`,
    `${summary.minutes} min · ${summary.sets} ${t("summary.sets").toLowerCase()} · ${fmtTonnage(summary.volume, units)}`,
    prs[0]
      ? `\u{1F3C6} ${prLine(prs[0])}`
      : cardioPrs[0]
        ? `\u{1F3C3} ${cardioPrLine(cardioPrs[0], t)}`
        : bests[0]
          ? `${t("share.topLift")}: ${bests[0].name} ${fmtWeight(bests[0].e1rm, units)}`
          : null,
    t("share.tracked"),
  ]
    .filter(Boolean)
    .join("\n");

  // ── Build the shareable slides (Overview · PRs & bests · Muscle · Fun) ──
  const muscleVol = volumeByMuscle(summary.blocks);
  const muscleMax = muscleVol[0]?.volume ?? 0;
  const funFact = sessionFunFact(summary.blocks);
  const prRows: { left: string; right: string; hot?: boolean }[] = [
    ...prs.map((p) => ({ left: p.lift, right: p.previous == null ? t("summary.firstTime") : `+${fmtWeight(p.e1rm - p.previous, units)}`, hot: true })),
    ...cardioPrs.map((p) => ({ left: cardioPrLine(p, t), right: "", hot: true })),
    ...bests.filter((b) => !prs.some((p) => p.lift === b.name)).slice(0, 6).map((b) => ({ left: b.name, right: fmtWeight(b.e1rm, units) })),
  ];
  const prHeadline = prs.length > 0
    ? `🏆 ${prs.length} ${t("summary.newPrs")}`
    : cardioPrs.length > 0
      ? `🏃 ${cardioPrs.length} ${t("summary.newCardioPrs")}`
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

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top", "bottom"]}>
      {aurora && <AuroraField />}
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, flexGrow: 1 }}>
        <View style={{ alignItems: "center", marginTop: 20, marginBottom: 8 }}>
          <Animated.View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${C.lime}1f`, borderWidth: 2, borderColor: C.lime, alignItems: "center", justifyContent: "center", transform: [{ scale: pop }] }}>
            <Text style={{ fontSize: 34, color: txt(C, C.lime), fontFamily: F.black }}>{firstEver ? "🎉" : "✓"}</Text>
          </Animated.View>
          <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk, marginTop: 16, textAlign: "center" }}>
            {firstEver ? t("summary.firstTitle") : t("summary.complete")}
          </Text>
          {/* Workout name, directly under the heading. */}
          <Text style={{ fontFamily: F.bold, fontSize: fs.subtitle, color: C.chalk, marginTop: 8, textAlign: "center" }}>{title || "Workout"}</Text>
          {!summary.guest && <SummaryRename sessionId={summary.sessionId} value={title} onRenamed={setTitle} t={t} />}
          {firstEver && (
            <Mono color={C.ash} style={{ marginTop: 6, textAlign: "center" }}>{t("summary.firstSub")}</Mono>
          )}
        </View>

        {/* Swipeable summary slides — each rendered as the real 9:16 story card
            (what-you-see-is-what-you-share) and captured by active index. */}
        <Animated.View style={{ opacity: fade }}>
          <ScrollView
            ref={pagerRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setActive(Math.round(e.nativeEvent.contentOffset.x / slideW))}
          >
            {slides.map((s, i) => (
              <View key={i} style={{ width: slideW, alignItems: "center" }}>
                <SlideStoryCard ref={(r) => { storyRefs.current[i] = r; }} slide={s} t={t} units={units} width={previewW} styleId={styleId} animate={i === activeIdx} />
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

        {/* Theme toggle — switch the "wrapped" look; the card + the shared
            image update live. */}
        <View style={{ marginTop: 16 }}>
          <Mono color={C.ash} style={{ textAlign: "center", marginBottom: 8 }}>{t("summary.styleLabel").toUpperCase()}</Mono>
          <View style={{ flexDirection: "row", gap: 4, padding: 4, borderRadius: 999, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, alignSelf: "stretch" }}>
            {STORY_STYLES.map((s) => {
              const selected = s.id === styleId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => setStyleId(s.id)}
                  style={{ flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 6, backgroundColor: selected ? C.lime : "transparent" }}
                >
                  <View style={{ width: 12, height: 12, borderRadius: 6, overflow: "hidden", backgroundColor: s.bg, borderWidth: 1, borderColor: selected ? "rgba(0,0,0,0.25)" : C.line, alignItems: "center", justifyContent: "center" }}>
                    {s.gradient && (
                      <LinearGradient colors={[s.gradient.from, s.gradient.to]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
                    )}
                    <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: s.swatch }} />
                  </View>
                  <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.micro, color: selected ? C.ink : C.ash }}>{t(s.nameKey)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {milestone && (
          <Mono color={C.lime} style={{ textAlign: "center", marginTop: 14 }}>{t("summary.shareNudge")}</Mono>
        )}

        {/* One Share button — shares whichever slide is on screen as a story. */}
        <Pressable
          onPress={() => shareWorkout({ current: storyRefs.current[activeIdx] ?? null }, shareText, t("summary.shareStory"))}
          style={{
            backgroundColor: C.lime,
            borderRadius: R.cta,
            paddingVertical: 16,
            alignItems: "center",
            marginTop: milestone ? 6 : 16,
            ...(milestone
              ? { shadowColor: C.lime, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6 }
              : null),
          }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.ink }}>↗ {shareLabel}</Text>
        </Pressable>

        <View style={{ flex: 1, minHeight: 24 }} />

        {summary.pending && (
          <View style={{ backgroundColor: `${C.amber}14`, borderWidth: 1, borderColor: `${C.amber}55`, borderRadius: 14, padding: 14, marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: txt(C, C.amber) }}>⟲ {t("summary.pendingSync")}</Text>
          </View>
        )}

        {summary.guest ? (
          <>
            <View style={{ backgroundColor: `${C.violet}14`, borderWidth: 1, borderColor: `${C.violet}55`, borderRadius: 14, padding: 14, marginTop: 16 }}>
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
            <SaveRoutine key={title} title={title} blocks={summary.blocks} t={t} />
            <Mono style={{ textAlign: "center", marginTop: 24, marginBottom: 8 }}>{t("summary.digDetail")}</Mono>
            <Pressable
              onPress={() => router.replace("/(tabs)/history")}
              style={{ borderWidth: 1, borderColor: C.line, borderRadius: R.cta, paddingVertical: 15, alignItems: "center" }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("summary.seeAnalysis")}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/(tabs)")} style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("summary.doneToday")}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Save the just-finished workout as a reusable routine (WorkoutTemplate) so it
// can be loaded and started next time. Non-guest only (routines need an account).
// Saving a routine is a FULL feature (canSaveRoutine) — free users get an upsell
// here instead of a "sign in and try again" error; logging/building one-offs
// stays free.
function SaveRoutine({ title, blocks, t }: { title: string; blocks: SessionBlock[]; t: (k: string) => string }) {
  const C = useTheme().palette;
  const R = auroraRadii(useTemplate().template === "aurora");
  const router = useRouter();
  const allowed = canSaveRoutine(usePersona());
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title || "Routine");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  if (state === "saved")
    return <Mono color={C.lime} style={{ textAlign: "center", marginTop: 18 }}>{t("summary.routineSaved")}</Mono>;

  // Free user → upsell card (routines are Full; logging/building stays free).
  if (!allowed)
    return (
      <View style={{ borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}14`, borderRadius: 14, padding: 14, marginTop: 18 }}>
        <Mono color={C.lime} style={{ fontSize: fs.micro, letterSpacing: 1 }}>✦ {t("summary.routineFullTitle").toUpperCase()}</Mono>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 6, lineHeight: 17 }}>{t("summary.routineFullBlurb")}</Text>
        <Pressable
          onPress={() => { track(FUNNEL.upgradeEntryClick, { client: "mobile", source: "save-routine" }); router.push("/upgrade"); }}
          style={{ backgroundColor: C.lime, borderRadius: R.cta, paddingVertical: 13, alignItems: "center", marginTop: 12 }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.ink }}>{t("summary.routineUnlock")}</Text>
        </Pressable>
      </View>
    );

  if (!open)
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}14`, borderRadius: R.cta, paddingVertical: 15, alignItems: "center", marginTop: 18 }}
      >
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: txt(C, C.lime) }}>★ {t("summary.saveRoutine")}</Text>
      </Pressable>
    );

  const save = async () => {
    setState("saving");
    const ok = await createRoutine(name.trim() || "Routine", blocks);
    setState(ok ? "saved" : "idle");
  };

  return (
    <View style={{ borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}14`, borderRadius: 14, padding: 14, marginTop: 18 }}>
      <Mono color={C.lime} style={{ fontSize: fs.micro, letterSpacing: 1 }}>{t("summary.saveRoutine").toUpperCase()}</Mono>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Routine name"
        placeholderTextColor={C.ash}
        style={{ marginTop: 8, fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
      />
      <Pressable
        onPress={save}
        disabled={state === "saving"}
        style={{ backgroundColor: C.lime, borderRadius: R.cta, paddingVertical: 13, alignItems: "center", marginTop: 10, opacity: state === "saving" ? 0.6 : 1 }}
      >
        <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.ink }}>{state === "saving" ? "…" : t("summary.saveRoutine")}</Text>
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
        style={{ flex: 1, fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, textAlign: "center" }}
      />
      <Pressable onPress={commit} style={{ backgroundColor: C.lime, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.ink }}>✓</Text>
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
        },
  );
}

// Swipe a set row left to reveal a Delete action — for sets added by accident.
// Built on Animated + PanResponder (no native gesture-handler dependency, so it
// works in the existing dev build). Only claims clearly-horizontal drags, so the
// numeric inputs still focus on tap and the list still scrolls vertically.
function SwipeRow({ children, onDelete, label }: { children: ReactNode; onDelete: () => void; label: string }) {
  const C = useTheme().palette;
  const tx = useRef(new Animated.Value(0)).current;
  const openRef = useRef(false);
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8,
      onPanResponderMove: (_, g) => {
        const base = openRef.current ? -76 : 0;
        tx.setValue(Math.max(-110, Math.min(0, base + g.dx)));
      },
      onPanResponderRelease: (_, g) => {
        const open = openRef.current ? g.dx < 40 : g.dx < -40;
        openRef.current = open;
        Animated.spring(tx, { toValue: open ? -76 : 0, useNativeDriver: true, bounciness: 0, speed: 20 }).start();
      },
    }),
  ).current;
  return (
    <View style={{ position: "relative", marginBottom: 6, overflow: "hidden" }}>
      <Pressable
        onPress={onDelete}
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 76, alignItems: "center", justifyContent: "center", backgroundColor: C.red, borderRadius: 10 }}
      >
        <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{label}</Text>
      </Pressable>
      <Animated.View style={{ transform: [{ translateX: tx }], backgroundColor: C.card }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

// Grip handle on each exercise card — press and drag to reorder (the arrows
// still work for single steps). Built on PanResponder (no gesture-handler dep,
// matching SwipeRow). Its own responder is created once; live callbacks are read
// through a ref so a parent re-render mid-drag can't strand a stale closure.
function DragHandle({ onStart, onMove, onEnd, color }: { onStart: () => void; onMove: (dy: number) => void; onEnd: () => void; color: string }) {
  const cbs = useRef({ onStart, onMove, onEnd });
  cbs.current = { onStart, onMove, onEnd };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => cbs.current.onStart(),
      onPanResponderMove: (_, g) => cbs.current.onMove(g.dy),
      onPanResponderRelease: () => cbs.current.onEnd(),
      onPanResponderTerminate: () => cbs.current.onEnd(),
    }),
  ).current;
  return (
    <View {...pan.panHandlers} hitSlop={8} style={{ paddingRight: 2, paddingVertical: 4 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color }}>⠿</Text>
    </View>
  );
}

// One live-scoreboard stat cell shown during the workout (parity with web).
function LiveStat({ C, label, value }: { C: Palette; label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", borderRadius: 12, paddingVertical: 8, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line }}>
      <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk }}>{value}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

function Cell({ value, onChange, done }: { value: string; onChange: (v: string) => void; done?: boolean }) {
  const C = useTheme().palette;
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      keyboardType="numeric"
      style={{ flex: 1, fontFamily: F.mono, fontSize: fs.subtitle, color: done ? C.ash : C.chalk, textAlign: "center", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 10 }}
    />
  );
}

function ColHead({ children, w }: { children: React.ReactNode; w?: number }) {
  const C = useTheme().palette;
  return (
    <Text style={{ flex: w ? undefined : 1, width: w, textAlign: "center", fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>
      {children}
    </Text>
  );
}
