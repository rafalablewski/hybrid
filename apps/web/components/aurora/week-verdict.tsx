"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  activityVerdict, activitySummary, activityDetailKey, activityMonths, prsBetween,
  fmtWeight, splitFigure, strengthPrProof,
  resolveActivityRange, groupDistanceDisplay, ACTIVITY_RANGE_PRESETS, DEFAULT_ACTIVITY_RANGE,
  verdictLeadKey, verdictWhyKey, verdictMetricKey, verdictLabelKey, verdictShowsStep, fmtTonnage,
  figureDeltaPct, figureDirection,
  type ActivityDetail, type ActivityEntry, type ActivityGroup, type ActivityMetric,
  type ActivityRange, type ActivityVerdict, type BodyweightInput, type LoggedSession, type PrHit,
  type VerdictDirection, type WeightUnit,
} from "@hybrid/core";
import Sheet from "./sheet";
import { LiquidSeg } from "./liquid-seg";
import { fs, CARD_PAD as SHARED_CARD_PAD, accentText } from "@/lib/ui";
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
 *   • FIGURES THAT OPEN. Every column is a button; pressing one expands the
 *     card's lower compartment, carrying the groups the total is made of and
 *     the sessions underneath them. "41.6 km" becomes 39 km of running, 600 m
 *     in the pool and the rest across tennis and squash, each with its sessions.
 *
 * The card NEVER disappears. A block that comes and goes is worse than one that
 * is sometimes quiet, so an empty period keeps its place and says so.
 *
 * Colour is the SEMANTIC channel here (terracotta down, chartreuse up, chalk
 * flat), not the brand accent — a bad week must not read as a highlight.
 *
 * SELECTION OWNS THAT COLOUR, and that is what pays for the rest of the card's
 * restraint. It used to mark the metric the SENTENCE named and nothing else, so
 * it never moved: pressing Hours left the chartreuse sitting on Distance, and
 * the press itself showed up only as an `ink`-on-`ink2` fill nobody sees on a
 * phone in daylight. Because pressing was invisible, the drawer had to shout —
 * it arrived as a second bordered, rounded card inside this one, with a caret
 * travelling between columns to point back at whichever figure had opened it.
 *
 * So the open column takes the tone (core's `figureDirection` — its OWN move,
 * never the sentence's, so a fallen Hours column reads terracotta inside a card
 * headlining a distance rise), and with the colour doing the pointing, THREE
 * container edges went with it: the caret, the drawer's border and the drawer's
 * radius. The panel is now the card's own lower compartment, bled to its edges
 * and taking its bottom corners. At rest — nothing open — the named metric
 * still holds the tone, so the resting card is unchanged.
 */

const C = (v: string) => `var(--color-${v})`;
const STORE_KEY = "hybrid.today.range";
/** Set once the athlete has opened any column — see the hint below. */
const HINT_KEY = "hybrid.today.actHinted";
const ROWS_SHOWN = 5;

/** The segment labels are SHORTER than the card's own title for the same
 *  period ("7 days" under a card headed "Last 7 days") — a segmented control
 *  that wraps is a segmented control that has stopped being one. */
const SHORT_KEY: Record<string, string> = {
  week: "w.home.act.sWeek", d7: "w.home.act.sD7", d30: "w.home.act.sD30", ytd: "w.home.act.sYtd",
};

/** The records block names the WINDOW, not just "New PRs" — the card is
 *  period-aware and a month's records must not read as this week's news. */
const PRS_HEAD_KEY: Record<string, string> = {
  week: "w.home.act.prsWeek", d7: "w.home.act.prsD7", d30: "w.home.act.prsD30", ytd: "w.home.act.prsYtd",
};

/** Records shown before the rail offers "Show all" — a year can hold forty,
 *  and an endless drag is not a celebration. */
const PRS_RAIL_CAP = 8;
/** The width of the edge dissolve, in px. Mirrored on mobile. */
const PRS_FADE = 24;
/** The verdict card's own inner padding — what the detail compartment bleeds by
 *  to reach the card's edges. NOT the screen gutter (`--page-pad-x`): the
 *  compartment lives INSIDE the card, so it must follow the card. The value is
 *  the app's one card inset (lib/ui `CARD_PAD`); this alias exists so the bleed
 *  below can NAME the container it escapes. Mirrors mobile. */
