import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  activityVerdict, activitySummary, activityDetailKey, TODAY_RANGE_STORE_KEY,
  durationUnits, formatDuration,
  groupDistanceDisplay, fmtKm,
  verdictLeadKey, verdictWhyKey, verdictMetricKey, verdictLabelKey, verdictShowsStep, fmtTonnage,
  figureDeltaPct, figureDirection,
  type ActivityDetail, type ActivityEntry, type ActivityGroup, type ActivityMetric,
  type ActivityVerdict, type BodyweightInput, type LoggedSession,
  type VerdictDirection, type WeightUnit,
} from "@hybrid/core";
import { ACard, withAlpha , RADIUS} from "./kit";
import PeriodRecords from "./period-records";
import { RangeFilter, RangeHead, useActivityRange, useRangeLabels } from "./range-filter";
import Sheet from "./sheet";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { leading, fs, F, PressScale, PressScale as Pressable, FIXED_FONT_SCALE , tracking} from "../../lib/ui";

/**
 * THE ACTIVITY CARD — "This week" and everything the date filter turns it into,
 * the TWIN of components/aurora/week-verdict.tsx on web.
 *
 * Statistics and Analytics were two destinations answering the same question at
 * different depths. This is what replaced them on Today: a SENTENCE naming the
 * metric that moved, its baseline as the working-out, and — under a hairline —
 * the figures the sentence was drawn from.
 *
 * It is the WHOLE-SCREEN totals card, and it summarises ALL activity, not just
 * what was lifted: a tennis match logged as 90 minutes on a block counts toward
 * the hours even with no stopwatch running, and every sport's distance lands in
 * the KM column. See core activity-window.ts for the attribution rule.
 *
 * There IS a second totals card on Today now — the Endurance section's — and
 * the thing that makes it safe is the thing the retired cross-sport strip never
 * had: a heading. It sits under a cluster headline reading ENDURANCE, and its
 * figures are a strict SLICE of this card's (core endurance-window.ts reads the
 * same activitySummary), so the two can restate each other but never disagree.
 *
 * THREE THINGS THE CARD GAINED, and why each one is here:
 *
 *   • A REAL WEEK. "This week" is MONDAY → SUNDAY now, not a rolling seven days
 *     that reports last Friday under a label claiming the current week.
 *   • A DATE FILTER — the shared aurora/range-filter.tsx, in the iOS 26
 *     segmented-control idiom: a neutral pill at rest that turns into a clear
 *     glass lens on touch, scrubs under a drag, and springs between segments,
 *     with the label it lands on taking the foreground. Week / 7 days /
 *     30 days / YTD, with the fifth segment opening a sheet of individual
 *     months. Persisted per device. It became a shared component when the
 *     Endurance section grew a second view of it — one control, two callers,
 *     rather than the four copies that would otherwise exist, and ONE period:
 *     both read core's TODAY_RANGE_STORE_KEY, so scrubbing either moves both.
 *   • FIGURES THAT OPEN. Every column is a button; pressing one raises a SHEET
 *     carrying the groups the total is made of and the sessions underneath
 *     them. "41.6 km" becomes 39 km of running, 600 m in the pool and the rest
 *     across tennis and squash, each with its sessions.
 *
 * The card NEVER disappears. A block that comes and goes is worse than one that
 * is sometimes quiet, so an empty period keeps its place and says so.
 *
 * Colour is the SEMANTIC channel here (terracotta down, chartreuse up, chalk
 * flat), not the brand accent — a bad week must not read as a highlight.
 *
 * THE PERIOD'S TWO ENDS OWN THAT COLOUR — core's `best` and `worst`. Chartreuse
 * marks the figure that rose furthest above its baseline, terracotta the one
 * that fell furthest below it, and the columns between them carry no tone at
 * all. Both marks are on the resting card, before anything is pressed.
 *
 * The channel has belonged to two things before this and neither could say what
 * the row is actually for. It first marked the metric the SENTENCE named, which
 * is one slot: a week headlining "+50% training time" put chartreuse on Hours
 * and left the distance that halved underneath it looking exactly like the two
 * figures that did not move. Then SELECTION took it, which fixed a press nobody
 * could see but made the card's only colour a function of what the finger was
 * doing — at rest it fell back to the sentence's one slot, and the second half
 * of the week stayed unsaid.
 *
 * Ranking the ends separately is what lets the row carry both halves at once,
 * and it costs the sentence nothing: `metric` is the LARGER of the same two
 * moves, so the bold word in the lead is always sitting on one of the two lit
 * columns. Colour here is the SEMANTIC channel, so this is also the point of it
 * — 4 km last week against 1 km this week is the thing to look at on a week
 * whose hours went up, and now it is the thing that is lit.
 *
 * THE TWO MARKS ARE NOT SYMMETRIC, deliberately. The rise is a bright figure
 * that glows off the card; the fall is a dark stain the figure sits in — the
 * maroon wash (core `colors.maroon`), which is the palette's only wash and
 * exists for this one column. Toned text alone gave the two ends the same
 * visual weight, and equal weight is the one thing the pair must not have: a
 * week's slip has to be the heavier mark even when its percentage is the
 * smaller one, because it is the half of the week that asks for a decision.
 *
 * THE MARK IS NOT THE SELECTION, and the two channels are kept apart. The mark
 * is about the PERIOD and does not move: tone on the label and the figure, the
 * end's own signed percentage under it (a second, non-hue channel, since the
 * pair reads as one grey to a red-green athlete), and the fall's wash.
 * Selection is about the FINGER and travels: the 2px rail, plus a 9% wash on
 * whichever column is open — including the untoned ones, which wash chalk so a
 * middle column still registers the press. The fall's column has a wash
 * already, so it LIFTS (`maroonLit`) rather than taking a tone-alpha that would
 * have made it go paler under the finger — a press must never read as the mark
 * being lifted off.
 *
 * THE BREAKDOWN IS A SHEET, and this is the third and last shape it has taken.
 * It began as a second bordered, rounded card drawn INSIDE this one, with a
 * caret travelling between the columns to point back at whichever figure had
 * opened it. That was un-carded into the card's own lower compartment — bled to
 * the card's edges, taking its bottom corners, eased open by the kit's
 * `ADrawer` — which fixed the card-in-a-card but not the thing underneath it:
 *
 *   • IT PUSHED THE SCREEN DOWN. Groups, a share bar, five session rows and a
 *     "show all" is several hundred points of content unfolding in the middle
 *     of Today, so Records, the exercise rail and the whole Endurance cluster
 *     below it were shoved off the fold by a press meant to answer one figure.
 *     Reading the answer meant scrolling; closing it left you somewhere else.
 *   • IT WAS A MODAL WEARING A DISCLOSURE. Everything inside it is a detour off
 *     the week — narrow to a sport, expand the list, open a session — and there
 *     was no dismissal but pressing the same column again, off-screen by then.
 *
 * The sheet is the shape the content already had: it comes up over Today
 * without moving a pixel of it, it takes the drag, the scrim and the tap-out
 * every other sheet on this screen takes (the period picker is one, ten points
 * above), and it RESTS AT ITS CONTENT HEIGHT, so five rows is a short sheet and
 * "show all" elongates it. What the card lost by giving the panel up — the
 * figure you pressed, sitting right above its own breakdown — the sheet
 * restates in its first row, because the column is behind the scrim now.
 *
 * The lit column stays. It is no longer POINTING at anything (a sheet is
 * unambiguous about what opened it), but it is what the screen looks like the
 * instant the finger lands, before the panel has travelled, and what is still
 * true underneath while it is up.
 *
 * THE FOUR COLUMNS DO NOT MOVE — Tonnage, Sessions, Hours, Distance, core's
 * VERDICT_METRICS order, every period, whatever the sentence is about. They
 * used to be sorted with the sentence's metric pulled to the front, so the row
 * never looked the same two weeks running and the figure you were reaching for
 * was never twice in the same place. Colour is what points at the subject; it
 * costs the layout nothing, and the row is found by POSITION before it is read
 * at all. The same order governs the meta line under every session row in the
 * sheet. Each column's LABEL is the metric's NAME and each FIGURE
 * carries its own unit — the one grammar all four can share, since tonnage's
 * unit is the athlete's (t or lb) and can only travel with the number.
 *
 * The COLUMN DIVIDERS followed them out. Each column drew a hairline on its left
 * edge, but the column is a rounded press target, so the hairline took the
 * radius and curled at both ends — tiny brackets between the figures, and the
 * divider had to be suppressed on both sides of whichever column was lit to stop
 * it cutting into the wash. The columns separate by whitespace now; label over
 * figure was always doing that work.
 */

