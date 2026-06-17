"use client";

import { useEffect, useState } from "react";
import { FUNNEL } from "@hybrid/core";
import { useSession } from "@/lib/session";
import { setClientPersona } from "@/lib/persona";
import { track } from "@/lib/track";
import {
  LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, ON_ACCENT,
  disp, cond, Mono, Card, txt,
} from "@/lib/ui";

/**
 * HYBRID Full — the single upgrade surface. Instead of scattering padlocks
 * across the nav (which both undersells Full as "one screen" and clutters the
 * lean casual app), the whole athlete toolkit is sold on ONE page reached from
 * a single "Unlock Full" entry. The casual nav stays clean.
 */
const BUNDLE: { kicker: string; color: string; items: { ic: string; nm: string; ds: string }[] }[] = [
  {
    kicker: "Train smarter", color: LIME, items: [
      { ic: "◰", nm: "Periodize", ds: "Turn any plan into a season — phases, deloads, peak." },
      { ic: "⊕", nm: "Builder", ds: "Design your OWN plans & templates." },
      { ic: "≡", nm: "Custom exercises", ds: "Add your own movements." },
      { ic: "▲", nm: "Competition", ds: "Peak on the day." },
    ],
  },
  {
    kicker: "Your performance", color: BLUE, items: [
      { ic: "◈", nm: "Athlete Twin · HPI", ds: "Strength, endurance & recovery, fused into one index." },
      { ic: "◇", nm: "Injury risk", ds: "Tissue-by-tissue, before it bites." },
      { ic: "↗", nm: "Future self", ds: "Projected strength & goal ETA." },
      { ic: "◷", nm: "Analytics", ds: "Deep dashboards from your logs." },
    ],
  },
  {
    kicker: "Sport & technique", color: AMBER, items: [
      { ic: "◎", nm: "Sport S&C", ds: "The work that transfers, ranked." },
      { ic: "⚡", nm: "Velocity (VBT)", ds: "Bar speed → estimated 1RM & load." },
      { ic: "◇", nm: "Force plate", ds: "Jump & asymmetry analysis." },
      { ic: "▷", nm: "Video", ds: "Technique & asymmetry capture." },
    ],
  },
  {
    kicker: "Endurance & body", color: VIOLET, items: [
      { ic: "🏃", nm: "Running", ds: "Mileage, pace zones, easy/hard split." },
      { ic: "▦", nm: "Volume", ds: "Sets per muscle · MEV–MRV." },
      { ic: "≡", nm: "Exercises & Trends", ds: "Per-lift progress over time." },
      { ic: "❤", nm: "Longevity", ds: "Biological age & healthspan." },
    ],
  },
];

export default function Upgrade({ onUpgraded }: { onUpgraded?: () => void }) {
  const { entitlement } = useSession();
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
      style={{ ...cond, fontWeight: 800, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", color: ON_ACCENT, background: LIME, border: "none", borderRadius: 12, padding: "13px 26px", cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
    >
      {busy ? "Starting…" : paid ? "Switch to Full →" : "Upgrade to Full →"}
    </button>
  );

  return (
    <div style={{ maxWidth: 820 }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>Full · the upgrade</Mono>
      <h2 style={{ ...disp, fontWeight: 900, fontSize: 30, margin: "5px 0 0" }}>Unlock HYBRID Full</h2>
      <Mono s={{ fontSize: 13, lineHeight: 1.7, display: "block", marginTop: 10, maxWidth: 660 }} c={CHALK}>
        One upgrade turns on the whole athlete toolkit — not a single screen. Your free training stays exactly as it is;
        the depth simply switches on.
      </Mono>

      {/* hero */}
      <div style={{ marginTop: 18, padding: 22, borderRadius: 18, border: `1px solid ${LIME}66`, background: `linear-gradient(135deg, ${LIME}20, ${VIOLET}1a)` }}>
        <span style={{ ...cond, fontSize: 11, color: txt(LIME), border: `1px solid ${LIME}`, borderRadius: 999, padding: "3px 10px", fontWeight: 700 }}>
          12+ pro tools · one subscription
        </span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
          <Mono s={{ fontSize: 12 }}>One subscription · cancel anytime · pricing shown at checkout</Mono>
        </div>
        <div style={{ marginTop: 14 }}>{CTA}</div>
        {msg && <Mono s={{ fontSize: 12, display: "block", marginTop: 10 }} c={AMBER}>{msg}</Mono>}
      </div>

      {/* flagship — the Cockpit (assembles everything) */}
      <Card style={{ borderLeft: `3px solid ${LIME}`, marginTop: 16 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>The hub — everything in one place</Mono>
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 10 }}>
          <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>◈</span>
          <div>
            <div style={{ ...disp, fontWeight: 700, fontSize: 14 }}>Athlete Cockpit</div>
            <Mono s={{ fontSize: 12, lineHeight: 1.5 }}>Goal, season, your Twin, sport, velocity &amp; endurance — assembled into one command center.</Mono>
          </div>
        </div>
      </Card>

      {/* the bundle */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
        {BUNDLE.map((cat) => (
          <Card key={cat.kicker}>
            <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", display: "block", marginBottom: 8 }} c={cat.color}>{cat.kicker}</Mono>
            {cat.items.map((it, i) => (
              <div key={it.nm} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "7px 0", borderTop: i ? `1px solid ${LINE}` : "none" }}>
                <span style={{ fontSize: 15, width: 20, textAlign: "center", color: txt(CHALK) }}>{it.ic}</span>
                <div>
                  <div style={{ ...disp, fontWeight: 700, fontSize: 13.5 }}>{it.nm}</div>
                  <Mono s={{ fontSize: 11, lineHeight: 1.5 }}>{it.ds}</Mono>
                </div>
              </div>
            ))}
          </Card>
        ))}
      </div>

      <div style={{ marginTop: 18 }}>{CTA}</div>
      <Mono s={{ fontSize: 11, display: "block", marginTop: 10 }} c={ASH}>
        {paid
          ? "You’re already paid — this just flips you to Full, no charge."
          : "Cancel anytime. Your logged training is always yours, on the free plan too."}
      </Mono>
    </div>
  );
}
