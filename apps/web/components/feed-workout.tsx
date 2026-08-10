"use client";

import {
  FEED_STAT_LABEL_KEY,
  feedDeltaText,
  feedFigureText,
  feedStatText,
  feedWorkoutView,
  setCountKey,
  fs,
  leading,
  tracking,
  type FeedPrLine,
  type FeedStat,
  type FeedWorkoutExercise,
  type FeedWorkoutSet,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { accentText } from "@/lib/ui";
import { C } from "./social-ui";
import { WatchGlyph } from "./feed-card";

/**
 * THE WORKOUT, IN FULL (web) — twin of apps/mobile/components/feed-workout.tsx.
 *
 * A feed row shows two or three top sets on purpose; the stream is a stream.
 * The POST (feed-post.tsx) shows THIS: every figure the session can honestly
 * produce — minutes, tonnage, sets, reps, distance, pace — then the records it
 * set, then every exercise and every set, built by core's `feedWorkoutView` so
 * both clients read one computation and the ledger can't drift between them.
 *
 * The figures are device-true (the view model reads through `deviceTrueSession`
 * and derives pace from the device's own seconds), and the stat row EXTENDS the
 * card's — so the post can never contradict the row it was opened from.
 */

const mono = "var(--font-mono)";
const display = "var(--font-display)";
const heading = "var(--font-heading)";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** The set-type tag beside a set, and its accent. A working set says nothing —
 *  it's the norm, and labelling it would put a word on every line. */
function setTag(type: FeedWorkoutSet["type"]): { key: string; accent: string } | null {
  if (type === "warmup") return { key: "feed.session.warmup", accent: accentText("amber") };
  if (type === "cooldown") return { key: "feed.session.cooldown", accent: accentText("blue") };
  if (type === "drop") return { key: "feed.session.drop", accent: accentText("lime") };
  return null;
}

/** The session's figures, wrapping — the post carries the whole set, so this is
 *  a grid rather than the card's single row of three. */
export function StatGrid({ stats, units }: { stats: FeedStat[]; units: WeightUnit }) {
  // `lang`, not the device's locale: without it the tonnage groups its digits
  // against the handset, so 5360 reads "5.360" under an English interface.
  const { t, lang } = useLang();
  if (!stats.length) return null;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(72px, 1fr))", gap: 12, borderTop: `1px solid ${C("line")}`, marginTop: 10, paddingTop: 10 }}>
      {stats.map((s) => (
        <div key={s.key} style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: fs.note, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: s.key === "hr" ? accentText("blue") : C("chalk") }}>
            {s.device && <WatchGlyph />}
            {feedStatText(s, units, lang)}
          </div>
          <div style={{ fontFamily: mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash"), marginTop: 2 }}>
            {t(FEED_STAT_LABEL_KEY[s.key])}
          </div>
        </div>
      ))}
    </div>
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
  const { t } = useLang();
  if (!prs.length) return null;
  const lime = accentText("lime");
  return (
    <section style={{ marginTop: 12 }}>
      <h3 style={{ fontFamily: heading, fontWeight: 800, fontSize: fs.note, color: C("chalk"), margin: 0 }}>{t("feed.post.records")}</h3>
      {prs.map((pr, i) => {
        const fig = feedFigureText(pr.topLoadKg, units);
        const prev = pr.previousTopLoadKg != null ? feedFigureText(pr.previousTopLoadKg, units) : null;
        const e1 = pr.e1rmKg != null ? feedFigureText(pr.e1rmKg, units) : null;
        // The second line is the EVIDENCE: what it beat, and the estimate
        // behind the bar weight. A first-ever has nothing to beat and says so.
        const proof = [
          pr.firstEver ? t("feed.firstEver") : prev ? t("feed.post.previousBest").replace("{v}", `${prev.value} ${prev.unit}`) : null,
          e1 ? t("feed.e1rm").replace("{v}", `${e1.value} ${e1.unit}`) : null,
        ].filter(Boolean) as string[];
        return (
          <div key={`${pr.lift}-${i}`} style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, borderTop: `1px solid ${C("line")}`, marginTop: 8, paddingTop: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: fs.note, color: C("chalk") }}>{pr.lift}</div>
              {/* A spaced en dash joins the proof line — never a middot. */}
              {proof.length > 0 && <div style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash"), marginTop: 2 }}>{proof.join(" – ")}</div>}
            </div>
            <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
              <span style={{ fontFamily: mono, fontSize: fs.title, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: C("chalk") }}>{fig.value}</span>
              <span style={{ fontFamily: mono, fontSize: fs.micro, color: C("ash") }}> {fig.unit}</span>
              {pr.deltaPct != null && (
                <div style={{ fontFamily: mono, fontSize: fs.micro, fontWeight: 600, color: lime }}>{feedDeltaText(pr.deltaPct)}</div>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}

function Exercise({ ex, units }: { ex: FeedWorkoutExercise; units: WeightUnit }) {
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
  ].filter(Boolean) as string[];

  return (
    <div style={{ borderTop: `1px solid ${C("line")}`, padding: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontFamily: display, fontWeight: 700, fontSize: fs.note, color: C("chalk"), minWidth: 0 }}>
          {ex.name}
          {ex.superset && <span style={{ fontFamily: mono, fontSize: fs.nano, color: accentText("lime"), marginLeft: 8 }}>{ex.superset}</span>}
        </div>
        {top && (
          <span style={{ fontFamily: mono, fontSize: fs.micro, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: C("ash"), whiteSpace: "nowrap" }}>
            {top.value} {top.unit}
          </span>
        )}
      </div>
      {meta.length > 0 && <div style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash"), marginTop: 2 }}>{meta.join(" – ")}</div>}

      {ex.sets.length > 0 ? (
        <div style={{ marginTop: 6 }}>
          {ex.sets.map((s, i) => {
            const tag = setTag(s.type);
            const load = s.loadKg != null ? feedFigureText(s.loadKg, units) : null;
            return (
              <div key={i} style={{ display: "flex", alignItems: "baseline", gap: 12, padding: "4px 0" }}>
                <span style={{ fontFamily: mono, fontSize: fs.micro, fontWeight: 600, width: 20, color: tag ? tag.accent : C("ash") }}>{s.badge}</span>
                <span style={{ flex: 1, fontFamily: mono, fontSize: fs.body, fontVariantNumeric: "tabular-nums", color: C("chalk") }}>
                  {load ? `${load.value} ${load.unit}` : "–"} × {s.reps || "–"}
                  {tag && <span style={{ color: C("ash"), fontFamily: display }}>{` – ${t(tag.key)}`}</span>}
                </span>
                {s.rpe && <span style={{ fontFamily: mono, fontSize: fs.micro, color: C("ash") }}>RPE {s.rpe}</span>}
                {s.velocity && <span style={{ fontFamily: mono, fontSize: fs.micro, color: accentText("blue") }}>{s.velocity} m/s</span>}
              </div>
            );
          })}
        </div>
      ) : (
        // A run or a metcon has no set ledger — it reads as the one line it
        // reads as everywhere else in the app (core blockSummary).
        <div style={{ fontFamily: mono, fontSize: fs.body, color: C("ash"), marginTop: 6 }}>{ex.summary}</div>
      )}
    </div>
  );
}

export function FeedWorkout({ session, units, prs = [] }: { session: LoggedSession; units: WeightUnit; prs?: FeedPrLine[] }) {
  const { t } = useLang();
  const w = feedWorkoutView(session, prs);
  const meta = [
    fmtDate(w.startedAt),
    t("feed.session.exercises").replace("{n}", String(w.exerciseCount)),
    ...(w.setCount > 0 ? [t(setCountKey(w.setCount)).replace("{n}", String(w.setCount))] : []),
  ];
  return (
    <div>
      <div style={{ fontFamily: heading, fontWeight: 800, fontSize: fs.title, lineHeight: `${leading(fs.title, "snug")}px`, color: C("chalk") }}>{w.title}</div>
      {/* A spaced en dash joins the meta line — never a middot. */}
      <div style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash"), marginTop: 4 }}>{meta.join(" – ")}</div>

      <StatGrid stats={w.stats} units={units} />
      <PostRecords prs={w.prs} units={units} />

      <div style={{ marginTop: 10 }}>
        {w.exercises.map((ex, i) => <Exercise key={`${ex.name}-${i}`} ex={ex} units={units} />)}
      </div>
    </div>
  );
}
