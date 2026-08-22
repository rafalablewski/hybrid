import { useCallback, useMemo, useState } from "react";
import { View, Text, ScrollView, useWindowDimensions, type NativeSyntheticEvent, type NativeScrollEvent } from "react-native";
import Svg, { Path, Circle, Line, Defs, LinearGradient, Stop } from "react-native-svg";
import {
  sportPageTitle, ridgeGeometry,
  formatDisciplinePace, formatDuration, durationUnits,
  type SportPage,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { F, MAX_FONT_SCALE, PressScale as Pressable, fs, space, tracking, ty } from "../../lib/ui";
import { GUTTER, RADIUS } from "./kit";

/**
 * SPORT PAGES — the Endurance section on Today, ONE FULL-WIDTH PAGE PER SPORT,
 * swiped sideways.
 *
 * WHAT THIS REPLACED, and why the replacement is a pager rather than a tidier
 * rail. The section was a stack of per-discipline LANES, each a horizontal rail
 * of five bordered tiles, with the ball sports in a second block underneath in
 * a different grammar. Three lanes drew eighteen bordered surfaces and four
 * horizontal scrollers on one screen; every tile was the same weight, so a
 * single eight-minute jog got the same five-card instrument as fourteen swims;
 * and because the rails carried `decelerationRate` but no `snapToInterval`,
 * each one came to rest with its third tile clipped mid-number — three cuts at
 * the same x, reading as breakage rather than as more-to-the-right.
 *
 * A PAGE IS THE SCREEN'S WIDTH AND IT SNAPS. `pagingEnabled` with
 * `snapToInterval` at the page width means the pager can never rest between two
 * sports, and there is deliberately NO PEEK of the neighbour: at the widths
 * that fit a phone, a peek clips the next sport's NAME mid-letter, which is the
 * same fault in a new place. The dots under the pager carry the affordance
 * instead.
 *
 * ORDERED BY VOLUME (core `sportPages`), so page one is the sport actually
 * being trained. Under the lanes that was usually tennis, and tennis was below
 * the fold in the other block.
 *
 * WHAT A PAGE HOLDS is the whole argument: the name, ONE big figure, the shape
 * of eight weeks, and two or three facts. Zones, splits, pace history and every
 * effort already live one tap away on the sport's own page (sport-page.tsx) —
 * the pager's job is the comparison, not the depth.
 *
 * MINUTES ARE THE HERO on every page, because minutes are the only measure a
 * swim, a ride and a squash match share. Distance and pace render only on the
 * pages that have them; a timed sport shows its longest session instead. No
 * dashes standing in for a metric the sport was never going to carry.
 */

/** The ridge's own height. Tall enough that eight weeks read as a shape rather
 *  than a texture, which is what the 24dp bar strip had become. */
const RIDGE_H = 164;
const DAY = 86_400_000;

export default function AuroraSportPages({
  pages,
  onOpen,
  head = true,
}: {
  /** Built by the CALLER (core `sportPages`), not here, because the caller also
   *  needs the count: an empty window means the whole section — seam, headline
   *  and all — must not render, and a block that can only report its emptiness
   *  after it has been mounted leaves a stray heading above nothing. */
  pages: SportPage[];
  /** Where a page goes. Omit it and the pages carry no exit — the same rule the
   *  lanes had: an affordance that promises a destination there isn't. */
  onOpen?: (page: SportPage) => void;
  /** The block's own title row. Off on Today, whose GroupMark already says
   *  "Endurance" and carries the window in its right slot. */
  head?: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(0);

  const settle = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const i = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, width));
      setIndex(Math.max(0, Math.min(pages.length - 1, i)));
    },
    [width, pages.length],
  );

  // Belt and braces: the caller gates on the same emptiness, but a block that
  // renders a head over no pages is worse than one that renders nothing.
  if (pages.length === 0) return null;

  return (
    <View style={{ marginTop: space.xxl }}>
      {head && (
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.ms, marginHorizontal: 2, marginBottom: space.sm }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: tracking(fs.title), color: C.chalk }}>{t("endurance.title")}</Text>
          <SportPagesWindow />
        </View>
      )}

      {/* FULL BLEED, and here it is structural rather than decorative: the page
          IS the screen's width, so the scroller has to reach the physical edge
          or `pagingEnabled` would snap by a frame narrower than the page it is
          paging. Negative margins the width of AuroraScreen's gutter pull the
          clip out; each page puts the gutter back as its own padding, so
          content still lands on the content column. */}
      <ScrollView
        horizontal
        pagingEnabled
        snapToInterval={width}
        disableIntervalMomentum
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={settle}
        style={{ marginHorizontal: -GUTTER }}
      >
        {pages.map((page) => (
          <Page key={page.key} page={page} w={width} onOpen={onOpen} />
        ))}
      </ScrollView>

      {pages.length > 1 && <Dots n={pages.length} at={index} />}
    </View>
  );
}

/**
 * THE WINDOW, said once for the whole section.
 *
 * Exported because on Today it does not render here: the Endurance GroupMark
 * carries it in the right slot, which is where the Explore SectionHead grammar
 * puts a head-level fact. It is the fix for the fault the lanes had worst —
 * every figure under this label answers for the same eight weeks, where the
 * lanes printed whole-history totals under an ALL TIME head, over an eight-week
 * chart, beneath a THIS WEEK card.
 */
export function SportPagesWindow() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  return (
    <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={ty(C, "kicker")}>
      {t("w.home.end.window8")}
    </Text>
  );
}

