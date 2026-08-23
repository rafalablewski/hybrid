import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  sportBoard,
  sportChoices,
  sportPageTitle,
  formatDisciplinePace,
  formatDuration,
  durationUnits,
  DISCIPLINE_META,
  type LoggedSession,
  type SportBoardCard,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme } from "../../lib/theme";
import { F, MAX_FONT_SCALE, PressScale as Pressable, fs, leading, ty } from "../../lib/ui";
import { ASection } from "./kit";
import { SportMark } from "./icons";
import { TickerDelta } from "./exercise-widget";
import { DoorRow } from "./week-verdict";
import SportFavouritesSheet from "./sport-favourites-sheet";
import { useSportFavourites } from "../../lib/sport-favourites";

/**
 * SPORTS — the Progress cluster's watchlist of the sports the athlete pinned.
 *
 * The Endurance section left Today with the retrospective (capabilities:
 * today-retrospective-reduced) because it was a guessed, complete enumeration
 * — a runner scrolled every discipline whether they asked or not. This block
 * is the inverse on the terms that retirement set: PINS ONLY (core
 * sport-board.ts, which reuses `sportPages` — the live 8-week model — rather
 * than re-deriving it), rendered as a short ledger, absent until chosen.
 *
 * Each row is one sport's 8-week read against the 8 weeks before: distance
 * (or time, for a sport that carries none) with the volume ticker on the
 * right, and the average pace with its own small ticker in the meta line —
 * faster is up. A pinned sport with a quiet window keeps its row and says so;
 * a pin must never silently vanish.
 *
 * Rows open the sport's own page, which owns the depth (efforts, zones,
 * records) these two figures summarise. The list's one door is the pin sheet.
 */
export default function SportBoard({
  sessions,
  onOpen,
}: {
  sessions: LoggedSession[];
  /** Where a row goes — the sport's own page. */
  onOpen: (card: SportBoardCard) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const favourites = useSportFavourites();
  const [pickOpen, setPickOpen] = useState(false);

  const cards = useMemo(() => sportBoard(sessions, favourites), [sessions, favourites]);
  const anySport = useMemo(() => sportChoices(sessions).length > 0, [sessions]);
  // A pure lifter has no sports to watch — no heading, no empty card. The
  // Records ledger above still serves them; this block waits for cardio.
  if (!anySport) return null;

  const title = (c: SportBoardCard): string =>
    c.labelKey ? t(c.labelKey) : (c.sport ?? "");

  /** The window's lead figure — distance in the discipline's own unit, or the
   *  time every sport carries. Storage is km; only display converts. */
  const volumeText = (c: SportBoardCard): string => {
    const p = c.page!;
    if (p.distanceKm != null) {
      const unit = c.discipline ? DISCIPLINE_META[c.discipline].distanceUnit : "km";
      return unit === "m" ? `${Math.round(p.distanceKm * 1000)} m` : `${p.distanceKm} km`;
    }
    return formatDuration(p.minutes, durationUnits(t));
  };

  const row = (c: SportBoardCard) => {
    const name = title(c);
    const quiet = c.page == null;
    const pace = !quiet && c.page!.secPerKm != null && c.discipline
      ? formatDisciplinePace(c.page!.secPerKm!, c.discipline)
      : null;
    const meta = quiet
      ? t("w.home.sb.quiet")
      : [volumeText(c), pace, `${c.page!.efforts} ${t("endurance.efforts")}`].filter(Boolean).join(" – ");
    return (
      <Pressable
        key={c.key}
        onPress={() => onOpen(c)}
        accessibilityRole="button"
        accessibilityLabel={`${name} – ${meta}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}
      >
        <SportMark sport={c.sport ?? name} size={22} color={C.ash} />
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg, "snug"), color: C.chalk }}>
            {name}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[ty(C, "kicker"), { marginTop: 3 }]}>
            {meta}
          </Text>
        </View>
        {/* The stock ticker: the window's volume against the 8 weeks before —
            and under it the pace's own move, faster reading as up. Both
            baselines are one tap away on the sport page; the figures beside
            the arrows are the window's own, so the row stays checkable. */}
        {!quiet && (c.volumeDeltaPct != null || c.paceDeltaPct != null) && (
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <TickerDelta deltaPct={c.volumeDeltaPct} improving={c.volumeImproving} />
            <TickerDelta deltaPct={c.paceDeltaPct} improving={c.paceImproving} size={fs.nano} />
          </View>
        )}
      </Pressable>
    );
  };

  return (
    <View>
      {/* The window is the head's one fact — every figure below answers for
          the same eight weeks, stated where it stops varying. */}
      <ASection title={t("w.home.sb.title")} meta={t("w.home.end.window8")} />
      {cards.length > 0 && <View style={{ marginTop: 4 }}>{cards.map(row)}</View>}
      <DoorRow glyph="＋" title={t("w.home.sb.choose")} sub={t("w.home.sb.chooseSub")} onPress={() => setPickOpen(true)} />
      <SportFavouritesSheet visible={pickOpen} onClose={() => setPickOpen(false)} sessions={sessions} />
    </View>
  );
}
