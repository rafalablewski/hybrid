"use client";

import { fs, PLAN_PREVIEWS } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import CoachRail from "./coach-rail";
import FeedPreview from "./feed-preview";
import { AuroraIcon } from "./icons";
import { MetaLine } from "./meta";

const C = (v: string) => `var(--color-${v})`;

/**
 * AURORA Explore (web) — the discovery surface for the Explore tab: search, a
 * coach rail, the plan library, and a community-feed preview. Composed from the
 * shared CoachRail + FeedPreview so it stays in lockstep with the mobile Explore
 * screen (aurora/explore.tsx there).
 */
export default function AuroraExplore({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const { t } = useLang();
  const go = (s: string) => onNavigate?.(s);

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
      <CoachRail onOpen={() => go("coaches")} headerless />

      {/* PLANS — the shipped library, tap through to the full Plans screen */}
      <SectionHead title={t("w.explore.plans")} onAction={() => go("plans")} />
      <div style={{ display: "grid", gap: 10 }}>
        {PLAN_PREVIEWS.map((p) => (
          <button
            key={p.plan.id}
            onClick={() => go("plans")}
            style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 14, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 18, padding: "15px 16px", cursor: "pointer", color: C("chalk") }}
          >
            <span style={{ width: 46, height: 46, borderRadius: 14, flexShrink: 0, display: "grid", placeItems: "center", background: C("ink"), border: `1px solid ${C("line")}`, fontSize: 20, color: C("ash") }}>{p.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: fs.subtitle, letterSpacing: "-.01em" }}>{p.plan.name}</span>
              <MetaLine parts={[p.goalName, p.plan.tag]} style={{ display: "flex", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 4, textTransform: "uppercase", letterSpacing: ".04em" }} />
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.subtitle, color: `color-mix(in srgb, ${C("ash")} 55%, transparent)` }}>›</span>
          </button>
        ))}
      </div>

      {/* COMMUNITY — a left/right slider (max 6) with a trailing "See all" card,
          Threads-style, instead of an ever-growing stacked wall. */}
      <SectionHead title={t("w.explore.community")} onAction={() => go("feed")} />
      <FeedPreview onOpen={() => go("feed")} horizontal />
    </div>
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
