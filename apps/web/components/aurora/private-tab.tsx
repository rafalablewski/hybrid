"use client";

import { useCallback, useEffect, useState } from "react";
import {
  relativeTime, FUNNEL,
  BODY_METRIC_DEFS, metricTrends, sparkHeights, weeklyReport, BODY_VERDICT_KEY,
  fmtMetricValue, fmtMetricDelta, unitToKg,
  type AuroraIconName, type BodyMetric, type MetricTrend, type WeeklyReport, type TrendDirection,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { track } from "@/lib/track";
import { AuroraIcon } from "./icons";

const C = (v: string) => `var(--color-${v})`;
const LIME = "var(--lime-text)";
const dirColor = (d: TrendDirection) => (d === "up" ? LIME : d === "down" ? C("red") : C("ash"));
const dirArrow = (d: TrendDirection) => (d === "up" ? "▲" : d === "down" ? "▼" : "–");

type Entry = { id: string; body: string; createdAt: string };

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

// Body & progress — the dated /api/body history, redesigned as a weekly body
// report (narrative verdict + weight delta + logging cadence) over a trends grid
// of every metric the athlete tracks (each a value, delta and column sparkline).
// Empty until the first log, where it invites the first measurement. Mirrors the
// mobile BodyBlock; all trend maths lives in @hybrid/core (body-progress.ts).
function BodyBlock({ units, onPhotos }: { units: "kg" | "lb"; onPhotos: () => void }) {
  const { t } = useLang();
  const [metrics, setMetrics] = useState<BodyMetric[] | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => { j("/api/body").then((d) => setMetrics(d.metrics ?? [])); }, []);
  useEffect(() => { load(); }, [load]);
  const setField = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    const payload: Record<string, number> = {};
    for (const def of BODY_METRIC_DEFS) {
      const raw = form[def.key];
      if (!raw) continue;
      const n = parseFloat(raw.replace(",", "."));
      if (!Number.isFinite(n) || n <= 0) continue;
      payload[def.key] = def.unit === "weight" ? unitToKg(n, units) : n;
    }
    if (Object.keys(payload).length === 0) return;
    setBusy(true);
    await j("/api/body", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false); setForm({}); setOpen(false); load();
  };

  const has = !!metrics && metrics.length > 0;
  const trends = has ? metricTrends(metrics!) : [];
  const report = has ? weeklyReport(metrics!, Date.now()) : null;
  const subline = has ? `${trends.length} ${t("w.account.profile.priv-metrics")}` : t("w.account.profile.priv-body-s");

  return (
    <div style={{ border: `1px solid ${C("line")}`, borderRadius: 20, background: C("ink2"), padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <IconTile icon="user-square" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: C("chalk") }}>{t("w.account.profile.priv-body-t")}</div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: has ? LIME : C("ash"), marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{metrics === undefined ? "…" : subline}</div>
        </div>
        <button onClick={() => setOpen((v) => !v)} style={{ flex: "none", padding: "7px 12px", borderRadius: 999, border: `1px solid ${C("line")}`, background: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 10, color: C("chalk") }}>{open ? t("common.cancel") : t("w.account.profile.priv-log")}</button>
      </div>

      {open && <LogForm units={units} form={form} setField={setField} onSave={save} busy={busy} />}

      {metrics !== undefined && (has ? (
        <>
          <ReportHero report={report!} units={units} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "18px 0 10px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".18em", textTransform: "uppercase", color: C("ash") }}>{t("w.account.profile.priv-trends")}</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{t("w.account.profile.priv-trends-sub")}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
            {trends.map((tr) => <MetricTile key={tr.def.key} tr={tr} units={units} />)}
          </div>
        </>
      ) : (!open && <EmptyBody onLog={() => setOpen(true)} />))}

      <button onClick={onPhotos} style={{ marginTop: 16, display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, color: LIME }}>
        <AuroraIcon name="eye" size={14} color={LIME} /> {t("w.account.profile.priv-photos")} →
      </button>
    </div>
  );
}

