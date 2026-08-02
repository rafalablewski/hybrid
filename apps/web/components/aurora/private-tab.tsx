"use client";

import { useCallback, useEffect, useState } from "react";
import {
  FUNNEL,
  BODY_METRIC_DEFS, metricTrends, sparkHeights, weeklyReport, BODY_VERDICT_KEY,
  fmtMetricValue, fmtMetricDelta, unitToKg, isDecimalInput,
  latestHeightCm, fmtHeight, displayHeight, storeHeightCm, heightUnitFor,
  type AuroraIconName, type BodyMetric, type MetricTrend, type WeeklyReport, type TrendDirection,
} from "@hybrid/core";
import { refreshBodyweight } from "@/lib/use-bodyweight";
import { useLang } from "@/lib/i18n";
import { track } from "@/lib/track";
import { AuroraIcon } from "./icons";
import Sheet from "./sheet";

const C = (v: string) => `var(--color-${v})`;
const LIME = "var(--lime-text)";
const dirColor = (d: TrendDirection) => (d === "up" ? LIME : d === "down" ? C("red") : C("ash"));
const dirArrow = (d: TrendDirection) => (d === "up" ? "▲" : d === "down" ? "▼" : "–");

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
          if (isFull) { nav("performance"); return; }
          track(FUNNEL.upgradeEntryClick, { client: "web", source: "private-cockpit" });
          nav("upgrade");
        }}
      />

      {/* Body & progress — FREE. */}
      <BodyBlock units={units} onPhotos={() => nav("progress")} />

      {/* Private training reflection now lives ON each workout (finish screen +
          history), not in a standalone journal — see Session note. */}

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
      style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer", color: C("chalk"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20, background: `radial-gradient(120% 80% at 88% -10%, color-mix(in srgb, var(--premium-accent) 14%, transparent), transparent 55%), linear-gradient(180deg, color-mix(in srgb, var(--premium-accent) 5%, ${C("ink2")}), ${C("ink2")})`, boxShadow: "var(--shadow-card)" }}
    >
      <span style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <span style={{ width: 48, height: 48, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: "color-mix(in srgb, var(--premium-accent) 14%, transparent)", border: "1px solid color-mix(in srgb, var(--premium-accent) 35%, transparent)" }}>
          <AuroraIcon name="navigation" size={22} color="var(--premium-accent-text)" strokeWidth={4} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", color: C("chalk") }}>{t("w.account.profile.priv-cockpit-t")}</span>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), marginTop: 3 }}>{t("w.account.profile.priv-cockpit-s")}</span>
        </span>
      </span>
      <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--premium-accent-text)", marginTop: 18 }}>
        {locked ? `${t("w.home.today.cardUnlock")} →` : `${t("w.home.today.cardOpen")} →`}
      </span>
    </button>
  );
}

