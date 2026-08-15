import { View, Text } from "react-native";
import { alsoTodayCopy, isRated, sessionIcon, sessionMeta, type LoggedSession, type WeightUnit , ALPHA} from "@hybrid/core";
import { useTheme, txt } from "../../lib/theme";
import { useLang } from "../../lib/i18n";
import { leading, tracking, fs, F, PressScale as Pressable, FIXED_FONT_SCALE } from "../../lib/ui";
import { withAlpha , RADIUS} from "./kit";
import { ArrowGlyph } from "./cta-label";
import SwipeRow from "../swipe-row";
import AActionPair from "./action-pair";
import { useConfirm } from "./confirm";

// ── AURORA Done floor (mobile) ──────────────────────────────────────────────
// What was ACTUALLY logged on the viewed day — one row per session — as the
// LOWER FLOOR of the week rail's card, under a labelled seam.
//
// It used to be a card of its own sitting below the rail, which meant Today
// drew the same day twice: the rail named the work under the calendar, and this
// card named it again three hundred pixels down. Merging them (option 01 of the
// merge study, Aug 2026) puts one day in one card — but the two floors must
// never blur into each other, because they are different KINDS of thing:
// above the seam is what the plan ASKS of you (a prescription, with Start /
// Skip / Move), below it is what you DID. A tennis row sitting directly under
// Trap-Bar Deadlift with only a hairline between them reads as the last item of
// the prescription, which is a lie.
//
// So the seam carries the count — "2 done today" — which is the old card's
// display-weight numeral demoted to a label, and keeps the arrow into the
// Done-today sheet. At zero it drops the arrow and speaks the invitation
// instead ("a match, a run, a swim — it lands here"), because a "0" is not
// worth a surface.
//
// A ROW CAN ALSO BE RATED FROM HERE. A session the app has no effort rating for
// counts for nothing in training load (core/session-feel.ts, feel-schedule's
// `isRated`), and the two ways a session arrives unrated — imported off a watch,
// quick-logged after the fact — are exactly the two that never pass the finish
// screen where the question normally gets asked. The answer used to live only
// at the bottom of the session's Wrapped, six panels down; nobody scrolls there
// to volunteer a number. So the ask sits on the row, opening the rating sheet
// directly. It is a plain lime word, not a chip: a bordered box at the end of a
// row reads as a second thing in the list (see the exit rule in CLAUDE.md).
//
// Mirrors the web twin (aurora/done-floor.tsx) exactly.
export default function DoneFloor({
  rows,
  planIds,
  isToday,
  dayLabel,
  units,
  bw,
  pad = 20,
  rule = true,
  onOpen,
  onLog,
  onDone,
  onRate,
  onDelete,
  logRow = true,
}: {
  /** every session logged on the VIEWED day, plan-fulfilling ones included. */
  rows: LoggedSession[];
  /** ids the plan claims — those rows wear the Plan tag. */
  planIds: Set<string>;
  /** false when the week rail has another day selected: the seam label carries
   *  the date and the log row hides (a quick log always saves at "now"). */
  isToday: boolean;
  dayLabel: string | null;
  units: WeightUnit;
  bw: (isoDate?: string) => number | null;
  /** the host card's horizontal padding — the seam's hairline bleeds by it. */
  pad?: number;
  /** false when the floor IS the card (nothing above it to be separated from). */
  rule?: boolean;
  onOpen: (sessionId: string) => void;
  onLog: () => void;
  onDone: () => void;
  /** Opens the rating sheet for a session nobody has rated. Omitted where the
   *  host can't present a sheet — the rows then simply don't offer it. */
  onRate?: (session: LoggedSession) => void;
  /** Delete the session behind a row. Present → the row swipes; absent → it
   *  doesn't, and the floor is exactly what it was. Until this existed the only
   *  way to remove a mis-logged session was not from this card at all: you
   *  opened it, and then you were in the session, which is the wrong place to
   *  decide it shouldn't exist. */
  onDelete?: (session: LoggedSession) => void;
  /** Draw the "log a sport" row at the end of the list. False where the HOST
   *  already offers that action — the logbook rail carries it in its own action
   *  pair on every day state, and two identical offers on one card is the exact
   *  duplication this floor's dashed tile was removed to end. */
  logRow?: boolean;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { confirm } = useConfirm();
  const quiet = withAlpha(C.ash, 0.6);
  // caption + log-label state machine lives in core so the web twin can't drift
  const copy = alsoTodayCopy({ doneCount: rows.length, isToday });
  const countLabel = isToday
    ? `${rows.length} ${t("w.home.today.glanceDone")}`
    : `${rows.length} ${t("w.home.today.glanceDoneOn").replace("{d}", dayLabel ?? "")}`;

  return (
    <View>
      {/* Whitespace, not a rule. The seam's LABEL is the separation — the count
          in mono caps already announces a change of subject, and a hairline
          under it made this the third horizontal line in one card. The `rule`
          prop still governs whether the floor is separated at all, it just
          spends the gap on air now. */}
      {rule && <View style={{ height: 22 }} />}

      {/* THE SEAM. A count is a label, so it sets in mono uppercase and taps
          through to the sheet; an empty day is a sentence, so it stays in
          sentence case and taps nowhere. */}
      {rows.length > 0 ? (
        <Pressable
          onPress={onDone}
          accessibilityRole="button"
          accessibilityLabel={countLabel}
          style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 2 }}
        >
          <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C.ash }}>{countLabel}</Text>
          <ArrowGlyph size={14} color={quiet} />
        </Pressable>
      ) : (
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, lineHeight: leading(fs.micro), color: quiet }}>{t(copy.subKey ?? "w.home.today.alsoTodaySubEmpty")}</Text>
      )}

      <View style={{ marginTop: rows.length > 0 ? 4 : 6, gap: 4 }}>
        {rows.map((s) => {
          const onPlanRow = planIds.has(s.id);
          // The ask, only where there is genuinely no answer. A rated row says
          // nothing about it: the rating is on the summary, and a row that
          // reported its own state twice would be louder than the training.
          const ask = onRate && !isRated(s);
          // A destructive action gets a question, and the question is the APP's
          // — the confirm sheet, never Alert.alert (the design-token test bans
          // system alerts outright, and it is right to: a user who has learned
          // this app's sheet gesture should not meet an OS modal at exactly the
          // moment they most need to feel oriented). The swipe itself IS the
          // system's, though: the standard short-swipe-opens / full-swipe-commits
          // gesture, so a deletable row here behaves like every other one in iOS.
          const row = (
            // Two targets, one row: the row opens the session, the word rates it.
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Pressable onPress={() => onOpen(s.id)} accessibilityRole="button" accessibilityLabel={s.title} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 }}>
                <View style={{ width: 40, height: 40, borderRadius: RADIUS.inner, alignItems: "center", justifyContent: "center", backgroundColor: withAlpha(onPlanRow ? C.lime : C.blue, ALPHA.solid) }}>
                  <Text style={{ fontSize: fs.title }}>{sessionIcon(s)}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{s.title}</Text>
                  {/* NO CLOCK TIME HERE — see the web twin. The trailing "21:33" was
                      the record's save time masquerading as the workout's time; the
                      row states what was done, nothing else. */}
                  <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{sessionMeta(s, units, bw(s.startedAt))}</Text>
                </View>
                {onPlanRow ? (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.home.today.kPlan")}</Text>
                ) : null}
              </Pressable>
              {ask ? (
                <Pressable
                  onPress={() => onRate!(s)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={t("session.feel.rateA11y").replace("{title}", s.title)}
                  accessibilityHint={t("session.feel.rateUnrated")}
                  style={{ paddingVertical: 8, paddingLeft: 4 }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.label, textTransform: "uppercase", color: txt(C, C.lime) }}>{t("session.feel.rate")}</Text>
                </Pressable>
              ) : null}
            </View>
          );

          if (!onDelete) return <View key={s.id}>{row}</View>;
          return (
            <SwipeRow
              key={s.id}
              label={t("common.delete")}
              background="transparent"
              marginBottom={0}
              onDelete={async () => {
                const ok = await confirm({
                  title: t("w.home.today.deleteTitle"),
                  message: t("w.home.today.deleteBody").replace("{title}", s.title),
                  confirmLabel: t("common.delete"),
                  destructive: true,
                });
                if (ok) onDelete(s);
              }}
            >
              {row}
            </SwipeRow>
          );
        })}
        {/* THE LOG ROW, and the dashed tile is finally gone. A dashed border is
            a web affordance that appears nowhere in iOS, and the ＋ square read
            as one more row in the list it sat at the end of. It is a neutral
            capsule now — the same control AActionPair draws — so two offers of
            the same thing can never look like different offers.

            `logRow={false}` where the HOST already carries the action: the
            logbook rail draws its own pair on every day state, and for one
            release this row rendered underneath it saying the same words forty
            pixels apart. One surface, one offer. */}
        {isToday && logRow ? (
          <AActionPair align="leading" actions={[{ label: t(copy.logKey), onPress: onLog }]} />
        ) : null}
      </View>
    </View>
  );
}
