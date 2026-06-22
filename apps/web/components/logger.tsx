"use client";

import { useEffect, useMemo, useState } from "react";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  defaultSessionTitle,
  sessionVolume,
  fmtTonnage,
  type LoggedSession,
  type SessionBlock,
} from "@hybrid/core";
import { fs, space, INK, INK2, LINE, CHALK, ASH, LIME, VIOLET, RED, ON_ACCENT, disp, mono, Mono, Card } from "@/lib/ui";
import WorkoutBlocks, { blockBtn, uid, type EditableBlock } from "@/components/workout-blocks";
import SaveRoutineCard, { SessionRename } from "@/components/save-routine-card";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";
import { useWorkoutTimer, mmss } from "@/lib/use-workout-timer";

type Routine = { id: string; name: string; blocks: SessionBlock[] };

export default function Logger({
  sessions,
  onSaved,
  initialBlocks,
}: {
  sessions: LoggedSession[];
  onSaved: () => void;
  /** Seed blocks for the session — e.g. an enrolled named plan's day. */
  initialBlocks?: SessionBlock[];
}) {
  // Auto-titled — no name input while logging; a name is only entered on the
  // finish screen (Save as routine, or the optional rename).
  const [title, setTitle] = useState(() => defaultSessionTitle());
  const [blocks, setBlocks] = useState<EditableBlock[]>(
    () => initialBlocks?.map((b) => ({ uid: uid(), ...b }) as EditableBlock) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  // Once finished + saved, land on a compact summary (parity with Aurora's
  // finish screen) where Save as routine + the optional rename live.
  const [done, setDone] = useState<{ sessionId: string | null; title: string; blocks: SessionBlock[]; sets: number; volume: number } | null>(null);
  const prefs = useLoggerPrefs();
  // Live workout clock — runs from entry (after the get-ready count-in) so the
  // saved session records real training time. Twin of the mobile live logger.
  const { elapsed, countdown, startedAt } = useWorkoutTimer();

  // The user's saved routines (WorkoutTemplates) — load one to start, or save
  // the current workout as a new one.
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

  // Engine reads the athlete's REAL history. With no sessions yet it still
  // returns a sensible starter (movement base loads, no fabricated history).
  const rx = useMemo(() => {
    const log = toTrainingLog(sessions);
    return prescribeSession(log, undefined, { profiles: velocityProfiles(sessions) });
  }, [sessions]);

  const loadPrescribed = () => {
    setBlocks(
      rx.blocks.map((b) => {
        if (b.kind === "strength") return { uid: uid(), kind: "strength", name: b.name, sets: b.sets };
        if (b.kind === "cardio")
          // Steady run target — carry distance + minutes so the derived pace matches.
          return {
            uid: uid(),
            kind: "cardio",
            name: b.name,
            ...(b.distance != null ? { distance: b.distance } : {}),
            ...(b.minutes != null ? { minutes: b.minutes } : {}),
          };
        // Intervals — keep work/rest × rounds and derive editable minutes.
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
    setTitle("AI Prescribed");
  };

  const save = async () => {
    setSaving(true);
    setError("");
    const cleanBlocks = blocks.map(({ uid: _uid, ...b }) => b) as SessionBlock[];
    const payload = {
      title: title.trim() || defaultSessionTitle(),
      readiness: rx.readiness,
      // The clock's real start (after the count-in) → true session duration.
      startedAt: startedAt.current.toISOString(),
      completedAt: new Date().toISOString(),
      blocks: cleanBlocks,
    };
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 401) {
        setError("Sign in to save sessions (demo mode doesn't persist).");
        setSaving(false);
        return;
      }
      if (!res.ok) {
        setError(`Couldn't save (HTTP ${res.status}).`);
        setSaving(false);
        return;
      }
      const saved = (await res.json().catch(() => ({}))) as { session?: { id?: string } };
      setSaving(false);
      setDone({
        sessionId: saved.session?.id ?? null,
        title: payload.title,
        blocks: cleanBlocks,
        sets: cleanBlocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0),
        volume: sessionVolume(cleanBlocks),
      });
    } catch {
      setError("Network error — try again.");
      setSaving(false);
    }
  };

  // Finish screen — finishing IS the save; this is where naming + Save as
  // routine live (after you're done, not while logging).
  if (done)
    return (
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ textAlign: "center", marginTop: 8, marginBottom: 18 }}>
          <div style={{ width: 76, height: 76, borderRadius: "50%", margin: "0 auto", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${LIME} 14%, transparent)`, border: `2px solid ${LIME}`, fontSize: 36 }}>✓</div>
          <div style={{ ...disp, fontWeight: 900, fontSize: 28, marginTop: 14, color: CHALK }}>Session complete</div>
          <Mono s={{ fontSize: fs.body, display: "block", marginTop: 6 }} c={ASH}>
            {done.sets} sets · {fmtTonnage(done.volume, prefs.units)}{done.title ? ` · ${done.title}` : ""}
          </Mono>
          <div style={{ textAlign: "center" }}>
            <SessionRename sessionId={done.sessionId} value={done.title} onRenamed={(tt) => setDone((d) => (d ? { ...d, title: tt } : d))} />
          </div>
        </div>
        <SaveRoutineCard blocks={done.blocks} defaultName={done.title} />
        <button
          onClick={onSaved}
          style={{ width: "100%", ...disp, fontWeight: 800, fontSize: fs.note, background: LIME, color: ON_ACCENT, border: "none", borderRadius: 12, padding: "14px 28px", cursor: "pointer", marginTop: 12 }}
        >
          Done →
        </button>
      </div>
    );

  return (
    <div style={{ maxWidth: 760 }}>
      {/* Live workout clock — the gym timer running while you log (sticky). */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 5,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: space.sm,
          marginBottom: 16,
          padding: "10px 16px",
          background: INK2,
          border: `1px solid ${LINE}`,
          borderRadius: 12,
        }}
      >
        <span style={{ ...disp, fontWeight: 800, fontSize: 22, letterSpacing: 1, color: CHALK }}>{mmss(elapsed)}</span>
        <span style={{ ...mono, fontSize: fs.nano, letterSpacing: ".18em", color: ASH }}>ELAPSED</span>
      </div>

      {/* AI coach prescription */}
      <Card style={{ borderLeft: `3px solid ${VIOLET}`, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
            AI Coach{sessions.length > 0 ? ` · readiness ${rx.readiness}/100` : ""}
          </Mono>
          <button onClick={loadPrescribed} style={blockBtn(VIOLET)}>
            {sessions.length > 0 ? "Use prescribed →" : "Start a session →"}
          </button>
        </div>
        <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginTop: 8 }}>
          {sessions.length > 0
            ? rx.why
            : "Log a few sessions and the coach reads your real readiness, fatigue and velocity to prescribe the day. For now, tap above for a balanced starter you can edit."}
        </Mono>
      </Card>

      {/* Your routines — load a saved workout to start */}
      {routines.length > 0 && (
        <Card style={{ borderLeft: `3px solid ${LIME}`, marginBottom: 16 }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>Your routines</Mono>
          <div style={{ display: "flex", flexWrap: "wrap", gap: space.sm, marginTop: 10 }}>
            {routines.map((r) => (
              <button key={r.id} onClick={() => loadRoutine(r)} style={blockBtn(LIME)} title={r.blocks.map((b) => b.name).join(" · ")}>
                {r.name}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
        <button
          onClick={() => setLoggerPref("detailed", !prefs.detailed)}
          style={{ ...mono, fontSize: fs.caption, color: ASH, background: "none", border: `1px solid ${LINE}`, borderRadius: 999, padding: "5px 12px", cursor: "pointer", marginRight: 8 }}
          title="Toggle the RPE + velocity columns"
        >
          {prefs.detailed ? "Detailed ▾" : "Simple ▸"}
        </button>
        {prefs.detailed && (
          <button
            onClick={() => setLoggerPref("rpeAsRir", !prefs.rpeAsRir)}
            style={{ ...mono, fontSize: fs.caption, color: ASH, background: "none", border: `1px solid ${LINE}`, borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}
            title="Log effort as RPE or RIR (reps in reserve)"
          >
            {prefs.rpeAsRir ? "RIR" : "RPE"}
          </button>
        )}
      </div>

      {/* No session-title input — the workout auto-titles itself; you name it
          only on the finish screen (Save as routine / optional rename). */}

      <WorkoutBlocks
        blocks={blocks}
        setBlocks={setBlocks}
        emptyHint="Empty session — add blocks below, or pull today's prescription."
        reorder
        detailed={prefs.detailed}
        rirMode={prefs.rpeAsRir}
        units={prefs.units}
        plateCalc={prefs.plateCalc}
      />

      {error && (
        <Mono s={{ fontSize: fs.caption, display: "block", marginBottom: 10 }} c={RED}>
          {error}
        </Mono>
      )}

      {/* One bottom action — finishing IS the save. "Save as routine" now lives
          on the finish screen, where naming a workout actually makes sense. */}
      <button
        onClick={save}
        disabled={saving || blocks.length === 0}
        style={{
          width: "100%",
          ...disp,
          fontWeight: 800,
          fontSize: fs.note,
          background: LIME,
          color: ON_ACCENT,
          border: "none",
          borderRadius: 12,
          padding: "16px 28px",
          cursor: saving || blocks.length === 0 ? "default" : "pointer",
          opacity: saving || blocks.length === 0 ? 0.5 : 1,
        }}
      >
        {saving ? "Saving…" : "Finish workout"}
      </button>

      {/* Get-ready count-in — covers the screen on entry until GO, then the
          elapsed clock starts from zero (the timer "goes off"). */}
      {countdown != null && (
        <div style={{ position: "fixed", inset: 0, zIndex: 60, background: INK, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ ...mono, fontSize: fs.body, letterSpacing: ".2em", color: ASH, marginBottom: 12 }}>GET READY</div>
          <div style={{ ...disp, fontWeight: 900, fontSize: countdown > 0 ? 132 : 96, color: LIME, lineHeight: 1 }}>
            {countdown > 0 ? countdown : "GO"}
          </div>
        </div>
      )}
    </div>
  );
}
