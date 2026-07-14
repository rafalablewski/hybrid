"use client";

import { useEffect, useState } from "react";
import { coachRailItems, type DiscoverCoach } from "@hybrid/core";

// "Follow a coach" — a horizontally swipeable rail on Today. Pulls the live
// marketplace (/api/coaches); until coaches publish storefronts it shows the
// shared placeholder people (coachRailItems falls back), so the section is never
// empty. Each card is a single tap-target (a chevron says so) that opens the
// coach / marketplace, where following happens — no inline button.

const C = (v: string) => `var(--color-${v})`;

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "C";
}

// Rating as a single gold star + the score, with an optional faint review count —
// calmer than a five-star row, and the number does the work.
function Stars({ rating, reviews }: { rating: number | null; reviews?: number }) {
  if (rating == null) return <span style={{ color: C("ash"), fontSize: 11, fontFamily: "var(--font-mono)" }}>New</span>;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-mono)", fontSize: 12 }}>
      <span style={{ color: C("gold") }}>★</span>
      <span style={{ color: C("chalk") }}>{rating.toFixed(1)}</span>
      {reviews ? <span style={{ color: `color-mix(in srgb, ${C("ash")} 70%, transparent)` }}>{reviews} reviews</span> : null}
    </span>
  );
}

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// `headerless` drops the built-in "Follow a coach" title + Browse-all link so a
// parent (Explore) can supply the shared, unified SectionHead instead. Today
// keeps the default header.
export default function CoachRail({ onOpen, headerless = false }: { onOpen: () => void; headerless?: boolean }) {
  const [coaches, setCoaches] = useState<DiscoverCoach[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/coaches")
      .then((r) => r.json())
      .then((d) => { if (alive) setCoaches(coachRailItems(d?.coaches)); })
      .catch(() => { if (alive) setCoaches(coachRailItems(null)); });
    return () => { alive = false; };
  }, []);

  const items = coaches ?? coachRailItems(null);

  return (
    <div style={{ marginTop: headerless ? 0 : 18 }}>
      {!headerless && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 17 }}>Follow a coach</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>Swipe to find a coach for your goal</div>
          </div>
          <button onClick={onOpen} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase" }}>Browse all →</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", scrollbarWidth: "none", paddingBottom: 4 }}>
        {items.map((c, i) => (
          <div
            key={c.userId ?? c.handle ?? i}
            onClick={onOpen}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
            aria-label={`Open ${c.name}`}
            style={{ position: "relative", scrollSnapAlign: "start", flex: "0 0 auto", width: 220, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 20, padding: 16, cursor: "pointer", boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)" }}
          >
            <span style={{ position: "absolute", top: 16, right: 16, color: `color-mix(in srgb, ${C("ash")} 55%, transparent)` }}><Chevron /></span>
            <div style={{ display: "flex", alignItems: "center", gap: 12, paddingRight: 18 }}>
              <span style={{ width: 46, height: 46, borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink"), color: C("ash"), fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, flexShrink: 0, display: "grid", placeItems: "center" }}>{initials(c.name)}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {c.name}{c.verified && <span style={{ color: "var(--blue-text)", fontSize: 12 }}>✓</span>}
                </div>
                <div style={{ marginTop: 4 }}><Stars rating={c.rating} reviews={c.reviews} /></div>
              </div>
            </div>
            <div style={{ color: C("ash"), fontSize: 12.5, marginTop: 12, lineHeight: 1.4, minHeight: 34 }}>{c.headline}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12, minHeight: 24 }}>
              {c.specialties.slice(0, 2).map((s) => (
                <span key={s} style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".05em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 999, border: `1px solid ${C("line")}`, color: C("ash") }}>{s}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
