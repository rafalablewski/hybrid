"use client";

import { useEffect, useState } from "react";
import { LEADERBOARD_METRICS, type LeaderboardMetric } from "@hybrid/core";
import { C, useSocialTheme, card, Avatar, Pill, EmptyState, ScreenHead, jget } from "./social-ui";
import { ProfileDrawer } from "./social-profile";

interface Row { rank: number; id: string; handle: string; displayName: string | null; avatarUrl: string | null; value: number; label: string; isMe: boolean }

const MEDAL = ["🥇", "🥈", "🥉"];

export default function SocialLeaderboard() {
  const { aurora } = useSocialTheme();
  const [metric, setMetric] = useState<LeaderboardMetric>("volume");
  const [board, setBoard] = useState<Row[] | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);

  useEffect(() => {
    setBoard(null);
    jget(`/api/social/leaderboard?metric=${metric}`).then((r: any) => setBoard(r.board ?? []));
  }, [metric]);

  return (
    <div style={{ maxWidth: 560 }}>
      <ScreenHead title="Leaderboard" sub="This week, across your friends (mutual follows)." />
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {LEADERBOARD_METRICS.map((m) => (
          <Pill key={m.key} active={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</Pill>
        ))}
      </div>
      {!board ? (
        <EmptyState title="Loading…" />
      ) : board.length <= 1 ? (
        <EmptyState title="No friends yet" sub="Become friends (a mutual follow) to race the weekly leaderboard together." />
      ) : (
        <div style={card(aurora)}>
          {board.map((r) => (
            <button key={r.id} onClick={() => !r.isMe && r.handle && setDrawer(r.handle)} style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: `1px solid ${C("line")}`, background: r.isMe ? `${C("lime")}11` : "none", border: "none", borderRadius: 8, cursor: r.isMe ? "default" : "pointer", textAlign: "left" }}>
              <span style={{ width: 28, textAlign: "center", fontFamily: "var(--font-display)", fontWeight: 800, color: r.rank <= 3 ? C("amber") : C("ash"), fontSize: r.rank <= 3 ? 18 : 14 }}>{MEDAL[r.rank - 1] ?? r.rank}</span>
              <Avatar url={r.avatarUrl} name={r.displayName} handle={r.handle} size={38} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 600 }}>{r.isMe ? "You" : r.displayName || `@${r.handle}`}</div>
                <div style={{ color: C("ash"), fontSize: 12, fontFamily: "var(--font-mono)" }}>@{r.handle}</div>
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: r.value > 0 ? C("lime") : C("ash") }}>{r.label}</span>
            </button>
          ))}
        </div>
      )}
      {drawer && <ProfileDrawer handle={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}
