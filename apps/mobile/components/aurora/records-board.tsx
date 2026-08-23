import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import {
  recordsBoard,
  fmtWeight,
  splitFigure,
  paceClock,
  disciplinePaceFigure,
  disciplinePaceUnit,
  formatDisciplinePace,
  type BodyweightInput,
  type LoggedSession,
  type RecordRow,
  type WeightUnit,
} from "@hybrid/core";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, MAX_FONT_SCALE, PressScale as Pressable, fs, leading, ty } from "../../lib/ui";
import { ASection } from "./kit";
import { TickerDelta } from "./exercise-widget";
import { DoorRow } from "./week-verdict";
import ExerciseFavouritesSheet from "./exercise-favourites-sheet";
import { useExerciseFavourites } from "../../lib/exercise-favourites";

/**
 * RECORDS — the Progress cluster's ledger of the movements the athlete pinned.
 *
 * Today carried a records block once and it went with the retrospective (see
 * capabilities: activity-records-figures, today-retrospective-reduced). This
 * block returns on the terms that retirement set, which core records-board.ts
 * spells out in full: a CHOICE, not a guess (the pins are the exercise
 * favourites — the same list that leads the Exercises rail; nothing renders
 * until the athlete picks); a VERTICAL LEDGER, not a sixth rail; and a figure
 * that answers the question it raises — a row standing at its record prints
 * the climb that set it, a row off it prints the drawdown, and both figures
 * sit on the row so the percentage is checkable against them.
 *
 * The reading is a stock quote against its all-time high: name and record on
 * the left (with the day it was set — a record without its date is a claim),
 * the LATEST effort on the right with the ticker under it. Chartreuse means at
 * the high; the down channel means off it. Rows separate by whitespace — no
 * hairlines, no chrome — and each opens the movement's own page, which owns
 * the trend behind the two figures printed here.
 *
 * The list's one door is the pin sheet (ringed glyph — it leaves, into a
 * sheet), which doubles as the empty state's invitation: head + door and
 * nothing else until the athlete has chosen.
 */
export default function RecordsBoard({
  sessions,
  units,
  bw,
  onOpen,
}: {
  sessions: LoggedSession[];
  units: WeightUnit;
  bw: BodyweightInput;
  /** Where a row goes — the movement's own page. */
  onOpen: (name: string) => void;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const favourites = useExerciseFavourites();
  const [pickOpen, setPickOpen] = useState(false);

  const rows = useMemo(
    () => recordsBoard(sessions, favourites, { units, bw }),
    [sessions, favourites, units, bw],
  );
  if (sessions.length === 0) return null;

  // "12 May" — the record's day, in the row's quiet voice (locale month).
  const day = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  // One formatter pair per row kind, so the record and the latest can never
  // print different units: loads through fmtWeight/splitFigure, paces through
  // the discipline's own convention (the /km fallback is the canonical value).
  const bestText = (r: RecordRow): string =>
    r.kind === "strength"
      ? fmtWeight(r.best, units)
      : r.discipline
        ? formatDisciplinePace(r.best, r.discipline)
        : `${paceClock(r.best)} /km`;
  const latestFigure = (r: RecordRow): [string, string] =>
    r.kind === "strength"
      ? splitFigure(fmtWeight(r.latest, units))
      : r.discipline
        ? [disciplinePaceFigure(r.latest, r.discipline), disciplinePaceUnit(r.discipline)]
        : [paceClock(r.latest), "/km"];

  const row = (r: RecordRow) => {
    const [value, unit] = latestFigure(r);
    const best = `${t("w.home.rb.best")} ${bestText(r)} – ${day(r.bestAt)}`;
    return (
      <Pressable
        key={r.name}
        onPress={() => onOpen(r.name)}
        accessibilityRole="button"
        accessibilityLabel={`${r.name} – ${best} – ${value} ${unit}`}
        style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 }}
      >
        <View style={{ flex: 1 }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg, "snug"), color: C.chalk }}>
            {r.name}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} numberOfLines={1} style={[ty(C, "kicker"), { marginTop: 3 }]}>
            {best}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.monoBold, fontSize: fs.subtitle, lineHeight: leading(fs.subtitle, "tight"), color: C.chalk }}>
            {value}
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}> {unit}</Text>
          </Text>
          {/* AT THE RECORD the ticker is the climb that set it — "▲ PR +7.5"
              — because a bare load cannot tell a first plate from a rep ground
              out (the retirement's own example). Off it, the drawdown, in the
              stock ticker every other delta on this screen already speaks. */}
          {r.atBest ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={{ fontFamily: F.monoBold, fontSize: fs.micro, color: txt(C, C.lime), marginTop: 2 }}>
              {"▲ "}
              {t("w.home.rb.pr")}
              {r.proof?.kind === "climb" && r.proof.delta ? ` ${r.proof.delta}` : ""}
            </Text>
          ) : (
            <View style={{ marginTop: 2 }}>
              <TickerDelta deltaPct={r.deltaPct} improving={false} />
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  return (
    <View>
      {/* The scope is the head's one fact: these are all-time bests of your
          log, not a window's — the reason this block carries no date filter.
          A records head with no scope would read as this week's. */}
      <ASection title={t("w.home.rb.title")} meta={t("w.home.rb.scope")} />
      {rows.length > 0 && <View style={{ marginTop: 4 }}>{rows.map(row)}</View>}
      <DoorRow glyph="＋" title={t("w.home.rb.choose")} sub={t("w.home.rb.chooseSub")} onPress={() => setPickOpen(true)} />
      <ExerciseFavouritesSheet visible={pickOpen} onClose={() => setPickOpen(false)} sessions={sessions} />
    </View>
  );
}
