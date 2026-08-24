import { useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
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
  strengthPrProof,
  paceClock,
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
import { MUSCLE_LABEL, WeekPageShareCard, recapShareText, shareCardImage, type WeekSharePage } from "../../lib/share";
import { ACard, ASection, cardStack } from "./kit";
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

/** 257 → "4h 17m". A week's training time in minutes is a number the athlete
 *  has to convert before it says anything. */
const clock = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
};

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
  // ONE RANGE, read by everything below it: the verdict's sentence and both
  // halves are slices of the same window, so they cannot disagree about which
  // week this is or what "the week before" means.
  const range = useMemo(() => (valid ? activityWeekRange(mondayMs) : null), [mondayMs, valid]);
  const verdict = useMemo(() => (range ? activityVerdict(sessions, range, bw) : null), [sessions, range, bw]);
  const split = useMemo(() => (range ? weekSplit(sessions, range, bw) : null), [sessions, range, bw]);

  const endKey = week?.endKey ?? (valid ? localDayKey(mondayMs + 6 * 86_400_000) : startKey);
  const title = valid ? rangeLabel(startKey, endKey) : t("session.notFound");

  // No card for a week nobody trained — an untrained week has nothing to post,
  // so the rail carries no share circle rather than one that exports zeros.
  const page = useMemo<WeekSharePage | null>(
    () => (recap && split && recap.sessions > 0 ? sharePage(recap, split, title, units, t) : null),
    [recap, split, title, units, t],
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

  const lime = txt(C, C.lime) as string;
  // THE COMBINED DELTA COMES FROM THE VERDICT, not from the recap's own previous
  // week — so the figure and the sentence beneath it are measured from the same
  // place. It matters most while a week is still running: the verdict truncates
  // the comparison to the days that have actually elapsed, and a Tuesday
  // measured against seven whole days is a loss the athlete has not had yet.
  const hoursDelta = useMemo(() => {
    const f = verdict && !verdict.cold ? verdict.figures.find((x) => x.metric === "hours") : null;
    if (!f || Math.round(f.value - f.previous) === 0) return null;
    return `${f.value > f.previous ? "+" : "−"}${clock(Math.abs(Math.round(f.value - f.previous)))}`;
  }, [verdict]);

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
      ) : !recap || !split || recap.sessions === 0 ? (
        <ACard style={[cardStack, { alignItems: "center", paddingVertical: space.xxxl }]}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{t("w.analyze.hist.noSessions")}</Text>
        </ACard>
      ) : (
        <>
          {/* ══ THE WEEK, WHOLE ══════════════════════════════════════════════
              On the ground, not in a card. A card is a container for a thing
              among other things, and this is what the page IS. */}
          <View style={{ marginTop: space.sm, marginBottom: space.xl }}>
            <Text style={ty(C, "kicker")}>{t("recap.theWeek")}</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", marginTop: LABEL_GAP }}>
              {/* The weight and its SIZE on one line, which is the shape the
                  display-band floor is read off (design-tokens.test.ts). */}
              <Text
                maxFontSizeMultiplier={MAX_FONT_SCALE}
                style={{
                  ...TABULAR,
                  fontFamily: F.takeover, fontSize: fs.stat,
                  lineHeight: leading(fs.stat, "flush"),
                  letterSpacing: tracking(fs.stat),
                  color: C.chalk,
                }}
              >
                {clock(recap.minutes)}
              </Text>
              {hoursDelta && (
                <Text style={{ ...TABULAR, fontFamily: F.monoBold, fontSize: fs.body, color: hoursDelta.startsWith("+") ? lime : C.ash, marginLeft: "auto" }}>
                  {hoursDelta}
                </Text>
              )}
            </View>
            <MetaRow
              items={[
                [sessionCount(recap.sessions), null],
                [`${recap.activeDays} ${t("recap.activeDays")}`, null],
              ]}
            />

            {/* THE ONE INTERPRETIVE LINE ON THIS SCREEN. Everything else here
                measures; this concludes. It keeps the engine's own honesty: a
                week with nothing before it makes no claim at all. */}
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

          {/* ══ GYM ══════════════════════════════════════════════════════════ */}
          {split.gym.totals.efforts > 0 && (
            <>
              <ASection title={t("recap.gym")} />
              <ACard style={cardStack}>
                <HalfFigure
                  figure={fmtTonnage(split.gym.totals.tonnage, units)}
                  delta={gymDelta(split.gym, units)}
                  meta={[
                    [sessionCount(split.gym.totals.efforts), null],
                    [clock(split.gym.totals.minutes), null],
                  ]}
                />
                {gymLedger(recap, t).map((row, i) => (
                  <FigureRow key={row.label} label={row.label} value={row.value} first={i === 0} />
                ))}
                {recap.prs.length > 0 && (
                  <Records>
                    {recap.prs.map((p) => {
                      // WHAT IT BEAT. A record with no previous best beside it
                      // is a figure you have to remember the old one to read.
                      // The proof comes back STRUCTURED so its two halves can
                      // take two colours rather than one client re-parsing a
                      // joined string.
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
              </ACard>
            </>
          )}

          {/* ══ ENDURANCE & SPORT ════════════════════════════════════════════ */}
          {split.endurance.totals.efforts > 0 && (
            <>
              <ASection title={t("recap.enduranceSport")} />
              <ACard style={cardStack}>
                <HalfFigure
                  figure={split.endurance.totals.distanceKm > 0 ? fmtKm(split.endurance.totals.distanceKm) : clock(split.endurance.totals.minutes)}
                  delta={enduranceDelta(split.endurance)}
                  meta={[
                    [effortCount(split.endurance.totals.efforts, t), null],
                    [clock(split.endurance.totals.minutes), null],
                  ]}
                />
                {/* WHAT IT WAS MADE OF — every discipline and sport by name,
                    biggest first, each with its own drawn mark. This is the
                    half that used to be a single "DISTANCE" row: a week of
                    running, swimming and squash said "8.2 km" and named none of
                    them. */}
                {split.endurance.slices.map((s, i) => (
                  <SliceRow key={s.id} slice={s} first={i === 0} />
                ))}
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
              </ACard>
            </>
          )}
        </>
      )}
    </HeroScreen>
  );
}

/* ── A HALF'S FIGURE ─────────────────────────────────────────────────────── */

/** One half's own figure, a rung under the week's, with its delta and the two
 *  facts that size it — how many times, and for how long. */
function HalfFigure({ figure, delta, meta }: { figure: string; delta: string | null; meta: [string, string | null][] }) {
  const { palette: C } = useTheme();
  const lime = txt(C, C.lime) as string;
  return (
    <View style={{ marginBottom: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "baseline" }}>
        <Text
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={{
            ...TABULAR,
            fontFamily: F.takeover, fontSize: fs.display,
            lineHeight: leading(fs.display, "flush"),
            letterSpacing: tracking(fs.display),
            color: C.chalk,
          }}
        >
          {figure}
        </Text>
        {delta && (
          <Text style={{ ...TABULAR, fontFamily: F.monoBold, fontSize: fs.body, color: delta.startsWith("+") ? lime : C.ash, marginLeft: "auto" }}>
            {delta}
          </Text>
        )}
      </View>
      <MetaRow items={meta} />
    </View>
  );
}

/** Facts side by side, separated by LAYOUT rather than by a glyph — the house
 *  rule against joining inline items with a middot, honoured by not joining
 *  them into a string at all. */
function MetaRow({ items }: { items: [string, string | null][] }) {
  const { palette: C } = useTheme();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.md, marginTop: space.xs }}>
      {items.filter(([v]) => !!v).map(([v]) => (
        <Text key={v} style={{ ...TABULAR, fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{v}</Text>
      ))}
    </View>
  );
}

/* ── THE LEDGERS ─────────────────────────────────────────────────────────── */

/** The gym half's remaining figures, in core's reading order — and without the
 *  tonnage already set above them. */
function gymLedger(recap: WeeklyRecap, t: (k: string) => string) {
  const rows: { label: string; value: string }[] = [];
  if (recap.sets > 0) rows.push({ label: t("summary.sets"), value: String(recap.sets) });
  if (recap.lifts > 0) rows.push({ label: t("histview.liftsLbl"), value: String(recap.lifts) });
  if (recap.topMuscle) {
    rows.push({ label: t("summary.slide.muscle"), value: MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle });
  }
  return rows;
}

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

/** One discipline or sport: its own mark, its name, and what it was — the
 *  ground it covered where it covered any, and the time it took. */
function SliceRow({ slice, first }: { slice: EnduranceSlice; first?: boolean }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const name = slice.labelKey ? t(slice.labelKey) : (slice.label ?? "");
  const dist = slice.distanceKm > 0 ? `${groupDistanceDisplay(slice.distanceKm, slice.unit)} ${slice.unit}` : null;
  // A pace only where the ground was covered in ONE named discipline — a sport
  // has no pace anybody quotes, and a slice with no distance has none at all.
  const pace = slice.kind === "endurance" && slice.distanceKm > 0 && slice.minutes > 0
    ? paceStr((slice.minutes * 60) / slice.distanceKm)
    : null;
  return (
    <View
      accessible
      accessibilityLabel={[name, dist, clock(slice.minutes), pace].filter(Boolean).join(", ")}
      style={{
        flexDirection: "row", alignItems: "center", gap: space.md,
        paddingVertical: space.ms,
        borderTopWidth: first ? 0 : 1, borderTopColor: C.line,
      }}
    >
      <Mark mark={slice.mark} size={fs.subtitle} color={sliceColor(C, slice)} />
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{name}</Text>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ ...TABULAR, fontFamily: F.monoMed, fontSize: fs.body, color: C.chalk }}>{dist ?? clock(slice.minutes)}</Text>
        {(dist || pace) && (
          <Text style={{ ...TABULAR, fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: LABEL_GAP }}>
            {[dist ? clock(slice.minutes) : null, pace].filter(Boolean).join("   ")}
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
  return `${raw > 0 ? "+" : "−"}${clock(Math.abs(Math.round(raw)))}`;
}

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
 * The week as the branded card — and it carries BOTH halves, for the same
 * reason the screen does. A hybrid athlete's week posted as three lifting
 * figures is a post about somebody else's training.
 *
 * The clock leads because it is the figure both halves paid into; the two
 * halves' own figures follow, and a half with nothing in it takes no slot.
 */
function sharePage(
  recap: WeeklyRecap,
  split: { gym: GymWindow; endurance: EnduranceWindow },
  tag: string,
  units: WeightUnit,
  t: (k: string) => string,
): WeekSharePage {
  const stats = [
    { label: t("w.home.week.lHours"), value: clock(recap.minutes) },
    split.gym.totals.tonnage > 0 ? { label: t("summary.volumeMoved"), value: fmtTonnage(split.gym.totals.tonnage, units) } : null,
    split.endurance.totals.distanceKm > 0
      ? { label: t("w.analyze.stats.distance"), value: fmtKm(split.endurance.totals.distanceKm) }
      : split.endurance.totals.minutes > 0
        ? { label: t("recap.enduranceSport"), value: clock(split.endurance.totals.minutes) }
        : null,
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