// The weekly body report: mono kicker, a narrative verdict headline, the latest
// weight with its ~7-day delta pill, and a 7-segment logging-cadence meter.
function ReportHero({ report, units }: { report: WeeklyReport; units: "kg" | "lb" }) {
  const { t } = useLang();
  const w = report.latestWeightKg;
  const wv = w != null ? fmtMetricValue(BODY_METRIC_DEFS[0], w, units) : null;
  const d = report.weightDeltaKg;
  const dir: TrendDirection = d == null || Math.abs(d) < 0.05 ? "flat" : d > 0 ? "up" : "down";
  const dstr = d != null ? fmtMetricDelta(BODY_METRIC_DEFS[0], d, units) : null;
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".2em", textTransform: "uppercase", color: C("ash") }}>{t("w.account.profile.priv-report-kicker")}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", lineHeight: 1.1, color: C("chalk"), margin: "9px 0 14px", textWrap: "balance" }}>{t(BODY_VERDICT_KEY[report.verdict])}</div>
      {wv && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 40, fontWeight: 600, lineHeight: 0.85, letterSpacing: "-.03em", color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>{wv.value}<span style={{ fontSize: 15, color: C("ash"), fontWeight: 400, marginLeft: 3 }}>{wv.unit}</span></div>
          {dstr && dir !== "flat" && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, padding: "4px 8px", borderRadius: 8, marginBottom: 6, color: dirColor(dir), background: `color-mix(in srgb, ${dir === "down" ? C("red") : C("lime")} 16%, transparent)` }}>{dirArrow(dir)} {dstr} {units}</span>
          )}
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash"), marginBottom: 7 }}>
          <span>{t("w.account.profile.priv-cadence")}</span>
          <span>{report.cadence} / {report.cadenceOf} {t("w.account.profile.priv-days")}</span>
        </div>
        <div style={{ display: "flex", gap: 5 }}>
          {Array.from({ length: report.cadenceOf }).map((_, i) => (
            <span key={i} style={{ flex: 1, height: 7, borderRadius: 4, background: i < report.cadence ? C("lime") : `color-mix(in srgb, ${C("ash")} 22%, transparent)` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricTile({ tr, units }: { tr: MetricTrend; units: "kg" | "lb" }) {
  const { t } = useLang();
  const { value, unit } = fmtMetricValue(tr.def, tr.latest, units);
  const dstr = tr.delta != null ? fmtMetricDelta(tr.def, tr.delta, units) : null;
  return (
    <div style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 15, padding: "12px 12px 9px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t(tr.def.labelKey)}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, fontWeight: 600, color: dirColor(tr.direction), whiteSpace: "nowrap" }}>{dstr != null ? `${dirArrow(tr.direction)} ${dstr}` : dirArrow(tr.direction)}</span>
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, letterSpacing: "-.02em", color: C("chalk"), lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{value}<span style={{ fontSize: 11, color: C("ash"), fontWeight: 400, marginLeft: 2 }}>{unit}</span></div>
      <Bars heights={sparkHeights(tr.series)} />
    </div>
  );
}

// Dependency-free column sparkline — the latest bar reads bright, the rest muted
// (a flat muted row when `muted`, for the empty-state placeholder tiles).
function Bars({ heights, muted }: { heights: number[]; muted?: boolean }) {
  const H = 28;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: H, marginTop: 2 }}>
      {heights.map((h, i) => {
        const last = i === heights.length - 1;
        const bg = muted ? C("line") : last ? C("lime") : `color-mix(in srgb, ${C("lime")} 26%, transparent)`;
        return <span key={i} style={{ flex: 1, height: Math.max(3, h * H), borderRadius: 2, background: bg }} />;
      })}
    </div>
  );
}

function EmptyBody({ onLog }: { onLog: () => void }) {
  const { t } = useLang();
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".2em", textTransform: "uppercase", color: C("ash") }}>{t("w.account.profile.priv-report-kicker")}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20, letterSpacing: "-.02em", color: C("chalk"), margin: "8px 0 6px", textWrap: "balance" }}>{t("w.account.profile.priv-first-t")}</div>
      <div style={{ fontSize: 13, color: C("ash"), lineHeight: 1.5 }}>{t("w.account.profile.priv-first-s")}</div>
      <button onClick={onLog} style={{ marginTop: 14, width: "100%", background: C("lime"), border: "none", borderRadius: 12, padding: "12px 0", cursor: "pointer", fontWeight: 800, fontSize: 14, color: "var(--on-accent)" }}>＋ {t("w.account.profile.priv-first-cta")}</button>
      <div style={{ margin: "18px 0 10px", fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".18em", textTransform: "uppercase", color: C("ash") }}>{t("w.account.profile.priv-first-track")}</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
        {BODY_METRIC_DEFS.slice(0, 4).map((def) => (
          <div key={def.key} style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 15, padding: "12px 12px 9px", display: "flex", flexDirection: "column", gap: 6, opacity: 0.6 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 9.5, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t(def.labelKey)}</span>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 22, fontWeight: 600, color: C("ash"), lineHeight: 1 }}>—</div>
            <Bars heights={[0.4, 0.4, 0.4, 0.4, 0.4]} muted />
          </div>
        ))}
      </div>
    </div>
  );
}

// The expanded logger — every field the trends grid can surface, all optional;
// weight in the athlete's display unit, tape in cm, body-fat in %.
function LogForm({ units, form, setField, onSave, busy }: { units: "kg" | "lb"; form: Record<string, string>; setField: (k: string, v: string) => void; onSave: () => void; busy: boolean }) {
  const { t } = useLang();
  const unitLabel = (u: string) => (u === "weight" ? units : u === "pct" ? "%" : "cm");
  return (
    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {BODY_METRIC_DEFS.map((def) => (
          <Field key={def.key} value={form[def.key] ?? ""} onChange={(v) => setField(def.key, v)} placeholder={`${t(def.labelKey)} (${unitLabel(def.unit)})`} />
        ))}
      </div>
      <button onClick={onSave} disabled={busy} style={{ background: C("lime"), border: "none", borderRadius: 999, padding: "11px 0", cursor: "pointer", fontWeight: 800, fontSize: 14, color: "var(--on-accent)", opacity: busy ? 0.6 : 1 }}>{t("common.save")}</button>
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
