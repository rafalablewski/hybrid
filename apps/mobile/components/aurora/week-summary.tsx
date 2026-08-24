import { useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import {
  activityVerdict,
  activityWeekRange,
  calendarWeekRecap,
  weekChapters,
  weekHeadline,
  prsForSession,
  dayKeyMs,
  localDayKey,
  fmtTonnage,
  fmtKm,
  fmtWeight,
  kgToUnit,
  formatCardioPr,
  strengthPrProof,
  paceClock,
  LABEL_GAP,
  type WeeklyRecap,
  type WeekHeadline,
  type WeightUnit,
} from "@hybrid/core";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLang, useSessionCount } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useSessionsQuery } from "../../lib/queries";
import { useTheme, txt } from "../../lib/theme";
import { F, Loading, MAX_FONT_SCALE, TABULAR, fs, leading, space, tracking, ty } from "../../lib/ui";
import { MUSCLE_LABEL, WeekPageShareCard, recapShareText, shareCardImage, type WeekSharePage } from "../../lib/share";
import { ACard, cardStack } from "./kit";
import { HeroAction, HeroScreen } from "./hero";
import { SHARE_MARK } from "./share-mark";
import { Glyph } from "./icons";
import FetchError from "./fetch-error";
import { WeekMarks } from "./week-marks";

// ── THE WEEK SUMMARY ────────────────────────────────────────────────────────
// The session summary's grammar, applied to the week. History's week chapter is
// the INDEX (the range, the seven marks, the sessions under it) and this is the
// REPORT behind it — everything the chapter cannot carry without becoming a
// screen of its own.
//
// IT IS A PAGE ABOUT ONE THING, and the shape says so:
//
//   ONE FIGURE AT SIZE — `weekHeadline` picks the figure the week was ABOUT on
//     the same priority the day card and the History rows use, so the three can
//     never headline different facts about the same training. Its delta rides
//     beside it.
//   ONE SENTENCE — the verdict Today's card carries, over this exact window
//     (`activityWeekRange`), in the app's one interpretive voice. It says what
//     MOVED, which is a different question from what the week was about, and it
//     keeps the honesty rules that engine already owns: no previous week, no
//     claim; nothing past the threshold, and it says so plainly.
//   THE SHAPE — seven marks on their baseline.
//   THE LEDGER — everything else, quiet, in core's figure order.
//   THE RECORDS — last, because a record is what came OUT of the week.
//
// It replaced a grid of eight identical tiles. Eight figures at one size is
// eight focal points, which is none: the athlete had to read the whole grid to
// find out what their week was, and the grid looked the same for a 9-tonne
// squat week and a 40 km running one.
//
// SHARE IS IN THE RAIL'S TRAILING SLOT — the same corner, the same circle, as
// the workout summary's.

/** Aug 17 – Aug 23. The screen's title, and the share card's tag. */
const fmtDay = (key: string) => new Date(dayKeyMs(key)).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const rangeLabel = (startKey: string, endKey: string) => `${fmtDay(startKey)} – ${fmtDay(endKey)}`;

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** sec/km → "5:12 /km" for a cardio pace record. */
const paceStr = (secPerKm: number) => `${paceClock(secPerKm)} /km`;

