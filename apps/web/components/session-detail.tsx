"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useLang } from "@/lib/i18n";
import { shareWorkoutStory, type ShareStats } from "@/lib/workout-share";
import { fs, space,
  INK2,
  LINE, LINE_HEX,
  LIME, LIME_HEX,
  CHALK,
  ASH,
  BLUE,
  AMBER,
  RED,
  Button,
  disp,
  mono,
  tip,
  Mono,
  Card,
  Stat,
  ChartFrame,
  txt,
  ON_ACCENT,
} from "@/lib/ui";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useIsMobile } from "@/lib/use-media-query";
import { fmtWeight, fmtTonnage, displayLoad, kgToUnit, sessionCelebration, statCountUp, type WeightUnit, type PrHit } from "@hybrid/core";
import {
  sessionVolume,
  blockBestE1rm,
  prsForSession,
  volumeByMuscle,
  e1rmSeries,
  blockSummary,
  supersetLabels,
  setType,
  setTypeBadge,
  paceSeries,
  headlineRunMove,
  paceClock,
  formatCardioPr,
  cardioPrsForSession,
  sessionShape,
  sessionCardioTotals,
  formatSportDistance,
  type CardioPrHit,
  type LoggedSession,
} from "@hybrid/core";

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

const MUSCLE_LABEL: Record<string, string> = {
  quads: "Quads",
  glutes: "Glutes",
  posterior: "Posterior chain",
  back: "Back",
  chest: "Chest",
  shoulders: "Shoulders",
  triceps: "Triceps",
};

// A number that ticks up from 0 → its final value on mount, then rests on the
// EXACT original string (so a count-up never leaves a rounded number behind).
// Honours reduced-motion by skipping straight to the value. Mirrors the mobile
// CountUpText in lib/share.tsx and the summary CountUp — same statCountUp core.
function SessionCountUp({ value }: { value: string }) {
  const [disp, setDisp] = useState(value);
  useEffect(() => {
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisp(value);
      return;
    }
    const { target, format } = statCountUp(value);
    if (!target) {
      setDisp(value);
      return;
    }
    let raf = 0;
    let t0 = 0;
    const dur = 900;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        setDisp(format(target * eased));
        raf = requestAnimationFrame(tick);
      } else {
        setDisp(value);
      }
    };
    setDisp(format(0));
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{disp}</>;
}

/**
 * PR REVEAL — the personal-best hero on the individual-workout page. When a
 * session set a record, ONE headline record lands with a spring + a lime sweep
 * and a count-up (chosen by the shared `sessionCelebration` so web and mobile
 * agree), with "Share your win" as the payoff. Renders nothing when the session
 * set no records — the page falls back to its normal stats.
 */
function PrReveal({
  prs,
  cardioPrs,
  units,
  t,
  onShare,
  sharing,
  shareMsg,
}: {
  prs: PrHit[];
  cardioPrs: CardioPrHit[];
  units: WeightUnit;
  t: (k: string) => string;
  onShare: () => void;
  sharing: boolean;
  shareMsg: string;
}) {
  const cel = sessionCelebration(prs, cardioPrs);
  if (!cel) return null;

  const big =
    cel.kind === "strength"
      ? fmtWeight(cel.e1rm, units)
      : cel.prKind === "distance"
        ? formatSportDistance(cel.value, cel.move)
        : `${paceClock(cel.value)} /km`;
  const name = cel.kind === "strength" ? cel.lift : cel.move;
  const sub = cel.firstEver
    ? t("summary.firstEver")
    : cel.kind === "strength"
      ? `+${fmtWeight(cel.e1rm - (cel.previous ?? 0), units)}`
      : cel.prKind === "distance"
        ? t("summary.furthestYet")
        : t("summary.fastestYet");
  const kicker = cel.total > 1 ? `${cel.total} ${t("summary.newPrs")}` : t("summary.prOne");

  return (
    <div
      className="win-pop"
      style={{
        position: "relative",
        overflow: "hidden",
        borderRadius: 24,
        padding: space.lg,
        border: `1px solid color-mix(in srgb, ${LIME} 45%, ${LINE})`,
        background: `radial-gradient(130% 130% at 12% 0%, color-mix(in srgb, ${LIME} 15%, transparent), transparent 55%), ${INK2}`,
      }}
    >
      <div
        aria-hidden
        className="pr-sweep"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          width: "42%",
          pointerEvents: "none",
          background: `linear-gradient(105deg, transparent, color-mix(in srgb, ${LIME} 32%, transparent), transparent)`,
          filter: "blur(3px)",
        }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: space.sm }}>
        <span className="pr-trophy" style={{ fontSize: 26, lineHeight: 1 }}>
          🏆
        </span>
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".14em" }} c={LIME}>
          {kicker}
        </Mono>
      </div>
      <div
        className="pr-rise"
        style={{ ...disp, fontWeight: 800, fontSize: 60, letterSpacing: "-.03em", lineHeight: 1, marginTop: space.sm }}
      >
        <SessionCountUp value={big} />
      </div>
      <div
        className="pr-rise"
        style={{ ...disp, fontWeight: 700, fontSize: fs.subtitle, marginTop: 6, animationDelay: ".08s" }}
      >
        {name} <span style={{ color: txt(LIME) }}>— {sub}</span>
      </div>
      <button
        onClick={onShare}
        disabled={sharing}
        style={{
          ...disp,
          marginTop: space.lg,
          width: "100%",
          background: LIME,
          color: ON_ACCENT,
          border: "none",
          borderRadius: 14,
          padding: "15px 18px",
          fontWeight: 800,
          fontSize: fs.body,
          cursor: sharing ? "default" : "pointer",
          opacity: sharing ? 0.6 : 1,
        }}
      >
        {shareMsg || (sharing ? "…" : `↗ ${t("summary.share")}`)}
      </button>
    </div>
  );
}

