import { useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import {
  activityVerdict,
  activityWeekRange,
  calendarWeekRecap,
  weekChapters,
  weekSplit,
  groupDistanceDisplay,
  prsForSession,
  dayKeyMs,
  localDayKey,
  fmtTonnage,
  fmtKm,
  fmtWeight,
  kgToUnit,
  formatCardioPr,
  formatDisciplinePace,
  strengthPrProof,
  splitFigure,
  paceClock,
  durationParts,
  durationUnits,
  formatDuration,
  weekNarrative,
  sliceName,
  LABEL_GAP,
  type EnduranceSlice,
  type GymWindow,
  type EnduranceWindow,
  type WeeklyRecap,
  type WeightUnit,
} from "@hybrid/core";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLang, useSessionCount } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useSessionsQuery } from "../../lib/queries";
import { useTheme, txt, type Palette } from "../../lib/theme";
import { F, Loading, MAX_FONT_SCALE, TABULAR, fs, leading, space, tracking, ty } from "../../lib/ui";
import { MUSCLE_LABEL, recapShareText, shareCardImage } from "../../lib/share";
import { weekWords } from "../../lib/week-words";
import { WeekStoryCard, type WeekStoryFigures } from "./week-story-card";
import Sheet from "./sheet";
import { ACard, GUTTER, cardStack } from "./kit";
import { AWidget, WidgetFigure, WidgetRow, WidgetSeam, durationFigure } from "./widget";
import { APill } from "./kit";
import { HeroAction, HeroScreen } from "./hero";
import { SHARE_MARK } from "./share-mark";
import { Glyph } from "./icons";
import { Mark } from "./mark";
import FetchError from "./fetch-error";
import { WeekMarks } from "./week-marks";

// ── THE WEEK SUMMARY ────────────────────────────────────────────────────────
// The session summary's grammar, applied to the week. History's week chapter is
// the INDEX (the range, the seven marks, the sessions under it) and this is the
// REPORT behind it.
//
// IT IS A HYBRID ATHLETE'S WEEK, AND THE SHAPE SAYS SO. The page states the
// week ONCE as a whole and then SPLITS it:
//
//   THE WEEK — the clock, at display size. Time is the one measure both halves
//     carry, which is what makes it the honest combined figure: a tonnage hero
//     tells a lifter-who-also-runs that their week was about the barbell, every
//     week. Beside it, the session count and the days trained; under it the
//     verdict Today's card states, over this exact window, in the app's one
//     interpretive voice.
//   THE SHAPE — seven marks on their baseline.
//   GYM — what it moved, then sets, lifts, the muscle that took the most, and
//     the records that came out of it.
//   ENDURANCE & SPORT — the ground covered, then every discipline and sport by
//     name with its own share of the week, and its own records.
//
// THE TWO HALVES ARE A PARTITION (core week-split.ts): their minutes add back
// up to the clock at the top, so the page can be read downwards or added up and
// it says the same thing either way. A half with nothing in it does not render
// — a pure lifter has no endurance section rather than a section of zeros.
//
// SHARE IS IN THE RAIL'S TRAILING SLOT — the same corner, the same circle, as
// the workout summary's.

/** Aug 17 – Aug 23. The screen's title, and the share card's tag. */
const fmtDay = (key: string) => new Date(dayKeyMs(key)).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const rangeLabel = (startKey: string, endKey: string) => `${fmtDay(startKey)} – ${fmtDay(endKey)}`;

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** sec/km → "5:12 /km" for a cardio pace record. */
const paceStr = (secPerKm: number) => `${paceClock(secPerKm)} /km`;

/** The story card never grows past this, so a tablet still gets a postable
 *  9:16 rather than a poster. Mirrors the session card's own ceiling. */
const STORY_MAX_WIDTH = 420;
/** How much of the screen's height the PREVIEW may take inside the sheet. */
const STORY_PREVIEW_H = 0.54;
/** How far off the left edge the CAPTURE copy sits. react-native-view-shot
 *  photographs a view's own rendering, so the card has to be laid out and drawn
 *  — it does not have to be anywhere a person can see. */
const CAPTURE_OFFSCREEN = 10000;

