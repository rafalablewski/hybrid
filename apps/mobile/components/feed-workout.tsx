import { useEffect, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import {
  FEED_STAT_LABEL_KEY,
  feedFigureText,
  feedStatText,
  feedWorkoutView,
  colors,
  type FeedItemView,
  type FeedWorkoutExercise,
  type FeedWorkoutSet,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import { F, fs, leading, serifIf, tracking, Loading } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { getFeedSession } from "../lib/social-api";
import Sheet from "./aurora/sheet";
import { Avatar, Empty } from "./social-kit";
import { WatchGlyph } from "./feed-card";

/**
 * THE OPENED POST (mobile) — twin of apps/web/components/feed-workout.tsx.
 *
 * A feed row shows two or three top sets on purpose; the stream is a stream.
 * Tapping the row opens THIS: the whole workout, every exercise and every set,
 * built by core's `feedWorkoutView` so both clients read one computation and
 * the ledger can't drift between them.
 *
 * The session arrives from /api/social/session/[id], behind the same privacy
 * gate as the rest of social (a workout the viewer may not see never reaches
 * the client, and the private post-workout note never travels at all), and the
 * figures are device-true — so the opened post agrees with the row it came from.
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

function Exercise({ ex, units }: { ex: FeedWorkoutExercise; units: WeightUnit }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const top = ex.topLoadKg != null ? feedFigureText(ex.topLoadKg, units) : null;
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>
          {ex.name}
          {ex.superset ? <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: txt(C, colors.lime) }}>{`  ${ex.superset}`}</Text> : null}
        </Text>
        {top ? <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{`${top.value} ${top.unit}`}</Text> : null}
      </View>

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

export function FeedWorkout({ session, units }: { session: LoggedSession; units: WeightUnit }) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const w = feedWorkoutView(session);
  // A spaced en dash joins the meta line — never a middot.
  const meta = [
    fmtDate(w.startedAt),
    t("feed.session.exercises").replace("{n}", String(w.exerciseCount)),
    ...(w.setCount > 0 ? [t("feed.session.sets").replace("{n}", String(w.setCount))] : []),
  ].join(" – ");
  return (
    <View>
      <Text style={{ fontFamily: serifIf(scheme, F.black), fontSize: fs.title, lineHeight: leading(fs.title, "snug"), color: C.chalk }}>{w.title}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 4 }}>{meta}</Text>

      {/* The card's OWN stat row, recomputed from the same core function, so
          the opened post can never contradict the row it came from. */}
      {w.stats.length > 0 ? (
        <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: C.line, marginTop: 10, paddingTop: 10 }}>
          {w.stats.map((s) => (
            <View key={s.key} style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                {s.device ? <WatchGlyph color={C.ash} /> : null}
                <Text style={{ fontFamily: F.mono, fontSize: fs.note, fontWeight: "600", color: s.key === "hr" ? txt(C, colors.blue) : C.chalk }}>{feedStatText(s, units)}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash, marginTop: 2 }}>{t(FEED_STAT_LABEL_KEY[s.key]).toUpperCase()}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ marginTop: 10 }}>
        {w.exercises.map((ex, i) => <Exercise key={`${ex.name}-${i}`} ex={ex} units={units} />)}
      </View>
    </View>
  );
}

/** The post, opened: who trained, then their whole workout, then the thread
 *  (passed in as `children`, so the feed owns comments in one place). */
export default function FeedWorkoutSheet({
  item,
  units,
  visible,
  onClose,
  children,
}: {
  item: FeedItemView | null;
  units: WeightUnit;
  visible: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const C = useTheme().palette;
  const { t } = useLang();
  const [session, setSession] = useState<LoggedSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The panel outlives the close by one animation, so it keeps rendering the
  // post it was showing — clearing on close would empty the sheet mid-slide.
  const [shown, setShown] = useState<FeedItemView | null>(item);
  useEffect(() => { if (item) setShown(item); }, [item]);
  const id = item?.subjectId ?? null;

  useEffect(() => {
    if (!visible || !id) return;
    let alive = true;
    setSession(null);
    setError(null);
    getFeedSession(id).then((r) => {
      if (!alive) return;
      if (r.session) setSession(r.session);
      else setError(r.error === "private" ? t("feed.session.private") : t("feed.session.missing"));
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, id]);

  return (
    <Sheet visible={visible} onClose={onClose} detents={["medium", "large"]}>
      {shown ? (
        <View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Avatar url={shown.author.avatarUrl} name={shown.author.displayName} handle={shown.author.handle} size={36} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>
                {shown.author.displayName || (shown.author.handle ? `@${shown.author.handle}` : t("w.social.you"))}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{shown.when}</Text>
            </View>
          </View>

          {shown.body ? <Text style={{ fontFamily: F.reg, color: C.ash, fontSize: fs.body, lineHeight: leading(fs.body), marginBottom: 12 }}>{shown.body}</Text> : null}

          {session ? <FeedWorkout session={session} units={units} /> : error ? <Empty title={error} /> : <Loading />}

          {children}
        </View>
      ) : null}
    </Sheet>
  );
}
