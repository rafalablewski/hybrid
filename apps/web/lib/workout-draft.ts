"use client";

import type { EditableBlock } from "@/components/workout-blocks";

/**
 * In-progress workout draft on the web (localStorage) — the twin of the mobile
 * logger's lib/draft.ts. Auto-saved (debounced) as you log so a refresh, a
 * crash or an accidental nav never costs the session; cleared on finish/discard.
 */
const KEY = "hybrid.workoutDraft";

export type WorkoutDraft = { title: string; startedAt: string; blocks: EditableBlock[] };

export function loadWorkoutDraft(): WorkoutDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as WorkoutDraft;
    if (!d || !Array.isArray(d.blocks) || d.blocks.length === 0) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveWorkoutDraft(d: WorkoutDraft): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* quota / unavailable — non-fatal */
  }
}

export function clearWorkoutDraft(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
