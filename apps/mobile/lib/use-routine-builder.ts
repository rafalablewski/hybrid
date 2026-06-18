import { useEffect, useState } from "react";
import { inferBlockKind, type SessionBlock } from "@hybrid/core";
import { fetchRoutines, createRoutine, deleteRoutine, type Routine } from "./api";

const uid = () => Math.random().toString(36).slice(2);

export type BuilderKind = "strength" | "cardio" | "conditioning";

/** An editable routine exercise — a target prescription (not a live log). */
export type BuilderItem = {
  uid: string;
  name: string;
  kind: BuilderKind;
  sets: number;
  reps: string;
  load: string;
  minutes: string;
  distance: string;
};

export const newBuilderItem = (name: string, kind: BuilderKind = inferBlockKind(name) as BuilderKind): BuilderItem => ({
  uid: uid(),
  name,
  kind,
  sets: 3,
  reps: "8",
  load: "",
  minutes: "",
  distance: "",
});

const itemsFromBlocks = (blocks: SessionBlock[]): BuilderItem[] =>
  blocks.map((b) =>
    b.kind === "strength"
      ? {
          uid: uid(),
          name: b.name,
          kind: "strength" as const,
          sets: Math.max(1, b.sets.length || 3),
          reps: String(b.sets[0]?.reps ?? "8"),
          load: String(b.sets[0]?.load ?? ""),
          minutes: "",
          distance: "",
        }
      : {
          uid: uid(),
          name: b.name,
          kind: b.kind,
          sets: 3,
          reps: "8",
          load: "",
          minutes: b.minutes != null ? String(b.minutes) : "",
          distance: b.kind === "cardio" && b.distance != null ? String(b.distance) : "",
        },
  );

const buildBlocks = (items: BuilderItem[]): SessionBlock[] => {
  const blocks: SessionBlock[] = [];
  for (const x of items) {
    if (x.kind === "strength") {
      const n = Math.max(1, x.sets);
      const set = { load: x.load.trim(), reps: x.reps.trim() || "8" };
      blocks.push({ kind: "strength", name: x.name, sets: Array.from({ length: n }, () => ({ ...set })) });
    } else if (x.kind === "cardio") {
      const distance = parseFloat(x.distance);
      const minutes = parseFloat(x.minutes);
      blocks.push({
        kind: "cardio",
        name: x.name,
        ...(Number.isFinite(distance) ? { distance } : {}),
        ...(Number.isFinite(minutes) ? { minutes } : {}),
      });
    } else {
      const minutes = parseFloat(x.minutes);
      blocks.push({ kind: "conditioning", name: x.name, ...(Number.isFinite(minutes) ? { minutes } : {}) });
    }
  }
  return blocks;
};

/** Shared routine-builder state + persistence, used by both the classic and the
 *  Aurora mobile Builder so the two variants stay behaviourally identical. */
export function useRoutineBuilder() {
  const [name, setName] = useState("New routine");
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);

  const load = () => fetchRoutines().then(setRoutines).catch(() => {});
  useEffect(() => { load(); }, []);

  const addExercise = (exName: string, kind?: BuilderKind) => {
    const clean = exName.trim();
    if (!clean) return;
    setItems((xs) => [...xs, newBuilderItem(clean, kind)]);
  };
  const removeItem = (u: string) => setItems((xs) => xs.filter((x) => x.uid !== u));
  const patchItem = (u: string, patch: Partial<BuilderItem>) =>
    setItems((xs) => xs.map((x) => (x.uid === u ? { ...x, ...patch } : x)));
  const bumpSets = (u: string, delta: number) =>
    setItems((xs) => xs.map((x) => (x.uid === u ? { ...x, sets: Math.max(1, x.sets + delta) } : x)));

  const loadRoutine = (r: Routine) => {
    setName(r.name);
    setItems(itemsFromBlocks(r.blocks));
    setMsg(null);
  };

  const save = async () => {
    if (!items.length) return;
    setSaving(true);
    setMsg(null);
    const ok = await createRoutine(name.trim() || "Routine", buildBlocks(items));
    setSaving(false);
    setMsg(ok ? { text: "Routine saved.", ok: true } : { text: "Couldn't save — sign in and try again.", ok: false });
    if (ok) await load();
  };

  const remove = async (id: string) => {
    await deleteRoutine(id);
    await load();
  };

  return { name, setName, items, routines, saving, msg, addExercise, removeItem, patchItem, bumpSets, loadRoutine, save, remove };
}
