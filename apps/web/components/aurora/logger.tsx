"use client";

import { useEffect, useMemo, useState } from "react";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  type LoggedSession,
  type SessionBlock,
} from "@hybrid/core";
import WorkoutBlocks, { uid, type EditableBlock } from "@/components/workout-blocks";
import { useLoggerPrefs, setLoggerPref } from "@/lib/logger-prefs";

type Routine = { id: string; name: string; blocks: SessionBlock[] };

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 20 } as const;
const pill = (token: string): React.CSSProperties => {
  const c = C(token);
  return { fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: c, background: `color-mix(in srgb, ${c} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${c} 40%, transparent)`, borderRadius: 999, padding: "8px 16px", cursor: "pointer" };
};

/** AURORA Logger (web) — AI prescription + routines + the WorkoutBlocks editor,
 *  reusing the exact prescribeSession engine and /api/sessions + /api/templates. */
export default function AuroraLogger({
  sessions,
  onSaved,
  initialBlocks,
}: {
  sessions: LoggedSession[];
  onSaved: () => void;
  initialBlocks?: SessionBlock[];
}) {
  const [title, setTitle] = useState("Workout");
  const [blocks, setBlocks] = useState<EditableBlock[]>(
    () => initialBlocks?.map((b) => ({ uid: uid(), ...b }) as EditableBlock) ?? [],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [routineMsg, setRoutineMsg] = useState("");
  const prefs = useLoggerPrefs();

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
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("violet") }}>
            AI Coach{sessions.length > 0 ? ` · readiness ${rx.readiness}/100` : ""}
          </div>
          <button onClick={loadPrescribed} style={pill("violet")}>
            {sessions.length > 0 ? "Use prescribed →" : "Start a session →"}
          </button>
        </div>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 13, lineHeight: 1.5, marginTop: 8, color: C("ash") }}>
          {sessions.length > 0
            ? rx.why
            : "Log a few sessions and the coach reads your real readiness, fatigue and velocity to prescribe the day. For now, tap above for a balanced starter you can edit."}
        </p>
      </div>

      {routines.length > 0 && (
        <div style={{ ...card, marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>Your routines</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
            {routines.map((r) => (
              <button key={r.id} onClick={() => loadRoutine(r)} style={pill("lime")} title={r.blocks.map((b) => b.name).join(" · ")}>
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8, gap: 8 }}>
        <button
          onClick={() => setLoggerPref("detailed", !prefs.detailed)}
          style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), background: "none", border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}
          title="Toggle the RPE + velocity columns"
        >
          {prefs.detailed ? "Detailed ▾" : "Simple ▸"}
        </button>
        {prefs.detailed && (
          <button
            onClick={() => setLoggerPref("rpeAsRir", !prefs.rpeAsRir)}
            style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), background: "none", border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 14px", cursor: "pointer" }}
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
        style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 800, background: C("ink2"), color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 16px", outline: "none", boxSizing: "border-box", width: "100%", marginBottom: 14 }}
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
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, marginBottom: 10, color: C("red") }}>
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={save}
          disabled={saving || blocks.length === 0}
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 800,
            fontSize: 15,
            background: C("lime"),
            color: C("ink"),
            border: "none",
            borderRadius: 999,
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
          style={{ ...pill("lime"), padding: "13px 22px", opacity: blocks.length === 0 ? 0.5 : 1, cursor: blocks.length === 0 ? "default" : "pointer" }}
          title="Save this workout as a reusable routine"
        >
          ★ Save as routine
        </button>
        {routineMsg && <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: routineMsg.startsWith("★") ? C("lime") : C("ash") }}>{routineMsg}</span>}
      </div>
    </div>
  );
}
