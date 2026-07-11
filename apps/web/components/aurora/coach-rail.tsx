"use client";

import { useEffect, useState } from "react";
import { coachRailItems, type DiscoverCoach } from "@hybrid/core";

// "Follow a coach" — a horizontally swipeable rail on Today. Pulls the live
// marketplace (/api/coaches); until coaches publish storefronts it shows the
// shared placeholder people (coachRailItems falls back), so the section is never
// empty. Real coaches get a working Follow; placeholders route to the marketplace.

const C = (v: string) => `var(--color-${v})`;

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "C";
}

function Stars({ rating }: { rating: number | null }) {
  if (rating == null) return <span style={{ color: C("ash"), fontSize: 11, fontFamily: "var(--font-mono)" }}>New</span>;
  const full = Math.round(rating);
  return (
    <span style={{ fontSize: 11, color: C("gold"), letterSpacing: 0.5 }}>
      {"★".repeat(full)}
      <span style={{ color: C("line") }}>{"★".repeat(5 - full)}</span>
      <span style={{ color: C("ash"), fontFamily: "var(--font-mono)", marginLeft: 3 }}>{rating.toFixed(1)}</span>
    </span>
  );
}

export default function CoachRail({ onOpen }: { onOpen: () => void }) {
  const [coaches, setCoaches] = useState<DiscoverCoach[] | null>(null);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let alive = true;
    fetch("/api/coaches")
      .then((r) => r.json())
      .then((d) => { if (alive) setCoaches(coachRailItems(d?.coaches)); })
      .catch(() => { if (alive) setCoaches(coachRailItems(null)); });
    return () => { alive = false; };
  }, []);

  const items = coaches ?? coachRailItems(null);

  const follow = async (c: DiscoverCoach) => {
    if (!c.userId) { onOpen(); return; }
    setFollowed((f) => ({ ...f, [c.userId!]: true }));
    try { await fetch("/api/social/follow", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ followeeId: c.userId }) }); } catch { /* best-effort */ }
  };

  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>Follow a coach</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>Swipe to find a coach for your goal</div>
        </div>
        <button onClick={onOpen} style={{ background: "none", border: "none", cursor: "pointer", color: C("lime"), fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13 }}>Browse all →</button>
      </div>

      <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", paddingBottom: 4 }}>
        {items.map((c, i) => {
          const isFollowing = c.userId ? followed[c.userId] : false;
          return (
            <div
              key={c.userId ?? c.handle ?? i}
              style={{ scrollSnapAlign: "start", flex: "0 0 auto", width: 216, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 16, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={onOpen} aria-label={`Open ${c.name}`} style={{ width: 48, height: 48, borderRadius: 999, border: `1px solid ${C("line")}`, background: `linear-gradient(135deg, ${C("lime")}33, ${C("ink2")})`, color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 16, cursor: "pointer", flexShrink: 0 }}>{initials(c.name)}</button>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.name}{c.verified && <span style={{ color: "var(--lime-text)", fontSize: 12 }}>✓</span>}
                  </div>
                  <div style={{ marginTop: 2 }}><Stars rating={c.rating} /></div>
                </div>
              </div>
              <div style={{ color: C("ash"), fontSize: 12.5, marginTop: 10, lineHeight: 1.4, minHeight: 34 }}>{c.headline}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, minHeight: 26 }}>
                {c.specialties.slice(0, 2).map((s) => (
                  <span key={s} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, background: C("card"), border: `1px solid ${C("line")}`, color: C("chalk") }}>{s}</span>
                ))}
              </div>
              <button
                onClick={() => follow(c)}
                style={{ marginTop: 12, width: "100%", padding: "8px 0", borderRadius: 999, border: `1px solid ${isFollowing ? C("line") : C("lime")}`, background: isFollowing ? "transparent" : C("lime"), color: isFollowing ? C("chalk") : "var(--on-accent)", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 13, cursor: "pointer" }}
              >
                {isFollowing ? "Following" : c.placeholder ? "View" : "Follow"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
