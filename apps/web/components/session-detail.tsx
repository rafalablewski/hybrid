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
  ChartFrame,
  txt,
} from "@/lib/ui";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { WorkoutWrapped } from "@/components/aurora/workout-wrapped";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useIsMobile } from "@/lib/use-media-query";
import { fmtWeight, fmtTonnage, displayLoad, kgToUnit } from "@hybrid/core";
import {
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
  const muscles = volumeByMuscle(session.blocks, false, bwHere);
  const muscleMax = muscles[0]?.volume || 1;

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

  // The workout's charts + set breakdown + manage row — shown as the trailing
  // "details" section beneath the Wrapped panels (opening a session IS the
  // reveal → premium recap → share experience now; see WorkoutWrapped).
  const details = (
    <div style={{ display: "flex", flexDirection: "column", gap: space.lg }}>
      <div>
        <div style={{ ...disp, fontWeight: 800, fontSize: fs.title }}>{t("session.theSession")}</div>
        <Mono s={{ fontSize: fs.body, display: "block", marginTop: 4 }}>
          {fmtDate(session.startedAt)}
          {typeof session.readiness === "number" ? ` – readiness ${session.readiness}` : ""}
        </Mono>
      </div>

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

  // The individual session IS the experience: reveal (if a PR) → premium Wrapped
  // panels → story share, with the charts/breakdown/manage riding along as
  // `details`. Full-screen takeover; onBack returns to History.
  return (
    <WorkoutWrapped session={session} all={all} units={units} bw={bw} onBack={onBack} details={details} />
  );
}
