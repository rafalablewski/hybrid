"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  prescribeSession,
  prescribeForSport,
  reconcilePlan,
  buildTrainingWeek,
  trainingDaysPerWeek,
  weekNeedsResync,
  velocityProfiles,
  toTrainingLog,
  SPORTS,
  LEVELS,
  type LoggedSession,
  type Biometrics,
  type Macrocycle,
  type Experience,
  type Equipment,
} from "@hybrid/core";
import { readSportSelection } from "@/lib/sport-store";
import { useTemplate } from "@/lib/use-template";
import { LINE, LIME, CHALK, ASH, VIOLET, AMBER, ON_ACCENT, disp, cond, Mono, Card, Chip } from "@/lib/ui";

/**
 * The reconciled week — the macrocycle phase arbitrates the daily route + sport
 * transfer work into ONE session, and (optionally) materializes it onto the
 * week's training days as self-authored Assignments. Shared by the Today and
 * Periodize screens so they show the same plan and the same scheduling action.
 */
export default function ReconciledWeek({
  macro,
  currentWeek = 1,
  sessions,
  bio,
  experience,
  equipment,
  style,
  readOnly = false,
}: {
  macro: Macrocycle;
  currentWeek?: number;
  sessions: LoggedSession[];
  bio?: Biometrics;
  experience?: Experience;
  equipment?: Equipment;
  style?: React.CSSProperties;
  /** Coached, non-paying client: show the coach's assigned plan AS WRITTEN
   *  (no readiness modulation) and hide the schedule / auto-resync controls. */
  readOnly?: boolean;
}) {
  const aurora = useTemplate().template === "aurora";
  // Read-only (coached) view shows the plan as the coach authored it — no
  // biometric/readiness adjustment (that adaptive layer is the paid upgrade).
  const effBio = readOnly ? undefined : bio;
  const rx = useMemo(
    () => prescribeSession(toTrainingLog(sessions), effBio, { profiles: velocityProfiles(sessions), experience, equipment }),
    [sessions, effBio, experience, equipment],
  );

  // the athlete's saved sport selection (client-only — avoids an SSR mismatch).
  const [sportSel, setSportSel] = useState<{ sport: string; levelIdx: number } | null>(null);
  // the days/week from onboarding — the fallback before there's training history.
  const [prefDays, setPrefDays] = useState<number | undefined>(undefined);
  useEffect(() => {
    const s = readSportSelection();
    if (s?.sport && SPORTS[s.sport]) {
      const lvl = typeof s.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length ? s.levelIdx : 0;
      setSportSel({ sport: s.sport, levelIdx: lvl });
    }
    const raw = Number(localStorage.getItem("hybrid.daysPerWeek"));
    if (Number.isFinite(raw) && raw > 0) setPrefDays(raw);
  }, []);

  // availability-aware: actual recent cadence, falling back to the onboarding answer.
  const daysPerWeek = useMemo(
    () => trainingDaysPerWeek(sessions, { fallback: prefDays ?? 3 }),
    [sessions, prefDays],
  );

  const sportRx = useMemo(
    () => (sportSel ? prescribeForSport(sportSel.sport, sportSel.levelIdx, { sessions }) : undefined),
    [sportSel, sessions],
  );
  // Render from session zero: reconcilePlan only needs the macro phase + a daily
  // prescription (cold-start until there's history), so the enrolled plan shows
  // immediately after onboarding instead of staying hidden until the first log.
  const reconciled = useMemo(
    () => reconcilePlan({ macro, daily: rx, sport: sportRx, currentWeek }),
    [macro, rx, sportRx, currentWeek],
  );

  const [scheduling, setScheduling] = useState(false);
  const [scheduled, setScheduled] = useState<string | null>(null);
  const doSchedule = async (auto: boolean) => {
    if (!reconciled || scheduling) return;
    setScheduling(true);
    setScheduled(null);
    try {
      const items = buildTrainingWeek({
        macro,
        currentWeek,
        log: toTrainingLog(sessions),
        bio,
        profiles: velocityProfiles(sessions),
        sport: sportRx,
        daysPerWeek,
        experience,
        equipment,
      });
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, replace: true }),
      });
      setScheduled(
        res.ok
          ? `${auto ? "Auto re-synced" : "Scheduled"} ${items.length} sessions off your latest logs — see the Calendar.`
          : "Couldn't schedule — try again.",
      );
    } catch {
      setScheduled("Couldn't schedule — try again.");
    } finally {
      setScheduling(false);
    }
  };
  const scheduleThisWeek = () => doSchedule(false);

  // Auto re-sync, event-driven: every time a NEWER session lands (you just
  // logged a day), re-check the self-scheduled week and, if it's now stale,
  // regenerate the rest of it off that real result. The ref tracks the latest
  // session we've already reconciled against, so it fires once per new session
  // (not in a loop, and not on every re-render).
  const syncedFor = useRef(0);
  useEffect(() => {
    if (!reconciled || readOnly) return;
    const latest = sessions.reduce((m, s) => Math.max(m, Date.parse(s.startedAt) || 0), 0);
    if (!latest || latest <= syncedFor.current) return;
    let cancelled = false;
    fetch("/api/assignments")
      .then((r) => (r.ok ? r.json() : { assignments: [] }))
      .then((d: { assignments?: Parameters<typeof weekNeedsResync>[0] }) => {
        if (cancelled) return;
        syncedFor.current = latest; // this session state is now handled
        if (weekNeedsResync(d.assignments ?? [], sessions)) void doSchedule(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reconciled, sessions]);

  if (!reconciled) return null;

  return (
    // Aurora: a solid ink2 card (matching the bespoke Aurora cards) instead of
    // the classic liquid-glass surface, so "This week" sits flush with the rest
    // of the Aurora Today. Classic keeps the glass card.
    <Card
      glass={!aurora}
      style={{ borderLeft: `3px solid ${VIOLET}`, ...(aurora ? { background: "var(--color-ink2)", padding: 22 } : {}), ...style }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={VIOLET}>
          This week · {reconciled.phase.label} · week {reconciled.phase.week}
        </Mono>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Chip c={reconciled.phase.kind === "recovery" ? AMBER : LIME}>
            {reconciled.phase.kind === "recovery" ? "deload week" : "load week"}
          </Chip>
          {readOnly ? (
            <Chip c={VIOLET}>assigned by your coach · read-only</Chip>
          ) : (
            <button onClick={scheduleThisWeek} disabled={scheduling} style={cta(scheduling, aurora)}>
              {scheduling ? "Scheduling…" : `Schedule / re-sync week · ${daysPerWeek}d →`}
            </button>
          )}
        </div>
      </div>
      {scheduled && <Mono s={{ fontSize: 11, display: "block", marginTop: 8 }} c={LIME}>{scheduled}</Mono>}
      <div style={{ display: "flex", gap: 18, marginTop: 12 }}>
        <Metric label="Intensity" value={`${reconciled.intensity}`} c={CHALK} />
        <Metric label="Volume" value={`${reconciled.volume}`} c={CHALK} />
        <Metric label="Load ×" value={`${reconciled.loadFactor.toFixed(2)}`} c={VIOLET} />
        <Metric label="Volume ×" value={`${reconciled.volumeFactor.toFixed(2)}`} c={VIOLET} />
      </div>
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {reconciled.blocks.map((b, i) => (
          <div
            key={`${b.name}-${i}`}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: `1px solid ${LINE}` }}
          >
            <div>
              <div style={{ ...disp, fontWeight: 700, fontSize: 15 }}>{b.name}</div>
              <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".06em" }} c={b.source === "sport" ? AMBER : ASH}>
                {b.source === "sport" ? `sport · ${b.demand ?? ""}` : b.kind === "conditioning" ? "conditioning" : "primary lift"}
              </Mono>
            </div>
            <Chip c={b.source === "sport" ? AMBER : LIME}>{b.scheme}</Chip>
          </div>
        ))}
      </div>
      <Mono s={{ fontSize: 12, lineHeight: 1.6, display: "block", marginTop: 12 }} c={CHALK}>{reconciled.why}</Mono>
      {reconciled.dropped.length > 0 && (
        <Mono s={{ fontSize: 11, display: "block", marginTop: 8 }} c={ASH}>
          Dropped: {reconciled.dropped.map((d) => `${d.name} (${d.reason})`).join(" · ")}
        </Mono>
      )}
    </Card>
  );
}

function Metric({ label, value, c }: { label: string; value: string; c: string }) {
  return (
    <div>
      <div style={{ ...disp, fontWeight: 800, fontSize: 22, color: c }}>{value}</div>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".08em" }}>{label}</Mono>
    </div>
  );
}

function cta(disabled: boolean, aurora = false) {
  return {
    ...cond,
    fontSize: 13,
    fontWeight: 800,
    textTransform: "uppercase" as const,
    letterSpacing: ".04em",
    color: ON_ACCENT,
    background: VIOLET,
    border: "none",
    borderRadius: aurora ? 999 : 10,
    padding: aurora ? "10px 18px" : "9px 16px",
    cursor: disabled ? "default" : "pointer",
    opacity: disabled ? 0.6 : 1,
  };
}
