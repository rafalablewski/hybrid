"use client";

import { useEffect, useRef, useState, type Dispatch, type PointerEvent as ReactPointerEvent, type SetStateAction } from "react";
import type { SessionBlock, StrengthSet, WeightUnit } from "@hybrid/core";
import { RPE_SCALE, RPE_INTRO, cardioPace, supersetLabels, toggleSuperset as toggleSupersetGroup, isSupersettedWithPrev, setType, cycleSetType, setTypeBadge, setFocus, addSetIsNext, rpeRirSwap, displayLoad, storeLoad, fmtTonnage, platesPerSide, warmupRamp, moveItemTo, olympicSportsByCategory, timedSportOnly, sportDistanceUnit, displaySportDistance, parseSportDistance, exercisesByCategory, inferBlockKind, MOVEMENTS, exerciseProfile, strengthBlockStats, blockSignalSummary, estimateBlockMinutes, DEFAULT_REST_SEC, loadUnitCount, exerciseLiveStats, roomBodyMark } from "@hybrid/core";
import { fs, space, INK2, LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, disp, cond, mono, txt, Mono, Card } from "@/lib/ui";
import { AuroraIcon } from "./aurora/icons";
import { useExercises } from "@/lib/use-exercises";
import SwipeRow from "@/components/swipe-row";
import { animateListChange } from "@/lib/list-motion";
import Sheet from "@/components/aurora/sheet";
import AuroraExerciseMedia from "@/components/aurora/exercise-media";
import AuroraBodyMark from "@/components/aurora/body-mark";
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
  borderRadius: 12,
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
    letterSpacing: ".08em",
    color: txt(color),
    background: `${color}1f`,
    border: `1px solid ${color}55`,
    borderRadius: 12,
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
    borderRadius: 12,
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
  restSec = null,
  onToggleDone,
  prLifts,
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
  /** LIVE: the active set's planned-rest hint (seconds), shown on the up-now
   *  card. The logger passes prefs.restSeconds when the rest timer is on, else
   *  null (hint hidden) — mirrors the mobile logger. */
  restSec?: number | null;
  /** Per-exercise "last time" summary string (e.g. "100×5 · 100×5"), keyed by
   *  exercise name. Shown above the set grid in live mode. */
  lastByLift?: Map<string, string>;
  /** Live mode: called when a set's ✓ is toggled (parent owns done + rest). */
  onToggleDone?: (blockUid: string, setIndex: number, done: boolean) => void;
  /** LIVE: lifts that have set a new record so far this session (core
   *  livePrLifts, heaviest-first). The matching card wears a PR badge the
   *  moment the record set is banked; on finish the badge flies into the
   *  summary's trophy chip (SHARED_ELEMENTS.prBadge — the logger arms
   *  `[data-pr-badge="<lift>"]` for the flight). */
  prLifts?: readonly string[];
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
  // Popular-preset popover: which block has its preset rail open. One tap lays
  // out the whole exercise before the first rep instead of "+ Add set" one-by-one.
  const [planUid, setPlanUid] = useState<string | null>(null);
  // LIVE active-set RPE: hidden behind a chip on the up-now card, expanded per
  // block (only one set is active per block, so keying by block uid is enough).
  const [rpeOpenUid, setRpeOpenUid] = useState<string | null>(null);
  // LIVE: which exercise has its detail sheet up (per-set bar speed + summary).
  const [sheetUid, setSheetUid] = useState<string | null>(null);
  // Press-and-hold anywhere on a strength card opens its exercise sheet
  // (user-picked entry — the pointer twin of mobile's onLongPress). Holds
  // starting on a control (input/button/grip) are ignored, and any real
  // movement (scroll, swipe, drag) cancels the hold.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdFrom = useRef<{ x: number; y: number } | null>(null);
  const cancelHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    holdFrom.current = null;
  };
  const beginHold = (e: ReactPointerEvent, uid: string) => {
    if ((e.target as HTMLElement).closest('input,button,textarea,select,[draggable="true"]')) return;
    cancelHold();
    holdFrom.current = { x: e.clientX, y: e.clientY };
    holdTimer.current = setTimeout(() => { holdTimer.current = null; setSheetUid(uid); }, 400);
  };
  const moveHold = (e: ReactPointerEvent) => {
    if (holdFrom.current && Math.hypot(e.clientX - holdFrom.current.x, e.clientY - holdFrom.current.y) > 8) cancelHold();
  };
  // The Olympic-sport quick-add picker (manual sport-session logging — no gear
  // needed). Picking a sport adds a cardio block named after it.
  const [sportPicker, setSportPicker] = useState(false);
  // The block currently being dragged by its grip handle (for drop reordering).
  const [dragUid, setDragUid] = useState<string | null>(null);
  // The FLIP root — see `flip` below.
  const listRef = useRef<HTMLDivElement>(null);
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

  // EVERY MUTATION OF THE LIST TRAVELS. `flip` measures the rows, commits the
  // change synchronously, measures again and animates each row from where it
  // was — so a set arriving mid-exercise pushes the rows under it down and a
  // reorder slides the displaced cards into their new slots. Without it these
  // are the moments the USER caused and the only ones in the app with no motion
  // at all. Deletion is the exception and belongs to SwipeRow: a removed row is
  // gone from the DOM before anything can animate it, so it has to leave first
  // (`collapseAndRemove`) and unmount after.
  const flip = (apply: () => void) => animateListChange(listRef.current, apply);

  const addStrength = () =>
    flip(() => setBlocks((bs) => [
      ...bs,
      { uid: uid(), kind: "strength", name: "Back Squat", sets: [{ load: "", reps: "", rpe: "" }] },
    ]));
  const addCardio = () =>
    flip(() => setBlocks((bs) => [...bs, { uid: uid(), kind: "cardio", name: "Run" }]));
  const addConditioning = () =>
    flip(() => setBlocks((bs) => [...bs, { uid: uid(), kind: "conditioning", name: "Row Intervals", format: "" }]));
  // Manual sport session — logged as a cardio activity named after the sport, so
  // pace, PRs, history and the training log read it with no special-casing.
  const addSport = (name: string) => {
    flip(() => setBlocks((bs) => [...bs, { uid: uid(), kind: "cardio", name }]));
    setSportPicker(false);
  };
  // Add a named block of the inferred kind — used by the searchable exercise
  // picker (strength gets a starter set; cardio/conditioning are name-only).
  const addNamed = (name: string, kind: SessionBlock["kind"]) => {
    const clean = name.trim();
    if (!clean) return;
    flip(() => setBlocks((bs) => [
      ...bs,
      kind === "strength"
        ? { uid: uid(), kind: "strength", name: clean, sets: [{ load: "", reps: "", rpe: "" }] }
        : kind === "cardio"
          ? { uid: uid(), kind: "cardio", name: clean }
          : { uid: uid(), kind: "conditioning", name: clean, format: "" },
    ]));
    setSportPicker(false);
  };
  const removeBlock = (u: string) => flip(() => setBlocks((bs) => bs.filter((b) => b.uid !== u)));
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
    flip(() => setBlocks((bs) => moveItemTo(bs, bs.findIndex((b) => b.uid === fromU), bs.findIndex((b) => b.uid === toU))));
  const duplicate = (u: string) =>
    flip(() => setBlocks((bs) => {
      const i = bs.findIndex((b) => b.uid === u);
      if (i < 0) return bs;
      const copy = { ...structuredClone(bs[i]!), uid: uid() } as EditableBlock;
      return [...bs.slice(0, i + 1), copy, ...bs.slice(i + 1)];
    }));

  const updateSet = (u: string, i: number, key: keyof StrengthSet, val: string) =>
    patch(u, (b) =>
      b.kind === "strength"
        ? { ...b, sets: b.sets.map((s, j) => (j === i ? ({ ...s, [key]: val } as StrengthSet) : s)) }
        : b,
    );
  const addSet = (u: string) =>
    flip(() => patch(u, (b) => {
      if (b.kind !== "strength") return b;
      // Carry-over (logger only): seed the new set from the last one's numbers
      // so the incremental lifter just taps + and logs. A fresh working set —
      // never the prior set's done/drop/role flags — matching the mobile logger.
      const prev = carryOver ? b.sets[b.sets.length - 1] : undefined;
      const next: StrengthSet = prev
        ? { load: prev.load, reps: prev.reps, rpe: prev.rpe ?? "" }
        : { load: "", reps: "", rpe: "" };
      return { ...b, sets: [...b.sets, next] };
    }));
  // Popular preset schemes (⋯ menu) — lay out the whole exercise's working sets
  // in one tap. Each rep count is a SINGLE number (project rule), carrying the
  // block's current load. Banked sets are kept; the un-banked plan is replaced.
  const applyPreset = (u: string, count: number, reps: number) =>
    patch(u, (b) => {
      if (b.kind !== "strength") return b;
      const done = b.sets.filter((s) => (s as StrengthSet & { done?: boolean }).done);
      const load = [...b.sets].reverse().find((s) => s.load)?.load ?? "";
      const work: StrengthSet[] = Array.from({ length: count }, () => ({ load, reps: String(reps), rpe: "" }));
      return { ...b, sets: [...done, ...work] };
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
    flip(() => patch(u, (b) =>
      b.kind === "strength" ? { ...b, sets: [...b.sets, { load: "", reps: "", rpe: "", role: "cooldown" }] } : b,
    ));
  const removeSet = (u: string, i: number) =>
    flip(() => patch(u, (b) => (b.kind === "strength" ? { ...b, sets: b.sets.filter((_, j) => j !== i) } : b)));
  // Reorder a set within its block (drag the row's ⠿ grip onto another row).
  const moveSetTo = (u: string, from: number, to: number) =>
    flip(() => patch(u, (b) => (b.kind === "strength" ? { ...b, sets: moveItemTo(b.sets, from, to) } : b)));
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
    return `26px${" 1fr".repeat(inputs)} 22px 30px${live ? " 40px" : ""}`;
  };

  return (
    // display:contents so the wrapper is layout-neutral — it exists only to give
    // the FLIP in lib/list-motion a root to find `[data-list-row]` under. Every
    // mutation below runs through `flip()`, so a set added to one exercise
    // pushes the sets under it AND the cards under that one, together.
    <div ref={listRef} style={{ display: "contents" }}>
      {blocks.length === 0 && (
        <Card style={{ textAlign: "center", padding: 32, marginBottom: 12 }}>
          <Mono s={{ fontSize: fs.body }}>{emptyHint}</Mono>
        </Card>
      )}

      {blocks.map((b, idx) => (
        <div
          key={b.uid}
          data-list-row
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
          onPointerDown={live && b.kind === "strength" ? (e) => beginHold(e, b.uid) : undefined}
          onPointerUp={live && b.kind === "strength" ? cancelHold : undefined}
          onPointerLeave={live && b.kind === "strength" ? cancelHold : undefined}
          onPointerCancel={live && b.kind === "strength" ? cancelHold : undefined}
          onPointerMove={live && b.kind === "strength" ? moveHold : undefined}
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
            {/* The lift's IMPLEMENT, tinted by modality — it carries both what
                the old mono "STRENGTH" word said (via the tint) and the gear it
                takes (via the drawing), and becomes the hand-drawn demo once
                that lift is drawn. */}
            <span role="img" aria-label={b.kind} style={{ display: "flex", flex: "none" }}>
              <AuroraExerciseMedia name={b.name} variant="thumb" size={20} tint={txt(b.kind === "strength" ? LIME : b.kind === "cardio" ? BLUE : VIOLET)} />
            </span>
            {ssLabels[idx] && (
              <span style={{ ...mono, fontSize: fs.micro, fontWeight: 700, color: CHALK, background: INK2, border: `1px solid ${LINE}`, borderRadius: 6, padding: "1px 6px" }}>
                ⛓ {ssLabels[idx]}
              </span>
            )}
            <input
              list="workout-catalog"
              value={b.name}
              onChange={(e) => rename(b.uid, e.target.value)}
              style={{ ...input, ...disp, fontWeight: 700, flex: 1 }}
            />
            {live && prLifts?.includes(b.name) && (
              // A record was set on this lift THIS session — the badge appears
              // the moment the record set banks, and flies into the finish
              // summary's trophy chip when the workout ends.
              <span data-pr-badge={b.name} style={{ ...mono, display: "inline-flex", alignItems: "center", gap: 4, fontSize: fs.micro, fontWeight: 700, color: txt(LIME), background: `color-mix(in srgb, ${LIME} 16%, transparent)`, border: `1px solid ${LIME}`, borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>
                <AuroraIcon name="trophy" size={11} color={txt(LIME)} /> PR
              </span>
            )}
            {isCollapsed(b.uid) && (
              <Mono s={{ fontSize: fs.micro, whiteSpace: "nowrap" }}>{blockSignalSummary(b)}</Mono>
            )}
            {reorder && !isCollapsed(b.uid) && (
              <button aria-label={t("common.duplicate")} onClick={() => duplicate(b.uid)} className="pressable" style={iconBtn(BLUE)}>
                ⧉
              </button>
            )}
            {!isCollapsed(b.uid) && b.kind === "strength" && idx > 0 && blocks[idx - 1]?.kind === "strength" && (
              <button
                onClick={() => supersetWithPrev(b.uid)}
                className="pressable"
                title={t("w.train.blocks.supersetTitle")}
                style={
                  isSupersettedWithPrev(blocks, idx)
                    ? { ...blockBtn(CHALK), padding: "6px 10px" }
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
                className="pressable"
                style={{ ...iconBtn(ASH), transition: "transform .15s", transform: isCollapsed(b.uid) ? "none" : "rotate(180deg)" }}
              >
                ▾
              </button>
            )}
            <button aria-label={t("common.delete")} onClick={() => removeBlock(b.uid)} className="pressable" style={iconBtn(RED)}>
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
              {live ? (
                (() => {
                  // Concept 01 — Glass + ghost add (LIVE only). No set table: the
                  // active set (first un-banked) is a frosted lime HERO card — a
                  // big editable weight, its rep target, one Log button. Banked /
                  // queued sets collapse to quiet rows (click the ✓ / summary to
                  // re-open). The Builder (else branch) keeps its plain grid.
                  const sp = exerciseProfile(b.name).strength;
                  const bw = sp?.loadMode === "bodyweight";
                  const measureLabel = sp?.measure === "time" ? "s" : sp?.measure === "distance" ? "m" : t("w.train.blocks.reps");
                  const planned = !addSetIsNext(b.sets as { done?: boolean }[]);
                  // Weight & reps read at the SAME size and share one baseline, so
                  // "kg" and "reps" sit level (each unit is a <label> — tapping the
                  // text focuses its field). Width tracks the value so the units
                  // hug the number instead of floating on a fixed-width input.
                  const numInput = { ...disp, fontSize: 46, fontWeight: 800, letterSpacing: "-.03em", color: CHALK, background: "transparent", border: "none", outline: "none", padding: 0, width: "2.2ch", textAlign: "center" } as const;
                  const numField = { display: "inline-flex", alignItems: "baseline", gap: 4, cursor: "text", padding: "2px 4px", borderRadius: 12 } as const;
                  const unitLbl = { ...mono, fontSize: fs.body, color: ASH, cursor: "text", userSelect: "none" } as const;
                  const grip = (i: number) => (
                    <span draggable={b.sets.length > 1} onDragStart={() => setDragSet({ uid: b.uid, i })} onDragEnd={() => setDragSet(null)} title={t("w.train.blocks.dragToReorder")} style={{ ...mono, fontSize: fs.body, color: txt(ASH), cursor: b.sets.length > 1 ? "grab" : "default", userSelect: "none", lineHeight: 1 }}>⠿</span>
                  );
                  return b.sets.map((s, i) => {
                    const isDone = !!(s as StrengthSet & { done?: boolean }).done;
                    const focus = setFocus(b.sets as { done?: boolean }[], i);
                    const dragging = dragSet?.uid === b.uid && dragSet.i === i;
                    const isDrop = !!dragSet && dragSet.uid === b.uid && dragSet.i !== i;
                    const st = setType(s);
                    const typeAccent = st === "warmup" ? AMBER : st === "cooldown" ? BLUE : st === "drop" ? LIME : null;
                    if (focus === "active") {
                      return (
                        <SwipeRow key={i} radius={14} margin="4px 0" label={t("common.delete")} onDelete={() => removeSet(b.uid, i)}>
                        <div
                          onDragOver={isDrop ? (e) => e.preventDefault() : undefined}
                          onDrop={isDrop ? (e) => { e.preventDefault(); moveSetTo(b.uid, dragSet!.i, i); setDragSet(null); } : undefined}
                          // FLAT active section — no inner card (the exercise card
                          // is the one surface): the set you're on reads as focus
                          // by SCALE, not by a second border/tint. De-greened: the
                          // only lime left in the loop is the Log CTA itself.
                          style={{ padding: "12px 2px", opacity: dragging ? 0.5 : 1 }}
                        >
                          {/* Label row — grip on the left (matching the recede
                              rows), kicker, planned-rest hint, then the type badge
                              on the right (swipe left to delete). */}
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                            {grip(i)}
                            <span style={{ ...mono, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: txt(ASH) }}>
                              {`${t("workout.setWord")} ${i + 1}${planned ? ` ${t("workout.ofWord")} ${b.sets.length}` : ""} — ${t("workout.upNow")}`}
                            </span>
                            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
                              {restSec != null && (
                                <span style={{ ...mono, fontSize: fs.nano, color: txt(ASH) }}>
                                  {t("w.train.blocks.rest")} {Math.floor(restSec / 60)}:{String(restSec % 60).padStart(2, "0")}
                                </span>
                              )}
                              {/* RPE — a quiet chip, not a permanent field. Tap to
                                  reveal the compact scale below; the value rides on
                                  the chip once set. Hidden entirely in Simple mode. */}
                              {detailed && (() => {
                                const rpeShown = rpeRirSwap(s.rpe ?? "", rirMode);
                                const open = rpeOpenUid === b.uid;
                                return (
                                  <button className="pressable"
                                    onClick={() => setRpeOpenUid((u) => (u === b.uid ? null : b.uid))}
                                    aria-expanded={open}
                                    title={t("w.train.blocks.whatIsRpe")}
                                    style={{ ...mono, fontSize: fs.nano, letterSpacing: ".08em", textTransform: "uppercase", color: txt(rpeShown ? AMBER : ASH), background: rpeShown ? `${AMBER}14` : "transparent", border: `1px solid ${rpeShown ? `${AMBER}66` : LINE}`, borderRadius: 999, padding: "4px 8px", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5 }}
                                  >
                                    {rirMode ? "rir" : "rpe"} <span style={{ color: txt(rpeShown ? AMBER : ASH), fontWeight: 700 }}>{rpeShown || "–"}</span>
                                  </button>
                                );
                              })()}
                              <button className="pressable" onClick={() => cycleType(b.uid, i)} title={`${t(SET_TYPE_TITLE_KEY[st]!)} ${t("w.train.blocks.setTypeTitle")}`} style={{ ...mono, fontSize: 12, fontWeight: 700, color: txt(typeAccent ?? ASH), background: typeAccent ? `${typeAccent}1f` : "transparent", border: `1px solid ${typeAccent ?? LINE}`, borderRadius: 12, padding: "2px 8px", cursor: "pointer" }}>
                                {typeAccent ? setTypeBadge(s, i) : "+"}
                              </button>
                            </div>
                          </div>
                          {/* Numbers centred; kg & reps share one baseline and read at
                              one size. Each unit is a <label> so tapping the text
                              focuses its input (native for-association via wrapping). */}
                          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 2, flexWrap: "wrap" }}>
                            <label style={numField}>
                              <input className="ghost-ph" value={bw ? s.reps : displayLoad(s.load, units)} onChange={(e) => (bw ? updateSet(b.uid, i, "reps", e.target.value) : updateSet(b.uid, i, "load", storeLoad(e.target.value, units)))} placeholder="0" inputMode="decimal" aria-label={bw ? measureLabel : units} style={numInput} />
                              <span style={unitLbl}>{bw ? measureLabel : units}</span>
                            </label>
                            {!bw && (
                              <>
                                <span style={{ ...disp, fontSize: 24, color: ASH, fontWeight: 200, margin: "0 2px" }}>×</span>
                                <label style={numField}>
                                  <input className="ghost-ph" value={s.reps} onChange={(e) => updateSet(b.uid, i, "reps", e.target.value)} placeholder="0" inputMode="numeric" aria-label={measureLabel} style={numInput} />
                                  <span style={unitLbl}>{measureLabel}</span>
                                </label>
                              </>
                            )}
                          </div>
                          {/* RPE — ONE TAP, not another input row: tapping the
                              chip reveals a single row of value pills (the core
                              RPE scale, RIR-labelled when swapped); tapping a
                              pill sets the number and closes. Tap the picked
                              value again to clear it. */}
                          {detailed && rpeOpenUid === b.uid && (
                            <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
                              <button className="pressable" onClick={() => setLoggerPref("rpeAsRir", !rirMode)} title={t("w.train.blocks.whatIsRpe")} style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(ASH), background: "none", border: "none", padding: 0, cursor: "pointer", flex: "none" }}>{rirMode ? "rir" : "rpe"} ⇄</button>
                              {[...RPE_SCALE].reverse().map((step) => {
                                const val = String(step.rpe);
                                const on = (s.rpe ?? "") === val;
                                return (
                                  <button className="pressable"
                                    key={val}
                                    onClick={() => { updateSet(b.uid, i, "rpe", on ? "" : val); setRpeOpenUid(null); }}
                                    aria-pressed={on}
                                    style={{ ...mono, flex: 1, fontSize: fs.caption, fontWeight: on ? 700 : 400, color: on ? CHALK : txt(ASH), background: on ? `${CHALK}1f` : INK2, border: `1px solid ${on ? CHALK : LINE}`, borderRadius: 999, padding: "8px 0", cursor: "pointer" }}
                                  >
                                    {rirMode ? step.rir : val}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {/* NO Log button here. The live logger's primary is
                              DOCKED at the bottom of the screen now — pinned,
                              56px tall, flanked by the pause and finish
                              satellites — so a second one inside the card
                              would be two primaries competing, and the one in
                              the card is the one that travels down the page as
                              the session grows. The dock reads the same shared
                              `nextSetCursor` this card does. */}
                        </div>
                        </SwipeRow>
                      );
                    }
                    const loadPart = !bw && s.load ? `${displayLoad(s.load, units)} ${units}` : "";
                    const repsPart = s.reps ? `${s.reps} ${measureLabel}` : "";
                    const summary = [loadPart, repsPart].filter(Boolean).join(" × ") || "—";
                    return (
                      <SwipeRow key={i} radius={10} margin="0" label={t("common.delete")} onDelete={() => removeSet(b.uid, i)}>
                      <div
                        onDragOver={isDrop ? (e) => e.preventDefault() : undefined}
                        onDrop={isDrop ? (e) => { e.preventDefault(); moveSetTo(b.uid, dragSet!.i, i); setDragSet(null); } : undefined}
                        // Quiet ledger row — a plain hairline-separated line, not
                        // a boxed mini-card (no card-in-card).
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 2px", borderBottom: `1px solid color-mix(in srgb, ${LINE} 60%, transparent)`, opacity: dragging ? 0.4 : focus === "done" ? 0.62 : 0.72 }}
                      >
                        {grip(i)}
                        <span style={{ ...mono, width: 20, fontSize: fs.caption, color: typeAccent ? txt(typeAccent) : ASH }}>{setTypeBadge(s, i)}</span>
                        <button className="pressable" onClick={isDone ? () => onToggleDone?.(b.uid, i, false) : undefined} style={{ ...mono, flex: 1, textAlign: "left", fontSize: fs.caption, color: ASH, background: "none", border: "none", padding: 0, cursor: isDone ? "pointer" : "default" }}>
                          {summary}
                        </button>
                        <span style={{ ...disp, fontWeight: 800, fontSize: fs.caption, color: isDone ? txt(LIME) : ASH }}>{isDone ? "✓" : "○"}</span>
                      </div>
                      </SwipeRow>
                    );
                  });
                })()
              ) : (
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
                    <button className="pressable"
                      onClick={() => setLoggerPref("rpeAsRir", !rirMode)}
                      aria-label={`${rirMode ? "RIR" : "RPE"} — ${t("rpe.rir")}`}
                      style={{ ...mono, fontSize: fs.nano, textTransform: "uppercase", color: txt(ASH), background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left" }}
                    >
                      {rirMode ? "rir" : "rpe"} ⇄
                    </button>
                    <button className="pressable"
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
                const active = focus === "active";
                return (
                // ACTIVE — the set you're on lifts onto a titled frosted panel: a
                // lime "up now" kicker, a soft lime tint + hairline, and a drop
                // shadow for depth. The wrapper is `display:contents` when not
                // active so the recede rows are laid out exactly as before. No
                // horizontal padding, so the cells stay in column with the header.
                <div
                  key={i}
                  style={
                    active
                      ? { borderRadius: 16, paddingBlock: 8, margin: "8px 0", background: `${LIME}0d`, border: `1px solid ${LIME}38`, boxShadow: "0 12px 26px -16px rgba(0,0,0,.7)" }
                      : { display: "contents" }
                  }
                >
                {active && (
                  <div style={{ ...mono, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: txt(LIME), padding: "0 0 8px 2px" }}>
                    {t("w.train.blocks.upNow")}
                  </div>
                )}
                <div
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
                    marginBottom: active ? 0 : 6,
                    alignItems: "center",
                    opacity: dragging ? 0.5 : focus === "done" ? 0.42 : focus === "upcoming" ? 0.5 : 1,
                  }}
                >
                  {(() => {
                    const st = setType(s);
                    const accent = st === "warmup" ? AMBER : st === "cooldown" ? BLUE : st === "drop" ? LIME : null;
                    return (
                      <button
                        onClick={() => cycleType(b.uid, i)}
                        className="pressable"
                        title={`${t(SET_TYPE_TITLE_KEY[st]!)} ${t("w.train.blocks.setTypeTitle")}`}
                        style={{
                          ...mono,
                          fontSize: 12,
                          fontWeight: 700,
                          color: txt(accent ?? ASH),
                          background: accent ? `${accent}1f` : "transparent",
                          border: `1px solid ${accent ?? LINE}`,
                          borderRadius: 12,
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
                  <button onClick={() => removeSet(b.uid, i)} className="pressable" style={{ ...iconBtn(ASH), padding: 0 }}>
                    −
                  </button>
                  {/* LIVE: ✓ to bank the set — starts the rest timer (parent). */}
                  {live && (() => {
                    const isDone = !!(s as StrengthSet & { done?: boolean }).done;
                    return (
                      <button className="pressable"
                        onClick={() => onToggleDone?.(b.uid, i, !isDone)}
                        title={t("workout.tapAsYouGo")}
                        style={{
                          ...cond,
                          width: 40,
                          height: 34,
                          borderRadius: 12,
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
                </div>
                );
              })}
              </div>
              </div>
              )}
              {/* Add-set control: "+ Add set" wears the ghost/dashed add
                  affordance (one-accent rule — the screen's single lime fill
                  belongs to the primary Save/Finish action, not a repeated
                  per-card control), with warm-up / ramp / cool-down / drop
                  tucked into a compact "Special ▾" menu. The set badge still
                  re-types a set with a tap, so the menu is just for ADDING. */}
              <div style={{ display: "flex", gap: space.xs, alignItems: "stretch", position: "relative" }}>
                {/* "+ Add set" is a split glass tile: the wide zone quick-adds one
                    carry-over set (the incremental lifter's tap loop), the ⋯ zone
                    opens the plan-ahead panel to queue several at once. When nothing
                    is queued below, it wears the prominent lime tint (it's the next
                    move); otherwise a quiet card so the queue keeps the focus. */}
                {(() => {
                  // "Next move" emphasis is a brighter hairline + bold text — not
                  // another lime fill (de-greened; the Log CTA keeps lime).
                  const ghost = live && addSetIsNext(b.sets as { done?: boolean }[]);
                  return (
                    live ? (
                      /* It GROWS the list in place, so per the kit's grammar it
                         is a BARE plus with no chrome at all. It used to be a
                         RINGED plus inside a filled, bordered, rounded box at
                         the end of a list — which is the mark for something
                         that LEAVES. Mobile made the same move. */
                      <button className="pressable"
                        onClick={() => addSet(b.uid)}
                        style={{ ...disp, display: "inline-flex", alignItems: "center", gap: 9, fontWeight: 700, fontSize: fs.body, color: ghost ? txt(CHALK) : txt(ASH), background: "transparent", border: "none", padding: "12px 2px", cursor: "pointer" }}
                      >
                        <span style={{ ...mono, fontSize: 16, lineHeight: 1 }}>＋</span>
                        {t("w.train.blocks.addSet")}
                      </button>
                    ) : (
                    <div style={{ flex: 1, display: "flex", alignItems: "stretch", borderRadius: 16, overflow: "hidden", background: INK2, border: `1px solid ${ghost ? `${CHALK}59` : LINE}` }}>
                      <button className="pressable"
                        onClick={() => addSet(b.uid)}
                        style={{ ...disp, flex: 1, display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8, fontWeight: 700, fontSize: fs.caption, color: txt(CHALK), background: "transparent", border: "none", padding: "12px 16px", cursor: "pointer" }}
                      >
                        <span style={{ width: 20, height: 20, borderRadius: 999, border: `1.5px solid ${ghost ? CHALK : ASH}`, color: ghost ? txt(CHALK) : txt(ASH), display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 15, lineHeight: 0 }}>+</span>
                        {t("w.train.blocks.addSet")}
                      </button>
                      <button className="pressable"
                        onClick={() => { setPlanUid((u) => (u === b.uid ? null : b.uid)); setSpecialUid(null); }}
                        title={t("w.train.blocks.presetsTitle")}
                        aria-label={t("w.train.blocks.presetsTitle")}
                        style={{ ...mono, padding: "0 12px", color: txt(ASH), background: "transparent", border: "none", borderLeft: `1px solid ${ghost ? `${CHALK}40` : LINE}`, cursor: "pointer", fontSize: fs.body, letterSpacing: "1px" }}
                      >
                        ⋯
                      </button>
                    </div>
                    )
                  );
                })()}
                {/* Special = glyph only (the ⚡). Opens the special-set menu. */}
                <button className="pressable"
                  onClick={() => { setSpecialUid((u) => (u === b.uid ? null : b.uid)); setPlanUid(null); }}
                  title={t("w.train.blocks.special")}
                  aria-label={t("w.train.blocks.special")}
                  style={{ color: txt(AMBER), background: INK2, border: `1px solid ${LINE}`, borderRadius: 16, width: 50, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  <AuroraIcon name="bolt" size={18} />
                </button>
                {/* Popular-preset popover — a single horizontal rail replaces the
                    old nested grid + manual planner. The rail bleeds to the
                    popover's padding (negative margin = pad, matching inner
                    padding) so cards slide under the edge; one tap lays out the
                    whole exercise. */}
                {planUid === b.uid && (
                  <>
                    <div onClick={() => setPlanUid(null)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                    <div style={{ position: "absolute", top: 52, left: 0, zIndex: 31, width: 300, background: "var(--color-card)", border: `1px solid ${LINE}`, borderRadius: 16, padding: 16, boxShadow: "0 22px 50px -20px rgba(0,0,0,.85)" }}>
                      <div style={{ ...mono, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: txt(ASH), marginBottom: 12 }}>{t("w.train.blocks.presetsTitle")}</div>
                      <div style={{ display: "flex", gap: 10, overflowX: "auto", margin: "0 -16px", padding: "0 16px 2px", scrollbarWidth: "none" }}>
                        {([
                          { sets: 3, reps: 3, k: "schemeHeavy" },
                          { sets: 5, reps: 5, k: "schemeStrength" },
                          { sets: 3, reps: 12, k: "schemeHypertrophy" },
                          { sets: 4, reps: 8, k: "schemeVolume" },
                          { sets: 10, reps: 10, k: "schemeGvt" },
                        ] as const).map((p, pi) => (
                          <button className="pressable"
                            key={p.k}
                            onClick={() => { applyPreset(b.uid, p.sets, p.reps); setPlanUid(null); }}
                            style={{ flex: "0 0 auto", width: 118, textAlign: "left", background: INK2, border: `1px solid ${pi === 0 ? `${CHALK}4d` : LINE}`, borderRadius: 16, padding: "16px 16px", cursor: "pointer" }}
                          >
                            <div style={{ ...disp, fontSize: 28, fontWeight: 900, letterSpacing: "-.03em", color: CHALK, lineHeight: 1 }}>{p.sets}<span style={{ color: ASH, fontWeight: 400, fontSize: 19 }}>×</span>{p.reps}</div>
                            <div style={{ ...mono, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: txt(ASH), marginTop: 8 }}>{t(`w.train.blocks.${p.k}`)}</div>
                            <div style={{ ...mono, fontSize: fs.nano, color: txt(ASH), marginTop: 10 }}>{p.sets * p.reps} {t("w.train.blocks.presetReps")}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
                {specialUid === b.uid && (
                  <>
                    {/* click-away catcher */}
                    <div onClick={() => setSpecialUid(null)} style={{ position: "fixed", inset: 0, zIndex: 30 }} />
                    <div style={{ position: "absolute", top: 52, right: 0, zIndex: 31, minWidth: 230, background: "var(--color-card)", border: `1px solid ${LINE}`, borderRadius: 16, padding: 6, boxShadow: "0 22px 50px -20px rgba(0,0,0,.85)" }}>
                      {[
                        { run: addWarmupSet, c: AMBER, badge: "W", label: "warmupSet", desc: "warmupTitle" },
                        { run: addWarmupRamp, c: AMBER, badge: "↗", label: "rampSet", desc: "rampTitle" },
                        { run: addCooldownSet, c: BLUE, badge: "C", label: "cooldownSet", desc: "cooldownTitle" },
                        { run: addDropSet, c: LIME, badge: "↓", label: "dropSet", desc: "dropTitle" },
                      ].map((it) => (
                        <button className="pressable"
                          key={it.label}
                          onClick={() => { it.run(b.uid); setSpecialUid(null); }}
                          style={{ display: "flex", width: "100%", alignItems: "flex-start", gap: 10, background: "none", border: "none", cursor: "pointer", padding: "10px 12px", borderRadius: 12, textAlign: "left" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = INK2)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
                        >
                          <span style={{ ...mono, flex: "0 0 auto", width: 22, height: 22, borderRadius: 12, display: "grid", placeItems: "center", fontSize: 12, fontWeight: 700, color: txt(it.c), background: `${it.c}29` }}>{it.badge}</span>
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
                  <button aria-label={t("common.decrease")} onClick={() => bumpRest(b.uid, -15)} className="pressable" style={iconBtn(ASH)}>−</button>
                  <Mono s={{ fontSize: fs.body, fontWeight: 700, minWidth: 44, textAlign: "center" }} c={CHALK}>
                    {b.restSec ?? DEFAULT_REST_SEC} s
                  </Mono>
                  <button aria-label={t("common.increase")} onClick={() => bumpRest(b.uid, 15)} className="pressable" style={iconBtn(LIME)}>+</button>
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
              {/* Live exercise summary — sets banked, tonnage, top set (and mean
                  bar speed once entered). Click to open the exercise sheet with
                  per-set m/s entry. */}
              {live && (() => {
                const ls = exerciseLiveStats(b.name, b.sets as (StrengthSet & { done?: boolean })[], bodyweightKg);
                const parts = [
                  `${ls.setsDone}/${ls.setsTotal} ${t("workout.setsWord")}`,
                  ...(ls.volumeKg > 0 ? [fmtTonnage(ls.volumeKg, units)] : []),
                  ...(ls.topKg > 0 ? [`${t("workout.topWord")} ${displayLoad(String(ls.topKg), units)} ${units}${ls.topReps ? ` × ${ls.topReps}` : ""}`] : []),
                  ...(ls.meanVel != null ? [`${t("workout.meanWord")} ${ls.meanVel} m/s`] : []),
                ];
                return (
                  <button className="pressable"
                    onClick={() => setSheetUid(b.uid)}
                    aria-label={t("workout.exDetail")}
                    style={{ ...mono, width: "100%", display: "flex", alignItems: "center", gap: 8, marginTop: 12, padding: "12px 2px 0", borderTop: `1px solid color-mix(in srgb, ${LINE} 70%, transparent)`, borderLeft: "none", borderRight: "none", borderBottom: "none", background: "none", cursor: "pointer", textAlign: "left" }}
                  >
                    <span style={{ flex: 1, fontSize: fs.caption, color: txt(ASH), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{parts.join(" – ")}</span>
                    <span style={{ ...disp, fontSize: fs.body, fontWeight: 600, color: txt(ASH), flex: "none" }}>›</span>
                  </button>
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

      {/* LIVE: exercise detail sheet — per-set pills, live totals, and per-set
          bar-speed (m/s) entry with a set-by-set velocity strip (manual VBT;
          live sensor capture is the blocked vbt-capture capability). */}
      {live && (() => {
        const sb = blocks.find((x) => x.uid === sheetUid);
        const strength = sb && sb.kind === "strength" ? sb : null;
        return (
          <ExerciseDetailSheet
            b={strength}
            last={strength ? lastByLift?.get(strength.name) : undefined}
            units={units}
            bodyweightKg={bodyweightKg}
            onVel={(u, i, v) => updateSet(u, i, "vel", v)}
            onClose={() => setSheetUid(null)}
          />
        );
      })()}

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

      <div style={{ display: "flex", gap: space.sm, marginTop: 4, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={addStrength} className="pressable" style={blockBtn(LIME)}>
          {t("w.train.blocks.addStrength")}
        </button>
        <button onClick={addCardio} className="pressable" style={blockBtn(BLUE)}>
          {t("w.train.blocks.addCardio")}
        </button>
        <button onClick={() => setSportPicker((v) => !v)} className="pressable" style={blockBtn(BLUE)}>
          {t("w.train.blocks.addExercise")}
        </button>
        <button onClick={addConditioning} className="pressable" style={blockBtn(VIOLET)}>
          {t("w.train.blocks.addConditioning")}
        </button>
        <button onClick={() => setRpeHelp((v) => !v)} className="pressable" style={blockBtn(ASH)}>
          {t("w.train.blocks.whatsRpe")}
        </button>
      </div>
    </div>
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

  // The row tile carries the lift's DRAWN demo once it exists, and until then
  // its IMPLEMENT (core: exercise-marks) — a barbell, a pair of bells, a cable
  // handle. Sports keep their catalog glyph.
  const tileBox = { width: 38, height: 38, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: "var(--color-ink)", border: `1px solid ${LINE}`, overflow: "hidden" } as const;
  const tile = (e: { icon?: string; name: string; kind: SessionBlock["kind"] }) => (
    <span style={tileBox}>
      {e.icon
        ? <span style={{ fontSize: 16 }}>{e.icon}</span>
        : <AuroraExerciseMedia name={e.name} variant="thumb" size={24} tint={txt(kindColor(e.kind))} />}
    </span>
  );
  // A ROOM is a muscle group, not a lift — its mark is the BODY it trains, lit
  // from the room's own exercise list (core: roomBodyMark). Sports rooms keep
  // their catalog glyph; a room the DB can't read falls back to its initials.
  const roomTile = (r: { icon?: string; label: string; kind: SessionBlock["kind"]; names: string[] }) => (
    <span style={tileBox}>
      {r.icon
        ? <span style={{ fontSize: 16 }}>{r.icon}</span>
        : roomBodyMark(r.names)
          ? <AuroraBodyMark names={r.names} size={32} color={txt(kindColor(r.kind))} silhouette={LINE} />
          : <span style={{ ...mono, fontWeight: 700, fontSize: 12, letterSpacing: "-.02em", color: txt(kindColor(r.kind)) }}>{initials(r.label)}</span>}
    </span>
  );
  const row = (e: Entry, last: boolean) => {
    const hint = shapeHint(e.name, e.kind);
    return (
      <button className="pressable" key={e.name} type="button" onClick={() => onPick(e.name, e.kind)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "8px 0", cursor: "pointer", textAlign: "left", border: 0, borderBottom: last ? "none" : `1px solid ${LINE}`, background: "transparent", color: CHALK }}>
        {tile(e)}
        <span style={{ ...disp, flex: 1, minWidth: 0, fontWeight: 600, fontSize: fs.body, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.name}</span>
        {!!hint && <span style={{ ...mono, fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: ASH, flex: "none" }}>{hint}</span>}
      </button>
    );
  };
  const slab = (entries: Entry[]) => (
    <div style={{ background: INK2, border: `1px solid ${LINE}`, borderRadius: 16, padding: "2px 12px" }}>
      {entries.map((e, i) => row(e, i === entries.length - 1))}
    </div>
  );
  // Explore-standard section head — bold display title, mono count at the baseline.
  const head = (label: string, count: number) => (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "16px 2px 8px" }}>
      <span style={{ ...disp, fontWeight: 800, fontSize: 16, color: CHALK }}>{label}</span>
      <span style={{ ...mono, fontSize: 11, letterSpacing: ".12em", color: ASH }}>{count}</span>
    </div>
  );
  const customAdd = q.length > 0 && !exact && (
    <button className="pressable" type="button" onClick={() => onPick(query.trim(), inferBlockKind(query.trim()))} style={{ ...disp, display: "block", width: "100%", marginTop: 16, textAlign: "center", fontWeight: 800, fontSize: fs.body, background: LIME, color: "var(--on-accent)", border: 0, borderRadius: 999, padding: "12px", cursor: "pointer" }}>
      + “{query.trim()}”
    </button>
  );

  return (
    <div role="presentation" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(0,0,0,.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-label={t("w.home.quickSport.choose")}
        onClick={(e) => e.stopPropagation()}
        style={{ width: "100%", maxWidth: 460, height: "78vh", display: "flex", flexDirection: "column", background: "var(--color-ink)", border: `1px solid ${LINE}`, borderRadius: 28, boxShadow: "0 24px 60px -20px rgba(0,0,0,.8)", overflow: "hidden" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: `1px solid ${LINE}`, flex: "none" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={ASH} strokeWidth="2" strokeLinecap="round" aria-hidden>
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
          </svg>
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("w.train.blocks.searchExercise")} style={{ ...disp, flex: 1, minWidth: 0, background: "none", border: 0, outline: "none", color: CHALK, fontSize: fs.body }} />
          <button aria-label={t("common.close")} onClick={onClose} className="pressable" style={{ ...iconBtn(ASH), width: 26, height: 26 }}>✕</button>
        </div>

        {/* VIEW TOGGLE — Groups (rooms drill-down) ⇄ A–Z (the typeset index).
            Hidden while searching: results are one flat list either way. */}
        {!q && (
          <div style={{ display: "flex", gap: 8, padding: "12px 15px 0", flex: "none" }}>
            {([{ id: "groups" as const, label: t("w.analyze.ex.sortGroups") }, { id: "az" as const, label: t("w.analyze.ex.sortAz") }]).map((p) => {
              const on = view === p.id;
              return (
                <button className="pressable" key={p.id} type="button" onClick={() => { setView(p.id); setRoom(null); }} aria-pressed={on}
                  style={{ ...mono, fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", fontWeight: on ? 700 : 400, color: on ? "var(--on-accent)" : ASH, background: on ? LIME : "transparent", border: `1px solid ${on ? LIME : LINE}`, borderRadius: 999, padding: "8px 16px", cursor: "pointer" }}>
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
                  <div style={{ ...disp, fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", color: ASH, margin: "16px 2px 6px" }}>{sec.letter}</div>
                  {slab(sec.entries)}
                </div>
              ))
            ) : roomData ? (
              /* ONE ROOM — crumb back + the room's movements only. */
              <>
                <button className="pressable" type="button" onClick={() => setRoom(null)} style={{ ...mono, fontSize: fs.caption, color: ASH, background: "none", border: 0, cursor: "pointer", padding: 0, margin: "10px 2px 0" }}>← {t("w.train.picker.all")}</button>
                {head(roomData.label, roomData.entries.length)}
                {slab(roomData.entries)}
              </>
            ) : (
              /* ROOMS — the pattern grid; two taps, never a giant scroll. */
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
                {rooms.map((r) => (
                  <button className="pressable" key={r.key} type="button" onClick={() => setRoom(r.key)} style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 8, background: INK2, border: `1px solid ${LINE}`, borderRadius: 16, padding: "12px 12px", cursor: "pointer", color: CHALK, textAlign: "left" }}>
                    {roomTile({ icon: r.icon, label: r.label, kind: r.entries[0]!.kind, names: r.entries.map((e) => e.name) })}
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
                <button className="pressable" key={sec.letter} type="button" aria-label={sec.letter} onClick={() => document.getElementById(`xpk-${sec.letter}`)?.scrollIntoView({ block: "start" })}
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
      <Mono s={{ fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", display: "block" }}>{label}</Mono>
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

/**
 * Exercise detail sheet — opened by clicking an exercise's live summary bar.
 * Flat totals (no boxed cells), then ONE velocity module: a bar chart that IS
 * the set selector — each set's m/s value rides above its bar, the selected
 * column's value is the editable input, set numbers sit under a shared
 * baseline. "m/s" appears exactly once (the module header, with the mean).
 * Twin of the mobile logger's ExerciseSheet.
 */
function ExerciseDetailSheet({
  b,
  last,
  units,
  bodyweightKg,
  onVel,
  onClose,
}: {
  b: Extract<EditableBlock, { kind: "strength" }> | null;
  last?: string;
  units: WeightUnit;
  bodyweightKg?: number | null;
  onVel: (uid: string, i: number, v: string) => void;
  onClose: () => void;
}) {
  const { t } = useLang();
  const [sel, setSel] = useState(0);
  // Re-anchor the selection to the active (first un-banked) set whenever the
  // sheet opens for a different exercise.
  const anchored = useRef<string | null>(null);
  useEffect(() => {
    if (!b) {
      anchored.current = null;
      return;
    }
    if (anchored.current === b.uid) return;
    anchored.current = b.uid;
    const sets = b.sets as (StrengthSet & { done?: boolean })[];
    const active = sets.findIndex((s) => !s.done);
    setSel(active >= 0 ? active : Math.max(0, sets.length - 1));
  }, [b]);

  const body = b
    ? (() => {
        const sets = b.sets as (StrengthSet & { done?: boolean })[];
        const ls = exerciseLiveStats(b.name, sets, bodyweightKg);
        const i = Math.min(sel, sets.length - 1);
        const s = sets[i]!;
        const known = ls.vels.filter((v): v is number => v != null);
        const maxVel = known.length ? Math.max(...known) : 0;
        const loadPart = s.load.trim() ? `${displayLoad(s.load, units)} ${units}` : "";
        const setLine = [loadPart, s.reps.trim()].filter(Boolean).join(" × ") || "–";
        return (
          <div style={{ marginTop: 16 }}>
            {/* Flat totals — big number over a small mono label, no boxes. */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "16px 36px" }}>
              <div>
                <div style={{ ...disp, fontSize: 26, fontWeight: 900, letterSpacing: "-.02em", color: CHALK }}>{fmtTonnage(ls.volumeKg, units)}</div>
                <div style={{ ...mono, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: txt(ASH), marginTop: 3 }}>{t("workout.totalVolume")}</div>
              </div>
              <div>
                <div style={{ ...disp, fontSize: 26, fontWeight: 900, letterSpacing: "-.02em", color: CHALK }}>{setLine}</div>
                <div style={{ ...mono, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: txt(ASH), marginTop: 3 }}>{`${t("workout.setWord")} ${i + 1}`}</div>
              </div>
            </div>

            {/* ONE velocity module — the unit is named once, with the mean. */}
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "24px 0 12px" }}>
              <span style={{ ...mono, fontSize: fs.nano, letterSpacing: ".12em", textTransform: "uppercase", color: txt(ASH) }}>{`${t("workout.barSpeed")} (m/s)`}</span>
              {ls.meanVel != null && (
                <span style={{ ...mono, fontSize: 11, color: CHALK }}>{`${t("workout.meanWord")} ${ls.meanVel}`}</span>
              )}
            </div>
            {/* The chart IS the selector: each set is a column — value above its
                bar (the selected one is the editable input), bars share a
                baseline, set numbers underneath. */}
            <div style={{ display: "flex", gap: 10, alignItems: "flex-end", borderBottom: `1px solid color-mix(in srgb, ${LINE} 90%, transparent)` }}>
              {sets.map((st, j) => {
                const v = ls.vels[j];
                const on = j === i;
                const h = v != null && maxVel > 0 ? Math.max(12, Math.round((v / maxVel) * 56)) : 3;
                return (
                  <div key={j} onClick={() => setSel(j)} role="button" aria-pressed={on} aria-label={`${t("workout.setWord")} ${j + 1}`} style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", cursor: "pointer" }}>
                    {on ? (
                      <input
                        className="ghost-ph"
                        value={s.vel ?? ""}
                        onChange={(e) => onVel(b.uid, i, e.target.value)}
                        placeholder="0.00"
                        inputMode="decimal"
                        autoFocus
                        style={{ ...mono, fontSize: 13, fontWeight: 700, color: CHALK, textAlign: "center", width: 52, maxWidth: "100%", background: "none", border: "none", borderBottom: `1px solid ${CHALK}8c`, borderRadius: 0, outline: "none", padding: "0 0 2px", marginBottom: 6 }}
                      />
                    ) : (
                      <span style={{ ...mono, fontSize: 11, color: v != null ? CHALK : txt(ASH), marginBottom: 8 }}>{v != null ? String(v) : "–"}</span>
                    )}
                    <div style={{ alignSelf: "stretch", margin: "0 10px", height: h, borderRadius: "3px 3px 0 0", background: on ? LIME : v != null ? `${CHALK}66` : LINE }} />
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              {sets.map((st, j) => (
                <button className="pressable" key={j} onClick={() => setSel(j)} style={{ ...mono, flex: 1, textAlign: "center", fontSize: fs.nano, color: j === i ? CHALK : txt(ASH), background: "none", border: "none", padding: 0, cursor: "pointer" }}>
                  {`${j + 1}${st.done ? " ✓" : ""}`}
                </button>
              ))}
            </div>

            <div style={{ ...mono, fontSize: fs.micro, color: txt(ASH), lineHeight: 1.5, marginTop: 16 }}>{t("workout.velHint")}</div>
          </div>
        );
      })()
    : null;

  return (
    <Sheet open={!!b} onClose={onClose} title={b?.name} sub={last ? `${t("workout.lastTime")} – ${last}` : undefined} label={t("workout.exDetail")}>
      {body}
    </Sheet>
  );
}

// The RPE cheatsheet — the same scale (from @hybrid/core) the mobile logger shows.
function RpeHelp({ onClose }: { onClose: () => void }) {
  const { t } = useLang();
  return (
    <Card style={{ borderLeft: `3px solid ${LIME}`, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={LIME}>
          {t("w.train.blocks.rpeHelpTitle")}
        </Mono>
        <button aria-label={t("common.close")} onClick={onClose} className="pressable" style={{ ...iconBtn(ASH), width: 26, height: 26 }}>✕</button>
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