// Body & progress — now a COMPACT card (the same nutrition-row idiom as Today's
// "Nutrition" / "Follow a coach" rows): a crafted icon tile, the title, a live
// subline (latest weight + how many metrics are tracked), and a chevron. Tapping
// anywhere opens the slide-up sheet, which LEADS with the log-measurement form —
// exactly like "Add a meal" opens from the Nutrition row — then unfolds the
// weekly body report (narrative verdict + weight delta + logging cadence), the
// per-metric trends grid, and the progress-photos link beneath it. Empty until
// the first log; all trend maths lives in @hybrid/core (body-progress.ts).
// Mirrors the mobile BodyBlock.
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
    const res = await j("/api/body", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    // `j` swallows failures into {} and a 400 returns {error}; only a real
    // create returns {metric}. Keep the form open otherwise so nothing is lost.
    if (res?.metric) { setForm({}); setOpen(false); load(); }
  };

  const has = !!metrics && metrics.length > 0;
  const trends = has ? metricTrends(metrics!) : [];
  const report = has ? weeklyReport(metrics!, Date.now()) : null;
  const heightCm = metrics ? latestHeightCm(metrics) : null;
  // Collapsed subline — lead with the latest weight when we have one (the big
  // number the expanded card used to show), then the height (it is set once and
  // otherwise invisible), then how many metrics are tracked; otherwise the
  // "what this is" descriptor. A spaced en dash joins them, never a middot.
  const wv = report?.latestWeightKg != null ? fmtMetricValue(BODY_METRIC_DEFS[0], report.latestWeightKg, units) : null;
  const subline =
    metrics === undefined ? "…"
    : has ? [wv ? `${wv.value} ${wv.unit}` : null, heightCm != null ? fmtHeight(heightCm, units) : null, `${trends.length} ${t("w.account.profile.priv-metrics")}`].filter(Boolean).join(" – ")
    : t("w.account.profile.priv-body-s");

  return (
    <>
      {/* Collapsed card — whole surface tappable, opens the log sheet. */}
      <button
        onClick={() => setOpen(true)}
        aria-label={t("w.account.profile.priv-body-t")}
        style={{ display: "flex", alignItems: "center", gap: 14, border: `1px solid ${C("line")}`, borderRadius: 28, padding: 16, background: C("ink2"), width: "100%", textAlign: "left", cursor: "pointer" }}
      >
        <IconTile icon="user-square" />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: 16, color: C("chalk") }}>{t("w.account.profile.priv-body-t")}</span>
          <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 12, color: has ? LIME : C("ash"), marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{subline}</span>
        </span>
        <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 16, color: `color-mix(in srgb, ${C("ash")} 55%, transparent)` }}>›</span>
      </button>

      {/* The sheet — leads with "all the log measurements" (the same shared Sheet
          Today uses for "Add a meal"), then the weekly report, the trends grid
          and the progress-photos link. */}
      <Sheet open={open} onClose={() => setOpen(false)} title={t("w.account.profile.priv-body-t")} sub={t("w.account.profile.priv-body-s")}>
        {/* Height leads, and saves on its OWN — it is a standing fact rather
            than a weigh-in, so it must not have to ride along with one. */}
        <HeightRow units={units} heightCm={heightCm} onSaved={() => { load(); refreshBodyweight(); }} />
        <LogForm units={units} form={form} setField={setField} onSave={save} busy={busy} />

        {metrics !== undefined && has && (
          <>
            <ReportHero report={report!} units={units} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "18px 0 10px" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.account.profile.priv-trends")}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash") }}>{t("w.account.profile.priv-trends-sub")}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {trends.map((tr) => <MetricTile key={tr.def.key} tr={tr} units={units} />)}
            </div>
          </>
        )}

        <button onClick={onPhotos} style={{ marginTop: 18, display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 12, color: LIME }}>
          <AuroraIcon name="eye" size={14} color={LIME} /> {t("w.account.profile.priv-photos")} →
        </button>
      </Sheet>
    </>
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
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.account.profile.priv-report-kicker")}</div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, letterSpacing: "-.02em", lineHeight: 1.1, color: C("chalk"), margin: "8px 0 14px", textWrap: "balance" }}>{t(BODY_VERDICT_KEY[report.verdict])}</div>
      {wv && (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 12 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 40, fontWeight: 600, lineHeight: 0.85, letterSpacing: "-.03em", color: C("chalk"), fontVariantNumeric: "tabular-nums" }}>{wv.value}<span style={{ fontSize: 15, color: C("ash"), fontWeight: 400, marginLeft: 3 }}>{wv.unit}</span></div>
          {dstr && dir !== "flat" && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, padding: "4px 8px", borderRadius: 12, marginBottom: 6, color: dirColor(dir), background: `color-mix(in srgb, ${dir === "down" ? C("red") : C("lime")} 16%, transparent)` }}>{dirArrow(dir)} {dstr} {units}</span>
          )}
        </div>
      )}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash"), marginBottom: 8 }}>
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
    <div style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 12px 8px", display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t(tr.def.labelKey)}</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: dirColor(tr.direction), whiteSpace: "nowrap" }}>{dstr != null ? `${dirArrow(tr.direction)} ${dstr}` : dirArrow(tr.direction)}</span>
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

// The expanded logger — every field the trends grid can surface, all optional;
// weight in the athlete's display unit, tape in cm, body-fat in %. Each metric
// is a labelled big-number tile, the same quick-add anatomy as Today's "Add a
// meal" quadrant (dot + mono label, borderless display number, unit suffix).
function LogForm({ units, form, setField, onSave, busy }: { units: "kg" | "lb"; form: Record<string, string>; setField: (k: string, v: string) => void; onSave: () => void; busy: boolean }) {
  const { t } = useLang();
  const unitLabel = (u: string) => (u === "weight" ? units : u === "pct" ? "%" : "cm");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)", gap: 10 }}>
        {BODY_METRIC_DEFS.map((def) => (
          <MetricInput key={def.key} label={t(def.labelKey)} unit={unitLabel(def.unit)} value={form[def.key] ?? ""} onChange={(v) => setField(def.key, v)} />
        ))}
      </div>
      <button onClick={onSave} disabled={busy} style={{ background: C("lime"), border: "none", borderRadius: 999, padding: "16px 0", cursor: "pointer", fontWeight: 700, fontSize: 16, color: "var(--on-accent)", opacity: busy ? 0.6 : 1, marginTop: 2 }}>{t("common.save")}</button>
    </div>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────────
// A crafted icon tile drawn on the darker ink so it lifts off the card — the same
// material anatomy as Today's deferred rows, so the owner surfaces read as one
// system.
function IconTile({ icon }: { icon: AuroraIconName }) {
  return (
    <span style={{ width: 46, height: 46, borderRadius: 12, flex: "none", display: "grid", placeItems: "center", background: C("ink"), border: `1px solid ${C("line")}` }}>
      <AuroraIcon name={icon} size={20} color={C("ash")} strokeWidth={4} />
    </span>
  );
}

