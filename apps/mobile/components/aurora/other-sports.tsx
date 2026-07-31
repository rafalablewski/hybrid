import { useMemo, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import {
  otherSportLanes, otherSportTotals, sportWeekBars, OTHER_SPORT_CAP, ago,
  type LoggedSession, type OtherSportLane,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, F, serifIf } from "../../lib/ui";
import { RADIUS } from "./kit";

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
 * negative margins the width of AuroraScreen's 16dp gutter, matching inner
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
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const [expanded, setExpanded] = useState(false);

  const lanes = useMemo(() => otherSportLanes(sessions), [sessions]);
  // No sport logged → no block. A lane exists because something is in it, which
  // is why no tile needs an empty state of its own.
  if (lanes.length === 0) return null;

  const totals = otherSportTotals(lanes);
  const shown = expanded ? lanes : lanes.slice(0, OTHER_SPORT_CAP);
  const rest = lanes.length - OTHER_SPORT_CAP;

  return (
    <View style={{ marginTop: 24 }}>
      {/* Explore-standard head: display-face title left, mono meta right. The
          meta reports the block so the athlete doesn't add up tiles. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10, marginHorizontal: 2, marginBottom: 8 }}>
        <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, color: C.chalk }}>{t("w.home.other.title")}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>
          {totals.sports} {t("w.home.other.sports")}
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        style={{ marginHorizontal: -16 }}
        contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingVertical: 2 }}
      >
        {shown.map((lane) => <SportTile key={lane.sport} lane={lane} onOpen={onOpen} />)}
      </ScrollView>

      {rest > 0 && (
        <Pressable
          onPress={() => setExpanded(!expanded)}
          accessibilityRole="button"
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            marginHorizontal: 2, marginTop: 12, paddingHorizontal: 14, paddingVertical: 11,
            borderWidth: 1, borderColor: C.line, borderRadius: 14,
          }}
        >
          <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.ash }}>
            {expanded ? t("w.home.other.fewer") : t("w.home.other.all")}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{expanded ? "−" : "+"}{rest}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** One sport. Efforts as the headline, hours beneath, an 8-week frequency
 *  strip, and when it was last played — the four things a timed sport can
 *  honestly say about itself. */
function SportTile({ lane, onOpen }: { lane: OtherSportLane; onOpen?: (sport: string) => void }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const bars = sportWeekBars(lane.weeks);
  const hours = Math.round(lane.minutes / 6) / 10;

  const body = (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text style={{ fontSize: 13 }}>{lane.icon}</Text>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.body, color: C.chalk }}>{lane.sport}</Text>
      </View>

      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 26, letterSpacing: -0.6, color: C.chalk }}>{lane.efforts}</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9, letterSpacing: 1, textTransform: "uppercase", color: C.ash }}>
          {t("w.home.other.efforts")}
        </Text>
      </View>

      {/* Eight weeks of frequency. Violet is the app's non-endurance channel —
          teal already means cardio on the lanes directly above this block. */}
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 26, marginTop: "auto" }}>
        {bars.map((h, i) => (
          <View
            key={i}
            style={{
              flex: 1, borderRadius: 2,
              height: Math.max(3, Math.round(h * 26)),
              backgroundColor: i === bars.length - 1 ? C.violet : `${C.violet}55`,
            }}
          />
        ))}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 6 }}>
        <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: C.ash }}>{hours} h</Text>
        <Text style={{ fontFamily: F.mono, fontSize: 9.5, color: C.ash }}>{ago(lane.lastAt)}</Text>
      </View>
    </>
  );

  const style = {
    width: TILE_W, minHeight: TILE_H, gap: 7,
    backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field,
    paddingHorizontal: 12, paddingTop: 11, paddingBottom: 12,
  } as const;

  return onOpen ? (
    <Pressable onPress={() => onOpen(lane.sport)} accessibilityRole="button" accessibilityLabel={lane.sport} style={style}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}
