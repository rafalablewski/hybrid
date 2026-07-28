"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fs, space,
  brand,
  prescribeSession,
  feelSamples,
  loadBaseline,
  checkinFeeling,
  personalTrainingLog,
  velocityProfiles,
  newPrsInSession,
  newCardioPrsInSession,
  sessionVolume,
  volumeByMuscle,
  sessionFunFact,
  funFactText,
  STORY_STYLES,
  DEFAULT_STORY_STYLE,
  storyStyle,
  type StoryStyle,
  type StoryStyleId,
  blockTopLoad,
  strengthPrDelta,
  formatStrengthPr,
  formatCardioPr,
  lastStrengthByLift,
  blockSummary,
  liveSessionStats,
  needsBodyweight,
  unitToKg,
  defaultSessionTitle,
  fmtTonnage,
  fmtWeight,
  type WeightUnit,
  type StrengthSet,
  type PrHit,
  type CardioPrHit,
  type LoggedSession,
  type SessionBlock,
  FUNNEL,
} from "@hybrid/core";
import { useRouter } from "next/navigation";
import WorkoutBlocks, { uid, type EditableBlock } from "@/components/workout-blocks";
import SaveRoutineCard, { SessionRename, SessionNote } from "@/components/save-routine-card";
import { FeelPrompt } from "./feel-prompt";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { useBodyweightLookup, refreshBodyweight } from "@/lib/use-bodyweight";
import { useWorkoutTimer, mmss } from "@/lib/use-workout-timer";
import { loadWorkoutDraft, saveWorkoutDraft, clearWorkoutDraft } from "@/lib/workout-draft";
import { shareWorkoutSlide, shareText as buildShareText, type ShareBest, type StorySlide } from "@/lib/workout-share";
import { StoryCard } from "./story-card";
import { useLang } from "@/lib/i18n";
import { usePersona } from "@/lib/persona";
import { track } from "@/lib/track";

// A strength set carrying the transient live-mode flag — `done` is banking
// state only and is stripped before save (the saved set keeps `rest`, a real
// SessionBlock field, plus load/reps/rpe/vel/drop/role).
type LiveSet = StrengthSet & { done?: boolean };
const REST_PRESETS = [60, 90, 120, 180] as const;

type FinishData = {
  sessionId: string | null;
  title: string;
  blocks: SessionBlock[];
  sets: number;
  volume: number;
  minutes: number;
  bests: ShareBest[];
  prs: PrHit[];
  cardioPrs: CardioPrHit[];
  firstEver: boolean;
};

type Routine = { id: string; name: string; blocks: SessionBlock[] };

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
const pill = (token: string): React.CSSProperties => {
  const c = C(token);
  return { fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, borderRadius: 999, padding: "8px 16px", cursor: "pointer" };
};

/** AURORA Logger (web) — AI prescription + routines + the WorkoutBlocks editor,
 *  reusing the exact prescribeSession engine and /api/sessions + /api/templates. */
