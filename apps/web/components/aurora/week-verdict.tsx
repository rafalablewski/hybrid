"use client";

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  activityVerdict, activitySummary, activityDetailKey, activityMonths,
  resolveActivityRange, groupDistanceDisplay, ACTIVITY_RANGE_PRESETS, DEFAULT_ACTIVITY_RANGE,
  verdictLeadKey, verdictWhyKey, verdictMetricKey, verdictLabelKey, fmtTonnage,
  type ActivityDetail, type ActivityEntry, type ActivityGroup, type ActivityMetric,
  type ActivityRange, type ActivityVerdict, type BodyweightInput, type LoggedSession, type WeightUnit,
} from "@hybrid/core";
import Sheet from "./sheet";
import { LiquidSeg } from "./liquid-seg";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";
import { useToday } from "@/lib/use-today";

/**
 * THE ACTIVITY CARD — "This week" and everything the date filter turns it into
 * (web). The TWIN of components/aurora/week-verdict.tsx on mobile.
 *
 * Statistics and Analytics were two destinations answering the same question at
 * different depths. This is what replaced them on Today: a SENTENCE naming the
 * metric that moved, its baseline as the working-out, and — under a hairline —
 * the figures the sentence was drawn from.
 *
 * It is the ONLY totals card on Today, and it now summarises ALL activity, not
 * just what was lifted: a tennis match logged as 90 minutes on a block counts
 * toward the hours even with no stopwatch running, and every sport's distance
 * lands in the KM column. See core activity-window.ts for the attribution rule.
 *
 * THREE THINGS THE CARD GAINED, and why each one is here:
 *
 *   • A REAL WEEK. "This week" is MONDAY → SUNDAY now, not a rolling seven days
 *     that reports last Friday under a label claiming the current week.
 *   • A DATE FILTER, in the iOS 26 segmented-control idiom (the shared
 *     LiquidSeg): a neutral pill at rest that turns into a clear glass lens on
 *     touch, scrubs under a drag, and springs between segments, with the label
 *     it lands on taking the foreground. Week / 7 days / 30 days / YTD, with
 *     the fifth segment opening a sheet of individual months. The choice
 *     persists per device.
 *   • FIGURES THAT OPEN. Every column is a button; pressing one expands a panel
 *     beneath the row — with a caret sliding along to point at the column it
 *     belongs to — carrying the groups the total is made of and the sessions
 *     underneath them. "41.6 km" becomes 39 km of running, 600 m in the pool
 *     and the rest across tennis and squash, each with its own sessions.
 *
 * The card NEVER disappears. A block that comes and goes is worse than one that
 * is sometimes quiet, so an empty period keeps its place and says so.
 *
 * Colour is the SEMANTIC channel here (terracotta down, chartreuse up, ash
 * flat), not the brand accent — a bad week must not read as a highlight.
 */

const C = (v: string) => `var(--color-${v})`;
const STORE_KEY = "hybrid.today.range";
const ROWS_SHOWN = 5;

/** The segment labels are SHORTER than the card's own title for the same
 *  period ("7 days" under a card headed "Last 7 days") — a segmented control
 *  that wraps is a segmented control that has stopped being one. */
const SHORT_KEY: Record<string, string> = {
  week: "w.home.act.sWeek", d7: "w.home.act.sD7", d30: "w.home.act.sD30", ytd: "w.home.act.sYtd",
};

const kicker: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".1em",
  textTransform: "uppercase", whiteSpace: "nowrap",
};
const num: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Render a "{m}"-templated sentence with the metric name in bold. */
function Lead({ template, word }: { template: string; word: string | null }): ReactNode {
  const [before, after] = template.split("{m}");
  if (after === undefined || !word) return template;
  return (
    <>
      {before}
      <b style={{ fontWeight: 700 }}>{word}</b>
      {after}
    </>
  );
}

/** One destination row — the door to everything past this period. Exported
 *  since wave 3: the doors render at the END of the Progress cluster (in
 *  today.tsx), as the whole cluster's single exit point, not under this card. */
