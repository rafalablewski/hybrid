"use client";

import { useEffect, useState } from "react";
import { fs, space, FUNNEL } from "@hybrid/core";
import { useSession } from "@/lib/session";
import { setClientPersona } from "@/lib/persona";
import { track } from "@/lib/track";
import { useIsMobile } from "@/lib/use-media-query";
import { useLang } from "@/lib/i18n";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;

/**
 * AURORA HYBRID Full — the single upgrade surface, in the rounded Aurora style.
 * Same FUNNEL tracking, billing checkout + paid-flip behaviour as the classic.
 */
const buildBundle = (t: (k: string) => string): { kicker: string; color: string; items: { ic: string; nm: string; ds: string }[] }[] => [
  {
    kicker: t("w.account.upgrade.cat-train"), color: C("lime"), items: [
      { ic: "▤", nm: t("w.account.upgrade.adaptive-plans"), ds: t("w.account.upgrade.adaptive-plans-ds") },
      { ic: "◰", nm: t("w.account.upgrade.periodize"), ds: t("w.account.upgrade.periodize-ds") },
      { ic: "⊕", nm: t("w.account.upgrade.builder"), ds: t("w.account.upgrade.builder-ds") },
      { ic: "▲", nm: t("w.account.upgrade.competition"), ds: t("w.account.upgrade.competition-ds") },
    ],
  },
  {
    kicker: t("w.account.upgrade.cat-performance"), color: C("blue"), items: [
      { ic: "◈", nm: t("w.account.upgrade.athlete-twin"), ds: t("w.account.upgrade.athlete-twin-ds") },
      { ic: "◇", nm: t("w.account.upgrade.injury-risk"), ds: t("w.account.upgrade.injury-risk-ds") },
      { ic: "↗", nm: t("w.account.upgrade.future-self"), ds: t("w.account.upgrade.future-self-ds") },
      { ic: "◷", nm: t("w.account.upgrade.analytics"), ds: t("w.account.upgrade.analytics-ds") },
    ],
  },
  {
    kicker: t("w.account.upgrade.cat-sport"), color: C("amber"), items: [
      { ic: "◎", nm: t("w.account.upgrade.sport-sc"), ds: t("w.account.upgrade.sport-sc-ds") },
      { ic: "⚡", nm: t("w.account.upgrade.velocity"), ds: t("w.account.upgrade.velocity-ds") },
      { ic: "◇", nm: t("w.account.upgrade.force-plate"), ds: t("w.account.upgrade.force-plate-ds") },
      { ic: "▷", nm: t("w.account.upgrade.video"), ds: t("w.account.upgrade.video-ds") },
    ],
  },
  {
    kicker: t("w.account.upgrade.cat-endurance"), color: C("violet"), items: [
      { ic: "🏃", nm: t("w.account.upgrade.running"), ds: t("w.account.upgrade.running-ds") },
      { ic: "▦", nm: t("w.account.upgrade.volume"), ds: t("w.account.upgrade.volume-ds") },
      { ic: "≡", nm: t("w.account.upgrade.exercises-trends"), ds: t("w.account.upgrade.exercises-trends-ds") },
      { ic: "❤", nm: t("w.account.upgrade.longevity"), ds: t("w.account.upgrade.longevity-ds") },
    ],
  },
];

export default function AuroraUpgrade({ onUpgraded }: { onUpgraded?: () => void }) {
  const { t } = useLang();
  const { entitlement } = useSession();
  const isMobile = useIsMobile();
  const paid = entitlement === "paid";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const BUNDLE = buildBundle(t);

  useEffect(() => { track(FUNNEL.upgradePageView, { client: "web" }); }, []);

  const act = async () => {
    track(FUNNEL.upgradeCtaClick, { client: "web", paid });
    // Paid-but-Simple: no charge — just flip the mode to Full.
    if (paid) { setClientPersona("athlete"); onUpgraded?.(); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { url?: string; configured?: boolean };
      if (res.status === 503 || j.configured === false) { setMsg(t("w.account.upgrade.billing-unconfigured")); setBusy(false); return; }
      if (res.ok && j.url) { window.location.href = j.url; return; }
      setMsg(`${t("w.account.upgrade.checkout-failed")} (HTTP ${res.status}).`); setBusy(false);
    } catch { setMsg(t("w.account.upgrade.network-error")); setBusy(false); }
  };

  const CTA = (
    <button
      onClick={act}
      disabled={busy}
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 800,
        fontSize: fs.note,
        textTransform: "uppercase",
        letterSpacing: ".04em",
        color: C("ink"),
        background: C("lime"),
        border: "none",
        borderRadius: 999,
        padding: "14px 28px",
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.6 : 1,
      }}
    >
      {busy ? t("w.account.upgrade.starting") : paid ? `${t("w.account.upgrade.switch-full")} →` : `${t("w.account.upgrade.upgrade-full")} →`}
    </button>
  );

  return (
    <div style={{ maxWidth: 820, fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("amber") }}>{t("w.account.upgrade.kicker")}</div>
      <h2 style={{ fontWeight: 900, fontSize: 30, margin: "5px 0 0" }}>{t("w.account.upgrade.headline")}</h2>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.7, marginTop: 10, maxWidth: 660, color: C("chalk") }}>
        {t("w.account.upgrade.intro")}
      </div>

      {/* hero */}
      <div style={{ marginTop: 18, padding: 22, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", border: `1px solid color-mix(in srgb, ${C("lime")} 40%, transparent)`, background: `linear-gradient(135deg, color-mix(in srgb, ${C("lime")} 13%, transparent), color-mix(in srgb, ${C("violet")} 10%, transparent))` }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: fs.micro, color: C("lime"), border: `1px solid ${C("lime")}`, borderRadius: 999, padding: "3px 12px", fontWeight: 700 }}>
          {t("w.account.upgrade.hero-badge")}
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: space.md, marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>{t("w.account.upgrade.hero-sub")}</span>
        </div>
        <div style={{ marginTop: 14 }}>{CTA}</div>
        {msg && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 10, color: C("amber") }}>{msg}</div>}
      </div>

      {/* flagship — the Cockpit (assembles everything) */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>{t("w.account.upgrade.hub-kicker")}</div>
        <div style={{ display: "flex", gap: space.ms, alignItems: "flex-start", marginTop: 10 }}>
          <span style={{ fontSize: fs.subtitle, width: 20, textAlign: "center" }}>◈</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: fs.bodyLg }}>{t("w.account.upgrade.cockpit")}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, lineHeight: 1.5, color: C("ash") }}>{t("w.account.upgrade.cockpit-ds")}</div>
          </div>
        </div>
      </div>

      {/* the bundle */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginTop: 14 }}>
        {BUNDLE.map((cat) => (
          <div key={cat.kicker} style={card}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 8, color: cat.color }}>{cat.kicker}</div>
            {cat.items.map((it, i) => (
              <div key={it.nm} style={{ display: "flex", gap: space.ms, alignItems: "flex-start", padding: "7px 0", borderTop: i ? `1px solid ${C("line")}` : "none" }}>
                <span style={{ fontSize: fs.note, width: 20, textAlign: "center", color: C("chalk") }}>{it.ic}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{it.nm}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, lineHeight: 1.5, color: C("ash") }}>{it.ds}</div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>{CTA}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, marginTop: 10, color: C("ash") }}>
        {paid
          ? t("w.account.upgrade.footer-paid")
          : t("w.account.upgrade.footer-free")}
      </div>
    </div>
  );
}
