"use client";

import { fs, PLAN_PREVIEWS } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import CoachRail from "./coach-rail";
import FeedPreview from "./feed-preview";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";

const C = (v: string) => `var(--color-${v})`;

// Covers are "album art" — deliberately dark in BOTH themes (Aurora dark and
// Kyoto Hour light), so white text stays legible and the accent wash reads the
// same everywhere. Fixed dark base, never the theme's ink token.
const COVER_INK = "#0c0d0c";

type Preview = (typeof PLAN_PREVIEWS)[number];

/**
 * AURORA Explore (web) — the discovery surface for the Explore tab: search, a
 * coach rail, the plan library, and a community-feed preview. Composed from the
 * shared CoachRail + FeedPreview so it stays in lockstep with the mobile Explore
 * screen (aurora/explore.tsx there).
 *
 * PLANS use the COVER FLOW layout (design/explore-redesign.html, concept 5): the
 * top three plans render as full-width "album-art" covers, and the rest fall
 * into a full-bleed micro-rail below — so the section stays curated and browsable
 * as the library grows past a stacked-list's breaking point.
 */
export default function AuroraExplore({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const { t } = useLang();
  const go = (s: string) => onNavigate?.(s);

  const featured = PLAN_PREVIEWS.slice(0, 3);
  const more = PLAN_PREVIEWS.slice(3);

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: 0, letterSpacing: "-.02em" }}>{t("w.explore.title")}</h1>
      <p style={{ color: C("ash"), fontSize: fs.body, margin: "4px 0 0" }}>{t("w.explore.sub")}</p>

      {/* SEARCH — opens the people/discovery surface */}
      <button
        onClick={() => go("connections")}
        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 10, marginTop: 16, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "13px 15px", cursor: "pointer", color: C("ash"), fontSize: fs.body }}
      >
        <AuroraIcon name="search" size={17} color={C("ash")} />
        {t("w.explore.search")}
      </button>

      {/* COACHES — headerless rail under the SHARED SectionHead, so all three
          sections share one title + one "See all" CTA (no bespoke "Browse all"). */}
      <SectionHead title={t("w.explore.coaches")} onAction={() => go("coaches")} />
      <CoachRail onOpen={() => go("coaches")} headerless bleed />

      {/* PLANS — Cover Flow: three featured covers, then the rest as a full-bleed
          micro-rail. Tap-through to the full Plans screen. */}
      <SectionHead title={t("w.explore.plans")} onAction={() => go("plans")} />
      <div style={{ display: "grid", gap: 12 }}>
        {featured.map((p) => (
          <PlanCover key={p.plan.id} p={p} onOpen={() => go("plans")} />
        ))}
      </div>
      {more.length > 0 && (
        // Full-bleed rail — same idiom as CoachRail: negative margins the width
        // of --page-pad-x pull the scroll clip to the true screen edge (matching
        // internal padding keeps resting cards aligned with the content column),
        // and scrollPadding stops mandatory-snap gluing the first card to the bezel.
        <div
          style={{ display: "flex", gap: 10, overflowX: "auto", scrollSnapType: "x mandatory", scrollPadding: "0 var(--page-pad-x, 16px)", scrollbarWidth: "none", marginTop: 12, marginBottom: -8, marginLeft: "calc(-1 * var(--page-pad-x, 16px))", marginRight: "calc(-1 * var(--page-pad-x, 16px))", padding: "8px var(--page-pad-x, 16px) 8px" }}
        >
          {more.map((p) => (
            <PlanMini key={p.plan.id} p={p} onOpen={() => go("plans")} />
          ))}
        </div>
      )}

      {/* COMMUNITY — a left/right slider (max 6) with a trailing "See all" card,
          Threads-style, instead of an ever-growing stacked wall. */}
      <SectionHead title={t("w.explore.community")} onAction={() => go("feed")} />
      <FeedPreview onOpen={() => go("feed")} horizontal bleed />
    </div>
  );
}

