"use client";

import { fs } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import CoachRail from "./coach-rail";
import FeedPreview from "./feed-preview";
import { AuroraIcon } from "./icons";

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

      {/* COACHES */}
      <SectionHead title={t("w.explore.coaches")} action={t("w.explore.browseAll")} onAction={() => go("coaches")} />
      <CoachRail onOpen={() => go("coaches")} />

      {/* PLANS */}
      <SectionHead title={t("w.explore.plans")} action={t("w.explore.all")} onAction={() => go("plans")} />
      <button
        onClick={() => go("plans")}
        style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, background: C("ink2"), border: `1px solid color-mix(in srgb, ${C("lime")} 34%, transparent)`, borderRadius: 24, padding: 16, cursor: "pointer", color: C("chalk"), boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)" }}
      >
        <span>
          <span style={{ display: "block", fontWeight: 800, fontSize: fs.note }}>{t("w.explore.plansCardTitle")}</span>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginTop: 3 }}>{t("w.explore.plansCardSub")}</span>
        </span>
        <span style={{ fontWeight: 800, fontSize: fs.heading, color: "var(--lime-text)" }}>→</span>
      </button>

      {/* COMMUNITY */}
      <SectionHead title={t("w.explore.community")} action={t("w.explore.feed")} onAction={() => go("feed")} />
      <FeedPreview horizontal onOpen={() => go("feed")} />
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
