import { useMemo, useRef, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import {
  calendarWeekRecap,
  weekChapters,
  prsForSession,
  dayKeyMs,
  localDayKey,
  fmtTonnage,
  fmtKm,
  fmtWeight,
  kgToUnit,
  formatCardioPr,
  LABEL_GAP,
  type WeeklyRecap,
  type WeightUnit,
} from "@hybrid/core";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useLang, useSessionCount } from "../../lib/i18n";
import { useLoggerPrefs } from "../../lib/logger-prefs";
import { useSessionsQuery } from "../../lib/queries";
import { useTheme, txt } from "../../lib/theme";
import { F, Loading, MAX_FONT_SCALE, fs, space, tracking, ty } from "../../lib/ui";
import { MUSCLE_LABEL, WeekPageShareCard, recapShareText, shareCardImage, type WeekSharePage } from "../../lib/share";
import { ACard, cardStack } from "./kit";
import { HeroAction, HeroScreen } from "./hero";
import { SHARE_MARK } from "./share-mark";
import { Glyph } from "./icons";
import FetchError from "./fetch-error";
import { WeekMarks } from "./week-marks";

// ── THE WEEK SUMMARY ────────────────────────────────────────────────────────
// The session summary's grammar, applied to the week: History's week chapter is
// the INDEX (the range, the seven marks, the sessions under it) and this is the
// REPORT behind it — everything the chapter cannot carry without becoming a
// screen of its own. It replaced the paged "Share your week" recap that used to
// sit on top of the Weeks list: one pager, always the CURRENT week, in front of
// every other week's chapter. A week is a thing you open, not a banner over the
// list of them, and each week now has its own door.
//
// SHARE IS IN THE RAIL'S TRAILING SLOT — the same corner, the same circle, as
// the workout summary's, rather than a pill under the figures.

/** Aug 17 – Aug 23. The screen's title, and the share card's tag. */
const fmtDay = (key: string) => new Date(dayKeyMs(key)).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const rangeLabel = (startKey: string, endKey: string) => `${fmtDay(startKey)} – ${fmtDay(endKey)}`;

const signed = (n: number) => (n >= 0 ? `+${n}` : `${n}`);

/** sec/km → "5:12 /km" for a cardio pace record. */
const paceStr = (secPerKm: number) => `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, "0")} /km`;

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

  const prCount = recap ? recap.prs.length + recap.cardioPrs.length : 0;
  const lime = txt(C, C.lime) as string;

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
      ) : !recap || recap.sessions === 0 ? (
        <ACard style={[cardStack, { alignItems: "center", paddingVertical: 32 }]}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.title, color: C.chalk }}>{t("w.analyze.hist.noSessions")}</Text>
        </ACard>
      ) : (
        <>
          {/* THE SHAPE OF THE WEEK — the same seven marks the chapter draws. */}
          {week && (
            <ACard style={cardStack}>
              <WeekMarks days={week.days} max={maxLoad} />
              {(recap.prevSessions > 0 || recap.prevVolume > 0) && (
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: space.md }}>
                  {`${signed(Math.round(kgToUnit(recap.volumeDelta, units)))} ${units} – ${signed(recap.sessionsDelta)} ${t("w.teams.coach.sessionsWord")} ${t("recap.vsLastWeek")}`}
                </Text>
              )}
            </ACard>
          )}

          {/* THE FIGURES, in core's reading order (figure-order.ts): what was
              moved and the grain it moved in, then how often, then how long,
              then the ground covered. A row with nothing in it doesn't render —
              a cardio week has no tonnage tile rather than a tonnage tile of
              zeros. */}
          {recap.volume > 0 && (
            <StatRow
              stats={[
                { label: t("summary.volumeMoved"), value: fmtTonnage(recap.volume, units) },
                { label: t("summary.sets"), value: String(recap.sets) },
                { label: t("histview.liftsLbl"), value: String(recap.lifts) },
              ]}
            />
          )}
          <StatRow
            stats={[
              { label: t("w.analyze.stats.sessions"), value: String(recap.sessions) },
              { label: t("w.analyze.stats.activeDays"), value: String(recap.activeDays) },
              { label: t("w.analyze.stats.minutes"), value: String(Math.round(recap.minutes)) },
            ]}
          />
          {recap.distanceKm > 0 && (
            <StatRow stats={[{ label: t("w.analyze.stats.distance"), value: fmtKm(recap.distanceKm) }]} />
          )}

          {recap.topMuscle && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: space.md }}>
              {t("recap.top")} {MUSCLE_LABEL[recap.topMuscle.muscle] ?? recap.topMuscle.muscle}
            </Text>
          )}

          {/* WHAT CAME OUT OF IT — last, as the figure order has it. */}
          {prCount > 0 && (
            <ACard style={cardStack}>
              <Text style={ty(C, "kicker", lime)}>{t("recap.pageRecords")}</Text>
              {recap.prs.map((p) => (
                <RecordRow key={p.lift} name={p.lift} value={fmtWeight(p.topLoad, units)} />
              ))}
              {recap.cardioPrs.map((p) => (
                <RecordRow
                  key={`${p.move}-${p.kind}`}
                  name={p.move}
                  value={p.kind === "pace" ? paceStr(p.value) : fmtKm(p.value)}
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

/** A row of figure tiles — a TILE in a row of tiles, so it keeps the compact
 *  inset rather than a full card's. */
function StatRow({ stats }: { stats: { label: string; value: string }[] }) {
  const { palette: C } = useTheme();
  return (
    <View style={[cardStack, { flexDirection: "row", gap: space.sm }]}>
      {stats.map((s) => (
        <ACard key={s.label} style={{ flex: 1, padding: space.lg }}>
          <Text style={ty(C, "kicker")}>{s.label}</Text>
          <Text
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            style={{ fontFamily: F.mono, fontSize: fs.headline, letterSpacing: tracking(fs.headline), color: C.chalk, marginTop: LABEL_GAP }}
          >
            {s.value}
          </Text>
        </ACard>
      ))}
    </View>
  );
}

function RecordRow({ name, value, a11y }: { name: string; value: string; a11y?: string }) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const lime = txt(C, C.lime) as string;
  return (
    <View
      accessible
      accessibilityLabel={a11y ?? `${name} ${value}`}
      style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.sm }}
    >
      <Glyph name="trophy" size={fs.body} color={C.amber} label={t("w.train.logger.newPr")} />
      <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: C.chalk }}>{name}</Text>
      <Text style={{ fontFamily: F.monoBold, fontSize: fs.body, color: lime }}>{value}</Text>
    </View>
  );
}

/**
 * The week as the branded card that leaves the app.
 *
 * Three figures, chosen IN FIGURE ORDER from the ones the week actually has —
 * a card that prints "0 t" for a running week is a worse advert for the week
 * than one that prints the distance instead.
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