export default function AuroraWeekSummary({ startKey }: { startKey: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const sessionCount = useSessionCount();
  const router = useRouter();
  const units = useLoggerPrefs().units;
  const bw = useBodyweightLookup();
  const q = useSessionsQuery();
  const sessions = q.data ?? [];

  // The Monday this key names, LOCAL — the same boundary weekChapters cuts on,
  // so the chapter that opened this screen and the recap on it can never count
  // different sessions.
  const mondayMs = dayKeyMs(startKey);
  const valid = Number.isFinite(mondayMs);

  // PR counts once per data change, not once per chapter (prsForSession is O(n)
  // per session — History's own memo, for the same reason).
  const prCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions) m.set(s.id, prsForSession(sessions, s.id, bw).length);
    return m;
  }, [sessions, bw]);

  const weeks = useMemo(
    () => weekChapters(sessions, { bw, prs: (id: string) => prCounts.get(id) ?? 0 }),
    [sessions, bw, prCounts],
  );
  const week = weeks.find((w) => w.startKey === startKey) ?? null;
  // The athlete's busiest day across ALL weeks — the marks scale the same here
  // as they do in the chapter this screen was opened from.
  const maxLoad = Math.max(1, ...weeks.flatMap((w) => w.days.map((d) => d.load)));

  const recap = useMemo(
    () => (valid ? calendarWeekRecap(sessions, mondayMs, bw) : null),
    [sessions, mondayMs, valid, bw],
  );
  // The SAME verdict Today's card states, over this exact calendar week.
  const verdict = useMemo(
    () => (valid ? activityVerdict(sessions, activityWeekRange(mondayMs), bw) : null),
    [sessions, mondayMs, valid, bw],
  );
  const head = useMemo(() => (recap ? weekHeadline(recap, units) : null), [recap, units]);

  const endKey = week?.endKey ?? (valid ? localDayKey(mondayMs + 6 * 86_400_000) : startKey);
  const title = valid ? rangeLabel(startKey, endKey) : t("session.notFound");

  // No card for a week nobody trained — an untrained week has nothing to post,
  // so the rail carries no share circle rather than one that exports zeros.
  const page = useMemo<WeekSharePage | null>(
    () => (recap && recap.sessions > 0 ? sharePage(recap, title, units, t) : null),
    [recap, title, units, t],
  );
  const shareRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const doShare = async () => {
    if (sharing || !recap) return;
    setSharing(true);
    try {
      await shareCardImage(shareRef, recapShareText(recap, t, units, title), t("recap.share"));
    } finally {
      setSharing(false);
    }
  };

  // THE HERO'S DELTA COMES FROM THE VERDICT, not from the recap's own previous
  // week — so the figure and the sentence beneath it are measured from the same
  // place. It matters most while a week is still running: the verdict truncates
  // the comparison to the days that have actually elapsed, and a Tuesday
  // measured against seven whole days is a loss the athlete has not had yet.
  const delta = useMemo(
    () => (head && verdict ? headDelta(head, verdict, units) : null),
    [head, verdict, units],
  );

  const lime = txt(C, C.lime) as string;
  const prCount = recap ? recap.prs.length + recap.cardioPrs.length : 0;

  return (
    <HeroScreen
      hero={{
        rank: "title",
        title,
        meta: [recap ? sessionCount(recap.sessions) : null],
      }}
      back={() => router.back()}
      /* SHARE — the rail's trailing slot, the same circle in the same corner as
         the workout summary's. It is the screen-level utility this screen has,
         and a screen has exactly one of those. */
      accessory={
        page ? (
          <HeroAction
            glyph={SHARE_MARK.glyph}
            fallbackGlyph={SHARE_MARK.fallback}
            label={`${t("recap.share")} – ${title}`}
            onPress={() => void doShare()}
            onDark={false}
          />
        ) : undefined
      }
    >
      {/* The capture node — the branded card, off-screen, at export width. */}
      {page && (
        <View pointerEvents="none" style={{ position: "absolute", left: -10000, top: 0, opacity: 0, width: 340 }}>
          <WeekPageShareCard ref={shareRef} page={page} t={t} />
        </View>
      )}

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <FetchError onRetry={() => q.refetch()} style={{ marginTop: space.lg }} />
      ) : !recap || recap.sessions === 0 || !head ? (
        <ACard style={[cardStack, { alignItems: "center", paddingVertical: space.xxxl }]}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{t("w.analyze.hist.noSessions")}</Text>
        </ACard>
      ) : (
        <>
          {/* ══ THE SUBJECT ══════════════════════════════════════════════════
              On the ground, not in a card. A card is a container for a thing
              among other things, and this is what the page IS — putting it in
              one would rank it with the ledger below it. */}
          <View style={{ marginTop: space.sm, marginBottom: space.xl }}>
            <Text style={ty(C, "kicker")}>{t(head.labelKey)}</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: LABEL_GAP }}>
              <Text
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                // The weight and its SIZE on one line, which is the shape the
                // display-band floor is read off (design-tokens.test.ts): a
                // floor phrased as a size has to sit in the same style object
                // as the weight, or it is a claim nothing can check.
                style={{
                  ...TABULAR,
                  fontFamily: F.takeover, fontSize: fs.stat,
                  lineHeight: leading(fs.stat, "flush"),
                  letterSpacing: tracking(fs.stat),
                  color: C.chalk,
                }}
              >
                {head.figure}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.title, color: C.ash, marginLeft: space.sm }}>{head.unit}</Text>
              {delta && (
                <Text
                  style={{
                    ...TABULAR,
                    fontFamily: F.monoBold,
                    fontSize: fs.body,
                    color: delta.startsWith("+") ? lime : C.ash,
                    marginLeft: "auto",
                  }}
                >
                  {delta}
                </Text>
              )}
            </View>

            {/* THE ONE INTERPRETIVE LINE ON THIS SCREEN. Everything else here
                measures; this concludes. `verdictLead` keeps the engine's own
                honesty: a week with nothing before it makes no claim at all. */}
            {verdict && (
              <Text style={[ty(C, "editorial", C.ash), { marginTop: space.md }]}>{verdictLead(verdict, t)}</Text>
            )}
          </View>

          {/* ══ THE SHAPE OF THE WEEK ════════════════════════════════════════ */}
          {week && (
            <ACard style={cardStack}>
              <WeekMarks days={week.days} max={maxLoad} dates />
            </ACard>
          )}

          {/* ══ THE LEDGER ═══════════════════════════════════════════════════
              Everything the week also was, at reading size, in core's figure
              order (figure-order.ts). It is a LIST rather than a grid of tiles:
              a list is as long as it is, so a lifting week and a running week
              each carry their own figures instead of one of them carrying a
              row of zeros to keep the grid square. */}
          <ACard style={cardStack}>
            {ledger(recap, head, units, t).map((row, i) => (
              <FigureRow key={row.label} label={row.label} value={row.value} first={i === 0} />
            ))}
          </ACard>

          {/* ══ WHAT CAME OUT OF IT ══════════════════════════════════════════
              Last, as the figure order has it — and a chapter of its own,
              because a record is an EVENT and the rest of this page is
              measurement. */}
          {prCount > 0 && (
            <ACard style={cardStack}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" }}>
                <Text style={ty(C, "kicker", lime)}>{t("recap.pageRecords")}</Text>
                <Text style={{ ...TABULAR, fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{prCount}</Text>
              </View>
              {recap.prs.map((p) => {
                // WHAT IT BEAT. A record with no previous best beside it is a
                // figure you have to remember the old one to read. The proof
                // comes back STRUCTURED so the two halves can take their two
                // colours — where it came from in ash, what it gained in the
                // accent — rather than one client re-parsing a joined string.
                const proof = strengthPrProof(p, units);
                return (
                  <RecordRow
                    key={p.lift}
                    name={p.lift}
                    value={fmtWeight(p.topLoad, units)}
                    from={proof.kind === "climb" ? `${t("recap.from")} ${proof.from}` : null}
                    gain={proof.kind === "climb" ? proof.delta : t(proof.kind === "first" ? "summary.firstEver" : "summary.morePrReps")}
                    gainTone={proof.kind === "climb"}
                  />
                );
              })}
              {recap.cardioPrs.map((p) => (
                <RecordRow
                  key={`${p.move}-${p.kind}`}
                  name={p.move}
                  value={p.kind === "pace" ? paceStr(p.value) : fmtKm(p.value)}
                  gain={t(p.kind === "pace" ? "summary.fastestYet" : "summary.furthestYet")}
                  a11y={formatCardioPr(p, t("summary.firstTime"))}
                />
              ))}
            </ACard>
          )}
        </>
      )}
    </HeroScreen>
  );
}

