"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { fs, space,
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  newPrsInSession,
  newCardioPrsInSession,
  sessionVolume,
  volumeByMuscle,
  sessionFunFact,
  funFactText,
  blockBestE1rm,
  lastStrengthByLift,
  blockSummary,
  liveSessionStats,
  defaultSessionTitle,
  fmtTonnage,
  fmtWeight,
  type WeightUnit,
  type StrengthSet,
  type PrHit,
  type CardioPrHit,
  type LoggedSession,
  type SessionBlock,
} from "@hybrid/core";
import WorkoutBlocks, { uid, type EditableBlock } from "@/components/workout-blocks";
import SaveRoutineCard, { SessionRename } from "@/components/save-routine-card";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { useWorkoutTimer, mmss } from "@/lib/use-workout-timer";
import { loadWorkoutDraft, saveWorkoutDraft, clearWorkoutDraft } from "@/lib/workout-draft";
import { shareWorkoutSlide, shareText as buildShareText, type ShareBest, type StorySlide } from "@/lib/workout-share";
import { SHARE_THEMES, shareTheme, type ShareTheme, type ShareThemeId } from "@hybrid/core";
import { useLang } from "@/lib/i18n";

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
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;

/** CSS backdrop for the on-screen story preview — mirrors the exported 9:16
 *  canvas backdrop (workout-share.ts) so the preview matches what gets shared. */
