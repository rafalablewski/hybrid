import { useEffect, useMemo, useState } from "react";
import { View, Text } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  activityVerdict, activitySummary, activityDetailKey, TODAY_RANGE_STORE_KEY,
  durationUnits, formatDuration,
  groupDistanceDisplay, fmtKm, kmValue,
  verdictLeadKey, verdictWhyKey, verdictMetricKey, verdictLabelKey, verdictShowsStep, fmtTonnage,
  figureDeltaPct, figureDirection,
  type ActivityDetail, type ActivityEntry, type ActivityGroup, type ActivityMetric,
  type ActivityVerdict, type BodyweightInput, type LoggedSession,
  type VerdictDirection, type WeightUnit,
} from "@hybrid/core";
import { ACard, ADrawer, CARD_PAD as SHARED_CARD_PAD, withAlpha } from "./kit";
import PeriodRecords from "./period-records";
import { RangeFilter, RangeHead, useActivityRange, useRangeLabels } from "./range-filter";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { leading, fs, F, PressScale, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";

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
const ROWS_SHOWN = 5;
/** The verdict card's own inner padding — what the detail compartment bleeds by
 *  to reach the card's edges. NOT the screen gutter: the compartment lives
 *  inside the card, so it must follow the card. The two were both written as
 *  bare numbers, which is how the 16 -> 12 gutter sweep came to "fix" this one
 *  into 12 as well, insetting the compartment 4dp from the card on both sides
 *  and shifting its text off the figures above it. Named, the mistake is no
 *  longer expressible.
 *
 *  The VALUE now comes from the kit (`CARD_PAD`), which is the point: naming it
 *  fixed which container it belonged to but not what it should be, and it sat
 *  at 16 while Performance sat at 20. Mirrors web's CARD_PAD. */
const CARD_PAD = SHARED_CARD_PAD;

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
        width: 32, height: 32, borderRadius: 16,
        borderWidth: 1, borderColor: premium ? pa.text : C.line, alignItems: "center", justifyContent: "center",
      }}>
        <Text style={{ fontSize: 13, color: glyphColor }}>{glyph}</Text>
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

  const fmt = (metric: string, value: number) =>
    metric === "tonnage" ? fmtTonnage(value, units)
      : metric === "hours" ? fmtMinutes(value)
        : metric === "distance" ? kmValue(value)
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

  // Named metric first — the sentence's subject shouldn't be the last column.
  const ordered = v.metric
    ? [...v.figures].sort((a, b) => (a.metric === v.metric ? -1 : b.metric === v.metric ? 1 : 0))
    : v.figures;

  const detail: ActivityDetail | null = open ? summary.details[open] : null;
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
  const openFig = open ? v.figures.find((f) => f.metric === open) ?? null : null;
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
          Today's largest card was the odd material out. Only the padding is
          genuinely this card's own: the compartment below supplies the bottom
          padding while it is open, so the card gives its own up rather than
          fencing the panel in. (Yoga resolves the edge-specific padding over
          ACard's shorthand, so passing all three is what overrides it.) */}
      <ACard style={{ paddingHorizontal: CARD_PAD, paddingTop: CARD_PAD, paddingBottom: open ? 0 : CARD_PAD }}>
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
              <Pressable
                key={f.metric}
                onPress={() => toggle(f.metric)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                accessibilityLabel={`${t(verdictLabelKey(f.metric))} – ${fmt(f.metric, f.value)}`}
                style={{
                  // Padding is the WASH's inset now, so it is symmetric: the lit
                  // panel sits evenly around its own figure instead of being
                  // shouldered left to clear a divider that no longer exists.
                  // The first column pulls its inset back off the card's edge so
                  // the labels still line up with everything above them.
                  flex: 1, paddingHorizontal: 5, paddingTop: 4, paddingBottom: 6,
                  marginLeft: i === 0 ? -5 : 0, marginTop: -4, borderRadius: 12,
                  // A WASH OF ITS OWN TONE, not the `ink` fill that used to sit
                  // here: at 9% it reads as the column being lit rather than as
                  // a second surface laid over the card.
                  backgroundColor: isOpen && col ? withAlpha(col, dir === "flat" ? 0.06 : 0.09) : "transparent",
                }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: col ?? C.ash }}>
                  {t(verdictLabelKey(f.metric))}
                </Text>
                <Text style={{ fontFamily: F.mono, fontSize: figSize, letterSpacing: -0.5, marginTop: 3, color: col ?? C.chalk }}>
                  {fmt(f.metric, f.value)}
                </Text>
                {/* THE RAIL — selection in a second channel, so the state does
                    not rest on hue alone (a flat column is toned chalk, and
                    colour vision is not universal). */}
                <View style={{
                  height: 2, borderRadius: 2, marginTop: 7,
                  backgroundColor: isOpen ? (col ?? C.ash) : "transparent",
                }} />
              </Pressable>
            );
          })}
        </View>

        {/* The caret that used to sit here is gone. Its whole job was pointing
            at the column that opened the panel, and the lit column does that
            without moving — see the file header. */}

        {/* ── THE DRAWER — the detail SLIDES out of the figure row instead of
            appearing under it. The measured height, the mount-on-first-open and
            the a11y clipping are the kit's `ADrawer`, the same one Volume's
            compact card opens on: this card had its own copy, which measured
            its panel IN FLOW inside a box clipped to zero and so could only
            ever measure zero. ─────────────────────────────────────────────── */}
        <ADrawer open={!!detail}>
          {detail && (
            <View style={{
              // THE CARD'S LOWER COMPARTMENT, not a card in a card. It bleeds
              // the card's own padding on three sides and inherits its bottom
              // corners (28 less the 1px border), so the only edge between the
              // figures and their breakdown is one hairline. The card drops its
              // bottom padding while this is open — the panel's own padding is
              // the card's bottom now.
              backgroundColor: C.ink, borderTopWidth: 1, borderTopColor: C.line,
              marginHorizontal: -CARD_PAD, marginTop: 12,
              paddingHorizontal: CARD_PAD, paddingTop: 14, paddingBottom: CARD_PAD,
              borderBottomLeftRadius: 27, borderBottomRightRadius: 27,
            }}>
              <MetricDetail
                detail={detail}
                why={openWhy}
                whyColor={openFig ? dirColor(figureDirection(openFig)) : C.ash}
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
            </View>
          )}
        </ADrawer>

        {!open && !hinted && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash, opacity: 0.75, textAlign: "center", marginTop: 10 }}>
            {t("w.home.act.hint")}
          </Text>
        )}
      </ACard>

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
  const { palette: C } = useTheme();
  const byId = new Map(detail.groups.map((g) => [g.id, g]));
  const unitOf = (id: string): { unit: "km" | "m" } => byId.get(id) ?? { unit: "km" };

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
      if (it.distanceKm > 0) bits.push(fmtKm(it.distanceKm));
    }
    return bits.join(" – ");
  };

  const kicker = { fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase" as const };

  return (
    <>
      {/* The right of this row used to carry the session count, which is now on
          the "Sessions" rule below — where the sessions actually are. This says
          instead what the column just did, in the tone the column is wearing:
          the reason for the colour, beside the colour. */}
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ ...kicker, color: C.ash, flex: 1 }} numberOfLines={1}>{t(activityDetailKey(detail.metric))}</Text>
        {why && (
          <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.micro, color: whyColor }}>
            {why}
          </Text>
        )}
      </View>

      {detail.groups.length === 0 && (
        <Text style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.ash, marginTop: 10 }}>{t("w.home.act.empty")}</Text>
      )}

      {detail.groups.length > 0 && (
        <>
          {/* The share bar — every group's slice of the total, in one line. */}
          <View style={{ flexDirection: "row", gap: 2, height: 6, marginTop: 12 }}>
            {detail.groups.map((g, i) => (
              <View key={g.id} style={{
                flexGrow: Math.max(g.share, 0.02), flexBasis: 0, borderRadius: 999,
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
                    backgroundColor: active ? C.ink2 : "transparent", borderRadius: 12,
                  }}
                >
                  <Text style={{ fontSize: 13, width: 18, textAlign: "center" }}>{g.icon}</Text>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>
                    {groupName(g)}
                  </Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash }}>{Math.round(g.share * 100)}%</Text>
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
                    paddingHorizontal: 8, paddingVertical: 8, marginHorizontal: -8, borderRadius: 12,
                  }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, width: 44 }}>
                    {dateFmt(new Date(it.startedAt).getTime(), { day: "numeric", month: "short" })}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.reg, fontSize: fs.caption, color: C.chalk }}>{it.name}</Text>
                    {!!line && <Text style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, marginTop: 1 }}>{line}</Text>}
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
              <Text style={{ ...kicker, fontSize: 10, color: C.ash }}>
                {all ? t("w.home.act.showFewer") : t("w.home.act.showAll").replace("{n}", String(shownCount))}
              </Text>
            </Pressable>
          )}
        </>
      )}
    </>
  );
}
