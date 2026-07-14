"use client";

import { useEffect, useState } from "react";
import { feedCardView } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { MetaLine } from "./meta";

// The CONNECT feed — full-width post cards (avatar header, prose body, stat
// pills, kudos/comments/share), the latest few of your circle's activity.
// Pulls /api/social/feed; tapping any card opens the full Feed. Renders nothing
// when the feed is empty so it never clutters Today. Mirrored on mobile.

const C = (v: string) => `var(--color-${v})`;

function initials(name?: string | null, handle?: string) {
  const s = (name || handle || "?").trim();
  const p = s.split(/\s+/).filter(Boolean);
  return (p.length >= 2 ? p[0]![0]! + p[1]![0]! : s.slice(0, 2)).toUpperCase();
}

interface Item { id: string; kind: "session" | "pr" | "recap" | "post"; author: { displayName: string | null; handle: string; avatarUrl: string | null }; title: string; body: string | null; chips: string[]; lead: string | null; when: string; kudos: number; comments: number; accent: string }

export default function FeedPreview({ onOpen, horizontal = false }: { onOpen: () => void; horizontal?: boolean }) {
  const { t } = useLang();
  const [feed, setFeed] = useState<Item[] | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/social/feed").then((r) => r.json()).then((d) => { if (alive) setFeed((d.feed ?? []).slice(0, horizontal ? 6 : 4)); }).catch(() => { if (alive) setFeed([]); });
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

  // X / Twitter-style post — the avatar sits INLINE in the header line; the body,
  // facts and action row use the FULL card width beneath (no left avatar gutter,
  // no nested attached-box). Column layout.
  const postStyle = horizontal
    ? { ...cardWidth, display: "flex", flexDirection: "column" as const, textAlign: "left" as const, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 20, padding: 16, cursor: "pointer", color: C("chalk") }
    : { width: "100%", display: "flex", flexDirection: "column" as const, textAlign: "left" as const, background: "none", border: "none", borderBottom: `1px solid ${C("line")}`, padding: "16px 2px", cursor: "pointer", color: C("chalk") };
  return (
    <div style={wrap}>
      {feed.map((it) => {
        const v = feedCardView(it);
        const a = it.author as { displayName: string | null; handle: string; avatarUrl: string | null; coachVerified?: boolean };
        return (
          <button key={it.id} onClick={onOpen} style={postStyle}>
            {/* header — avatar inline; everything below spans the full width */}
            <span style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ width: 36, height: 36, borderRadius: 999, flexShrink: 0, background: C("ink"), border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 12, color: C("ash"), overflow: "hidden" }}>
                {a.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.avatarUrl} alt="" width={36} height={36} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : initials(a.displayName, a.handle)}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", fontSize: 14, minWidth: 0 }}>
                <span style={{ fontWeight: 800 }}>{v.name}</span>
                {a.coachVerified && <span style={{ color: "var(--blue-text)", fontSize: 12 }}>✓</span>}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, color: C("ash"), minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.handle ? `@${a.handle}  ` : ""}{v.when}</span>
              </span>
            </span>

            {/* body prose — full width */}
            {v.body && <span style={{ display: "block", fontSize: 14.5, lineHeight: 1.5, marginTop: 12 }}>{v.body}</span>}

              {/* attached content — the session/PR summary: a lead line + stat
                  pills (each chip its own element, never a ·-joined string) */}
              {(v.lead || v.chips.length > 0) && (
                <span style={{ display: "block", marginTop: v.body ? 8 : 12 }}>
                  {v.lead && <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: ".04em", color: C("chalk") }}>{v.lead}</span>}
                  {v.chips.length > 0 && <MetaLine parts={v.chips} style={{ display: "flex", fontFamily: "var(--font-mono)", fontSize: 12.5, color: C("ash"), marginTop: v.lead ? 5 : 0 }} />}
                </span>
              )}

              {/* action row — monochrome glyphs, full width */}
              <span style={{ display: "flex", justifyContent: "space-between", maxWidth: 300, marginTop: 14, color: C("ash"), fontFamily: "var(--font-mono)", fontSize: 12 }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M3 4.5h10v6H7l-3 2.5v-2.5H3Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>{it.comments}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M4 6 2 8l2 2M2 8h9M12 10l2-2-2-2M14 8H5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>{(it as { reposts?: number }).reposts ?? 0}</span>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M8 13S2.5 9.5 2.5 5.8A2.8 2.8 0 0 1 8 5a2.8 2.8 0 0 1 5.5.8C13.5 9.5 8 13 8 13Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /></svg>{it.kudos}</span>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M5 11 11 5M6 5h5v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
          </button>
        );
      })}
      {/* Threads-style trailing "See all" card — the slider caps at 6, so this
          nudges people into the full feed instead of scrolling an endless rail. */}
      {horizontal && (
        <button
          onClick={onOpen}
          aria-label={t("w.explore.seeAll")}
          style={{ flex: "0 0 auto", width: 132, scrollSnapAlign: "start", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 20, cursor: "pointer", color: C("ash") }}
        >
          <span style={{ width: 38, height: 38, borderRadius: 999, border: `1px solid ${C("line")}`, display: "grid", placeItems: "center", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 16 }}>→</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase" }}>{t("w.explore.seeAll")}</span>
        </button>
      )}
    </div>
  );
}