/* ── THE LEDGER ──────────────────────────────────────────────────────────── */

/**
 * The week's remaining figures, in core's reading order — and WITHOUT the one
 * already set at display size above, because the whole point of promoting a
 * figure is that it is then stated once.
 */
function ledger(recap: WeeklyRecap, head: WeekHeadline, units: WeightUnit, t: (k: string) => string) {
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, value: string | null) => { if (value != null) rows.push({ label, value }); };

  if (recap.volume > 0 && head.kind !== "tonnage") add(t("summary.volumeMoved"), fmtTonnage(recap.volume, units));
  if (recap.sets > 0) add(t("summary.sets"), String(recap.sets));
  if (recap.lifts > 0) add(t("histview.liftsLbl"), String(recap.lifts));
  add(t("w.analyze.stats.sessions"), String(recap.sessions));
  add(t("w.analyze.stats.activeDays"), String(recap.activeDays));
  if (head.kind !== "hours") add(t("w.home.week.lHours"), clock(recap.minutes));
  if (recap.distanceKm > 0 && head.kind !== "distance") add(t("w.analyze.stats.distance"), fmtKm(recap.distanceKm));
  if (recap.topMuscle) add(t("summary.slide.muscle"), MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle);
  return rows;
}

/** 257 → "4h 17m". A week's training time in minutes is a number the athlete
 *  has to convert before it says anything. */