// A full-width plan COVER — duotone accent wash over a fixed-dark base, the
// discipline glyph as oversized placeholder art, discipline + duration up top
// and the plan name + meta anchored to the bottom. The whole card is one tap
// target into the Plans screen.
function PlanCover({ p, onOpen }: { p: Preview; onOpen: () => void }) {
  const accent = p.color;
  const weeks = `${p.plan.weeks} ${p.plan.weeks === 1 ? "WEEK" : "WEEKS"}`;
  return (
    <button
      onClick={onOpen}
      aria-label={`Open ${p.plan.name}`}
      style={{ position: "relative", overflow: "hidden", width: "100%", height: 196, textAlign: "left", cursor: "pointer", borderRadius: 28, border: `1px solid ${C("line")}`, padding: 18, color: "#fff", display: "flex", flexDirection: "column", justifyContent: "space-between", background: COVER_INK, boxShadow: "var(--shadow-card)" }}
    >
      {/* duotone wash — accent bleeding from the top corner into dark */}
      <span aria-hidden style={{ position: "absolute", inset: 0, background: `linear-gradient(202deg, color-mix(in srgb, ${accent} 52%, ${COVER_INK}) 0%, color-mix(in srgb, ${accent} 15%, ${COVER_INK}) 46%, ${COVER_INK} 100%)` }} />
      <span aria-hidden style={{ position: "absolute", inset: 0, background: `radial-gradient(120% 92% at 86% 8%, color-mix(in srgb, ${accent} 42%, transparent), transparent 55%)` }} />
      {/* bottom scrim so the title stays legible over any accent */}
      <span aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(0,0,0,.5), transparent 52%)" }} />
      {/* oversized discipline glyph — placeholder cover art until real imagery */}
      <span aria-hidden style={{ position: "absolute", top: -36, right: -16, fontSize: 152, lineHeight: 1, color: "rgba(255,255,255,.07)", pointerEvents: "none" }}>{p.icon}</span>

      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, letterSpacing: ".16em", textTransform: "uppercase", color: "#0d0e0d", background: `color-mix(in srgb, #fff 82%, ${accent})`, padding: "5px 11px", borderRadius: 999 }}>{p.goalName}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, letterSpacing: ".06em", color: "rgba(255,255,255,.85)", whiteSpace: "nowrap", paddingTop: 3 }}>{weeks}</span>
      </div>

      <div style={{ position: "relative" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 24, letterSpacing: "-.03em", lineHeight: 1.03, color: "#fff", maxWidth: "14ch", textShadow: "0 2px 18px rgba(0,0,0,.35)" }}>{p.plan.name}</div>
        <MetaLine
          parts={[`${p.plan.sessions}×/wk`, p.plan.tag, p.plan.hot ? "★ Popular" : null]}
          style={{ display: "flex", marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 11, color: "rgba(255,255,255,.82)", letterSpacing: ".03em" }}
        />
      </div>
    </button>
  );
}

// A compact plan card for the "more" rail — theme-aware surface, accent-tinted
// icon tile, name + one mono meta line. Sized to sit ~2.5 to a screen so the
// tail of the library stays swipeable, not a bottomless scroll.
function PlanMini({ p, onOpen }: { p: Preview; onOpen: () => void }) {
  const accent = p.color;
  return (
    <button
      onClick={onOpen}
      aria-label={`Open ${p.plan.name}`}
      style={{ flex: "0 0 auto", width: 182, scrollSnapAlign: "start", display: "flex", alignItems: "center", gap: 11, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 18, padding: "12px 13px", cursor: "pointer", textAlign: "left", color: C("chalk"), boxShadow: "var(--shadow-card)" }}
    >
      <span style={{ width: 38, height: 38, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 17, background: `color-mix(in srgb, ${accent} 13%, ${C("ink")})`, border: `1px solid color-mix(in srgb, ${accent} 32%, ${C("line")})`, color: accent }}>{p.icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 13.5, letterSpacing: "-.01em", lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.plan.name}</span>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".04em", textTransform: "uppercase", color: C("ash"), marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.plan.weeks} wks – {p.goalName}</span>
      </span>
    </button>
  );
}

// ONE section header for every Explore section — a title + a single unified
// "See all →" CTA. Kills the old mix of "Browse all" / "All plans" / "Feed".
function SectionHead({ title, onAction }: { title: string; onAction: () => void }) {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "24px 2px 12px" }}>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>{title}</span>
      <button onClick={onAction} style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash"), background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>{t("w.explore.seeAll")} →</button>
    </div>
  );
}
