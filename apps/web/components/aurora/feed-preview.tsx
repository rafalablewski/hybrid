"use client";

import { useEffect, useState } from "react";
import { feedCardView } from "@hybrid/core";

// The CONNECT feed — full-width post cards (avatar header · prose body · stat
// pills · kudos/comments/share), the latest few of your circle's activity.
// Pulls /api/social/feed; tapping any card opens the full Feed. Renders nothing
// when the feed is empty so it never clutters Today. Mirrored on mobile.

const C = (v: string) => `var(--color-${v})`;

function initials(name?: string | null, handle?: string) {
  const s = (name || handle || "?").trim();
  const p = s.split(/\s+/).filter(Boolean);
  return (p.length >= 2 ? p[0]![0]! + p[1]![0]! : s.slice(0, 2)).toUpperCase();
}

interface Item { id: string; kind: "session" | "pr" | "recap" | "post"; author: { displayName: string | null; handle: string; avatarUrl: string | null }; title: string; detail: string; when: string; kudos: number; comments: number; accent: string }

export default function FeedPreview({ onOpen, horizontal = false }: { onOpen: () => void; horizontal?: boolean }) {
  const [feed, setFeed] = useState<Item[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/social/feed").then((r) => r.json()).then((d) => { if (alive) setFeed((d.feed ?? []).slice(0, horizontal ? 8 : 4)); }).catch(() => { if (alive) setFeed([]); });
    return () => { alive = false; };
  }, [horizontal]);

  // A horizontal slider lays the post cards in a left/right scroll-snapping row
  // (fixed-width cards); vertical stacks them full-width. Shared card body.
  const wrap = horizontal
    ? { display: "flex", gap: 12, overflowX: "auto" as const, scrollSnapType: "x mandatory", scrollbarWidth: "none" as const, padding: "2px 2px 6px" }
    : { display: "flex", flexDirection: "column" as const, gap: 16 };
  const cardWidth = horizontal ? { flex: "0 0 82%", maxWidth: 320, scrollSnapAlign: "start" as const, boxSizing: "border-box" as const } : { width: "100%" };

  // Loading → a pulsing card skeleton that reserves the feed's space.
  if (feed === null) {
    return (
      <div style={wrap}>
        {[0, 1].map((i) => (
          <div key={i} style={{ ...cardWidth, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 26, padding: 16 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 999, background: C("line") }} />
              <div style={{ flex: 1 }}>
                <div className="skeleton" style={{ width: "40%", height: 11, borderRadius: 6, background: C("line") }} />
                <div className="skeleton" style={{ width: "55%", height: 9, borderRadius: 6, background: C("line"), marginTop: 7 }} />
              </div>
            </div>
            <div className="skeleton" style={{ width: "90%", height: 12, borderRadius: 6, background: C("line"), marginTop: 14 }} />
          </div>
        ))}
      </div>
    );
  }

  // Loaded + genuinely empty → render nothing so Today stays uncluttered.
  if (feed.length === 0) return null;

  // X / Twitter-style post — avatar left; name ✓ @handle · time inline; prose;
  // an optional attached-content card; a reply/repost/like/share row.
  const postStyle = horizontal
    ? { ...cardWidth, display: "flex", gap: 12, textAlign: "left" as const, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 20, padding: 14, cursor: "pointer", color: C("chalk") }
    : { width: "100%", display: "flex", gap: 12, textAlign: "left" as const, background: "none", border: "none", borderBottom: `1px solid ${C("line")}`, padding: "14px 2px", cursor: "pointer", color: C("chalk") };
  return (
    <div style={wrap}>
      {feed.map((it) => {
        const v = feedCardView(it);
        const a = it.author as { displayName: string | null; handle: string; avatarUrl: string | null; coachVerified?: boolean };
        return (
          <button key={it.id} onClick={onOpen} style={postStyle}>
            <span style={{ width: 42, height: 42, borderRadius: 999, flexShrink: 0, background: "#2c302c", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14, color: C("chalk"), overflow: "hidden" }}>
              {a.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.avatarUrl} alt="" width={42} height={42} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              ) : initials(a.displayName, a.handle)}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              {/* header line — name · verified · @handle · time */}
              <span style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", fontSize: 14 }}>
                <span style={{ fontWeight: 800 }}>{v.name}</span>
                {a.coachVerified && <span style={{ color: "var(--lime-text)", fontSize: 12 }}>✓</span>}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: C("ash"), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.handle ? `@${a.handle} · ` : ""}{v.meta}</span>
              </span>

              {/* body prose */}
              {v.body && <span style={{ display: "block", fontSize: 14, lineHeight: 1.45, marginTop: 2 }}>{it.kind === "pr" ? "🏆 " : ""}{v.body}</span>}

              {/* attached content — session/PR stats as one quiet card */}
              {v.chips.length > 0 && (
                <span style={{ display: "block", border: `1px solid ${C("line")}`, borderRadius: 14, padding: "11px 13px", marginTop: 10, fontFamily: "var(--font-mono)", fontSize: 11.5, color: C("ash") }}>{v.chips.join("  ·  ")}</span>
              )}

              {/* action row */}
              <span style={{ display: "flex", justifyContent: "space-between", maxWidth: 288, marginTop: 11, color: C("ash"), fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <span>💬 {it.comments}</span>
                <span>🔁 {(it as { reposts?: number }).reposts ?? 0}</span>
                <span>♡ {it.kudos}</span>
                <span>↗</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