const CARD_PAD = SHARED_CARD_PAD;

const kicker: CSSProperties = {
  fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: ".12em",
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
      className="pressable"
      style={{
        display: "flex", width: "100%", alignItems: "center", gap: 12, marginTop: 10,
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16,
        padding: "12px 16px", cursor: "pointer", textAlign: "left", color: C("chalk"),
      }}
    >
      <span style={{
        width: 32, height: 32, borderRadius: 12, background: C("ink"),
        border: `1px solid ${C("line")}`, display: "flex", alignItems: "center",
        justifyContent: "center", fontSize: 13, color: C("ash"), flex: "0 0 32px",
      }} aria-hidden>{glyph}</span>
      <span style={{ flex: 1 }}>
        <span style={{ display: "block", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.bodyLg }}>{title}</span>
        <span style={{ display: "block", ...kicker, fontSize: 10, color: C("ash"), marginTop: 2 }}>{sub}</span>
      </span>
      <span style={{ fontSize: fs.note, color: C("ash") }} aria-hidden>›</span>
    </button>
  );
}

/**
 * ONE RECORD, set as a FIGURE — not the list row this used to be.
 *
 * The block used to be four hairlines around two 12px rows: a section rule, a
 * rule under the header and one above every record, fencing content inside a
 * card that already has a border. Whitespace separates two items perfectly
 * well, so the rules went and the budget was spent on the two things a record
 * actually needs — SCALE (the load at fs.display, the largest figure in the
 * card, because a personal best is the only thing on Today worth celebrating)
 * and PROOF (the load it beat, which is what makes 90 kg an achievement rather
 * than a fact).
 *
 * The proof's three shapes come from core's strengthPrProof, so this and the
 * session summary can't drift, and it arrives SPLIT — "from 82.5" reads in ash
 * and only the gain takes the accent, which a single joined string could not
 * express. The value is bare because the unit is on the figure above it.
 *
 * Pressable when the hit knows its session: the card's whole promise is that a
 * figure opens what's behind it, and a record is no exception.
 */
