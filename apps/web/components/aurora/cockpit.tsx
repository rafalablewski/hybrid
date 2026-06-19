"use client";

import { useEffect, useMemo, useState } from "react";
import {
  prescribeSession, computePerformanceState, runTotals, toTrainingLog, velocityProfiles, LEVELS,
  ROLE_COLOR, hpiRole,
  type Biometrics, type LoggedSession, type Macrocycle,
} from "@hybrid/core";
import { readSportSelection } from "@/lib/sport-store";
import AuroraOnboarding from "./onboarding";
import { usePersona, setClientPersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { AuroraIcon } from "./icons";

// State colour via the SHARED semantic vocabulary (@hybrid/core semantic.ts).
const hpiVar = (b: string) => ROLE_COLOR[hpiRole(b)];
const C = (v: string) => `var(--color-${v})`;

/** AURORA Cockpit (web) — same live snapshots + inline plan setup + freemium
 *  teaser as the classic, in the rounded Aurora style. */
export default function AuroraCockpit({
  sessions, bio, macro, currentWeek = 1, setScreen, onEnrolled,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  setScreen: (id: string) => void;
  onEnrolled: () => void;
}) {
  const [sport, setSport] = useState<{ sport: string; levelIdx: number } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const persona = usePersona();
  const { entitlement } = useSession();

  useEffect(() => {
    const s = readSportSelection();
    if (s?.sport) setSport({ sport: s.sport, levelIdx: typeof s.levelIdx === "number" ? s.levelIdx : 0 });
  }, []);

  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles: velocityProfiles(sessions) }), [log, bio, sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const totals = useMemo(() => runTotals(sessions), [sessions]);

  if (persona === "casual") {
    return <Teaser paid={entitlement === "paid"} onUnlock={() => (entitlement === "paid" ? setClientPersona("athlete") : setScreen("upgrade"))} />;
  }

  const hasData = sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: 28, margin: 0 }}>Your command center</h1>
      <p style={{ fontSize: 14, color: C("ash"), marginTop: 8 }}>Goal → season → today → performance → technique, in one place.</p>

      <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
        <Section title="Goal & season" color="violet" openLabel={macro ? "Periodize" : "Set up"} onOpen={() => (macro ? setScreen("periodize") : setSetupOpen((v) => !v))}>
          {macro ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 20 }}>{macro.goalOrSport}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), marginTop: 4 }}>{phaseBlock ? `${phaseBlock.label} · ` : ""}week {currentWeek}/{macro.totalWeeks}{macro.eventInWeeks != null ? ` · event in ${macro.eventInWeeks} wk` : ""}</div>
            </>
          ) : <div style={{ fontSize: 13, lineHeight: 1.6 }}>No season yet — enroll a goal and your periodized plan drives the weeks.</div>}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em", color: C("amber") }}>Set up / change plan</span>
              <button onClick={() => setSetupOpen((v) => !v)} style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("amber"), background: "none", border: "none", cursor: "pointer" }}>{setupOpen ? "Close ✕" : "Open setup →"}</button>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), marginTop: 4 }}>4 questions → a plan you&apos;ll finish.</div>
            {setupOpen && <div style={{ marginTop: 16 }}><AuroraOnboarding onEnrolled={() => { setSetupOpen(false); onEnrolled(); }} /></div>}
          </div>
        </Section>

        <Section title={hasData ? `Today · readiness ${rx.readiness}/100` : "Today"} color="lime" openLabel="Log session" onOpen={() => setScreen("log")}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>{hasData ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : "Log a session to calibrate your route"}</div>
          {hasData && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash"), marginTop: 4, lineHeight: 1.6 }}>{rx.why}</div>}
        </Section>

        <Section title="Performance · Athlete Twin" color="blue" openLabel="Performance" onOpen={() => setScreen("performance")}>
          {hasData ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: 34, color: C(hpiVar(state.hpi.band)) }}>{state.hpi.score}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: C("ash") }}>HPI · {state.hpi.band} · limiter {state.hpi.limiter}</span>
                <span style={{ display: "flex", gap: 14, marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 12 }}>
                  <span style={{ color: C("lime") }}>STR {state.hpi.components.strength}</span>
                  <span style={{ color: C("blue") }}>END {state.hpi.components.endurance}</span>
                  <span style={{ color: C("violet") }}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</span>
                </span>
              </div>
              {state.drivers[0] && <div style={{ fontSize: 13, lineHeight: 1.6, marginTop: 6 }}>{state.drivers[0].detail}</div>}
            </>
          ) : <div style={{ fontSize: 13, lineHeight: 1.6 }}>Your HPI, readiness and tissue load build from real training — log a session.</div>}
        </Section>

        <Section title="Sport S&C" color="amber" openLabel="Sport" onOpen={() => setScreen("sport")}>
          {sport ? <div style={{ fontWeight: 700, fontSize: 16 }}>{sport.sport} · {LEVELS[sport.levelIdx]}</div> : <div style={{ fontSize: 13, lineHeight: 1.6 }}>Pick your sport — the engine ranks the strength &amp; conditioning that transfers.</div>}
        </Section>

        <Section title="Velocity & technique" color="blue" openLabel="Velocity" onOpen={() => setScreen("velocity")}>
          <div style={{ fontSize: 13, lineHeight: 1.6 }}>Bar speed → a velocity-estimated 1RM and autoregulated load. Force-plate &amp; video analysis feed the same Twin.</div>
        </Section>

        <Section title="Endurance" color="lime" openLabel="Running" onOpen={() => setScreen("running")}>
          {totals.efforts > 0 ? (
            <div style={{ display: "flex", gap: 22 }}>
              <Stat label="efforts" value={`${totals.efforts}`} /><Stat label="km" value={totals.distanceKm.toLocaleString()} /><Stat label="min" value={totals.minutes.toLocaleString()} />
            </div>
          ) : <div style={{ fontSize: 13, lineHeight: 1.6 }}>Log a run (distance + minutes) and your mileage, pace zones and PRs appear.</div>}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, color, children, onOpen, openLabel }: { title: string; color: string; children: React.ReactNode; onOpen: () => void; openLabel: string }) {
  return (
    <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 9, height: 9, borderRadius: 5, background: C(color) }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C(color) }}>{title}</span>
        </span>
        <button onClick={onOpen} style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 12, color: C(color), background: "none", border: "none", cursor: "pointer" }}>{openLabel} →</button>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 20 }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{label}</div>
    </div>
  );
}

