"use client";

import { useEffect, useState } from "react";
import { coachRailItems, type DiscoverCoach } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { ArrowGlyph, CtaLabel } from "./cta-label";

// "Follow a coach" — a horizontally swipeable rail on Today (its only home now
// that the Explore tab is gone). Pulls the live
// marketplace (/api/coaches); until coaches publish storefronts it shows the
// shared placeholder people (coachRailItems falls back), so the section is never
// empty. Each card is a single tap-target (a chevron says so) that opens the
// coach / marketplace, where following happens — no inline button.
//
// MARQUEE card (see design/follow-coach-redesign-ideas.html, concept 5, applied
// to every card): an accent-washed card led by the person (accent-ringed avatar,
// name, one mono specialty line), an athlete pull-quote doing the selling
// (coach headline as the fallback when no quote exists), and a proof strip
// (rating / reviews / years) pinned to the bottom so every card shares one
// geometry — no wrapping chips, no ragged bottoms.

const C = (v: string) => `var(--color-${v})`;

function initials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || "C";
}

const Chevron = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

// One cell of the proof strip: mono value over a tiny mono label.
function Stat({ value, label, first, star }: { value: string; label: string; first?: boolean; star?: boolean }) {
  return (
    <div style={{ flex: 1, paddingTop: 10, borderLeft: first ? "none" : `1px solid var(--color-line)`, paddingLeft: first ? 0 : 12 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, color: C("chalk"), whiteSpace: "nowrap" }}>
        {star && <span style={{ color: C("gold"), marginRight: 4 }}>★</span>}{value}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: `color-mix(in srgb, ${C("ash")} 70%, transparent)`, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function MarqueeCard({ c, onOpen }: { c: DiscoverCoach; onOpen: () => void }) {
  const { t } = useLang();
  const accent = C(c.accent);
  const accentText = `var(--${c.accent}-text)`;
  const stats: Array<{ value: string; label: string; star?: boolean }> = [
    { value: c.rating != null ? c.rating.toFixed(1) : t("w.explore.coachNew"), label: t("w.explore.coachRating"), star: c.rating != null },
    ...(c.reviews ? [{ value: String(c.reviews), label: t("w.explore.coachReviews") }] : []),
    ...(c.years ? [{ value: `${c.years}y`, label: t("w.explore.coachCoaching") }] : []),
  ];
  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      aria-label={`${t("w.explore.coachOpen")} ${c.name}`}
      style={{ position: "relative", scrollSnapAlign: "start", flex: "0 0 auto", width: 290, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: "16px 16px 16px", cursor: "pointer", boxShadow: "var(--shadow-card)", overflow: "hidden", display: "flex", flexDirection: "column" }}
    >
      {/* accent wash — the coach's colour bleeding in from the top corner */}
      <span aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", background: `radial-gradient(120% 130% at 100% 0%, color-mix(in srgb, ${accent} 14%, transparent), transparent 60%)` }} />
      <span style={{ position: "absolute", top: 16, right: 16, color: `color-mix(in srgb, ${C("ash")} 55%, transparent)` }}><Chevron /></span>

      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 12, paddingRight: 16 }}>
        <span style={{ width: 46, height: 46, borderRadius: 999, boxShadow: `inset 0 0 0 1.5px ${accent}`, background: C("ink"), color: accentText, fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 13, flexShrink: 0, display: "grid", placeItems: "center" }}>{initials(c.name)}</span>
        <div style={{ minWidth: 0 }}>
          {/* Name in the display face — Mincho under Kyoto Hour — so the
              person leads the card the way a byline leads an article. */}
          {/* Name + check as flex siblings: inside one truncating box the ✓
              (rightmost inline content) would be the first thing clipped. */}
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 16, letterSpacing: "-.01em", display: "flex", alignItems: "center" }}>
            <span style={{ minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span>
            {c.verified && <span style={{ color: accentText, fontSize: 12, marginLeft: 4, flexShrink: 0 }}>✓</span>}
          </div>
          <div style={{ marginTop: 5, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {c.specialties.slice(0, 2).join(" – ")}
          </div>
        </div>
      </div>

      {/* the sell: an athlete's words, or the coach's own headline as fallback */}
      <div style={{ position: "relative", marginTop: 12, minHeight: 58 }}>
        {c.quote ? (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.5, color: C("chalk"), display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>“{c.quote}”</div>
            <div style={{ marginTop: 5, fontFamily: "var(--font-mono)", fontSize: 10, color: `color-mix(in srgb, ${C("ash")} 70%, transparent)` }}>— {t("w.explore.coachReview")}</div>
          </>
        ) : (
          <div style={{ fontSize: 13, lineHeight: 1.5, color: C("ash"), display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{c.headline}</div>
        )}
      </div>

      <div style={{ position: "relative", display: "flex", gap: 0, marginTop: "auto", paddingTop: 0, borderTop: `1px solid ${C("line")}` }}>
        {stats.map((s, i) => <Stat key={s.label} value={s.value} label={s.label} star={s.star} first={i === 0} />)}
      </div>
    </div>
  );
}

// `headerless` drops the built-in "Follow a coach" title + Browse-all link so a
// parent can supply its own section head instead — which is how Today mounts it.
// The built-in header is kept for any caller that has no head of its own.
// `bleed` lets the slider run FULL-BLEED: negative margins the width of the
// shell's --page-pad-x pull the scroll clip out to the true screen edge (with
// matching internal padding so resting cards still align with the column), so
// cards slide under the bezel instead of vanishing at the content column. Only
// for rails sitting directly on the page (Today) — inside a Sheet the rail must
// respect the sheet's own padding.
// `seeMore` appends a trailing "See more" button at the end of the rail (the
// unified rail affordance — the community rail carries the twin), so the rest of
// the marketplace is one tap away without an "All →" link up in the header.
export default function CoachRail({ onOpen, headerless = false, bleed = false, seeMore = false }: { onOpen: () => void; headerless?: boolean; bleed?: boolean; seeMore?: boolean }) {
  const { t } = useLang();
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
    <div style={{ marginTop: headerless ? 0 : 16 }}>
      {!headerless && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 17 }}>{t("w.explore.coaches")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>{t("w.explore.coachSwipe")}</div>
          </div>
          <button className="pressable" onClick={onOpen} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase" }}><CtaLabel size={12}>{`${t("w.explore.browseAll")} →`}</CtaLabel></button>
        </div>
      )}

      {/* The scroller gets internal breathing room (padding pulled back by the
          negative margins) so the card shadows render inside the scroll clip
          instead of being TRUNCATED at its edge — the "cut gradient" artifact. */}
      {/* scrollPadding matches the horizontal padding: mandatory snap ignores
          the scroller's own padding, so without it the browser snaps the FIRST
          card to the scrollport start — glued to the bezel on a bleed rail. */}
      <div style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory", scrollPadding: bleed ? "0 var(--page-pad-x, 12px)" : "0 4px", scrollbarWidth: "none", padding: bleed ? "8px var(--page-pad-x, 12px) 20px" : "8px 4px 20px", margin: bleed ? "-8px calc(-1 * var(--page-pad-x, 12px)) -14px" : "-8px -4px -14px" }}>
        {items.map((c, i) => <MarqueeCard key={c.userId ?? c.handle ?? i} c={c} onOpen={onOpen} />)}
        {/* Trailing "See more" button — the same treatment as the community
            rail, so the two rails share one end-of-rail affordance. */}
        {seeMore && (
          <button className="pressable"
            onClick={onOpen}
            aria-label={t("w.explore.seeMore")}
            style={{ flex: "0 0 auto", width: 132, scrollSnapAlign: "start", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, cursor: "pointer", color: C("ash"), boxShadow: "var(--shadow-card)" }}
          >
            <span style={{ width: 38, height: 38, borderRadius: 999, border: `1px solid ${C("line")}`, display: "grid", placeItems: "center" }}><ArrowGlyph size={14} /></span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase" }}>{t("w.explore.seeMore")}</span>
          </button>
        )}
      </div>
    </div>
  );
}
