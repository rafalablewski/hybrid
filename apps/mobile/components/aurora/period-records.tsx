import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Animated, Easing, ScrollView, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent, type LayoutChangeEvent } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  durations, fmtWeight, prsBetween, splitFigure, strengthPrProof,
  type ActivityRange, type BodyweightInput, type LoggedSession, type PrHit, type WeightUnit,
} from "@hybrid/core";
import { GUTTER } from "./kit";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, tracking, F, PressScale as Pressable } from "../../lib/ui";
import { useReducedMotion } from "../../lib/use-reduced-motion";

/**
 * RECORDS — the Progress cluster's own block. The TWIN of
 * components/aurora/period-records.tsx on web.
 *
 * These used to sit on the Performance tab's "Your week" card, computed over a
 * ROLLING seven days while the Today card counted a real calendar week — two
 * cards one tab apart, both labelled as the week, reporting different numbers.
 * A PR belongs to the period it happened in, so it belongs to whatever window
 * the Progress filter is showing, which is why the range arrives as a prop
 * rather than being resolved here.
 *
 * It then spent a while as a mono kicker in the verdict card's foot. Progress
 * now reads as three named things — This week, Records, Exercises — so the
 * block takes the same Explore-standard head its neighbours wear: display-face
 * title left, the window as mono meta right (a "Records" with no window would
 * read as all-time), with the count joining it once the cells become a rail.
 * Silent when the period holds none: an empty celebration is not a celebration.
 */

/** Records shown before the rail offers "Show all" — a year can hold forty,
 *  and an endless drag is not a celebration. */
const PRS_RAIL_CAP = 8;
/** The width of the edge dissolve, in dp. Mirrors web's .pr-rail. */
const PRS_FADE = 24;
/** The gap between record cells, in dp. Mirrors web. */
const PRS_GAP = 14;
/** AuroraScreen's gutter — what the rail bleeds by, so cards slide under the
 *  physical screen edge. Mirrors web's --page-pad-x. */
const PRS_BLEED = GUTTER;

/**
 * ONE RECORD, set as a FIGURE — the TWIN of PrCell on web.
 *
 * The block used to be four hairlines around two 12dp rows: a section rule, a
 * rule under the header and one above every record, fencing content that was
 * already fenced. Whitespace separates two items perfectly well, so the rules
 * went and the budget was spent on the two things a record actually needs —
 * SCALE (the load at fs.display, the largest figure in the cluster, because a
 * personal best is the only thing on Today worth celebrating) and PROOF (the
 * load it beat, which is what makes 90 kg an achievement rather than a fact).
 *
 * The proof's three shapes come from core's strengthPrProof, so this and the
 * session summary can't drift, and it arrives SPLIT — "from 82.5" reads in ash
 * and only the gain takes the accent. The value is bare because the unit is on
 * the figure above it.
 */
