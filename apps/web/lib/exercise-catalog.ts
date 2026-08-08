import { setExerciseCatalog, setExerciseMediaCatalog, type LibraryMovement, type Movement, type MuscleGroup } from "@hybrid/core";

// Publishes the admin-managed exercise library to the ENGINES (core's movement
// registry), which is a different job from `useExercises()` — that hook feeds the
// PICKER. Without this, a lift logged under a library name ("Barbell Deadlift",
// "Pull-up", "Dumbbell Bulgarian Split Squat") resolved to no Movement, so it
// added nothing to fatigue, ACWR, injury risk, volume-by-muscle, landmarks or
// muscle records — the tissue read as untrained no matter how hard it was worked.
//
// Ordering matters: engines run on SESSION data, so `useSessions` awaits this
// before resolving. By the time any screen recomputes from new sessions the
// catalog is already published — no render race, and no engine signature or
// per-screen memo-dependency churn.

type ApiExercise = {
  name: string;
  pattern: string;
  muscles: string[];
  baseLoad: number | null;
  system: string | null;
  aliases: string[];
  category: string | null;
  videoUrl: string | null;
  thumbUrl: string | null;
};

/** In-flight/settled load, so concurrent callers share ONE request. */
let pending: Promise<void> | null = null;

async function load(): Promise<void> {
  try {
    const res = await fetch("/api/exercises");
    if (!res.ok) return; // signed-out / table not seeded → built-ins alone
    const d = (await res.json()) as { exercises?: ApiExercise[] };
    const custom: LibraryMovement[] = (d.exercises ?? []).map((e) => ({
      name: e.name,
      pattern: e.pattern,
      muscles: e.muscles as MuscleGroup[],
      baseLoad: e.baseLoad,
      system: (e.system ?? null) as Movement["system"],
      aliases: e.aliases,
      category: e.category ?? null,
    }));
    setExerciseCatalog(custom);
    // The same rows carry the library's DEMO MEDIA (an admin-set video/thumb
    // URL per lift). Publishing it here — global, admin-authored data, exactly
    // like the catalog — is what lets the exercise demo surface show a real
    // asset instead of the procedural placeholder (core: exercise-media).
    setExerciseMediaCatalog((d.exercises ?? []).map((e) => ({ name: e.name, videoUrl: e.videoUrl, thumbUrl: e.thumbUrl })));
  } catch {
    // Offline / API down: the engines keep resolving against the built-ins.
  }
}

/** Ensure the engine catalog is published. Idempotent; safe to await anywhere. */
export function ensureExerciseCatalog(): Promise<void> {
  if (!pending) pending = load();
  return pending;
}