export default function AuroraWeekSummary({ startKey }: { startKey: string }) {
  const { palette: C } = useTheme();
  const { t, lang } = useLang();
  const win = useWindowDimensions();
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
  // ONE RANGE, read by everything below it: the verdict's sentence and both
  // halves are slices of the same window, so they cannot disagree about which
  // week this is or what "the week before" means.
  const range = useMemo(() => (valid ? activityWeekRange(mondayMs) : null), [mondayMs, valid]);
  const verdict = useMemo(() => (range ? activityVerdict(sessions, range, bw) : null), [sessions, range, bw]);
  const split = useMemo(() => (range ? weekSplit(sessions, range, bw) : null), [sessions, range, bw]);

  // The athlete's own h/min, from their language — core holds the two keys so a
  // screen cannot quietly pick a different pair.
  const units_ = useMemo(() => durationUnits(t), [t]);

  const endKey = week?.endKey ?? (valid ? localDayKey(mondayMs + 6 * 86_400_000) : startKey);
  const title = valid ? rangeLabel(startKey, endKey) : t("session.notFound");

  // THE WEEK, READ OUT — core composes the sentences, the client resolves them
  // into this reader's language, units and duration words. The screen prints
  // the paragraph and the story card carries the SAME one out of the app.
  const words = useMemo(
    () => (recap && split ? weekWords(weekNarrative(recap, split.gym, split.endurance, verdict), t, lang, units) : []),
    [recap, split, verdict, t, lang, units],
  );
  // The screen sets the CONCLUSION at its own rank above the paragraph, so the
  // paragraph itself drops it. The story card keeps the whole thing: a card has
  // no second rank to put it in, and out of the app the conclusion is the line
  // that makes the rest mean something.
  const narration = useMemo(() => words.slice(0, -1), [words]);

  // No card for a week nobody trained — an untrained week has nothing to post,
  // so the rail carries no share circle rather than one that exports zeros.
  const story = useMemo<WeekStoryFigures | null>(
    () => (recap && split && recap.sessions > 0 ? storyFigures(recap, split, title, words, units, units_, t) : null),
    [recap, split, title, words, units, units_, t],
  );

  const shareRef = useRef<View>(null);
  const [shareOpen, setShareOpen] = useState(false);
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

  // The card is CAPTURED at export width and PREVIEWED at sheet width — one
  // component, one props object, and only the width differs. A fixed type scale
  // would break at one of the two, which is why every size on it is a fraction.
  const captureWidth = Math.min(win.width - GUTTER * 2, STORY_MAX_WIDTH);
  const previewWidth = Math.min(captureWidth, Math.round(((win.height * STORY_PREVIEW_H) * 9) / 16));

  const lime = txt(C, C.lime) as string;
  // THE COMBINED DELTA COMES FROM THE VERDICT, not from the recap's own previous
  // week — so the figure and the sentence beneath it are measured from the same
  // place. It matters most while a week is still running: the verdict truncates
  // the comparison to the days that have actually elapsed, and a Tuesday
  // measured against seven whole days is a loss the athlete has not had yet.
  const hoursDelta = useMemo(() => {
    const f = verdict && !verdict.cold ? verdict.figures.find((x) => x.metric === "hours") : null;
    if (!f || Math.round(f.value - f.previous) === 0) return null;
    return `${f.value > f.previous ? "+" : "−"}${formatDuration(Math.abs(f.value - f.previous), units_)}`;
  }, [verdict, units_]);

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
        story ? (
          <HeroAction
            glyph={SHARE_MARK.glyph}
            fallbackGlyph={SHARE_MARK.fallback}
            label={`${t("recap.share")} – ${title}`}
            onPress={() => setShareOpen(true)}
            onDark={false}
          />
        ) : undefined
      }
    >

      {q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <FetchError onRetry={() => q.refetch()} style={{ marginTop: space.lg }} />
      ) : !recap || !split || recap.sessions === 0 ? (
        <ACard style={[cardStack, { alignItems: "center", paddingVertical: space.xxxl }]}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{t("w.analyze.hist.noSessions")}</Text>
        </ACard>
      ) : (
        <>
          {/* ══ THE WEEK ═════════════════════════════════════════════════════
              The clock, because time is the one measure both halves pay into —
              a tonnage figure here tells a lifter-who-also-runs that their week
              was about the barbell, every week. */}
          <AWidget
            name={t("recap.theWeek")}
            // HOW OFTEN and OVER HOW MANY DAYS, on the name's own row. They are
            // the two facts that size the clock beside them, and a ledger row
            // of its own for a single count reads as a leftover.
            meta={`${sessionCount(recap.sessions)}   ${recap.activeDays} ${t("recap.activeDays")}`}
            style={cardStack}
          >
            <WidgetFigure rank="week" {...durationFigure(durationParts(recap.minutes), units_)} delta={hoursDelta} />
            {week && (
              <>
                <WidgetSeam />
                <View style={{ marginTop: space.lg }}>
                  <WeekMarks days={week.days} max={maxLoad} dates />
                </View>
              </>
            )}
          </AWidget>

          {/* ══ THE WEEK, READ OUT ═══════════════════════════════════════════
              On the ground between the widgets, because it is prose and every
              widget holds data.

              TWO RANKS, AND THE SPLIT IS THE POINT. The CONCLUSION comes first,
              in the app's one interpretive voice — the same sentence Today's
              card states about the same window, and it keeps that engine's
              honesty (a week with nothing before it makes no claim at all).
              The NARRATION follows at reading size: what the week actually was,
              in sentences, because nobody recounts their training as "9.0 t, 20
              sets, 8.2 km" and a summary that cannot be read is also a summary
              that cannot be posted. The conclusion interprets; the narration
              recounts — which is why only one of them takes the editorial rank. */}
          {verdict && (
            <Text style={[ty(C, "editorial", C.chalk), { marginTop: space.xs, paddingHorizontal: space.xxs }]}>
              {verdictLead(verdict, t)}
            </Text>
          )}
          {narration.length > 0 && (
            <Text
              style={{
                fontFamily: F.reg, fontSize: fs.bodyLg, lineHeight: leading(fs.bodyLg, "relaxed"),
                color: C.ash, marginTop: space.md, marginBottom: space.xl, paddingHorizontal: space.xxs,
              }}
            >
              {narration.join(" ")}
            </Text>
          )}

          {/* ══ GYM ══════════════════════════════════════════════════════════ */}
          {split.gym.totals.efforts > 0 && (
            <AWidget
              name={t("recap.gym")}
              meta={`${sessionCount(split.gym.totals.efforts)}   ${formatDuration(split.gym.totals.minutes, units_)}`}
              style={cardStack}
            >
              <WidgetFigure {...splitUnit(fmtTonnage(split.gym.totals.tonnage, units))} delta={gymDelta(split.gym, units)} />
              <WidgetSeam />
              {gymLedger(split.gym, recap, t).map((row) => (
                <WidgetRow key={row.label} label={row.label} value={row.value} />
              ))}
              {recap.prs.length > 0 && (
                <Records>
                  {recap.prs.map((p) => {
                    // WHAT IT BEAT. A record with no previous best beside it is
                    // a figure you have to remember the old one to read. The
                    // proof comes back STRUCTURED so its two halves can take two
                    // colours rather than one client re-parsing a joined string.
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
                </Records>
              )}
            </AWidget>
          )}

          {/* ══ ENDURANCE & SPORT ════════════════════════════════════════════ */}
          {split.endurance.totals.efforts > 0 && (
            <AWidget
              name={t("recap.sport")}
              meta={`${effortCount(split.endurance.totals.efforts, t)}   ${formatDuration(split.endurance.totals.minutes, units_)}`}
              style={cardStack}
            >
              <WidgetFigure
                {...(split.endurance.totals.distanceKm > 0
                  ? splitUnit(fmtKm(split.endurance.totals.distanceKm))
                  : durationFigure(durationParts(split.endurance.totals.minutes), units_))}
                delta={enduranceDelta(split.endurance)}
              />
              <WidgetSeam />
              {/* WHAT IT WAS MADE OF — every discipline and sport by name,
                  biggest first, each with its own drawn mark. This half used to
                  be a single "DISTANCE" row: a week of running, swimming and
                  squash said "8.2 km" and named none of them. */}
              {split.endurance.slices.map((sl) => <SliceRow key={sl.id} slice={sl} />)}
              {recap.cardioPrs.length > 0 && (
                <Records>
                  {recap.cardioPrs.map((p) => (
                    <RecordRow
                      key={`${p.move}-${p.kind}`}
                      name={p.move}
                      value={p.kind === "pace" ? paceStr(p.value) : fmtKm(p.value)}
                      gain={t(p.kind === "pace" ? "summary.fastestYet" : "summary.furthestYet")}
                      a11y={formatCardioPr(p, t("summary.firstTime"))}
                    />
                  ))}
                </Records>
              )}
            </AWidget>
          )}
        </>
      )}

      {/* ── SHARE ──────────────────────────────────────────────────────────
          WHAT YOU SEE IS WHAT YOU POST. The sheet holds the real card at
          preview width; the pill under it captures the SAME component at
          export width. The two differ in one prop, which is the only way a
          preview can be trusted to be the thing. */}
      {story && (
        <Sheet visible={shareOpen} onClose={() => setShareOpen(false)} title={t("recap.share")} sub={title}>
          <View style={{ alignItems: "center" }}>
            <WeekStoryCard figures={story} width={previewWidth} tracked={t("share.tracked")} />
          </View>
          <APill
            label={t("summary.shareStory")}
            onPress={doShare}
            disabled={sharing}
            style={{ marginTop: space.lg }}
          />
        </Sheet>
      )}

      {/* THE THING BEING PHOTOGRAPHED — mounted only while the sheet is open,
          and off the left edge at export width. */}
      {story && shareOpen && (
        <View pointerEvents="none" style={{ position: "absolute", left: -CAPTURE_OFFSCREEN, top: 0, width: captureWidth }}>
          <WeekStoryCard ref={shareRef} figures={story} width={captureWidth} tracked={t("share.tracked")} />
        </View>
      )}
    </HeroScreen>
  );
}

