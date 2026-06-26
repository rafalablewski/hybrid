"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { SessionBlock, StrengthSet, WeightUnit } from "@hybrid/core";
import { RPE_SCALE, RPE_INTRO, cardioPace, supersetLabels, toggleSuperset as toggleSupersetGroup, isSupersettedWithPrev, setType, cycleSetType, setTypeBadge, rpeRirSwap, displayLoad, storeLoad, platesPerSide, warmupRamp, moveItem, moveItemTo, olympicSportsByCategory, timedSportOnly, sportDistanceUnit, displaySportDistance, parseSportDistance, exercisesByCategory, inferBlockKind, MOVEMENTS } from "@hybrid/core";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, disp, cond, mono, txt, Mono, Card } from "@/lib/ui";
import { useExercises } from "@/lib/use-exercises";
import { useLang } from "@/lib/i18n";

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

const SET_TYPE_TITLE_KEY: Record<string, string> = {
  working: "w.train.blocks.workingSet",
  warmup: "w.train.blocks.warmupSet",
  cooldown: "w.train.blocks.cooldownSet",
  drop: "w.train.blocks.dropSet",
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
  live = false,
  lastByLift,
  onToggleDone,
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
  /** LIVE mode (the Logger, not the Builder): adds a ✓-to-bank column per set
   *  and a "last time" reference per lift — the web twin of the mobile live
   *  logger. Banking is driven by onToggleDone so the parent runs the rest
   *  timer + haptics. */
  live?: boolean;
  /** Per-exercise "last time" summary string (e.g. "100×5 · 100×5"), keyed by
   *  exercise name. Shown above the set grid in live mode. */
  lastByLift?: Map<string, string>;
  /** Live mode: called when a set's ✓ is toggled (parent owns done + rest). */
  onToggleDone?: (blockUid: string, setIndex: number, done: boolean) => void;
}) {
  const { t } = useLang();
  const { catalog: libraryCatalog = [] } = useExercises();
  const catalog = [...new Set([...BASE_CATALOG, ...libraryCatalog])].sort((a, b) => a.localeCompare(b));
  const [rpeHelp, setRpeHelp] = useState(false);
  // Which strength block has its "Special ▾" add-set menu open (warm-up / ramp /
  // cool-down / drop). One primary "+ Add set" button keeps the common path a
  // single tap; the rarer set types tuck into this menu instead of a 5-button row.
  const [specialUid, setSpecialUid] = useState<string | null>(null);
  // The Olympic-sport quick-add picker (manual sport-session logging — no gear
  // needed). Picking a sport adds a cardio block named after it.
  const [sportPicker, setSportPicker] = useState(false);
  // The block currently being dragged by its grip handle (for drop reordering).
  const [dragUid, setDragUid] = useState<string | null>(null);
  // Raw text buffer for the conditioning number fields so a mid-typed decimal
  // ("8." or "8.5") survives — the block stores a number, but binding the input
  // straight to String(number) would strip the trailing dot as you type.
  const [condDrafts, setCondDrafts] = useState<Record<string, string>>({});
  const condVal = (u: string, key: string, n: number | undefined) =>
    condDrafts[`${u}:${key}`] ?? (n == null ? "" : String(n));
  // The distance field shows/accepts the sport's unit (metres for swimming/
  // rowing, km otherwise) while the block stores km — so pace/PR/recap math
  // stays single-unit. The raw text buffer survives a mid-typed decimal.
  const distVal = (b: EditableBlock) =>
    condDrafts[`${b.uid}:distance`] ?? (b.kind === "cardio" ? displaySportDistance(b.distance, b.name) : "");
  const setDist = (u: string, name: string, val: string) => {
    setCondDrafts((d) => ({ ...d, [`${u}:distance`]: val }));
    patch(u, (b) => (b.kind === "cardio" ? ({ ...b, distance: parseSportDistance(val, name) } as EditableBlock) : b));
  };

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
  // Manual sport session — logged as a cardio activity named after the sport, so
  // pace, PRs, history and the training log read it with no special-casing.
  const addSport = (name: string) => {
    setBlocks((bs) => [...bs, { uid: uid(), kind: "cardio", name }]);
    setSportPicker(false);
  };
  // Add a named block of the inferred kind — used by the searchable exercise
  // picker (strength gets a starter set; cardio/conditioning are name-only).
  const addNamed = (name: string, kind: SessionBlock["kind"]) => {
    const clean = name.trim();
    if (!clean) return;
    setBlocks((bs) => [
      ...bs,
      kind === "strength"
        ? { uid: uid(), kind: "strength", name: clean, sets: [{ load: "", reps: "", rpe: "" }] }
        : kind === "cardio"
          ? { uid: uid(), kind: "cardio", name: clean }
          : { uid: uid(), kind: "conditioning", name: clean, format: "" },
    ]);
    setSportPicker(false);
  };
  const removeBlock = (u: string) => setBlocks((bs) => bs.filter((b) => b.uid !== u));
  const rename = (u: string, name: string) => {
    // Drop the distance text buffer so the field reflows from the stored km in
    // the new sport's unit (the block keeps km; only the typed buffer was in the
    // old unit) — otherwise a rename across an m↔km sport shows a stale value.
    setCondDrafts((d) => {
      if (!(`${u}:distance` in d)) return d;
      const next = { ...d };
      delete next[`${u}:distance`];
      return next;
    });
    // A timed sport hides the distance field — clear any prior distance so it
    // can't be saved as a phantom distance/pace on, say, a renamed Tennis block.
    patch(u, (b) =>
      (b.kind === "cardio" && timedSportOnly(name) ? { ...b, name, distance: undefined } : { ...b, name }) as EditableBlock,
    );
  };

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
  // Set-row grid: the base columns (badge · load · reps [· rpe · m/s] · move ·
  // remove) gain a ✓-to-bank column at the end in live mode.
  const strengthCols = `${detailed ? "26px 1fr 1fr 1fr 1fr" : "26px 1fr 1fr"} 22px 28px${live ? " 40px" : ""}`;

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
                title={t("w.train.blocks.dragToReorder")}
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
                <button aria-label="Move up" onClick={() => move(b.uid, -1)} disabled={idx === 0} style={iconBtn(ASH)}>
                  ↑
                </button>
                <button aria-label="Move down" onClick={() => move(b.uid, 1)} disabled={idx === blocks.length - 1} style={iconBtn(ASH)}>
                  ↓
                </button>
                <button aria-label="Duplicate" onClick={() => duplicate(b.uid)} style={iconBtn(BLUE)}>
                  ⧉
                </button>
              </>
            )}
            {b.kind === "strength" && idx > 0 && blocks[idx - 1]?.kind === "strength" && (
              <button
                onClick={() => supersetWithPrev(b.uid)}
                title={t("w.train.blocks.supersetTitle")}
                style={
                  isSupersettedWithPrev(blocks, idx)
                    ? { ...blockBtn(LIME), padding: "6px 10px" }
                    : { ...blockBtn(ASH), padding: "6px 10px" }
                }
              >
                ⛓ {isSupersettedWithPrev(blocks, idx) ? t("w.train.blocks.joined") : t("w.train.blocks.superset")}
              </button>
            )}
            <button aria-label="Delete" onClick={() => removeBlock(b.uid)} style={iconBtn(RED)}>
              ✕
            </button>
          </div>

          {b.kind === "strength" ? (
            <>
              {/* "Last time" reference (live mode) — the most recent prior session's
                  sets for this lift, so progressive overload has a target to beat. */}
              {live && lastByLift?.get(b.name) && (
                <Mono s={{ fontSize: fs.micro, display: "block", marginBottom: 8 }} c={ASH}>
                  {t("workout.lastTime")} · {lastByLift.get(b.name)}
                </Mono>
              )}
              <div style={{ overflowX: "auto", maxWidth: "100%" }}>
              <div style={{ minWidth: detailed ? 360 : 240 }}>
              <div style={{ display: "grid", gridTemplateColumns: strengthCols, gap: space.xs, marginBottom: 4, alignItems: "center" }}>
                <span />
                <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>{t("w.train.blocks.load")} ({units})</Mono>
                <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>{t("w.train.blocks.reps")}</Mono>
                {detailed && (
                  <>
                    <button
                      onClick={() => setRpeHelp((v) => !v)}
                      title={t("w.train.blocks.whatIsRpe")}
                      style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(rpeHelp ? LIME : ASH), background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                    >
                      {rirMode ? "rir" : "rpe"} ⓘ
                    </button>
                    <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>m/s</Mono>
                  </>
                )}
                <span />
                <span />
                {live && <span />}
              </div>
              {b.sets.map((s, i) => (
                <div
                  key={i}
                  style={{ display: "grid", gridTemplateColumns: strengthCols, gap: space.xs, marginBottom: 6, alignItems: "center" }}
                >
                  {(() => {
                    const st = setType(s);
                    const accent = st === "warmup" ? AMBER : st === "cooldown" ? BLUE : st === "drop" ? LIME : null;
                    return (
                      <button
                        onClick={() => cycleType(b.uid, i)}
                        title={`${t(SET_TYPE_TITLE_KEY[st]!)} ${t("w.train.blocks.setTypeTitle")}`}
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
                      title={t("w.train.blocks.moveSetUp")}
                      style={{ ...mono, fontSize: fs.nano, lineHeight: 1, color: txt(i === 0 ? LINE : ASH), background: "transparent", border: `1px solid ${LINE}`, borderRadius: 5, cursor: i === 0 ? "default" : "pointer", padding: "2px 0" }}
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveSet(b.uid, i, 1)}
                      disabled={i === b.sets.length - 1}
                      title={t("w.train.blocks.moveSetDown")}
                      style={{ ...mono, fontSize: fs.nano, lineHeight: 1, color: txt(i === b.sets.length - 1 ? LINE : ASH), background: "transparent", border: `1px solid ${LINE}`, borderRadius: 5, cursor: i === b.sets.length - 1 ? "default" : "pointer", padding: "2px 0" }}
                    >
                      ↓
                    </button>
                  </div>
                  <button onClick={() => removeSet(b.uid, i)} style={{ ...iconBtn(ASH), padding: 0 }}>
                    −
                  </button>
                  {/* LIVE: ✓ to bank the set — starts the rest timer (parent). */}
                  {live && (() => {
                    const isDone = !!(s as StrengthSet & { done?: boolean }).done;
                    return (
                      <button
                        onClick={() => onToggleDone?.(b.uid, i, !isDone)}
                        title={t("workout.tapAsYouGo")}
                        style={{
                          ...cond,
                          width: 40,
                          height: 34,
                          borderRadius: 8,
                          fontSize: fs.subtitle,
                          fontWeight: 800,
                          cursor: "pointer",
                          color: isDone ? txt(LIME) : txt(ASH),
                          background: isDone ? LIME : INK2,
                          border: `1px solid ${isDone ? LIME : LINE}`,
                          ...(isDone ? { color: "var(--color-ink)" } : {}),
                        }}
                      >
                        ✓
                      </button>
                    );
                  })()}
                </div>
              ))}
              </div>
              </div>
              {/* Add-set control: one primary "+ Add set", with warm-up / ramp /
                  cool-down / drop tucked into a compact "Special ▾" menu (instead
                  of a cluttered row of five equal buttons). The set badge still
                  re-types a set with a tap, so the menu is just for ADDING. */}
              <div style={{ display: "flex", gap: space.xs, alignItems: "center", position: "relative" }}>
                <button
                  onClick={() => addSet(b.uid)}
                  style={{ ...disp, fontWeight: 800, fontSize: fs.caption, color: txt(LIME), background: LIME, border: "none", borderRadius: 999, padding: "9px 18px", cursor: "pointer" }}
                >
                  {t("w.train.blocks.addSet")}
                </button>
                <button
                  onClick={() => setSpecialUid((u) => (u === b.uid ? null : b.uid))}
                  title={t("w.train.blocks.specialTitle")}
                  style={{ ...mono, fontSize: fs.caption, fontWeight: 600, color: ASH, background: "transparent", border: `1px solid ${LINE}`, borderRadius: 999, padding: "8px 14px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}
                >
                  {t("w.train.blocks.special")} <span style={{ display: "inline-block", transform: specialUid === b.uid ? "rotate(180deg)" : "none", transition: "transform .15s" }}>▾</span>
                </button>
                {specialUid === b.uid && (
                  <>
                    {/* click-away catcher */}
                    <div onClick={() => setSpecialUid(null)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                    <div style={{ position: "absolute", top: 44, left: 110, zIndex: 31, minWidth: 230, background: "var(--color-card)", border: `1px solid ${LINE}`, borderRadius: 16, padding: 6, boxShadow: "0 22px 50px -20px rgba(0,0,0,.85)" }}>
                      {[
                        { run: addWarmupSet, c: AMBER, badge: "W", label: "warmupSet", desc: "warmupTitle" },
                        { run: addWarmupRamp, c: AMBER, badge: "↗", label: "rampSet", desc: "rampTitle" },
                        { run: addCooldownSet, c: BLUE, badge: "C", label: "cooldownSet", desc: "cooldownTitle" },
                        { run: addDropSet, c: LIME, badge: "↓", label: "dropSet", desc: "dropTitle" },
                      ].map((it) => (
                        <button
                          key={it.label}
                          onClick={() => { it.run(b.uid); setSpecialUid(null); }}
                          style={{ display: "flex", width: "100%", alignItems: "flex-start", gap: 10, background: "none", border: "none", cursor: "pointer", padding: "10px 11px", borderRadius: 11, textAlign: "left" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = INK2)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          <span style={{ ...mono, flex: "0 0 auto", width: 22, height: 22, borderRadius: 7, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: txt(it.c), background: `${it.c}29` }}>{it.badge}</span>
                          <span>
                            <span style={{ ...disp, display: "block", fontSize: fs.caption, fontWeight: 600, color: CHALK }}>{t(`w.train.blocks.${it.label}`)}</span>
                            <span style={{ ...mono, display: "block", fontSize: fs.nano, color: ASH, marginTop: 1 }}>{t(`w.train.blocks.${it.desc}`)}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              {plateCalc && (() => {
                const top = [...b.sets].map((s) => parseFloat(s.load)).filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => y - x)[0];
                if (!top) return null;
                const pl = platesPerSide(top, units);
                return (
                  <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>
                    {pl.perSide.length ? `${t("w.train.blocks.perSide")} ${displayLoad(String(top), units)} ${units}: ${pl.perSide.join(" · ")}${pl.remainder ? " ≈" : ""}` : `${t("w.train.blocks.barOnly")} (${pl.bar} ${units})`}
                  </Mono>
                );
              })()}
            </>
          ) : b.kind === "cardio" ? (
            <>
              {/* Timed sports (tennis, judo, …) track duration only — hide the
                  distance/pace fields. Endurance sports + plain cardio keep both. */}
              {timedSportOnly(b.name) ? (
                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: space.xs }}>
                  <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>{t("w.train.blocks.minutes")}</Mono>
                  <input value={condVal(b.uid, "minutes", b.minutes)} onChange={(e) => setCondNum(b.uid, "minutes", e.target.value)} placeholder="60" style={input} />
                </div>
              ) : (
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space.xs }}>
                {/* Distance reads/writes in the sport's natural unit (metres for
                    swimming/rowing, km otherwise); storage stays km. */}
                {[sportDistanceUnit(b.name) === "m" ? t("w.train.blocks.distM") : t("w.train.blocks.distKm"), t("w.train.blocks.minutes")].map((h) => (
                  <Mono key={h} s={{ fontSize: fs.nano, textTransform: "uppercase" }}>
                    {h}
                  </Mono>
                ))}
                <input value={distVal(b)} onChange={(e) => setDist(b.uid, b.name, e.target.value)} placeholder={sportDistanceUnit(b.name) === "m" ? "400" : "8"} style={input} />
                <input value={condVal(b.uid, "minutes", b.minutes)} onChange={(e) => setCondNum(b.uid, "minutes", e.target.value)} placeholder="50" style={input} />
              </div>
              )}
              {cardioPace(b) && (
                <Mono s={{ fontSize: fs.caption, display: "block", marginTop: 8 }} c={BLUE}>
                  {t("w.train.blocks.pace")} {cardioPace(b)}
                </Mono>
              )}
            </>
          ) : (
            <div style={{ overflowX: "auto", maxWidth: "100%" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: space.xs, minWidth: 360 }}>
              {[t("w.train.blocks.format"), t("w.train.blocks.workS"), t("w.train.blocks.restS"), t("w.train.blocks.roundsCol"), t("w.train.blocks.minutes")].map((h) => (
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

      {/* Searchable exercise picker — the sport-picker dropdown pattern, grouped
          by muscle/pattern, plus sports and a free-typed custom entry. */}
      {sportPicker && (
        <ExercisePicker
          catalog={catalog}
          onClose={() => setSportPicker(false)}
          onPick={(name, kind) => addNamed(name, kind)}
        />
      )}

      <div style={{ display: "flex", gap: space.sm, marginTop: 4, marginBottom: 14, flexWrap: "wrap" }}>
        <button onClick={addStrength} style={blockBtn(LIME)}>
          {t("w.train.blocks.addStrength")}
        </button>
        <button onClick={addCardio} style={blockBtn(BLUE)}>
          {t("w.train.blocks.addCardio")}
        </button>
        <button onClick={() => setSportPicker((v) => !v)} style={blockBtn(BLUE)}>
          {t("w.train.blocks.addExercise")}
        </button>
        <button onClick={addConditioning} style={blockBtn(VIOLET)}>
          {t("w.train.blocks.addConditioning")}
        </button>
        <button onClick={() => setRpeHelp((v) => !v)} style={blockBtn(ASH)}>
          {t("w.train.blocks.whatsRpe")}
        </button>
      </div>
    </>
  );
}

/**
 * Searchable exercise picker — the dimmed, centered modal twin of the sport
 * picker in "Log a sport session". Exercises grouped by muscle/pattern (sticky
 * headers), then sports, then a free-typed custom entry. Replaces the old wall
 * of chips so adding a movement reads the same as picking a sport.
 */
function ExercisePicker({ catalog, onPick, onClose }: { catalog: string[]; onPick: (name: string, kind: SessionBlock["kind"]) => void; onClose: () => void }) {
  const { t } = useLang();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const match = (n: string) => !q || n.toLowerCase().includes(q);
  const kindColor = (k: SessionBlock["kind"]) => (k === "strength" ? LIME : k === "cardio" ? BLUE : VIOLET);

  const exGroups = exercisesByCategory(MOVEMENTS, catalog)
    .map((g) => ({ ...g, names: g.names.filter(match) }))
    .filter((g) => g.names.length > 0);
  const sportGroups = olympicSportsByCategory()
    .map((g) => ({ category: g.category, sports: g.sports.filter((s) => match(s.name)) }))
    .filter((g) => g.sports.length > 0);
  const exact = [...Object.keys(MOVEMENTS), ...catalog].some((n) => n.toLowerCase() === q);

  const head = (label: string) => (
    <div style={{ position: "sticky", top: 0, background: INK2, padding: "9px 15px 4px", ...mono, fontSize: fs.nano, fontWeight: 600, letterSpacing: ".14em", textTransform: "uppercase", color: ASH }}>{label}</div>
  );
  const row = (name: string, kind: SessionBlock["kind"], key: string, icon?: string) => (
    <button
      key={key}
      type="button"
      onClick={() => onPick(name, kind)}
      style={{ width: "100%", display: "flex", alignItems: "center", gap: 11, padding: "10px 15px", cursor: "pointer", textAlign: "left", border: 0, background: "transparent", color: CHALK }}
    >
      {icon ? <span style={{ width: 20, textAlign: "center", fontSize: fs.bodyLg }}>{icon}</span> : <span style={{ width: 20, display: "grid", placeItems: "center" }}><span style={{ width: 8, height: 8, borderRadius: 4, background: kindColor(kind) }} /></span>}
      <span style={{ ...disp, flex: 1, fontWeight: 500, fontSize: fs.body }}>{name}</span>
    </button>
  );

  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("w.home.quickSport.choose")}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, maxHeight: "78vh", display: "flex", flexDirection: "column", background: INK2, border: `1px solid ${LINE}`, borderRadius: 16, boxShadow: "0 24px 60px -20px rgba(0,0,0,.8)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: `1px solid ${LINE}` }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ASH} strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
          </svg>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("w.train.blocks.searchExercise")} style={{ ...disp, flex: 1, minWidth: 0, background: "none", border: 0, outline: "none", color: CHALK, fontSize: fs.body }} />
          <button aria-label="Close" onClick={onClose} style={{ ...iconBtn(ASH), width: 26, height: 26 }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", flex: 1 }}>
          {exGroups.map((g) => (
            <div key={g.category}>
              {head(t(g.labelKey))}
              {g.names.map((n) => row(n, inferBlockKind(n), `e-${n}`))}
            </div>
          ))}
          {sportGroups.map((g) => (
            <div key={g.category}>
              {head(g.category)}
              {g.sports.map((s) => row(s.name, "cardio", `s-${s.name}`, s.icon))}
            </div>
          ))}
          {q.length > 0 && !exact && (
            <button type="button" onClick={() => onPick(query.trim(), inferBlockKind(query.trim()))} style={{ width: "100%", textAlign: "left", border: 0, background: "transparent", cursor: "pointer", padding: "12px 15px", ...disp, fontWeight: 700, fontSize: fs.body, color: txt(LIME) }}>
              + “{query.trim()}”
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// The RPE cheatsheet — the same scale (from @hybrid/core) the mobile logger shows.
function RpeHelp({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  return (
    <Card style={{ borderLeft: `3px solid ${LIME}`, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
          {t("w.train.blocks.rpeHelpTitle")}
        </Mono>
        <button aria-label="Close" onClick={onClose} style={{ ...iconBtn(ASH), width: 26, height: 26 }}>✕</button>
      </div>
      <Mono s={{ fontSize: fs.body, lineHeight: 1.5, display: "block", marginBottom: 12 }}>{RPE_INTRO}</Mono>
      <div style={{ display: "grid", gridTemplateColumns: "44px 64px 1fr", gap: "4px 10px", alignItems: "baseline" }}>
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }} c={ASH}>{t("w.train.blocks.rpeCol")}</Mono>
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }} c={ASH}>{t("w.train.blocks.repsLeft")}</Mono>
        <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }} c={ASH}>{t("w.train.blocks.feelsLike")}</Mono>
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
