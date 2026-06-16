import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Modal, Animated, PanResponder } from "react-native";
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
  sessionVolume,
  blockBestE1rm,
  newPrsInSession,
  newCardioPrsInSession,
  exerciseHistory,
  inferBlockKind,
  migrateBlocks,
  pacePerKm,
  paceClock,
  blockSummary,
  lastStrengthByLift,
  supersetLabels,
  toggleSuperset,
  isSupersettedWithPrev,
  setType,
  cycleSetType,
  setTypeBadge,
  rpeRirSwap,
  displayLoad,
  storeLoad,
  type SetRole,
  RPE_SCALE,
  RPE_INTRO,
  MOVEMENTS,
  type SessionBlock,
  type LoggedSession,
  type PrHit,
  type CardioPrHit,
  type ExerciseUse,
} from "@hybrid/core";
import { fetchSessions, createSession, fetchRoutines, createRoutine, type NewSession } from "../lib/api";
import { saveGuestSession, listGuestSessions } from "../lib/guest";
import { loadDraft, saveDraft, clearDraft } from "../lib/draft";
import { WorkoutShareCard, shareWorkout, type ShareBest } from "../lib/share";
import { useSession } from "../lib/session";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { useLang } from "../lib/i18n";
import { F, Mono, Kicker, Card } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

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

/** A localized one-liner for a cardio PR (distance furthest / pace fastest). */
export function cardioPrLine(p: CardioPrHit, t: (k: string) => string): string {
  if (p.kind === "distance")
    return p.previous == null
      ? `${p.move} ${p.value} km (${t("summary.firstTime")})`
      : `${p.move} ${p.value} km (+${Math.round((p.value - p.previous) * 10) / 10})`;
  const delta = p.previous != null ? ` (−${paceClock(p.previous - p.value)})` : "";
  return `${p.move} ${paceClock(p.value)} /km${delta}`;
}

const guestToLogged = (g: { title: string; startedAt?: string; savedAt: string; blocks: unknown[] }): LoggedSession => ({
  id: g.savedAt,
  title: g.title,
  startedAt: g.startedAt ?? g.savedAt,
  blocks: migrateBlocks(g.blocks),
});

