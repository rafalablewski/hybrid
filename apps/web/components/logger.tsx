"use client";

import { useMemo, useState } from "react";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  type LoggedSession,
} from "@hybrid/core";
import { INK2, LINE, CHALK, LIME, VIOLET, RED, disp, mono, Mono, Card } from "@/lib/ui";
import WorkoutBlocks, { blockBtn, uid, type EditableBlock } from "@/components/workout-blocks";

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
            ...(b.rpe != null ? { rpe: b.rpe } : {}),
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
          ...(b.rpe != null ? { rpe: b.rpe } : {}),
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
      />

      {error && (
        <Mono s={{ fontSize: 12, display: "block", marginBottom: 10 }} c={RED}>
          {error}
        </Mono>
      )}

      <button
        onClick={save}
        disabled={saving || blocks.length === 0}
        style={{
          ...disp,
          fontWeight: 800,
          fontSize: 15,
          background: LIME,
          color: "#0c0d0c",
          border: "none",
          borderRadius: 12,
          padding: "14px 28px",
          cursor: saving || blocks.length === 0 ? "default" : "pointer",
          opacity: saving || blocks.length === 0 ? 0.5 : 1,
        }}
      >
        {saving ? "Saving…" : "Save session →"}
      </button>
    </div>
  );
}
