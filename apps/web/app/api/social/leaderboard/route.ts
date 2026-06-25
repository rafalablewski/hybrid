import { NextResponse } from "next/server";
import { friendLeaderboard, type LeaderboardMetric, type LeaderEntry } from "@hybrid/core";
import { getOrCreateDbUser } from "@/lib/server-auth";
import { prisma } from "@/lib/db";
import { tableMissing, friendIds, recentSessionsByUsers, authorCards, blockedIdsFor } from "@/lib/social";

// This week's leaderboard across my FRIENDS (mutual follows) + me. Ranked by the
// requested metric (volume/sessions/distance/activeDays/streak/prs).

const METRICS = new Set(["volume", "sessions", "distance", "activeDays", "streak", "prs"]);
const WINDOW_DAYS = 35; // streak needs > 7 days of history; weekly metrics window inside the engine

export async function GET(request: Request) {
  const me = await getOrCreateDbUser(request);
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const raw = new URL(request.url).searchParams.get("metric") || "volume";
  const metric = (METRICS.has(raw) ? raw : "volume") as LeaderboardMetric;

  try {
    const [friends, blocked] = await Promise.all([friendIds(me.id), blockedIdsFor(me.id)]);
    const ids = [me.id, ...friends.filter((id) => !blocked.has(id))];
    const sinceMs = Date.now() - WINDOW_DAYS * 86_400_000;
    const [sessionsByUser, cards] = await Promise.all([
      recentSessionsByUsers(ids, sinceMs),
      authorCards(ids),
    ]);
    const entries: LeaderEntry[] = ids.map((id) => {
      const c = cards.get(id);
      return {
        id,
        handle: c?.handle ?? id.slice(0, 8),
        displayName: id === me.id ? "You" : c?.displayName ?? null,
        avatarUrl: c?.avatarUrl ?? null,
        sessions: sessionsByUser.get(id) ?? [],
        isMe: id === me.id,
      };
    });
    return NextResponse.json({ metric, board: friendLeaderboard(entries, metric) });
  } catch (e) {
    if (tableMissing(e)) return NextResponse.json({ metric, board: [], unavailable: true });
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