/** ONE PERIOD FOR THE SCREEN — core's TODAY_RANGE_STORE_KEY, which the
 *  Endurance section's card reads too, so the two filters move together. */
/** Set once the athlete has opened any column — see the hint below. */
const HINT_KEY = "hybrid.today.actHinted";
/** Session rows before the sheet offers "show all". The sheet rests at its
 *  CONTENT height, so this is also what decides how tall it opens: five rows is
 *  a short sheet, and expanding the list elongates it rather than pushing
 *  Today's screen around, which is what the cap protected the screen from back
 *  when the breakdown unfolded inside the card. */
const ROWS_SHOWN = 5;

/** Render a "{m}"-templated sentence with the metric name in bold. */
function Lead({ template, word, color }: { template: string; word: string | null; color: string }) {
  const [before, after] = template.split("{m}");
  if (after === undefined || !word) {
    return <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg), color }}>{template}</Text>;
  }
  return (
    <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg), color }}>
      {before}
      <Text style={{ fontFamily: F.bold }}>{word}</Text>
      {after}
    </Text>
  );
}

/**
 * One destination row — the door to everything past this period. Exported
 * since wave 3: the doors render at the END of the Progress cluster (in
 * home.tsx), as the whole cluster's single exit point, not under this card.
 *
 * CHROMELESS since Aug 2026, the same pass that un-carded the rail tail
 * (aurora/rail-tail.tsx). A door is not a thing you own, it is the way out of
 * the things you own — so it stops wearing the ink2 fill, the hairline and the
 * radius that every CARD on Today wears, and reads as type on the ground. That
 * also ends the reading where a stack of two of them looked like two more
 * cards' worth of content below the week.
 *
 * THE RING IS THE GRAMMAR. A door carries its glyph in a ringed plate, exactly
 * as the rail tail carries its arrow; an EXPANDER — something that grows the
 * thing in place rather than opening a screen — carries a bare ＋/− with no
 * ring (the Other-sports tail, the endurance block's All-sports control). So
 * the ring says "this leaves", and nothing in either shape is a bordered box.
 * The rows separate by whitespace, not a rule: a hairline under a GroupMark is
 * the label-plus-rule divider the cluster markers deliberately retired.
 */
