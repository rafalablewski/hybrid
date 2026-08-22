import { useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, ScrollView } from "react-native";
import {
  logbookWeek,
  LOGBOOK_SCROLL_WINDOW,
  mergeDoneReceipts,
  doneReceipt,
  dayStamp,
  dayStampText,
  streak,
  type LogbookDay,
  type LoggedSession,
  type WeightUnit,

  ALPHA,} from "@hybrid/core";
import { useTheme } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { fs, tracking, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { RADIUS } from "./kit";
import AEmptyDay from "./empty-day";
import AActionPair from "./action-pair";
import ReceiptBlock from "./receipt-block";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { withAlpha } from "./field";

/** The card's own inner padding — what the full-bleed hairline inside it bleeds
 *  by to reach the card's edges. NOT the screen gutter (this rail lives on a
 *  card), which is exactly the distinction a bare `-20` could not make. */
const CARD_PAD = 20;

// ── AURORA Logbook rail (mobile) ────────────────────────────────────────────
// "The Constant": the SAME week-rail object the plan state ships, mounted in
// LOGBOOK MODE for the plan-less athlete with logged history — so the calendar
// exists for the whole life of the account, and enrolling changes the card's
// fill, never its shape. Same anatomy as week-rail.tsx (one ink2 surface:
// header row, seven day chips, full-bleed hairline, a state-aware day detail),
// with the plan's vocabulary swapped for the log's: a day either holds
// training (✓, chalk) or stays quiet greyscale — a logbook makes no promises,
// so there is no "missed", no terracotta. Data from @hybrid/core logbookWeek.
// Mirrors the web component (aurora/logbook-rail.tsx) exactly.

type Pal = ReturnType<typeof useTheme>["palette"];

export default function AuroraLogbookRail({
  sessions,
  onLog,
  onLogSport,
  onSelectDay,
  doneFloor,
}: {
  sessions: LoggedSession[];
  /** Start an empty workout (today's primary action when nothing is logged). */
  onLog: () => void;
  /** Open the sport log for the VIEWED day. Present on every empty day, today's
   *  included — a sport is a different job from the structured logger, not an
   *  overflow item, and a day that has already passed can still hold one. */
  onLogSport?: (day: LogbookDay) => void;
  /** Fires when the athlete taps a day chip, so the caller can scope the rest
   *  of the screen (Also-today / feeling cards) to the viewed day. Mirrors the
   *  plan week rail's prop. */
  onSelectDay?: (day: LogbookDay) => void;
  /** The DONE FLOOR — every session logged on the viewed day, rendered as this
   *  card's lower floor under a labelled seam (aurora/done-floor.tsx). It is
   *  passed in rather than built here because the screen owns the day's
   *  sessions, the quick-log sheet and the Done-today sheet. */
  doneFloor?: ReactNode;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();

  // FOUR WEEKS, not seven days. The rail scrolls now, so the window is as deep
  // as the data rather than as deep as the row could draw — which is what
  // retires the "Last 7 days" caption: a control that can show its own extent
  // needs no sentence explaining its limits.
  const week = useMemo(() => logbookWeek(sessions, { windowDays: LOGBOOK_SCROLL_WINDOW }), [sessions]);

  // The rail parks on TODAY (its right edge) on first layout, once — never on
  // every content change, or a re-render mid-scroll would yank the athlete back
  // from the week they were reading.
  const railRef = useRef<ScrollView>(null);
  const parked = useRef(false);

  // Selected day: follows today until the athlete taps another chip.
  const [picked, setPicked] = useState<number | null>(null);
  const selectedIndex = picked ?? week.todayIndex;
  const sel = week.days[selectedIndex] ?? week.days[week.todayIndex]!;

  // The selected day's receipt — every session logged that day, merged into one
  // honest summary (untrustworthy figures were already dropped per session).
  const daySessions = useMemo(
    () => sel.sessionIds.map((id) => sessions.find((s) => s.id === id)).filter((s): s is LoggedSession => !!s),
    [sel.sessionIds, sessions],
  );
  const receipt = useMemo(
    () => mergeDoneReceipts(daySessions.map((s) => doneReceipt(s, { bodyweightKg: bw(s.startedAt) }))),
    [daySessions, bw],
  );

  // The athlete's current run — the done-today card's corner reports it in
  // place of a date the week strip has already shown (core day-stamp.ts).
  const streakDays = useMemo(() => streak(sessions).current, [sessions]);

  return (
    <View
      // ONE separation device, not four. The card used to say "this is a
      // surface" with a fill AND a 1px border AND a drop shadow AND three
      // hairlines inside it; the fill says it once. A grouped Section is what
      // the system would draw here, and what a grouped Section is, is a plane —
      // so the plane stays and the drawings around it go.
      style={{
        backgroundColor: C.ink2,
        borderRadius: RADIUS.card,
        padding: CARD_PAD,
      }}
    >
      {/* header: the log's name, and nothing else. The window caption went with
          the fixed row (see the window comment above), and the exit into
          History that briefly replaced it went with the card's exit entirely —
          this screen has one door into the log, and it is not up here. */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.black, fontSize: 21, letterSpacing: tracking(21), color: C.chalk }}>
          {t("w.home.logbook.title")}
        </Text>
      </View>

      {/* THE RAIL — four weeks of days that scroll, anchored at today. Bleeds by
          the card's own padding so a day passes under the card's edge instead of
          clipping mid-cell with a gutter beside it, with matching internal
          padding so a resting day still lands on the content column. */}
      <ScrollView
        ref={railRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -CARD_PAD, marginTop: 14 }}
        contentContainerStyle={{ paddingHorizontal: CARD_PAD, gap: DAY_GAP }}
        onContentSizeChange={() => { if (!parked.current) { parked.current = true; railRef.current?.scrollToEnd({ animated: false }); } }}
      >
        {week.days.map((d) => (
          <DayChip key={d.dateKey} C={C} day={d} selected={d.index === selectedIndex} onSelect={() => { setPicked(d.index); onSelectDay?.(d); }} t={t} />
        ))}
      </ScrollView>

      {/* full-bleed hairline — the ONLY separator left in the card, and it earns
          its place: above it is the week, below it one day. The floor's own
          hairline went; whitespace separates stacked rows. */}
      <View style={{ height: 1, backgroundColor: C.line, marginHorizontal: -CARD_PAD, marginTop: 16, marginBottom: 16 }} />

      <DayDetail
        key={sel.dateKey}
        C={C}
        day={sel}
        receipt={receipt}
        units={units}
        streakDays={streakDays}
        hasHistory={sessions.length > 0}
        doneFloor={doneFloor}
        onLog={onLog}
        onLogSport={onLogSport}
        t={t}
      />
    </View>
  );
}