const TEASE: { kicker: string; color: string; blurb: string }[] = [
  { kicker: "Goal & season", color: "violet", blurb: "Your periodized macrocycle — phase, week and event countdown." },
  { kicker: "Today's route", color: "lime", blurb: "A velocity-aware daily prescription tuned to your readiness." },
  { kicker: "Performance · Athlete Twin", color: "blue", blurb: "Your HPI, its pillars and limiter — the digital twin of your training." },
  { kicker: "Sport S&C", color: "amber", blurb: "The strength & conditioning that transfers to your sport, ranked." },
  { kicker: "Velocity & technique", color: "blue", blurb: "Bar-speed 1RM, autoregulated load, force-plate & video analysis." },
  { kicker: "Endurance", color: "lime", blurb: "Mileage, pace zones and running PRs from your whole history." },
];

function Teaser({ paid, onUnlock }: { paid: boolean; onUnlock: () => void }) {
  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: 26, margin: "0 0 6px" }}>Unlock your command center</h1>
      <p style={{ fontSize: 14, lineHeight: 1.6, color: C("ash") }}>Goal, season, your performance Twin, sport S&amp;C, velocity and endurance — assembled into one screen. It&apos;s part of <b style={{ color: C("lime") }}>Full</b>.</p>
      <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
        {TEASE.map((s) => (
          <div key={s.kicker} style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 24, padding: 18, opacity: 0.75, display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: C(s.color) }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: C(s.color) }}>{s.kicker}</div>
              <div style={{ fontSize: 12, marginTop: 4, lineHeight: 1.5 }}>{s.blurb}</div>
            </div>
            <AuroraIcon name="lock" size={18} color={C("ash")} />
          </div>
        ))}
      </div>
      <button onClick={onUnlock} style={{ fontWeight: 700, fontSize: 16, color: C("ink"), background: C("lime"), border: "none", borderRadius: 999, padding: "15px 28px", marginTop: 18, cursor: "pointer" }}>
        {paid ? "Switch to Full" : "Upgrade to Full"}
      </button>
    </div>
  );
}
