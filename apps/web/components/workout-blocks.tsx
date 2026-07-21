"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import type { SessionBlock, StrengthSet, WeightUnit } from "@hybrid/core";
import { RPE_SCALE, RPE_INTRO, cardioPace, supersetLabels, toggleSuperset as toggleSupersetGroup, isSupersettedWithPrev, setType, cycleSetType, setTypeBadge, setFocus, addSetIsNext, rpeRirSwap, displayLoad, storeLoad, fmtTonnage, platesPerSide, warmupRamp, moveItemTo, olympicSportsByCategory, timedSportOnly, sportDistanceUnit, displaySportDistance, parseSportDistance, exercisesByCategory, inferBlockKind, MOVEMENTS, exerciseProfile, strengthBlockStats, blockSignalSummary, estimateBlockMinutes, DEFAULT_REST_SEC, loadUnitCount } from "@hybrid/core";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, disp, cond, mono, txt, Mono, Card } from "@/lib/ui";
import { useExercises } from "@/lib/use-exercises";
import { setLoggerPref } from "@/lib/logger-prefs";
import { useLang } from "@/lib/i18n";
import { useDialog } from "../lib/use-dialog";

// The block-by-block workout editor shared by Log Session (logger.tsx) and the
// template Builder (builder.tsx). Both screens edit the SAME SessionBlock[]
// shape — keeping one editor here is the single source of truth so the two can't
// drift (catalog, set grid, conditioning fields, overflow fixes, …).

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
  velocity = false,
  rirMode = false,
  units = "kg",
  plateCalc = false,
  live = false,
  carryOver = false,
  signal = false,
  bodyweightKg,
  lastByLift,
  onToggleDone,
}: {
  blocks: EditableBlock[];
  setBlocks: Dispatch<SetStateAction<EditableBlock[]>>;
  /** Text shown in the empty-state card. */
  emptyHint: string;
  /** Show per-block move/duplicate controls (the Builder wants them). */
  reorder?: boolean;
  /**
   * SIGNAL mode (the Builder): each block becomes a collapsible signal card —
   * a live metric row (derived from the editable sets, via @hybrid/core's
   * session-signal) stays visible while the editor body folds away, and
   * strength blocks gain a planned-rest stepper. The Logger stays as-is.
   */
  signal?: boolean;
  /** The athlete's bodyweight (kg) — bodyweight lifts count it as tonnage
   *  (core effectiveSetLoadKg). Null/absent degrades to entered-load math. */
  bodyweightKg?: number | null;
  /** Detailed shows the RPE column; Simple hides it (load × reps). */
  detailed?: boolean;
  /** Show the M/S bar-velocity column (VBT logging) — off by default. */
  velocity?: boolean;
  /** Show the effort column as RIR (reps-in-reserve) instead of RPE. */
  rirMode?: boolean;
  /** Weight unit for the load column (display + input). Storage stays kg. */
  units?: WeightUnit;
  /** LIVE logger: pre-fill a new set with the previous set's load/reps/rpe (the
   *  one-at-a-time lifter's tap-tap loop). Only the logger passes it — the
   *  Builder keeps blank sets, so a template author starts each set clean. */
  carryOver?: boolean;
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
  const { catalog: libraryCatalog = [], aliases = new Set<string>(), categoryByName = {} } = useExercises();
  // The full built-in exercise DB (via MOVEMENTS) + the admin library. Hide any
  // name a custom entry aliases (incl. superseded built-ins) so the same lift
  // never shows twice — it still resolves via merge.
  const catalog = [...new Set([...Object.keys(MOVEMENTS), ...libraryCatalog])]
    .filter((n) => !aliases.has(n))
    .sort((a, b) => a.localeCompare(b));
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
  // The set row currently dragged by its ⠿ grip (block uid + set index) — a
  // set drag never crosses into another block.
  const [dragSet, setDragSet] = useState<{ uid: string; i: number } | null>(null);
  // SIGNAL mode: blocks folded down to their header + metric row. New blocks
  // start expanded; the set survives reorders (keyed by uid).
  const [collapsedUids, setCollapsedUids] = useState<Set<string>>(new Set());
  const isCollapsed = (u: string) => signal && collapsedUids.has(u);
  const toggleCollapsed = (u: string) =>
    setCollapsedUids((s) => {
      const next = new Set(s);
      if (next.has(u)) next.delete(u);
      else next.add(u);
      return next;
    });
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
    patch(u, (b) => {
      if (b.kind !== "strength") return b;
      // Carry-over (logger only): seed the new set from the last one's numbers
      // so the incremental lifter just taps + and logs. A fresh working set —
      // never the prior set's done/drop/role flags — matching the mobile logger.
      const prev = carryOver ? b.sets[b.sets.length - 1] : undefined;
      const next: StrengthSet = prev
        ? { load: prev.load, reps: prev.reps, rpe: prev.rpe ?? "" }
        : { load: "", reps: "", rpe: "" };
      return { ...b, sets: [...b.sets, next] };
    });
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
  // Reorder a set within its block (drag the row's ⠿ grip onto another row).
  const moveSetTo = (u: string, from: number, to: number) =>
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: moveItemTo(b.sets, from, to) } : b));
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
  // Swim stroke — a cardio-only string field (empty clears it).
  const setStroke = (u: string, val: string) =>
    patch(u, (b) => (b.kind === "cardio" ? ({ ...b, stroke: val || undefined } as EditableBlock) : b));
  // Planned rest between working sets (builder prescription), 15 s steps.
  const bumpRest = (u: string, delta: number) =>
    patch(u, (b) =>
      b.kind === "strength"
        ? { ...b, restSec: Math.min(600, Math.max(15, (b.restSec ?? DEFAULT_REST_SEC) + delta)) }
        : b,
    );
  const setCondNum = (
    u: string,
    key: "work" | "rest" | "rounds" | "minutes" | "rpe" | "distance" | "incline" | "zone" | "elevation",
    val: string,
  ) => {
    setCondDrafts((d) => ({ ...d, [`${u}:${key}`]: val }));
    patch(u, (b) =>
      b.kind === "cardio" || b.kind === "conditioning" ? ({ ...b, [key]: condNum(val) } as EditableBlock) : b,
    );
  };

  const ssLabels = supersetLabels(blocks);
  // A plain-bodyweight lift (Pull-Up, Dip, Pistol Squat…) has NO load column —
  // the set is just BW × reps. "Weighted X" variants keep it (BW + added).
  const bwLift = (name: string) => exerciseProfile(name).strength?.loadMode === "bodyweight";
  // Set-row grid: the base columns (badge, load unless bodyweight, reps
  // [, rpe, m/s], move, remove) gain a ✓-to-bank column at the end in live mode.
  const strengthCols = (name: string) => {
    const inputs = 1 + (detailed ? 1 : 0) + (velocity ? 1 : 0) + (bwLift(name) ? 0 : 1);
    return `26px${" 1fr".repeat(inputs)} 22px 28px${live ? " 40px" : ""}`;
  };

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
              <span style={{ ...mono, fontSize: fs.micro, fontWeight: 700, color: txt(LIME), background: `color-mix(in srgb, var(--color-lime) 12%, transparent)`, border: `1px solid color-mix(in srgb, var(--color-lime) 33%, transparent)`, borderRadius: 6, padding: "1px 6px" }}>
                ⛓ {ssLabels[idx]}
              </span>
            )}
            <input
              list="workout-catalog"
              value={b.name}
              onChange={(e) => rename(b.uid, e.target.value)}
              style={{ ...input, ...disp, fontWeight: 700, flex: 1 }}
            />
            {isCollapsed(b.uid) && (
              <Mono s={{ fontSize: fs.micro, whiteSpace: "nowrap" }}>{blockSignalSummary(b)}</Mono>
            )}
            {reorder && !isCollapsed(b.uid) && (
              <button aria-label={t("common.duplicate")} onClick={() => duplicate(b.uid)} style={iconBtn(BLUE)}>
                ⧉
              </button>
            )}
            {!isCollapsed(b.uid) && b.kind === "strength" && idx > 0 && blocks[idx - 1]?.kind === "strength" && (
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
            {signal && (
              <button
                aria-label={isCollapsed(b.uid) ? t("w.train.blocks.expand") : t("w.train.blocks.collapse")}
                aria-expanded={!isCollapsed(b.uid)}
                onClick={() => toggleCollapsed(b.uid)}
                style={{ ...iconBtn(ASH), transition: "transform .15s", transform: isCollapsed(b.uid) ? "none" : "rotate(180deg)" }}
              >
                ▾
              </button>
            )}
            <button aria-label={t("common.delete")} onClick={() => removeBlock(b.uid)} style={iconBtn(RED)}>
              ✕
            </button>
          </div>

          {/* SIGNAL metric row — the COLLAPSED summary (scheme, top load,
              tonnage / distance, pace / format, rounds, est. minutes). Only
              rendered while the card is folded: expanded, the set table itself
              is the data and the session hero above live-updates — a summary
              strip on top of both would narrate the same numbers a third time. */}
          {signal && isCollapsed(b.uid) && <SignalMetrics b={b} units={units} bodyweightKg={bodyweightKg} />}

          {!isCollapsed(b.uid) && (b.kind === "strength" ? (
            <>
              {/* "Last time" reference (live mode) — the most recent prior session's
                  sets for this lift, so progressive overload has a target to beat. */}
              {live && lastByLift?.get(b.name) && (
                <Mono s={{ fontSize: fs.micro, display: "block", marginBottom: 8 }} c={ASH}>
                  {t("workout.lastTime")} – {lastByLift.get(b.name)}
                </Mono>
              )}
              {/* A bilateral dumbbell lift takes ONE dumbbell's weight; tonnage
                  counts both bells. Guide the athlete so the doubled volume reads. */}
              {loadUnitCount(b.name) === 2 && (
                <Mono s={{ fontSize: fs.micro, display: "block", marginBottom: 8 }} c={BLUE}>
                  {t("w.train.blocks.dbPerHint")}
                </Mono>
              )}
              <div style={{ overflowX: "auto", maxWidth: "100%" }}>
              <div style={{ minWidth: 240 + (detailed ? 60 : 0) + (velocity ? 60 : 0) }}>
              {/* The exercise DB drives how THIS lift's sets read: a plank
                  counts seconds, a carry counts metres, a pull-up's load is
                  BW + added weight. */}
              <div style={{ display: "grid", gridTemplateColumns: strengthCols(b.name), gap: space.xs, marginBottom: 4, alignItems: "center" }}>
                <span />
                {!bwLift(b.name) && (
                  <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>{t("w.train.blocks.load")} ({units})</Mono>
                )}
                <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>
                  {(() => {
                    const m = exerciseProfile(b.name).strength?.measure;
                    return t(m === "time" ? "w.train.blocks.secs" : m === "distance" ? "w.train.blocks.distM" : "w.train.blocks.reps");
                  })()}
                </Mono>
                {/* The column header is the RPE ⇄ RIR mode switch (persists
                    as the device-wide logger pref); the ⓘ opens the help. */}
                {detailed && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <button
                      onClick={() => setLoggerPref("rpeAsRir", !rirMode)}
                      aria-label={`${rirMode ? "RIR" : "RPE"} — ${t("rpe.rir")}`}
                      style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(ASH), background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                    >
                      {rirMode ? "rir" : "rpe"} ⇄
                    </button>
                    <button
                      onClick={() => setRpeHelp((v) => !v)}
                      title={t("w.train.blocks.whatIsRpe")}
                      style={{ ...mono, fontSize: fs.nano, color: txt(rpeHelp ? LIME : ASH), background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    >
                      ⓘ
                    </button>
                  </span>
                )}
                {velocity && <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>m/s</Mono>}
                <span />
                <span />
                {live && <span />}
              </div>
              {b.sets.map((s, i) => {
                // LIVE logger: focus the set you're on, sunset the rest (shared
                // core model). The first un-banked set is the "active" hero on a
                // lime-tinted panel; banked sets recede to quiet history, the
                // queue below to a faded plan. The Builder (live=false) is
                // untouched — it edits a plan, it has no "now".
                const focus = live ? setFocus(b.sets as { done?: boolean }[], i) : null;
                const dragging = dragSet?.uid === b.uid && dragSet.i === i;
                return (
                <div
                  key={i}
                  // Rows are drop targets for a set dragged within the SAME block.
                  onDragOver={dragSet && dragSet.uid === b.uid && dragSet.i !== i ? (e) => e.preventDefault() : undefined}
                  onDrop={
                    dragSet && dragSet.uid === b.uid && dragSet.i !== i
                      ? (e) => {
                          e.preventDefault();
                          moveSetTo(b.uid, dragSet.i, i);
                          setDragSet(null);
                        }
                      : undefined
                  }
                  style={{
                    display: "grid",
                    gridTemplateColumns: strengthCols(b.name),
                    gap: space.xs,
                    marginBottom: 6,
                    alignItems: "center",
                    opacity: dragging ? 0.5 : focus === "done" ? 0.42 : focus === "upcoming" ? 0.5 : 1,
                    // Vertical-only padding keeps the cells in column with the
                    // header while the active row gains height + a tinted ring.
                    ...(focus === "active"
                      ? { borderRadius: 12, paddingBlock: 6, background: `${LIME}14`, boxShadow: `inset 0 0 0 1px ${LIME}55` }
                      : {}),
                  }}
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
                  {(() => {
                    const sp = exerciseProfile(b.name).strength;
                    const loadPh =
                      sp?.loadMode === "bodyweight-plus" ? `+${units}`
                      : sp?.loadMode === "assisted" ? `−${units}`
                      : units === "lb" ? "225" : "100";
                    const repsPh = sp?.measure === "time" ? "30" : sp?.measure === "distance" ? "20" : "5";
                    return (
                      <>
                        {sp?.loadMode !== "bodyweight" && (
                          <input className="ghost-ph" value={displayLoad(s.load, units)} onChange={(e) => updateSet(b.uid, i, "load", storeLoad(e.target.value, units))} placeholder={loadPh} style={input} />
                        )}
                        <input className="ghost-ph" value={s.reps} onChange={(e) => updateSet(b.uid, i, "reps", e.target.value)} placeholder={repsPh} style={input} />
                      </>
                    );
                  })()}
                  {detailed && (
                    <input className="ghost-ph" value={rpeRirSwap(s.rpe ?? "", rirMode)} onChange={(e) => updateSet(b.uid, i, "rpe", rpeRirSwap(e.target.value, rirMode))} placeholder={rirMode ? "2" : "8"} style={input} />
                  )}
                  {velocity && (
                    <input className="ghost-ph" value={s.vel ?? ""} onChange={(e) => updateSet(b.uid, i, "vel", e.target.value)} placeholder="0.50" style={input} />
                  )}
                  <span
                    // Grip — drag this row onto another row to reorder the sets.
                    draggable={b.sets.length > 1}
                    onDragStart={() => setDragSet({ uid: b.uid, i })}
                    onDragEnd={() => setDragSet(null)}
                    title={t("w.train.blocks.dragToReorder")}
                    style={{ ...mono, fontSize: fs.body, color: txt(ASH), cursor: b.sets.length > 1 ? "grab" : "default", userSelect: "none", textAlign: "center", lineHeight: 1 }}
                  >
                    ⠿
                  </span>
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
                );
              })}
              </div>
              </div>
              {/* Add-set control: "+ Add set" wears the ghost/dashed add
                  affordance (one-accent rule — the screen's single lime fill
                  belongs to the primary Save/Finish action, not a repeated
                  per-card control), with warm-up / ramp / cool-down / drop
                  tucked into a compact "Special ▾" menu. The set badge still
                  re-types a set with a tap, so the menu is just for ADDING. */}
              <div style={{ display: "flex", gap: space.xs, alignItems: "center", position: "relative" }}>
                {/* LIVE: when nothing is queued below the active set, "+ Add set"
                    IS the next move — a prominent lime ghost mirroring the active
                    row's tint; when a plan sits below (or in the Builder) it stays
                    a quiet ash ghost so the queue keeps the focus. */}
                {(() => {
                  const ghost = live && addSetIsNext(b.sets as { done?: boolean }[]);
                  return (
                    <button
                      onClick={() => addSet(b.uid)}
                      style={
                        ghost
                          ? { ...disp, fontWeight: 700, fontSize: fs.caption, color: txt(LIME), background: `${LIME}14`, border: `1px dashed ${LIME}80`, borderRadius: 999, padding: "8px 17px", cursor: "pointer" }
                          : { ...disp, fontWeight: 600, fontSize: fs.caption, color: ASH, background: "none", border: `1px dashed color-mix(in srgb, ${ASH} 50%, transparent)`, borderRadius: 999, padding: "8px 17px", cursor: "pointer" }
                      }
                    >
                      {t("w.train.blocks.addSet")}
                    </button>
                  );
                })()}
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
              {/* SIGNAL: planned rest between working sets — a routine
                  prescription (the live logger measures actual rest per set). */}
              {signal && (
                <div style={{ display: "flex", alignItems: "center", gap: space.sm, marginTop: 12 }}>
                  <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".08em" }}>{t("w.train.blocks.restBetween")}</Mono>
                  <button aria-label={t("common.decrease")} onClick={() => bumpRest(b.uid, -15)} style={iconBtn(ASH)}>−</button>
                  <Mono s={{ fontSize: fs.body, fontWeight: 700, minWidth: 44, textAlign: "center" }} c={CHALK}>
                    {b.restSec ?? DEFAULT_REST_SEC} s
                  </Mono>
                  <button aria-label={t("common.increase")} onClick={() => bumpRest(b.uid, 15)} style={iconBtn(LIME)}>+</button>
                </div>
              )}
              {plateCalc && (() => {
                const top = [...b.sets].map((s) => parseFloat(s.load)).filter((n) => Number.isFinite(n) && n > 0).sort((x, y) => y - x)[0];
                if (!top) return null;
                const pl = platesPerSide(top, units);
                return (
                  <Mono s={{ fontSize: fs.micro, display: "block", marginTop: 8 }} c={ASH}>
                    {pl.perSide.length ? `${t("w.train.blocks.perSide")} ${displayLoad(String(top), units)} ${units}: ${pl.perSide.join(" – ")}${pl.remainder ? " ≈" : ""}` : `${t("w.train.blocks.barOnly")} (${pl.bar} ${units})`}
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
              {/* Modality extras — the exercise-profile model decides the
                  fields: incline for treadmill-style work, stroke for swims,
                  elevation gain for outdoor climb sports, HR zone for any
                  cardio. A squat never sees pace; a swim never sees incline. */}
              {(() => {
                const has = (f: string) => exerciseProfile(b.name).fields.includes(f as never);
                const extras: { key: "incline" | "elevation" | "zone"; label: string; ph: string }[] = [
                  ...(has("incline") ? [{ key: "incline" as const, label: t("w.train.blocks.inclinePct"), ph: "1.5" }] : []),
                  ...(has("elevation") ? [{ key: "elevation" as const, label: t("w.train.blocks.elevation"), ph: "120" }] : []),
                  { key: "zone" as const, label: t("w.train.blocks.zone"), ph: "2" },
                ];
                const stroke = has("stroke");
                return (
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${extras.length + (stroke ? 1 : 0)}, 1fr)`, gap: space.xs, marginTop: 8 }}>
                    {stroke && <Mono s={{ fontSize: fs.nano, textTransform: "uppercase" }}>{t("w.train.blocks.stroke")}</Mono>}
                    {extras.map((x) => (
                      <Mono key={x.key} s={{ fontSize: fs.nano, textTransform: "uppercase" }}>{x.label}</Mono>
                    ))}
                    {stroke && (
                      <input value={b.stroke ?? ""} onChange={(e) => setStroke(b.uid, e.target.value)} placeholder="Free" style={input} />
                    )}
                    {extras.map((x) => (
                      <input key={x.key} value={condVal(b.uid, x.key, b[x.key])} onChange={(e) => setCondNum(b.uid, x.key, e.target.value)} placeholder={x.ph} style={input} />
                    ))}
                  </div>
                );
              })()}
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
          ))}
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
          aliases={aliases}
          categoryByName={categoryByName}
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

/** The lift's SHAPE, read from the exercise DB — the row's right-side mono hint
 *  so an athlete knows what the set grid will ask for before adding. */
function shapeHint(name: string, kind: SessionBlock["kind"]): string {
  if (kind !== "strength") return "";
  const sp = exerciseProfile(name).strength;
  if (!sp) return "";
  if (sp.measure === "time") return "secs";
  if (sp.measure === "distance") return "m";
  if (sp.loadMode === "bodyweight") return "BW";
  if (sp.loadMode === "bodyweight-plus") return "BW+";
  if (sp.loadMode === "assisted") return "assist";
  return "";
}

/**
 * The exercise picker — "Rooms, then Things" with an A–Z index, a view the
 * athlete can switch: GROUPS (default) shows a grid of pattern/muscle "rooms"
 * (tile + name + movement count; tap a room for just its movements — two taps,
 * never a 200-item scroll), A–Z is the typeset index (display-face letter
 * heads + a right-edge letter rail). Rows share the Exercises-page anatomy —
 * an initials tile tinted by modality (sports keep their glyph) with shape
 * hints on the right; the old 8px-dot list and mono-uppercase category
 * kickers are retired. Search cuts across every room; an unknown name is
 * always offered as a custom add. Twin of the mobile ExercisePickerSheet.
 */
function ExercisePicker({ catalog, aliases, categoryByName, onPick, onClose }: { catalog: string[]; aliases: Set<string>; categoryByName: Record<string, string>; onPick: (name: string, kind: SessionBlock["kind"]) => void; onClose: () => void }) {
  const { t } = useLang();
  const dialogRef = useDialog<HTMLDivElement>(onClose);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"groups" | "az">("groups");
  const [room, setRoom] = useState<string | null>(null);
  const q = query.trim().toLowerCase();
  const kindColor = (k: SessionBlock["kind"]) => (k === "strength" ? LIME : k === "cardio" ? BLUE : VIOLET);
  const initials = (name: string) => name.split(/[\s-]+/).filter(Boolean).map((w) => w[0]!).join("").slice(0, 2).toUpperCase();

  // Library exercises group under their muscle-group heading (categoryByName);
  // aliased names are dropped so a superseded built-in never shows twice.
  type Entry = { name: string; kind: SessionBlock["kind"]; icon?: string };
  const rooms: { key: string; label: string; icon?: string; entries: Entry[] }[] = [
    ...exercisesByCategory(MOVEMENTS, catalog, categoryByName)
      .map((g) => ({ ...g, names: g.names.filter((n) => !aliases.has(n)) }))
      .filter((g) => g.names.length > 0)
      .map((g) => ({ key: g.category, label: g.labelKey ? t(g.labelKey) : g.label ?? g.category, entries: g.names.map((n): Entry => ({ name: n, kind: inferBlockKind(n) })) })),
    ...olympicSportsByCategory().map((g) => ({ key: `sport:${g.category}`, label: g.category, icon: g.sports[0]?.icon, entries: g.sports.map((s): Entry => ({ name: s.name, kind: "cardio" as const, icon: s.icon })) })),
  ];
  const seen = new Set<string>();
  const all: Entry[] = [];
  for (const r of rooms) for (const e of r.entries) if (!seen.has(e.name)) { seen.add(e.name); all.push(e); }
  // Alias names count as exact so an aliased built-in ("Bench Press" behind
  // "Barbell Bench Press") is never re-offered as a new custom spelling.
  const exact = all.some((e) => e.name.toLowerCase() === q) || [...aliases].some((a) => a.toLowerCase() === q);
  const results = q ? all.filter((e) => e.name.toLowerCase().includes(q)) : [];
  const az: { letter: string; entries: Entry[] }[] = [];
  for (const e of [...all].sort((a, b) => a.name.localeCompare(b.name))) {
    const L = e.name[0]!.toUpperCase();
    if (az[az.length - 1]?.letter !== L) az.push({ letter: L, entries: [] });
    az[az.length - 1]!.entries.push(e);
  }
  const roomData = room ? rooms.find((r) => r.key === room) : null;

  const tile = (e: { icon?: string; name: string; kind: SessionBlock["kind"] }, label?: string) => (
    <span style={{ width: 38, height: 38, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: "var(--color-ink)", border: `1px solid ${LINE}` }}>
      {e.icon
        ? <span style={{ fontSize: 16 }}>{e.icon}</span>
        : <span style={{ ...mono, fontWeight: 700, fontSize: 11.5, letterSpacing: "-.02em", color: txt(kindColor(e.kind)) }}>{initials(label ?? e.name)}</span>}
    </span>
  );
  const row = (e: Entry, last: boolean) => {
    const hint = shapeHint(e.name, e.kind);
    return (
      <button key={e.name} type="button" onClick={() => onPick(e.name, e.kind)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "8px 0", cursor: "pointer", textAlign: "left", border: 0, borderBottom: last ? "none" : `1px solid ${LINE}`, background: "transparent", color: CHALK }}>
        {tile(e)}
        <span style={{ ...disp, flex: 1, minWidth: 0, fontWeight: 600, fontSize: fs.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
        {!!hint && <span style={{ ...mono, fontSize: 9, letterSpacing: ".07em", textTransform: "uppercase", color: ASH, flex: "none" }}>{hint}</span>}
      </button>
    );
  };
  const slab = (entries: Entry[]) => (
    <div style={{ background: INK2, border: `1px solid ${LINE}`, borderRadius: 16, padding: "2px 13px" }}>
      {entries.map((e, i) => row(e, i === entries.length - 1))}
    </div>
  );
  // Explore-standard section head — bold display title, mono count at the baseline.
  const head = (label: string, count: number) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "16px 2px 9px" }}>
      <span style={{ ...disp, fontWeight: 800, fontSize: 16, color: CHALK }}>{label}</span>
      <span style={{ ...mono, fontSize: 10.5, letterSpacing: ".1em", color: ASH }}>{count}</span>
    </div>
  );
  const customAdd = q.length > 0 && !exact && (
    <button type="button" onClick={() => onPick(query.trim(), inferBlockKind(query.trim()))} style={{ ...disp, display: "block", width: "100%", marginTop: 14, textAlign: "center", fontWeight: 800, fontSize: fs.body, background: LIME, color: "var(--on-accent)", border: 0, borderRadius: 999, padding: "12px", cursor: "pointer" }}>
      + “{query.trim()}”
    </button>
  );

  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={t("w.home.quickSport.choose")}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, height: "78vh", display: "flex", flexDirection: "column", background: "var(--color-ink)", border: `1px solid ${LINE}`, borderRadius: 20, boxShadow: "0 24px 60px -20px rgba(0,0,0,.8)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 15px", borderBottom: `1px solid ${LINE}`, flex: "none" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ASH} strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
          </svg>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("w.train.blocks.searchExercise")} style={{ ...disp, flex: 1, minWidth: 0, background: "none", border: 0, outline: "none", color: CHALK, fontSize: fs.body }} />
          <button aria-label={t("common.close")} onClick={onClose} style={{ ...iconBtn(ASH), width: 26, height: 26 }}>✕</button>
        </div>

        {/* VIEW TOGGLE — Groups (rooms drill-down) ⇄ A–Z (the typeset index).
            Hidden while searching: results are one flat list either way. */}
        {!q && (
          <div style={{ display: "flex", gap: 8, padding: "12px 15px 0", flex: "none" }}>
            {([{ id: "groups" as const, label: t("w.analyze.ex.sortGroups") }, { id: "az" as const, label: t("w.analyze.ex.sortAz") }]).map((p) => {
              const on = view === p.id;
              return (
                <button key={p.id} type="button" onClick={() => { setView(p.id); setRoom(null); }} aria-pressed={on}
                  style={{ ...mono, fontSize: 10.5, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: on ? 700 : 400, color: on ? "var(--on-accent)" : ASH, background: on ? LIME : "transparent", border: `1px solid ${on ? LIME : LINE}`, borderRadius: 999, padding: "7px 14px", cursor: "pointer" }}>
                  {p.label}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
          <div style={{ overflowY: "auto", height: "100%", padding: `4px ${view === "az" && !q ? 30 : 15}px 20px 15px` }}>
            {q ? (
              /* SEARCH — one flat list across every room, then custom add. */
              <>
                {results.length > 0 && <div style={{ marginTop: 10 }}>{slab(results)}</div>}
                {customAdd}
              </>
            ) : view === "az" ? (
              /* A–Z — display-face letter heads; ids feed the rail. */
              az.map((sec) => (
                <div key={sec.letter} id={`xpk-${sec.letter}`}>
                  <div style={{ ...disp, fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", color: ASH, margin: "14px 2px 6px" }}>{sec.letter}</div>
                  {slab(sec.entries)}
                </div>
              ))
            ) : roomData ? (
              /* ONE ROOM — crumb back + the room's movements only. */
              <>
                <button type="button" onClick={() => setRoom(null)} style={{ ...mono, fontSize: fs.caption, color: ASH, background: "none", border: 0, cursor: "pointer", padding: 0, margin: "10px 2px 0" }}>← {t("w.train.picker.all")}</button>
                {head(roomData.label, roomData.entries.length)}
                {slab(roomData.entries)}
              </>
            ) : (
              /* ROOMS — the pattern grid; two taps, never a giant scroll. */
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                {rooms.map((r) => (
                  <button key={r.key} type="button" onClick={() => setRoom(r.key)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 9, background: INK2, border: `1px solid ${LINE}`, borderRadius: 16, padding: "13px 13px", cursor: "pointer", color: CHALK, textAlign: "left" }}>
                    {tile({ icon: r.icon, name: r.label, kind: r.entries[0]!.kind }, r.label)}
                    <span style={{ ...disp, fontWeight: 700, fontSize: fs.note, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>{r.label}</span>
                    <span style={{ ...mono, fontSize: 10, letterSpacing: ".08em", color: ASH }}>{r.entries.length}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* A–Z letter rail — one-thumb jumps via anchor ids. */}
          {view === "az" && !q && (
            <div style={{ position: "absolute", right: 4, top: 0, bottom: 0, display: "flex", flexDirection: "column", justifyContent: "center", gap: 1 }}>
              {az.map((sec) => (
                // Instant jump (no smooth) — the index can be thousands of px
                // away and a long smooth scroll lags or aborts; a rail snaps,
                // like the iOS contacts index.
                <button key={sec.letter} type="button" aria-label={sec.letter} onClick={() => document.getElementById(`xpk-${sec.letter}`)?.scrollIntoView({ block: "start" })}
                  style={{ ...mono, fontSize: 9, color: ASH, background: "none", border: 0, cursor: "pointer", padding: "0 4px", textAlign: "center" }}>
                  {sec.letter}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * The signal card's metric row — every value is DERIVED from the block's
 * editable fields (core session-signal), so the board can't disagree with the
 * prescription: edit a set below, watch the number move above. Modality is
 * carried by which metrics exist and the accent on the key one — no rails.
 */
function SignalMetrics({ b, units, bodyweightKg }: { b: EditableBlock; units: WeightUnit; bodyweightKg?: number | null }) {
  const { t } = useLang();
  const minutes = Math.round(estimateBlockMinutes(b));
  const cell = (label: string, value: string, c?: string) => (
    <div key={label}>
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", display: "block" }}>{label}</Mono>
      <Mono s={{ fontSize: fs.note, fontWeight: 700 }} c={c ?? CHALK}>{value}</Mono>
    </div>
  );
  const cells =
    b.kind === "strength"
      ? (() => {
          const s = strengthBlockStats(b, bodyweightKg);
          // A plain-bodyweight lift shows no load cell (nothing was entered) —
          // but with a known bodyweight its TONNAGE is real (BW × reps), so
          // the tonnage cell stays whenever it has a value.
          const bw = exerciseProfile(b.name).strength?.loadMode === "bodyweight";
          return [
            cell(`${t("w.train.blocks.setCol")} × ${t("w.train.blocks.reps")}`, s.scheme),
            ...(bw && s.volumeKg <= 0
              ? []
              : bw
                ? [cell(t("w.train.signal.tonnage"), fmtTonnage(s.volumeKg, units), LIME)]
                : [
                  cell(`${t("w.train.blocks.load")} (${units})`, s.topKg > 0 ? displayLoad(String(s.topKg), units) : "—"),
                  cell(t("w.train.signal.tonnage"), s.volumeKg > 0 ? fmtTonnage(s.volumeKg, units) : "—", LIME),
                ]),
            cell(t("w.train.signal.estTime"), `${minutes} min`),
          ];
        })()
      : b.kind === "cardio"
        ? [
            ...(timedSportOnly(b.name)
              ? []
              : [cell(sportDistanceUnit(b.name) === "m" ? t("w.train.blocks.distM") : t("w.train.blocks.distKm"), displaySportDistance(b.distance, b.name) || "—")]),
            cell(t("w.train.blocks.pace"), cardioPace(b) ?? "—", BLUE),
            cell(t("w.train.blocks.minutes"), b.minutes ? String(b.minutes) : "—"),
          ]
        : [
            cell(t("w.train.blocks.format"), b.format || "—"),
            cell(t("w.train.blocks.roundsCol"), b.rounds ? String(b.rounds) : "—"),
            cell(t("w.train.signal.estTime"), `${minutes} min`, VIOLET),
          ];
  return <div style={{ display: "flex", gap: 20, flexWrap: "wrap", margin: "0 2px 12px" }}>{cells}</div>;
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
        <button aria-label={t("common.close")} onClick={onClose} style={{ ...iconBtn(ASH), width: 26, height: 26 }}>✕</button>
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
