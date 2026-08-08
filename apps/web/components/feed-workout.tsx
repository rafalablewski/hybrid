"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  FEED_STAT_LABEL_KEY,
  feedFigureText,
  feedStatText,
  feedWorkoutView,
  fs,
  leading,
  tracking,
  type FeedItemView,
  type FeedSessionResponse,
  type FeedWorkoutExercise,
  type FeedWorkoutView,
  type LoggedSession,
  type WeightUnit,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { accentText } from "@/lib/ui";
import Sheet from "@/components/aurora/sheet";
import { C, Avatar, EmptyState, jget } from "./social-ui";
import { WatchGlyph } from "./feed-card";

/**
 * THE OPENED POST (web) — twin of apps/mobile/components/feed-workout.tsx.
 *
 * A feed row shows two or three top sets on purpose; the stream is a stream.
 * Tapping the row opens THIS: the whole workout, every exercise and every set,
 * built by core's `feedWorkoutView` so both clients read one computation and
 * the ledger can't drift between them.
 *
 * The session arrives from /api/social/session/[id], which applies the same
 * privacy gate as the rest of social — a workout the viewer may not see never
 * reaches this component, and the private post-workout note never travels at
 * all. The figures are device-true (the view model reads through
 * `deviceTrueSession`), so the opened post agrees with the row it came from.
 */

const mono = "var(--font-mono)";
const display = "var(--font-display)";
const heading = "var(--font-heading)";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

/** The set-type tag beside a set, and its accent. A working set says nothing —
 *  it's the norm, and labelling it would put a word on every line. */
function setTag(type: FeedWorkoutView["exercises"][number]["sets"][number]["type"]): { key: string; accent: string } | null {
  if (type === "warmup") return { key: "feed.session.warmup", accent: accentText("amber") };
  if (type === "cooldown") return { key: "feed.session.cooldown", accent: accentText("blue") };
  if (type === "drop") return { key: "feed.session.drop", accent: accentText("lime") };
  return null;
}

function Exercise({ ex, units }: { ex: FeedWorkoutExercise; units: WeightUnit }) {
  const { t } = useLang();
  const top = ex.topLoadKg != null ? feedFigureText(ex.topLoadKg, units) : null;
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

export function FeedWorkout({ session, units }: { session: LoggedSession; units: WeightUnit }) {
  const { t } = useLang();
  const w = feedWorkoutView(session);
  const meta = [
    fmtDate(w.startedAt),
    t("feed.session.exercises").replace("{n}", String(w.exerciseCount)),
    ...(w.setCount > 0 ? [t("feed.session.sets").replace("{n}", String(w.setCount))] : []),
  ];
  return (
    <div>
      <div style={{ fontFamily: heading, fontWeight: 800, fontSize: fs.title, lineHeight: `${leading(fs.title, "snug")}px`, color: C("chalk") }}>{w.title}</div>
      {/* A spaced en dash joins the meta line — never a middot. */}
      <div style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash"), marginTop: 4 }}>{meta.join(" – ")}</div>

      {/* The card's OWN stat row, recomputed from the same core function, so
          the opened post can never contradict the row it came from. */}
      {w.stats.length > 0 && (
        <div style={{ display: "flex", borderTop: `1px solid ${C("line")}`, marginTop: 10, paddingTop: 10 }}>
          {w.stats.map((s) => (
            <div key={s.key} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, fontFamily: mono, fontSize: fs.note, fontWeight: 600, fontVariantNumeric: "tabular-nums", color: s.key === "hr" ? accentText("blue") : C("chalk") }}>
                {s.device && <WatchGlyph />}
                {feedStatText(s, units)}
              </div>
              <div style={{ fontFamily: mono, fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash"), marginTop: 2 }}>
                {t(FEED_STAT_LABEL_KEY[s.key])}
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        {w.exercises.map((ex, i) => <Exercise key={`${ex.name}-${i}`} ex={ex} units={units} />)}
      </div>
    </div>
  );
}

/** The post, opened: who trained, then their whole workout, then the thread
 *  (passed in as `children`, so the feed owns comments in one place). */
export default function FeedWorkoutSheet({
  item,
  units,
  open,
  onClose,
  children,
}: {
  item: FeedItemView | null;
  units: WeightUnit;
  open: boolean;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { t } = useLang();
  const [session, setSession] = useState<LoggedSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The panel outlives the close by one animation, so it keeps rendering the
  // post it was showing — clearing on close would empty the sheet mid-slide.
  const [shown, setShown] = useState<FeedItemView | null>(item);
  useEffect(() => { if (item) setShown(item); }, [item]);
  const id = item?.subjectId ?? null;

  useEffect(() => {
    if (!open || !id) return;
    let live = true;
    setSession(null);
    setError(null);
    jget<FeedSessionResponse>(`/api/social/session/${id}`)
      .then((r) => {
        if (!live) return;
        if (r.session) setSession(r.session);
        else setError(r.error === "private" ? t("feed.session.private") : t("feed.session.missing"));
      })
      .catch(() => live && setError(t("feed.session.missing")));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);

  return (
    <Sheet open={open} onClose={onClose} label={t("feed.open")} detents={["medium", "large"]}>
      {shown && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <Avatar url={shown.author.avatarUrl} name={shown.author.displayName} handle={shown.author.handle} size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: display, fontWeight: 700, fontSize: fs.note, color: C("chalk"), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shown.author.displayName || (shown.author.handle ? `@${shown.author.handle}` : t("w.social.you"))}
              </div>
              <div style={{ fontFamily: mono, fontSize: fs.nano, color: C("ash") }}>{shown.when}</div>
            </div>
          </div>

          {shown.body && <p style={{ color: C("ash"), fontSize: fs.body, lineHeight: `${leading(fs.body)}px`, margin: "0 0 12px" }}>{shown.body}</p>}

          {session ? (
            <FeedWorkout session={session} units={units} />
          ) : error ? (
            <EmptyState title={error} />
          ) : (
            <EmptyState title={t("common.loading")} />
          )}

          {children}
        </>
      )}
    </Sheet>
  );
}
