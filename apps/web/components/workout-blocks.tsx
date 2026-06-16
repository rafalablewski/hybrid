"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { SessionBlock, StrengthSet } from "@hybrid/core";
import { RPE_SCALE, RPE_INTRO, pacePerKm, supersetLabels, toggleSuperset as toggleSupersetGroup, isSupersettedWithPrev, setType, cycleSetType, setTypeBadge } from "@hybrid/core";
import { INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, disp, cond, mono, txt, Mono, Card } from "@/lib/ui";
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

const SET_TYPE_TITLE: Record<string, string> = {
  working: "Working set",
  warmup: "Warm-up set",
  cooldown: "Cool-down set",
  drop: "Drop set",
};

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
    color: txt(color),
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
    color: txt(color),
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
  const [rpeHelp, setRpeHelp] = useState(false);
  // Raw text buffer for the conditioning number fields so a mid-typed decimal
  // ("8." or "8.5") survives — the block stores a number, but binding the input
  // straight to String(number) would strip the trailing dot as you type.
  const [condDrafts, setCondDrafts] = useState<Record<string, string>>({});
  const condVal = (u: string, key: string, n: number | undefined) =>
    condDrafts[`${u}:${key}`] ?? (n == null ? "" : String(n));

  const patch = (u: string, fn: (b: EditableBlock) => EditableBlock) =>
    setBlocks((bs) => bs.map((b) => (b.uid === u ? fn(b) : b)));

  const addStrength = () =>
    setBlocks((bs) => [
      ...bs,
      { uid: uid(), kind: "strength", name: "Back Squat", sets: [{ load: "", reps: "", rpe: "" }] },
    ]);
  const addCardio = () =>
    setBlocks((bs) => [...bs, { uid: uid(), kind: "cardio", name: "Run" }]);
  const addConditioning = () =>
    setBlocks((bs) => [...bs, { uid: uid(), kind: "conditioning", name: "Row Intervals", format: "" }]);
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
  // A drop set is a lighter continuation of the previous set (no rest) — add it
  // pre-flagged so it reads as part of the same effort.
  const addDropSet = (u: string) =>
    patch(u, (b) =>
      b.kind === "strength" ? { ...b, sets: [...b.sets, { load: "", reps: "", rpe: "", drop: true }] } : b,
    );
  // A warm-up ramp set — excluded from working volume/PRs, kept for the velocity
  // profile. Add it pre-flagged; warm-ups are usually the first sets entered.
  const addWarmupSet = (u: string) =>
    patch(u, (b) =>
      b.kind === "strength" ? { ...b, sets: [...b.sets, { load: "", reps: "", rpe: "", role: "warmup" }] } : b,
    );
  const removeSet = (u: string, i: number) =>
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: b.sets.filter((_, j) => j !== i) } : b));
  // Tap the set badge to cycle its type: working → warm-up → cool-down → drop.
  const cycleType = (u: string, i: number) =>
    patch(u, (b) =>
      b.kind === "strength"
        ? { ...b, sets: b.sets.map((s, j) => (j === i ? cycleSetType(s) : s)) }
        : b,
    );
  // Superset: group this block with the one directly above it (A1/A2/A3…).
  const supersetWithPrev = (u: string) =>
    setBlocks((bs) => toggleSupersetGroup(bs, bs.findIndex((b) => b.uid === u), uid) as EditableBlock[]);

  const setCondStr = (u: string, key: "format", val: string) =>
    patch(u, (b) => (b.kind === "conditioning" ? ({ ...b, [key]: val } as EditableBlock) : b));
  const setCondNum = (
    u: string,
    key: "work" | "rest" | "rounds" | "minutes" | "rpe" | "distance",
    val: string,
  ) => {
    setCondDrafts((d) => ({ ...d, [`${u}:${key}`]: val }));
    patch(u, (b) =>
      b.kind === "cardio" || b.kind === "conditioning" ? ({ ...b, [key]: condNum(val) } as EditableBlock) : b,
    );
  };

  const ssLabels = supersetLabels(blocks);

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
            <Mono s={{ fontSize: 10, textTransform: "uppercase" }} c={b.kind === "strength" ? LIME : b.kind === "cardio" ? BLUE : VIOLET}>
              {b.kind}
            </Mono>
            {ssLabels[idx] && (
              <span style={{ ...mono, fontSize: 11, fontWeight: 700, color: txt(LIME), background: `${LIME}1f`, border: `1px solid ${LIME}55`, borderRadius: 6, padding: "1px 6px" }}>
                ⛓ {ssLabels[idx]}
              </span>
            )}
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
            {b.kind === "strength" && idx > 0 && blocks[idx - 1]?.kind === "strength" && (
              <button
                onClick={() => supersetWithPrev(b.uid)}
                title="Superset with the exercise above (no rest between)"
                style={
                  isSupersettedWithPrev(blocks, idx)
                    ? { ...blockBtn(LIME), padding: "6px 10px" }
                    : { ...blockBtn(ASH), padding: "6px 10px" }
                }
              >
                ⛓ {isSupersettedWithPrev(blocks, idx) ? "joined" : "superset ↑"}
              </button>
            )}
            <button onClick={() => removeBlock(b.uid)} style={iconBtn(RED)}>
              ✕
            </button>
          </div>

          {b.kind === "strength" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr 1fr 1fr 28px", gap: 6, marginBottom: 4, alignItems: "center" }}>
                <span />
                <Mono s={{ fontSize: 10, textTransform: "uppercase" }}>load (kg)</Mono>
                <Mono s={{ fontSize: 10, textTransform: "uppercase" }}>reps</Mono>
                <button
                  onClick={() => setRpeHelp((v) => !v)}
                  title="What is RPE?"
                  style={{ ...mono, fontSize: 10, textTransform: "uppercase", color: txt(rpeHelp ? LIME : ASH), background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                >
                  rpe ⓘ
                </button>
                <Mono s={{ fontSize: 10, textTransform: "uppercase" }}>m/s</Mono>
                <span />
              </div>
              {b.sets.map((s, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: "26px 1fr 1fr 1fr 1fr 28px", gap: 6, marginBottom: 6 }}
                >
                  {(() => {
                    const st = setType(s);
                    const accent = st === "warmup" ? AMBER : st === "cooldown" ? BLUE : st === "drop" ? LIME : null;
                    return (
                      <button
                        onClick={() => cycleType(b.uid, i)}
                        title={`${SET_TYPE_TITLE[st]} — tap to change (working → warm-up → cool-down → drop)`}
                        style={{
                          ...mono,
                          fontSize: accent ? 12 : 13,
                          fontWeight: 700,
                          color: txt(accent ?? ASH),
                          background: accent ? `${accent}1f` : "transparent",
                          border: `1px solid ${accent ?? LINE}`,
                          borderRadius: 8,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {setTypeBadge(s, i)}
                      </button>
                    );
                  })()}
                  <input value={s.load} onChange={(e) => updateSet(b.uid, i, "load", e.target.value)} placeholder="100" style={input} />
                  <input value={s.reps} onChange={(e) => updateSet(b.uid, i, "reps", e.target.value)} placeholder="5" style={input} />
                  <input value={s.rpe ?? ""} onChange={(e) => updateSet(b.uid, i, "rpe", e.target.value)} placeholder="8" style={input} />
                  <input value={s.vel ?? ""} onChange={(e) => updateSet(b.uid, i, "vel", e.target.value)} placeholder="0.50" style={input} />
                  <button onClick={() => removeSet(b.uid, i)} style={{ ...iconBtn(ASH), padding: 0 }}>
                    −
                  </button>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <button onClick={() => addSet(b.uid)} style={blockBtn(ASH)}>
                  + set
                </button>
                <button onClick={() => addWarmupSet(b.uid)} style={blockBtn(AMBER)} title="Add a warm-up set — excluded from working volume & PRs, kept for the velocity profile">
                  + warm-up
                </button>
                <button onClick={() => addDropSet(b.uid)} style={blockBtn(LIME)} title="Add a drop set — a lighter continuation, no rest">
                  + drop set
                </button>
              </div>
            </>
          ) : b.kind === "cardio" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {["dist (km)", "minutes"].map((h) => (
                  <Mono key={h} s={{ fontSize: 10, textTransform: "uppercase" }}>
                    {h}
                  </Mono>
                ))}
                <input value={condVal(b.uid, "distance", b.distance)} onChange={(e) => setCondNum(b.uid, "distance", e.target.value)} placeholder="8" style={input} />
                <input value={condVal(b.uid, "minutes", b.minutes)} onChange={(e) => setCondNum(b.uid, "minutes", e.target.value)} placeholder="50" style={input} />
              </div>
              {pacePerKm(b) && (
                <Mono s={{ fontSize: 12, display: "block", marginTop: 8 }} c={BLUE}>
                  pace {pacePerKm(b)}
                </Mono>
              )}
            </>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 6 }}>
              {["format", "work (s)", "rest (s)", "rounds", "minutes"].map((h) => (
                <Mono key={h} s={{ fontSize: 10, textTransform: "uppercase" }}>
                  {h}
                </Mono>
              ))}
              <input value={b.format ?? ""} onChange={(e) => setCondStr(b.uid, "format", e.target.value)} placeholder="AMRAP" style={input} />
              <input value={condVal(b.uid, "work", b.work)} onChange={(e) => setCondNum(b.uid, "work", e.target.value)} placeholder="40" style={input} />
              <input value={condVal(b.uid, "rest", b.rest)} onChange={(e) => setCondNum(b.uid, "rest", e.target.value)} placeholder="20" style={input} />
              <input value={condVal(b.uid, "rounds", b.rounds)} onChange={(e) => setCondNum(b.uid, "rounds", e.target.value)} placeholder="8" style={input} />
              <input value={condVal(b.uid, "minutes", b.minutes)} onChange={(e) => setCondNum(b.uid, "minutes", e.target.value)} placeholder="12" style={input} />
            </div>
          )}
        </Card>
      ))}

      <datalist id="workout-catalog">
        {catalog.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {rpeHelp && <RpeHelp onClose={() => setRpeHelp(false)} />}

      <div style={{ display: "flex", gap: 8, marginTop: 4, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={addStrength} style={blockBtn(LIME)}>
          + Strength
        </button>
        <button onClick={addCardio} style={blockBtn(BLUE)}>
          + Cardio
        </button>
        <button onClick={addConditioning} style={blockBtn(VIOLET)}>
          + Conditioning
        </button>
        <button onClick={() => setRpeHelp((v) => !v)} style={blockBtn(ASH)}>
          What's RPE?
        </button>
      </div>
    </>
  );
}

// The RPE cheatsheet — the same scale (from @hybrid/core) the mobile logger shows.
function RpeHelp({ onClose }: { onClose: () => void }) {
  return (
    <Card style={{ borderLeft: `3px solid ${LIME}`, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          RPE — how hard did that feel?
        </Mono>
        <button onClick={onClose} style={{ ...iconBtn(ASH), width: 26, height: 26 }}>✕</button>
      </div>
      <Mono s={{ fontSize: 13, lineHeight: 1.5, display: "block", marginBottom: 12 }}>{RPE_INTRO}</Mono>
      <div style={{ display: "grid", gridTemplateColumns: "44px 64px 1fr", gap: "4px 10px", alignItems: "baseline" }}>
        <Mono s={{ fontSize: 10, textTransform: "uppercase" }} c={ASH}>RPE</Mono>
        <Mono s={{ fontSize: 10, textTransform: "uppercase" }} c={ASH}>reps left</Mono>
        <Mono s={{ fontSize: 10, textTransform: "uppercase" }} c={ASH}>feels like</Mono>
        {RPE_SCALE.map((step) => (
          <div key={step.rpe} style={{ display: "contents" }}>
            <Mono s={{ fontSize: 13, fontWeight: 700 }} c={LIME}>{step.rpe}</Mono>
            <Mono s={{ fontSize: 13 }} c={CHALK}>{step.rir}</Mono>
            <Mono s={{ fontSize: 13 }} c={CHALK}>{step.meaning}</Mono>
          </div>
        ))}
      </div>
    </Card>
  );
}
