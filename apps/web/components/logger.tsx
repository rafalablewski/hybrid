"use client";

import { useEffect, useMemo, useState } from "react";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  type LoggedSession,
  type SessionBlock,
} from "@hybrid/core";
import { INK2, LINE, CHALK, ASH, LIME, VIOLET, RED, ON_ACCENT, disp, mono, Mono, Card } from "@/lib/ui";
import WorkoutBlocks, { blockBtn, uid, type EditableBlock } from "@/components/workout-blocks";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";

type Routine = { id: string; name: string; blocks: SessionBlock[] };

const inputStyle = {
  ...mono,
  fontSize: 20,
  fontWeight: 800,
  background: INK2,
  color: CHALK,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: "8px 10px",
  outline: "none",
  boxSizing: "border-box",
} as const;

export default function Logger({
  sessions,
  onSaved,
}: {
  sessions: LoggedSession[];
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("Workout");
  const [blocks, setBlocks] = useState<EditableBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineMsg, setRoutineMsg] = useState("");
  const prefs = useLoggerPrefs();

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

  const saveAsRoutine = async () => {
    setRoutineMsg("");
    try {
      const res = await fetch("/api/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: title.trim() || "Routine", blocks: blocks.map(({ uid: _u, ...b }) => b) }),
      });
      if (!res.ok) {
        setRoutineMsg(res.status === 401 ? "Sign in to save routines." : "Couldn't save routine.");
        return;
      }
      const d = (await res.json()) as { template: Routine };
      setRoutines((rs) => [d.template, ...rs]);
      setRoutineMsg("★ Saved to your routines");
    } catch {
      setRoutineMsg("Network error — try again.");
    }
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
    const payload = {
      title: title.trim() || "Workout",
      readiness: rx.readiness,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      blocks: blocks.map(({ uid: _uid, ...b }) => b),
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
      onSaved();
    } catch {
      setError("Network error — try again.");
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 760 }}>
      {/* AI coach prescription */}
      <Card style={{ borderLeft: `3px solid ${VIOLET}`, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
            AI Coach{sessions.length > 0 ? ` · readiness ${rx.readiness}/100` : ""}
          </Mono>
          <button onClick={loadPrescribed} style={blockBtn(VIOLET)}>
            {sessions.length > 0 ? "Use prescribed →" : "Start a session →"}
          </button>
        </div>
        <Mono s={{ fontSize: 13, lineHeight: 1.5, display: "block", marginTop: 8 }}>
          {sessions.length > 0
            ? rx.why
            : "Log a few sessions and the coach reads your real readiness, fatigue and velocity to prescribe the day. For now, tap above for a balanced starter you can edit."}
        </Mono>
      </Card>

      {/* Your routines — load a saved workout to start */}
      {routines.length > 0 && (
        <Card style={{ borderLeft: `3px solid ${LIME}`, marginBottom: 16 }}>
          <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>Your routines</Mono>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
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
          style={{ ...mono, fontSize: 12, color: ASH, background: "none", border: `1px solid ${LINE}`, borderRadius: 999, padding: "5px 12px", cursor: "pointer", marginRight: 8 }}
          title="Toggle the RPE + velocity columns"
        >
          {prefs.detailed ? "Detailed ▾" : "Simple ▸"}
        </button>
        {prefs.detailed && (
          <button
            onClick={() => setLoggerPref("rpeAsRir", !prefs.rpeAsRir)}
            style={{ ...mono, fontSize: 12, color: ASH, background: "none", border: `1px solid ${LINE}`, borderRadius: 999, padding: "5px 12px", cursor: "pointer" }}
            title="Log effort as RPE or RIR (reps in reserve)"
          >
            {prefs.rpeAsRir ? "RIR" : "RPE"}
          </button>
        )}
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Session title"
        style={{ ...inputStyle, ...disp, width: "100%", marginBottom: 14 }}
      />

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
        <Mono s={{ fontSize: 12, display: "block", marginBottom: 10 }} c={RED}>
          {error}
        </Mono>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={saving || blocks.length === 0}
          style={{
            ...disp,
            fontWeight: 800,
            fontSize: 15,
            background: LIME,
            color: ON_ACCENT,
            border: "none",
            borderRadius: 12,
            padding: "14px 28px",
            cursor: saving || blocks.length === 0 ? "default" : "pointer",
            opacity: saving || blocks.length === 0 ? 0.5 : 1,
          }}
        >
          {saving ? "Saving…" : "Save session →"}
        </button>
        <button
          onClick={saveAsRoutine}
          disabled={blocks.length === 0}
          style={{ ...blockBtn(LIME), padding: "13px 20px", opacity: blocks.length === 0 ? 0.5 : 1, cursor: blocks.length === 0 ? "default" : "pointer" }}
          title="Save this workout as a reusable routine"
        >
          ★ Save as routine
        </button>
        {routineMsg && <Mono s={{ fontSize: 12 }} c={routineMsg.startsWith("★") ? LIME : ASH}>{routineMsg}</Mono>}
      </div>
    </div>
  );
}