function PrCell({ pr, units, t, onOpen }: {
  pr: PrHit;
  units: WeightUnit;
  t: (k: string) => string;
  onOpen?: () => void;
}) {
  const [value, unit] = splitFigure(fmtWeight(pr.topLoad, units));
  const proof = strengthPrProof(pr, units);
  const body = (
    <>
      <span style={{ display: "block", ...kicker, color: C("ash"), overflow: "hidden", textOverflow: "ellipsis" }}>{pr.lift}</span>
      <span style={{
        display: "block", ...num, fontSize: fs.display, fontWeight: 800,
        letterSpacing: "-.03em", lineHeight: 1, marginTop: 7, color: accentText("lime"),
      }}>
        {value}
        <i style={{ fontStyle: "normal", fontSize: ".46em", fontWeight: 600, letterSpacing: ".04em", marginLeft: 3 }}>{unit}</i>
      </span>
      <span style={{
        display: "block", marginTop: 6, fontSize: fs.micro, color: C("ash"),
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
      }}>
        {proof.kind === "climb" ? (
          <>
            {t("w.home.act.prFrom").replace("{v}", proof.from ?? "")}{" "}
            <em style={{ fontStyle: "normal", color: accentText("lime") }}>{proof.delta}</em>
          </>
        ) : t(proof.kind === "first" ? "w.home.act.prFirst" : "w.home.act.prReps")}
      </span>
    </>
  );

  if (!onOpen) return <div style={{ minWidth: 0 }}>{body}</div>;
  return (
    <button
      className="pressable"
      onClick={onOpen}
      aria-label={`${pr.lift} – ${fmtWeight(pr.topLoad, units)} – ${t("w.home.act.prOpen")}`}
      style={{
        display: "block", width: "100%", minWidth: 0, textAlign: "left",
        background: "none", border: "none", padding: 0, margin: 0,
        color: "inherit", cursor: "pointer",
      }}
    >
      {body}
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
  // THE HINT, ONCE. "Open a figure for the sessions behind it" is the only
  // sentence on this screen written about the interface rather than about the
  // athlete's training, and it held a row of the card forever — including on
  // the ten-thousandth visit. It now retires the first time any column is
  // opened. Starts true so it can only ever disappear, never flash in (and so
  // the server paint and the first client paint agree). Mirrors mobile.
  const [hinted, setHinted] = useState(true);
  // The records rail (three records and up) — see .pr-rail in globals.css.
  const rail = useRef<HTMLDivElement>(null);
  const [fade, setFade] = useState({ l: 0, r: 0 });
  const [allPrs, setAllPrs] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE_KEY);
      if (saved) setRangeId(saved);
      setHinted(localStorage.getItem(HINT_KEY) === "1");
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
  // THE PERIOD'S RECORDS. These used to sit on the Performance tab's "Your
  // week" card, computed over a ROLLING seven days while this card counted a
  // real calendar week — two cards one tab apart, both labelled as the week,
  // reporting different numbers. A PR belongs to the period it happened in, so
  // it belongs to whatever window this card is showing.
  const prs = useMemo(() => prsBetween(sessions, range.from, range.through + 1, bw), [sessions, range, bw]);
  const shownPrs = allPrs ? prs : prs.slice(0, PRS_RAIL_CAP);
  const months = useMemo(() => activityMonths(sessions, Date.now()), [sessions, today]);

  // A new period is a new set of records — an expanded rail must not carry over.
  useEffect(() => { setAllPrs(false); }, [range.id]);

  // THE EDGE DISSOLVE, written from the scroll offset: an edge fades only while
  // records are hidden behind it, and an edge with nothing past it stays crisp.
  // A fade on both sides at all times would be decoration; this is a status.
  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const paint = () => {
      const max = el.scrollWidth - el.clientWidth;
      setFade({ l: el.scrollLeft > 4 ? PRS_FADE : 0, r: max - el.scrollLeft > 4 ? PRS_FADE : 0 });
    };
    paint();
    el.addEventListener("scroll", paint, { passive: true });
    window.addEventListener("resize", paint);
    return () => { el.removeEventListener("scroll", paint); window.removeEventListener("resize", paint); };
  }, [shownPrs.length]);

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
  // The records kicker names the window too. The month case interpolates the
  // localized month name rather than an inflected phrase — "in July" declines
  // in Polish (w lipcu) and a nominative month in that slot would be wrong.
  const prsHead = range.kind === "month"
    ? t("w.home.act.prsMonth").replace("{m}", monthLabel(range.id))
    : t(PRS_HEAD_KEY[range.id] ?? "w.home.act.prsWeek");
  // A year-to-date span ends TODAY; a week or a month shows its whole frame, so
  // "Mon 27 – Sun 2" says which seven days the card means even on Tuesday.
  const spanEnd = (range.kind === "ytd" ? range.through : range.to) - 1;
  const span = `${dateFmt(range.from, { day: "numeric", month: "short" })} – ${dateFmt(spanEnd, { day: "numeric", month: "short" })}`;

  const tone = v.direction === "down" ? "var(--red-text)" : v.direction === "up" ? "var(--lime-text)" : C("ash");
  const named = v.figures.find((f) => f.metric === v.metric) ?? null;
  const step = verdictShowsStep(v);

  // The working-out carries the BASELINE alone. It used to open with the
  // period's own value as well ("6.8 against a 0.1 four-week average"), which
  // reprinted the figure the column two rows below was already showing — and
  // for the named metric, the one the sentence had just made its subject. The
  // comparison divides cleanly without it: the sentence names the metric and
  // the direction, the figure on the right carries the magnitude, this line
  // carries what it was measured against.
  const why = v.metric && named
    ? t(verdictWhyKey(v)).replace("{b}", fmt(named.metric, named.baseline))
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

  /** A direction as a text colour. Distinct from `tone` above, which is the
   *  SENTENCE's and reads ash when flat: a column the athlete deliberately
   *  opened is being read, so its flat state is chalk, not the muted grey of a
   *  figure nobody asked about. */
  const dirColor = (d: VerdictDirection) =>
    d === "down" ? "var(--red-text)" : d === "up" ? "var(--lime-text)" : C("chalk");

  // THE OPEN COLUMN'S OWN COMPARISON — the working-out for the colour the press
  // just produced, printed where it was produced. Absent when the metric has no
  // baseline to move from, which is not the same as "it didn't move".
  const openFig = open ? v.figures.find((f) => f.metric === open) ?? null : null;
  const openDelta = openFig ? figureDeltaPct(openFig) : null;
  const openWhy = openFig && openDelta !== null
    ? t("w.home.act.vsBase")
      .replace("{d}", `${openDelta > 0 ? "+" : openDelta < 0 ? "−" : ""}${Math.abs(openDelta)}%`)
      .replace("{b}", fmt(openFig.metric, openFig.baseline))
    : null;
  const shown = detail
    ? (group ? detail.groups.find((g) => g.id === group)?.items ?? detail.items : detail.items)
    : [];
  const rows = all ? shown : shown.slice(0, ROWS_SHOWN);

  const toggle = (m: ActivityMetric) => {
    setGroup(null);
    setAll(false);
    setOpen((cur) => (cur === m ? null : m));
    if (!hinted) {
      setHinted(true);
      try { localStorage.setItem(HINT_KEY, "1"); } catch { /* ignore */ }
    }
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
    <div style={{ marginTop: 24 }}>
      {/* Explore-standard head: display-face title left, mono meta right. The
          head names the window so no figure below it needs a qualifier. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, margin: "0 2px 8px" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, color: C("chalk") }}>{title}</span>
        <span style={{ ...kicker, fontSize: fs.micro, letterSpacing: ".08em", color: C("ash") }}>{span}</span>
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
                fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".08em",
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

      <div style={{
        background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28,
        boxShadow: "var(--shadow-card)", padding: CARD_PAD,
        // The compartment below supplies the bottom padding while it is open,
        // so the card gives its own up rather than fencing the panel in.
        paddingBottom: open ? 0 : CARD_PAD,
        transition: "padding-bottom .34s cubic-bezier(.2,.7,.3,1)",
      }}>
        {/* THE VERDICT — sentence, its working-out, and the signed delta. */}
        <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
          <div style={{ flex: 1 }}>
            <p style={{ margin: 0, fontSize: fs.bodyLg, lineHeight: 1.4, color: C("chalk") }}>
              <Lead template={t(verdictLeadKey(v))} word={v.metric ? t(verdictMetricKey(v.metric)) : null} />
            </p>
            <p style={{ margin: "5px 0 0", ...kicker, textTransform: "none", letterSpacing: 0, fontSize: fs.micro, lineHeight: 1.45, color: C("ash"), whiteSpace: "normal" }}>{why}</p>
          </div>
          {/* Past the ceiling the percentage stops being a measurement — a
              0.1 km four-week mean yielded "+7849%", which reads as a bug and
              takes every figure beside it down with it. The STEP says the same
              thing honestly, and shorter. Both clients ask core, so neither
              can invent its own ceiling. Mirrors mobile. */}
          <span style={{ ...num, fontSize: step ? 15 : 23, letterSpacing: step ? 0 : "-.02em", color: tone, whiteSpace: "nowrap" }}>
            {!v.metric ? "—"
              : step && named ? `${fmt(named.metric, named.baseline)} → ${fmt(named.metric, named.value)}`
                : `${v.deltaPct > 0 ? "+" : "−"}${Math.abs(v.deltaPct)}%`}
          </span>
        </div>

        {/* THE RECEIPTS — the figures the sentence was drawn from. Each one is
            a button onto its own breakdown. */}
        <div style={{ position: "relative", display: "flex", marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
          {ordered.map((f, i) => {
            const isNamed = f.metric === v.metric;
            const isOpen = open === f.metric;
            // AT REST the sentence keeps the colour, so the card's first paint
            // is exactly what it always was. The moment a column is open,
            // SELECTION owns the channel and the open one is toned by its own
            // move — never the sentence's, which may be a different metric
            // going the other way.
            const dir: VerdictDirection | null = open === null
              ? (isNamed ? v.direction : null)
              : (isOpen ? figureDirection(f) : null);
            const col = dir ? dirColor(dir) : null;
            return (
              <button className="pressable"
                key={f.metric}
                onClick={() => toggle(f.metric)}
                aria-expanded={isOpen}
                aria-label={`${t(verdictLabelKey(f.metric))} – ${fmt(f.metric, f.value)}`}
                style={{
                  flex: 1, minWidth: 0, textAlign: "left", cursor: "pointer",
                  padding: "4px 6px 6px", margin: "-4px 0 0",
                  marginLeft: i === 0 ? undefined : gutter - 6,
                  // A WASH OF ITS OWN TONE, not the `ink` fill that used to sit
                  // here: at 9% it reads as the column being lit rather than as
                  // a second surface laid over the card.
                  background: isOpen && col ? `color-mix(in srgb, ${col} ${dir === "flat" ? 6 : 9}%, transparent)` : "transparent",
                  border: "none", borderRadius: 12,
                  // The divider retires on BOTH sides of the open column — a
                  // hairline butting into a lit panel reads as a crack in it.
                  borderLeft: i === 0 ? undefined : `1px solid ${isOpen || openIndex === i - 1 ? "transparent" : C("line")}`,
                  transition: "background .2s ease, border-color .2s ease",
                  color: "inherit",
                }}
              >
                <span style={{ display: "block", ...kicker, color: col ?? C("ash") }}>{t(verdictLabelKey(f.metric))}</span>
                <span style={{
                  display: "block", ...num, fontSize: figSize, fontWeight: 500, letterSpacing: "-.02em",
                  marginTop: 3, color: col ?? C("chalk"),
                }}>
                  {fmt(f.metric, f.value)}
                </span>
                {/* THE RAIL — selection in a second channel, so the state does
                    not rest on hue alone (a flat column is toned chalk, and
                    colour vision is not universal). It draws from the left
                    rather than fading in, which is the same gesture the caret
                    used to make travelling between columns. */}
                <span aria-hidden style={{
                  display: "block", height: 2, borderRadius: 2, marginTop: 7,
                  background: col ?? C("ash"),
                  transform: isOpen ? "scaleX(1)" : "scaleX(0)", transformOrigin: "left",
                  transition: "transform .26s cubic-bezier(.2,.7,.3,1), background .2s ease",
                }} />
              </button>
            );
          })}
        </div>

        {/* The caret that used to sit here is gone. Its whole job was pointing
            at the column that opened the panel, and the lit column does that
            without moving — see the file header. */}

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
                  // THE CARD'S LOWER COMPARTMENT, not a card in a card. It bleeds
                  // the card's own padding on three sides and inherits its bottom
                  // corners (28 less the 1px border), so the only edge between
                  // the figures and their breakdown is one hairline. The card
                  // drops its bottom padding while this is open — the panel's own
                  // padding is the card's bottom now.
                  background: C("ink"), borderTop: `1px solid ${C("line")}`,
                  margin: `12px -${CARD_PAD}px 0`, padding: `14px ${CARD_PAD}px ${CARD_PAD}px`,
                  borderRadius: "0 0 27px 27px",
                  animation: "hb-act-in .34s cubic-bezier(.2,.7,.3,1)",
                }}
              >
                <MetricDetail
                  detail={detail}
                  why={openWhy}
                  whyColor={openFig ? dirColor(figureDirection(openFig)) : C("ash")}
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

        {!open && !hinted && (
          <p style={{ margin: "10px 0 0", ...kicker, fontSize: 9, color: C("ash"), opacity: .75, textAlign: "center" }}>
            {t("w.home.act.hint")}
          </p>
        )}
      </div>

      {/* RECORDS SET IN THIS PERIOD — the one part of the old Performance
          "Your week" card that was not already said better here. It reads the
          window the athlete actually picked, so a month view lists the month's
          PRs rather than the last seven days'. Silent when there are none. */}
      {prs.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
          {/* The one rule that stays is this section divider — it separates the
              figures from what follows and is load-bearing. The three that used
              to sit inside the block were decoration. */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ ...kicker, color: C("ash"), overflow: "hidden", textOverflow: "ellipsis" }}>{prsHead}</span>
            {/* A6: the count is a fact only when the reader cannot do the
                counting. With one or two records both cells sit side by side on
                one row, so a "2" beside them restates what is already in view.
                From three up they are a RAIL — you cannot count what you have
                to scroll — so the total earns its place, and past
                PRS_RAIL_CAP the trailing "Show all {n}" cell carries it too. */}
            {prs.length > 2 && (
              <span style={{ ...num, fontSize: fs.micro, color: accentText("lime"), marginLeft: "auto" }}>{prs.length}</span>
            )}
          </div>

          {prs.length < 3 ? (
            /* ONE OR TWO — the figures sit still. No rail, no fade, nothing to
               drag: a rail that cannot move is worse than no rail. A single
               record takes the full width rather than leaving half a row empty. */
            <div style={{
              display: "grid", gridTemplateColumns: prs.length === 1 ? "1fr" : "1fr 1fr",
              gap: 14, marginTop: 12,
            }}>
              {prs.map((pr) => (
                <PrCell key={pr.lift} pr={pr} units={units} t={t}
                  onOpen={onSession && pr.sessionId ? () => onSession(pr.sessionId!) : undefined} />
              ))}
            </div>
          ) : (
            /* THREE AND UP — the same cells become a rail.
             *
             * This block sits DIRECTLY ON THE SCREEN (it is a sibling of the
             * card above, not a child of it), so the rail is full-bleed: the
             * negative margins are the width of the screen gutter and the
             * padding matches, exactly as the exercise-widget rail does it.
             * Cards slide under the physical screen edge instead of clipping at
             * the content column with the gutter showing beside a cut cell.
             *
             * A cell is HALF THE CONTENT COLUMN — the same width the two-up
             * grid gives it — so going from two records to three doesn't resize
             * anything: the third simply appears past the right edge. That peek
             * is the whole affordance, which is why there are no arrows, no dot
             * row and no "swipe" label. Flex percentages resolve against the
             * content box, which the matching padding makes exactly the column.
             *
             * Snap is PROXIMITY, not mandatory: a flick lands cleanly, a small
             * drag is left where it was put. */
            <div
              ref={rail}
              className="pr-rail"
              tabIndex={0}
              role="group"
              aria-label={`${prsHead} – ${prs.length}`}
              style={{
                display: "flex", gap: 14, marginTop: 12, overflowX: "auto",
                scrollSnapType: "x proximity",
                margin: "12px calc(-1 * var(--page-pad-x, 12px)) 0",
                padding: "0 var(--page-pad-x, 12px) 2px",
                "--pr-fade-l": `${fade.l}px`, "--pr-fade-r": `${fade.r}px`,
              } as CSSProperties}
            >
              {shownPrs.map((pr) => (
                <div key={pr.lift} style={{ flex: "0 0 calc((100% - 14px) / 2)", minWidth: 0, scrollSnapAlign: "start" }}>
                  <PrCell pr={pr} units={units} t={t}
                    onOpen={onSession && pr.sessionId ? () => onSession(pr.sessionId!) : undefined} />
                </div>
              ))}
              {!allPrs && prs.length > PRS_RAIL_CAP && (
                <button
                  className="pressable"
                  onClick={() => setAllPrs(true)}
                  style={{
                    flex: "0 0 calc((100% - 14px) / 2)", scrollSnapAlign: "start", textAlign: "left",
                    background: "none", border: "none", padding: 0, cursor: "pointer",
                    fontFamily: "var(--font-mono)", fontSize: fs.micro,
                    color: C("ash"), whiteSpace: "normal",
                  }}
                >
                  {t("w.home.act.showAll").replace("{n}", String(prs.length))}
                </button>
              )}
            </div>
          )}
        </div>
      )}

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
  detail, why, whyColor, rows, shownCount, all, group, onGroup, onAll, onSession,
  t, fmtValue, fmtMinutes, groupName, dateFmt, units,
}: {
  detail: ActivityDetail;
  /** This column's own move against its own baseline — the working-out for the
   *  tone the press just put on it. Null when it has no baseline. */
  why: string | null;
  whyColor: string;
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
      {/* The right of this row used to carry the session count, which is now
          on the "Sessions" rule below — where the sessions actually are. This
          says instead what the column just did, in the tone the column is
          wearing: the reason for the colour, beside the colour. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ ...kicker, color: C("ash") }}>{t(activityDetailKey(detail.metric))}</span>
        {why && <span style={{ ...num, fontSize: fs.micro, color: whyColor, whiteSpace: "nowrap" }}>{why}</span>}
      </div>

      {detail.groups.length === 0 && (
        <p style={{ margin: "10px 0 0", fontSize: fs.caption, color: C("ash") }}>{t("w.home.act.empty")}</p>
      )}

      {detail.groups.length > 0 && (
        <>
          {/* The share bar — every group's slice of the total, in one line. */}
          <div style={{ display: "flex", gap: 2, height: 6, marginTop: 12, borderRadius: 999, overflow: "hidden" }} aria-hidden>
            {detail.groups.map((g, i) => (
              <span key={g.id} style={{
                flexGrow: Math.max(g.share, 0.02), flexBasis: 0, borderRadius: 999,
                background: i === 0 ? C("chalk") : i === 1 ? C("ash") : C("line"),
                opacity: group && group !== g.id ? .35 : 1, transition: "opacity .2s ease",
              }} />
            ))}
          </div>

          {/* One row per activity — tap to narrow the list underneath it. */}
          <div style={{ marginTop: 8 }}>
            {detail.groups.map((g: ActivityGroup) => {
              const active = group === g.id;
              return (
                <button className="pressable"
                  key={g.id}
                  onClick={() => onGroup(active ? null : g.id)}
                  aria-pressed={active}
                  style={{
                    display: "flex", width: "calc(100% + 16px)", alignItems: "center", gap: 8, textAlign: "left",
                    padding: "6px 8px", marginLeft: -8, background: active ? C("ink2") : "transparent",
                    border: "none", borderRadius: 12, cursor: "pointer", color: "inherit",
                    transition: "background .18s ease",
                  }}
                >
                  <span style={{ fontSize: 13, width: 18, textAlign: "center" }} aria-hidden>{g.icon}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: fs.caption, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {groupName(g)}
                  </span>
                  <span style={{ ...num, fontSize: 10, color: C("ash"), letterSpacing: ".08em" }}>{Math.round(g.share * 100)}%</span>
                  <span style={{ ...num, fontSize: fs.caption, color: C("chalk"), minWidth: 62, textAlign: "right" }}>
                    {fmtValue(detail.metric, g.value, g)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* The sessions themselves — the receipts under the receipts. The
              count rides this rule now: it is a fact about the sessions, and
              this is the line that introduces them. */}
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10,
            ...kicker, color: C("ash"), marginTop: 12, paddingTop: 10, borderTop: `1px solid ${C("line")}`,
          }}>
            <span>{t("w.home.act.sessionsHead")}</span>
            <span style={{ ...num, letterSpacing: ".08em", color: C("chalk") }}>{detail.sessions}</span>
          </div>
          <div style={{ marginTop: 4 }}>
            {rows.map((it, i) => {
              const line = meta(it);
              return (
                <button className="pressable"
                  key={`${it.sessionId}-${it.groupId}-${i}`}
                  onClick={() => onSession?.(it.sessionId)}
                  disabled={!onSession}
                  style={{
                    display: "flex", width: "calc(100% + 16px)", marginLeft: -8, alignItems: "center", gap: 10,
                    padding: "8px 8px", background: "transparent", border: "none", borderRadius: 12,
                    cursor: onSession ? "pointer" : "default", textAlign: "left", color: "inherit",
                  }}
                >
                  <span style={{ ...num, fontSize: 10, color: C("ash"), width: 44, flex: "0 0 44px", letterSpacing: ".08em" }}>
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
            <button className="pressable"
              onClick={onAll}
              style={{
                marginTop: 6, background: "none", border: "none", cursor: "pointer", padding: "4px 0",
                ...kicker, fontSize: 10, color: C("ash"),
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
    <div style={{ marginTop: 16 }}>
      <div style={{ ...kicker, color: C("ash"), margin: "0 4px 6px" }}>{label}</div>
      <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 16, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

function PickerRow({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button className="pressable"
      onClick={onClick}
      aria-current={active}
      style={{
        display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10,
        padding: "12px 16px", background: "transparent", border: "none",
        borderTop: `1px solid ${C("line")}`, cursor: "pointer", textAlign: "left",
        fontSize: fs.bodyLg, color: active ? C("chalk") : C("ash"),
      }}
    >
      <span>{label}</span>
      {active && <span style={{ color: "var(--lime-text)", fontSize: fs.note }} aria-hidden>✓</span>}
    </button>
  );
}
