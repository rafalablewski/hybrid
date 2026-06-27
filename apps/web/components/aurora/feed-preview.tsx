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

export default function FeedPreview({ onOpen }: { onOpen: () => void }) {
  const [feed, setFeed] = useState<Item[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/social/feed").then((r) => r.json()).then((d) => { if (alive) setFeed((d.feed ?? []).slice(0, 4)); }).catch(() => { if (alive) setFeed([]); });
    return () => { alive = false; };
  }, []);

  // Loading → a pulsing card skeleton that reserves the feed's space.
  if (feed === null) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 26, padding: 16 }}>
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {feed.map((it) => {
        const v = feedCardView(it);
        return (
          <button key={it.id} onClick={onOpen} style={{ width: "100%", textAlign: "left", background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 26, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 16, cursor: "pointer", color: C("chalk") }}>
            {/* header — avatar · name · when·context · ··· */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, background: "#2c302c", display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: C("chalk"), overflow: "hidden" }}>
                {it.author.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.author.avatarUrl} alt="" width={34} height={34} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : initials(it.author.displayName, it.author.handle)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.kind === "pr" ? "🏆 " : ""}{v.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{v.meta}</div>
              </div>
              <span style={{ color: C("ash"), fontSize: 18, lineHeight: 1 }}>···</span>
            </div>

            {/* body — the post's prose (when there is one) */}
            {v.body && <div style={{ fontSize: 14, lineHeight: 1.5, marginTop: 12 }}>{v.body}</div>}

            {/* stat pills */}
            {v.chips.length > 0 && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                {v.chips.map((c, i) => (
                  <span key={i} style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 12, padding: "8px 12px", fontSize: 12, fontWeight: 600 }}>{c}</span>
                ))}
              </div>
            )}

            {/* actions */}
            <div style={{ display: "flex", gap: 20, marginTop: 14, borderTop: `1px solid ${C("line")}`, paddingTop: 12, color: C("ash"), fontSize: 13 }}>
              <span>♡ {it.kudos}</span>
              <span>💬 {it.comments}</span>
              <span>↗ Share</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
