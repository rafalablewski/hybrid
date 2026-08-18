/**
 * Activity / notifications feed — pure, shared by web + mobile. Turns the
 * athlete's REAL data (logged sessions + coach-assigned workouts) into a sorted
 * notification list. No fabricated entries: an empty history yields an empty
 * feed and the UI shows an honest empty state.
 */
import type { AuroraIconName } from "./theme/icons";
import type { LoggedSession } from "./engines/session";

export type ActivityAccent = "lime" | "blue" | "amber" | "red";

export interface ActivityItem {
  id: string;
  kind: "upcoming" | "completed";
  title: string;
  detail: string;
  /** epoch ms used for sorting + relative-time display. */
  at: number;
  icon: AuroraIconName;
  accent: ActivityAccent;
}

/** Minimal shape of a coach/self assignment (matches the clients' Assignment). */
export interface ActivityAssignment {
  id: string;
  name: string;
  date: string; // ISO
  status: string;
}

export interface ActivityInput {
  sessions: LoggedSession[];
  assignments?: ActivityAssignment[];
  now?: number;
  /** How many days back of completed sessions to include (default 14). */
  windowDays?: number;
  /** Cap on returned items (default 20). */
  limit?: number;
}

/** Human "2h ago" / "in 3d" / "just now" relative time. */
export function relativeTime(at: number, now = Date.now()): string {
  const diff = at - now;
  const future = diff > 0;
  const s = Math.abs(diff) / 1000;
  const fmt = (n: number, unit: string) => (future ? `in ${n}${unit}` : `${n}${unit} ago`);
  if (s < 45) return future ? "soon" : "just now";
  const m = Math.round(s / 60);
  if (m < 60) return fmt(m, "m");
  const h = Math.round(m / 60);
  if (h < 24) return fmt(h, "h");
  const d = Math.round(h / 24);
  return fmt(d, "d");
}

/** Build the sorted feed (most recent / soonest first). */
export function buildActivityFeed(input: ActivityInput): ActivityItem[] {
  const now = input.now ?? Date.now();
  const windowMs = (input.windowDays ?? 14) * 86_400_000;
  const items: ActivityItem[] = [];

  for (const a of input.assignments ?? []) {
    const at = Date.parse(a.date);
    if (!Number.isFinite(at) || a.status !== "assigned") continue;
    // upcoming = today or future (don't nag about missed ones here)
    if (at < now - 86_400_000) continue;
    items.push({
      id: `assign-${a.id}`,
      kind: "upcoming",
      title: "Upcoming session",
      detail: a.name,
      at,
      icon: "calendar",
      accent: "red",
    });
  }

  for (const s of input.sessions) {
    const at = Date.parse(s.completedAt ?? s.startedAt);
    if (!Number.isFinite(at) || at < now - windowMs || at > now + 60_000) continue;
    const moves = s.blocks?.length ?? 0;
    items.push({
      id: `session-${s.id}`,
      kind: "completed",
      title: "Session completed",
      detail: `${s.title}${moves ? `, ${moves} ${moves === 1 ? "exercise" : "exercises"}` : ""}`,
      at,
      icon: "verified",
      accent: "lime",
    });
  }

  // Soonest upcoming first, then most-recent completed; upcoming sit at the top.
  items.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "upcoming" ? -1 : 1;
    return a.kind === "upcoming" ? a.at - b.at : b.at - a.at;
  });
  return items.slice(0, input.limit ?? 20);
}