/* ── THE LEDGERS ─────────────────────────────────────────────────────────── */

/**
 * The gym half's remaining figures, in core's reading order — and without the
 * tonnage already set above them.
 *
 * SETS AND LIFTS COME FROM THE HALF, not from the week's recap: `recap.sets`
 * gives every block a grain and so counts a run as one set, which is right for
 * a whole-week figure and wrong under a heading that says GYM.
 */
function gymLedger(gym: GymWindow, recap: WeeklyRecap, t: (k: string) => string) {
  const rows: { label: string; value: string }[] = [];
  if (gym.totals.sets > 0) rows.push({ label: t("summary.sets"), value: String(gym.totals.sets) });
  if (gym.totals.lifts > 0) rows.push({ label: t("histview.liftsLbl"), value: String(gym.totals.lifts) });
  if (recap.topMuscle) {
    rows.push({ label: t("summary.slide.muscle"), value: MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle });
  }
  return rows;
}

/** One discipline or sport: its own mark, its name, and what it was — the
 *  ground it covered where it covered any, and the time it took. */
function SliceRow({ slice }: { slice: EnduranceSlice }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const name = slice.labelKey ? t(slice.labelKey) : (slice.label ?? "");
  const dist = slice.distanceKm > 0 ? `${groupDistanceDisplay(slice.distanceKm, slice.unit)} ${slice.unit}` : null;
  // A pace only where a named DISCIPLINE covered ground — a tennis match has no
  // pace anybody quotes, and a slice with no distance has none at all. The rate
  // reads in the discipline's own convention (a swim per 100 m, a ride as a
  // speed), which is both how it is spoken and what the paragraph above this
  // section says: printing "25:00 /km" beside "2:30 /100m" is one screen
  // stating one swim two ways.
  const pace = slice.discipline && slice.paceSecPerKm !== null
    ? formatDisciplinePace(slice.paceSecPerKm, slice.discipline)
    : null;
  return (
    <View
      accessible
      accessibilityLabel={[name, dist, formatDuration(slice.minutes), pace].filter(Boolean).join(", ")}
      style={{
        flexDirection: "row", alignItems: "center", gap: space.md,
        paddingVertical: space.ms,
      }}
    >
      <Mark mark={slice.mark} size={fs.subtitle} color={sliceColor(C, slice)} />
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{name}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ ...TABULAR, fontFamily: F.monoMed, fontSize: fs.body, color: C.chalk }}>{dist ?? formatDuration(slice.minutes)}</Text>
        {(dist || pace) && (
          <Text style={{ ...TABULAR, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: LABEL_GAP }}>
            {[dist ? formatDuration(slice.minutes) : null, pace].filter(Boolean).join("   ")}
          </Text>
        )}
      </View>
    </View>
  );
}