export function DoorRow({ title, sub, glyph, onClick }: { title: string; sub: string; glyph: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label={`${title} – ${sub}`}
      style={{
        display: "flex", width: "100%", alignItems: "center", gap: 12, marginTop: 10,
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
        padding: "12px 14px", cursor: "pointer", textAlign: "left", color: C("chalk"),
      }}
    >
      <span style={{
        width: 32, height: 32, borderRadius: 10, background: C("ink"),
        border: `1px solid ${C("line")}`, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 13, color: C("ash"), flex: "0 0 32px",
      }} aria-hidden>{glyph}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg }}>{title}</span>
        <span style={{ display: "block", ...kicker, fontSize: 9.5, color: C("ash"), marginTop: 2 }}>{sub}</span>
      </span>
      <span style={{ fontSize: fs.note, color: C("ash") }} aria-hidden>›</span>
    </button>
  );
}

export default function AuroraWeekVerdict({
  sessions,
  units,
  bw,
  onSession,
}: {
  sessions: LoggedSession[];
  units: WeightUnit;
  bw?: BodyweightInput;
  /** Open one logged session from the breakdown. */
  onSession?: (id: string) => void;
}) {
  const { t, lang } = useLang();
  const today = useToday();

  // The chosen period, persisted per device. Read after mount so the server and
  // the first client paint agree; a stale/unknown id resolves to the week.
  const [rangeId, setRangeId] = useState<string>(DEFAULT_ACTIVITY_RANGE);
  const [picker, setPicker] = useState(false);
  const [open, setOpen] = useState<ActivityMetric | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) setRangeId(saved);
    } catch { /* storage disabled — the week is a fine default */ }
  }, []);

  const pick = (id: string) => {
    setRangeId(id);
    setGroup(null);
    setAll(false);
    try { localStorage.setItem(STORE_KEY, id); } catch { /* ignore */ }
  };

  // `today` is an explicit input so a tab left open across midnight re-derives
  // the week rather than holding on to yesterday's.
  const range: ActivityRange = useMemo(() => resolveActivityRange(rangeId, Date.now()), [rangeId, today]);
  const v: ActivityVerdict = useMemo(() => activityVerdict(sessions, range, bw), [sessions, range, bw]);
  const summary = useMemo(() => activitySummary(sessions, range, bw), [sessions, range, bw]);
  const months = useMemo(() => activityMonths(sessions, Date.now()), [sessions, today]);

  // ── Formatting. Canonical → display; tonnage honours the athlete's unit,
  // minutes read as hours to one decimal, distance to one decimal km.
  const fmt = (metric: string, value: number) =>
    metric === "tonnage" ? fmtTonnage(value, units)
      : metric === "hours" ? String(Math.round(value / 6) / 10)
        : metric === "distance" ? String(Math.round(value * 10) / 10)
          : String(Math.round(value));

  const fmtMinutes = (m: number) =>
    m < 60 ? `${Math.round(m)} ${t("w.home.act.uMin")}` : `${Math.round(m / 6) / 10} ${t("w.home.act.uH")}`;

  /** A contribution in ITS OWN unit — 600 m of swimming inside a km total. */
  const fmtValue = (metric: ActivityMetric, value: number, g: { unit: "km" | "m" }) =>
    metric === "tonnage" ? fmtTonnage(value, units)
      : metric === "hours" ? fmtMinutes(value)
        : metric === "distance" ? `${groupDistanceDisplay(value, g.unit)} ${g.unit}`
          : value === 1 ? t("w.home.act.oneSession") : t("w.home.act.nSessions").replace("{n}", String(Math.round(value)));

  const groupName = (g: { labelKey: string | null; label: string | null }) => (g.labelKey ? t(g.labelKey) : g.label ?? "");

  const dateFmt = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString(lang, opts);
  // Some locales lowercase their month names ("lipiec"); a label is a label, so
  // the first letter is raised here rather than with a blanket `capitalize`,
  // which would also turn "Last 7 days" into "Last 7 Days".
  const monthLabel = (id: string, long = true) =>
    cap(dateFmt(Date.parse(`${id.slice(2)}-01T12:00:00`), long ? { month: "long", year: "numeric" } : { month: "short" }));

  const title = range.kind === "month" ? monthLabel(range.id) : t(range.labelKey ?? "w.home.act.rWeek");
  // A year-to-date span ends TODAY; a week or a month shows its whole frame, so
  // "Mon 27 – Sun 2" says which seven days the card means even on Tuesday.
  const spanEnd = (range.kind === "ytd" ? range.through : range.to) - 1;
  const span = `${dateFmt(range.from, { day: "numeric", month: "short" })} – ${dateFmt(spanEnd, { day: "numeric", month: "short" })}`;

  const tone = v.direction === "down" ? "var(--red-text)" : v.direction === "up" ? "var(--lime-text)" : C("ash");
  const named = v.figures.find((f) => f.metric === v.metric) ?? null;

  const why = v.metric && named
    ? t(verdictWhyKey(v))
        .replace("{v}", fmt(named.metric, named.value))
        .replace("{b}", fmt(named.metric, named.baseline))
    : t(verdictWhyKey(v));

  // Four columns only ever appear for a hybrid athlete (tonnage + distance);
  // at that width the figures need a size down to stay on one line.
  const wide = v.figures.length > 3;
  const figSize = wide ? 17 : fs.heading;
  const gutter = wide ? 9 : 12;

  // Named metric first — the sentence's subject shouldn't be the last column.
  const ordered = v.metric
    ? [...v.figures].sort((a, b) => (a.metric === v.metric ? -1 : b.metric === v.metric ? 1 : 0))
    : v.figures;

  const openIndex = open ? ordered.findIndex((f) => f.metric === open) : -1;
  const detail: ActivityDetail | null = open ? summary.details[open] : null;
  const shown = detail
    ? (group ? detail.groups.find((g) => g.id === group)?.items ?? detail.items : detail.items)
    : [];
  const rows = all ? shown : shown.slice(0, ROWS_SHOWN);

  const toggle = (m: ActivityMetric) => {
    setGroup(null);
    setAll(false);
    setOpen((cur) => (cur === m ? null : m));
  };

  // ── The segmented control. Five equal segments and one thumb that TRAVELS —
  // the movement is what makes it read as iOS rather than as five buttons.
  const segments = [
    ...ACTIVITY_RANGE_PRESETS.map((p) => ({ id: p.id, label: t(SHORT_KEY[p.id] ?? p.labelKey) })),
    {
      id: "month",
      label: range.kind === "month" ? monthLabel(range.id, false) : t("w.home.act.sMonth"),
    },
  ];
  const segIndex = range.kind === "month" ? segments.length - 1 : Math.max(0, segments.findIndex((s) => s.id === range.id));

  return (
    <div style={{ marginTop: 22 }}>
      {/* Explore-standard head: display-face title left, mono meta right. The
          head names the window so no figure below it needs a qualifier. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{title}</span>
        <span style={{ ...kicker, fontSize: fs.micro, letterSpacing: ".06em", color: C("ash") }}>{span}</span>
      </div>

      {/* ── THE DATE FILTER — the shared LiquidSeg: neutral pill at rest,
          clear glass lens on touch/drag, per the iOS 26 system control. The
          Month segment intercepts to its picker; the pill only lands on it
          once a month is actually in force (segIndex moves then). ────────── */}
      <LiquidSeg
        items={segments.map((s) => ({
          key: s.id,
          label: s.label,
          intercept: s.id === "month" ? () => setPicker(true) : undefined,
          render: (on: boolean) => (
            <span
              style={{
                fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".04em",
                color: on ? C("chalk") : C("ash"),
                fontWeight: on ? 600 : 400,
                transition: "color .2s ease",
                maxWidth: "100%", padding: "0 4px",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}
            >
              {s.label}
              {s.id === "month" && <span aria-hidden style={{ opacity: .6 }}> ▾</span>}
            </span>
          ),
        }))}
        index={segIndex}
        onSelect={(i) => pick(segments[i]!.id)}
        segHeight={30}
        pad={3}
        trackStyle={{ background: C("ink"), border: `1px solid ${C("line")}`, marginBottom: 10 }}
      />

      <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 22, padding: "16px 17px" }}>
        {/* THE VERDICT — sentence, its working-out, and the signed delta. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: fs.bodyLg, lineHeight: 1.4, color: C("chalk") }}>
              <Lead template={t(verdictLeadKey(v))} word={v.metric ? t(verdictMetricKey(v.metric)) : null} />
            </p>
            <p style={{ margin: "5px 0 0", ...kicker, textTransform: "none", letterSpacing: 0, fontSize: fs.micro, lineHeight: 1.45, color: C("ash"), whiteSpace: "normal" }}>{why}</p>
          </div>
          <span style={{ ...num, fontSize: 23, letterSpacing: "-.02em", color: tone, whiteSpace: "nowrap" }}>
            {v.metric ? `${v.deltaPct > 0 ? "+" : "−"}${Math.abs(v.deltaPct)}%` : "—"}
          </span>
        </div>

        {/* THE RECEIPTS — the figures the sentence was drawn from. Each one is
            a button onto its own breakdown. */}
        <div style={{ position: "relative", display: "flex", marginTop: 14, paddingTop: 13, borderTop: `1px solid ${C("line")}` }}>
          {ordered.map((f, i) => {
            const isNamed = f.metric === v.metric;
            const isOpen = open === f.metric;
            return (
              <button
                key={f.metric}
                onClick={() => toggle(f.metric)}
                aria-expanded={isOpen}
                aria-label={`${t(verdictLabelKey(f.metric))} – ${fmt(f.metric, f.value)}`}
                style={{
                  flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer",
                  padding: "4px 6px 6px", margin: "-4px 0 0",
                  marginLeft: i === 0 ? undefined : gutter - 6,
                  background: isOpen ? C("ink") : "transparent",
                  border: "none", borderRadius: 12,
                  borderLeft: i === 0 ? undefined : `1px solid ${isOpen ? "transparent" : C("line")}`,
                  transition: "background .2s ease",
                  color: "inherit",
                }}
              >
                <span style={{ display: "block", ...kicker, color: isNamed ? tone : C("ash") }}>{t(verdictLabelKey(f.metric))}</span>
                <span style={{
                  display: "block", ...num, fontSize: figSize, fontWeight: 500, letterSpacing: "-.02em",
                  marginTop: 3, color: isNamed ? tone : C("chalk"),
                }}>
                  {fmt(f.metric, f.value)}
                </span>
              </button>
            );
          })}
        </div>

        {/* THE CARET — travels to the column it belongs to, so the panel below
            is visibly a drawer pulled out of THAT figure, not a second card. */}
        <div style={{ position: "relative", height: open ? 9 : 0, transition: "height .28s cubic-bezier(.2,.7,.3,1)" }} aria-hidden>
          <span
            style={{
              position: "absolute", top: 3, width: 10, height: 10, marginLeft: -5,
              left: `${((openIndex < 0 ? 0 : openIndex) + 0.5) * (100 / Math.max(1, ordered.length))}%`,
              background: C("ink"), borderLeft: `1px solid ${C("line")}`, borderTop: `1px solid ${C("line")}`,
              transform: "rotate(45deg)", borderRadius: 2,
              opacity: open ? 1 : 0,
              transition: "left .34s cubic-bezier(.2,.7,.3,1), opacity .2s ease",
            }}
          />
        </div>

        {/* ── THE DRAWER ─────────────────────────────────────────────────────
            A 0fr → 1fr grid row: a real height animation with no measuring, so
            the panel slides rather than appearing. */}
        <div style={{
          display: "grid", gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows .34s cubic-bezier(.2,.7,.3,1)",
        }}>
          <div style={{ overflow: "hidden", minHeight: 0 }}>
            {detail && (
              <div
                key={detail.metric}
                style={{
                  background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 16,
                  padding: "13px 14px", animation: "hb-act-in .34s cubic-bezier(.2,.7,.3,1)",
                }}
              >
                <MetricDetail
                  detail={detail}
                  rows={rows}
                  shownCount={shown.length}
                  all={all}
                  group={group}
                  onGroup={(id) => { setGroup(id); setAll(false); }}
                  onAll={() => setAll((x) => !x)}
                  onSession={onSession}
                  t={t}
                  fmtValue={fmtValue}
                  fmtMinutes={fmtMinutes}
                  groupName={groupName}
                  dateFmt={dateFmt}
                  units={units}
                />
              </div>
            )}
          </div>
        </div>

        {!open && (
          <p style={{ margin: "10px 0 0", ...kicker, fontSize: 9, color: C("ash"), opacity: .75, textAlign: "center" }}>
            {t("w.home.act.hint")}
          </p>
        )}
      </div>

      {/* The doors moved OUT of this card (wave 3): they are the whole
          PROGRESS cluster's single exit now, rendered at the cluster's end in
          today.tsx — one exit point after all the breakdowns, not a detour
          between the summary and the rails that decompose it. */}

      {/* ── THE MONTH PICKER — the iOS grouped list: sections, a row per
          period, a check on the one in force. ─────────────────────────────── */}
      <Sheet open={picker} onClose={() => setPicker(false)} title={t("w.home.act.pickTitle")} sub={t("w.home.act.pickSub")}>
        <PickerSection label={t("w.home.act.presets")}>
          {ACTIVITY_RANGE_PRESETS.map((p) => (
            <PickerRow
              key={p.id}
              label={t(p.labelKey)}
              active={range.id === p.id}
              onClick={() => { pick(p.id); setPicker(false); }}
            />
          ))}
        </PickerSection>
        <PickerSection label={t("w.home.act.monthsHead")}>
          {months.map((id) => (
            <PickerRow
              key={id}
              label={monthLabel(id)}
              active={range.id === id}
              onClick={() => { pick(id); setPicker(false); }}
            />
          ))}
        </PickerSection>
      </Sheet>

      <style>{`@keyframes hb-act-in { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }`}</style>
    </div>
  );
}

