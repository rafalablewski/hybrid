"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { SessionBlock, StrengthSet, WeightUnit } from "@hybrid/core";
import { RPE_SCALE, RPE_INTRO, pacePerKm, supersetLabels, toggleSuperset as toggleSupersetGroup, isSupersettedWithPrev, setType, cycleSetType, setTypeBadge, rpeRirSwap, displayLoad, storeLoad, platesPerSide, warmupRamp, moveItem, moveItemTo } from "@hybrid/core";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, disp, cond, mono, txt, Mono, Card } from "@/lib/ui";
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
  fontSize: fs.bodyLg,
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
    fontSize: fs.caption,
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
    fontSize: fs.body,
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
  detailed = true,
  rirMode = false,
  units = "kg",
  plateCalc = false,
}: {
  blocks: EditableBlock[];
  setBlocks: Dispatch<SetStateAction<EditableBlock[]>>;
  /** Text shown in the empty-state card. */
  emptyHint: string;
  /** Show per-block move/duplicate controls (the Builder wants them). */
  reorder?: boolean;
  /** Detailed shows the RPE + velocity columns; Simple hides them (load × reps). */
  detailed?: boolean;
  /** Show the effort column as RIR (reps-in-reserve) instead of RPE. */
  rirMode?: boolean;
  /** Weight unit for the load column (display + input). Storage stays kg. */
  units?: WeightUnit;
  /** Show a barbell plates-per-side hint under each strength block. */
  plateCalc?: boolean;
}) {
  const { catalog: libraryCatalog = [] } = useExercises();
  const catalog = [...new Set([...BASE_CATALOG, ...libraryCatalog])].sort((a, b) => a.localeCompare(b));
  const [rpeHelp, setRpeHelp] = useState(false);
  // The block currently being dragged by its grip handle (for drop reordering).
  const [dragUid, setDragUid] = useState<string | null>(null);
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
    setBlocks((bs) => moveItem(bs, bs.findIndex((b) => b.uid === u), dir));
  // Drag-and-drop reorder: drop the block being dragged onto another's card.
  const moveTo = (fromU: string, toU: string) =>
    setBlocks((bs) => moveItemTo(bs, bs.findIndex((b) => b.uid === fromU), bs.findIndex((b) => b.uid === toU)));
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
  // Prepend an auto warm-up ramp up to the block's heaviest working load.
  const addWarmupRamp = (u: string) =>
    patch(u, (b) => {
      if (b.kind !== "strength") return b;
      const workingMax = Math.max(0, ...b.sets.filter((s) => s.role !== "warmup" && s.role !== "cooldown").map((s) => parseFloat(s.load)).filter((n) => Number.isFinite(n)));
      const ramp = warmupRamp(workingMax);
      if (!ramp.length) return b;
      const rampSets: StrengthSet[] = ramp.map((step) => ({ load: String(step.load), reps: String(step.reps), rpe: "", role: "warmup" }));
      return { ...b, sets: [...rampSets, ...b.sets] };
    });
  // A cool-down set — light back-off work, excluded from working volume/PRs like
  // a warm-up. Add it pre-flagged; cool-downs come last, so it appends.
  const addCooldownSet = (u: string) =>
    patch(u, (b) =>
      b.kind === "strength" ? { ...b, sets: [...b.sets, { load: "", reps: "", rpe: "", role: "cooldown" }] } : b,
    );
  const removeSet = (u: string, i: number) =>
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: b.sets.filter((_, j) => j !== i) } : b));
  // Reorder a set within its block (the ↑/↓ controls on each row).
  const moveSet = (u: string, i: number, dir: -1 | 1) =>
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: moveItem(b.sets, i, dir) } : b));
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
          <Mono s={{ fontSize: fs.body }}>{emptyHint}</Mono>
        </Card>
      )}

      {blocks.map((b, idx) => (
        <div
          key={b.uid}
          // The whole card is a drop target so dragging the grip handle onto it
          // drops the dragged block here (slides the rest along).
          onDragOver={reorder && dragUid && dragUid !== b.uid ? (e) => e.preventDefault() : undefined}
          onDrop={
            reorder && dragUid && dragUid !== b.uid
              ? (e) => {
                  e.preventDefault();
                  moveTo(dragUid, b.uid);
                  setDragUid(null);
                }
              : undefined
          }
          style={{ opacity: dragUid === b.uid ? 0.5 : 1 }}
        >
        <Card style={{ marginBottom: 12 }}>
          <div style={{ display: "flex", gap: space.sm, alignItems: "center", marginBottom: 10 }}>
            {reorder && (
              <span
                // Grip handle — press and drag the card to reorder (or use ↑/↓).
                draggable
                onDragStart={() => setDragUid(b.uid)}
                onDragEnd={() => setDragUid(null)}
                title="Drag to reorder"
                style={{ ...mono, fontSize: fs.note, color: txt(ASH), cursor: "grab", userSelect: "none", lineHeight: 1, padding: "0 2px" }}
              >
                ⠿
              </span>
            )}
            <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }} c={b.kind === "strength" ? LIME : b.kind === "cardio" ? BLUE : VIOLET}>
              {b.kind}
            </Mono>
            {ssLabels[idx] && (
              <span style={{ ...mono, fontSize: fs.micro, fontWeight: 700, color: txt(LIME), background: `${LIME}1f`, border: `1px solid ${LIME}55`, borderRadius: 6, padding: "1px 6px" }}>
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
              <div style={{ overflowX: "auto", maxWidth: "100%" }}>
              <div style={{ minWidth: detailed ? 360 : 240 }}>
              <div style={{ display: "grid", gridTemplateColumns: detailed ? "26px 1fr 1fr 1fr 1fr 22px 28px" : "26px 1fr 1fr 22px 28px", gap: space.xs, marginBottom: 4, alignItems: "center" }}>
                <span />
                <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>load ({units})</Mono>
                <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>reps</Mono>
                {detailed && (
                  <>
                    <button
                      onClick={() => setRpeHelp((v) => !v)}
                      title="What is RPE?"
                      style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(rpeHelp ? LIME : ASH), background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                    >
                      {rirMode ? "rir" : "rpe"} ⓘ
                    </button>
                    <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>m/s</Mono>
                  </>
                )}
                <span />
                <span />
              </div>
              {b.sets.map((s, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: detailed ? "26px 1fr 1fr 1fr 1fr 22px 28px" : "26px 1fr 1fr 22px 28px", gap: space.xs, marginBottom: 6, alignItems: "center" }}
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
                  <input value={displayLoad(s.load, units)} onChange={(e) => updateSet(b.uid, i, "load", storeLoad(e.target.value, units))} placeholder={units === "lb" ? "225" : "100"} style={input} />
                  <input value={s.reps} onChange={(e) => updateSet(b.uid, i, "reps", e.target.value)} placeholder="5" style={input} />
                  {detailed && (
                    <>
                      <input value={rpeRirSwap(s.rpe ?? "", rirMode)} onChange={(e) => updateSet(b.uid, i, "rpe", rpeRirSwap(e.target.value, rirMode))} placeholder={rirMode ? "2" : "8"} style={input} />
                      <input value={s.vel ?? ""} onChange={(e) => updateSet(b.uid, i, "vel", e.target.value)} placeholder="0.50" style={input} />
                    </>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <button
                      onClick={() => moveSet(b.uid, i, -1)}
                      disabled={i === 0}
                      title="Move set up"
                      style={{ ...mono, fontSize: fs.nano, lineHeight: 1, color: txt(i === 0 ? LINE : ASH), background: "transparent", border: `1px solid ${LINE}`, borderRadius: 5, cursor: i === 0 ? "default" : "pointer", padding: "2px 0" }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveSet(b.uid, i, 1)}
                      disabled={i === b.sets.length - 1}
                      title="Move set down"
                      style={{ ...mono, fontSize: fs.nano, lineHeight: 1, color: txt(i === b.sets.length - 1 ? LINE : ASH), background: "transparent", border: `1px solid ${LINE}`, borderRadius: 5, cursor: i === b.sets.length - 1 ? "default" : "pointer", padding: "2px 0" }}
                    >
                      ↓
                    </button>
                  </div>
                  <button onClick={() => removeSet(b.uid, i)} style={{ ...iconBtn(ASH), padding: 0 }}>
                    −
                  </button>
                </div>
              ))}
              </div>
              </div>
              <div style={{ display: "flex", gap: space.xs, flexWrap: "wrap" }}>
                <button onClick={() => addSet(b.uid)} style={blockBtn(ASH)}>
                  + set
                </button>
                <button onClick={() => addWarmupSet(b.uid)} style={blockBtn(AMBER)} title="Add a warm-up set — excluded from working volume & PRs, kept for the velocity profile">
                  + warm-up
                </button>
                <button onClick={() => addWarmupRamp(b.uid)} style={blockBtn(AMBER)} title="Auto warm-up ramp (~40/60/80%) up to your working load">
                  + ramp
                </button>
                <button onClick={() => addCooldownSet(b.uid)} style={blockBtn(BLUE)} title="Add a cool-down set — light back-off work, excluded from working volume & PRs">
                  + cool-down
                </button>
                <button onClick={() => addDropSet(b.uid)} style={blockBtn(LIME)} title="Add a drop set — a lighter continuation, no rest">
                  + drop set
                </button>
              </div>
              {plateCalc && (() => {
                const top = [...b.sets].map((s) => parseFloat(s.load)).filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => y - x)[0];
                if (!top) return null;
                const pl = platesPerSide(top, units);
                return (
                  <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>
                    {pl.perSide.length ? `Per side @ ${displayLoad(String(top), units)} ${units}: ${pl.perSide.join(" · ")}${pl.remainder ? " ≈" : ""}` : `Bar only (${pl.bar} ${units})`}
                  </Mono>
                );
              })()}
            </>
          ) : b.kind === "cardio" ? (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space.xs }}>
                {["dist (km)", "minutes"].map((h) => (
                  <Mono key={h} s={{ fontSize: fs.nano, textTransform: "uppercase" }}>
                    {h}
                  </Mono>
                ))}
                <input value={condVal(b.uid, "distance", b.distance)} onChange={(e) => setCondNum(b.uid, "distance", e.target.value)} placeholder="8" style={input} />
                <input value={condVal(b.uid, "minutes", b.minutes)} onChange={(e) => setCondNum(b.uid, "minutes", e.target.value)} placeholder="50" style={input} />
              </div>
              {pacePerKm(b) && (
                <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={BLUE}>
                  pace {pacePerKm(b)}
                </Mono>
              )}
            </>
          ) : (
            <div style={{ overflowX: "auto", maxWidth: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: space.xs, minWidth: 360 }}>
              {["format", "work (s)", "rest (s)", "rounds", "minutes"].map((h) => (
                <Mono key={h} s={{ fontSize: fs.nano, textTransform: "uppercase" }}>
                  {h}
                </Mono>
              ))}
              <input value={b.format ?? ""} onChange={(e) => setCondStr(b.uid, "format", e.target.value)} placeholder="AMRAP" style={input} />
              <input value={condVal(b.uid, "work", b.work)} onChange={(e) => setCondNum(b.uid, "work", e.target.value)} placeholder="40" style={input} />
              <input value={condVal(b.uid, "rest", b.rest)} onChange={(e) => setCondNum(b.uid, "rest", e.target.value)} placeholder="20" style={input} />
              <input value={condVal(b.uid, "rounds", b.rounds)} onChange={(e) => setCondNum(b.uid, "rounds", e.target.value)} placeholder="8" style={input} />
              <input value={condVal(b.uid, "minutes", b.minutes)} onChange={(e) => setCondNum(b.uid, "minutes", e.target.value)} placeholder="12" style={input} />
            </div>
            </div>
          )}
        </Card>
        </div>
      ))}

      <datalist id="workout-catalog">
        {catalog.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {rpeHelp && <RpeHelp onClose={() => setRpeHelp(false)} />}

      <div style={{ display: "flex", gap: space.sm, marginTop: 4, marginBottom: 14, flexWrap: "wrap" }}>
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
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          RPE — how hard did that feel?
        </Mono>
        <button onClick={onClose} style={{ ...iconBtn(ASH), width: 26, height: 26 }}>✕</button>
      </div>
      <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginBottom: 12 }}>{RPE_INTRO}</Mono>
      <div style={{ display: "grid", gridTemplateColumns: "44px 64px 1fr", gap: "4px 10px", alignItems: "baseline" }}>
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }} c={ASH}>RPE</Mono>
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }} c={ASH}>reps left</Mono>
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }} c={ASH}>feels like</Mono>
        {RPE_SCALE.map((step) => (
          <div key={step.rpe} style={{ display: "contents" }}>
            <Mono s={{ fontSize: fs.body, fontWeight: 700 }} c={LIME}>{step.rpe}</Mono>
            <Mono s={{ fontSize: fs.body }} c={CHALK}>{step.rir}</Mono>
            <Mono s={{ fontSize: fs.body }} c={CHALK}>{step.meaning}</Mono>
          </div>
        ))}
      </div>
    </Card>
  );
}