function Row({ icon, title, sub, onClick }: { icon: AuroraIconName; title: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={title} style={{ display: "flex", alignItems: "center", gap: 14, border: `1px solid ${C("line")}`, borderRadius: 28, padding: 16, background: C("ink2"), width: "100%", textAlign: "left", cursor: "pointer" }}>
      <IconTile icon={icon} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, fontSize: 16, color: C("chalk") }}>{title}</span>
        <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{sub}</span>
      </span>
      <span style={{ flex: "none", fontFamily: "var(--font-mono)", fontSize: 16, color: `color-mix(in srgb, ${C("ash")} 55%, transparent)` }}>›</span>
    </button>
  );
}

// One measurement tile — mirrors Today's "Add a meal" quadrant: a lime dot +
// mono label up top, a big borderless display-number input, and the unit as a
// quiet mono suffix. Empty reads as a muted "0" placeholder.
/**
 * STANDING HEIGHT — one field, its own save.
 *
 * It sits apart from the measurement grid on purpose. The grid is things that
 * MOVE: you log a weight, a waist, a body-fat reading, and the point is the
 * trend. Height is a fact you state once, and burying it among the tape lines
 * would both hide it (nobody scrolls a weigh-in form looking for it) and imply
 * you should re-enter it every session. So it saves independently: nothing else
 * on the form has to be filled in for a height to land.
 *
 * WHY THE APP ASKS. Bodyweight alone can't tell a 160 cm athlete from a 200 cm
 * one, and they are not carrying the same frame at the same 80 kg — the volume
 * model's recovery factor compares mass to what the height predicts rather than
 * docking raw kilos (core frameAdjustedMassKg). The copy says that, because a
 * field that doesn't explain itself just reads as one more thing to fill in.
 *
 * Unit follows the weight preference (kg → cm, lb → in), with the ft'in"
 * readback beside the label so an imperial athlete can check the number they
 * just typed. Mirrors the mobile HeightRow.
 */
function HeightRow({ units, heightCm, onSaved }: { units: "kg" | "lb"; heightCm: number | null; onSaved: () => void }) {
  const { t } = useLang();
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const unit = heightUnitFor(units);
  // Null draft = "showing what's stored". Typing takes over; a successful save
  // hands control back so a unit switch or a fresh load is reflected.
  const value = draft ?? (heightCm != null ? displayHeight(heightCm, units) : "");
  const parsed = storeHeightCm(value, units);
  const dirty = value.trim() !== "" && parsed !== heightCm;

  const save = async () => {
    if (parsed == null) return;
    setBusy(true);
    const res = await j("/api/body", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ heightCm: parsed }) });
    setBusy(false);
    if (res?.metric) { setDraft(null); onSaved(); }
  };

  return (
    <div style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 12px 12px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{t("w.account.profile.priv-height-t")}</span>
        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: heightCm != null ? LIME : C("ash") }}>
          {heightCm != null ? fmtHeight(heightCm, units) : t("w.account.profile.priv-height-none")}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
        <input
          value={value}
          onChange={(e) => { if (isDecimalInput(e.target.value)) setDraft(e.target.value); }}
          inputMode="decimal"
          placeholder="0"
          aria-label={`${t("w.account.profile.priv-height-t")} (${unit})`}
          style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, letterSpacing: "-.03em", padding: 0 }}
        />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), flex: "none" }}>{unit}</span>
        {/* The save appears only when there is a CHANGE to save — a stored
            height shouldn't sit under a button implying unfinished business. */}
        {dirty && (
          <button
            onClick={save}
            disabled={busy || parsed == null}
            style={{ flex: "none", background: parsed == null ? "transparent" : C("lime"), border: parsed == null ? `1px solid ${C("line")}` : "none", borderRadius: 999, padding: "8px 16px", cursor: parsed == null ? "default" : "pointer", fontWeight: 700, fontSize: 13, color: parsed == null ? C("ash") : "var(--on-accent)", opacity: busy ? 0.6 : 1 }}
          >
            {t("common.save")}
          </button>
        )}
      </div>
      <p style={{ margin: "8px 0 0", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.5, color: C("ash") }}>
        {t("w.account.profile.priv-height-why")}
      </p>
    </div>
  );
}

function MetricInput({ label, unit, value, onChange }: { label: string; unit: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16, padding: "12px 12px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>
        <span style={{ width: 9, height: 9, borderRadius: 3, background: C("lime") }} />{label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 4 }}>
        <input
          value={value}
          onChange={(e) => { if (isDecimalInput(e.target.value)) onChange(e.target.value); }}
          inputMode="decimal"
          placeholder="0"
          aria-label={`${label} (${unit})`}
          style={{ flex: 1, minWidth: 0, boxSizing: "border-box", border: "none", outline: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 800, fontSize: 26, letterSpacing: "-.03em", padding: 0 }}
        />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: C("ash"), flex: "none" }}>{unit}</span>
      </div>
    </div>
  );
}