/* ───────────────────────────── the breakdown ───────────────────────────── */

function MetricDetail({
  detail, rows, shownCount, all, group, onGroup, onAll, onSession,
  t, fmtValue, fmtMinutes, groupName, dateFmt, units,
}: {
  detail: ActivityDetail;
  rows: ActivityEntry[];
  shownCount: number;
  all: boolean;
  group: string | null;
  onGroup: (id: string | null) => void;
  onAll: () => void;
  onSession?: (id: string) => void;
  t: (k: string) => string;
  fmtValue: (m: ActivityMetric, v: number, g: { unit: "km" | "m" }) => string;
  fmtMinutes: (m: number) => string;
  groupName: (g: { labelKey: string | null; label: string | null }) => string;
  dateFmt: (ms: number, o: Intl.DateTimeFormatOptions) => string;
  units: WeightUnit;
}) {
  const byId = new Map(detail.groups.map((g) => [g.id, g]));
  const unitOf = (id: string) => byId.get(id) ?? { unit: "km" as const };

  /** The one meta line under a session row — this contribution's own figures,
   *  never the whole session's, so a run inside a lifting day can't claim the
   *  tonnage that happened beside it. */
  const meta = (it: ActivityEntry): string => {
    const bits: string[] = [];
    if (detail.metric === "tonnage") {
      if (it.sets > 0) bits.push(`${it.sets} ${t("w.home.act.uSets")}`);
      if (it.minutes > 0) bits.push(fmtMinutes(it.minutes));
    } else if (detail.metric === "distance") {
      if (it.minutes > 0) bits.push(fmtMinutes(it.minutes));
      if (it.tonnage > 0) bits.push(fmtTonnage(it.tonnage, units));
    } else if (detail.metric === "hours") {
      if (it.distanceKm > 0) bits.push(`${groupDistanceDisplay(it.distanceKm, unitOf(it.groupId).unit)} ${unitOf(it.groupId).unit}`);
      if (it.tonnage > 0) bits.push(fmtTonnage(it.tonnage, units));
    } else {
      if (it.minutes > 0) bits.push(fmtMinutes(it.minutes));
      if (it.tonnage > 0) bits.push(fmtTonnage(it.tonnage, units));
      if (it.distanceKm > 0) bits.push(`${Math.round(it.distanceKm * 10) / 10} km`);
    }
    return bits.join(" – ");
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ ...kicker, color: C("ash") }}>{t(activityDetailKey(detail.metric))}</span>
        <span style={{ ...num, fontSize: fs.caption, color: C("chalk") }}>
          {detail.sessions === 1 ? t("w.home.act.oneSession") : t("w.home.act.nSessions").replace("{n}", String(detail.sessions))}
        </span>
      </div>

      {detail.groups.length === 0 && (
        <p style={{ margin: "10px 0 0", fontSize: fs.caption, color: C("ash") }}>{t("w.home.act.empty")}</p>
      )}

      {detail.groups.length > 0 && (
        <>
          {/* The share bar — every group's slice of the total, in one line. */}
          <div style={{ display: "flex", gap: 2, height: 6, marginTop: 11, borderRadius: 999, overflow: "hidden" }} aria-hidden>
            {detail.groups.map((g, i) => (
              <span key={g.id} style={{
                flexGrow: Math.max(g.share, 0.02), flexBasis: 0, borderRadius: 999,
                background: i === 0 ? C("chalk") : i === 1 ? C("ash") : C("line"),
                opacity: group && group !== g.id ? .35 : 1, transition: "opacity .2s ease",
              }} />
            ))}
          </div>

          {/* One row per activity — tap to narrow the list underneath it. */}
          <div style={{ marginTop: 9 }}>
            {detail.groups.map((g: ActivityGroup) => {
              const active = group === g.id;
              return (
                <button
                  key={g.id}
                  onClick={() => onGroup(active ? null : g.id)}
                  aria-pressed={active}
                  style={{
                    display: "flex", width: "calc(100% + 16px)", alignItems: "center", gap: 9, textAlign: "left",
                    padding: "6px 8px", marginLeft: -8, background: active ? C("ink2") : "transparent",
                    border: "none", borderRadius: 10, cursor: "pointer", color: "inherit",
                    transition: "background .18s ease",
                  }}
                >
                  <span style={{ fontSize: 13, width: 18, textAlign: "center" }} aria-hidden>{g.icon}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: fs.caption, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {groupName(g)}
                  </span>
                  <span style={{ ...num, fontSize: 9.5, color: C("ash"), letterSpacing: ".06em" }}>{Math.round(g.share * 100)}%</span>
                  <span style={{ ...num, fontSize: fs.caption, color: C("chalk"), minWidth: 62, textAlign: "right" }}>
                    {fmtValue(detail.metric, g.value, g)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* The sessions themselves — the receipts under the receipts. */}
          <div style={{ ...kicker, color: C("ash"), marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C("line")}` }}>
            {t("w.home.act.sessionsHead")}
          </div>
          <div style={{ marginTop: 4 }}>
            {rows.map((it, i) => {
              const line = meta(it);
              return (
                <button
                  key={`${it.sessionId}-${it.groupId}-${i}`}
                  onClick={() => onSession?.(it.sessionId)}
                  disabled={!onSession}
                  style={{
                    display: "flex", width: "calc(100% + 16px)", marginLeft: -8, alignItems: "center", gap: 10,
                    padding: "7px 8px", background: "transparent", border: "none", borderRadius: 10,
                    cursor: onSession ? "pointer" : "default", textAlign: "left", color: "inherit",
                  }}
                >
                  <span style={{ ...num, fontSize: 9.5, color: C("ash"), width: 44, flex: "0 0 44px", letterSpacing: ".02em" }}>
                    {dateFmt(new Date(it.startedAt).getTime(), { day: "numeric", month: "short" })}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: fs.caption, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {it.name}
                    </span>
                    {line && <span style={{ display: "block", ...kicker, textTransform: "none", letterSpacing: 0, fontSize: 10, color: C("ash"), marginTop: 1 }}>{line}</span>}
                  </span>
                  <span style={{ ...num, fontSize: fs.caption, color: C("chalk"), whiteSpace: "nowrap" }}>
                    {fmtValue(detail.metric, it.value, unitOf(it.groupId))}
                  </span>
                </button>
              );
            })}
          </div>

          {shownCount > ROWS_SHOWN && (
            <button
              onClick={onAll}
              style={{
                marginTop: 6, background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                ...kicker, fontSize: 9.5, color: C("ash"),
              }}
            >
              {all ? t("w.home.act.showFewer") : t("w.home.act.showAll").replace("{n}", String(shownCount))}
            </button>
          )}
        </>
      )}
    </>
  );
}

/* ───────────────────────────── the picker ──────────────────────────────── */

function PickerSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ ...kicker, color: C("ash"), margin: "0 4px 6px" }}>{label}</div>
      <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function PickerRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-current={active}
      style={{
        display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "12px 14px", background: "transparent", border: "none",
        borderTop: `1px solid ${C("line")}`, cursor: "pointer", textAlign: "left",
        fontSize: fs.bodyLg, color: active ? C("chalk") : C("ash"),
      }}
    >
      <span>{label}</span>
      {active && <span style={{ color: "var(--lime-text)", fontSize: fs.note }} aria-hidden>✓</span>}
    </button>
  );
}
