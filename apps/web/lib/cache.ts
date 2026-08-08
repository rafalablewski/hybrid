import { unstable_cache } from "next/cache";
import { prisma } from "./db";
import { setExerciseCatalog, type Movement, type MuscleGroup } from "@hybrid/core";

// Short-TTL cache for GLOBAL, rarely-changing config that every client fetches
// on (almost) every app load — flags, translations, the published exercise
// library. Without this, 100k DAU multiply into hundreds of thousands of
// identical Postgres reads/day. These selects are all primitives (no Date), so
// they survive unstable_cache's serialization. A 60s TTL bounds staleness, so an
// admin edit is reflected within a minute without any explicit invalidation.
//
// NOT cached: anything per-user (flag grants, announcement audience/time window)
// stays a live read in the route.

const TTL = 60; // seconds

export const getCachedFlagOverrides = unstable_cache(
  async () => {
    try {
      return await prisma.featureFlag.findMany({
        select: { key: true, enabled: true, audience: true, value: true },
      });
    } catch {
      return [];
    }
  },
  ["flag-overrides"],
  { revalidate: TTL, tags: ["flags"] },
);

export const getCachedTranslations = unstable_cache(
  async () => {
    try {
      return await prisma.translation.findMany({ select: { lang: true, key: true, value: true } });
    } catch {
      return [];
    }
  },
  ["translations"],
  { revalidate: TTL, tags: ["translations"] },
);

export const getCachedPublishedExercises = unstable_cache(
  async () => {
    try {
      return await prisma.exercise.findMany({
        where: { status: "published" },
        orderBy: { name: "asc" },
        select: {
          name: true,
          pattern: true,
          muscles: true,
          baseLoad: true,
          system: true,
          aliases: true,
          kind: true,
          category: true,
          equipment: true,
          description: true,
          cues: true,
          videoUrl: true,
          thumbUrl: true,
        },
      });
    } catch {
      return [];
    }
  },
  ["published-exercises"],
  { revalidate: TTL, tags: ["exercises"] },
);

/**
 * Publish the admin-managed exercise library to the ENGINES (core's movement
 * registry) for a server-side computation. The catalog is global, admin-authored
 * data — identical for every athlete — so a module-level registry is correct here
 * too, and it keeps every engine signature unchanged.
 *
 * Call this before running any muscle-attribution engine on the server
 * (fatigue / injury risk / volume-by-muscle / landmarks / records). Without it a
 * lift logged under a library name ("Barbell Deadlift", "Pull-up") resolves to no
 * Movement and contributes ZERO load — the tissue reads as untrained.
 */
export async function publishExerciseCatalog(): Promise<void> {
  const rows = await getCachedPublishedExercises();
  setExerciseCatalog(
    rows.map((e) => ({
      name: e.name,
      pattern: e.pattern,
      muscles: e.muscles as MuscleGroup[],
      baseLoad: e.baseLoad,
      system: (e.system ?? null) as Movement["system"],
      aliases: e.aliases,
      category: e.category ?? null,
    })),
  );
}