export function DoorRow({ title, sub, glyph, onPress, premium = false }: { title: string; sub: string; glyph: string; onPress: () => void; premium?: boolean }) {
  const { palette: C } = useTheme();
  const pa = usePremiumAccent();
  const glyphColor = premium ? pa.text : C.ash;
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title} – ${sub}`}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14,
        paddingHorizontal: 2, paddingVertical: 4,
      }}
    >
      <View style={{
        width: 32, height: 32, borderRadius: RADIUS.field,
        borderWidth: 1, borderColor: premium ? pa.text : C.line, alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ fontSize: fs.body, color: glyphColor }}>{glyph}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{title}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{sub}</Text>
      </View>
      <Text style={{ fontSize: fs.note, color: C.ash }}>›</Text>
    </PressScale>
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
  const { palette: C } = useTheme();
  const { t, lang } = useLang();

  // The chosen period, persisted per device under the PROGRESS key — the
  // shared filter owns the reading, the storage and the midnight re-derive.
  const { range, pick: setRange } = useActivityRange(TODAY_RANGE_STORE_KEY);
  const { title, span } = useRangeLabels(range);
  const [open, setOpen] = useState<ActivityMetric | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  // HOLD THE OPEN METRIC THROUGH THE EXIT. Sheet keeps its node mounted while
  // the panel slides back down; reading `open` straight would empty the body on
  // the first frame of that, so the athlete watches a blank sheet leave. Same
  // device as the freshness explainer's.
  const held = useRef<ActivityMetric | null>(null);
  useEffect(() => { if (open) held.current = open; }, [open]);
  const showing = open ?? held.current;
  // A session opened from inside the sheet is navigated to AFTER the panel has
  // gone, not underneath it — pushing a route while a Modal is up puts the new
  // screen behind the sheet. Same order upgrade.tsx uses for its route pop.
  const pending = useRef<string | null>(null);
  // THE HINT, ONCE. "Open a figure for the sessions behind it" is the only
  // sentence on this screen written about the interface rather than about the
  // athlete's training, and it held a row of the card forever — including on
  // the ten-thousandth visit. It now retires the first time any column is
  // opened. Starts true so it can only ever disappear, never flash in.
  const [hinted, setHinted] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(HINT_KEY).then((v) => setHinted(v === "1")).catch(() => {});
  }, []);

  // A new period is a new breakdown: the open column's group filter and its
  // "show all" must not carry over into a window they were never chosen in.
  const pick = (id: string) => {
    setRange(id);
    setGroup(null);
    setAll(false);
  };

  const v: ActivityVerdict = useMemo(() => activityVerdict(sessions, range, bw), [sessions, range, bw]);
  const summary = useMemo(() => activitySummary(sessions, range, bw), [sessions, range, bw]);

  // ── Formatting. Canonical → display; tonnage honours the athlete's unit,
  // distance keeps the shared km precision, and minutes go through the shared
  // duration formatter. Training time used to print DECIMAL hours — "1.1 h"
  // for 67 logged minutes, a figure nobody converts back in their head, and
  // one that read the same at 67 and 68 minutes. The COLUMN and the breakdown
  // beneath it share this formatter, so a span can't print two ways.
  const fmtMinutes = (m: number) => formatDuration(m, durationUnits(t));

  // ONE VALUE GRAMMAR across the four columns: the LABEL names the metric and
  // the FIGURE carries its own unit. Distance used to print bare ("6.83") under
  // a label that was itself the unit ("KM") — the only column of the four that
  // split it that way, so the row read as three measurements and one loose
  // number, and it could not be fixed in the label because tonnage's unit is
  // the athlete's (t or lb) and has to travel with the figure. Precision is
  // still core's one kilometre rule (distance.ts) — this changes what the
  // figure SAYS, never what it rounds to.
  const fmt = (metric: string, value: number) =>
    metric === "tonnage" ? fmtTonnage(value, units)
      : metric === "hours" ? fmtMinutes(value)
        : metric === "distance" ? fmtKm(value)
          : String(Math.round(value));

  /** A contribution in ITS OWN unit — 600 m of swimming inside a km total. */
  const fmtValue = (metric: ActivityMetric, value: number, g: { unit: "km" | "m" }) =>
    metric === "tonnage" ? fmtTonnage(value, units)
      : metric === "hours" ? fmtMinutes(value)
        : metric === "distance" ? `${groupDistanceDisplay(value, g.unit)} ${g.unit}`
          : value === 1 ? t("w.home.act.oneSession") : t("w.home.act.nSessions").replace("{n}", String(Math.round(value)));

  const groupName = (g: { labelKey: string | null; label: string | null }) => (g.labelKey ? t(g.labelKey) : g.label ?? "");

  const dateFmt = (ms: number, opts: Intl.DateTimeFormatOptions) => new Date(ms).toLocaleDateString(lang, opts);

  const tone = v.direction === "down" ? C.red : v.direction === "up" ? C.lime : C.ash;
  const toneText = txt(C, tone);
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
  // The gap BETWEEN columns, not a padding inside one — see the row below, where
  // it stopped being a divider's shoulder and became the whole separation.
  const gutter = wide ? 8 : 12;

  // ONE ORDER, ALWAYS: tonnage → sessions → hours → km, exactly as core hands
  // the figures over (VERDICT_METRICS). This row used to pull the SENTENCE's
  // metric to the front, which meant the four columns rearranged themselves
  // every time the week's story changed — tonnage led one week, distance the
  // next, and the figure you were looking for was never twice in the same
  // place. A row of totals is read by POSITION before it is read at all, so the
  // position has to be a constant. The sentence's subject is already marked
  // three ways that cost it nothing — the bold word in the lead, the column's
  // tone, and the delta beside it — and none of them require it to move.

  const detail: ActivityDetail | null = showing ? summary.details[showing] : null;
  const shown = detail
    ? (group ? detail.groups.find((g) => g.id === group)?.items ?? detail.items : detail.items)
    : [];
  const rows = all ? shown : shown.slice(0, ROWS_SHOWN);

  // A column can only be pressed while the sheet is DOWN (it covers the card
  // otherwise), so this opens rather than toggles. Every press is a fresh
  // breakdown: the previous one's group filter and "show all" belong to the
  // metric they were chosen on.
  const openColumn = (m: ActivityMetric) => {
    setGroup(null);
    setAll(false);
    setOpen(m);
    if (!hinted) {
      setHinted(true);
      AsyncStorage.setItem(HINT_KEY, "1").catch(() => {});
    }
  };

  /** A direction as a text colour. Distinct from `toneText` above, which is the
   *  SENTENCE's and reads ash when flat: a column the athlete deliberately
   *  opened is being read, so its flat state is chalk, not the muted grey of a
   *  figure nobody asked about. */
  const dirColor = (d: VerdictDirection) =>
    d === "down" ? txt(C, C.red) : d === "up" ? txt(C, C.lime) : C.chalk;

  // THE OPEN COLUMN'S OWN COMPARISON — the working-out for the colour the press
  // just produced, printed where it was produced. Absent when the metric has no
  // baseline to move from, which is not the same as "it didn't move".
  const openFig = showing ? v.figures.find((f) => f.metric === showing) ?? null : null;
  const openTone = openFig ? dirColor(figureDirection(openFig)) : C.chalk;
  const openDelta = openFig ? figureDeltaPct(openFig) : null;
  const openWhy = openFig && openDelta !== null
    ? t("w.home.act.vsBase")
      .replace("{d}", `${openDelta > 0 ? "+" : openDelta < 0 ? "−" : ""}${Math.abs(openDelta)}%`)
      .replace("{b}", fmt(openFig.metric, openFig.baseline))
    : null;

  return (
    <View style={{ marginTop: 20 }}>
      {/* Explore-standard head: display-face title left, mono meta right. The
          head names the window so no figure below it needs a qualifier. */}
      <RangeHead title={title} meta={span} />

      {/* ── THE DATE FILTER — the shared control (aurora/range-filter.tsx):
          neutral pill at rest, clear glass lens on touch/drag, per the iOS 26
          system control, with the Month segment intercepting to its picker
          sheet. Shared because the Endurance section carries one too. ────── */}
      <RangeFilter range={range} sessions={sessions} onPick={pick} />

      {/* ACard, not a hand-drawn copy of it. This spelled out ACard's exact
          base style (hairline, ink2, cardShadow, CARD_PAD) with the radius as
          a literal 28 rather than RADIUS.card — and on iOS 26 that copy is
          SOLID where the real one drops a native Liquid Glass layer, so
          Today's largest card was the odd material out. It takes no padding
          override either: the card used to drop its bottom pad to nothing so
          the lower compartment could supply its own, and the compartment left
          with the drawer. */}
      <ACard>
        {/* THE VERDICT — sentence, its working-out, and the signed delta. */}
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}>
          <View style={{ flex: 1 }}>
            <Lead
              template={t(verdictLeadKey(v))}
              word={v.metric ? t(verdictMetricKey(v.metric)) : null}
              color={C.chalk}
            />
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: leading(fs.micro), color: C.ash, marginTop: 5 }}>{why}</Text>
          </View>
          {/* Past the ceiling the percentage stops being a measurement — a
              0.1 km four-week mean yielded "+7849%", which reads as a bug and
              takes every figure beside it down with it. The STEP says the same
              thing honestly, and shorter. Both clients ask core, so neither
              can invent its own ceiling. */}
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={FIXED_FONT_SCALE}
            style={{ fontFamily: F.mono, fontSize: step ? 15 : 23, letterSpacing: step ? 0 : -0.5, color: toneText }}
          >
            {!v.metric ? "—"
              : step && named ? `${fmt(named.metric, named.baseline)} → ${fmt(named.metric, named.value)}`
                : `${v.deltaPct > 0 ? "+" : "−"}${Math.abs(v.deltaPct)}%`}
          </Text>
        </View>

        {/* THE RECEIPTS — the figures the sentence was drawn from. Each one is
            a button onto its own breakdown. */}
        {/* The columns separate by WHITESPACE. They used to carry a vertical
            hairline on each one's left edge, and because the column is also a
            12dp-rounded press target, that hairline inherited the radius and
            curled at both ends — four tiny bracket stubs floating between the
            figures, reading as clipped boxes rather than as a rule. A divider
            that cannot be drawn straight is a divider the layout does not need:
            each column is already a mono uppercase label stacked over a large
            figure, which groups it without help. Same reasoning that retired
            the hairline under a GroupMark. */}
        <View style={{ flexDirection: "row", gap: gutter, marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line }}>
          {v.figures.map((f, i) => {
            const isOpen = open === f.metric;
            // THE TWO ENDS TAKE THE COLOUR, always — core's `best` and `worst`.
            // Chartreuse on the figure that rose furthest above its baseline,
            // terracotta on the one that fell furthest below it, and nothing on
            // the columns in between.
            const dir: VerdictDirection | null =
              f.metric === v.best ? "up" : f.metric === v.worst ? "down" : null;
            const col = dir ? dirColor(dir) : null;
            const delta = dir ? figureDeltaPct(f) : null;
            // THE FALL SITS IN A WASH; THE RISE DOES NOT. The two marks are not
            // symmetric and should not be: a rise is a bright figure that glows
            // off the card, a fall is a dark stain the figure sits in. Toned
            // text alone gave them the same weight, which is the one thing the
            // pair must not have — a week's slip has to be the heavier mark
            // even when its percentage is the smaller one.
            //
            // It LIFTS rather than lightens when opened. The tone-alpha wash the
            // other columns use would have made the fall's column go PALER under
            // a finger, so the press read as the mark being lifted off.
            const wash = f.metric === v.worst
              ? (isOpen ? C.maroonLit : C.maroon)
              : isOpen ? withAlpha(col ?? C.chalk, col ? 0.09 : 0.06)
                : "transparent";
            return (
              <Pressable
                key={f.metric}
                onPress={() => openColumn(f.metric)}
                accessibilityRole="button"
                accessibilityState={{ selected: isOpen }}
                accessibilityLabel={[
                  t(verdictLabelKey(f.metric)),
                  fmt(f.metric, f.value),
                  // The mark is spelled out, because a screen reader gets none
                  // of the hue and none of the sign printed beside the figure.
                  dir === "up" ? t("w.home.act.aBest") : dir === "down" ? t("w.home.act.aWorst") : null,
                ].filter(Boolean).join(" – ")}
                accessibilityHint={t("w.home.act.hint")}
                style={{
                  // Padding is the WASH's inset now, so it is symmetric: the lit
                  // panel sits evenly around its own figure instead of being
                  // shouldered left to clear a divider that no longer exists.
                  // The first column pulls its inset back off the card's edge so
                  // the labels still line up with everything above them.
                  flex: 1, paddingHorizontal: 5, paddingTop: 4, paddingBottom: 6,
                  marginLeft: i === 0 ? -5 : 0, marginTop: -4, borderRadius: RADIUS.inner,
                  // A WASH OF ITS OWN TONE, not the `ink` fill that used to sit
                  // here: at 9% it reads as the column being lit rather than as
                  // a second surface laid over the card. An untoned column still
                  // has to register the press, so it washes chalk. The FALL is
                  // the exception — see `wash` above, it carries its maroon at
                  // rest.
                  backgroundColor: wash,
                }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: col ?? C.ash }}>
                  {t(verdictLabelKey(f.metric))}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: figSize, letterSpacing: tracking.display, marginTop: 3, color: col ?? C.chalk }}>
                  {fmt(f.metric, f.value)}
                </Text>
                {/* THE END'S OWN MOVE — the working-out for the colour, beside
                    the colour, and the SECOND CHANNEL the mark needs: a signed
                    percentage says "furthest up" and "furthest down" to an
                    athlete who cannot separate the two hues. It prints only on
                    the two ends, which is what keeps it a mark rather than a
                    fifth row of figures. */}
                {delta !== null && (
                  <Text
                    numberOfLines={1}
                    maxFontSizeMultiplier={FIXED_FONT_SCALE}
                    style={{ fontFamily: F.mono, fontSize: fs.nano, marginTop: 3, color: col ?? C.ash }}
                  >
                    {`${delta > 0 ? "+" : "−"}${Math.abs(delta)}%`}
                  </Text>
                )}
                {/* THE RAIL — selection in a second channel, so which column is
                    OPEN does not rest on the wash alone. It is deliberately not
                    the mark's channel: the mark is about the period and stays
                    put, the rail is about the finger and moves with it. */}
                <View style={{
                  height: 2, borderRadius: 2, marginTop: 7,
                  backgroundColor: isOpen ? (col ?? C.ash) : "transparent",
                }} />
              </Pressable>
            );
          })}
        </View>

        {/* The caret that used to sit here is gone. Its whole job was pointing
            at the column that opened the panel, and a sheet needs no pointing —
            see the file header. */}

        {!hinted && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, opacity: 0.75, textAlign: "center", marginTop: 10 }}>
            {t("w.home.act.hint")}
          </Text>
        )}
      </ACard>

      {/* ── THE BREAKDOWN, AS A SHEET. It comes up OVER Today rather than
          unfolding inside the card, so pressing a figure no longer shoves
          Records, the exercise rail and the whole Endurance cluster off the
          fold — and it dismisses the way everything else on this screen
          dismisses (drag, scrim, tap out), instead of only by finding the
          column that opened it, three hundred points up by then.

          It is the shared aurora/sheet.tsx, the same component the period
          picker ten points above opens on, so the two controls on this one card
          present identically. No `detents`: the sheet rests at its CONTENT
          height, which is what makes a five-row breakdown a short sheet and
          "show all" an elongation rather than a jump. ─────────────────────── */}
      <Sheet
        visible={!!open}
        onClose={() => setOpen(null)}
        // The session waits for the panel to LEAVE. Pushing the route from the
        // row's press would raise the session screen behind a sheet that is
        // still up (a Modal is its own native window), so the handler parks the
        // id and the exit spends it.
        onClosed={() => {
          const id = pending.current;
          pending.current = null;
          if (id) onSession?.(id);
        }}
        title={showing ? t(verdictLabelKey(showing)) : ""}
        sub={`${title}, ${span}`}
      >
        {detail && (
          <View>
            {/* THE FIGURE, RESTATED. The column it came from is behind the
                scrim now, so the sheet carries the total it is decomposing —
                in that column's own tone, with its own comparison beside it.
                Not the sentence's: a fallen Hours column reads terracotta
                whatever the week's headline was about. */}
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 2 }}>
              <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: 30, letterSpacing: tracking.display, color: openTone }}>
                {fmt(detail.metric, detail.total)}
              </Text>
              {openWhy && (
                <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: openTone }}>
                  {openWhy}
                </Text>
              )}
            </View>
            <MetricDetail
              detail={detail}
              rows={rows}
              shownCount={shown.length}
              all={all}
              group={group}
              onGroup={(id) => { setGroup(id); setAll(false); }}
              onAll={() => setAll((x) => !x)}
              onSession={onSession ? (id) => { pending.current = id; setOpen(null); } : undefined}
              t={t}
              fmtValue={fmtValue}
              fmtMinutes={fmtMinutes}
              groupName={groupName}
              dateFmt={dateFmt}
              units={units}
            />
          </View>
        )}
      </Sheet>

      {/* RECORDS — the Progress cluster's block (b), which used to be a mono
          kicker in this card's foot. It is a SECTION of its own now
          (aurora/period-records.tsx), headed like its neighbours, because
          Progress reads as three named things: This week, Records, Exercises.
          It still takes ITS window from this card's filter — a PR belongs to
          the period it happened in — which is why the range and the window's
          name are passed down rather than resolved again. */}
      <PeriodRecords
        sessions={sessions}
        range={range}
        windowName={title}
        units={units}
        bw={bw}
        onSession={onSession}
      />

      {/* The doors moved OUT of this card (wave 3): they are the retrospective's
          single exit now, rendered at the END of the Endurance cluster in
          home.tsx — one exit point after all the breakdowns, not a detour
          between the summary and the rails that decompose it. */}
    </View>
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
  const { palette: C } = useTheme();
  const byId = new Map(detail.groups.map((g) => [g.id, g]));
  const unitOf = (id: string): { unit: "km" | "m" } => byId.get(id) ?? { unit: "km" };

  /** The one meta line under a session row — this contribution's own figures,
   *  never the whole session's, so a run inside a lifting day can't claim the
   *  tonnage that happened beside it.
   *
   *  SAME ORDER AS THE COLUMNS ABOVE, tonnage → hours → km, minus whichever
   *  metric the panel is open on: that one is already the figure on the right
   *  of this very row, and printing it twice is what the omission is for. This
   *  used to be four hand-written branches, and each had picked its own
   *  sequence — a row read "20 min – 1.2 t" on the distance panel and
   *  "1.2 t – 20 min" one panel over — so the meta line contradicted the
   *  columns it hangs under, and itself. Distance also reads in the GROUP's own
   *  unit here, the same unit its value column uses, so a 600 m swim can't say
   *  "0.6 km" on one line and "600 m" on the next. */
  const meta = (it: ActivityEntry): string => {
    const bits: string[] = [];
    // Sets take tonnage's slot on the tonnage panel — they are what the
    // tonnage is MADE of, not a fifth figure standing beside it.
    if (detail.metric === "tonnage") {
      if (it.sets > 0) bits.push(`${it.sets} ${t("w.home.act.uSets")}`);
    } else if (it.tonnage > 0) bits.push(fmtTonnage(it.tonnage, units));
    if (detail.metric !== "hours" && it.minutes > 0) bits.push(fmtMinutes(it.minutes));
    if (detail.metric !== "distance" && it.distanceKm > 0) {
      bits.push(`${groupDistanceDisplay(it.distanceKm, unitOf(it.groupId).unit)} ${unitOf(it.groupId).unit}`);
    }
    return bits.join(" – ");
  };

  const kicker = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase" as const };

  return (
    <>
      {/* This row used to carry two things on its right in turn — the session
          count (now on the "Sessions" rule below, where the sessions actually
          are) and then the column's own comparison. The comparison rode up to
          the sheet's figure row with the figure it explains, so what is left is
          the label this always was: the heading over the share bar. */}
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...kicker, color: C.ash, marginTop: 14 }} numberOfLines={1}>
        {t(activityDetailKey(detail.metric))}
      </Text>

      {detail.groups.length === 0 && (
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 10 }}>{t("w.home.act.empty")}</Text>
      )}

      {detail.groups.length > 0 && (
        <>
          {/* The share bar — every group's slice of the total, in one line. */}
          <View style={{ flexDirection: "row", gap: 2, height: 6, marginTop: 12 }}>
            {detail.groups.map((g, i) => (
              <View key={g.id} style={{
                flexGrow: Math.max(g.share, 0.02), flexBasis: 0, borderRadius: RADIUS.pill,
                backgroundColor: i === 0 ? C.chalk : i === 1 ? C.ash : C.line,
                opacity: group && group !== g.id ? 0.35 : 1,
              }} />
            ))}
          </View>

          {/* One row per activity — tap to narrow the list underneath it. */}
          <View style={{ marginTop: 8 }}>
            {detail.groups.map((g: ActivityGroup) => {
              const active = group === g.id;
              return (
                <Pressable
                  key={g.id}
                  onPress={() => onGroup(active ? null : g.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 8,
                    paddingHorizontal: 8, paddingVertical: 6, marginHorizontal: -8,
                    backgroundColor: active ? C.ink2 : "transparent", borderRadius: RADIUS.inner,
                  }}
                >
                  <Text style={{ fontSize: fs.body, width: 18, textAlign: "center" }}>{g.icon}</Text>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>
                    {groupName(g)}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{Math.round(g.share * 100)}%</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk, minWidth: 62, textAlign: "right" }}>
                    {fmtValue(detail.metric, g.value, g)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* The sessions themselves — the receipts under the receipts. The
              count rides this rule now: it is a fact about the sessions, and
              this is the line that introduces them. */}
          <View style={{
            flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10,
            marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.line,
          }}>
            <Text style={{ ...kicker, color: C.ash }}>{t("w.home.act.sessionsHead")}</Text>
            <Text style={{ ...kicker, color: C.chalk }}>{detail.sessions}</Text>
          </View>
          <View style={{ marginTop: 4 }}>
            {rows.map((it, i) => {
              const line = meta(it);
              return (
                <Pressable
                  key={`${it.sessionId}-${it.groupId}-${i}`}
                  onPress={() => onSession?.(it.sessionId)}
                  disabled={!onSession}
                  accessibilityRole="button"
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    paddingHorizontal: 8, paddingVertical: 8, marginHorizontal: -8, borderRadius: RADIUS.inner,
                  }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, width: 44 }}>
                    {dateFmt(new Date(it.startedAt).getTime(), { day: "numeric", month: "short" })}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>{it.name}</Text>
                    {!!line && <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 1 }}>{line}</Text>}
                  </View>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.chalk }}>
                    {fmtValue(detail.metric, it.value, unitOf(it.groupId))}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {shownCount > ROWS_SHOWN && (
            <Pressable onPress={onAll} accessibilityRole="button" style={{ paddingVertical: 4, marginTop: 6 }}>
              <Text style={{ ...kicker, fontSize: fs.nano, color: C.ash }}>
                {all ? t("w.home.act.showFewer") : t("w.home.act.showAll").replace("{n}", String(shownCount))}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </>
  );
}