export default function Workout() {
  const C = useTheme().palette;
  const router = useRouter();
  const { t } = useLang();
  const { session } = useSession();
  const guest = !session;
  const prefs = useLoggerPrefs();
  const { source, templateId } = useLocalSearchParams<{ source?: string; templateId?: string }>();

  const [title, setTitle] = useState("Workout");
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
  const [rpeHelp, setRpeHelp] = useState(false);
  const [showTip, setShowTip] = useState(false);
  // Get-ready countdown on entering a fresh workout (5→1→GO) before the clock
  // starts; null once it finishes or when resuming an in-progress draft.
  const [countdown, setCountdown] = useState<number | null>(null);
  const didCountdown = useRef(false);
  // Pause/hold — freezes the elapsed clock (and any running rest) until resumed.
  const [paused, setPaused] = useState(false);
  const pausedAt = useRef(0);

  const startedAt = useRef(new Date());
  const prior = useRef<LoggedSession[]>([]);

  useEffect(() => {
    // Don't advance the clock during the get-ready countdown or while paused.
    if (phase !== "active" || paused || countdown !== null) return;
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
  }, [phase, restSince, restTarget, paused, countdown]);

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
      if (phase !== "active" || restSince == null || restTarget == null) return;
      const remaining = restTarget - Math.floor((Date.now() - restSince) / 1000);
      if (remaining <= 0) return;
      try {
        const idn = await Notifications.scheduleNotificationAsync({
          content: { title: t("workout.restDone"), body: t("notif.restBody"), sound: true },
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
  }, [restSince, restTarget, phase]);

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
  }, [source, guest, templateId]);

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

  const addExercise = (name: string, kind?: WKind) => {
    const clean = name.trim();
    if (!clean) return;
    setExercises((xs) => [...xs, newExercise(clean, kind)]);
    setPickerOpen(false);
    setCustom("");
  };
  const removeExercise = (u: string) => setExercises((xs) => xs.filter((x) => x.uid !== u));
  const moveExercise = (u: string, dir: -1 | 1) =>
    setExercises((xs) => {
      const i = xs.findIndex((x) => x.uid === u);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= xs.length) return xs;
      const next = [...xs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const rename = (u: string, name: string) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, name } : x)));
  const setSetField = (u: string, i: number, k: keyof WSet, v: string | boolean) =>
    setExercises((xs) =>
      xs.map((x) => (x.uid === u ? { ...x, sets: x.sets.map((s, j) => (j === i ? { ...s, [k]: v } : s)) } : x)),
    );
  const condField = (u: string, k: "minutes" | "rpe" | "distance", v: string) =>
    setExercises((xs) => xs.map((x) => (x.uid === u ? { ...x, [k]: v } : x)));
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
        const distance = parseFloat(x.distance);
        if (!Number.isFinite(minutes) && !Number.isFinite(distance)) continue;
        blocks.push({
          kind: "cardio",
          name: x.name,
          ...(Number.isFinite(distance) ? { distance } : {}),
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

  const finish = async () => {
    const blocks = buildBlocks();
    if (!blocks.length) {
      setError(t("workout.minSet"));
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
    if (guest) {
      // No account yet — keep it on the device until they sign up.
      await saveGuestSession(payload);
    } else {
      const ok = await createSession(payload);
      if (!ok) {
        // Offline / server hiccup — never lose the workout. Stash it locally;
        // it syncs on the next foreground / sign-in (see lib/guest + session).
        await saveGuestSession(payload);
        pending = true;
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

  if (phase === "done" && summary) return <Summary summary={summary} router={router} t={t} />;

  const ssLabels = supersetLabels(exercises);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top"]}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 64 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{t("workout.cancel")}</Text>
        </Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontFamily: F.black, fontSize: 22, color: paused ? txt(C, C.amber) : C.chalk, letterSpacing: 1 }}>{mmss(elapsed)}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: paused ? txt(C, C.amber) : C.ash, letterSpacing: 1 }}>{paused ? t("workout.paused") : t("workout.elapsed")}</Text>
        </View>
        <Pressable onPress={finish} disabled={saving} style={{ width: 64, alignItems: "flex-end" }} hitSlop={10}>
          <Text style={{ fontFamily: F.black, fontSize: 14, color: saving ? C.ash : txt(C, C.lime) }}>
            {saving ? "…" : t("workout.finish")}
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder={t("workout.nameWorkout")}
          placeholderTextColor={C.ash}
          style={{ fontFamily: F.black, fontSize: 24, color: C.chalk, marginBottom: 4 }}
        />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <Mono style={{ flex: 1 }}>
            {exercises.length
              ? `${exercises.length} ${t("workout.exercises")} · ${t("workout.tapAsYouGo")}`
              : t("workout.firstExercise")}
          </Mono>
          <Pressable onPress={() => setRpeHelp(true)} hitSlop={8}>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.blue) }}>{t("workout.rpeWhat")}</Text>
          </Pressable>
        </View>

        {showTip && (
          <View style={{ backgroundColor: `${C.lime}12`, borderWidth: 1, borderColor: `${C.lime}44`, borderRadius: 12, padding: 14, marginBottom: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <Text style={{ fontFamily: F.bold, fontSize: 13, color: txt(C, C.lime) }}>{t("workout.tipTitle")}</Text>
              <Pressable onPress={dismissTip} hitSlop={8}>
                <Text style={{ fontFamily: F.bold, fontSize: 12, color: txt(C, C.lime) }}>{t("workout.tipGot")}</Text>
              </Pressable>
            </View>
            <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.chalk, lineHeight: 19 }}>{t("workout.tipBody")}</Text>
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
            <View style={{ backgroundColor: `${accent}14`, borderWidth: 1, borderColor: `${accent}44`, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: txt(C, accent) }}>
                  {done ? t("workout.restDone") : t("workout.resting")} · {clock}
                </Text>
                <Pressable
                  onPress={() => setRestSince(null)}
                  hitSlop={8}
                  style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: accent }}
                >
                  <Text style={{ fontFamily: F.bold, fontSize: 12, color: txt(C, accent) }}>■ {t("workout.stopRest")}</Text>
                </Pressable>
              </View>
              <View style={{ flexDirection: "row", gap: 6, marginTop: 10 }}>
                {[60, 90, 120, 180].map((sec) => {
                  const on = restTarget === sec;
                  return (
                    <Pressable
                      key={sec}
                      onPress={() => pickRest(sec)}
                      style={{ flex: 1, alignItems: "center", paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: on ? C.blue : C.line, backgroundColor: on ? `${C.blue}22` : "transparent" }}
                    >
                      <Text style={{ fontFamily: F.mono, fontSize: 12, color: on ? txt(C, C.blue) : C.ash }}>{sec < 120 ? `${sec}s` : `${sec / 60}m`}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })()}

        {exercises.map((x, xi) => (
          <Card key={x.uid}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 9, color: x.kind === "strength" ? txt(C, C.lime) : x.kind === "cardio" ? txt(C, C.blue) : txt(C, C.violet) }}>
                {x.kind.toUpperCase()}
              </Text>
              {ssLabels[xi] && (
                <Text style={{ fontFamily: F.mono, fontSize: 11, color: txt(C, C.lime), backgroundColor: `${C.lime}1f`, borderWidth: 1, borderColor: `${C.lime}55`, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1 }}>⛓ {ssLabels[xi]}</Text>
              )}
              <TextInput value={x.name} onChangeText={(v) => rename(x.uid, v)} style={{ flex: 1, fontFamily: F.bold, fontSize: 16, color: C.chalk }} />
              {/* Superset with the exercise BELOW — placed on the upper card so
                  even the FIRST exercise can start a superset (no rest between). */}
              {x.kind === "strength" && exercises[xi + 1]?.kind === "strength" && (() => {
                const joined = isSupersettedWithPrev(exercises, xi + 1);
                const nextUid = exercises[xi + 1]!.uid;
                return (
                  <Pressable
                    onPress={() => supersetWithPrev(nextUid)}
                    hitSlop={6}
                    style={{ paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: joined ? C.lime : C.line, backgroundColor: joined ? `${C.lime}1f` : "transparent" }}
                  >
                    <Text style={{ fontFamily: F.mono, fontSize: 11, color: joined ? txt(C, C.lime) : C.ash }}>⛓ {joined ? t("workout.supersetJoined") : t("workout.superset")}</Text>
                  </Pressable>
                );
              })()}
              <Pressable onPress={() => moveExercise(x.uid, -1)} disabled={xi === 0} hitSlop={6}>
                <Text style={{ color: xi === 0 ? C.line : C.ash, fontSize: 15 }}>↑</Text>
              </Pressable>
              <Pressable onPress={() => moveExercise(x.uid, 1)} disabled={xi === exercises.length - 1} hitSlop={6}>
                <Text style={{ color: xi === exercises.length - 1 ? C.line : C.ash, fontSize: 15 }}>↓</Text>
              </Pressable>
              <Pressable onPress={() => removeExercise(x.uid)} hitSlop={8}>
                <Text style={{ color: C.ash, fontSize: 15 }}>✕</Text>
              </Pressable>
            </View>

            {x.kind === "strength" ? (
              <>
                {(() => {
                  // "Last time" reference — the most recent prior session's sets
                  // for this lift, so progressive overload has a target to beat.
                  const last = lastByLift.get(x.name);
                  return last ? (
                    <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, marginBottom: 8 }}>
                      {t("workout.lastTime")} · {blockSummary(last)}
                    </Text>
                  ) : null;
                })()}
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
                  <ColHead w={28}>#</ColHead>
                  <ColHead>{prefs.units === "lb" ? "LB" : "KG"}</ColHead>
                  <ColHead>REPS</ColHead>
                  {prefs.detailed && <ColHead>{prefs.rpeAsRir ? "RIR" : "RPE"}</ColHead>}
                  <View style={{ width: 40 }} />
                </View>
                {x.sets.map((s, i) => (
                  <SwipeRow key={s.uid ?? i} label={t("workout.deleteSet")} onDelete={() => removeSet(x.uid, i)}>
                    <View style={{ flexDirection: "row", gap: 6, alignItems: "center" }}>
                    {(() => {
                      const st = setType(s);
                      const accent = st === "warmup" ? C.amber : st === "cooldown" ? C.blue : st === "drop" ? C.lime : null;
                      return (
                        <Pressable
                          onPress={() => cycleType(x.uid, i)}
                          onLongPress={() => removeSet(x.uid, i)}
                          style={{ width: 28, height: 30, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: accent ? 1 : 0, borderColor: accent ?? C.line, backgroundColor: accent ? `${accent}1f` : "transparent" }}
                        >
                          <Text style={{ fontFamily: F.mono, fontSize: 13, color: accent ? txt(C, accent) : C.ash }}>{setTypeBadge(s, i)}</Text>
                        </Pressable>
                      );
                    })()}
                    <Cell value={displayLoad(s.load, prefs.units)} onChange={(v) => setSetField(x.uid, i, "load", storeLoad(v, prefs.units))} done={s.done} />
                    <Cell value={s.reps} onChange={(v) => setSetField(x.uid, i, "reps", v)} done={s.done} />
                    {prefs.detailed && <Cell value={rpeRirSwap(s.rpe, prefs.rpeAsRir)} onChange={(v) => setSetField(x.uid, i, "rpe", rpeRirSwap(v, prefs.rpeAsRir))} done={s.done} />}
                    <Pressable
                      onPress={() => toggleDone(x.uid, i, !s.done)}
                      style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: s.done ? C.lime : C.ink2, borderWidth: 1, borderColor: s.done ? C.lime : C.line }}
                    >
                      <Text style={{ fontSize: 16, color: s.done ? C.ink : C.ash, fontFamily: F.black }}>✓</Text>
                    </Pressable>
                    </View>
                  </SwipeRow>
                ))}
                <View style={{ flexDirection: "row", gap: 16, flexWrap: "wrap" }}>
                  <Pressable onPress={() => addSet(x.uid)} style={{ paddingVertical: 8 }}>
                    <Text style={{ fontFamily: F.semi, fontSize: 13, color: txt(C, C.lime) }}>{t("workout.set")}</Text>
                  </Pressable>
                  <Pressable onPress={() => addWarmupSet(x.uid)} style={{ paddingVertical: 8 }}>
                    <Text style={{ fontFamily: F.semi, fontSize: 13, color: txt(C, C.amber) }}>{t("workout.warmupSet")}</Text>
                  </Pressable>
                  <Pressable onPress={() => addDropSet(x.uid)} style={{ paddingVertical: 8 }}>
                    <Text style={{ fontFamily: F.semi, fontSize: 13, color: C.ash }}>{t("workout.dropSet")}</Text>
                  </Pressable>
                </View>
              </>
            ) : x.kind === "cardio" ? (
              <>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <ColHead>{t("workout.dist")}</ColHead>
                    <Cell value={x.distance ?? ""} onChange={(v) => condField(x.uid, "distance", v)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <ColHead>MIN</ColHead>
                    <Cell value={x.minutes} onChange={(v) => condField(x.uid, "minutes", v)} />
                  </View>
                </View>
                {(() => {
                  const pace = pacePerKm({ distance: parseFloat(x.distance), minutes: parseFloat(x.minutes) });
                  return pace ? (
                    <Text style={{ fontFamily: F.mono, fontSize: 11, color: txt(C, C.blue), marginTop: 8 }}>{t("workout.pace")} {pace}</Text>
                  ) : null;
                })()}
              </>
            ) : (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <ColHead>MIN</ColHead>
                  <Cell value={x.minutes} onChange={(v) => condField(x.uid, "minutes", v)} />
                </View>
              </View>
            )}
          </Card>
        ))}

        {pickerOpen ? (() => {
          const q = custom.trim().toLowerCase();
          const match = (n: string) => !q || n.toLowerCase().includes(q);
          const recentNames = new Set(recent.map((r) => r.name));
          const recentShown = recent.filter((r) => match(r.name)).slice(0, 10);
          const libShown = Object.keys(MOVEMENTS).filter((n) => !recentNames.has(n) && match(n));
          const exact = [...recentNames, ...Object.keys(MOVEMENTS)].some((n) => n.toLowerCase() === q);
          const kindColor = (k: WKind) => (k === "strength" ? C.lime : k === "cardio" ? C.blue : C.violet);
          const chip = (name: string, kind: WKind, key: string) => {
            const c = kindColor(kind);
            return (
              <Pressable
                key={key}
                onPress={() => addExercise(name, kind)}
                style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: `${c}55`, backgroundColor: `${c}1f` }}
              >
                <Text style={{ fontFamily: F.semi, fontSize: 13, color: txt(C, c) }}>{name}</Text>
              </Pressable>
            );
          };
          return (
            <Card>
              <Kicker color={C.lime}>{t("workout.pickExercise")}</Kicker>
              <TextInput
                value={custom}
                onChangeText={setCustom}
                placeholder={t("workout.search")}
                placeholderTextColor={C.ash}
                autoFocus
                onSubmitEditing={() => addExercise(custom)}
                style={{ fontFamily: F.reg, fontSize: 15, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginTop: 10 }}
              />

              {recentShown.length > 0 && (
                <>
                  <Kicker color={C.ash}>{t("workout.yourLifts")}</Kicker>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, marginBottom: 4 }}>
                    {recentShown.map((r) => chip(r.name, r.kind, `r-${r.name}`))}
                  </View>
                </>
              )}

              {libShown.length > 0 && (
                <>
                  {recentShown.length > 0 && <Kicker color={C.ash}>{t("workout.library")}</Kicker>}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                    {libShown.map((name) => chip(name, inferBlockKind(name), `l-${name}`))}
                  </View>
                </>
              )}

              {q.length > 0 && !exact && (
                <Pressable onPress={() => addExercise(custom)} style={{ marginTop: 14, borderRadius: 10, backgroundColor: C.lime, paddingVertical: 12, alignItems: "center" }}>
                  <Text style={{ fontFamily: F.black, fontSize: 14, color: C.ink }}>+ “{custom.trim()}”</Text>
                </Pressable>
              )}

              <Pressable onPress={() => { setPickerOpen(false); setCustom(""); }} style={{ paddingTop: 12 }}>
                <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.ash, textAlign: "center" }}>{t("workout.close")}</Text>
              </Pressable>
            </Card>
          );
        })() : (
          <Pressable
            onPress={() => setPickerOpen(true)}
            style={{ borderWidth: 1, borderColor: C.lime, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 4 }}
          >
            <Text style={{ fontFamily: F.black, fontSize: 15, color: txt(C, C.lime) }}>{t("workout.addExercise")}</Text>
          </Pressable>
        )}

        {!!error && <Mono color={C.red} style={{ marginTop: 14, textAlign: "center" }}>{error}</Mono>}

        {exercises.length > 0 && (
          <View style={{ flexDirection: "row", gap: 10, marginTop: 18 }}>
            {/* Pause/hold sits next to Finish — freeze the clock for a phone call,
                a long queue for the rack, or a between-blocks breather. */}
            <Pressable
              onPress={togglePause}
              style={{ paddingHorizontal: 18, borderRadius: 14, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: paused ? C.amber : C.line, backgroundColor: paused ? `${C.amber}1f` : "transparent" }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 14, color: paused ? txt(C, C.amber) : C.ash }}>
                {paused ? `▶ ${t("workout.resume")}` : `❚❚ ${t("workout.pause")}`}
              </Text>
            </Pressable>
            <Pressable
              onPress={finish}
              disabled={saving}
              style={{ flex: 1, backgroundColor: C.lime, borderRadius: 14, paddingVertical: 16, alignItems: "center", opacity: saving ? 0.6 : 1 }}
            >
              {saving ? <ActivityIndicator color={C.ink} /> : <Text style={{ fontFamily: F.black, fontSize: 16, color: C.ink }}>{t("workout.finishWorkout")}</Text>}
            </Pressable>
          </View>
        )}
      </ScrollView>

      <RpeHelpModal visible={rpeHelp} onClose={() => setRpeHelp(false)} t={t} />

      {/* Get-ready count-in — covers the screen on a fresh start until GO. */}
      {countdown != null && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: C.ink, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash, letterSpacing: 3, marginBottom: 12 }}>
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
            <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{t("rpe.title")}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{t("rpe.close")}</Text>
            </Pressable>
          </View>
          <Text style={{ fontFamily: F.reg, fontSize: 13, color: C.ash, lineHeight: 19, marginBottom: 16 }}>{RPE_INTRO}</Text>
          <View style={{ flexDirection: "row", marginBottom: 6 }}>
            <Text style={{ width: 40, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>RPE</Text>
            <Text style={{ width: 56, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>{t("rpe.rir")}</Text>
            <Text style={{ flex: 1, fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1 }}>{t("rpe.feels")}</Text>
          </View>
          {RPE_SCALE.map((step) => (
            <View key={step.rpe} style={{ flexDirection: "row", alignItems: "flex-start", paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.line }}>
              <Text style={{ width: 40, fontFamily: F.bold, fontSize: 14, color: txt(C, C.lime) }}>{step.rpe}</Text>
              <Text style={{ width: 56, fontFamily: F.mono, fontSize: 13, color: C.chalk }}>{step.rir}</Text>
              <Text style={{ flex: 1, fontFamily: F.reg, fontSize: 13, color: C.chalk }}>{step.meaning}</Text>
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
}: {
  summary: Summ;
  router: ReturnType<typeof useRouter>;
  t: (k: string) => string;
}) {
  const C = useTheme().palette;
  const cardRef = useRef<View>(null);
  const { title, prs, bests, cardioPrs, firstEver } = summary;
  // A PR or a first-ever workout is the moment worth posting — the share is the
  // climax (and our download engine), so the CTA leans into it.
  const hasWin = prs.length > 0 || cardioPrs.length > 0;
  const milestone = firstEver || hasWin;
  const shareLabel = firstEver
    ? t("summary.shareFirst")
    : hasWin
      ? t("summary.sharePr")
      : t("summary.share");

  const prLine = (p: PrHit) =>
    p.previous == null
      ? `${p.lift} ${p.e1rm}kg (${t("summary.firstTime")})`
      : `${p.lift} ${p.e1rm}kg (+${p.e1rm - p.previous})`;

  const shareText = [
    firstEver ? t("share.firstWorkout") : null,
    `\u{1F4AA} ${title || "Workout"} — ${t("share.done")}`,
    `${summary.minutes} min · ${summary.sets} ${t("summary.sets").toLowerCase()} · ${summary.volume.toLocaleString()} kg`,
    prs[0]
      ? `\u{1F3C6} ${prLine(prs[0])}`
      : cardioPrs[0]
        ? `\u{1F3C3} ${cardioPrLine(cardioPrs[0], t)}`
        : bests[0]
          ? `${t("share.topLift")}: ${bests[0].name} ${bests[0].e1rm}kg`
          : null,
    t("share.tracked"),
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.ink }} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40, flexGrow: 1 }}>
        <View style={{ alignItems: "center", marginTop: 20, marginBottom: 8 }}>
          <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: `${C.lime}1f`, borderWidth: 2, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 34, color: txt(C, C.lime), fontFamily: F.black }}>{firstEver ? "🎉" : "✓"}</Text>
          </View>
          <Text style={{ fontFamily: F.black, fontSize: 28, color: C.chalk, marginTop: 16, textAlign: "center" }}>
            {firstEver ? t("summary.firstTitle") : t("summary.complete")}
          </Text>
          {firstEver && (
            <Mono color={C.ash} style={{ marginTop: 6, textAlign: "center" }}>{t("summary.firstSub")}</Mono>
          )}
        </View>

        {/* PR celebration — the reason to keep coming back */}
        {prs.length > 0 && (
          <View style={{ backgroundColor: `${C.lime}14`, borderWidth: 1, borderColor: C.lime, borderRadius: 16, padding: 16, marginTop: 12 }}>
            <Text style={{ fontFamily: F.black, fontSize: 16, color: txt(C, C.lime) }}>
              🏆 {prs.length} {t("summary.newPrs")}
            </Text>
            {prs.slice(0, 4).map((p) => (
              <Text key={p.lift} style={{ fontFamily: F.mono, fontSize: 12, color: C.chalk, marginTop: 6 }}>
                {prLine(p)}
              </Text>
            ))}
          </View>
        )}

        {/* Cardio PR celebration — runs count too */}
        {cardioPrs.length > 0 && (
          <View style={{ backgroundColor: `${C.blue}14`, borderWidth: 1, borderColor: C.blue, borderRadius: 16, padding: 16, marginTop: 12 }}>
            <Text style={{ fontFamily: F.black, fontSize: 16, color: txt(C, C.blue) }}>
              🏃 {cardioPrs.length} {t("summary.newCardioPrs")}
            </Text>
            {cardioPrs.slice(0, 4).map((p) => (
              <Text key={`${p.move}-${p.kind}`} style={{ fontFamily: F.mono, fontSize: 12, color: C.chalk, marginTop: 6 }}>
                {cardioPrLine(p, t)}
              </Text>
            ))}
          </View>
        )}

        <View style={{ marginTop: 14 }}>
          <WorkoutShareCard
            ref={cardRef}
            t={t}
            stats={{ title, minutes: summary.minutes, sets: summary.sets, volume: summary.volume, bests }}
          />
        </View>

        {milestone && (
          <Mono color={C.lime} style={{ textAlign: "center", marginTop: 14 }}>{t("summary.shareNudge")}</Mono>
        )}
        <Pressable
          onPress={() => shareWorkout(cardRef, shareText, t("summary.share"))}
          style={{
            backgroundColor: C.lime,
            borderRadius: 14,
            paddingVertical: 16,
            alignItems: "center",
            marginTop: milestone ? 6 : 14,
            // a stronger, glowing treatment when there's a win worth posting
            ...(milestone
              ? { shadowColor: C.lime, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 }, elevation: 6 }
              : null),
          }}
        >
          <Text style={{ fontFamily: F.black, fontSize: 16, color: C.ink }}>{shareLabel}</Text>
        </Pressable>

        <View style={{ flex: 1, minHeight: 24 }} />

        {summary.pending && (
          <View style={{ backgroundColor: `${C.amber}14`, borderWidth: 1, borderColor: `${C.amber}55`, borderRadius: 14, padding: 14, marginTop: 16 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: txt(C, C.amber) }}>⟲ {t("summary.pendingSync")}</Text>
          </View>
        )}

        {summary.guest ? (
          <>
            <View style={{ backgroundColor: `${C.violet}14`, borderWidth: 1, borderColor: `${C.violet}55`, borderRadius: 14, padding: 14, marginTop: 16 }}>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: txt(C, C.violet) }}>✓ {t("summary.guestSaved")}</Text>
            </View>
            <Pressable
              onPress={() => router.replace("/login?mode=signup")}
              style={{ backgroundColor: C.violet, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 12 }}
            >
              <Text style={{ fontFamily: F.black, fontSize: 16, color: C.chalk }}>{t("summary.guestSave")}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.chalk, opacity: 0.8, marginTop: 3 }}>{t("summary.guestSaveSub")}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/welcome")} style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{t("summary.notNow")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <SaveRoutine title={title} blocks={summary.blocks} t={t} />
            <Mono style={{ textAlign: "center", marginTop: 24, marginBottom: 8 }}>{t("summary.digDetail")}</Mono>
            <Pressable
              onPress={() => router.replace("/(tabs)/history")}
              style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}
            >
              <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{t("summary.seeAnalysis")}</Text>
            </Pressable>
            <Pressable onPress={() => router.replace("/(tabs)")} style={{ paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ash }}>{t("summary.doneToday")}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// Save the just-finished workout as a reusable routine (WorkoutTemplate) so it