/** Teal is the app's cardio accent; a named SPORT is amber, the same hue the
 *  Other-sports tiles wear. Hue carries the KIND here exactly as it does on the
 *  week's day marks. */
const sliceColor = (C: Palette, s: EnduranceSlice) => (s.kind === "sport" ? C.amber : C.blue);

/* ── RECORDS ─────────────────────────────────────────────────────────────── */

/** A half's records, under its own hairline — a record is what came OUT of the
 *  work above it, so it closes the section rather than opening one. */
function Records({ children }: { children: ReactNode }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const lime = txt(C, C.lime) as string;
  return (
    <View style={{ marginTop: space.md, borderTopWidth: 1, borderTopColor: C.line, paddingTop: space.sm }}>
      <Text style={ty(C, "kicker", lime)}>{t("recap.pageRecords")}</Text>
      {children}
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
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: LABEL_GAP }}>
            {from ? `${from} ` : ""}
            {gain ? <Text style={{ color: gainTone ? lime : C.ash }}>{gain}</Text> : null}
          </Text>
        )}
      </View>
      <Text style={{ ...TABULAR, fontFamily: F.monoBold, fontSize: fs.bodyLg, color: lime }}>{value}</Text>
    </View>
  );
}

/* ── THE DELTAS ──────────────────────────────────────────────────────────── */

