import { useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import {
  otherSportLanes, otherSportReading, sportWeekBars, OTHER_SPORT_CAP, ago,
  durationUnits, formatDuration,
  parentageDuration, progressParentage,
  type LoggedSession, type OtherSportLane,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, tracking, fs, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { GUTTER, RADIUS } from "./kit";
import { useChartScrub } from "./chart-scrub";
import HistoryStrip from "./history-strip";

/**
 * OTHER SPORTS — the block directly under Endurance on Today, the TWIN of
 * components/aurora/other-sports.tsx on web.
 *
 * Tennis, squash, five-a-side: everything logged as `discipline: "sport"`, the
 * bucket ENDURANCE_DISCIPLINES deliberately excludes. It counted towards the
 * week's sessions and hours and then had nowhere to appear. Now it does.
 *
 * ONE TILE PER SPORT, NOT ONE RAIL PER SPORT. These sports are TIMED — the
 * catalog gives tennis and squash `metrics: TIME`, so there is no distance, no
 * pace and no zones to spread across five cards. Endurance spends its width on
 * the DEPTH of each discipline; this block spends the same width on the NUMBER
 * of sports, which is the shape the data actually has. Inventing a pace for a
 * squash match to fill a rail would be fabricating a metric the sport doesn't
 * have.
 *
 * Same full-bleed rail idiom as the exercise widget and the endurance lanes:
 * negative margins the width of AuroraScreen's 12dp gutter, matching inner
 * padding, so tiles slide under the true screen edge and resting tiles still
 * line up with the content column.
 *
 * Every figure comes from @hybrid/core other-sports.ts — the grouping, the
 * ordering, the 8-week buckets — so web can't drift.
 */

const TILE_W = 150;
const TILE_H = 132;

export default function AuroraOtherSports({
  sessions,
  onOpen,
}: {
  sessions: LoggedSession[];
  onOpen?: (sport: string) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);
  const u = durationUnits(t);

  const lanes = useMemo(() => otherSportLanes(sessions), [sessions]);
  // WAVE-3 PARENTAGE: the head quotes the sports' share of the time the
  // ENDURANCE summary card above it prints — the slice these tiles break down
  // per sport. Same activitySummary, same week range (core
  // progress-parentage.ts). The denominator used to be the whole week's hours,
  // which was right while this block sat under the This-week card; inside a
  // section headed by a card reading "3.2 h", a lifting-inclusive "5.2 h"
  // reads as that card's total and contradicts it.
  const parentage = useMemo(() => progressParentage(sessions), [sessions]);
  // No sport logged → no block. A lane exists because something is in it, which
  // is why no tile needs an empty state of its own.
  if (lanes.length === 0) return null;

  const shown = expanded ? lanes : lanes.slice(0, OTHER_SPORT_CAP);
  const rest = lanes.length - OTHER_SPORT_CAP;

  return (
    <View style={{ marginTop: 24 }}>
      {/* Explore-standard head: display-face title left, ONE mono fact right —
          the wave-3 parentage quote ("1h 30min of 5h 24min this week"), naming
          this block's slice of the ENDURANCE opener's time figure above it —
          not the whole week's hours, which is what it quoted while this block
          sat under the This-week card. Inside a section whose opener says
          "5.4 h", a lifting-inclusive denominator reads as that sentence's
          total and contradicts it. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginHorizontal: 2, marginBottom: 8 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.home.other.title")}</Text>
        {/* THE DENOMINATOR IS THE GATE, not the numerator. A quiet week for
            these sports still has something to say — "0min of 3h 12min this
            week" is a real fact, and the whole point of a parentage quote. A
            week with no endurance at all has no whole to be a part of, and the
            head printed "0MIN OF 0MIN THIS WEEK": a fraction with a zero
            denominator, set in mono uppercase as though it were a measurement.
            No parent, no quote. Mirrors web other-sports.tsx. */}
        {parentage.enduranceMinutes > 0 && (
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
            {t("w.home.group.metaOf").replace("{a}", parentageDuration(parentage.sportMinutes, u)).replace("{b}", parentageDuration(parentage.enduranceMinutes, u))}
          </Text>
        )}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        style={{ marginHorizontal: -GUTTER }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER, paddingVertical: 2 }}
      >
        {shown.map((lane) => <SportTile key={lane.sport} lane={lane} onOpen={onOpen} />)}
        {/* The rail's END CONTROL — and it is an EXPANDER, not a door: it grows
            the rail in place rather than opening a screen, which is why it
            keeps ＋/− instead of taking the shared RailTail's arrow. An arrow
            here would promise a destination that doesn't exist.
            CHROMELESS like the tail, though (see rail-tail.tsx): it used to be
            a DASHED box copied from the exercises rail's ＋ tile, and that tile
            is gone — a dashed box reads as an empty slot, and chartreuse is the
            reserved "go" colour, not the colour of a standing control. Glyph
            and label on the ink, ash like every other end-of-rail affordance;
            the ring is what separates a door from an expander. Mirrors web. */}
        {rest > 0 && (
          <Pressable
            onPress={() => setExpanded(!expanded)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            style={{
              width: 110, minHeight: TILE_H, alignItems: "center", justifyContent: "center", gap: 8,
              paddingHorizontal: 10,
            }}
          >
            <Text style={{ fontSize: fs.title, color: C.ash }}>{expanded ? "−" : "＋"}</Text>
            <Text style={{ fontFamily: F.monoBold, fontSize: fs.micro, color: C.ash, textAlign: "center", lineHeight: leading(fs.micro) }}>
              {expanded ? t("w.home.other.fewer") : t("w.home.other.all")} {expanded ? `−${rest}` : `+${rest}`}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

/** How long a finger must rest on a tile's strip before it answers instead of
 *  opening the sport. The web twin's HOLD_MS. */
const HOLD_MS = 120;

/** A week bucket's date, as the tile prints it. */
const fmtWeekDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");

/** One sport. Efforts as the headline, hours beneath, an 8-week frequency
 *  strip, and when it was last played — the four things a timed sport can
 *  honestly say about itself.
 *
 *  The strip HOLDS, and answers in the FOOT rather than the headline: the
 *  headline is all-time efforts and the strip is minutes per week, so swapping
 *  it would put a quantity in a slot that never meant it. The time cell
 *  becomes the held week's own duration, and "3 days ago" becomes the week.
 *
 *  The tile is also a button, so the dwell decides which a press meant — a tap
 *  opens the sport's page, a hold reads the strip. Parity: the Today exercise
 *  rail's card, where the same dwell separates the two. */
function SportTile({ lane, onOpen }: { lane: OtherSportLane; onOpen?: (sport: string) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const bars = sportWeekBars(lane.weeks);
  const time = formatDuration(lane.minutes, durationUnits(t));
  const scrub = useChartScrub(lane.weeks.length, "band", undefined, {
    holdMs: HOLD_MS,
    onTap: onOpen ? () => onOpen(lane.sport) : undefined,
  });
  const read = scrub.index >= 0 ? otherSportReading(lane, scrub.index) : null;

  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: fs.body }}>{lane.icon}</Text>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{lane.sport}</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.display, letterSpacing: tracking.display, color: C.chalk }}>{lane.efforts}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: C.ash }}>
          {t("w.home.other.efforts")}
        </Text>
      </View>

      {/* Eight weeks of frequency in the cluster's shared HistoryStrip. Violet
          is the app's non-endurance channel — teal already means cardio on the
          lanes directly above this block. */}
      <View {...scrub.bind} style={{ marginTop: "auto" }}>
        <HistoryStrip bars={bars} color={C.violet} held={scrub.index} />
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6 }}>
        {/* A held week reads as a duration too, so it brings its own units and
            the readout adds none — same figure the resting footer shows. */}
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: read?.best ? txt(C, C.lime) : C.ash }}>
          {read ? (read.unit ? `${read.value} ${read.unit}` : read.value) : time}
        </Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>
          {read ? t("chart.weekOf").replace("{date}", fmtWeekDate(read.weekStart)) : ago(lane.lastAt)}
        </Text>
      </View>
    </>
  );

  const style = {
    width: TILE_W, minHeight: TILE_H, gap: 8,
    backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field,
    paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12,
  } as const;

  return onOpen ? (
    <Pressable onPress={() => onOpen(lane.sport)} accessibilityRole="button" accessibilityLabel={lane.sport} style={style}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}