function PrCell({ pr, units, t, width, onOpen }: {
  pr: PrHit;
  units: WeightUnit;
  t: (k: string) => string;
  /** Fixed cell width inside the rail; unset in the two-up grid, which flexes. */
  width?: number;
  onOpen?: () => void;
}) {
  const { palette: C } = useTheme();
  const [value, unit] = splitFigure(fmtWeight(pr.topLoad, units));
  const proof = strengthPrProof(pr, units);
  const body = (
    <>
      <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
        {pr.lift}
      </Text>
      <Text style={{ fontFamily: F.monoBold, fontSize: fs.display, letterSpacing: tracking.display, marginTop: 7, color: txt(C, C.lime) }}>
        {value}
        <Text style={{ fontSize: fs.caption, letterSpacing: tracking.label }}> {unit}</Text>
      </Text>
      <Text numberOfLines={1} style={{ marginTop: 6, fontFamily: F.reg, fontSize: fs.micro, color: C.ash }}>
        {proof.kind === "climb" ? (
          <>
            {t("w.home.act.prFrom").replace("{v}", proof.from ?? "")}{" "}
            <Text style={{ fontFamily: F.mono, color: txt(C, C.lime) }}>{proof.delta}</Text>
          </>
        ) : t(proof.kind === "first" ? "w.home.act.prFirst" : "w.home.act.prReps")}
      </Text>
    </>
  );

  if (!onOpen) return <View style={{ width, flex: width == null ? 1 : undefined }}>{body}</View>;
  return (
    <Pressable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${pr.lift} – ${fmtWeight(pr.topLoad, units)} – ${t("w.home.act.prOpen")}`}
      style={{ width, flex: width == null ? 1 : undefined }}
    >
      {body}
    </Pressable>
  );
}

export default function PeriodRecords({
  sessions,
  range,
  /** The window's name, as the head above it prints it — one source, so the
   *  card and this block can never disagree about which period is in force. */
  windowName,
  units,
  bw,
  onSession,
}: {
  sessions: LoggedSession[];
  range: ActivityRange;
  windowName: string;
  units: WeightUnit;
  bw?: BodyweightInput;
  onSession?: (id: string) => void;
}) {
  const { t } = useLang();
  const { palette: C } = useTheme();
  const reduced = useReducedMotion();
  const win = useWindowDimensions();

  const [allPrs, setAllPrs] = useState(false);
  const [railW, setRailW] = useState(0);

  // ── THE RECORDS RAIL (three records and up) — the twin of web's .pr-rail.
  // Web masks the edges; here two gradient overlays stand in, which is the
  // idiom coach-rail already ships and needs no MaskedView dependency. The
  // dissolve is a STATUS either way: an edge fades only while records are
  // hidden behind it.
  const fadeL = useRef(new Animated.Value(0)).current;
  const fadeR = useRef(new Animated.Value(0)).current;
  /** offset / viewport / content, written by whichever handler last measured. */
  const railGeom = useRef({ x: 0, w: 0, c: 0 });
  const fadeOn = useRef({ l: false, r: false });

  const paintFade = () => {
    const { x, w, c } = railGeom.current;
    const max = Math.max(0, c - w);
    const next = { l: x > 4, r: max - x > 4 };
    for (const side of ["l", "r"] as const) {
      if (fadeOn.current[side] === next[side]) continue;
      fadeOn.current[side] = next[side];
      Animated.timing(side === "l" ? fadeL : fadeR, {
        toValue: next[side] ? 1 : 0,
        duration: reduced ? durations.reduced : 220,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  };

  const onRailScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    railGeom.current = { x: contentOffset.x, w: layoutMeasurement.width, c: contentSize.width };
    paintFade();
  };

  const prs = useMemo(() => prsBetween(sessions, range.from, range.through + 1, bw), [sessions, range, bw]);
  const shownPrs = allPrs ? prs : prs.slice(0, PRS_RAIL_CAP);

  // A new period is a new set of records — an expanded rail must not carry over.
  useEffect(() => { setAllPrs(false); }, [range.id]);

  // A cell is HALF THE CONTENT COLUMN — the same width the two-up grid gives
  // it — so going from two records to three doesn't resize anything: the third
  // simply appears past the right edge. The rail bleeds by the screen gutter,
  // so its own width is the whole screen; the window width is that value before
  // the first layout lands, which keeps the cells from popping.
  const railWidth = railW || win.width;
  const prCellW = Math.max(120, Math.round((railWidth - PRS_BLEED * 2 - PRS_GAP) / 2));

  if (prs.length === 0) return null;

  return (
    <View style={{ marginTop: 24 }}>
      {/* Explore-standard head. The right slot carries the WINDOW — a block
          headed "Records" with no period would read as all-time — and, from
          three up, the count. A6: the count is a fact only when the reader
          cannot do the counting; with one or two records both cells sit side by
          side on one row, so a "2" beside them restates what is already in
          view. From three up they are a RAIL — you cannot count what you have
          to scroll — so the total earns its place, and past PRS_RAIL_CAP the
          trailing "Show all {n}" cell carries it too. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginHorizontal: 2, marginBottom: 8 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.home.act.recordsTitle")}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, color: C.ash }}>{windowName}</Text>
          {prs.length > 2 && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{prs.length}</Text>
          )}
        </View>
      </View>

      {prs.length < 3 ? (
        /* ONE OR TWO — the figures sit still. No rail, no fade, nothing to
           drag: a rail that cannot move is worse than no rail. A single record
           takes the full width rather than leaving half a row empty. */
        <View style={{ flexDirection: "row", gap: PRS_GAP }}>
          {prs.map((pr) => (
            <PrCell key={pr.lift} pr={pr} units={units} t={t}
              onOpen={onSession && pr.sessionId ? () => onSession(pr.sessionId!) : undefined} />
          ))}
        </View>
      ) : (
        /* THREE AND UP — the same cells become a rail.
         *
         * This block sits DIRECTLY ON THE SCREEN, so the rail is full-bleed:
         * marginHorizontal of the screen gutter with matching content padding,
         * exactly as the exercise-widget rail does it. Cards slide under the
         * physical screen edge instead of clipping at the content column with
         * the gutter showing beside a cut cell.
         *
         * The third cell peeking past the edge is the whole affordance, which
         * is why there are no arrows, no dot row and no "swipe" label.
         * Deceleration is "fast" with no snapToInterval — the mobile twin of
         * web's proximity snap, and the feel every other rail already has. */
        <View
          style={{ marginHorizontal: -PRS_BLEED }}
          onLayout={(e: LayoutChangeEvent) => setRailW(e.nativeEvent.layout.width)}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            decelerationRate="fast"
            scrollEventThrottle={16}
            onScroll={onRailScroll}
            onContentSizeChange={(w) => { railGeom.current = { ...railGeom.current, c: w }; paintFade(); }}
            contentContainerStyle={{ paddingHorizontal: PRS_BLEED, gap: PRS_GAP }}
          >
            {shownPrs.map((pr) => (
              <PrCell key={pr.lift} pr={pr} units={units} t={t} width={prCellW}
                onOpen={onSession && pr.sessionId ? () => onSession(pr.sessionId!) : undefined} />
            ))}
            {!allPrs && prs.length > PRS_RAIL_CAP && (
              <Pressable
                onPress={() => setAllPrs(true)}
                accessibilityRole="button"
                style={{ width: prCellW, justifyContent: "center" }}
              >
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>
                  {t("w.home.act.showAll").replace("{n}", String(prs.length))}
                </Text>
              </Pressable>
            )}
          </ScrollView>

          {/* THE DISSOLVE — screen-coloured, since this block sits on the
              screen rather than on a card. Opacity is animated (not the
              gradient), so it runs on the native driver. */}
          <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: PRS_FADE, opacity: fadeL }}>
            <LinearGradient colors={[C.ink, `${C.ink}00`]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
          </Animated.View>
          <Animated.View pointerEvents="none" style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: PRS_FADE, opacity: fadeR }}>
            <LinearGradient colors={[`${C.ink}00`, C.ink]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={{ flex: 1 }} />
          </Animated.View>
        </View>
      )}
    </View>
  );
}
