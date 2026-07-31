"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import {
  weekVerdict, verdictLeadKey, verdictWhyKey, verdictMetricKey, verdictLabelKey,
  fmtTonnage, type BodyweightInput, type LoggedSession, type WeightUnit, type WeekVerdict,
} from "@hybrid/core";
import { fs } from "@/lib/ui";
import { useLang } from "@/lib/i18n";

/**
 * THIS WEEK — the verdict card (web), the TWIN of
 * components/aurora/week-verdict.tsx on mobile.
 *
 * Statistics and Analytics were two destinations answering the same question at
 * different depths. This is what replaced them on Today: a SENTENCE naming the
 * metric that moved, the four-week baseline as its working-out, and — under a
 * hairline — the figures the sentence was drawn from. Verdict on top, receipts
 * beneath, the same shape the Fuel card uses.
 *
 * It is the ONLY weekly-totals card on Today: the Endurance block's own
 * cross-sport strip (efforts / km / h for the same week) was retired into this
 * one, because two "this week" cards counting different populations under
 * near-identical labels is a misreading waiting to happen. Distance therefore
 * appears here as a fourth column — but only for an athlete who logs endurance,
 * so a pure lifter never carries an empty one.
 *
 * The named metric leads the figure row and carries the delta's colour, so the
 * claim and the number are visibly the same thing rather than two assertions
 * sharing a card.
 *
 * The card NEVER disappears. A block that comes and goes is worse than one that
 * is sometimes quiet, so a flat week keeps its place and says so — see the
 * `flat` / `cold` states in @hybrid/core week-verdict.ts, which is also where
 * every number and the choice of metric come from, so mobile can't drift.
 *
 * Colour is the SEMANTIC channel here (terracotta down, chartreuse up, ash
 * flat), not the brand accent — a bad week must not read as a highlight.
 */

const C = (v: string) => `var(--color-${v})`;

const kicker: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".1em",
  textTransform: "uppercase", whiteSpace: "nowrap",
};
const num: CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };

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

/** One destination row — the doors to everything past this week. */
function DoorRow({ title, sub, glyph, onClick }: { title: string; sub: string; glyph: string; onClick: () => void }) {
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
  showDeep,
  onArchive,
  onDeep,
}: {
  sessions: LoggedSession[];
  units: WeightUnit;
  bw?: BodyweightInput;
  /** The per-lift dashboard is athlete-gated — hide its door when it isn't reachable. */
  showDeep?: boolean;
  onArchive: () => void;
  onDeep: () => void;
}) {
  const { t } = useLang();
  const v: WeekVerdict = useMemo(() => weekVerdict(sessions, Date.now(), bw), [sessions, bw]);

  // Canonical → display. Tonnage honours the athlete's unit; minutes read as
  // hours to one decimal, the same figure the endurance totals show.
  const fmt = (metric: string, value: number) =>
    metric === "tonnage" ? fmtTonnage(value, units)
      : metric === "hours" ? String(Math.round(value / 6) / 10)
        : metric === "distance" ? String(Math.round(value * 10) / 10)
          : String(Math.round(value));

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

  return (
    <div style={{ marginTop: 22 }}>
      {/* Explore-standard head: display-face title left, mono meta right. The
          head names the window so no figure below it needs a qualifier. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{t("w.home.week.title")}</span>
        <span style={{ ...kicker, fontSize: fs.micro, letterSpacing: ".06em", color: C("ash") }}>{t("w.analyze.stats.week")}</span>
      </div>

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

        {/* THE RECEIPTS — the figures the sentence was drawn from. */}
        <div style={{ display: "flex", marginTop: 14, paddingTop: 13, borderTop: `1px solid ${C("line")}` }}>
          {ordered.map((f, i) => {
            const isNamed = f.metric === v.metric;
            return (
              <div
                key={f.metric}
                style={{ flex: 1, minWidth: 0, paddingLeft: i === 0 ? undefined : gutter, borderLeft: i === 0 ? undefined : `1px solid ${C("line")}` }}
              >
                <div style={{ ...kicker, color: isNamed ? tone : C("ash") }}>{t(verdictLabelKey(f.metric))}</div>
                <div style={{ ...num, fontSize: figSize, fontWeight: 500, letterSpacing: "-.02em", marginTop: 3, color: isNamed ? tone : C("chalk") }}>
                  {fmt(f.metric, f.value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* The doors. Today holds this week; everything longer lives behind one
          click, which is what keeps the block from becoming a second screen. */}
      <DoorRow glyph="▤" title={t("w.home.week.archive")} sub={t("w.home.week.archiveSub")} onClick={onArchive} />
      {showDeep && <DoorRow glyph="◫" title={t("w.home.week.deep")} sub={t("w.home.week.deepSub")} onClick={onDeep} />}
    </div>
  );
}
