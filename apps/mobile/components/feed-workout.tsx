import { View, Text } from "react-native";
import {
  FEED_STAT_LABEL_KEY,
  feedDeltaText,
  feedFigureText,
  feedStatText,
  feedWorkoutView,
  setCountKey,
  colors,
  type FeedPrLine,
  type FeedStat,
  type FeedWorkoutExercise,
  type FeedWorkoutSet,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import { F, fs, leading, serifIf, tracking } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { WatchGlyph } from "./feed-card";

/**
 * THE WORKOUT, IN FULL (mobile) — twin of apps/web/components/feed-workout.tsx.
 *
 * A feed row shows two or three top sets on purpose; the stream is a stream.
 * The POST (app/post.tsx) shows THIS: every figure the session can honestly
 * produce — minutes, tonnage, sets, reps, distance, pace — then the records it
 * set, then every exercise and every set, built by core's `feedWorkoutView` so
 * both clients read one computation and the ledger can't drift between them.
 *
 * The figures are device-true (the view model reads through `deviceTrueSession`
 * and derives pace from the device's own seconds), and the stat row EXTENDS the
 * card's — so the post can never contradict the row it was opened from.
 */

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** The set-type tag beside a set. A working set says nothing — it's the norm,
 *  and labelling it would put a word on every line. */
function setTag(type: FeedWorkoutSet["type"]): { key: string; tone: string } | null {
  if (type === "warmup") return { key: "feed.session.warmup", tone: colors.amber };
  if (type === "cooldown") return { key: "feed.session.cooldown", tone: colors.blue };
  if (type === "drop") return { key: "feed.session.drop", tone: colors.lime };
  return null;
}

/** The session's figures — a WRAPPING grid, because the post carries the whole
 *  set rather than the card's single row of three. */
export function StatGrid({ stats, units }: { stats: FeedStat[]; units: WeightUnit }) {
  const C = useTheme().palette;
  // `lang`, not the device's locale: without it the tonnage groups its digits
  // against the handset, so 5360 reads "5.360" under an English interface.
  const { t, lang } = useLang();
  if (!stats.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 10, borderTopWidth: 1, borderTopColor: C.line, marginTop: 10, paddingTop: 10 }}>
      {stats.map((s) => (
        <View key={s.key} style={{ width: "33.33%", minWidth: 0, paddingRight: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {s.device ? <WatchGlyph color={C.ash} /> : null}
            <Text style={{ fontFamily: F.mono, fontSize: fs.note, fontWeight: "600", color: s.key === "hr" ? txt(C, colors.blue) : C.chalk }}>{feedStatText(s, units, lang)}</Text>
          </View>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash, marginTop: 2 }}>{t(FEED_STAT_LABEL_KEY[s.key]).toUpperCase()}</Text>
        </View>
      ))}
    </View>
  );
}

/**
 * THE RECORDS, one after another.
 *
 * Every record the session set gets its own line with its own evidence — the
 * weight, the estimate behind it, and what the athlete's own previous best was.
 * A session that set three used to post a card naming only the heaviest and
 * counting the rest.
 */
