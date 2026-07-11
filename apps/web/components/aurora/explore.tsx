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

      {/* COACHES — CoachRail renders its OWN "Follow a coach" header + Browse all */}
      <div style={{ marginTop: 20 }}>
        <CoachRail onOpen={() => go("coaches")} />
      </div>

      {/* PLANS — the shipped library, tap through to the full Plans screen */}
      <SectionHead title={t("w.explore.plans")} action={t("w.explore.all")} onAction={() => go("plans")} />
      <div style={{ display: "grid", gap: 10 }}>
        {PLAN_PREVIEWS.map((p) => (
          <button
            key={p.plan.id}
            onClick={() => go("plans")}
            style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 14, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: 14, cursor: "pointer", color: C("chalk") }}
          >
            <span style={{ width: 44, height: 44, borderRadius: 13, display: "grid", placeItems: "center", background: `color-mix(in srgb, ${p.color} 16%, transparent)`, fontSize: 22, color: p.color }}>{p.icon}</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: fs.note }}>{p.plan.name}</span>
              <MetaLine parts={[p.goalName, p.plan.tag]} style={{ display: "flex", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 2, textTransform: "uppercase", letterSpacing: ".04em" }} />
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, color: C("ash") }}>›</span>
          </button>
        ))}
      </div>

      {/* COMMUNITY */}
      <SectionHead title={t("w.explore.community")} action={t("w.explore.feed")} onAction={() => go("feed")} />
      <FeedPreview onOpen={() => go("feed")} />
    </div>
  );
}

function SectionHead({ title, action, onAction }: { title: string; action: string; onAction: () => void }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "24px 2px 12px" }}>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, color: C("chalk") }}>{title}</span>
      <button onClick={onAction} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap" }}>{action} →</button>
    </div>
  );
}
