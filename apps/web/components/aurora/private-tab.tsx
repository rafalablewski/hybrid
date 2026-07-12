"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtWeight, relativeTime, type Achievement, type AuroraIconName } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

const C = (v: string) => `var(--color-${v})`;
const LIME = "var(--lime-text)";

type Entry = { id: string; body: string; createdAt: string };
type Metric = { id: string; measuredAt: string; weightKg: number | null; waistCm: number | null };

const j = async (url: string, opts?: RequestInit) => {
  try { return await (await fetch(url, opts)).json(); } catch { return {}; }
};

// Profile → Private tab (web). Owner-only self-tracking: Cockpit link (analytics
// live there), Body & progress (measurements + a link to the progress-photos
// screen), Journal, Hidden highlights, Visibility. Mirrors the mobile PrivateTab.
export default function PrivateTab({
  isFull, units, earnedPrs, achievements, hidden, onToggleHidden, nav,
}: {
  isFull: boolean;
  units: "kg" | "lb";
  earnedPrs: [string, number][];
  achievements: Achievement[];
  hidden: string[];
  onToggleHidden: (key: string, next: boolean) => void;
  nav: (screen: string) => void;
}) {
  const { t } = useLang();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), margin: "0 2px 2px" }}>{t("w.account.profile.priv-intro")}</div>

      <Row icon="navigation" tint="blue" title={t("w.account.profile.priv-cockpit-t")} sub={t("w.account.profile.priv-cockpit-s")} onClick={() => nav("cockpit")} />

      {isFull ? <BodyBlock units={units} onPhotos={() => nav("progress")} /> : (
        <LockedRow icon="user-square" tint="lime" title={t("w.account.profile.priv-body-t")} sub={t("w.account.profile.priv-body-s")} onUpgrade={() => nav("upgrade")} />
      )}

      {isFull ? <JournalBlock /> : (
        <LockedRow icon="edit" tint="violet" title={t("w.account.profile.priv-journal-t")} sub={t("w.account.profile.priv-journal-s")} onUpgrade={() => nav("upgrade")} />
      )}

      <HiddenBlock earnedPrs={earnedPrs} achievements={achievements} hidden={hidden} onToggle={onToggleHidden} units={units} />

      {/* Visibility */}
      <div style={{ border: `1px solid ${C("line")}`, borderRadius: 16, padding: 14, background: C("ink2") }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".14em", textTransform: "uppercase", color: C("ash"), marginBottom: 12 }}>{t("w.account.profile.priv-vis-t")}</div>
        <VisRow label={t("w.account.profile.priv-vis-only")} labelColor={LIME} tags={["HPI", "Body", "Journal"]} />
        <div style={{ height: 9 }} />
        <VisRow label={t("w.account.profile.priv-vis-followers")} labelColor={C("ash")} tags={["PRs", t("w.account.profile.spec-streak"), t("w.account.profile.id-sessions")]} />
        <button onClick={() => nav("settings")} style={{ marginTop: 12, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, color: LIME }}>{t("w.account.profile.priv-vis-manage")} →</button>
      </div>
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
    ? [latest.weightKg != null ? fmtWeight(latest.weightKg, units) : null, latest.waistCm != null ? `${t("w.account.profile.priv-waist")} ${Math.round(latest.waistCm)}cm` : null].filter(Boolean).join("  ·  ")
    : t("w.account.profile.priv-body-empty");

  return (
    <div style={{ border: `1px solid ${C("line")}`, borderRadius: 16, background: C("ink2"), padding: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <IconChip icon="user-square" tint="lime" />
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
        <IconChip icon="edit" tint="violet" />
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
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 8.5, color: C("ash") }}>{relativeTime(Date.parse(e.createdAt))} · {t("w.account.profile.priv-vis-only")}</span>
                <button onClick={() => del(e.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 8.5, color: C("ash") }}>{t("common.delete")}</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HiddenBlock({ earnedPrs, achievements, hidden, onToggle, units }: { earnedPrs: [string, number][]; achievements: Achievement[]; hidden: string[]; onToggle: (key: string, next: boolean) => void; units: "kg" | "lb" }) {
  const { t } = useLang();
  const items = [
    ...earnedPrs.map(([lift, e1rm]) => ({ key: `pr:${lift}`, label: `${lift} PR`, value: fmtWeight(e1rm, units), icon: "arrow-up" as AuroraIconName })),
    ...achievements.filter((a) => a.earned).map((a) => ({ key: `badge:${a.id}`, label: a.label, value: "", icon: "verified" as AuroraIconName })),
  ];
  return (
    <div style={{ border: `1px solid ${C("line")}`, borderRadius: 16, background: C("ink2"), padding: 13 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
        <IconChip icon="eye" tint="amber" />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 14, color: C("chalk") }}>{t("w.account.profile.priv-hidden-t")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), marginTop: 2 }}>{t("w.account.profile.priv-hidden-s")}</div>
        </div>
      </div>
      {items.length === 0 ? (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), marginTop: 8 }}>{t("w.account.profile.priv-hidden-empty")}</div>
      ) : (
        <div style={{ marginTop: 6 }}>
          {items.map((it) => {
            const isHidden = hidden.includes(it.key);
            return (
              <div key={it.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderTop: `1px solid ${C("line")}` }}>
                <AuroraIcon name={it.icon} size={16} color={isHidden ? C("ash") : LIME} />
                <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 12.5, color: isHidden ? C("ash") : C("chalk"), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.label}{it.value ? ` · ${it.value}` : ""}</div>
                <button onClick={() => onToggle(it.key, !isHidden)} style={{ flex: "none", padding: "5px 10px", borderRadius: 999, border: `1px solid ${isHidden ? C("line") : "var(--lime-text)"}`, background: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 8.5, color: isHidden ? C("ash") : LIME }}>{isHidden ? t("w.account.profile.priv-show") : t("w.account.profile.priv-hide")}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────────
function IconChip({ icon, tint }: { icon: AuroraIconName; tint: string }) {
  return (
    <span style={{ width: 38, height: 38, borderRadius: 11, flex: "none", display: "grid", placeItems: "center", background: `color-mix(in srgb, ${C(tint)} 20%, transparent)` }}>
      <AuroraIcon name={icon} size={19} color={C(tint)} />
    </span>
  );
}

function Row({ icon, tint, title, sub, onClick }: { icon: AuroraIconName; tint: string; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={title} style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C("line")}`, borderRadius: 16, padding: 13, background: C("ink2"), width: "100%", textAlign: "left", cursor: "pointer" }}>
      <IconChip icon={icon} tint={tint} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: C("chalk") }}>{title}</span>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
      <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 14, color: C("ash") }}>›</span>
    </button>
  );
}

function LockedRow({ icon, tint, title, sub, onUpgrade }: { icon: AuroraIconName; tint: string; title: string; sub: string; onUpgrade: () => void }) {
  return (
    <button onClick={onUpgrade} aria-label={title} style={{ display: "flex", alignItems: "center", gap: 12, border: `1px solid ${C("line")}`, borderRadius: 16, padding: 13, background: C("ink2"), width: "100%", textAlign: "left", cursor: "pointer" }}>
      <IconChip icon={icon} tint={tint} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 14, color: C("chalk") }}>{title}</span>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
      <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 10, color: LIME, border: `1px solid ${C("line")}`, borderRadius: 999, padding: "3px 9px" }}>✦ Full</span>
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

function VisRow({ label, labelColor, tags }: { label: string; labelColor: string; tags: string[] }) {
  return (
    <div style={{ display: "flex", gap: 9 }}>
      <div style={{ width: 70, flex: "none", fontFamily: "var(--font-mono)", fontSize: 8.5, letterSpacing: ".06em", textTransform: "uppercase", color: labelColor }}>{label}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {tags.map((s) => <span key={s} style={{ fontSize: 10, color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 6, padding: "2px 7px" }}>{s}</span>)}
      </div>
    </div>
  );
}