const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

/**
 * A label and its figure on one line, hairline-separated.
 *
 * NOT the readiness ring's `LedgerRow`, and deliberately not named like it: that
 * one is a row of the DEFICIT ledger — an arc's swatch, its cause and what it
 * cost, at caption size — and the one-ring guard exists to stop a second copy of
 * it appearing. This is a plain figure row, and calling it the same thing would
 * have been the first step towards the confusion that guard is about.
 */
function FigureRow({ label, value, first }: { label: string; value: string; first?: boolean }) {
  const { palette: C } = useTheme();
  return (
    <View
      accessible
      accessibilityLabel={`${label}, ${value}`}
      style={{
        flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
        gap: space.md, paddingVertical: space.ms,
        borderTopWidth: first ? 0 : 1, borderTopColor: C.line,
      }}
    >
      <Text style={ty(C, "kicker")}>{label}</Text>
      <Text
        maxFontSizeMultiplier={MAX_FONT_SCALE}
        style={{ ...TABULAR, fontFamily: F.monoMed, fontSize: fs.bodyLg, color: C.chalk }}
      >
        {value}
      </Text>
    </View>
  );
}

function RecordRow({ name, value, from, gain, gainTone, a11y }: {
  name: string;
  value: string;
  /** Where it came from, in ash — "from 97.5". */
  from?: string | null;
  /** What it gained, or what KIND of record it is when there is no gain to
   *  state ("first ever", "more reps", "fastest yet"). */
  gain?: string | null;
  /** True only for a real gain — that is the half the accent is for. */
  gainTone?: boolean;
  a11y?: string;
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const lime = txt(C, C.lime) as string;
  return (
    <View
      accessible
      accessibilityLabel={a11y ?? [name, value, from, gain].filter(Boolean).join(", ")}
      style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.md }}
    >
      <Glyph name="trophy" size={fs.subtitle} color={C.amber} label={t("w.train.logger.newPr")} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{name}</Text>
        {(!!from || !!gain) && (
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 1 }}>
            {from ? `${from} ` : ""}
            {gain ? <Text style={{ color: gainTone ? lime : C.ash }}>{gain}</Text> : null}
          </Text>
        )}
      </View>
      <Text style={{ ...TABULAR, fontFamily: F.monoBold, fontSize: fs.bodyLg, color: lime }}>{value}</Text>
    </View>
  );
}

