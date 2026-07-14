"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtWeight, relativeTime, FUNNEL, type AuroraIconName } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { track } from "@/lib/track";
import { AuroraIcon } from "./icons";

const C = (v: string) => `var(--color-${v})`;
const LIME = "var(--lime-text)";

type Entry = { id: string; body: string; createdAt: string };
type Metric = { id: string; measuredAt: string; weightKg: number | null; waistCm: number | null };

const j = async (url: string, opts?: RequestInit) => {
  try { return await (await fetch(url, opts)).json(); } catch { return {}; }
};

// Profile → Private tab (web). Owner-only self-tracking, now on the same Jony-Ive
// material vocabulary as Today: the Command center leads as a premium HERO card
// (the paid intelligence layer — glow + serif title + an Unlock/Open CTA, twin of
// Today's Go-Full Cockpit card), then Body & progress and Journal ride refined
// instrument cards with crafted icon tiles lifted off the darker ink, and Privacy
// & visibility closes as a quiet link out to Settings. Body & progress and Journal
// are FREE (never gated) — only the Command center carries the Full unlock.
// Mirrors the mobile PrivateTab.
export default function PrivateTab({
  isFull, units, nav,
}: {
  isFull: boolean;
  units: "kg" | "lb";
  nav: (screen: string) => void;
}) {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), margin: "0 2px 2px" }}>{t("w.account.profile.priv-intro")}</div>

      {/* Command center — the paid intelligence layer, led as a premium hero
          (twin of Today's Go-Full Cockpit card). Full → open the Cockpit; free →
          the Unlock upsell (funnelled, not fulfilled). */}
      <CommandCenterCard
        locked={!isFull}
        onClick={() => {
          if (isFull) { nav("cockpit"); return; }
          track(FUNNEL.upgradeEntryClick, { client: "web", source: "private-cockpit" });
          nav("upgrade");
        }}
      />

      {/* Body & progress — FREE. */}
      <BodyBlock units={units} onPhotos={() => nav("progress")} />

      {/* Journal — FREE. */}
      <JournalBlock />

      {/* Privacy & visibility lives in Settings — this is just the way in. */}
      <Row icon="lock" title={t("w.account.profile.priv-privacy-t")} sub={t("w.account.profile.priv-privacy-s")} onClick={() => nav("settings")} />
    </div>
  );
}

// ── Command center (premium hero) ─────────────────────────────────────────────
// The paid intelligence layer, presented like Today's "Go Full" Cockpit card: an
// admin-accent glow blooming from the top-right, a serif title, a crafted icon
// tile, and a CTA that reads "Open" when owned and "Unlock with Full" when not.
function CommandCenterCard({ locked, onClick }: { locked: boolean; onClick: () => void }) {
  const { t } = useLang();
  return (
    <button
      onClick={onClick}
      aria-label={t("w.account.profile.priv-cockpit-t")}
      style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 20, background: `radial-gradient(120% 80% at 88% -10%, color-mix(in srgb, var(--premium-accent) 14%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--premium-accent) 5%, ${C("ink2")}), ${C("ink2")})`, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)" }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 48, height: 48, borderRadius: 15, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--premium-accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--premium-accent) 35%, transparent)" }}>
          <AuroraIcon name="navigation" size={22} color="var(--premium-accent-text)" strokeWidth={4} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", color: C("chalk") }}>{t("w.account.profile.priv-cockpit-t")}</span>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), marginTop: 3 }}>{t("w.account.profile.priv-cockpit-s")}</span>
        </span>
      </span>
      <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--premium-accent-text)", marginTop: 18 }}>
        {locked ? `${t("w.home.today.cardUnlock")} →` : `${t("w.home.today.cardOpen")} →`}
      </span>
    </button>
  );
}