export default function AuroraLogger({
  sessions,
  onSaved,
  onHome,
  onUpgrade,
  initialBlocks,
  initialTitle,
}: {
  sessions: LoggedSession[];
  onSaved: () => void;
  /** Go back to Today from the summary (the analysis link uses onSaved → history). */
  onHome?: () => void;
  /** In-shell navigation to the upgrade screen (Save-as-routine is Full). */
  onUpgrade?: () => void;
  initialBlocks?: SessionBlock[];
  /** Title a plan-seeded session saves under ("<plan> – Week N, <day>") so the
   *  schedule engine recognises it as the plan's own — mobile-parity stamping.
   *  Without it the session auto-titles by time of day as before. */
  initialTitle?: string;
}) {
  const { t } = useLang();
  const router = useRouter();
  // AI prescription is a premium (paid) feature — a casual user is sent to the
  // upgrade paywall instead of getting a fabricated session.
  const isAthlete = usePersona() !== "casual";
  // The session auto-titles itself (nobody names a workout while logging) — a
  // real name is only entered when saving a routine or via the optional rename
  // on the finish screen. `title` is internal state seeded by the default /
  // routine / AI label, no longer an input on this screen.
  const [title, setTitle] = useState(() => initialTitle ?? defaultSessionTitle());
  const [blocks, setBlocks] = useState<EditableBlock[]>(
    () => initialBlocks?.map((b) => ({ uid: uid(), ...b }) as EditableBlock) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  // The finish CELEBRATION — at parity with the mobile summary. Finishing is the
  // payoff, so instead of silently navigating away we land on a win screen.
  const [done, setDone] = useState<FinishData | null>(null);
  const prefs = useLoggerPrefs();
  // Bodyweight-aware tonnage: 10 BW pull-ups at 70 kg = 700 kg of work.
  const bw = useBodyweightLookup();
  const bodyweightKg = bw();
  // Live workout clock — starts the moment you enter to log (after the get-ready
  // count-in), so the saved session records real training time. Web twin of the
  // mobile live logger's timer.
  const { elapsed, countdown, startedAt, paused, togglePause, resumeFrom, stop } = useWorkoutTimer();

  // --- Live rest timer (twin of the mobile logger) -------------------------
  // Banking a set (✓) starts a rest countdown to a target (default from prefs),
  // ticking down to zero then over-resting; a buzz fires when the target's hit.
  const [restSince, setRestSince] = useState<number | null>(null);
  const [restNow, setRestNow] = useState(0);
  const [restTarget, setRestTarget] = useState<number | null>(null);
  const restFired = useRef(false);
  const restPausedAt = useRef(0);
  // Draft restore runs once post-mount (localStorage is client-only — reading it
  // in render would desync SSR hydration), so we gate the auto-save on it.
  const [restored, setRestored] = useState(false);

  // Apply the default rest target from prefs (and clear it when the auto rest
  // timer is turned off). Runs when prefs land/change, not mid-set.
  useEffect(() => {
    setRestTarget(prefs.restTimer ? prefs.restSeconds : null);
  }, [prefs.restTimer, prefs.restSeconds]);

  // Restore an interrupted draft once on mount (unless we were seeded with a
  // plan/AI day, which wins). Keeps the original clock running via resumeFrom.
  useEffect(() => {
    if (!initialBlocks || initialBlocks.length === 0) {
      const draft = loadWorkoutDraft();
      // Guard the parsed start — a corrupt draft date would make startedAt an
      // Invalid Date and crash toISOString() on save. Fall back to a fresh clock.
      const parsedStart = draft ? Date.parse(draft.startedAt) : NaN;
      if (draft && !Number.isNaN(parsedStart)) {
        setBlocks(draft.blocks);
        setTitle(draft.title);
        resumeFrom(parsedStart);
      }
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the in-progress draft as it changes (debounced) so a refresh / crash
  // / accidental nav never costs the session. Only after the initial restore.
  useEffect(() => {
    if (!restored) return;
    const id = setTimeout(() => {
      if (blocks.length) saveWorkoutDraft({ title, startedAt: startedAt.current.toISOString(), blocks });
      else clearWorkoutDraft();
    }, 500);
    return () => clearTimeout(id);
    // `paused` is included so a pause/resume (which shifts startedAt) re-persists
    // the draft with the corrected start — otherwise a stale start drifts on resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, title, restored, paused]);

  // Tick the rest countdown; buzz once when the chosen target is reached.
  useEffect(() => {
    if (restSince == null || paused) return;
    const id = setInterval(() => {
      const rn = Math.floor((Date.now() - restSince) / 1000);
      setRestNow(rn);
      if (restTarget && rn >= restTarget && !restFired.current) {
        restFired.current = true;
        if (prefs.haptics && typeof navigator !== "undefined" && "vibrate" in navigator) {
          try { navigator.vibrate?.([12, 40, 18]); } catch { /* unsupported */ }
        }
      }
    }, 1000);
    return () => clearInterval(id);
  }, [restSince, restTarget, paused, prefs.haptics]);

  // Keep the screen awake while logging (Wake Lock API; re-acquired when the tab
  // returns to the foreground). Released on finish / unmount. Mobile parity.
  useEffect(() => {
    if (!prefs.keepAwake || done) return;
    type Sentinel = { release: () => Promise<void> };
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Sentinel> } };
    if (!nav.wakeLock) return;
    let sentinel: Sentinel | null = null;
    let cancelled = false;
    const acquire = () => {
      nav.wakeLock!.request("screen").then((s) => { if (cancelled) s.release().catch(() => {}); else sentinel = s; }).catch(() => {});
    };
    acquire();
    const onVis = () => { if (document.visibilityState === "visible" && !cancelled) acquire(); };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVis);
      sentinel?.release().catch(() => {});
    };
  }, [prefs.keepAwake, done]);

  // "Last time" per lift — the most recent prior session's sets, as a summary
  // string the editor shows above each strength block (progressive-overload cue).
  const lastByLift = useMemo(() => {
    const out = new Map<string, string>();
    lastStrengthByLift(sessions).forEach((blk, name) => out.set(name, blockSummary(blk)));
    return out;
  }, [sessions]);

  // Live in-session scoreboard — running exercises / sets / volume / PRs, off the
  // shared core helper so it matches the finish summary and the mobile logger.
  const live = useMemo(() => liveSessionStats(blocks as SessionBlock[], sessions, { bodyweightKg }), [blocks, sessions, bodyweightKg]);

  // Nudge to set a bodyweight when the session has a bodyweight lift (dips,
  // pull-ups…) and none is on file — otherwise its tonnage reads 0.
  const needsBw = useMemo(() => needsBodyweight(blocks as SessionBlock[], bodyweightKg), [blocks, bodyweightKg]);

  // Pause/resume: shift the running rest forward by the held time too, so it
  // doesn't jump when the clock wakes back up (the elapsed clock is shifted in
  // the timer hook).
  const handlePause = () => {
    if (paused) {
      if (restSince != null) setRestSince(restSince + (Date.now() - restPausedAt.current));
    } else {
      restPausedAt.current = Date.now();
    }
    togglePause();
  };

  // Bank / un-bank a set (✓). Banking records the rest that preceded it and
  // starts a fresh rest countdown — unless it flows into a drop set or the next
  // exercise of a superset (you keep moving), mirroring the mobile logger.
  const toggleDone = (blockUid: string, i: number, val: boolean) => {
    const restTaken = val && restSince != null ? Math.floor((Date.now() - restSince) / 1000) : undefined;
    setBlocks((bs) =>
      bs.map((b) =>
        b.uid === blockUid && b.kind === "strength"
          ? { ...b, sets: b.sets.map((s, j) => (j === i ? ({ ...s, done: val, rest: val ? restTaken : undefined } as LiveSet) : s)) }
          : b,
      ),
    );
    if (!val) return;
    if (prefs.haptics && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.(8); } catch { /* unsupported */ }
    }
    const blk = blocks.find((b) => b.uid === blockUid);
    if (!blk || blk.kind !== "strength") return;
    // Auto-advance: banking the last set appends a fresh one so you keep going.
    if (prefs.autoAdvance && i === blk.sets.length - 1) {
      setBlocks((bs) => bs.map((b) => (b.uid === blockUid && b.kind === "strength" ? { ...b, sets: [...b.sets, { load: "", reps: "", rpe: "" }] } : b)));
    }
    const nextIsDrop = !!blk.sets[i + 1]?.drop;
    let midSuperset = false;
    if (blk.group) {
      const members = blocks.filter((b) => b.kind === "strength" && b.group === blk.group);
      midSuperset = members[members.length - 1]?.uid !== blk.uid;
    }
    if (nextIsDrop || midSuperset || !prefs.restTimer) {
      setRestSince(null); // keep moving (or rest timer disabled)
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

  useEffect(() => {
    fetch("/api/templates")
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((d) => setRoutines(d.templates ?? []))
      .catch(() => {});
  }, []);

  const loadRoutine = (r: Routine) => {
    setBlocks(r.blocks.map((b) => ({ uid: uid(), ...b }) as EditableBlock));
    setTitle(r.name);
  };

  // Today's one-tap readiness feeling scales the in-logger "AI session" quick-
  // start's load, at parity with Today's readout (client-only fetch).
  const [todayFeeling, setTodayFeeling] = useState<ReturnType<typeof checkinFeeling>>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/checkins")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { checkins?: { weekOf: string; energy: number | null; sleep: number | null; soreness: number | null; mood: number | null }[] } | null) => {
        if (!alive || !d?.checkins) return;
        const today = new Date().toDateString();
        const c = d.checkins.find((x) => x?.weekOf && new Date(x.weekOf).toDateString() === today);
        setTodayFeeling(c ? checkinFeeling(c) : null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const rx = useMemo(() => {
    const log = personalTrainingLog(sessions);
    return prescribeSession(log, undefined, { profiles: velocityProfiles(sessions), subjectiveReadiness: todayFeeling ?? undefined });
  }, [sessions, todayFeeling]);

  const loadPrescribed = () => {
    if (!isAthlete) {
      track(FUNNEL.upgradeEntryClick, { client: "web", source: "logger-ai" });
      router.push("/upgrade");
      return;
    }
    setBlocks(
      rx.blocks.map((b) => {
        if (b.kind === "strength") return { uid: uid(), kind: "strength", name: b.name, sets: b.sets };
        if (b.kind === "cardio")
          return {
            uid: uid(),
            kind: "cardio",
            name: b.name,
            ...(b.distance != null ? { distance: b.distance } : {}),
            ...(b.minutes != null ? { minutes: b.minutes } : {}),
          };
        return {
          uid: uid(),
          kind: "conditioning",
          name: b.name,
          format: b.format,
          ...(b.work != null ? { work: b.work } : {}),
          ...(b.rest != null ? { rest: b.rest } : {}),
          ...(b.rounds != null ? { rounds: b.rounds } : {}),
          minutes:
            b.minutes ??
            (b.work && b.rest && b.rounds ? Math.round((b.rounds * (b.work + b.rest)) / 60) : undefined),
        };
      }),
    );
    setTitle(t("w.train.logger.aiPrescribed"));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const payload = {
      title: title.trim() || "Workout",
      readiness: rx.readiness,
      // The clock's real start (after the count-in) → true session duration.
      startedAt: startedAt.current.toISOString(),
      completedAt: new Date().toISOString(),
      // Strip the transient live `done` flag from strength sets (rest is a real
      // field and is kept); other block kinds pass through unchanged.
      blocks: blocks.map(({ uid: _uid, ...b }) =>
        b.kind === "strength"
          ? { ...b, sets: b.sets.map((s) => { const { done: _done, ...cleanSet } = s as LiveSet; return cleanSet; }) }
          : b,
      ),
    };
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setError(t("w.train.logger.signInSessions"));
        setSaving(false);
        return;
      }
      if (!res.ok) {
        setError(`${t("w.train.logger.saveErrorPrefix")}${res.status}${t("w.train.logger.saveErrorSuffix")}`);
        setSaving(false);
        return;
      }
      // Grab the saved row's id so the finish screen can rename it (optional).
      const saved = (await res.json().catch(() => ({}))) as { session?: { id?: string } };
      const sessionId = saved.session?.id ?? null;
      // Compute the win against everything done before this session, then land
      // on the celebration (the parent's onSaved fires when they tap Done).
      const cleanBlocks = payload.blocks as SessionBlock[];
      const finished: LoggedSession = {
        id: "new",
        title: payload.title,
        startedAt: payload.startedAt,
        completedAt: payload.completedAt,
        blocks: cleanBlocks,
      };
      const prs = newPrsInSession(finished, sessions, bw);
      const cardioPrs = newCardioPrsInSession(finished, sessions);
      // Per-lift bests (PR-marked) for the share card — the HEAVIEST weight
      // actually moved (#231), never an e1RM. Same shape mobile uses.
      const prSet = new Set(prs.map((p) => p.lift));
      const bestMap = new Map<string, number>();
      for (const b of cleanBlocks)
        if (b.kind === "strength") {
          const w = blockTopLoad(b, bodyweightKg);
          if (w > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, w));
        }
      const bests: ShareBest[] = [...bestMap.entries()]
        .map(([name, weight]) => ({ name, weight, pr: prSet.has(name) }))
        .sort((a, b) => b.weight - a.weight);
      const minutes = Math.max(1, Math.round((Date.parse(payload.completedAt) - Date.parse(payload.startedAt)) / 60000));
      setSaving(false);
      stop(); // freeze the clock — the workout's done, the celebration is next
      clearWorkoutDraft();
      setDone({
        sessionId,
        title: payload.title,
        blocks: cleanBlocks,
        sets: cleanBlocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0),
        volume: sessionVolume(cleanBlocks, false, bodyweightKg),
        minutes,
        bests,
        prs,
        cardioPrs,
        firstEver: sessions.length === 0,
      });
    } catch {
      setError(t("w.train.logger.networkError"));
      setSaving(false);
    }
  };

  if (done) return <Finish data={done} prior={sessions} units={prefs.units} onDone={onSaved} onHome={onHome} onUpgrade={onUpgrade} />;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* Live workout clock + pause — the gym timer running while you log (sticky
          so it stays visible as you scroll the session). */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: space.md,
          marginBottom: 16,
          padding: "8px 16px",
          background: "color-mix(in srgb, var(--color-ink2) 86%, transparent)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
          border: `1px solid ${C("line")}`,
          borderRadius: 999,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: space.sm }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, letterSpacing: 1, color: paused ? C("amber") : C("chalk") }}>{mmss(elapsed)}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".18em", color: paused ? C("amber") : C("ash") }}>{paused ? t("workout.paused") : t("workout.elapsed")}</span>
        </div>
        <button
          onClick={handlePause}
          title={paused ? t("workout.go") : t("workout.paused")}
          style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, color: paused ? C("ink") : C("amber"), background: paused ? C("amber") : "transparent", border: `1px solid ${C("amber")}`, borderRadius: 999, padding: "5px 14px", cursor: "pointer" }}
        >
          {paused ? "▶" : "❚❚"}
        </button>
      </div>

      {/* Rest countdown — appears after you bank a set (✓); ticks down to the
          target, then shows the over-rest. Twin of the mobile rest banner. */}
      {restSince != null && (() => {
        const remaining = restTarget != null ? restTarget - restNow : null;
        const over = remaining != null && remaining <= 0;
        const accent = over ? C("lime") : C("ash");
        const clock = restTarget == null ? mmss(restNow) : over ? `+${mmss(restNow - restTarget)}` : `${mmss(remaining!)} ${t("workout.restLeft")}`;
        return (
          <div style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`, borderRadius: 18, padding: "10px 14px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.body, color: accent }}>
                {over ? t("workout.restDone") : t("workout.resting")} – {clock}
              </span>
              <button onClick={() => setRestSince(null)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, color: accent, background: "transparent", border: `1px solid ${accent}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
                ■ {t("workout.stopRest")}
              </button>
            </div>
            <div style={{ display: "flex", gap: space.xs, marginTop: 10 }}>
              {REST_PRESETS.map((sec) => {
                const on = restTarget === sec;
                return (
                  <button key={sec} onClick={() => pickRest(sec)} style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: on ? C("lime") : C("ash"), background: on ? `color-mix(in srgb, ${C("lime")} 18%, transparent)` : "transparent", border: `1px solid ${on ? C("lime") : C("line")}`, borderRadius: 8, padding: "6px 0", cursor: "pointer" }}>
                    {sec < 120 ? `${sec}s` : `${sec / 60}m`}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Live in-session scoreboard — appears as soon as the first set lands. */}
      {live.sets > 0 && (
        <div style={{ display: "flex", gap: space.sm, marginBottom: 14 }}>
          <LiveStat label={t("w.train.logger.liveExercises")} value={String(live.exercises)} />
          <LiveStat label={t("w.train.logger.liveSets")} value={String(live.sets)} />
          <LiveStat label={t("w.train.logger.liveVolume")} value={fmtTonnage(live.volume, prefs.units)} />
          {live.prs + live.cardioPrs > 0 && (
            <div style={{ flex: 1, textAlign: "center", borderRadius: 16, padding: "10px 8px", background: `color-mix(in srgb, ${C("lime")} 16%, transparent)`, border: `1px solid ${C("lime")}` }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, color: C("lime") }}>🏆 {live.prs + live.cardioPrs}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".14em", color: C("lime") }}>{live.prs + live.cardioPrs === 1 ? t("w.train.logger.livePr") : t("w.train.logger.livePrs")}</div>
            </div>
          )}
        </div>
      )}

      {/* Bodyweight nudge — appears when a bodyweight lift is on the board but no
          bodyweight is on file, so its tonnage would silently read 0. Set it
          right here and the live volume recomputes. */}
      {needsBw && <BodyweightNudge units={prefs.units} />}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: space.sm }}>
        {/* On-demand rest-timer switch — same persisted pref as Settings, so
            flipping it mid-workout sticks for next time too. */}
        <button
          onClick={() => {
            const next = !prefs.restTimer;
            setLoggerPref("restTimer", next);
            if (!next) setRestSince(null);
          }}
          style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: prefs.restTimer ? C("blue") : C("ash"), background: "none", border: `1px solid ${prefs.restTimer ? C("blue") : C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}
          title={t("loggerPrefs.restTimer")}
        >
          ⏱ {prefs.restTimer ? `${prefs.restSeconds}s` : t("common.off")}
        </button>
        <button
          onClick={() => setLoggerPref("detailed", !prefs.detailed)}
          style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), background: "none", border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}
          title={t("w.train.logger.toggleRpeVel")}
        >
          {prefs.detailed ? t("w.train.logger.detailed") : t("w.train.logger.simple")}
        </button>
        {prefs.detailed && (
          <button
            onClick={() => setLoggerPref("rpeAsRir", !prefs.rpeAsRir)}
            style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), background: "none", border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}
            title={t("w.train.logger.logEffortAs")}
          >
            {prefs.rpeAsRir ? "RIR" : "RPE"}
          </button>
        )}
      </div>

      {/* No session-title input here — the workout auto-titles itself; a name is
          only entered when saving a routine (or via the finish-screen rename). */}

      {/* Empty-state quick-starts (compact — keeps this a QUICK LOG, not a
          builder): pull today's AI-prescribed session, or load a saved routine.
          Hidden once you've added/seeded blocks. */}
      {blocks.length === 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: space.sm, marginBottom: 14 }}>
          <button onClick={loadPrescribed} style={isAthlete ? pill("lime") : { fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, color: "var(--premium-accent-text)", background: "color-mix(in srgb, var(--premium-accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--premium-accent) 40%, transparent)", borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>
            {!isAthlete
              ? `✦ ${t("w.home.today.unlockFullBtn")}`
              : sessions.length > 0
                ? `✦ ${t("w.train.logger.usePrescribed")} – ${rx.readiness}`
                : `✦ ${t("w.train.logger.startSession")}`}
          </button>
          {routines.map((r) => (
            <button key={r.id} onClick={() => loadRoutine(r)} style={pill("chalk")} title={r.blocks.map((b) => b.name).join(" – ")}>
              {r.name}
            </button>
          ))}
        </div>
      )}

      <WorkoutBlocks
        blocks={blocks}
        setBlocks={setBlocks}
        emptyHint={t("w.train.logger.emptyHint")}
        reorder
        detailed={prefs.detailed}
        velocity={prefs.velocity}
        rirMode={prefs.rpeAsRir}
        units={prefs.units}
        plateCalc={prefs.plateCalc}
        live
        carryOver={prefs.carryOver}
        bodyweightKg={bodyweightKg}
        lastByLift={lastByLift}
        restSec={prefs.restTimer ? prefs.restSeconds : null}
        onToggleDone={toggleDone}
      />

      {error && (
        <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginBottom: 10, color: C("red") }}>
          {error}
        </div>
      )}

      {/* One bottom action — finishing IS the save. "Save as routine" moved to
          the finish screen (it belongs after you're done, not while logging). */}
      <button
        onClick={save}
        disabled={saving || blocks.length === 0}
        style={{
          width: "100%",
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: fs.note,
          background: C("lime"),
          color: "var(--on-accent)",
          border: "none",
          borderRadius: 999,
          padding: "16px 28px",
          cursor: saving || blocks.length === 0 ? "default" : "pointer",
          opacity: saving || blocks.length === 0 ? 0.5 : 1,
          boxShadow: saving || blocks.length === 0 ? "none" : `0 0 22px -6px color-mix(in srgb, ${C("lime")} 55%, transparent)`,
        }}
      >
        {saving ? t("w.train.logger.saving") : t("w.train.logger.finishWorkout")}
      </button>

      {/* Get-ready count-in — covers the screen on entry until GO, then the
          elapsed clock starts from zero (the timer "goes off"). */}
      {countdown != null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: C("ink"), display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, letterSpacing: ".2em", color: C("ash"), marginBottom: 12 }}>{t("workout.getReady").toUpperCase()}</div>
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: countdown > 0 ? 132 : 96, color: C("lime"), lineHeight: 1 }}>
            {countdown > 0 ? countdown : t("workout.go")}
          </div>
        </div>
      )}
    </div>
  );
}

/** The finish CELEBRATION — the web twin of the mobile workout summary. A win
 *  should LAND: the hero + PR cards pop in (.win-pop), and on a PR/first we fire
 *  a short navigator.vibrate where the device supports it (the web analog of the
 *  native success haptic). */
function Finish({ data, prior, units, onDone, onHome, onUpgrade }: { data: FinishData; prior: LoggedSession[]; units: WeightUnit; onDone: () => void; onHome?: () => void; onUpgrade?: () => void }) {
  const { t } = useLang();
  const router = useRouter();
  const bwLookup = useBodyweightLookup();
  const bodyweightKg = bwLookup();
  // "vs your usual" on the feel prompt — the athlete against THEMSELVES over the
  // last month, from the sessions they'd already rated before this one.
  const feelBaseline = useMemo(() => loadBaseline(feelSamples(prior, bwLookup)), [prior, bwLookup]);
  const { sessionId, blocks, sets, volume, minutes, bests, prs, cardioPrs, firstEver } = data;
  // Title can be renamed here (optional) — start from the auto-title.
  const [title, setTitle] = useState(data.title);
  const hasWin = prs.length > 0 || cardioPrs.length > 0;
  const milestone = firstEver || hasWin;
  const [shareMsg, setShareMsg] = useState("");
  const [sharing, setSharing] = useState(false);
  const [active, setActive] = useState(0);
  // The chosen "wrapped" look. No toggle any more — TAPPING the card cycles
  // through the shared looks (the control folded into the object itself;
  // mobile parity: workout.tsx cycleStyle).
  const [styleId, setStyleId] = useState<StoryStyleId>(DEFAULT_STORY_STYLE);
  const st = storyStyle(styleId);
  const cycleStyle = () => {
    setStyleId((cur) => {
      const i = STORY_STYLES.findIndex((s) => s.id === cur);
      return STORY_STYLES[(i + 1) % STORY_STYLES.length]!.id;
    });
  };
  // The ★ satellite expands the save-as-routine composer beneath the cluster.
  const [routineOpen, setRoutineOpen] = useState(false);
  // The win is the headline: a first or a PR retitles the one Share action.
  const shareLabel = firstEver ? t("summary.shareFirst") : hasWin ? t("summary.sharePr") : t("summary.share");
  const pagerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (milestone && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.([12, 40, 18]); } catch { /* unsupported */ }
    }
  }, [milestone]);

  // Shared with mobile so the three-way branch can't drift; summary.firstTime
  // (not w.train.logger.firstTime) is what every other PR row on both clients uses.
  const prLine = (p: PrHit) =>
    strengthPrDelta(p, { first: t("summary.firstTime"), moreReps: t("summary.morePrReps") }, units);
  // The shared cardio formatter — renders in the move's natural unit (metres for
  // swimming/rowing) with a delta, matching mobile.
  const cardioLine = (p: CardioPrHit) => formatCardioPr(p, t("summary.firstTime"));

  // ── Build the shareable slides (Overview · PRs & bests · Muscle · Fun) ──
  const muscleVol = volumeByMuscle(blocks, false, bodyweightKg);
  const muscleMax = muscleVol[0]?.volume ?? 0;
  const funFact = sessionFunFact(blocks, bodyweightKg);
  const prRows: { left: string; right: string; hot?: boolean }[] = [
    ...prs.map((p) => ({ left: p.lift, right: prLine(p), hot: true })),
    ...cardioPrs.map((p) => ({ left: cardioLine(p), right: "", hot: true })),
    ...bests.filter((b) => !prs.some((p) => p.lift === b.name)).slice(0, 6).map((b) => ({ left: b.name, right: fmtWeight(b.weight, units) })),
  ];
  const prHeadline = prs.length > 0
    ? `🏆 ${prs.length} ${prs.length > 1 ? t("w.train.logger.newPrs") : t("w.train.logger.newPr")}`
    : cardioPrs.length > 0
      ? `🏃 ${cardioPrs.length} ${cardioPrs.length > 1 ? t("w.train.logger.cardioPrs") : t("w.train.logger.cardioPr")}`
      : t("summary.todaysBests");
  const slides: StorySlide[] = [
    { kind: "overview", eyebrow: t("summary.slide.overview"), stats: { title, minutes, sets, volume, bests, firstEver } },
    { kind: "stat", eyebrow: t("summary.slide.time"), value: String(minutes), unit: t("summary.minutes") },
    { kind: "stat", eyebrow: t("summary.slide.load"), value: fmtTonnage(volume, units), unit: t("summary.volumeMoved") },
    { kind: "prs", eyebrow: t("summary.slide.prs"), headline: prHeadline, rows: prRows.length ? prRows : [{ left: t("summary.noPrsYet"), right: "" }] },
    ...(muscleVol.length ? [{ kind: "muscle", eyebrow: t("summary.slide.muscle"), bars: muscleVol.slice(0, 6).map((m) => ({ label: t(`muscle.${m.muscle}`), pct: muscleMax ? Math.round((m.volume / muscleMax) * 100) : 0, value: fmtWeight(m.volume, units) })) } as StorySlide] : []),
    ...(funFact ? [{ kind: "fun", eyebrow: t("summary.slide.fun"), emoji: funFact.emoji, text: funFactText(funFact, units, t) } as StorySlide] : []),
  ];
  const activeIdx = Math.min(active, slides.length - 1);

  const share = async () => {
    setSharing(true);
    setShareMsg("");
    // Same headline shape as mobile: the PR that was set, else the cardio PR,
    // else the top lift (the fallback lives in buildShareText).
    const captionHeadline = prs[0]
      ? `\u{1F3C6} ${formatStrengthPr(prs[0], { first: t("summary.firstTime"), moreReps: t("summary.morePrReps") }, units)}`
      : cardioPrs[0]
        ? `\u{1F3C3} ${cardioLine(cardioPrs[0])}`
        : null;
    const caption = buildShareText({ title, minutes, sets, volume, bests, firstEver }, units, t, captionHeadline);
    const how = await shareWorkoutSlide(slides[activeIdx]!, caption, units, t, styleId);
    setSharing(false);
    if (how === "downloaded") setShareMsg(t("w.train.logger.downloaded"));
    else if (how === "shared" || how === "text") setShareMsg(t("w.train.logger.shared"));
  };

  const onPagerScroll = () => {
    const el = pagerRef.current;
    if (el) setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  // Tapping a dot jumps to that slide — a non-swipe path to every slide so the
  // muscle/fun cards are reachable even where a horizontal swipe is awkward
  // (mobile web, trackpad-less desktop).
  const goTo = (i: number) => {
    const el = pagerRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  const previewW = 300; // on-screen story width (9:16 → 533 tall)

  // LIQUID FIELD — the card floats in an intensified pocket of the ambient
  // field; every control is the same glass material. Share is the one filled
  // (lime) action; routine + analysis are glass satellites at its sides; exit
  // is a glass ✕ up top. Mobile parity: workout.tsx Summary.
  return (
    <div style={{ position: "relative", maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* Local glow intensifiers over the ambient .lg-field (see globals.css). */}
      <div aria-hidden style={{ position: "absolute", inset: -20, overflow: "hidden", borderRadius: 36, pointerEvents: "none" }}>
        <div className="ff-disc ff-a" style={{ width: 400, height: 400, top: -70, left: -90 }} />
        <div className="ff-disc ff-b" style={{ width: 420, height: 420, bottom: -90, right: -100 }} />
      </div>

      <div style={{ position: "relative" }}>
        {/* The one exit — where dismissal muscle memory expects it. */}
        <FinishOrb glyph="✕" size={40} a11y={t("summary.doneToday")} onClick={onHome ?? onDone} />

        {/* The floating card IS the screen — the real 9:16 story (what you see
            is what gets shared). Swipe for slides; TAP to cycle the wrapped
            look (the old style toggle folded into the object itself). */}
        <div
          ref={pagerRef}
          className="win-pop"
          onScroll={onPagerScroll}
          style={{ display: "flex", gap: 0, marginTop: 6, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", touchAction: "pan-x", WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
        >
          {slides.map((s, i) => (
            <div key={i} style={{ flex: "0 0 100%", scrollSnapAlign: "center", display: "flex", justifyContent: "center", boxSizing: "border-box" }}>
              {/* Wrapper radius matches the story card (54/1080 of its width)
                  so the float shadow hugs the same corners. */}
              <div
                role="button"
                tabIndex={0}
                onClick={cycleStyle}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); cycleStyle(); } }}
                aria-label={`${t(st.nameKey)} — ${t("summary.cardHint")}`}
                style={{ cursor: "pointer", borderRadius: previewW * 0.05, boxShadow: "0 24px 60px rgba(0,0,0,.45)" }}
              >
                <StoryCard slide={s} st={st} w={previewW} t={t} units={units} active={i === activeIdx} />
              </div>
            </div>
          ))}
        </div>

        {/* Dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => goTo(i)}
              aria-label={slides[i]!.eyebrow}
              aria-current={i === activeIdx}
              style={{ width: i === activeIdx ? 18 : 6, height: 6, padding: 0, border: "none", borderRadius: 3, background: i === activeIdx ? C("lime") : C("line"), transition: "width .2s", cursor: "pointer" }}
            />
          ))}
        </div>

        {/* One whisper of a hint — the current look + how to change it. */}
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".15em", color: C("ash"), textAlign: "center", marginTop: 10, textTransform: "uppercase" }}>
          {t(st.nameKey)} — {t("summary.cardHint")}
        </div>

        {/* Optional rename + private note, as quiet as they were. */}
        <div style={{ textAlign: "center" }}>
          {/* "How did that feel?" — THE IMMEDIATE READ, asked here because this
              is the only moment it can be asked. Effort is sRPE; spentness now
              is the anchor the recovery read on Today is measured against hours
              later. The daily card asks the second half; it does not replace
              this one. See core/feel-schedule.ts. */}
          <FeelPrompt compact sessionId={sessionId} minutes={minutes} baseline={feelBaseline} />
          <SessionRename sessionId={sessionId} value={title} onRenamed={setTitle} />
          <SessionNote sessionId={sessionId} />
        </div>

        {/* The floating pill cluster — hierarchy by material: lime fill for
            Share, glass for the two satellites, nothing else competing. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 10, marginTop: 20 }}>
          <FinishOrb
            glyph="★"
            label={t("summary.orbRoutine")}
            a11y={t("summary.saveRoutine")}
            on={routineOpen}
            onClick={() => setRoutineOpen((v) => !v)}
          />
          <button
            onClick={share}
            disabled={sharing}
            style={{
              flex: 1,
              fontFamily: "var(--font-display)",
              fontWeight: 800,
              fontSize: fs.note,
              background: `color-mix(in srgb, ${C("lime")} 16%, transparent)`,
              color: C("lime"),
              border: `1px solid color-mix(in srgb, ${C("lime")} 40%, transparent)`,
              borderRadius: 999,
              padding: "16px 20px",
              cursor: sharing ? "default" : "pointer",
            }}
          >
            {sharing ? "…" : `↗︎ ${shareLabel}`}
          </button>
          <FinishOrb glyph="→" label={t("summary.orbAnalysis")} a11y={t("summary.seeAnalysis")} onClick={onDone} />
        </div>
        {shareMsg && <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("lime"), marginTop: 8 }}>{shareMsg}</div>}

        {/* Save as routine — expands from the ★ satellite. */}
        {routineOpen && (
          <SaveRoutineCard startOpen blocks={blocks} defaultName={title} onUpgrade={onUpgrade ?? (() => router.push("/upgrade"))} />
        )}
      </div>
    </div>
  );
}

/** A floating glass satellite — the Liquid-Field secondary action. A translucent
 *  chalk-tinted circle (backdrop-blur glass) holding one glyph, with an optional
 *  micro label beneath. Secondary by material: the lime Share pill stays the
 *  only filled action on the finish screen. Mobile parity: SummaryOrb. */
function FinishOrb({
  glyph,
  a11y,
  onClick,
  size = 54,
  label,
  on,
}: {
  glyph: string;
  a11y: string;
  onClick: () => void;
  size?: number;
  label?: string;
  on?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: label ? Math.max(size, 62) : size, flex: "0 0 auto" }}>
      <button
        type="button"
        onClick={onClick}
        aria-label={a11y}
        aria-pressed={on}
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          padding: 0,
          display: "grid",
          placeItems: "center",
          background: `color-mix(in srgb, ${C("chalk")} ${on ? 16 : 8}%, transparent)`,
          border: `1px solid color-mix(in srgb, ${C("chalk")} ${on ? 30 : 14}%, transparent)`,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          color: C("chalk"),
          fontFamily: "var(--font-display)",
          fontWeight: 700,
          fontSize: Math.round(size * 0.34),
          cursor: "pointer",
        }}
      >
        {glyph}
      </button>
      {label != null && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".1em", color: C("ash"), marginTop: 6, textTransform: "uppercase", whiteSpace: "nowrap" }}>
          {label}
        </div>
      )}
    </div>
  );
}

/** Set-your-bodyweight nudge — a quiet amber card the logger shows when the
 *  session has a bodyweight lift and no weight is on file (its tonnage would
 *  read 0). Set it inline: POST /api/body then refreshBodyweight() recomputes
 *  the live volume and the nudge self-dismisses. */
function BodyweightNudge({ units }: { units: WeightUnit }) {
  const { t } = useLang();
  const [val, setVal] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  const a = C("amber");
  const save = async () => {
    const n = parseFloat(val.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) {
      setState("error");
      return;
    }
    setState("saving");
    try {
      const res = await fetch("/api/body", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightKg: Math.round(unitToKg(n, units) * 10) / 10 }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      setState("saved");
      // Recompute tonnage everywhere; once the weight lands this card unmounts
      // (needsBodyweight flips false), so the "saved" flash is brief but honest.
      refreshBodyweight();
    } catch {
      setState("error");
    }
  };
  return (
    <div style={{ background: `color-mix(in srgb, ${a} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${a} 40%, transparent)`, borderRadius: 18, padding: "12px 14px", marginBottom: 14 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.body, color: a }}>⚖️ {t("w.train.logger.bwNudgeTitle")}</span>
        <button onClick={() => setDismissed(true)} aria-label={t("w.train.logger.bwNudgeDismiss")} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), background: "transparent", border: "none", cursor: "pointer", padding: 4 }}>✕</button>
      </div>
      <p style={{ fontFamily: "var(--font-display)", fontSize: fs.caption, color: C("chalk"), margin: "6px 0 10px", lineHeight: 1.4 }}>{t("w.train.logger.bwNudgeBody")}</p>
      <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
        <div style={{ position: "relative", flex: 1 }}>
          <input
            inputMode="decimal"
            value={val}
            onChange={(e) => { setVal(e.target.value); if (state === "error") setState("idle"); }}
            onKeyDown={(e) => { if (e.key === "Enter") save(); }}
            placeholder={t("w.train.logger.bwNudgeTitle")}
            aria-label={t("w.train.logger.bwNudgeTitle")}
            style={{ width: "100%", boxSizing: "border-box", fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("chalk"), background: C("ink"), border: `1px solid ${state === "error" ? C("red") : C("line")}`, borderRadius: 12, padding: "10px 44px 10px 12px" }}
          />
          <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{units}</span>
        </div>
        <button
          onClick={save}
          disabled={state === "saving"}
          style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.caption, color: "var(--on-accent)", background: a, border: "none", borderRadius: 999, padding: "10px 18px", cursor: state === "saving" ? "default" : "pointer", opacity: state === "saving" ? 0.6 : 1, whiteSpace: "nowrap" }}
        >
          {state === "saving" ? t("w.train.logger.bwNudgeSaving") : state === "saved" ? t("w.train.logger.bwNudgeSaved") : t("w.train.logger.bwNudgeSave")}
        </button>
      </div>
      {state === "error" && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), marginTop: 8 }}>{t("w.train.logger.bwNudgeError")}</div>}
    </div>
  );
}

/** A single live-scoreboard stat pill (Aurora ink card). */
function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ flex: 1, textAlign: "center", borderRadius: 16, padding: "10px 8px", background: C("ink2"), border: `1px solid ${C("line")}` }}>
      <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22, color: C("chalk") }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: ".14em", color: C("ash") }}>{label}</div>
    </div>
  );
}