function Page({ page, w, onOpen }: { page: SportPage; w: number; onOpen?: (p: SportPage) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const title = sportPageTitle(page, t);
  const hero = formatDuration(page.minutes, durationUnits(t));

  const body = (
    <>
      <Text numberOfLines={1} style={{ fontFamily: F.black, fontSize: fs.title, letterSpacing: tracking(fs.title), color: C.chalk }}>
        {title}
      </Text>

      {/* THE ONE FIGURE. It is minutes on every page so the pages can be read
          against each other — the lanes' headline was distance, which two of
          the five sports do not have. */}
      <Text
        numberOfLines={1}
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ fontFamily: F.mono, fontSize: fs.stat, letterSpacing: tracking(fs.stat), color: C.chalk, marginTop: space.md }}
      >
        {hero}
      </Text>

      <Ridge page={page} w={w - GUTTER * 2} />

      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: space.sm }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{axisLabel(page.weekStarts[0])}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>
          {axisLabel(page.weekStarts[page.weekStarts.length - 1], 6)}
        </Text>
      </View>

      <Facts page={page} />

      {/* THE EXIT, at the end of the thing and wearing the ring that means it
          LEAVES (see rail-tail.tsx for the grammar). The page itself is the tap
          target; the ring is what says so. */}
      {onOpen && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: space.xl }}>
          <View style={{ width: 40, height: 40, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.chalk }}>→</Text>
          </View>
        </View>
      )}
    </>
  );

  const style = { width: w, paddingHorizontal: GUTTER } as const;
  return onOpen ? (
    <Pressable
      onPress={() => onOpen(page)}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${hero} – ${t("w.home.end.window8")}`}
      style={style}
    >
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

/**
 * THE RIDGE — eight weeks as one continuous area.
 *
 * The section drew a row of bars here, and at rail width they came out four
 * pixels wide with a two-pixel gap: eight objects made out of one shape, which
 * is a texture rather than a chart. Volume over time is a LEVEL, and the app
 * already draws a level this way for the pace trend, so this is the mark the
 * section should have carried from the start.
 *
 * The geometry is core's (`ridgeGeometry`) so it is testable and cannot drift:
 * a zero week sits ON the baseline, which is what makes a gap in training read
 * as a gap; and the smoothing uses control points that share their endpoint's
 * y, so a spiky series cannot dip the curve below zero and draw a week of
 * negative training.
 */
function Ridge({ page, w }: { page: SportPage; w: number }) {
  const { palette: C } = useTheme();
  const g = useMemo(() => ridgeGeometry(page.weeks, w, RIDGE_H), [page.weeks, w]);
  const id = `ridge-${page.key}`;
  return (
    <View style={{ marginTop: space.xxl }}>
      <Svg width={w} height={RIDGE_H}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={C.blue} stopOpacity="0.34" />
            <Stop offset="1" stopColor={C.blue} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Path d={g.area} fill={`url(#${id})`} />
        <Path d={g.line} fill="none" stroke={C.blue} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <Line x1={0} x2={w} y1={RIDGE_H - 0.5} y2={RIDGE_H - 0.5} stroke={C.line} strokeWidth={1} />
        {/* The newest week, marked. Not the peak: the peak is visible as the
            high point, and two identical marks would read as two "current"
            weeks. */}
        {!g.flat && <Circle cx={g.tip.x} cy={g.tip.y} r={3.5} fill={C.blue} stroke={C.ink} strokeWidth={2} />}
      </Svg>
    </View>
  );
}

/**
 * The page's two or three supporting figures.
 *
 * WHAT A SPORT HAS DECIDES WHAT RENDERS. A run carries distance and pace; a
 * tennis match carries neither, so those cells do not exist on its page — it
 * shows its longest session instead, which is the fact a timed sport actually
 * has. The lanes drew every cell for every sport and filled the impossible ones
 * with a dash, which is a metric-shaped hole where there was never a metric.
 */
function Facts({ page }: { page: SportPage }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const u = durationUnits(t);

  const cells: { k: string; v: string }[] = [];
  if (page.distanceKm != null) cells.push({ k: t("w.home.end.mDistance"), v: `${page.distanceKm} km` });
  // A pace needs a discipline to be READ in — /km for the road, /100m for the
  // pool, km/h for the bike. A ball sport has no such unit, which is the same
  // reason it has no pace to print.
  if (page.secPerKm != null && page.discipline)
    cells.push({ k: t("w.home.end.mPace"), v: formatDisciplinePace(page.secPerKm, page.discipline) });
  cells.push({ k: t("endurance.efforts"), v: String(page.efforts) });
  if (page.distanceKm == null && page.longestMinutes > 0)
    cells.push({ k: t("endurance.longest"), v: formatDuration(page.longestMinutes, u) });

  return (
    <View style={{ flexDirection: "row", gap: space.xxl, marginTop: space.xxl }}>
      {cells.map((c) => (
        <View key={c.k} style={{ gap: space.xxs }}>
          <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={ty(C, "kicker")}>
            {c.k}
          </Text>
          <Text numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: C.chalk }}>
            {c.v}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The pager's position. Dots rather than sport names: the page under them is
 *  already titled, and a second row of names would be the titles again. The
 *  current one is a pill so the position reads without counting. */
function Dots({ n, at }: { n: number; at: number }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", justifyContent: "center", gap: space.xs, marginTop: space.xl }}>
      {Array.from({ length: n }, (_, i) => (
        <View
          key={i}
          style={{
            width: i === at ? 20 : 6,
            height: 6,
            borderRadius: RADIUS.pill,
            backgroundColor: i === at ? C.ash : C.line,
          }}
        />
      ))}
    </View>
  );
}

/** A bucket's date in the axis's voice. `plusDays` walks to the END of the last
 *  bucket, so the pair reads as the window it is rather than as two starts. */
function axisLabel(iso: string | undefined, plusDays = 0): string {
  if (!iso) return "";
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return "";
  return new Date(at + plusDays * DAY).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
