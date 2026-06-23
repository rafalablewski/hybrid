import { unstable_cache } from "next/cache";
import { prisma } from "./db";

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
        },
      });
    } catch {
      return [];
    }
  },
  ["published-exercises"],
  { revalidate: TTL, tags: ["exercises"] },
);