// can be loaded and started next time. Non-guest only (routines need an account).
function SaveRoutine({ title, blocks, t }: { title: string; blocks: SessionBlock[]; t: (k: string) => string }) {
  const C = useTheme().palette;
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(title || "Routine");
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");

  if (state === "saved")
    return <Mono color={C.lime} style={{ textAlign: "center", marginTop: 18 }}>{t("summary.routineSaved")}</Mono>;

  if (!open)
    return (
      <Pressable
        onPress={() => setOpen(true)}
        style={{ borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}14`, borderRadius: 14, paddingVertical: 15, alignItems: "center", marginTop: 18 }}
      >
        <Text style={{ fontFamily: F.bold, fontSize: 15, color: txt(C, C.lime) }}>★ {t("summary.saveRoutine")}</Text>
      </Pressable>
    );

  const save = async () => {
    setState("saving");
    const ok = await createRoutine(name.trim() || "Routine", blocks);
    setState(ok ? "saved" : "idle");
  };

  return (
    <View style={{ borderWidth: 1, borderColor: `${C.lime}55`, backgroundColor: `${C.lime}14`, borderRadius: 14, padding: 14, marginTop: 18 }}>
      <Mono color={C.lime} style={{ fontSize: 11, letterSpacing: 1 }}>{t("summary.saveRoutine").toUpperCase()}</Mono>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Routine name"
        placeholderTextColor={C.ash}
        style={{ marginTop: 8, fontFamily: F.mono, fontSize: 15, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
      />
      <Pressable
        onPress={save}
        disabled={state === "saving"}
        style={{ backgroundColor: C.lime, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 10, opacity: state === "saving" ? 0.6 : 1 }}
      >
        <Text style={{ fontFamily: F.black, fontSize: 15, color: C.ink }}>{state === "saving" ? "…" : t("summary.saveRoutine")}</Text>
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
          distance: b.kind === "cardio" && b.distance != null ? String(b.distance) : "",
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
        <Text style={{ fontFamily: F.bold, fontSize: 12, color: C.chalk }}>{label}</Text>
      </Pressable>
      <Animated.View style={{ transform: [{ translateX: tx }], backgroundColor: C.card }} {...pan.panHandlers}>
        {children}
      </Animated.View>
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
      style={{ flex: 1, fontFamily: F.mono, fontSize: 16, color: done ? C.ash : C.chalk, textAlign: "center", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingVertical: 10 }}
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
