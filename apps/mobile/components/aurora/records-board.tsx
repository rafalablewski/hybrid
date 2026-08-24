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
  pluralForm,
  TODAY_RANGE_STORE_KEY,
  type BodyweightInput,
  type LoggedSession,
  type RecordRow,
  type WeightUnit,
} from "@hybrid/core";
import { useLang, useSessionCount } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { F, MAX_FONT_SCALE, PressScale as Pressable, fs, leading, space, ty } from "../../lib/ui";
import { ASection, ADrawer } from "./kit";
import { TickerDelta } from "./exercise-widget";
import { DoorRow } from "./week-verdict";
import ExerciseFavouritesSheet from "./exercise-favourites-sheet";
import { useActivityRange, useRangeLabels } from "./range-filter";
import { useExerciseFavourites } from "../../lib/exercise-favourites";
import { haptic } from "../../lib/haptics";

/**
 * RECORDS — the Progress cluster's ledger of the movements the athlete pinned,
 * drawn as a FOLD-OUT: one line each until asked.
 *
 * Today carried a records block once and it went with the retrospective (see
 * capabilities: activity-records-figures, today-retrospective-reduced). This
 * block returns on the terms that retirement set, which core records-board.ts
 * spells out: a CHOICE, not a guess (the pins are the exercise favourites);
 * a LEDGER, not a sixth rail; and a figure that answers the question it
 * raises.
 *
 * THE COLLAPSED LINE IS THE WHOLE THESIS IN ONE ROW — `132.5 / 140 kg  ▼5.4%`:
 * where you are, over the record, and the distance between them. Both figures
 * are on the line, so the percentage is checkable against the numbers beside
 * it rather than taken on trust. A row standing AT its record drops the pair
 * (they would be the same number twice) and prints the climb that set it
 * instead — so the record rows LOOK different, which is the point of a
 * watchlist.
 *
 * THE FOLD IS THE PROOF, not a second screen: the record's date, the latest
 * effort's date, and the climb. It GROWS IN PLACE behind a bare ＋/− in ash —
 * no ring, because nothing is being opened (the exit grammar's expander). The
 * NAME is the separate control and still leaves, to the movement's own page,
 * which owns the trend behind the two figures printed here.
 *
 * SCOPE — THE HEAD CARRIES A COUNT, NOT A PERIOD, and that is deliberate. This
 * cluster has ONE period (the verdict card's control, core
 * TODAY_RANGE_STORE_KEY) and every block governed by it echoes that window. A
 * record is not governed by it: a personal record is all-time by construction,
 * and "your best squat in the last 7 days" is not a record — it is a maximum.
 * So this block must not print a period at all; a second period label in the
 * same mono slot reads as a competing setting, which is exactly the fault the
 * lanes had worst (whole-history totals under an ALL TIME head, over an
 * eight-week chart, beneath a THIS WEEK card). The head says how many
 * movements you are watching — the Explore SectionHead's own count grammar,
 * and the truer fact besides: this is a SELECTION, not your log. All-time is
 * disclosed where it is checkable — on each row's own dates, in the fold.
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
  /** Where a row's NAME goes — the movement's own page. */
  onOpen: (name: string) => void;
}) {
  const { palette: C } = useTheme();
  const { t, lang } = useLang();
  const sessionCount = useSessionCount();
  const favourites = useExerciseFavourites();
  const [pickOpen, setPickOpen] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  // READ, NEVER WRITTEN — the cluster's period, for the FOLD only. The record
  // itself is all-time and stays so; the window governs the trend sentence,
  // which is a different question ("how have I been going lately") and the one
  // place on this block where the filter has anything to say.
  const { range } = useActivityRange(TODAY_RANGE_STORE_KEY);
  const windowTitle = useRangeLabels(range).title;

  const rows = useMemo(
    () => recordsBoard(sessions, favourites, { units, bw, range }),
    [sessions, favourites, units, bw, range],
  );
  if (sessions.length === 0) return null;

  // "12 May" — a record's day, in the row's quiet voice (locale month).
  const day = (iso: string): string =>
    new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  // One formatter pair per row kind, so a record and the latest can never
  // print different units: loads through fmtWeight/splitFigure, paces in the
  // discipline's own convention (the /km fallback is the canonical value).
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
  const bestFigure = (r: RecordRow): string =>
    r.kind === "strength"
      ? splitFigure(fmtWeight(r.best, units))[0]
      : r.discipline
        ? disciplinePaceFigure(r.best, r.discipline)
        : paceClock(r.best);

  /**
   * The fold's sentence. Core decided WHICH read the row deserves; this maps
   * that decision onto its wording and fills the three slots — the window, the
   * gap, and the record's day.
   *
   * A pace row takes its own three directions: "building" and "easing off" are
   * about load and would read as nonsense over a run, where the same movements
   * are getting faster and slowing. Everything else (nothing logged, too few
   * sessions, a first entry, standing on the record) is true in the same words
   * either way.
   */
  const readSentence = (r: RecordRow): string => {
    const read = r.read!;
    const paced = r.kind === "cardio";
    const suffix =
      read.kind === "climbing" ? (paced ? "paceClimbing" : "climbing")
      : read.kind === "holding" ? (paced ? "paceHolding" : "holding")
      : read.kind === "slipping" ? (paced ? "paceSlipping" : "slipping")
      : read.kind;
    return t(`w.home.rb.read.${suffix}`)
      .replace("{w}", windowTitle)
      .replace("{g}", String(read.gapPct))
      .replace("{d}", day(r.bestAt));
  };


  const row = (r: RecordRow) => {
    const [value, unit] = latestFigure(r);
    const isOpen = open === r.name;
    return (
      <View key={r.name}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: space.ms }}>
          {/* THE NAME LEAVES — the movement's page owns the trend. */}
          <Pressable
            onPress={() => onOpen(r.name)}
            accessibilityRole="button"
            accessibilityLabel={`${r.name} – ${value} ${unit}`}
            style={{ flex: 1, minWidth: 0 }}
          >
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              numberOfLines={1}
              style={{ fontFamily: F.semi, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg, "snug"), color: C.chalk }}
            >
              {r.name}
            </Text>
          </Pressable>

          {/* WHERE YOU ARE, OVER THE RECORD. At the record the pair collapses —
              printing 140 / 140 would be the same number twice. */}
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            numberOfLines={1}
            style={{ fontFamily: F.monoBold, fontSize: fs.caption, color: C.chalk }}
          >
            {r.atBest ? value : `${value}`}
            {!r.atBest && (
              <Text style={{ fontFamily: F.mono, color: C.ash }}>{` / ${bestFigure(r)}`}</Text>
            )}
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{` ${unit}`}</Text>
          </Text>

          {r.atBest ? (
            <Text
              maxFontSizeMultiplier={MAX_FONT_SCALE}
              style={{ fontFamily: F.monoBold, fontSize: fs.micro, color: txt(C, C.lime) }}
            >
              {"▲ "}
              {t("w.home.rb.pr")}
              {r.proof?.kind === "climb" && r.proof.delta ? ` ${r.proof.delta}` : ""}
            </Text>
          ) : (
            <TickerDelta deltaPct={r.deltaPct} improving={false} />
          )}

          {/* GROWS IN PLACE — a bare ＋/− in ash, never a ring and never the
              accent: nothing is being opened and nowhere is being gone. */}
          <Pressable
            onPress={() => { haptic.light(); setOpen(isOpen ? null : r.name); }}
            accessibilityRole="button"
            accessibilityState={{ expanded: isOpen }}
            accessibilityLabel={`${isOpen ? t("w.home.rb.less") : t("w.home.rb.more")} – ${r.name}`}
            style={{ width: 24, alignItems: "flex-end" }}
          >
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{isOpen ? "−" : "＋"}</Text>
          </Pressable>
        </View>

        {/* THE READ. The collapsed row already carries the figures, so the fold
            does not reprint them in words — it answers what the figures raise
            and cannot settle: which way this movement has been going, over the
            period the screen is showing, against a record that period does not
            govern. Both scopes are named inside the sentence (the window as an
            apposition, the record by its date) so neither can be read for the
            other. Core picks the shape; this only fills it in. */}
        <ADrawer open={isOpen}>
          <View style={{ paddingBottom: space.ms, gap: space.xs }}>
            {r.read && (
              <Text
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption, "relaxed"), color: C.chalk }}
              >
                {readSentence(r)}
              </Text>
            )}
            {/* The evidence the direction rests on. It sits OUTSIDE the
                sentence so the count can take its language's plural without
                a sentence variant per form. */}
            {r.read && r.read.sessions > 0 && <Text style={ty(C, "kicker")}>{sessionCount(r.read.sessions)}</Text>}
            {r.proof?.kind === "climb" && r.proof.from && (
              <Text style={ty(C, "kicker")}>
                {t("w.home.rb.climbedFrom").replace("{v}", r.proof.from)} {r.proof.delta}
              </Text>
            )}
          </View>
        </ADrawer>
      </View>
    );
  };

  return (
    <View>
      <ASection
        title={t("w.home.rb.title")}
        meta={rows.length > 0 ? t("w.home.rb.watching").replace("{n}", String(rows.length)) : undefined}
      />
      {rows.length > 0 && <View style={{ marginTop: space.xxs }}>{rows.map(row)}</View>}
      <DoorRow glyph="＋" title={t("w.home.rb.choose")} sub={t("w.home.rb.chooseSub")} onPress={() => setPickOpen(true)} />
      <ExerciseFavouritesSheet visible={pickOpen} onClose={() => setPickOpen(false)} sessions={sessions} />
    </View>
  );
}