/** One day's width in the rail, and the space between two of them. Fixed rather
 *  than flexed: the row scrolls now, so a cell can't take a seventh of whatever
 *  is left. */
const DAY_W = 44;
const DAY_GAP = 6;
/** The load bar's box — the ✓'s old slot, spending the same pixels on a figure
 *  instead of a fact. */
const LOAD_W = 20;
const LOAD_H = 3;

function DayChip({ C, day, selected, onSelect, t }: { C: Pal; day: LogbookDay; selected: boolean; onSelect: () => void; t: (k: string) => string }) {
  // What the bar is worth saying out loud. A gauge that draws a value and reads
  // "logged" to VoiceOver would be two different controls wearing one shape.
  // "74 min" — the unit the receipt already speaks, not the label key
  // ("Duration"), which would read as "Monday 10, 74 Duration".
  const a11yLoad = day.loadMin > 0
    ? `${day.loadMin} min`
    : t(day.logged ? "w.home.logbook.loggedDay" : "w.home.logbook.emptyPast");

  return (
    <Pressable
      onPress={onSelect}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${day.weekdayShort} ${day.dayOfMonth} — ${a11yLoad}`}
      style={{ width: DAY_W, alignItems: "center", gap: 5, paddingTop: 6, paddingBottom: 5 }}
    >
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking(fs.nano, "label"), textTransform: "uppercase", color: C.ash }}>{day.weekdayShort}</Text>
      {/* number slot — today = filled chartreuse disc; a tapped non-today day = a
          hairline disc (preview cue); otherwise a bare tonal number (chalk when
          the day holds training, ash when it doesn't). */}
      <View style={{ height: 28, alignItems: "center", justifyContent: "center" }}>
        {day.isToday ? (
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.onAccent }}>{day.dayOfMonth}</Text>
          </View>
        ) : selected ? (
          <View style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: withAlpha(C.chalk, ALPHA.line), alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{day.dayOfMonth}</Text>
          </View>
        ) : (
          <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: day.logged ? C.chalk : C.ash }}>{day.dayOfMonth}</Text>
        )}
      </View>
      {/* LOAD slot — the ✓'s pixels, spent on how much instead of whether. The
          track is always drawn so the row keeps one baseline across a rest day;
          the fill is the day's load against the heaviest day in view. An
          untrained day fills nothing — silence, never terracotta, because a
          logbook makes no promises.

          THE FILL IS CHALK ON EVERY DAY BUT TODAY, and it does not encode what
          the day WAS. An Aug 2026 change coloured each bar by the kind of the
          day's longest session (bar lime, engine blue, sport amber); it was
          reverted ON REQUEST along with the tinted cluster names it shipped
          beside, and it should not come back by a side door. The strip's job is
          the SHAPE of a week — seven widths, read in one glance — and a second
          variable painted onto the same seven marks costs that reading to
          answer a question ("was Tuesday a swim or a lift?") that the day's own
          row answers in words, one tap away. Today's lime is the exception and
          is not the same kind of signal: it says WHICH DAY YOU ARE ON, which is
          the one thing the strip has to state without being read. */}
      <View style={{ height: 12, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: LOAD_W, height: LOAD_H, borderRadius: LOAD_H / 2, backgroundColor: withAlpha(C.chalk, ALPHA.fill), overflow: "hidden" }}>
          {day.load > 0 ? (
            <View
              style={{
                width: `${Math.max(14, Math.round(day.load * 100))}%`,
                height: "100%",
                borderRadius: LOAD_H / 2,
                backgroundColor: day.isToday ? C.lime : withAlpha(C.chalk, 0.702),
              }}
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function DayDetail({ C, day, receipt, units, streakDays, hasHistory, doneFloor, onLog, onLogSport, t }: {
  C: Pal;
  day: LogbookDay;
  receipt: ReturnType<typeof mergeDoneReceipts>;
  units: WeightUnit;
  /** the athlete's current day-streak, for the done-today stamp. */
  streakDays: number;
  /** the account holds any logged session at all — separates a FIRST RUN from
   *  an ordinary open day, which are different sentences (core empty-day.ts). */
  hasHistory: boolean;
  /** the day's logged sessions as this card's lower floor (see the prop above). */
  doneFloor?: ReactNode;
  onLog: () => void;
  onLogSport?: (day: LogbookDay) => void;
  t: (k: string) => string;
}) {
  // The corner stamp — how far this day sits from now, never a second copy of
  // the chip above it or of the headline beside it (core day-stamp.ts).
  const stamp = dayStampText(
    dayStamp({ dateKey: day.dateKey, done: day.logged, streakDays }),
    t,
    `${day.weekdayShort} ${day.dayOfMonth} ${day.monthShort}`,
  );

  // LOGGED — the day collapses to a receipt, exactly like the plan rail's done
  // state: one headline, the finishing time, only trustworthy figures, and a
  // quiet text link into History.
  //
  // NO META LINE HERE AT ALL. It used to join the day's session titles
  // ("Tennis – Afternoon workout – finished 14:33"), and the Done-today card a
  // few hundred pixels below lists those very sessions by name, one row each,
  // with their own figures — the same words twice on one screen. The names went
  // then; the finishing clock that survived them has gone too (it named the
  // first workout of a day the figures beside it summed whole). The receipt is
  // its figures.
  // The sport label names its target day whenever that day is not today, so a
  // button pressed on Saturday's page cannot be read as logging into now.
  const sportLabel = day.isToday
    ? t("w.home.today.alsoTodayLogSport")
    : t("w.home.logbook.sportOn").replace("{day}", day.weekdayShort);

  if (day.logged) {
    return (
      <View>
        <ReceiptBlock
          receipt={receipt}
          units={units}
          title={t(day.isToday ? "w.home.rail.allDone" : "w.home.logbook.loggedDay")}
          stamp={stamp}
        />
        {doneFloor}
        {/* THE SAME PAIR A LOGGED DAY GETS. It shipped on EMPTY days only for a
            release, which quietly broke the rule the whole arrangement exists
            for: a day that already holds training is exactly when a hybrid
            athlete logs the second thing, and a PAST logged day had no way to
            add the match it forgot at all. Neither action is filled here — the
            work is real, so the accent retires. */}
        {/* AND THE CARD ENDS ON THE ACTION. A "View in history →" used to trail
            this row — first as a line of its own indented to the ✓'s gutter,
            then riding this baseline at the far edge, where it did not fit. The
            measure said so: a 187px pill and a 133px label do not share 311px,
            so the row wrapped and the exit was orphaned again one line down.
            The collision was the symptom; the redundancy was the cause. This
            screen ALREADY carries a door into History — the door row after the
            retrospective, glyph, name and all ("one exit point after all the
            breakdowns", the rule wave 3 established) — so the day card was a
            second door to the same room, 400px above the first and drawn in a
            different vocabulary. The day card states the day and offers the
            next thing to do. Leaving is the screen's job. */}
        <AActionPair
          align="leading"
          actions={[
            ...(day.isToday ? [{ label: t("w.home.today.alsoTodayLogFirst"), onPress: onLog }] : []),
            ...(onLogSport ? [{ label: sportLabel, onPress: () => onLogSport(day) }] : []),
          ]}
        />
      </View>
    );
  }

  // NOTHING LOGGED — today or a day behind us, ONE block either way
  // (aurora/empty-day.tsx, copy from core emptyDayCopy). It used to be two
  // drawings with two headlines, two sub-lines and two registers of type for
  // what is one state in two tenses; the tense now changes the sentence and
  // nothing else. The corner stamp still sits above it, since "Yesterday" is a
  // fact about the day rather than part of the block.
  //
  // THE ACTIONS ARE THE POINT OF THE ARRANGEMENT. Today offers the structured
  // logger as the one filled action and the SPORT log beside it, neutral —
  // never the old pairing of a glowing full-bleed pill with a dashed tile forty
  // pixels below it, which was two actions at one weight in two vocabularies. A
  // PAST day offers the sport alone, named and dated to that day: you cannot
  // start a live session in a day that has already happened, but you can very
  // much have played on Saturday and forgotten to log it.
  return (
    <View>
      {!!stamp && (
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{stamp}</Text>
        </View>
      )}
      <AEmptyDay isToday={day.isToday} hasHistory={hasHistory}>
        <AActionPair
          actions={[
            ...(day.isToday ? [{ label: t("w.home.today.alsoTodayLogFirst"), onPress: onLog, prominent: true }] : []),
            ...(onLogSport ? [{ label: sportLabel, onPress: () => onLogSport(day) }] : []),
          ]}
        />
      </AEmptyDay>
      {/* NO FLOOR ON AN EMPTY DAY, today included. A logbook day is `logged`
          exactly when it holds sessions, so on this branch the floor has zero
          rows by definition — all it can draw is its empty caption ("a match, a
          run, a swim — it lands here"), which would be the third time this block
          said the same thing: once in the description, once on the button, once
          in the caption. The floor returns the moment the day holds something
          to list. */}
    </View>
  );
}
