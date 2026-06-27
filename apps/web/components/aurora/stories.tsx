"use client";

import { useEffect, useState } from "react";

// STORIES RAIL — the Instagram-style row of circle avatars at the top of Today.
// Pulls the same /api/social/feed as FeedPreview and turns its distinct authors
// into "stories" (a gradient ring = has recent activity). Leads with "Your
// story" (opens the feed to post). No fabricated people: when the feed is empty
// it still shows your own story so the rail is never a lonely placeholder, but
// it never invents friends. Mirrored on mobile (aurora/stories.tsx).

const C = (v: string) => `var(--color-${v})`;

function initials(name?: string | null, handle?: string) {
  const s = (name || handle || "?").trim();
  const p = s.split(/\s+/).filter(Boolean);
  return (p.length >= 2 ? p[0]![0]! + p[1]![0]! : s.slice(0, 2)).toUpperCase();
}

interface Author { displayName: string | null; handle: string; avatarUrl: string | null }
interface Item { id: string; author: Author }

function Bubble({ ring, children, label, onClick }: { ring: boolean; children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ flex: "0 0 auto", width: 66, background: "none", border: "none", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, padding: 0 }}>
      <span style={{ width: 64, height: 64, borderRadius: "50%", padding: 3, boxSizing: "border-box", background: ring ? `conic-gradient(${C("lime")}, ${C("blue")}, ${C("red")}, ${C("lime")})` : C("line") }}>
        <span style={{ display: "grid", placeItems: "center", width: "100%", height: "100%", borderRadius: "50%", background: C("ink2"), border: `2px solid ${C("ink")}`, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, color: C("chalk"), overflow: "hidden" }}>
          {children}
        </span>
      </span>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), maxWidth: 64, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span>
    </button>
  );
}

export default function Stories({ you, youLabel, onOpen }: { you: string; youLabel: string; onOpen: () => void }) {
  const [authors, setAuthors] = useState<Author[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/social/feed")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const seen = new Set<string>();
        const list: Author[] = [];
        for (const it of ((d.feed ?? []) as Item[])) {
          const k = it.author?.handle;
          if (!k || seen.has(k)) continue;
          seen.add(k);
          list.push(it.author);
          if (list.length >= 12) break;
        }
        setAuthors(list);
      })
      .catch(() => { if (alive) setAuthors([]); });
    return () => { alive = false; };
  }, []);

  // Loading → a quiet skeleton row that reserves the rail's height.
  if (authors === null) {
    return (
      <div style={{ display: "flex", gap: 14, overflowX: "auto", scrollbarWidth: "none", margin: "16px -2px 0", padding: "0 2px" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ flex: "0 0 auto", display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div className="skeleton" style={{ width: 64, height: 64, borderRadius: "50%", background: C("line"), opacity: 0.5 }} />
            <div className="skeleton" style={{ width: 40, height: 8, borderRadius: 4, background: C("line"), opacity: 0.4 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 14, overflowX: "auto", scrollbarWidth: "none", margin: "16px -2px 0", padding: "0 2px" }}>
      {/* Your story — opens the feed to post */}
      <Bubble ring={false} label={youLabel} onClick={onOpen}>
        <span style={{ position: "relative", width: "100%", height: "100%", display: "grid", placeItems: "center" }}>
          {you}
          <span style={{ position: "absolute", bottom: -2, right: -2, width: 18, height: 18, borderRadius: "50%", background: C("lime"), color: C("ink"), display: "grid", placeItems: "center", fontSize: 13, fontWeight: 800, border: `2px solid ${C("ink2")}` }}>+</span>
        </span>
      </Bubble>
      {authors.map((a) => (
        <Bubble key={a.handle} ring label={a.displayName || `@${a.handle}`} onClick={onOpen}>
          {a.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.avatarUrl} alt="" width={58} height={58} style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }} />
          ) : initials(a.displayName, a.handle)}
        </Bubble>
      ))}
    </div>
  );
}
