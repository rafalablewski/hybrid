"use client";

import { useEffect, useState } from "react";

// A compact activity-feed strip for the BOTTOM of Today — the way Instagram
// shows a few Threads posts under the feed. Pulls /api/social/feed and shows the
// latest few items; tapping anything opens the full Feed. Renders nothing when
// the feed is empty so it never clutters Today.

const C = (v: string) => `var(--color-${v})`;

function initials(name?: string | null, handle?: string) {
  const s = (name || handle || "?").trim();
  const p = s.split(/\s+/).filter(Boolean);
  return (p.length >= 2 ? p[0]![0]! + p[1]![0]! : s.slice(0, 2)).toUpperCase();
}

interface Item { id: string; kind: string; author: { displayName: string | null; handle: string; avatarUrl: string | null }; title: string; detail: string; when: string; kudos: number; comments: number; accent: string }

export default function FeedPreview({ onOpen }: { onOpen: () => void }) {
  const [feed, setFeed] = useState<Item[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/social/feed").then((r) => r.json()).then((d) => { if (alive) setFeed((d.feed ?? []).slice(0, 4)); }).catch(() => { if (alive) setFeed([]); });
    return () => { alive = false; };
  }, []);

  // Still in flight → a skeleton that reserves the Feed's space and gently
  // pulses, so the strip fills in instead of popping in late from nothing.
  if (feed === null) {
    return (
      <div style={{ marginTop: 22 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 2px 10px" }}>
          <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17, color: C("chalk") }}>Feed</span>
          <span style={{ color: C("lime"), fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>View all →</span>
        </div>
        <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, overflow: "hidden" }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", borderTop: i === 0 ? "none" : `1px solid ${C("line")}` }}>
              <div className="skeleton" style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, background: C("line") }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="skeleton" style={{ width: "60%", height: 11, borderRadius: 6, background: C("line") }} />
                <div className="skeleton" style={{ width: "40%", height: 9, borderRadius: 6, background: C("line"), marginTop: 7 }} />
              </div>
              <div className="skeleton" style={{ width: 28, height: 9, borderRadius: 6, background: C("line"), flexShrink: 0 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Loaded + genuinely empty → render nothing so Today stays uncluttered.
  if (feed.length === 0) return null;

  return (
    <div style={{ marginTop: 22 }}>
      <button onClick={onOpen} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: "0 2px 10px" }}>
        <span style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 17, color: C("chalk") }}>Feed</span>
        <span style={{ color: C("lime"), fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>View all →</span>
      </button>
      <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, overflow: "hidden" }}>
        {feed.map((it, i) => (
          <button key={it.id} onClick={onOpen} style={{ width: "100%", display: "flex", gap: 12, alignItems: "center", padding: "12px 14px", background: "none", border: "none", borderTop: i === 0 ? "none" : `1px solid ${C("line")}`, cursor: "pointer", textAlign: "left" }}>
            <div style={{ width: 34, height: 34, borderRadius: 999, flexShrink: 0, border: `1px solid ${C("line")}`, background: `linear-gradient(135deg, ${C("lime")}33, ${C("ink2")})`, display: "grid", placeItems: "center", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12, color: C("chalk"), overflow: "hidden" }}>
              {it.author.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.author.avatarUrl} alt="" width={34} height={34} style={{ objectFit: "cover" }} />
              ) : initials(it.author.displayName, it.author.handle)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: C("chalk"), fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {it.kind === "pr" ? "🏆 " : ""}{it.title}
              </div>
              <div style={{ color: C("ash"), fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.detail}</div>
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ color: C("ash"), fontFamily: "var(--font-mono)", fontSize: 11 }}>{it.when}</div>
              {it.kudos > 0 && <div style={{ color: C("ash"), fontSize: 11, marginTop: 2 }}>👏 {it.kudos}</div>}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
