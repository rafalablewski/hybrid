import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Animated, useWindowDimensions, type LayoutChangeEvent, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  activityVerdict, activitySummary, activityDetailKey, TODAY_RANGE_STORE_KEY,
  durationUnits, formatDuration,
  groupDistanceDisplay, fmtKm,
  verdictLeadKey, verdictWhyKey, verdictMetricKey, verdictLabelKey, fmtTonnage,
  figureDeltaPct, figureDirection, figureShowsStep, activityComparison, comparisonHeadKey,
  fitMonoFigure,
  type ActivityDetail, type ActivityEntry, type ActivityGroup, type ActivityMetric,
  type ActivityVerdict, type BodyweightInput, type LoggedSession,
  type VerdictDirection, type WeightUnit, deltaRole, STATE_OPACITY } from "@hybrid/core";
import { ACard, withAlpha , RADIUS} from "./kit";
import ActivityCompare from "./activity-compare";
import PeriodRecords from "./period-records";
import { RangeFilter, RangeHead, useActivityRange, useRangeLabels } from "./range-filter";
import Sheet from "./sheet";
import { useLang } from "../../lib/i18n";
import { useTheme, txt, deltaPaint } from "../../lib/theme";
import { usePremiumAccent } from "../../lib/premium-accent";
import { leading, fs, space, F, PressScale, PressScale as Pressable, FIXED_FONT_SCALE, MAX_FONT_SCALE, TABULAR, tracking, trackFigure } from "../../lib/ui";
import { Mark } from "./mark";

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
 * THE MARKS RANK ON A LOWER BAR THAN THE SENTENCE (core's
 * VERDICT_END_THRESHOLD_PCT against VERDICT_THRESHOLD_PCT), and that is the
 * third thing the row needed. Ranking the ends separately is useless if both
 * ends have to clear the bar for making a CLAIM: a week of +31% hours, +18%
 * tonnage, −7% sessions and −9% distance produced a `worst` of null, so the one
 * measure that actually went backwards rendered in the same ash as the two that
 * held. A sentence needs a move worth stating; a mark only says which end of
 * this row the figure is, and the far end is the far end at 9%.
 *
 * Ranking the ends separately is what lets the row carry both halves at once,
 * and it costs the sentence nothing: `metric` is the LARGER of the same two
 * moves, so the bold word in the lead is always sitting on one of the two lit
 * columns. Colour here is the SEMANTIC channel, so this is also the point of it
 * — 4 km last week against 1 km this week is the thing to look at on a week
 * whose hours went up, and now it is the thing that is lit.
 *
 * BOTH MARKS ARE FOREGROUND, and the mark owns no background at all. The fall
 * spent a while sitting in a maroon WASH — a dark stain under the column, on
 * the argument that a slip must be the heavier of the two marks. It made one
 * column a SURFACE while the other three were type on the card, so the row read
 * as three figures and one filled box, and the box was what the eye found first
 * whether or not the slip was the week's story. Hue and sign already separate
 * the two ends; weight was never the axis the pair should have argued on.
 *
 * THE MARK IS NOT THE SELECTION, and the two channels are kept apart — which is
 * now a clean split, since they no longer share the background. The mark is
 * about the PERIOD and does not move: tone on the label and the figure, plus
 * that end's own signed percentage under it (a second, non-hue channel, since
 * the pair reads as one grey to a red-green athlete). Selection is about the
 * FINGER and travels: the 2px rail, plus a 9% wash of the column's own tone on
 * whichever column is open — including the untoned ones, which wash chalk so a
 * middle column still registers the press.
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
 * THE FOUR FIGURES DO NOT MOVE — Tonnage, Sessions, Hours, Distance, core's
 * VERDICT_METRICS order, every period, whatever the sentence is about. They
 * used to be sorted with the sentence's metric pulled to the front, so the set
 * never looked the same two weeks running and the figure you were reaching for
 * was never twice in the same place. Colour is what points at the subject; it
 * costs the layout nothing, and a total is found by POSITION before it is read
 * at all. The same order governs the meta line under every session row in the
 * sheet. Each cell's LABEL is the metric's NAME and each FIGURE carries its own
 * unit — the one grammar all four can share, since tonnage's unit is the
 * athlete's (t or lb) and can only travel with the number.
 *
 * The COLUMN DIVIDERS followed them out. Each column drew a hairline on its left
 * edge, but the column is a rounded press target, so the hairline took the
 * radius and curled at both ends — tiny brackets between the figures, and the
 * divider had to be suppressed on both sides of whichever column was lit to stop
 * it cutting into the wash. The cells separate by whitespace now; label over
 * figure was always doing that work.
 *
 * ── THE REDESIGN (Aug 2026) ──────────────────────────────────────────────────
 *
 * The card reported as visually broken, and it was: on a hybrid athlete's week
 * "DISTANCE" wrapped mid-word to "DISTA / NCE" and "9.18 km" wrapped to "9.18 /
 * km", so two of the four figures sat a line lower than the other two and the
 * receipts read as debris. Three things were wrong under that, and the wrap was
 * only the one you could see.
 *
 * THE ROW OF FOUR NEVER FITTED. Not at 17dp, not at 20 — the arithmetic is
 * written out at CELL_WIDTH, and it says a quarter-width column would need the
 * app's BODY size to hold "6h 52min". `figSize = wide ? 17 : fs.heading` was a
 * layout apologising for itself: it spent a rung of legibility and wrapped
 * anyway. Two up, at the full 20dp, a figure needs 96dp of the cell's 155 —
 * enough spare for Dynamic Type at 1.4×, for German, and for any formatter that
 * ever grows a character. Nothing shrinks, nothing abbreviates, nothing wraps.
 * The grid is also square, which the row never was.
 *
 * THE HEADLINE FIGURE IS GONE, and this is the deletion the card most needed.
 * The lead's corner carried the named metric's percentage at 23dp; the cell for
 * that same metric carried the same percentage again, 90dp below and 60dp left.
 * Not sometimes — ALWAYS: `metric` is by construction one of the two ends, so
 * whatever the week did, the card stated its headline number twice, in two
 * sizes, in the same chartreuse, on one diagonal. What survives is the one with
 * more in it: the cell's, which says WHICH measure moved by sitting on it,
 * where the corner's needed the sentence to say so. The header now carries what
 * the grid cannot — the interpretation and the axis it was measured from — and
 * the grid carries every number. Two zones, one job each.
 *   The ceiling moved with it. `verdictShowsStep` guarded the corner alone, so
 * a cell printed its raw percentage whatever the size: on the very week the
 * ceiling exists for, the lead read "0.1 km → 6.8 km" and the cell under it read
 * "+7849%". Core's `figureShowsStep` is that rule asked of a figure, and the
 * cell asks it.
 *
 * TONE MARKS THE VALUE, NEVER THE SCAFFOLDING. An end used to tint its label,
 * its figure AND its mark, so a marked week carried six tinted elements out of
 * about fourteen and read as two coloured boxes with two plain columns beside
 * them. Labels are ash now, always, on every cell. What is left lit is the
 * figure and its signed move — the value and the working-out for its colour —
 * which is what makes the two ends findable instead of merely loud.
 *
 * THE HERO CAME BACK, AS TYPE RATHER THAN AS A SECOND COPY. Deleting the corner
 * removed a duplicate and, with it, the only thing on the card readable at arm's
 * length — a fair objection, and restoring the corner would restore the
 * duplication with it. So the size goes where the number already is: the cell
 * for the metric the sentence names is drawn a ladder rung up, IN ITS OWN
 * POSITION, so the card has one hero figure and the grid keeps its constant
 * order. The rung is DERIVED — `fitMonoFigure` against the cell's measured type
 * width and the athlete's own text scale (see PROMOTED_LADDER) — because
 * picking a size and hoping is the exact habit that produced "DISTA / NCE".
 * A cold or flat card promotes nothing: no metric was named, so there is no
 * subject to draw large.
 *
 * THE PAGER TRAVELS WITH THE FINGER. The card is the height of the page it is
 * on, and that height used to change on `onMomentumScrollEnd` — so the whole
 * drag ran at page one's height with page two arriving CLIPPED, and then, once
 * the finger was long gone, the card played a 220ms LayoutAnimation and grew.
 * Height and the page dots are now interpolated off the scroll offset itself
 * (see `progress`), so the card grows as the page arrives, an abandoned swipe
 * travels back instead of snapping, and the indicator says where the swipe HAS
 * got to rather than where it ended up.
 *
 * And the LABEL is a name, not a kicker: the display face, sentence case,
 * untracked. Mono uppercase at `tracking.label` is the widest way this app can
 * set eight characters, which is the mechanical cause of "DISTA / NCE"; it is
 * also the wrong grammar, and page two of this very card had already said so
 * (measure-row's MeasureLine — "It names a thing, and things get names, not
 * labels"). The two pages now agree about what a metric's name looks like.
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

/**
 * THE RECEIPT GRID IS TWO UP, AND THE ARITHMETIC IS WHY.
 *
 * The four figures sat in one row of four, and two of them broke mid-word on a
 * standard phone — "DISTANCE" wrapping to "DISTA / NCE", "9.18 km" to "9.18 /
 * km". That was not a missing `numberOfLines`; a clip would only have traded a
 * broken word for a truncated one. It is that four figures do not fit.
 *
 * Measure it once, so nobody has to guess again. A 390dp screen gives the card
 * 326dp of content (390 less the 12dp screen gutter each side, less CARD_PAD
 * each side). Four cells with an 8dp gutter are 75dp wide, ~65dp inside their
 * own padding. "6h 52min" is eight glyphs and JetBrains Mono advances 0.6em, so
 * it needs 4.8 × the size: to fit 65dp the figure would have to be 13dp —
 * the app's BODY TEXT size, for the largest figures on Today's largest card.
 * The 17dp the row shrank to (from 20, whenever a fourth metric appeared) was
 * a compromise between two impossibilities, and it wrapped anyway.
 *
 * Two up, a cell is 171dp — 155dp of type, the grid bleeding one inset either
 * side — and the same eight glyphs at the full 20dp need 96dp. The 59dp spare
 * is what carries Dynamic Type (1.4× → 134dp, still inside), the German
 * "Trainingszeit", a year-to-date span, and any formatter that ever grows a
 * character. The figure stops shrinking, the label stops abbreviating, and the
 * grid is square.
 *
 * READING ORDER IS UNCHANGED — row-major is VERDICT_METRICS order (tonnage,
 * sessions / hours, distance), so the constancy the row was built for survives
 * the reflow: a figure is found by POSITION, and every position is still fixed.
 * A three-metric athlete gets two cells and a third alone on the second row,
 * left-aligned under the first — a half-width cell in a half-width grid, not an
 * orphan.
 */
const CELL_WIDTH = "50%";
/** The cell's padding — the wash's inset, and the bleed the grid takes so a
 *  cell's type still lands on the card's own content column. */
const CELL_INSET = space.sm;
/** The figure size for a cell the sentence is NOT about. See CELL_WIDTH. */
const FIGURE_SIZE = fs.heading;

/**
 * THE NAMED METRIC'S CELL IS DRAWN LARGER — the card's one hero figure, and the
 * answer to what the deleted corner percentage was actually for.
 *
 * Deleting the corner removed a duplicate, and it also removed the only thing on
 * the card readable at arm's length. Restoring the corner would restore the
 * duplication with it, so the size goes where the number already is: the cell
 * for the metric the sentence names. One number, one place, and now the biggest
 * thing on the card is the thing the card is about.
 *
 * IT MOVES NOTHING. The promoted cell keeps its position in VERDICT_METRICS
 * order — tonnage stays first whether or not it is the week's story — so the
 * position constancy the grid is built on is untouched. Only the type changes.
 *
 * THE SIZE IS DERIVED, NOT PICKED, which is the lesson of the row this grid
 * replaced. `fitMonoFigure` (core scale.ts) asks the one multiplication a
 * monospaced figure makes possible — characters × size × 0.6em — against the
 * cell's MEASURED type width and the athlete's OWN text scale, and hands back
 * the largest rung that fits. So "15.3 t" gets the full 26, a nine-glyph
 * "10h 15min" steps to 22 rather than clipping, a year-to-date "1240h 55min"
 * sits at 20 with its neighbours, and the same figure at 1.4× Dynamic Type
 * steps down instead of running off the card. A hero figure that has to be
 * ellipsised was never a hero figure.
 */
const PROMOTED_LADDER = [fs.display, fs.headline, fs.heading] as const;

/** ONE LINE BOX for every figure, sized to the tallest rung a cell can draw, so
 *  a promoted figure and a plain one share a baseline instead of sitting a few
 *  points apart. */
const FIGURE_BOX = leading(PROMOTED_LADDER[0], "tight");

/**
 * Render a "{m}"-templated sentence with the metric name in bold.
 *
 * It reads at `fs.subtitle` on `snug` leading, a rung up from the `fs.bodyLg` it
 * spent its life at. Two things bought the rung. It has the CARD'S WHOLE WIDTH
 * now — the corner figure that used to take a third of the line is gone — so a
 * larger setting still lands in one or two lines rather than three. And it is
 * the card's lead in fact as well as in position: the page's numbers all sit in
 * the grid below, so the one thing at the top of the card is the sentence, and
 * a lead set at emphasised-body size reads as a caption for something else.
 */
function Lead({ template, word, color }: { template: string; word: string | null; color: string }) {
  const style = { fontFamily: F.reg, fontSize: fs.subtitle, lineHeight: leading(fs.subtitle, "snug"), color };
  const [before, after] = template.split("{m}");
  if (after === undefined || !word) {
    return <Text style={style}>{template}</Text>;
  }
  return (
    <Text style={style}>
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
  // The OS text scale, LIVE — `useWindowDimensions` re-renders when the athlete
  // changes it, where `PixelRatio.getFontScale()` would answer with whatever it
  // was at mount. It decides how large the promoted figure may be drawn.
  const { fontScale } = useWindowDimensions();

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

  // THE PAGER. The card is two pages wide: the verdict, and the comparison.
  // `page` is the settled index (momentum end), `pageW` the content width the
  // ScrollView measures for itself — the card's own inner width, not the
  // screen's, since the pager lives INSIDE the card and its pages respect the
  // card's padding (the full-bleed rule is for rails sitting on a screen).
  const [page, setPage] = useState(0);
  const [pageW, setPageW] = useState(0);
  // Each page's own height, so the card can be the height of the page it is on.
  // Page one is ~157dp of content and page two ~390dp; a pager fixed to the
  // taller one leaves two hundred points of dead card under the figure row, on
  // the page an athlete sees first, every time.
  const [heights, setHeights] = useState<[number, number]>([0, 0]);

  const measure = (i: 0 | 1) => (e: LayoutChangeEvent) => {
    const h = Math.round(e.nativeEvent.layout.height);
    setHeights((prev) => (Math.abs(prev[i] - h) < 1 ? prev : (i === 0 ? [h, prev[1]] : [prev[0], h])));
  };

  /**
   * THE SWIPE'S OWN PROGRESS, 0 → 1, and the card is a function of it.
   *
   * The card is the height of the page it is on, and page one is ~200dp against
   * page two's ~390. That height used to change on `onMomentumScrollEnd`: the
   * whole drag ran with the card still at page one's height — so page two came
   * in CLIPPED, its rows cut off at a border that had not moved yet — and then,
   * once the finger was long gone and the deceleration had finished, the card
   * played a 220ms LayoutAnimation and grew. Two motions, in sequence, neither
   * of them the one the finger was making.
   *
   * Driving it off the scroll offset makes the card grow WITH the drag: at 40%
   * across, the card is 40% of the way between the two heights and page two is
   * arriving at exactly the height it will rest at. It also means an abandoned
   * swipe — dragged 30% and released — travels back rather than snapping, since
   * the offset it is interpolated from is doing the same thing.
   *
   * It cannot use the native driver: `height` is a layout property, and layout
   * is not native-drivable in RN. That is fine here — one interpolation per
   * frame on a view that is already re-laying out is not what drops frames, and
   * the alternative (a fixed height at the taller page) is two hundred points
   * of dead card under the figures on the page an athlete opens on.
   */
  const progress = useRef(new Animated.Value(0)).current;
  const onScroll = useMemo(
    () => Animated.event([{ nativeEvent: { contentOffset: { x: progress } } }], { useNativeDriver: false }),
    [progress],
  );
  // Both pages have to have reported before the card can be a function of the
  // offset; until then it sizes to its content, exactly as it always did.
  const measured = pageW > 0 && heights[0] > 0 && heights[1] > 0;
  // MEMOISED, and it is not a micro-optimisation: `interpolate()` registers a
  // new node on its parent Animated.Value every call, so building these inline
  // would hang one per render off a value that lives as long as the card. Same
  // trap `useEntrance` documents in lib/ui.
  const swipe = useMemo(() => {
    if (!measured) return null;
    const track = (outputRange: readonly (number | string)[]) =>
      progress.interpolate({ inputRange: [0, pageW], outputRange: outputRange as number[], extrapolate: "clamp" });
    return {
      height: track([heights[0], heights[1]]),
      // The dots travel with the card: the leaving pill contracts as the
      // arriving one stretches, and the chartreuse crosses between them.
      dots: [
        { width: track([20, 7]), backgroundColor: track([C.lime, C.line]) },
        { width: track([7, 20]), backgroundColor: track([C.line, C.lime]) },
      ],
    };
  }, [measured, progress, pageW, heights, C.lime, C.line]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const w = e.nativeEvent.layoutMeasurement.width || pageW || 1;
    const i = Math.max(0, Math.min(1, Math.round(e.nativeEvent.contentOffset.x / w)));
    if (i === page) return;
    // No LayoutAnimation here any more: the height has been travelling with the
    // finger for the whole drag and is already where it needs to be. `page` is
    // now only what the card reports about ITSELF — which page an assistive
    // technology is on, and which way the hint retires.
    setPage(i);
    if (!hinted) {
      setHinted(true);
      AsyncStorage.setItem(HINT_KEY, "1").catch(() => {});
    }
  };

  const v: ActivityVerdict = useMemo(() => activityVerdict(sessions, range, bw), [sessions, range, bw]);
  const summary = useMemo(() => activitySummary(sessions, range, bw), [sessions, range, bw]);
  // The second page's model — the same figures, the same baselines and the same
  // two ends the row above already carries, so the chart and the row can never
  // disagree about one week.
  const compare = useMemo(() => activityComparison(v), [v]);

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

  const named = v.figures.find((f) => f.metric === v.metric) ?? null;

  // THE PROMOTED CELL'S SIZE — derived against the cell's own measured type
  // width and the athlete's own text scale.
  //
  // `pageW` is the card's INNER width (the pager measures it for its pages).
  // The grid bleeds by one inset either side, so it is `pageW + 2·INSET` wide,
  // a cell is half of that, and a cell's TYPE is that less its own padding:
  //   (pageW + 2·INSET) / 2 − 2·INSET  =  pageW / 2 − INSET
  // 155dp on a 390dp screen. Confirmed against the rendered cell rather than
  // derived and trusted — the first spelling of this line dropped an inset and
  // would have under-sized every promoted figure by 8dp of budget.
  //
  // Until the measurement lands `fitMonoFigure` answers the top of the ladder,
  // so a typical figure never renders small for a frame and then jumps up.
  const cellType = pageW > 0 ? pageW / 2 - CELL_INSET : 0;
  const figureSize = (f: { metric: ActivityMetric; value: number }) =>
    f.metric !== v.metric || v.cold
      ? FIGURE_SIZE
      : fitMonoFigure(fmt(f.metric, f.value), cellType, PROMOTED_LADDER, Math.min(fontScale, MAX_FONT_SCALE));

  // The working-out carries the BASELINE alone. It used to open with the
  // period's own value as well ("6.8 against a 0.1 four-week average"), which
  // reprinted the figure the column two rows below was already showing — and
  // for the named metric, the one the sentence had just made its subject. The
  // comparison divides cleanly without it: the sentence names the metric and
  // the direction, the figure on the right carries the magnitude, this line
  // carries what it was measured against.
  const why = v.metric && named
    ? t(verdictWhyKey(v)).replace("{b}", fmt(named.metric, named.previous))
    : t(verdictWhyKey(v));

  // ONE ORDER, ALWAYS: tonnage → sessions → hours → km, exactly as core hands
  // the figures over (VERDICT_METRICS) — and row-major across the two-up grid,
  // so the reflow costs the order nothing (see CELL_WIDTH). The grid used to
  // pull the SENTENCE's metric to the front, which meant the four figures
  // rearranged themselves every time the week's story changed — tonnage led one
  // week, distance the next, and the figure you were looking for was never
  // twice in the same place. A set of totals is read by POSITION before it is
  // read at all, so the position has to be a constant. The sentence's subject
  // is already marked two ways that cost it nothing — the bold word in the lead
  // and the cell's own tone — and neither requires it to move.

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
  const dirColor = (d: VerdictDirection) => deltaPaint(C, d);

  // THE OPEN COLUMN'S OWN COMPARISON — the working-out for the colour the press
  // just produced, printed where it was produced. Absent when the metric has no
  // baseline to move from, which is not the same as "it didn't move".
  const openFig = showing ? v.figures.find((f) => f.metric === showing) ?? null : null;
  const openTone = openFig ? dirColor(figureDirection(openFig)) : C.chalk;
  const openDelta = openFig ? figureDeltaPct(openFig) : null;
  const openWhy = openFig && openDelta !== null
    ? t("w.home.act.vsBase")
      .replace("{d}", `${openDelta > 0 ? "+" : openDelta < 0 ? "−" : ""}${Math.abs(openDelta)}%`)
      .replace("{b}", fmt(openFig.metric, openFig.previous))
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
        {/* ── THE PAGER. The card is two pages wide now: the VERDICT, and the
            COMPARISON. The figure row can mark only two of its four metrics
            (`best` and `worst` are the period's two ENDS), so the other two
            comparisons were computed on every render and thrown away; page two
            keeps them. See aurora/activity-compare.tsx for why it is a page and
            not a sheet.

            It is the app's existing pager idiom — the same `pagingEnabled` +
            `snapToInterval` + `decelerationRate="fast"` ScrollView that carries
            workout-wrapped's slides, with that screen's dot indicator under it.

            THE FULL-BLEED RULE DOES NOT APPLY. Screen-level rails must let their
            cards slide under the physical screen edge; this pager sits INSIDE a
            card, which is the rule's stated exception, so its pages respect the
            card's padding and the card keeps its own gutter.

            THE FILTER STAYS OUTSIDE IT, above the card. Both pages describe the
            same window, so a control that changed on page two would be a second
            period hiding behind a swipe. ─────────────────────────────────── */}
        <Animated.ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToInterval={pageW || undefined}
          onLayout={(e) => setPageW(Math.round(e.nativeEvent.layout.width))}
          onScroll={onScroll}
          // 16ms — the card's height is a function of this offset now, so the
          // events ARE the animation. At the RN default (0, i.e. one event per
          // gesture) the card would arrive in a single step, which is the jump
          // this replaced.
          scrollEventThrottle={16}
          onMomentumScrollEnd={settle}
          // The card is the height of the page it is on — travelling with the
          // drag rather than jumping after it. See `progress` above.
          style={{ height: swipe?.height }}
          contentContainerStyle={{ alignItems: "flex-start" }}
        >
          <View style={{ width: pageW || undefined }} onLayout={measure(0)}>
        {/* THE VERDICT — the sentence and its working-out, and NO figure. The
            card's lead is an interpretation; every number on this page belongs
            to the receipt grid under it, where it sits on the measure it is a
            number about. See THE HEADLINE FIGURE IS GONE in the file header. */}
        <View>
          <Lead
            template={t(verdictLeadKey(v))}
            word={v.metric ? t(verdictMetricKey(v.metric)) : null}
            color={C.chalk}
          />
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: leading(fs.micro), color: C.ash, marginTop: space.xs }}>{why}</Text>
        </View>

        {/* THE RECEIPTS — the figures the sentence was drawn from, TWO UP.
            Each cell is a button onto its own breakdown. */}
        {/* The hairline is its own line rather than the grid's border-top: the
            grid is BLED by a cell's inset (so a label lands on the card's
            content column and not a cell-padding in from it), and a border on
            a bled box would run wider than everything above it. */}
        <View style={{ marginTop: space.lg, borderTopWidth: 1, borderTopColor: C.line }} />
        {/* The cells separate by WHITESPACE. They used to carry a vertical
            hairline on each one's left edge, and because the cell is also a
            12dp-rounded press target, that hairline inherited the radius and
            curled at both ends — four tiny bracket stubs floating between the
            figures, reading as clipped boxes rather than as a rule. A divider
            that cannot be drawn straight is a divider the layout does not need:
            each cell is already a name stacked over a large figure, which
            groups it without help. Same reasoning that retired the hairline
            under a GroupMark. */}
        <View style={{
          flexDirection: "row", flexWrap: "wrap",
          marginTop: space.md - CELL_INSET, marginHorizontal: -CELL_INSET,
        }}>
          {v.figures.map((f) => {
            const isOpen = open === f.metric;
            // THE TWO ENDS TAKE THE COLOUR, always — core's `best` and `worst`.
            // Chartreuse on the figure that rose furthest above its baseline,
            // terracotta on the one that fell furthest below it, and nothing on
            // the columns in between.
            const dir: VerdictDirection | null =
              f.metric === v.best ? "up" : f.metric === v.worst ? "down" : null;
            const col = dir ? dirColor(dir) : null;
            const delta = dir ? figureDeltaPct(f) : null;
            // PAST THE CEILING A PERCENTAGE STOPS BEING A MEASUREMENT — core's
            // rule, now asked of the CELL, because the cell is where the only
            // percentage on this page is drawn. It used to be asked of the
            // headline alone, so the week that made the rule necessary printed
            // an honest "0.1 km → 6.8 km" in the lead and "+7849%" three lines
            // under it. The step is the same fact, said in figures nobody has
            // to disbelieve.
            const mark = delta === null ? null
              : figureShowsStep(f) ? `${fmt(f.metric, f.previous)} → ${fmt(f.metric, f.value)}`
                : `${delta > 0 ? "+" : "−"}${Math.abs(delta)}%`;
            // THE SENTENCE'S METRIC IS DRAWN LARGER — see PROMOTED_LADDER.
            const size = figureSize(f);
            // BOTH MARKS ARE FOREGROUND. The fall used to sit in a maroon wash
            // — a dark stain under the column, on the argument that a slip must
            // be the heavier mark. It made the fall a SURFACE while every other
            // column was type on the card, so the row read as three figures and
            // one filled box, and the box was the thing the eye found first
            // whether or not the slip was the week's story. The pair is
            // separated by hue and by sign, which is the separation it needed;
            // weight was never the axis it should have argued on.
            //
            // So the background is the SELECTION channel alone, on every column
            // alike: transparent at rest, a 9% wash of the column's own tone
            // under a finger, and chalk at 6% for an untoned column so a middle
            // one still registers the press.
            const wash = isOpen ? withAlpha(col ?? C.chalk, col ? 0.09 : 0.06) : "transparent";
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
                  // HALF THE GRID, ALWAYS — see CELL_WIDTH. The inset is the
                  // WASH's padding and is symmetric on all four sides, so the
                  // lit cell sits evenly around its own figure; the grid bleeds
                  // by that same inset, so a cell's type still lands on the
                  // card's content column.
                  width: CELL_WIDTH, padding: CELL_INSET, borderRadius: RADIUS.inner,
                  // A WASH OF ITS OWN TONE, not the `ink` fill that used to sit
                  // here: at 9% it reads as the cell being lit rather than as
                  // a second surface laid over the card. An untoned cell still
                  // has to register the press, so it washes chalk. NOTHING sits
                  // here at rest, on any cell — the background is selection's
                  // channel and the marks are foreground (see `wash` above).
                  backgroundColor: wash,
                }}
              >
                {/* THE NAME IS A NAME. It was a mono uppercase kicker tracked
                    at 0.9, which is the widest way this app can set eight
                    characters — and in a quarter-width column "DISTANCE" did
                    not fit, so it broke mid-word to "DISTA / NCE". The display
                    face, sentence case, untracked, is both the narrower setting
                    and the house grammar for a thing's name (measure-row's
                    MeasureLine, one drag away on page two: "It names a thing,
                    and things get names, not labels").
                    IT IS ALWAYS ASH. The tone marks the VALUE, never the
                    scaffolding — an end used to tint its name, its figure and
                    its mark, so a four-cell grid carried six tinted elements
                    and the row read as two coloured boxes rather than as four
                    figures, two of which are lit. */}
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={{ fontFamily: F.semi, fontSize: fs.caption, lineHeight: leading(fs.caption, "snug"), color: C.ash }}
                >
                  {t(verdictLabelKey(f.metric))}
                </Text>
                {/* THE FIGURE — one size for every cell, every period. It used
                    to shrink to 17 when a fourth metric appeared, which is the
                    shape of a layout apologising for itself: four legible
                    figures never fitted on one line at any size (see
                    CELL_WIDTH), so the shrink bought a rung of legibility and
                    the row wrapped anyway. TABULAR because a figure that sits
                    in a column lines up or it does not. */}
                <Text
                  numberOfLines={1}
                  maxFontSizeMultiplier={MAX_FONT_SCALE}
                  style={{
                    ...TABULAR, fontFamily: F.mono, fontSize: size,
                    // EVERY FIGURE SITS IN THE SAME LINE BOX, whatever size it
                    // is drawn at — the promoted one's. Sizing the box to the
                    // glyphs would drop a 20dp figure's baseline a few points
                    // above its 26dp neighbour's, and two figures side by side
                    // on two baselines is the raggedness this grid replaced,
                    // reintroduced by the fix for it.
                    lineHeight: FIGURE_BOX, letterSpacing: trackFigure(size),
                    marginTop: space.xxs, color: col ?? C.chalk,
                  }}
                >
                  {fmt(f.metric, f.value)}
                </Text>
                {/* THE END'S OWN MOVE — the working-out for the colour, beside
                    the colour, and the SECOND CHANNEL the mark needs: a signed
                    percentage says "furthest up" and "furthest down" to an
                    athlete who cannot separate the two hues. It prints only on
                    the two ends, which is what keeps it a mark rather than a
                    fifth figure.
                    THE SLOT IS RESERVED ON EVERY CELL, marked or not, so all
                    four cells are one height and the two grid rows share one
                    baseline. An unmarked cell renders NOTHING in it — silence
                    is the true statement ("this is not an end"), where the em
                    dash MeasureScale prints would claim a missing value. */}
                <View style={{ height: leading(fs.nano, "snug"), justifyContent: "center", marginTop: space.xxs }}>
                  {mark !== null && (
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={FIXED_FONT_SCALE}
                      style={{ ...TABULAR, fontFamily: F.mono, fontSize: fs.nano, color: col ?? C.ash }}
                    >
                      {mark}
                    </Text>
                  )}
                </View>
                {/* THE RAIL — selection in a second channel, so which cell is
                    OPEN does not rest on the wash alone. It is deliberately not
                    the mark's channel: the mark is about the period and stays
                    put, the rail is about the finger and moves with it. */}
                <View style={{
                  height: 2, borderRadius: 2, marginTop: space.xs,
                  backgroundColor: isOpen ? (col ?? C.ash) : "transparent",
                }} />
              </Pressable>
            );
          })}
        </View>

        {/* The caret that used to sit here is gone. Its whole job was pointing
            at the column that opened the panel, and a sheet needs no pointing —
            see the file header. */}

          </View>

          {/* PAGE TWO — every metric against its own average, on one axis. */}
          <View style={{ width: pageW || undefined }} onLayout={measure(1)}>
            <ActivityCompare
              rows={compare}
              headline={t(comparisonHeadKey(v))}
              fmt={fmt}
              onOpen={openColumn}
              t={t}
            />
          </View>
        </Animated.ScrollView>

        {/* THE PAGE INDICATOR — workout-wrapped's geometry, verbatim: 7dp dots,
            the active one a 20dp chartreuse pill. Reused rather than re-drawn,
            because five rails once drew five different tails.
            IT TRAVELS, because the card behind it does. The pill used to swap
            at `onMomentumScrollEnd` — so a drag held halfway showed the card
            two-thirds grown under an indicator still insisting it was on page
            one, and the pill then popped from 7dp to 20dp with nothing under
            the finger to explain it. Interpolated off the same offset, the pill
            stretches and the hue crosses over as the page arrives, which is the
            one thing an indicator is for: saying where the swipe HAS got to,
            not where it ended up. */}
        <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginTop: 14 }}>
          {[0, 1].map((i) => (
            <Animated.View
              key={i}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={[
                { height: 7, borderRadius: RADIUS.pill },
                swipe ? swipe.dots[i] : { width: i === page ? 20 : 7, backgroundColor: i === page ? C.lime : C.line },
              ]}
            />
          ))}
        </View>

        {/* THE HINT, ONCE, and it now teaches the SWIPE. The dots say there is
            more, but they do not say what, and the second page is the only
            thing on this card an athlete cannot find by looking at it — a
            column is a large figure that obviously presses. It retires on the
            first swipe OR the first column opened, whichever comes first, under
            the key it always used. */}
        {!hinted && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash, opacity: 0.75, textAlign: "center", marginTop: 10 }}>
            {t("w.home.cmp.hint")}
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
                opacity: group && group !== g.id ? STATE_OPACITY.disabled : 1,
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
                  <View style={{ width: 18, alignItems: "center" }}><Mark mark={g.mark} size={fs.body + 2} color={C.ash} /></View>
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
