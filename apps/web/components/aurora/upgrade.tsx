"use client";

import { useEffect, useState } from "react";
import { fs, space, FUNNEL } from "@hybrid/core";
import { useSession } from "@/lib/session";
import { setClientPersona } from "@/lib/persona";
import { track } from "@/lib/track";
import { useIsMobile } from "@/lib/use-media-query";

const C = (v: string) => `var(--color-${v})`;
const card = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 } as const;

/**
 * AURORA HYBRID Full — the single upgrade surface, in the rounded Aurora style.
 * Same FUNNEL tracking, billing checkout + paid-flip behaviour as the classic.
 */
const BUNDLE: { kicker: string; color: string; items: { ic: string; nm: string; ds: string }[] }[] = [
  {
    kicker: "Train smarter", color: C("lime"), items: [
      { ic: "▤", nm: "Adaptive plans", ds: "Auto-progression on top of the free plan library." },
      { ic: "◰", nm: "Periodize", ds: "Your season — phases, deloads, peak." },
      { ic: "⊕", nm: "Builder", ds: "Design your own templates." },
      { ic: "▲", nm: "Competition", ds: "Peak on the day." },
    ],
  },
  {
    kicker: "Your performance", color: C("blue"), items: [
      { ic: "◈", nm: "Athlete Twin · HPI", ds: "Strength, endurance & recovery, fused into one index." },
      { ic: "◇", nm: "Injury risk", ds: "Tissue-by-tissue, before it bites." },
      { ic: "↗", nm: "Future self", ds: "Projected strength & goal ETA." },
      { ic: "◷", nm: "Analytics", ds: "Deep dashboards from your logs." },
    ],
  },
  {
    kicker: "Sport & technique", color: C("amber"), items: [
      { ic: "◎", nm: "Sport S&C", ds: "The work that transfers, ranked." },
      { ic: "⚡", nm: "Velocity (VBT)", ds: "Bar speed → estimated 1RM & load." },
      { ic: "◇", nm: "Force plate", ds: "Jump & asymmetry analysis." },
      { ic: "▷", nm: "Video", ds: "Technique & asymmetry capture." },
    ],
  },
  {
    kicker: "Endurance & body", color: C("violet"), items: [
      { ic: "🏃", nm: "Running", ds: "Mileage, pace zones, easy/hard split." },
      { ic: "▦", nm: "Volume", ds: "Sets per muscle · MEV–MRV." },
      { ic: "≡", nm: "Exercises & Trends", ds: "Per-lift progress over time." },
      { ic: "❤", nm: "Longevity", ds: "Biological age & healthspan." },
    ],
  },
];

export default function AuroraUpgrade({ onUpgraded }: { onUpgraded?: () => void }) {
  const { entitlement } = useSession();
  const isMobile = useIsMobile();
  const paid = entitlement === "paid";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { track(FUNNEL.upgradePageView, { client: "web" }); }, []);

  const act = async () => {
    track(FUNNEL.upgradeCtaClick, { client: "web", paid });
    // Paid-but-Simple: no charge — just flip the mode to Full.
    if (paid) { setClientPersona("athlete"); onUpgraded?.(); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { url?: string; configured?: boolean };
      if (res.status === 503 || j.configured === false) { setMsg("Billing isn’t configured on this deployment yet."); setBusy(false); return; }
      if (res.ok && j.url) { window.location.href = j.url; return; }
      setMsg(`Couldn’t start checkout (HTTP ${res.status}).`); setBusy(false);
    } catch { setMsg("Network error — try again."); setBusy(false); }
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
      {busy ? "Starting…" : paid ? "Switch to Full →" : "Upgrade to Full →"}
    </button>
  );

  return (
    <div style={{ maxWidth: 820, fontFamily: "var(--font-display)", color: C("chalk") }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("amber") }}>Full · the upgrade</div>
      <h2 style={{ fontWeight: 900, fontSize: 30, margin: "5px 0 0" }}>Unlock HYBRID Full</h2>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, lineHeight: 1.7, marginTop: 10, maxWidth: 660, color: C("chalk") }}>
        One upgrade turns on the whole athlete toolkit — not a single screen. Your free training stays exactly as it is;
        the depth simply switches on.
      </div>

      {/* hero */}
      <div style={{ marginTop: 18, padding: 22, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", border: `1px solid color-mix(in srgb, ${C("lime")} 40%, transparent)`, background: `linear-gradient(135deg, color-mix(in srgb, ${C("lime")} 13%, transparent), color-mix(in srgb, ${C("violet")} 10%, transparent))` }}>
        <span style={{ fontFamily: "var(--font-display)", fontSize: fs.micro, color: C("lime"), border: `1px solid ${C("lime")}`, borderRadius: 999, padding: "3px 12px", fontWeight: 700 }}>
          12+ pro tools · one subscription
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: space.md, marginTop: 14, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>One subscription · cancel anytime · pricing shown at checkout</span>
        </div>
        <div style={{ marginTop: 14 }}>{CTA}</div>
        {msg && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, marginTop: 10, color: C("amber") }}>{msg}</div>}
      </div>

      {/* flagship — the Cockpit (assembles everything) */}
      <div style={{ ...card, marginTop: 16 }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("lime") }}>The hub — everything in one place</div>
        <div style={{ display: "flex", gap: space.ms, alignItems: "flex-start", marginTop: 10 }}>
          <span style={{ fontSize: fs.subtitle, width: 20, textAlign: "center" }}>◈</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: fs.bodyLg }}>Athlete Cockpit</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, lineHeight: 1.5, color: C("ash") }}>Goal, season, your Twin, sport, velocity &amp; endurance — assembled into one command center.</div>
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
          ? "You’re already paid — this just flips you to Full, no charge."
          : "Cancel anytime. Your logged training is always yours, on the free plan too."}
      </div>
    </div>
  );
}
