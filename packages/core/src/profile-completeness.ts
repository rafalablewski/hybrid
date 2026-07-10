// Shared profile-completeness scoring — one source of truth so the Settings
// header ring shows the SAME percentage + nudge on web and mobile. Pure and
// dependency-free; drives the completeness ring + "add a photo & bio" prompt.

export type ProfileCompletenessItem = "name" | "handle" | "displayName" | "bio" | "photo";

export interface ProfileCompletenessInput {
  name?: string | null;
  handle?: string | null;
  displayName?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
}

export interface ProfileCompleteness {
  /** 0–100, rounded. */
  percent: number;
  done: number;
  total: number;
  /** Items still to fill, in display order (e.g. ["photo","bio"]). */
  missing: ProfileCompletenessItem[];
  complete: boolean;
}

const has = (v: string | null | undefined) => !!v && v.trim().length > 0;

export function profileCompleteness(p: ProfileCompletenessInput): ProfileCompleteness {
  const checks: [ProfileCompletenessItem, boolean][] = [
    ["name", has(p.name)],
    ["handle", has(p.handle)],
    ["displayName", has(p.displayName)],
    ["bio", has(p.bio)],
    ["photo", has(p.avatarUrl)],
  ];
  const done = checks.filter(([, v]) => v).length;
  const total = checks.length;
  const missing = checks.filter(([, v]) => !v).map(([k]) => k);
  return { percent: Math.round((done / total) * 100), done, total, missing, complete: done === total };
}