export function PostRecords({ prs, units }: { prs: FeedPrLine[]; units: WeightUnit }) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  if (!prs.length) return null;
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.note, color: C.chalk }}>{t("feed.post.records")}</Text>
      {prs.map((pr, i) => {
        const fig = feedFigureText(pr.topLoadKg, units);
        const prev = pr.previousTopLoadKg != null ? feedFigureText(pr.previousTopLoadKg, units) : null;
        const e1 = pr.e1rmKg != null ? feedFigureText(pr.e1rmKg, units) : null;
        // The second line is the EVIDENCE: what it beat, and the estimate
        // behind the bar weight. A first-ever has nothing to beat and says so.
        // A spaced en dash joins them — never a middot.
        const proof = [
          pr.firstEver ? t("feed.firstEver") : prev ? t("feed.post.previousBest").replace("{v}", `${prev.value} ${prev.unit}`) : null,
          e1 ? t("feed.e1rm").replace("{v}", `${e1.value} ${e1.unit}`) : null,
        ].filter(Boolean).join(" – ");
        return (
          <View key={`${pr.lift}-${i}`} style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, borderTopWidth: 1, borderTopColor: C.line, marginTop: 8, paddingTop: 8 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{pr.lift}</Text>
              {proof ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{proof}</Text> : null}
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: fs.title, color: C.chalk }}>
                {fig.value}
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{` ${fig.unit}`}</Text>
              </Text>
              {pr.deltaPct != null ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, colors.lime) }}>{feedDeltaText(pr.deltaPct)}</Text> : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Exercise({ ex, units }: { ex: FeedWorkoutExercise; units: WeightUnit }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const top = ex.topLoadKg != null ? feedFigureText(ex.topLoadKg, units) : null;
  // The exercise's own figures — what a training log shows beside a lift and a
  // feed card has never had room for. A spaced en dash joins them.
  const vol = ex.volumeKg > 0 ? feedFigureText(ex.volumeKg, units) : null;
  const meta = [
    ex.setCount > 0 ? t(setCountKey(ex.setCount)).replace("{n}", String(ex.setCount)) : null,
    ex.reps > 0 ? `${ex.reps} ${t("feed.stat.reps")}` : null,
    vol ? `${vol.value} ${vol.unit}` : null,
    ex.distanceKm != null ? `${ex.distanceKm} ${t("feed.stat.distance")}` : null,
    ex.minutes != null ? `${Math.round(ex.minutes)} ${t("feed.stat.min")}` : null,
    ex.pace,
  ].filter(Boolean).join(" – ");

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>
          {ex.name}
          {ex.superset ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, colors.lime) }}>{`  ${ex.superset}`}</Text> : null}
        </Text>
        {top ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{`${top.value} ${top.unit}`}</Text> : null}
      </View>
      {meta ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 2 }}>{meta}</Text> : null}

      {ex.sets.length > 0 ? (
        <View style={{ marginTop: 6 }}>
          {ex.sets.map((s, i) => {
            const tag = setTag(s.type);
            const load = s.loadKg != null ? feedFigureText(s.loadKg, units) : null;
            return (
              <View key={i} style={{ flexDirection: "row", alignItems: "baseline", gap: 12, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, width: 20, color: tag ? txt(C, tag.tone) : C.ash }}>{s.badge}</Text>
                <Text style={{ flex: 1, fontFamily: F.mono, fontSize: fs.body, color: C.chalk }}>
                  {load ? `${load.value} ${load.unit}` : "–"} × {s.reps || "–"}
                  {tag ? <Text style={{ fontFamily: F.reg, color: C.ash }}>{` – ${t(tag.key)}`}</Text> : null}
                </Text>
                {s.rpe ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>RPE {s.rpe}</Text> : null}
                {s.velocity ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, colors.blue) }}>{s.velocity} m/s</Text> : null}
              </View>
            );
          })}
        </View>
      ) : (
        // A run or a metcon has no set ledger — it reads as the one line it
        // reads as everywhere else in the app (core blockSummary).
        <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash, marginTop: 6 }}>{ex.summary}</Text>
      )}
    </View>
  );
}

export function FeedWorkout({ session, units, prs = [] }: { session: LoggedSession; units: WeightUnit; prs?: FeedPrLine[] }) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const w = feedWorkoutView(session, prs);
  // A spaced en dash joins the meta line — never a middot.
  const meta = [
    fmtDate(w.startedAt),
    t("feed.session.exercises").replace("{n}", String(w.exerciseCount)),
    ...(w.setCount > 0 ? [t(setCountKey(w.setCount)).replace("{n}", String(w.setCount))] : []),
  ].join(" – ");
  return (
    <View>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, lineHeight: leading(fs.title, "snug"), color: C.chalk }}>{w.title}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4 }}>{meta}</Text>

      <StatGrid stats={w.stats} units={units} />
      <PostRecords prs={w.prs} units={units} />

      <View style={{ marginTop: 10 }}>
        {w.exercises.map((ex, i) => <Exercise key={`${ex.name}-${i}`} ex={ex} units={units} />)}
      </View>
    </View>
  );
}

export default FeedWorkout;
