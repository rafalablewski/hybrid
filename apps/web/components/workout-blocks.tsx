"use client";

import type { Dispatch, SetStateAction } from "react";
import type { SessionBlock, StrengthSet } from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, RED, disp, cond, mono, Mono, Card } from "@/lib/ui";
import { useExercises } from "@/lib/use-exercises";

// The block-by-block workout editor shared by Log Session (logger.tsx) and the
// template Builder (builder.tsx). Both screens edit the SAME SessionBlock[]
// shape — keeping one editor here is the single source of truth so the two can't
// drift (catalog, set grid, conditioning fields, overflow fixes, …).

// Lifts the editors have always offered for autocomplete. Some aren't in core's
// MOVEMENTS map (e.g. Deadlift, Pull-up) so we keep them here and merge the
// admin-managed library (useExercises) on top.
const BASE_CATALOG = [
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

export type EditableBlock = SessionBlock & { uid: string };
export const uid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random());

const input = {
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

export function blockBtn(color: string) {
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
function iconBtn(color: string) {
  return {
    ...cond,
    fontSize: 13,
    fontWeight: 700,
    color,
    background: "transparent",
    border: `1px solid ${color}55`,
    borderRadius: 8,
    width: 30,
    height: 30,
    cursor: "pointer",
  };
}

const condNum = (s: string) => (s === "" ? undefined : Number(s) || 0);

export default function WorkoutBlocks({
  blocks,
  setBlocks,
  emptyHint,
  reorder = false,
}: {
  blocks: EditableBlock[];
  setBlocks: Dispatch<SetStateAction<EditableBlock[]>>;
  /** Text shown in the empty-state card. */
  emptyHint: string;
  /** Show per-block move/duplicate controls (the Builder wants them). */
  reorder?: boolean;
}) {
  const { catalog: libraryCatalog = [] } = useExercises();
  const catalog = [...new Set([...BASE_CATALOG, ...libraryCatalog])].sort((a, b) => a.localeCompare(b));

  const patch = (u: string, fn: (b: EditableBlock) => EditableBlock) =>
    setBlocks((bs) => bs.map((b) => (b.uid === u ? fn(b) : b)));

  const addStrength = () =>
    setBlocks((bs) => [
      ...bs,
      { uid: uid(), kind: "strength", name: "Back Squat", sets: [{ load: "", reps: "", rpe: "" }] },
    ]);
  const addConditioning = () =>
    setBlocks((bs) => [
      ...bs,
      { uid: uid(), kind: "conditioning", name: "Row Intervals", format: "", minutes: 12, rpe: 8 },
    ]);
  const removeBlock = (u: string) => setBlocks((bs) => bs.filter((b) => b.uid !== u));
  const rename = (u: string, name: string) => patch(u, (b) => ({ ...b, name }) as EditableBlock);

  const move = (u: string, dir: -1 | 1) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.uid === u);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= bs.length) return bs;
      const next = [...bs];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  const duplicate = (u: string) =>
    setBlocks((bs) => {
      const i = bs.findIndex((b) => b.uid === u);
      if (i < 0) return bs;
      const copy = { ...structuredClone(bs[i]!), uid: uid() } as EditableBlock;
      return [...bs.slice(0, i + 1), copy, ...bs.slice(i + 1)];
    });

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
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: b.sets.filter((_, j) => j !== i) } : b));

  const setCondStr = (u: string, key: "format", val: string) =>
    patch(u, (b) => (b.kind === "conditioning" ? ({ ...b, [key]: val } as EditableBlock) : b));
  const setCondNum = (u: string, key: "work" | "rest" | "rounds" | "minutes" | "rpe", val: string) =>
    patch(u, (b) =>
      b.kind === "conditioning" ? ({ ...b, [key]: condNum(val) } as EditableBlock) : b,
    );

  return (
    <>
      {blocks.length === 0 && (
        <Card style={{ textAlign: "center", padding: 32, marginBottom: 12 }}>
          <Mono s={{ fontSize: 13 }}>{emptyHint}</Mono>
        </Card>
      )}

      {blocks.map((b, idx) => (
        <Card key={b.uid} style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10 }}>
            <Mono s={{ fontSize: 10, textTransform: "uppercase" }} c={b.kind === "strength" ? LIME : BLUE}>
              {b.kind}
            </Mono>
            <input
              list="workout-catalog"
              value={b.name}
              onChange={(e) => rename(b.uid, e.target.value)}
              style={{ ...input, ...disp, fontWeight: 700, flex: 1 }}
            />
            {reorder && (
              <>
                <button onClick={() => move(b.uid, -1)} disabled={idx === 0} style={iconBtn(ASH)}>
                  ↑
                </button>
                <button onClick={() => move(b.uid, 1)} disabled={idx === blocks.length - 1} style={iconBtn(ASH)}>
                  ↓
                </button>
                <button onClick={() => duplicate(b.uid)} style={iconBtn(BLUE)}>
                  ⧉
                </button>
              </>
            )}
            <button onClick={() => removeBlock(b.uid)} style={iconBtn(RED)}>
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
                  <input value={s.load} onChange={(e) => updateSet(b.uid, i, "load", e.target.value)} placeholder="100" style={input} />
                  <input value={s.reps} onChange={(e) => updateSet(b.uid, i, "reps", e.target.value)} placeholder="5" style={input} />
                  <input value={s.rpe ?? ""} onChange={(e) => updateSet(b.uid, i, "rpe", e.target.value)} placeholder="8" style={input} />
                  <input value={s.vel ?? ""} onChange={(e) => updateSet(b.uid, i, "vel", e.target.value)} placeholder="0.50" style={input} />
                  <button onClick={() => removeSet(b.uid, i)} style={{ ...iconBtn(ASH), padding: 0 }}>
                    −
                  </button>
                </div>
              ))}
              <button onClick={() => addSet(b.uid)} style={blockBtn(ASH)}>
                + set
              </button>
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr 1fr", gap: 6 }}>
              {["format", "work (s)", "rest (s)", "rounds", "minutes", "rpe"].map((h) => (
                <Mono key={h} s={{ fontSize: 10, textTransform: "uppercase" }}>
                  {h}
                </Mono>
              ))}
              <input value={b.format ?? ""} onChange={(e) => setCondStr(b.uid, "format", e.target.value)} placeholder="intervals" style={input} />
              <input value={String(b.work ?? "")} onChange={(e) => setCondNum(b.uid, "work", e.target.value)} placeholder="40" style={input} />
              <input value={String(b.rest ?? "")} onChange={(e) => setCondNum(b.uid, "rest", e.target.value)} placeholder="20" style={input} />
              <input value={String(b.rounds ?? "")} onChange={(e) => setCondNum(b.uid, "rounds", e.target.value)} placeholder="8" style={input} />
              <input value={String(b.minutes ?? "")} onChange={(e) => setCondNum(b.uid, "minutes", e.target.value)} placeholder="12" style={input} />
              <input value={String(b.rpe ?? "")} onChange={(e) => setCondNum(b.uid, "rpe", e.target.value)} placeholder="8" style={input} />
            </div>
          )}
        </Card>
      ))}

      <datalist id="workout-catalog">
        {catalog.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <div style={{ display: "flex", gap: 8, marginTop: 4, marginBottom: 14 }}>
        <button onClick={addStrength} style={blockBtn(LIME)}>
          + Strength
        </button>
        <button onClick={addConditioning} style={blockBtn(BLUE)}>
          + Conditioning
        </button>
      </div>
    </>
  );
}