function BodyBlock({ units, onPhotos }: { units: "kg" | "lb"; onPhotos: () => void }) {
  const { t } = useLang();
  const [latest, setLatest] = useState<Metric | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { j("/api/body").then((d) => setLatest(d.metrics?.[0] ?? null)); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const w = parseFloat(weight.replace(",", ".")); const wc = parseFloat(waist.replace(",", "."));
    const weightKg = Number.isFinite(w) && w > 0 ? (units === "lb" ? w / 2.2046226218 : w) : undefined;
    const waistCm = Number.isFinite(wc) && wc > 0 ? wc : undefined;
    if (weightKg == null && waistCm == null) return;
    setBusy(true);
    await j("/api/body", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weightKg, waistCm }) });
    setBusy(false); setWeight(""); setWaist(""); setOpen(false); load();
  };

  const summary = latest
    ? [latest.weightKg != null ? fmtWeight(latest.weightKg, units) : null, latest.waistCm != null ? `${t("w.account.profile.priv-waist")} ${Math.round(latest.waistCm)}cm` : null].filter(Boolean).join("    ")
    : t("w.account.profile.priv-body-empty");

  return (
    <div style={{ border: `1px solid ${C("line")}`, borderRadius: 20, background: C("ink2"), padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <IconTile icon="user-square" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: C("chalk") }}>{t("w.account.profile.priv-body-t")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: latest ? LIME : C("ash"), marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{latest === undefined ? "…" : summary}</div>
        </div>
        <button onClick={() => setOpen((v) => !v)} style={{ flex: "none", padding: "7px 12px", borderRadius: 999, border: `1px solid ${C("line")}`, background: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, color: C("chalk") }}>{open ? t("common.cancel") : t("w.account.profile.priv-log")}</button>
      </div>
      {open && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Field value={weight} onChange={setWeight} placeholder={`${t("w.account.profile.priv-weight")} (${units})`} />
            <Field value={waist} onChange={setWaist} placeholder={`${t("w.account.profile.priv-waist")} (cm)`} />
          </div>
          <button onClick={save} disabled={busy} style={{ background: C("lime"), border: "none", borderRadius: 999, padding: "11px 0", cursor: "pointer", fontWeight: 800, fontSize: 14, color: "var(--on-accent)", opacity: busy ? 0.6 : 1 }}>{t("common.save")}</button>
        </div>
      )}
      <button onClick={onPhotos} style={{ marginTop: 14, display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, color: LIME }}>
        <AuroraIcon name="eye" size={14} color={LIME} /> {t("w.account.profile.priv-photos")} →
      </button>
    </div>
  );
}

function JournalBlock() {
  const { t } = useLang();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { j("/api/journal").then((d) => setEntries(d.entries ?? [])); }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const body = draft.trim(); if (!body) return;
    setBusy(true);
    await j("/api/journal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    setBusy(false); setDraft(""); load();
  };
  const del = async (id: string) => { await j(`/api/journal?id=${encodeURIComponent(id)}`, { method: "DELETE" }); load(); };

  return (
    <div style={{ border: `1px solid ${C("line")}`, borderRadius: 20, background: C("ink2"), padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <IconTile icon="edit" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: C("chalk") }}>{t("w.account.profile.priv-journal-t")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), marginTop: 3 }}>{t("w.account.profile.priv-journal-s")}</div>
        </div>
      </div>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t("w.account.profile.priv-journal-ph")}
        rows={2}
        style={{ width: "100%", boxSizing: "border-box", resize: "vertical", fontFamily: "var(--font-display)", fontSize: 14, color: C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 12, padding: "10px 12px" }}
      />
      {draft.trim().length > 0 && (
        <button onClick={save} disabled={busy} style={{ marginTop: 8, background: C("lime"), border: "none", borderRadius: 999, padding: "8px 16px", cursor: "pointer", fontWeight: 800, fontSize: 12, color: "var(--on-accent)", opacity: busy ? 0.6 : 1 }}>{t("w.account.profile.priv-journal-add")}</button>
      )}
      {entries && entries.length > 0 && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.slice(0, 4).map((e) => (
            <div key={e.id} style={{ borderTop: `1px solid ${C("line")}`, paddingTop: 10 }}>
              <div style={{ fontSize: 12.5, color: C("chalk"), lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{e.body}</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 5 }}>
                <span style={{ display: "inline-flex", gap: 8, fontFamily: "var(--font-mono)", fontSize: 8.5, color: C("ash") }}>
                  <span>{relativeTime(Date.parse(e.createdAt))}</span>
                  <span style={{ opacity: 0.7 }}>{t("w.account.profile.priv-vis-only")}</span>
                </span>
                <button onClick={() => del(e.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 8.5, color: C("ash") }}>{t("common.delete")}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────────
// A crafted icon tile drawn on the darker ink so it lifts off the card — the same
// material anatomy as Today's deferred rows, so the owner surfaces read as one
// system.
function IconTile({ icon }: { icon: AuroraIconName }) {
  return (
    <span style={{ width: 46, height: 46, borderRadius: 14, flex: "none", display: "grid", placeItems: "center", background: C("ink"), border: `1px solid ${C("line")}` }}>
      <AuroraIcon name={icon} size={20} color={C("ash")} strokeWidth={4} />
    </span>
  );
}

function Row({ icon, title, sub, onClick }: { icon: AuroraIconName; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={title} style={{ display: "flex", alignItems: "center", gap: 14, border: `1px solid ${C("line")}`, borderRadius: 20, padding: 16, background: C("ink2"), width: "100%", textAlign: "left", cursor: "pointer" }}>
      <IconTile icon={icon} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 16, color: C("chalk") }}>{title}</span>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
      <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 16, color: `color-mix(in srgb, ${C("ash")} 55%, transparent)` }}>›</span>
    </button>
  );
}

function Field({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      inputMode="decimal"
      style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-display)", fontSize: 14, color: C("chalk"), background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 12, padding: "10px 12px" }}
    />
  );
}