/** Each half against the same half of the week before — never against the whole
 *  week, and never against a mean. */
function gymDelta(g: GymWindow, units: WeightUnit): string | null {
  if (g.previous.efforts === 0) return null;
  const raw = g.totals.tonnage - g.previous.tonnage;
  if (Math.round(raw) === 0) return null;
  return `${raw > 0 ? "+" : "−"}${fmtWeight(units === "kg" ? Math.abs(raw) : kgToUnit(Math.abs(raw), "lb"), units)}`;
}

function enduranceDelta(e: EnduranceWindow): string | null {
  if (e.previous.efforts === 0) return null;
  if (e.totals.distanceKm > 0 || e.previous.distanceKm > 0) {
    const raw = e.totals.distanceKm - e.previous.distanceKm;
    if (Math.abs(raw) < 0.05) return null;
    return `${raw > 0 ? "+" : "−"}${fmtKm(Math.abs(raw))}`;
  }
  const raw = e.totals.minutes - e.previous.minutes;
  if (Math.round(raw) === 0) return null;
  return `${raw > 0 ? "+" : "−"}${formatDuration(Math.abs(raw))}`;
}

/** A formatted figure as numerals + unit, through core's own splitter — so no
 *  screen invents a second way to cut "9.0 t" in two. */
const splitUnit = (formatted: string) => {
  const [value, unit] = splitFigure(formatted);
  return { value, unit };
};

const effortCount = (n: number, t: (k: string) => string) => `${n} ${t(n === 1 ? "recap.effort" : "recap.efforts")}`;

/* ── THE SENTENCE ────────────────────────────────────────────────────────── */

type Verdict = ReturnType<typeof activityVerdict>;

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
 * THE STORY CARD'S FIGURES — the same three the screen sets, in the same
 * hierarchy: the clock both halves paid into, then each half's own figure. The
 * paragraph is handed over ALREADY RESOLVED, from the same resolver the screen
 * prints, so the card and the screen cannot describe one week two ways.
 */
function storyFigures(
  recap: WeeklyRecap,
  split: { gym: GymWindow; endurance: EnduranceWindow },
  stamp: string,
  words: string[],
  units: WeightUnit,
  u: { h: string; min: string },
  t: (k: string) => string,
): WeekStoryFigures {
  const halves: { label: string; value: string }[] = [];
  if (split.gym.totals.tonnage > 0) {
    halves.push({ label: t("recap.gym"), value: fmtTonnage(split.gym.totals.tonnage, units) });
  }
  if (split.endurance.totals.efforts > 0) {
    halves.push({
      label: t("recap.sport"),
      value: split.endurance.totals.distanceKm > 0
        ? fmtKm(split.endurance.totals.distanceKm)
        : formatDuration(split.endurance.totals.minutes, u),
    });
  }
  return {
    stamp,
    lead: { value: formatDuration(recap.minutes, u), label: t("w.home.week.lHours") },
    halves,
    words,
    records: [
      ...recap.prs.map((p) => ({ name: p.lift, value: fmtWeight(p.topLoad, units) })),
      ...recap.cardioPrs.map((p) => ({ name: p.move, value: p.kind === "pace" ? paceStr(p.value) : fmtKm(p.value) })),
    ],
  };
}
