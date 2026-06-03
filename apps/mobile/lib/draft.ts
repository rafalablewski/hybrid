// In-progress workout draft. Persisted as you log so an interrupted session
// (app killed, phone died, accidental back-swipe) can be resumed instead of
// lost. Cleared on finish or explicit discard.
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "hybrid.workoutDraft";

export type Draft = { title: string; startedAt: string; exercises: unknown[] };

export async function loadDraft(): Promise<Draft | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const d = raw ? (JSON.parse(raw) as Draft) : null;
    return d && Array.isArray(d.exercises) && d.exercises.length ? d : null;
  } catch {
    return null;
  }
}

export async function saveDraft(d: Draft): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(d)).catch(() => {});
}

export async function clearDraft(): Promise<void> {
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

/** Reactive draft for launcher screens — refreshes whenever the screen refocuses. */
export function useDraft() {
  const [draft, setDraft] = useState<Draft | null>(null);
  const refresh = useCallback(() => {
    loadDraft().then(setDraft);
  }, []);
  useFocusEffect(refresh);
  const discard = useCallback(async () => {
    await clearDraft();
    setDraft(null);
  }, []);
  return { draft, refresh, discard };
}
