import { useEffect, useState } from "react";
import {
  inferBlockKind,
  cycleSetType,
  moveItemTo,
  warmupRamp,
  DEFAULT_REST_SEC,
  type SessionBlock,
  type StrengthSet,
  type BlockKind,
} from "@hybrid/core";
import { fetchRoutines, createRoutine, deleteRoutine, type Routine } from "./api";
import { useLang } from "./i18n";

const uid = () => Math.random().toString(36).slice(2);

/** An editable routine block — the REAL SessionBlock shape plus a list key, so
 *  the Builder prescribes per-set (load × reps × effort each) instead of the
 *  old flattened "N sets of R" summary. What you save is what the logger runs. */
export type EditableBlock = SessionBlock & { uid: string };

const emptySet = (): StrengthSet => ({ load: "", reps: "8" });

export const newBlock = (name: string, kind: BlockKind = inferBlockKind(name)): EditableBlock => {
  if (kind === "strength")
    return { uid: uid(), kind: "strength", name, sets: [emptySet(), emptySet(), emptySet()] };
  if (kind === "cardio") return { uid: uid(), kind: "cardio", name };
  return { uid: uid(), kind: "conditioning", name };
};

// Deep-copy stored blocks into editable state (JSON round-trip — blocks are
// plain persisted data, and Hermes' structuredClone isn't guaranteed).
const cloneBlock = (b: SessionBlock): EditableBlock => ({ ...(JSON.parse(JSON.stringify(b)) as SessionBlock), uid: uid() });

/** Shared routine-builder state + persistence for the mobile Builder — full
 *  per-set editing over the same /api/templates persistence as the web twin. */
export function useRoutineBuilder() {
  const { t } = useLang();
  const [name, setName] = useState("New routine");
  const [items, setItems] = useState<EditableBlock[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = () => fetchRoutines().then(setRoutines).catch(() => {});
  useEffect(() => { load(); }, []);

  const patch = (u: string, fn: (b: EditableBlock) => EditableBlock) =>
    setItems((xs) => xs.map((x) => (x.uid === u ? fn(x) : x)));

  const addExercise = (exName: string, kind?: BlockKind) => {
    const clean = exName.trim();
    if (!clean) return;
    setItems((xs) => [...xs, newBlock(clean, kind)]);
  };
  const removeItem = (u: string) => setItems((xs) => xs.filter((x) => x.uid !== u));
  // Drop reorder (hold the grip handle and drag): move a block to any index.
  const moveBlockTo = (from: number, to: number) => setItems((xs) => moveItemTo(xs, from, to));

  // ----- strength: per-set control -----
  const updateSet = (u: string, i: number, key: keyof StrengthSet, val: string) =>
    patch(u, (b) =>
      b.kind === "strength"
        ? { ...b, sets: b.sets.map((s, j) => (j === i ? ({ ...s, [key]: val } as StrengthSet) : s)) }
        : b,
    );
  // New set carries the previous set's load/reps forward (same behaviour as the
  // live logger's carry-over) so a straight-sets scheme is one tap per set.
  const addSet = (u: string) =>
    patch(u, (b) => {
      if (b.kind !== "strength") return b;
      const last = b.sets[b.sets.length - 1];
      return { ...b, sets: [...b.sets, { load: last?.load ?? "", reps: last?.reps ?? "8" }] };
    });
  const removeSet = (u: string, i: number) =>
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: b.sets.filter((_, j) => j !== i) } : b));
  // Drag a set row to any position within its block (grip handle).
  const moveSet = (u: string, from: number, to: number) =>
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: moveItemTo(b.sets, from, to) } : b));
  // Special set adds — same semantics as the live logger / web editor: warm-up
  // and cool-down sets are excluded from working volume/PRs, drop sets are a
  // lighter no-rest continuation, and the ramp prepends ~40/60/80% steps up to
  // the block's heaviest working load.
  const addWarmupSet = (u: string) =>
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: [...b.sets, { load: "", reps: "", role: "warmup" }] } : b));
  const addCooldownSet = (u: string) =>
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: [...b.sets, { load: "", reps: "", role: "cooldown" }] } : b));
  const addDropSet = (u: string) =>
    patch(u, (b) => (b.kind === "strength" ? { ...b, sets: [...b.sets, { load: "", reps: "", drop: true }] } : b));
  const addWarmupRamp = (u: string) =>
    patch(u, (b) => {
      if (b.kind !== "strength") return b;
      const workingMax = Math.max(
        0,
        ...b.sets.filter((s) => s.role !== "warmup" && s.role !== "cooldown").map((s) => parseFloat(s.load)).filter((n) => Number.isFinite(n)),
      );
      const ramp = warmupRamp(workingMax);
      if (!ramp.length) return b;
      const rampSets: StrengthSet[] = ramp.map((step) => ({ load: String(step.load), reps: String(step.reps), role: "warmup" }));
      return { ...b, sets: [...rampSets, ...b.sets] };
    });
  // Tap the set badge to cycle its role: working → warm-up → cool-down → drop.
  const cycleType = (u: string, i: number) =>
    patch(u, (b) =>
      b.kind === "strength" ? { ...b, sets: b.sets.map((s, j) => (j === i ? cycleSetType(s) : s)) } : b,
    );
  // Planned rest between working sets, 15 s steps (a prescription — the live
  // logger measures actual rest separately).
  const bumpRest = (u: string, delta: number) =>
    patch(u, (b) =>
      b.kind === "strength"
        ? { ...b, restSec: Math.min(600, Math.max(15, (b.restSec ?? DEFAULT_REST_SEC) + delta)) }
        : b,
    );

  // ----- cardio / conditioning fields -----
  const setField = (u: string, key: string, val: string | number | undefined) =>
    patch(u, (b) => ({ ...b, [key]: val }) as EditableBlock);

  const loadRoutine = (r: Routine) => {
    setName(r.name);
    setItems(r.blocks.map(cloneBlock));
    setMsg(null);
  };

  const save = async () => {
    if (!items.length) return;
    setSaving(true);
    setMsg(null);
    const blocks = items.map(({ uid: _u, ...b }) => b as SessionBlock);
    const res = await createRoutine(name.trim() || "Routine", blocks);
    setSaving(false);
    if (res.ok) {
      setMsg({ text: t("w.train.builder.templateSaved"), ok: true });
      await load();
      return;
    }
    // 403 = the free template limit (a stale count let the save button show) —
    // reloading the routines flips the Builder's gate to the upsell card, so
    // no error message is needed here.
    if (res.status === 403) {
      await load();
      return;
    }
    setMsg({
      text:
        res.status === 401
          ? t("w.train.builder.signInSave")
          : res.status === null
            ? t("w.train.builder.networkError")
            : `${t("w.train.builder.saveErrorPrefix")}${res.status}${t("w.train.builder.saveErrorSuffix")}`,
      ok: false,
    });
  };

  const remove = async (id: string) => {
    await deleteRoutine(id);
    await load();
  };

  return {
    name, setName, items, routines, saving, msg,
    addExercise, removeItem, moveBlockTo,
    updateSet, addSet, removeSet, moveSet, cycleType, bumpRest, setField,
    addWarmupSet, addCooldownSet, addDropSet, addWarmupRamp,
    loadRoutine, save, remove,
  };
}