/* ── THE SENTENCE ────────────────────────────────────────────────────────── */

type Verdict = ReturnType<typeof activityVerdict>;

/**
 * The hero figure's change against the period before, already formatted in the
 * hero's own unit — null when there is no axis to measure from (the week before
 * carried no training: a delta against a week nobody trained is not a small
 * number, it is not a number) or when nothing moved.
 */
function headDelta(head: WeekHeadline, v: Verdict, units: WeightUnit): string | null {
  if (v.cold) return null;
  const f = v.figures.find((x) => x.metric === head.metric);
  if (!f) return null;
  const raw = f.value - f.previous;
  if (raw === 0) return null;
  const sign = raw > 0 ? "+" : "−";
  const mag = Math.abs(raw);
  // Canonical units in, the hero's unit out: tonnage is kg, hours is MINUTES.
  if (head.metric === "tonnage") return `${sign}${fmtWeight(units === "kg" ? mag : kgToUnit(mag, "lb"), units)}`;
  if (head.metric === "distance") return `${sign}${fmtKm(mag)}`;
  return `${sign}${clock(Math.round(mag))}`;
}

/** The verdict's own sentence, resolved — the same strings Today's card sets,
 *  so the two surfaces conclude the same thing about the same week in the same
 *  words. Cold (nothing before this week) and flat are real answers here. */
function verdictLead(v: Verdict, t: (k: string) => string): string {
  if (v.cold) return t("w.home.week.coldLead");
  if (!v.metric || v.direction === "flat") return t("w.home.week.flatLead");
  const metric = t(METRIC_KEY[v.metric]);
  return t(v.direction === "up" ? "w.home.week.upLead" : "w.home.week.downLead").replace("{m}", metric);
}

const METRIC_KEY: Record<string, string> = {
  tonnage: "w.home.week.mTonnage",
  sessions: "w.home.week.mSessions",
  hours: "w.home.week.mHours",
  distance: "w.home.week.mDistance",
};

/* ── THE CARD THAT LEAVES THE APP ────────────────────────────────────────── */

/**
 * The week as the branded card. Three figures, chosen IN FIGURE ORDER from the
 * ones the week actually has — a card that prints "0 t" for a running week is a
 * worse advert for the week than one that prints the distance instead.
 */
function sharePage(recap: WeeklyRecap, tag: string, units: WeightUnit, t: (k: string) => string): WeekSharePage {
  const prCount = recap.prs.length + recap.cardioPrs.length;
  const stats = [
    recap.volume > 0 ? { label: t("summary.volumeMoved"), value: fmtTonnage(recap.volume, units) } : null,
    { label: t("w.analyze.stats.sessions"), value: String(recap.sessions) },
    recap.distanceKm > 0 ? { label: t("w.analyze.stats.distance"), value: fmtKm(recap.distanceKm) } : null,
    prCount > 0 ? { label: t("recap.prs"), value: String(prCount) } : null,
    { label: t("w.analyze.stats.activeDays"), value: String(recap.activeDays) },
  ]
    .filter((s): s is { label: string; value: string } => s !== null)
    .slice(0, 3);

  const rows = [
    ...recap.prs.map((p) => ({ name: p.lift, value: fmtWeight(p.topLoad, units), pr: true })),
    ...recap.cardioPrs.map((p) => ({ name: p.move, value: p.kind === "pace" ? paceStr(p.value) : fmtKm(p.value), pr: true })),
  ].slice(0, 4);

  const hasPrev = recap.prevSessions > 0 || recap.prevVolume > 0;
  return {
    tag,
    stats,
    rows,
    note: hasPrev
      ? `${signed(Math.round(kgToUnit(recap.volumeDelta, units)))} ${units} – ${signed(recap.sessionsDelta)} ${t("w.teams.coach.sessionsWord")} ${t("recap.vsLastWeek")}`
      : recap.topMuscle
        ? `${t("recap.top")} ${MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle}`
        : null,
  };
}
