"use client";

import { useState } from "react";
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
  disp,
  mono,
  tip,
  Mono,
  Card,
  Stat,
  ChartFrame,
  txt,
} from "@/lib/ui";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useIsMobile } from "@/lib/use-media-query";
import { fmtWeight, fmtTonnage, displayLoad, kgToUnit } from "@hybrid/core";
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

// ---------- SESSION DETAIL (web parity: PRs, e1RM trend, muscle focus) ----------
export function SessionDetail({
  session,
  all,
  onBack,
  onOpenExercise,
}: {
  session: LoggedSession;
  all: LoggedSession[];
  onBack: () => void;
  onOpenExercise?: (name: string) => void;
}) {
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const isMobile = useIsMobile();
  const prs = prsForSession(all, session.id);
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
      .flatMap((b) => (b.kind === "strength" ? [{ name: b.name, e1rm: blockBestE1rm(b), pr: prSet.has(b.name) }] : []))
      .filter((b) => b.e1rm > 0)
      .sort((a, b) => b.e1rm - a.e1rm)
      .slice(0, 3);
    const stats: ShareStats = {
      title: session.title,
      minutes: minutes ?? cardio.minutes ?? 0,
      sets,
      volume: sessionVolume(session.blocks),
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
    .map((b) => ({ name: b.name, e: blockBestE1rm(b) }))
    .sort((a, b) => b.e - a.e)[0]?.name;
  const series = topLift ? e1rmSeries(all, topLift).map((p) => ({ w: fmtDate(p.date), e1rm: Math.round(kgToUnit(p.e1rm, units)) })) : [];

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
            {typeof session.readiness === "number" ? ` · readiness ${session.readiness}` : ""}
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
          <Stat label="Volume" value={fmtTonnage(sessionVolume(session.blocks), units)} c={LIME} />
          {shape === "mixed" && cardio.distanceKm > 0 && <Stat label="Distance" value={formatSportDistance(cardio.distanceKm, headlineRunMove(session.blocks) ?? "")} c={BLUE} />}
        </div>
      )}

      {prs.length > 0 && (
        <Card style={{ borderColor: LIME }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={LIME}>
            🏆 {prs.length} new personal record{prs.length > 1 ? "s" : ""}
          </Mono>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: space.xs }}>
            {prs.map((p) => (
              <Mono key={p.lift} s={{ fontSize: fs.body }} c={CHALK}>
                {prLine(p)}
              </Mono>
            ))}
          </div>
        </Card>
      )}

      {cardioPrs.length > 0 && (
        <Card style={{ borderColor: BLUE }}>
          <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em" }} c={BLUE}>
            🏃 {cardioPrs.length} new cardio record{cardioPrs.length > 1 ? "s" : ""}
          </Mono>
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: space.xs }}>
            {cardioPrs.map((p) => (
              <Mono key={`${p.move}-${p.kind}`} s={{ fontSize: fs.body }} c={CHALK}>
                {cardioPrLine(p)}
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
          <ChartFrame title={`${topLift} · e1RM`} kicker="Trend across your logs">
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
        <ChartFrame title={`${runMove} · pace`} kicker="Lower is faster · across your logs">
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
              {b.kind === "strength" && blockBestE1rm(b) > 0 && (
                <Mono s={{ fontSize: fs.body }} c={LIME}>{fmtWeight(blockBestE1rm(b), units)} e1RM</Mono>
              )}
            </div>
            {b.kind === "strength" ? (
              <div style={{ marginTop: 8 }}>
                {b.sets.map((st, j) => {
                  const sType = setType(st);
                  const sAccent = sType === "warmup" ? AMBER : sType === "cooldown" ? BLUE : sType === "drop" ? LIME : ASH;
                  const sTag = sType === "warmup" ? " · warm-up" : sType === "cooldown" ? " · cool-down" : sType === "drop" ? " · drop" : "";
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
    </div>
  );
}