// ---------- SESSION DETAIL (web parity: PRs, e1RM trend, muscle focus) ----------
export function SessionDetail({
  session,
  all,
  onBack,
  onOpenExercise,
  onArchive,
  onDelete,
  manageBusy,
}: {
  session: LoggedSession;
  all: LoggedSession[];
  onBack: () => void;
  onOpenExercise?: (name: string) => void;
  /** Owner-only manage actions (History passes these; other callers omit them
   *  and the manage row doesn't render). Confirm/error handling stays with the
   *  caller; `manageBusy` disables the row while a request is in flight. */
  onArchive?: () => void;
  onDelete?: () => void;
  manageBusy?: boolean;
}) {
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const isMobile = useIsMobile();
  // Bodyweight-aware tonnage/e1RM — the athlete's weight AT this session's date.
  const bw = useBodyweightLookup();
  const bwHere = bw(session.startedAt);
  const prs = prsForSession(all, session.id, bw);
  const cardioPrs = cardioPrsForSession(all, session.id);
  const prSet = new Set(prs.map((p) => p.lift));
  const ssLabels = supersetLabels(session.blocks);
  const muscles = volumeByMuscle(session.blocks);
  const muscleMax = muscles[0]?.volume || 1;
  const sets = session.blocks.reduce((n, b) => n + (b.kind === "strength" ? b.sets.length : 1), 0);
  const minutes = session.completedAt
    ? Math.max(1, Math.round((Date.parse(session.completedAt) - Date.parse(session.startedAt)) / 60000))
    : null;
  // Sport-adaptive headline: a run/match has no "volume", so cardio sessions read
  // as Duration · Distance · Pace; a lift keeps Minutes · Sets · Volume; a mixed
  // session shows both. (#4 — per-session, sport-specific stats.)
  const shape = sessionShape(session);
  const cardio = sessionCardioTotals(session.blocks);
  const cardioMin = cardio.minutes || minutes || 0;

  // Share this session like a finished workout (P5) — same branded story card.
  const [sharing, setSharing] = useState(false);
  const [shareMsg, setShareMsg] = useState("");
  const share = async () => {
    setSharing(true);
    setShareMsg("");
    const bests = session.blocks
      .flatMap((b) => (b.kind === "strength" ? [{ name: b.name, e1rm: blockBestE1rm(b, bwHere), pr: prSet.has(b.name) }] : []))
      .filter((b) => b.e1rm > 0)
      .sort((a, b) => b.e1rm - a.e1rm)
      .slice(0, 3);
    const stats: ShareStats = {
      title: session.title,
      minutes: minutes ?? cardio.minutes ?? 0,
      sets,
      volume: sessionVolume(session.blocks, false, bwHere),
      bests,
      firstEver: false,
    };
    try {
      const how = await shareWorkoutStory(stats, units, t);
      setShareMsg(how && how !== "cancelled" ? t("w.train.logger.shared") : "");
    } catch {
      setShareMsg("");
    }
    setSharing(false);
  };

  // The session's heaviest lift → its e1RM trend across all history.
  const topLift = session.blocks
    .filter((b) => b.kind === "strength")
    .map((b) => ({ name: b.name, e: blockBestE1rm(b, bwHere) }))
    .sort((a, b) => b.e - a.e)[0]?.name;
  const series = topLift ? e1rmSeries(all, topLift, bw).map((p) => ({ w: fmtDate(p.date), e1rm: Math.round(kgToUnit(p.e1rm, units)) })) : [];

  // The session's headline run → its pace (sec/km) trend across all history.
  const runMove = headlineRunMove(session.blocks);
  const paceData = runMove ? paceSeries(all, runMove).map((p) => ({ w: fmtDate(p.date), pace: p.secPerKm })) : [];

  const prLine = (p: { lift: string; e1rm: number; previous: number | null }) =>
    p.previous == null ? `${p.lift} ${fmtWeight(p.e1rm, units)} (first!)` : `${p.lift} ${fmtWeight(p.e1rm, units)} (+${fmtWeight(p.e1rm - p.previous, units)})`;
  // Distance + pace render in the sport's natural unit (metres for swimming /
  // rowing, km otherwise) — one shared core formatter, see formatCardioPr.
  const cardioPrLine = (p: CardioPrHit) => formatCardioPr(p, "first!");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
      <button
        onClick={onBack}
        style={{ ...mono, fontSize: fs.body, color: txt(ASH), background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0 }}
      >
        ← History
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space.md, flexWrap: "wrap" }}>
        <div>
          <div style={{ ...disp, fontWeight: 800, fontSize: fs.display }}>{session.title}</div>
          <Mono s={{ fontSize: fs.body, display: "block", marginTop: 4 }}>
            {fmtDate(session.startedAt)}
            {typeof session.readiness === "number" ? ` – readiness ${session.readiness}` : ""}
          </Mono>
        </div>
        {/* Share this session — same branded story card as the finished workout. */}
        <button
          onClick={share}
          disabled={sharing}
          style={{ ...mono, fontSize: fs.caption, fontWeight: 700, color: txt(LIME), background: `color-mix(in srgb, ${LIME} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${LIME} 45%, transparent)`, borderRadius: 999, padding: "9px 18px", cursor: sharing ? "default" : "pointer", opacity: sharing ? 0.6 : 1, whiteSpace: "nowrap" }}
        >
          {shareMsg || (sharing ? "…" : `↗ ${t("w.train.logger.share")}`)}
        </button>
      </div>

      {shape === "cardio" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 100px), 1fr))", gap: space.lg }}>
          <Stat label="Duration" value={cardioMin ? `${cardioMin} min` : "—"} />
          <Stat label="Distance" value={cardio.distanceKm > 0 ? formatSportDistance(cardio.distanceKm, headlineRunMove(session.blocks) ?? "") : "—"} c={BLUE} />
          <Stat label="Pace" value={cardio.secPerKm ? `${paceClock(cardio.secPerKm)} /km` : "—"} c={BLUE} />
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 100px), 1fr))", gap: space.lg }}>
          <Stat label="Minutes" value={minutes != null ? minutes : "—"} />
          <Stat label="Sets" value={sets} />
          <Stat label="Volume" value={fmtTonnage(sessionVolume(session.blocks, false, bwHere), units)} c={LIME} />
          {shape === "mixed" && cardio.distanceKm > 0 && <Stat label="Distance" value={formatSportDistance(cardio.distanceKm, headlineRunMove(session.blocks) ?? "")} c={BLUE} />}
        </div>
      )}

      {/* PR reveal — the headline record lands as a hero (spring + sweep +
          count-up), with "Share your win" as the payoff. Below it, the full PR
          list stays for the detail-minded. Renders nothing on a no-PR session. */}
      <PrReveal prs={prs} cardioPrs={cardioPrs} units={units} t={t} onShare={share} sharing={sharing} shareMsg={shareMsg} />

      {prs.length + cardioPrs.length > 1 && (
        <Card style={{ borderColor: LINE }}>
          <div style={{ display: "flex", flexDirection: "column", gap: space.xs }}>
            {prs.map((p) => (
              <Mono key={p.lift} s={{ fontSize: fs.body }} c={CHALK}>
                🏆 {prLine(p)}
              </Mono>
            ))}
            {cardioPrs.map((p) => (
              <Mono key={`${p.move}-${p.kind}`} s={{ fontSize: fs.body }} c={CHALK}>
                🏃 {cardioPrLine(p)}
              </Mono>
            ))}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: !isMobile && series.length > 1 ? "repeat(2, 1fr)" : "1fr", gap: space.lg }}>
        {muscles.length > 0 && (
          <ChartFrame title="Muscle focus" kicker="Tonnage by muscle">
            <div style={{ display: "flex", flexDirection: "column", gap: space.ms }}>
              {muscles.map((m) => (
                <div key={m.muscle}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <Mono s={{ fontSize: fs.body }} c={CHALK}>{MUSCLE_LABEL[m.muscle] ?? m.muscle}</Mono>
                    <Mono s={{ fontSize: fs.caption }}>{fmtWeight(m.volume, units)}</Mono>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: INK2, overflow: "hidden" }}>
                    <div style={{ width: `${Math.max(6, (m.volume / muscleMax) * 100)}%`, height: 8, borderRadius: 4, background: LIME }} />
                  </div>
                </div>
              ))}
            </div>
          </ChartFrame>
        )}

        {series.length > 1 && (
          <ChartFrame title={`${topLift} – e1RM`} kicker="Trend across your logs">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={series}>
                <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
                <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} />
                <YAxis stroke={ASH} style={{ ...mono, fontSize: fs.micro }} domain={["auto", "auto"]} />
                <Tooltip contentStyle={tip} />
                <Line type="monotone" dataKey="e1rm" stroke={LIME_HEX} strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        )}
      </div>

      {paceData.length > 1 && (
        <ChartFrame title={`${runMove} – pace`} kicker="Lower is faster – across your logs">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={paceData}>
              <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
              <XAxis dataKey="w" stroke={ASH} style={{ ...mono, fontSize: fs.micro }} />
              <YAxis
                stroke={ASH}
                style={{ ...mono, fontSize: fs.micro }}
                reversed
                domain={["auto", "auto"]}
                tickFormatter={(v: number) => paceClock(v)}
                width={48}
              />
              <Tooltip contentStyle={tip} formatter={(v) => `${paceClock(Number(v))} /km`} />
              <Line type="monotone" dataKey="pace" name="pace" stroke={BLUE} strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartFrame>
      )}

      {/* Per-exercise breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: space.md }}>
        {session.blocks.map((b, i) => (
          <Card key={i}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ ...disp, fontWeight: 700, fontSize: fs.subtitle }}>
                {prSet.has(b.name) ? "🏆 " : ""}
                {onOpenExercise && b.kind !== "conditioning" ? (
                  <button
                    onClick={() => onOpenExercise(b.name)}
                    style={{ ...disp, fontWeight: 700, fontSize: fs.subtitle, color: txt(LIME), background: "none", border: "none", padding: 0, cursor: "pointer" }}
                    title="Open this exercise's dashboard"
                  >
                    {b.name} ›
                  </button>
                ) : (
                  b.name
                )}
                {ssLabels[i] && <span style={{ ...mono, fontSize: fs.micro, color: txt(LIME), marginLeft: 8 }}>⛓ {ssLabels[i]}</span>}
              </div>
              {b.kind === "strength" && blockBestE1rm(b, bwHere) > 0 && (
                <Mono s={{ fontSize: fs.body }} c={LIME}>{fmtWeight(blockBestE1rm(b, bwHere), units)} e1RM</Mono>
              )}
            </div>
            {b.kind === "strength" ? (
              <div style={{ marginTop: 8 }}>
                {b.sets.map((st, j) => {
                  const sType = setType(st);
                  const sAccent = sType === "warmup" ? AMBER : sType === "cooldown" ? BLUE : sType === "drop" ? LIME : ASH;
                  const sTag = sType === "warmup" ? " – warm-up" : sType === "cooldown" ? " – cool-down" : sType === "drop" ? " – drop" : "";
                  return (
                  <div key={j} style={{ display: "flex", gap: space.lg, padding: "4px 0", borderTop: j ? `1px solid ${LINE}` : undefined }}>
                    <Mono s={{ fontSize: fs.body, width: 22 }} c={sAccent}>{setTypeBadge(st, j)}</Mono>
                    <Mono s={{ fontSize: fs.body, flex: 1 }} c={CHALK}>{st.load ? `${displayLoad(st.load, units)} ${units}` : "–"} × {st.reps || "–"}{sTag}</Mono>
                    {st.rpe ? <Mono s={{ fontSize: fs.body }}>RPE {st.rpe}</Mono> : null}
                    {st.vel ? <Mono s={{ fontSize: fs.body }} c={BLUE}>{st.vel} m/s</Mono> : null}
                  </div>
                  );
                })}
              </div>
            ) : (
              <Mono s={{ fontSize: fs.body, display: "block", marginTop: 8 }}>{blockSummary(b)}</Mono>
            )}
          </Card>
        ))}
      </div>

      {/* Manage this workout — lives here since the classic list (and its swipe
          actions) was retired; only rendered for callers that pass handlers. */}
      {(onArchive || onDelete) && (
        <div style={{ display: "flex", gap: space.sm, justifyContent: "flex-end", borderTop: `1px solid ${LINE}`, paddingTop: 16 }}>
          {onArchive && <Button label={t("w.analyze.hist.archive")} variant="outline" onClick={onArchive} disabled={manageBusy} />}
          {onDelete && <Button label={t("w.analyze.hist.delete")} variant="outline" color={RED} onClick={onDelete} disabled={manageBusy} />}
        </div>
      )}
    </div>
  );
}