function previewBackground(th: ShareTheme): string {
  switch (th.backdrop) {
    case "mesh":
      return "radial-gradient(90% 60% at 12% 6%,#e9ff8f,transparent 55%),radial-gradient(90% 60% at 96% 14%,#bfeef7,transparent 52%),radial-gradient(100% 70% at 50% 104%,#d9c8f5,transparent 60%),radial-gradient(80% 60% at 86% 80%,#c4f035,transparent 60%),#eef0e8";
    case "blobs":
      return `radial-gradient(60% 50% at 16% 8%,rgba(196,240,53,.26),transparent 60%),radial-gradient(60% 50% at 96% 40%,rgba(127,212,232,.22),transparent 60%),radial-gradient(70% 60% at 18% 104%,rgba(201,169,240,.22),transparent 62%),${th.bg}`;
    case "ticker":
      return `radial-gradient(70% 50% at 50% 50%,rgba(196,240,53,.08),transparent 70%),${th.bg}`;
    default: // glow
      return `radial-gradient(80% 60% at 82% 4%,rgba(196,240,53,.2),transparent 60%),${th.bg}`;
  }
}
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
  initialBlocks,
}: {
  sessions: LoggedSession[];
  onSaved: () => void;
  /** Go back to Today from the summary (the analysis link uses onSaved → history). */
  onHome?: () => void;
  initialBlocks?: SessionBlock[];
}) {
  const { t } = useLang();
  // The session auto-titles itself (nobody names a workout while logging) — a
  // real name is only entered when saving a routine or via the optional rename
  // on the finish screen. `title` is internal state seeded by the default /
  // routine / AI label, no longer an input on this screen.
  const [title, setTitle] = useState(() => defaultSessionTitle());
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
  const live = useMemo(() => liveSessionStats(blocks as SessionBlock[], sessions), [blocks, sessions]);

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

  const rx = useMemo(() => {
    const log = toTrainingLog(sessions);
    return prescribeSession(log, undefined, { profiles: velocityProfiles(sessions) });
  }, [sessions]);

  const loadPrescribed = () => {
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
      const prs = newPrsInSession(finished, sessions);
      const cardioPrs = newCardioPrsInSession(finished, sessions);
      // Per-lift est-1RM bests (PR-marked) for the share card — same shape mobile uses.
      const prSet = new Set(prs.map((p) => p.lift));
      const bestMap = new Map<string, number>();
      for (const b of cleanBlocks)
        if (b.kind === "strength") {
          const e = Math.round(blockBestE1rm(b));
          if (e > 0) bestMap.set(b.name, Math.max(bestMap.get(b.name) ?? 0, e));
        }
      const bests: ShareBest[] = [...bestMap.entries()]
        .map(([name, e1rm]) => ({ name, e1rm, pr: prSet.has(name) }))
        .sort((a, b) => b.e1rm - a.e1rm);
      const minutes = Math.max(1, Math.round((Date.parse(payload.completedAt) - Date.parse(payload.startedAt)) / 60000));
      setSaving(false);
      stop(); // freeze the clock — the workout's done, the celebration is next
      clearWorkoutDraft();
      setDone({
        sessionId,
        title: payload.title,
        blocks: cleanBlocks,
        sets: cleanBlocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0),
        volume: sessionVolume(cleanBlocks),
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

  if (done) return <Finish data={done} units={prefs.units} onDone={onSaved} onHome={onHome} />;

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
        const accent = over ? C("lime") : C("blue");
        const clock = restTarget == null ? mmss(restNow) : over ? `+${mmss(restNow - restTarget)}` : `${mmss(remaining!)} ${t("workout.restLeft")}`;
        return (
          <div style={{ background: `color-mix(in srgb, ${accent} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${accent} 40%, transparent)`, borderRadius: 18, padding: "10px 14px", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
              <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.body, color: accent }}>
                {over ? t("workout.restDone") : t("workout.resting")} · {clock}
              </span>
              <button onClick={() => setRestSince(null)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, color: accent, background: "transparent", border: `1px solid ${accent}`, borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
                ■ {t("workout.stopRest")}
              </button>
            </div>
            <div style={{ display: "flex", gap: space.xs, marginTop: 10 }}>
              {REST_PRESETS.map((sec) => {
                const on = restTarget === sec;
                return (
                  <button key={sec} onClick={() => pickRest(sec)} style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: on ? C("blue") : C("ash"), background: on ? `color-mix(in srgb, ${C("blue")} 18%, transparent)` : "transparent", border: `1px solid ${on ? C("blue") : C("line")}`, borderRadius: 8, padding: "6px 0", cursor: "pointer" }}>
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

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: space.sm }}>
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
          <button onClick={loadPrescribed} style={pill("violet")}>
            {sessions.length > 0 ? `✦ ${t("w.train.logger.usePrescribed")} · ${rx.readiness}` : `✦ ${t("w.train.logger.startSession")}`}
          </button>
          {routines.map((r) => (
            <button key={r.id} onClick={() => loadRoutine(r)} style={pill("lime")} title={r.blocks.map((b) => b.name).join(" · ")}>
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
        rirMode={prefs.rpeAsRir}
        units={prefs.units}
        plateCalc={prefs.plateCalc}
        live
        lastByLift={lastByLift}
        onToggleDone={toggleDone}
      />

      {error && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginBottom: 10, color: C("red") }}>
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
          color: C("ink"),
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
function Finish({ data, units, onDone, onHome }: { data: FinishData; units: WeightUnit; onDone: () => void; onHome?: () => void }) {
  const { t } = useLang();
  const { sessionId, blocks, sets, volume, minutes, bests, prs, cardioPrs, firstEver } = data;
  // Title can be renamed here (optional) — start from the auto-title.
  const [title, setTitle] = useState(data.title);
  const milestone = firstEver || prs.length > 0 || cardioPrs.length > 0;
  const [shareMsg, setShareMsg] = useState("");
  const [sharing, setSharing] = useState(false);
  const [active, setActive] = useState(0);
  // The graphic style for the shared story — remembered per device.
  const prefs = useLoggerPrefs();
  const [themeId, setThemeId] = useState<ShareThemeId>(prefs.shareThemeId);
  // Adopt the stored choice once prefs hydrate (server render starts on default).
  useEffect(() => { setThemeId(prefs.shareThemeId); }, [prefs.shareThemeId]);
  const pickTheme = (id: ShareThemeId) => { setThemeId(id); setLoggerPref("shareThemeId", id); };
  const th = shareTheme(themeId);
  const themeIndex = Math.max(0, SHARE_THEMES.findIndex((o) => o.id === themeId));
  const pagerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (milestone && typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.([12, 40, 18]); } catch { /* unsupported */ }
    }
  }, [milestone]);

  const prLine = (p: PrHit) =>
    p.previous == null ? t("w.train.logger.firstTime") : `+${fmtWeight(p.e1rm - p.previous, units)}`;
  const cardioLine = (p: CardioPrHit) => (p.kind === "distance" ? `${p.move} ${p.value} km` : `${p.move} — ${t("w.train.logger.fasterPace")}`);

  // ── Build the shareable slides (Overview · PRs & bests · Muscle · Fun) ──
  const muscleVol = volumeByMuscle(blocks);
  const muscleMax = muscleVol[0]?.volume ?? 0;
  const funFact = sessionFunFact(blocks);
  const prRows: { left: string; right: string; hot?: boolean }[] = [
    ...prs.map((p) => ({ left: p.lift, right: prLine(p), hot: true })),
    ...cardioPrs.map((p) => ({ left: cardioLine(p), right: "", hot: true })),
    ...bests.filter((b) => !prs.some((p) => p.lift === b.name)).slice(0, 6).map((b) => ({ left: b.name, right: fmtWeight(b.e1rm, units) })),
  ];
  const prHeadline = prs.length > 0
    ? `🏆 ${prs.length} ${prs.length > 1 ? t("w.train.logger.newPrs") : t("w.train.logger.newPr")}`
    : cardioPrs.length > 0
      ? `🏃 ${cardioPrs.length} ${cardioPrs.length > 1 ? t("w.train.logger.cardioPrs") : t("w.train.logger.cardioPr")}`
      : t("summary.todaysBests");
  const slides: StorySlide[] = [
    { kind: "overview", eyebrow: t("summary.slide.overview"), stats: { title, minutes, sets, volume, bests, firstEver } },
    { kind: "prs", eyebrow: t("summary.slide.prs"), headline: prHeadline, rows: prRows.length ? prRows : [{ left: t("summary.noPrsYet"), right: "" }] },
    ...(muscleVol.length ? [{ kind: "muscle", eyebrow: t("summary.slide.muscle"), bars: muscleVol.slice(0, 6).map((m) => ({ label: t(`muscle.${m.muscle}`), pct: muscleMax ? Math.round((m.volume / muscleMax) * 100) : 0, value: fmtWeight(m.volume, units) })) } as StorySlide] : []),
    ...(funFact ? [{ kind: "fun", eyebrow: t("summary.slide.fun"), emoji: funFact.emoji, text: funFactText(funFact, units, t) } as StorySlide] : []),
  ];
  const activeIdx = Math.min(active, slides.length - 1);

  const share = async () => {
    setSharing(true);
    setShareMsg("");
    const caption = buildShareText({ title, minutes, sets, volume, bests, firstEver }, units, t);
    const how = await shareWorkoutSlide(slides[activeIdx]!, caption, units, t, themeId);
    setSharing(false);
    if (how === "downloaded") setShareMsg(t("w.train.logger.downloaded"));
    else if (how === "shared" || how === "text") setShareMsg(t("w.train.logger.shared"));
  };

  const onPagerScroll = () => {
    const el = pagerRef.current;
    if (el) setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  // The preview card reflects the picked theme so what you see is what you share.
  const slideShell = { ...card, background: previewBackground(th), color: th.fg, borderColor: th.line, position: "relative" as const, overflow: "hidden" as const, scrollSnapAlign: "center" as const, flex: "0 0 100%", boxSizing: "border-box" as const, minHeight: 230 };
  const statCol = (label: string, value: string) => (
    <div style={{ flex: 1, textAlign: "center" }}>
      <div style={{ fontWeight: 900, fontSize: 30, color: th.fg }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: th.muted, letterSpacing: ".1em", marginTop: 4 }}>{label}</div>
    </div>
  );
  const renderSlide = (s: StorySlide) => {
    if (s.kind === "overview")
      return (
        <>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: th.accent }}>{s.eyebrow}</div>
          <div style={{ fontWeight: 800, fontSize: fs.subtitle, marginTop: 10 }}>{s.stats.title || "Workout"}</div>
          <div style={{ display: "flex", marginTop: 28 }}>
            {statCol(t("summary.minutes"), String(minutes))}
            {statCol(t("w.train.logger.sets"), String(sets))}
            {statCol(t("summary.volumeMoved"), fmtTonnage(volume, units))}
          </div>
        </>
      );
    if (s.kind === "prs")
      return (
        <>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: th.accent }}>{s.eyebrow}</div>
          <div style={{ fontWeight: 800, fontSize: fs.note, color: th.accent, marginTop: 10 }}>{s.headline}</div>
          {s.rows.slice(0, 6).map((r, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10, fontFamily: "var(--font-mono)", fontSize: fs.body }}>
              <span>{r.hot ? "🏆 " : ""}{r.left}</span>
              {r.right && <span style={{ color: r.hot ? th.accent : th.fg, fontWeight: 700 }}>{r.right}</span>}
            </div>
          ))}
        </>
      );
    if (s.kind === "muscle")
      return (
        <>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: th.accent }}>{s.eyebrow}</div>
          {s.bars.map((b, i) => (
            <div key={i} style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: fs.caption, marginBottom: 4 }}>
                <span>{b.label}</span>
                <span style={{ color: th.muted }}>{b.value}</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: th.surface, overflow: "hidden" }}>
                <div style={{ width: `${Math.max(4, b.pct)}%`, height: "100%", background: th.accent }} />
              </div>
            </div>
          ))}
        </>
      );
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", textAlign: "center" }}>
        <div style={{ fontSize: 64 }}>{s.emoji}</div>
        <div style={{ fontWeight: 700, fontSize: fs.subtitle, marginTop: 14, lineHeight: 1.35 }}>{s.text}</div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: 560, margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* Hero + heading + workout name on top. */}
      <div className="win-pop" style={{ textAlign: "center", marginTop: 8, marginBottom: 18 }}>
        <div style={{ width: 76, height: 76, borderRadius: "50%", margin: "0 auto", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--color-lime) 14%, transparent)", border: `2px solid ${C("lime")}`, fontSize: 36 }}>{firstEver ? "🎉" : "✓"}</div>
        <div style={{ fontWeight: 900, fontSize: 28, marginTop: 14 }}>{firstEver ? t("w.train.logger.firstDone") : t("w.train.logger.sessionComplete")}</div>
        <div style={{ fontWeight: 700, fontSize: fs.subtitle, marginTop: 6 }}>{title || "Workout"}</div>
        <SessionRename sessionId={sessionId} value={title} onRenamed={setTitle} />
      </div>

      {/* Swipeable summary slides — each shareable as its own 9:16 story. */}
      <div
        ref={pagerRef}
        onScroll={onPagerScroll}
        style={{ display: "flex", gap: 0, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", margin: "0 -2px" }}
      >
        {slides.map((s, i) => (
          <div key={i} style={{ flex: "0 0 100%", padding: "0 2px", boxSizing: "border-box" }}>
            <div style={slideShell}>
              {th.backdrop === "ticker" && (
                <div aria-hidden style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 2, overflow: "hidden", pointerEvents: "none" }}>
                  {Array.from({ length: 7 }).map((_, r) => (
                    <div key={r} style={{ whiteSpace: "nowrap", fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 34, letterSpacing: "-.02em", textTransform: "uppercase", color: r === 3 ? "color-mix(in srgb, var(--color-lime) 16%, transparent)" : "transparent", WebkitTextStroke: r === 3 ? undefined : "1px rgba(243,244,239,.06)" }}>
                      {(title || "Workout").toUpperCase()} · {(title || "Workout").toUpperCase()} ·
                    </div>
                  ))}
                </div>
              )}
              <div style={{ position: "relative", zIndex: 1, height: "100%" }}>{renderSlide(s)}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginTop: 12 }}>
        {slides.map((_, i) => (
          <div key={i} style={{ width: i === activeIdx ? 18 : 6, height: 6, borderRadius: 3, background: i === activeIdx ? C("lime") : C("line"), transition: "width .2s" }} />
        ))}
      </div>

      {/* Pick the graphic style — a sliding segmented toggle. */}
      <div style={{ marginTop: 18 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".14em", color: C("ash"), textAlign: "center", marginBottom: 8 }}>{t("summary.pickStyle")}</div>
        <div style={{ position: "relative", display: "flex", padding: 4, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999 }}>
          <div aria-hidden style={{ position: "absolute", top: 4, bottom: 4, left: 4, width: "calc((100% - 8px) / 4)", borderRadius: 999, background: C("lime"), transform: `translateX(calc(${themeIndex} * 100%))`, transition: "transform .25s cubic-bezier(.4,0,.2,1)" }} />
          {SHARE_THEMES.map((opt) => {
            const on = opt.id === themeId;
            return (
              <button
                key={opt.id}
                onClick={() => pickTheme(opt.id)}
                aria-pressed={on}
                style={{ position: "relative", zIndex: 1, flex: 1, cursor: "pointer", background: "transparent", border: "none", padding: "9px 0", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.caption, color: on ? C("ink") : C("ash"), transition: "color .2s" }}
              >
                {opt.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* One Share button — shares the slide on screen as a 9:16 story. */}
      <button
        onClick={share}
        disabled={sharing}
        style={{
          width: "100%",
          fontFamily: "var(--font-display)",
          fontWeight: 800,
          fontSize: fs.note,
          background: C("lime"),
          color: C("ink"),
          border: "none",
          borderRadius: 999,
          padding: "13px 28px",
          cursor: sharing ? "default" : "pointer",
          marginTop: 16,
          boxShadow: milestone ? `0 0 18px -2px color-mix(in srgb, ${C("lime")} 60%, transparent)` : "none",
        }}
      >
        {sharing ? "…" : `↗ ${t("w.train.logger.shareStory")}`}
      </button>
      {shareMsg && <div style={{ textAlign: "center", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("lime"), marginTop: 8 }}>{shareMsg}</div>}

      {/* Save as routine. */}
      <div style={{ marginTop: 14 }}>
        <SaveRoutineCard blocks={blocks} defaultName={title} />
      </div>

      {/* See analysis — at the very bottom (onDone → history). */}
      <button onClick={onDone} style={{ width: "100%", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.note, background: "transparent", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "14px 28px", cursor: "pointer", marginTop: 24 }}>
        {t("summary.seeAnalysis")}
      </button>
      {onHome && (
        <button onClick={onHome} style={{ width: "100%", fontFamily: "var(--font-mono)", fontSize: fs.body, background: "transparent", color: C("ash"), border: "none", padding: "16px 0", cursor: "pointer" }}>
          {t("summary.doneToday")}
        </button>
      )}
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
