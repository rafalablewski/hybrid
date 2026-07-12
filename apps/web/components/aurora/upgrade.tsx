"use client";

import { useEffect, useState } from "react";
import { fs, FUNNEL } from "@hybrid/core";
import { useSession } from "@/lib/session";
import { setClientPersona } from "@/lib/persona";
import { track } from "@/lib/track";
import { useLang } from "@/lib/i18n";
import Sheet from "./sheet";

const C = (v: string) => `var(--color-${v})`;

// The Full toolkit, sold as one concise sheet (mirrors the mobile upgrade sheet
// in aurora/upgrade.tsx so both clients read identically).
const BENEFITS: { t: string; d: string }[] = [
  { t: "Cockpit — auto-adjusting loads", d: "Every set reshaped to your readiness & fatigue" },
  { t: "Sport plans", d: "Periodised programs for tennis, running, Hyrox & more" },
  { t: "Pre-made meals & auto macros", d: "Skip manual entry — tap to log, targets split for you" },
  { t: "Full plan library", d: "All 5 discipline programs, unlocked" },
];

/**
 * AURORA Upgrade — a slide-up BOTTOM SHEET paywall (web), hosted in the shared
 * Sheet primitive so it slides up over the current screen. Same Stripe Checkout
 * / paid-flip billing as before; mirrors the mobile upgrade sheet exactly.
 */
export default function AuroraUpgrade({ open, onClose, onUpgraded }: { open: boolean; onClose: () => void; onUpgraded?: () => void }) {
  const { t } = useLang();
  const { entitlement } = useSession();
  const paid = entitlement === "paid";
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (open) track(FUNNEL.upgradePageView, { client: "web" }); }, [open]);

  const act = async () => {
    track(FUNNEL.upgradeCtaClick, { client: "web", paid });
    // Paid-but-Simple: no charge — just flip the mode to Full.
    if (paid) { setClientPersona("athlete"); onUpgraded?.(); onClose(); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/billing/checkout", { method: "POST" });
      const j = (await res.json().catch(() => ({}))) as { url?: string; configured?: boolean };
      if (res.status === 503 || j.configured === false) { setMsg(t("w.account.upgrade.billing-unconfigured")); setBusy(false); return; }
      if (res.ok && j.url) { window.location.href = j.url; return; }
      setMsg(`${t("w.account.upgrade.checkout-failed")} (HTTP ${res.status}).`); setBusy(false);
    } catch { setMsg(t("w.account.upgrade.network-error")); setBusy(false); }
  };

  return (
    <Sheet open={open} onClose={onClose} maxWidth={440} label={t("w.account.upgrade.sheet-title")}>
      {/* badge */}
      <div style={{ display: "flex", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--amber-text)", background: `color-mix(in srgb, ${C("amber")} 16%, transparent)`, borderRadius: 999, padding: "6px 13px" }}>✦ Full</span>
      </div>

      <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 26, letterSpacing: "-.02em", color: C("chalk"), textAlign: "center", marginTop: 14 }}>{t("w.account.upgrade.sheet-title")}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>{t("w.account.upgrade.sheet-sub")}</div>

      {/* benefits */}
      <div style={{ marginTop: 18 }}>
        {BENEFITS.map((b, i) => (
          <div key={b.t} style={{ display: "flex", gap: 12, padding: "12px 0", borderTop: i ? `1px solid ${C("line")}` : "none" }}>
            <span style={{ fontSize: 15, color: "var(--amber-text)", marginTop: 1 }}>{paid ? "✓" : "✦"}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 14.5, color: C("chalk") }}>{b.t}</div>
              <div style={{ fontSize: 12.5, color: C("ash"), marginTop: 1, lineHeight: 1.4 }}>{b.d}</div>
            </div>
          </div>
        ))}
      </div>

      {/* price */}
      <div style={{ textAlign: "center", marginTop: 18 }}>
        <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 28, letterSpacing: "-.02em", color: C("chalk") }}>
          $9.99<span style={{ fontWeight: 400, fontSize: 14, color: C("ash") }}> {t("w.account.upgrade.per-month")}</span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--lime-text)", marginTop: 3, letterSpacing: ".02em" }}>{t("w.account.upgrade.trial-note")}</div>
      </div>

      {msg && <div role="alert" style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("red"), marginTop: 14, textAlign: "center", lineHeight: 1.5 }}>{msg}</div>}

      {/* CTA */}
      <button
        onClick={act}
        disabled={busy}
        // sand (#d0cd94) is a theme-fixed LIGHT fill, so the ink on it is a fixed near-black (not --color-ink, which flips light in the light theme)
        style={{ width: "100%", fontFamily: "var(--font-display)", fontWeight: 800, fontSize: fs.subtitle, color: "#141614", background: C("amber"), border: "none", borderRadius: 16, padding: "16px", marginTop: 16, cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1 }}
      >
        {busy ? t("w.account.upgrade.starting") : paid ? `${t("w.account.upgrade.switch-full")}` : t("w.account.upgrade.start-trial")}
      </button>
      <button onClick={onClose} style={{ width: "100%", background: "none", border: "none", padding: "14px", marginTop: 4, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.body, color: C("chalk"), cursor: "pointer" }}>{t("w.account.upgrade.maybe-later")}</button>
    </Sheet>
  );
}
