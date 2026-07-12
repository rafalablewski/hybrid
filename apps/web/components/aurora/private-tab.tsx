"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtWeight, relativeTime, type AuroraIconName } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

const C = (v: string) => `var(--color-${v})`;
const LIME = "var(--lime-text)";

type Entry = { id: string; body: string; createdAt: string };
type Metric = { id: string; measuredAt: string; weightKg: number | null; waistCm: number | null };

const j = async (url: string, opts?: RequestInit) => {
  try { return await (await fetch(url, opts)).json(); } catch { return {}; }
};

// Profile → Private tab (web). Owner-only self-tracking with no other home:
// Command center (analytics live in the Cockpit), Body & progress, Journal, and
// a link out to Settings for privacy/visibility. Icons are a single neutral tone
// (ash) to read as one system with the Settings hub — the hue no longer encodes
// anything. Curating what shows on the public grid now happens on the Overview
// tab (press & hold a card), so there is no Hidden-highlights block here.
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
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), margin: "0 2px 2px" }}>{t("w.account.profile.priv-intro")}</div>

      <Row icon="navigation" title={t("w.account.profile.priv-cockpit-t")} sub={t("w.account.profile.priv-cockpit-s")} onClick={() => nav("cockpit")} />

      {isFull ? <BodyBlock units={units} onPhotos={() => nav("progress")} /> : (
        <LockedRow icon="user-square" title={t("w.account.profile.priv-body-t")} sub={t("w.account.profile.priv-body-s")} onUpgrade={() => nav("upgrade")} />
      )}

      {isFull ? <JournalBlock /> : (
        <LockedRow icon="edit" title={t("w.account.profile.priv-journal-t")} sub={t("w.account.profile.priv-journal-s")} onUpgrade={() => nav("upgrade")} />
      )}

      {/* Privacy & visibility lives in Settings — this is just the way in. */}
      <Row icon="lock" title={t("w.account.profile.priv-privacy-t")} sub={t("w.account.profile.priv-privacy-s")} onClick={() => nav("settings")} />
    </div>
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
    <div style={{ border: `1px solid ${C("line")}`, borderRadius: 16, background: C("ink2"), padding: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconChip icon="user-square" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C("chalk") }}>{t("w.account.profile.priv-body-t")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: latest ? LIME : C("ash"), marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{latest === undefined ? "…" : summary}</div>
        </div>
        <button onClick={() => setOpen((v) => !v)} style={{ flex: "none", padding: "6px 10px", borderRadius: 999, border: `1px solid ${C("line")}`, background: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, color: C("chalk") }}>{open ? t("common.cancel") : t("w.account.profile.priv-log")}</button>
      </div>
      {open && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 8 }}>
            <Field value={weight} onChange={setWeight} placeholder={`${t("w.account.profile.priv-weight")} (${units})`} />
            <Field value={waist} onChange={setWaist} placeholder={`${t("w.account.profile.priv-waist")} (cm)`} />
          </div>
          <button onClick={save} disabled={busy} style={{ background: C("lime"), border: "none", borderRadius: 999, padding: "11px 0", cursor: "pointer", fontWeight: 800, fontSize: 14, color: "var(--on-accent)", opacity: busy ? 0.6 : 1 }}>{t("common.save")}</button>
        </div>
      )}
      <button onClick={onPhotos} style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, color: LIME }}>
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
    <div style={{ border: `1px solid ${C("line")}`, borderRadius: 16, background: C("ink2"), padding: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <IconChip icon="edit" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C("chalk") }}>{t("w.account.profile.priv-journal-t")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), marginTop: 2 }}>{t("w.account.profile.priv-journal-s")}</div>
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
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
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
// A neutral (ash) icon chip — the same anatomy as the Settings list rows, so the
// two owner surfaces read as one system.
function IconChip({ icon }: { icon: AuroraIconName }) {
  return (
    <span style={{ width: 40, height: 40, borderRadius: 13, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${C("ash")} 16%, transparent)` }}>
      <AuroraIcon name={icon} size={20} color={C("ash")} strokeWidth={4} />
    </span>
  );
}

function Row({ icon, title, sub, onClick }: { icon: AuroraIconName; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={title} style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C("line")}`, borderRadius: 16, padding: 13, background: C("ink2"), width: "100%", textAlign: "left", cursor: "pointer" }}>
      <IconChip icon={icon} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: C("chalk") }}>{title}</span>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
      <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 14, color: C("ash") }}>›</span>
    </button>
  );
}

function LockedRow({ icon, title, sub, onUpgrade }: { icon: AuroraIconName; title: string; sub: string; onUpgrade: () => void }) {
  return (
    <button onClick={onUpgrade} aria-label={title} style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C("line")}`, borderRadius: 16, padding: 13, background: C("ink2"), width: "100%", textAlign: "left", cursor: "pointer" }}>
      <IconChip icon={icon} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: C("chalk") }}>{title}</span>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
      <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--premium-accent-text)", border: `1px solid color-mix(in srgb, var(--premium-accent) 45%, transparent)`, borderRadius: 999, padding: "3px 9px" }}>✦ Full</span>
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
