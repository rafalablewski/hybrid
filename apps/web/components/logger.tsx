"use client";

import { useMemo, useState } from "react";
import {
  prescribeSession,
  toTrainingLog,
  velocityProfiles,
  type LoggedSession,
  type SessionBlock,
  type StrengthSet,
} from "@hybrid/core";
import {
  INK2,
  LINE,
  LIME,
  CHALK,
  ASH,
  BLUE,
  VIOLET,
  RED,
  disp,
  cond,
  mono,
  Mono,
  Card,
} from "@/lib/ui";

const CATALOG = [
  "Back Squat",
  "Front Squat",
  "Deadlift",
  "Bench Press",
  "Overhead Press",
  "Barbell Row",
  "Romanian Deadlift",
  "Pull-up",
  "Power Clean",
];

type EditableBlock = SessionBlock & { uid: string };
const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

const inputStyle = {
  ...mono,
  fontSize: 14,
  background: INK2,
  color: CHALK,
  border: `1px solid ${LINE}`,
  borderRadius: 8,
  padding: "8px 10px",
  outline: "none",
  minWidth: 0,
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
      rx.blocks.map((b) =>
        b.kind === "strength"
          ? { uid: uid(), kind: "strength", name: b.name, sets: b.sets }
          : {
              uid: uid(),
              kind: "conditioning",
              name: b.name,
              format: b.format,
              work: b.work,
              rest: b.rest,
              rounds: b.rounds,
            },
      ),
    );
    setTitle("AI Prescribed");
  };

  const addStrength = () =>
    setBlocks((bs) => [
      ...bs,
      { uid: uid(), kind: "strength", name: "Back Squat", sets: [{ load: "", reps: "", rpe: "" }] },
    ]);
  const addConditioning = () =>
    setBlocks((bs) => [
      ...bs,
      { uid: uid(), kind: "conditioning", name: "Row Intervals", minutes: 12, rpe: 8 },
    ]);
  const removeBlock = (u: string) => setBlocks((bs) => bs.filter((b) => b.uid !== u));

  const patch = (u: string, fn: (b: EditableBlock) => EditableBlock) =>
    setBlocks((bs) => bs.map((b) => (b.uid === u ? fn(b) : b)));

  const rename = (u: string, name: string) =>
    setBlocks((bs) => bs.map((b) => (b.uid === u ? ({ ...b, name } as EditableBlock) : b)));

  const setCond = (u: string, key: "minutes" | "rpe", val: number) =>
    setBlocks((bs) =>
      bs.map((b) =>
        b.uid === u && b.kind === "conditioning" ? ({ ...b, [key]: val } as EditableBlock) : b,
      ),
    );

  const updateSet = (u: string, i: number, key: keyof StrengthSet, val: string) =>
    patch(u, (b) =>
      b.kind === "strength"
        ? { ...b, sets: b.sets.map((s, j) => (j === i ? ({ ...s, [key]: val } as StrengthSet) : s)) }
        : b,
    );
  const addSet = (u: string) =>
    patch(u, (b) =>
      b.kind === "strength" ? { ...b, sets: [...b.sets, { load: "", reps: "", rpe: "" }] } : b,
    );
  const removeSet = (u: string, i: number) =>
    patch(u, (b) =>
      b.kind === "strength" ? { ...b, sets: b.sets.filter((_, j) => j !== i) } : b,
    );

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
          <button onClick={loadPrescribed} style={btn(VIOLET)}>
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
        style={{ ...inputStyle, ...disp, fontSize: 20, fontWeight: 800, width: "100%", marginBottom: 14 }}
      />

      {blocks.length === 0 && (
        <Card style={{ textAlign: "center", padding: 36, marginBottom: 14 }}>
          <Mono s={{ fontSize: 13 }}>
            Empty session — add blocks below, or pull today&apos;s prescription.
          </Mono>
        </Card>
      )}

      {blocks.map((b) => (
        <Card key={b.uid} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <Mono s={{ fontSize: 10, textTransform: "uppercase" }} c={b.kind === "strength" ? LIME : BLUE}>
              {b.kind}
            </Mono>
            <input
              list="lift-catalog"
              value={b.name}
              onChange={(e) => rename(b.uid, e.target.value)}
              style={{ ...inputStyle, ...disp, fontWeight: 700, flex: 1 }}
            />
            <button onClick={() => removeBlock(b.uid)} style={btn(RED)}>
              ✕
            </button>
          </div>

          {b.kind === "strength" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 28px", gap: 6, marginBottom: 4 }}>
                {["load (kg)", "reps", "rpe", "m/s", ""].map((h) => (
                  <Mono key={h} s={{ fontSize: 10, textTransform: "uppercase" }}>
                    {h}
                  </Mono>
                ))}
              </div>
              {b.sets.map((s, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 28px", gap: 6, marginBottom: 6 }}
                >
                  <input value={s.load} onChange={(e) => updateSet(b.uid, i, "load", e.target.value)} placeholder="100" style={inputStyle} />
                  <input value={s.reps} onChange={(e) => updateSet(b.uid, i, "reps", e.target.value)} placeholder="5" style={inputStyle} />
                  <input value={s.rpe ?? ""} onChange={(e) => updateSet(b.uid, i, "rpe", e.target.value)} placeholder="8" style={inputStyle} />
                  <input value={s.vel ?? ""} onChange={(e) => updateSet(b.uid, i, "vel", e.target.value)} placeholder="0.50" style={inputStyle} />
                  <button onClick={() => removeSet(b.uid, i)} style={{ ...btn(ASH), padding: "0" }}>
                    −
                  </button>
                </div>
              ))}
              <button onClick={() => addSet(b.uid)} style={{ ...btn(ASH), marginTop: 2 }}>
                + set
              </button>
            </>
          ) : (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <Mono s={{ fontSize: 11 }}>minutes</Mono>
              <input
                value={String(b.minutes ?? "")}
                onChange={(e) => setCond(b.uid, "minutes", Number(e.target.value) || 0)}
                style={{ ...inputStyle, width: 70 }}
              />
              <Mono s={{ fontSize: 11 }}>rpe</Mono>
              <input
                value={String(b.rpe ?? "")}
                onChange={(e) => setCond(b.uid, "rpe", Number(e.target.value) || 0)}
                style={{ ...inputStyle, width: 70 }}
              />
            </div>
          )}
        </Card>
      ))}

      <datalist id="lift-catalog">
        {CATALOG.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div style={{ display: "flex", gap: 8, marginTop: 4, marginBottom: 18 }}>
        <button onClick={addStrength} style={btn(LIME)}>
          + Strength
        </button>
        <button onClick={addConditioning} style={btn(BLUE)}>
          + Conditioning
        </button>
      </div>

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

function btn(color: string) {
  return {
    ...cond,
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase" as const,
    letterSpacing: ".04em",
    color,
    background: `${color}1f`,
    border: `1px solid ${color}55`,
    borderRadius: 8,
    padding: "6px 12px",
    cursor: "pointer",
  };
}
