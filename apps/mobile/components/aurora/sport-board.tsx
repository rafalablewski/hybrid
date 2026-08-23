import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  sportBoard,
  sportChoices,
  formatDuration,
  durationUnits,
  DISCIPLINE_META,
  TODAY_RANGE_STORE_KEY,
  type LoggedSession,
  type SportBoardCard,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { F, MAX_FONT_SCALE, fs, leading, space, ty } from "../../lib/ui";
import { APressCard, ASection, RADIUS } from "./kit";
import { SportMark } from "./icons";
import { TickerDelta } from "./exercise-widget";
import { DoorRow } from "./week-verdict";
import { useActivityRange, useRangeLabels } from "./range-filter";
import SportFavouritesSheet from "./sport-favourites-sheet";
import { useSportFavourites } from "../../lib/sport-favourites";

/**
 * SPORTS — the Progress cluster's watchlist of the sports the athlete pinned,
 * drawn as WIDGETS: a two-up grid of tiles, each one sport's window in a
 * figure and a ticker.
 *
 * The Endurance section left Today with the retrospective (capabilities:
 * today-retrospective-reduced) because it was a guessed, complete enumeration
 * — a runner scrolled every discipline whether they asked or not. This block
 * is the inverse: PINS ONLY, absent until chosen, absent for a pure lifter.
 *
 * ── THE WINDOW IS THE SCREEN'S ───────────────────────────────────────────
 *
 * This block shipped first with a hard-coded eight weeks and that was the
 * defect, not a detail. The cluster then read: a control offering
 * 7D/30D/3M/YTD/ALL, a Records head saying ALL TIME, and a Sports head saying
 * 8 WEEKS — three periods down one screen, in one mono voice, in the same
 * slot, so they read as three settings of one thing. It is the fault
 * sport-pages.tsx names as the one the lanes had worst: "whole-history totals
 * under an ALL TIME head, over an eight-week chart, beneath a THIS WEEK card."
 *
 * So this board has NO PERIOD OF ITS OWN. It reads the cluster's range
 * (core TODAY_RANGE_STORE_KEY — the same module store the verdict card's
 * control writes, so scrubbing that control moves these figures live) and
 * measures each sport against the window BEFORE it, through the same
 * `activityBaselineWindows` the verdict card uses. The head still NAMES the
 * window, because a total with no period is not a total — but it names the
 * one on screen rather than a second one, so the label is an echo of the
 * control, never a competing setting.
 *
 * Eight weeks was never a principle here; it was `SPORT_PAGE_WEEKS`, borrowed
 * from the sport PAGE, which is genuinely its own scope because it is its own
 * screen. The rule the range store was built with says the key stays a
 * parameter so a block that is genuinely its own scope can say so. A volume
 * total is not.
 *
 * A tile carries a THING (one sport), so card chrome is correct here; the
 * block's exit is still the chromeless ringed DoorRow beneath, never a dashed
 * ＋ tile in the grid — an end-of-thing affordance never wears card chrome.
 */
export default function SportBoard({
  sessions,
  onOpen,
}: {
  sessions: LoggedSession[];
  /** Where a tile goes — the sport's own page. */
  onOpen: (card: SportBoardCard) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const favourites = useSportFavourites();
  const [pickOpen, setPickOpen] = useState(false);
  // ONE PERIOD FOR THE SCREEN — read, never written here: this block has no
  // control of its own, and a second five-segment control ten lines below the
  // first, always agreeing, is not drawn.
  const { range } = useActivityRange(TODAY_RANGE_STORE_KEY);
  const labels = useRangeLabels(range);

  const cards = useMemo(() => sportBoard(sessions, favourites, { range }), [sessions, favourites, range]);
  const anySport = useMemo(() => sportChoices(sessions).length > 0, [sessions]);
  // A pure lifter has no sports to watch — no heading, no empty grid. The
  // Records ledger above still serves them; this block waits for cardio.
  if (!anySport) return null;

  const title = (c: SportBoardCard): string => (c.labelKey ? t(c.labelKey) : (c.sport ?? ""));

  /** The sport's natural distance unit — metres for pool and ergo sports.
   *  Storage is always km; only display converts. */
  const distUnit = (c: SportBoardCard): "km" | "m" =>
    c.discipline ? DISCIPLINE_META[c.discipline].distanceUnit : "km";

  /**
   * The window's figure: distance where the sport measures one, the time every
   * sport carries where it does not. A QUIET window prints a real zero in the
   * unit the sport uses — not a dash, which sport-pages.tsx rightly reserves
   * for a metric the sport was never going to have. Zero is comparable; a dash
   * is not.
   */
  const figure = (c: SportBoardCard): [string, string] => {
    const p = c.page;
    const timed = p ? p.distanceKm == null : c.prev ? c.prev.distanceKm == null : c.kind === "sport";
    if (timed) {
      const mins = p?.minutes ?? 0;
      const shown = formatDuration(mins, durationUnits(t));
      const i = shown.lastIndexOf(" ");
      return i < 0 ? [shown, ""] : [shown.slice(0, i), shown.slice(i + 1)];
    }
    const unit = distUnit(c);
    const km = p?.distanceKm ?? 0;
    return [unit === "m" ? String(Math.round(km * 1000)) : String(km), unit];
  };

  const tile = (c: SportBoardCard) => {
    const name = title(c);
    const [value, unit] = figure(c);
    const quiet = c.page == null;
    return (
      <View key={c.key} style={{ flexBasis: "47%", flexGrow: 1 }}>
        <APressCard
          onPress={() => onOpen(c)}
          a11yLabel={`${name} – ${value} ${unit} – ${labels.title}`}
          style={{ borderRadius: RADIUS.field, padding: space.lg, minHeight: 104, justifyContent: "space-between" }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
            <SportMark sport={c.sport ?? name} size={fs.bodyLg} color={C.ash} />
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[ty(C, "kicker"), { flex: 1 }]}>
              {name}
            </Text>
          </View>
          <View style={{ marginTop: space.ms }}>
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              numberOfLines={1}
              style={{ fontFamily: F.monoBold, fontSize: fs.headline, lineHeight: leading(fs.headline, "tight"), color: quiet ? C.ash : C.chalk }}
            >
              {value}
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{unit ? ` ${unit}` : ""}</Text>
            </Text>
            {/* The ticker measures this window against the one before it — the
                verdict card's own axis. A window with no predecessor carries
                none rather than a fabricated one. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.xxs }}>
              <TickerDelta deltaPct={c.volumeDeltaPct} improving={c.volumeImproving} />
              <TickerDelta deltaPct={c.paceDeltaPct} improving={c.paceImproving} size={fs.nano} />
              {quiet && c.volumeDeltaPct == null && (
                <Text style={ty(C, "kicker")}>{t("w.home.sb.quiet")}</Text>
              )}
            </View>
          </View>
        </APressCard>
      </View>
    );
  };

  return (
    <View>
      {/* The head names the window the CONTROL is showing — an echo, so the
          reader can see this block is governed rather than independent. */}
      <ASection title={t("w.home.sb.title")} meta={labels.title} />
      {cards.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: space.xxs }}>
          {cards.map(tile)}
        </View>
      )}
      <DoorRow glyph="＋" title={t("w.home.sb.choose")} sub={t("w.home.sb.chooseSub")} onPress={() => setPickOpen(true)} />
      <SportFavouritesSheet visible={pickOpen} onClose={() => setPickOpen(false)} sessions={sessions} />
    </View>
  );
}
