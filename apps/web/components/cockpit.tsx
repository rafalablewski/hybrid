"use client";

import { useEffect, useMemo, useState } from "react";
import {
  prescribeSession,
  computePerformanceState,
  runTotals,
  toTrainingLog,
  velocityProfiles,
  LEVELS,
  type Biometrics,
  type LoggedSession,
  type Macrocycle,
} from "@hybrid/core";
import { readSportSelection } from "@/lib/sport-store";
import Onboarding from "./onboarding";
import { usePersona, setClientPersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import {
  LINE, LIME, CHALK, ASH, BLUE, VIOLET, AMBER, RED, ON_ACCENT,
  disp, cond, mono, Mono, Card, txt,
} from "@/lib/ui";

const hpiColor = (b: string) =>
  b === "peak" || b === "primed" ? LIME : b === "moderate" ? BLUE : b === "compromised" ? AMBER : RED;

/**
 * Web parity of the mobile Athlete Cockpit — one screen that sequences the
 * data-athlete's path (goal/season → today → performance → sport → velocity →
 * endurance), each a live snapshot off real data that jumps to the deep screen.
 * Athlete/coach personas only (gated in the nav). (Phase 2.)
 */
export default function Cockpit({
  sessions,
  bio,
  macro,
  currentWeek = 1,
  setScreen,
  onEnrolled,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  setScreen: (id: string) => void;
  /** Called after the inline "Set up / change plan" flow enrolls a macrocycle —
   *  app-shell refreshes the macro and lands the athlete back on Today. */
  onEnrolled: () => void;
}) {
  const [sport, setSport] = useState<{ sport: string; levelIdx: number } | null>(null);
  // The onboarding ("Get started") funnel is no longer a standalone tab — it
  // lives here, under Goal & season, as an expandable setup flow.
  const [setupOpen, setSetupOpen] = useState(false);
  // Freemium funnel: a casual user reaches the Cockpit as a LOCKED bait (it shows
  // in nav with a lock). Render the upsell teaser instead of the live cockpit;
  // a paid user in Simple mode just flips to Full, a free user hits billing.
  const persona = usePersona();
  const { entitlement } = useSession();
  if (persona === "casual") {
    const unlock = () => (entitlement === "paid" ? setClientPersona("athlete") : setScreen("settings"));
    return <CockpitTeaser paid={entitlement === "paid"} onUnlock={unlock} />;
  }
  useEffect(() => {
    const s = readSportSelection();
    if (s?.sport) setSport({ sport: s.sport, levelIdx: typeof s.levelIdx === "number" ? s.levelIdx : 0 });
  }, []);

  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles: velocityProfiles(sessions) }), [log, bio, sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const totals = useMemo(() => runTotals(sessions), [sessions]);
  const hasData = sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];

  return (
    <div style={{ maxWidth: 760 }}>
      <h2 style={{ ...disp, fontWeight: 900, fontSize: 26, marginBottom: 4 }}>Athlete cockpit</h2>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 16 }}>
        Goal → season → today → performance → sport → technique → endurance, in one place.
      </Mono>

      <div style={{ display: "grid", gap: 14 }}>
        <Section kicker="Goal & season" color={VIOLET} onOpen={() => (macro ? setScreen("periodize") : setSetupOpen((v) => !v))} openLabel={macro ? "Periodize →" : "Set up a plan →"}>
          {macro ? (
            <>
              <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>{macro.goalOrSport}</div>
              <Mono s={{ fontSize: 12, display: "block", marginTop: 4 }} c={ASH}>
                {phaseBlock ? `${phaseBlock.label} · ` : ""}week {currentWeek}/{macro.totalWeeks}
                {macro.eventInWeeks != null ? ` · event in ${macro.eventInWeeks} wk` : ""}
              </Mono>
            </>
          ) : (
            <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>No season yet — enroll a goal and your periodized plan drives the weeks.</Mono>
          )}

          {/* SET UP / CHANGE PLAN — the onboarding funnel, folded in (no longer a
              standalone "Get started" tab). Expands inline; enrolling refreshes
              the macro and returns to Today via onEnrolled. */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${LINE}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>Set up / change plan</Mono>
              <button
                onClick={() => setSetupOpen((v) => !v)}
                style={{ ...mono, fontSize: 12, color: txt(AMBER), background: "none", border: "none", cursor: "pointer" }}
              >
                {setupOpen ? "Close setup ✕" : "Open setup →"}
              </button>
            </div>
            <Mono s={{ fontSize: 12, display: "block", marginTop: 4 }} c={ASH}>4 questions → a plan you&apos;ll finish.</Mono>
            {setupOpen && (
              <div style={{ marginTop: 14 }}>
                <Onboarding onEnrolled={() => { setSetupOpen(false); onEnrolled(); }} />
              </div>
            )}
          </div>
        </Section>

        <Section kicker={hasData ? `Today · readiness ${rx.readiness}/100` : "Today"} color={LIME} onOpen={() => setScreen("log")} openLabel="Log session →">
          <div style={{ ...disp, fontWeight: 800, fontSize: 18 }}>
            {hasData ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : "Log a session to calibrate your route"}
          </div>
          {hasData && <Mono s={{ fontSize: 12, lineHeight: 1.6, display: "block", marginTop: 4 }} c={ASH}>{rx.why}</Mono>}
        </Section>

        <Section kicker="Performance · Athlete Twin" color={BLUE} onOpen={() => setScreen("performance")} openLabel="Performance →">
          {hasData ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span style={{ ...disp, fontWeight: 800, fontSize: 34, color: txt(hpiColor(state.hpi.band)) }}>{state.hpi.score}</span>
                <Mono s={{ fontSize: 12 }}>HPI · {state.hpi.band} · limiter {state.hpi.limiter}</Mono>
                <div style={{ display: "flex", gap: 14, marginLeft: "auto" }}>
                  <Mono s={{ fontSize: 12 }} c={LIME}>STR {state.hpi.components.strength}</Mono>
                  <Mono s={{ fontSize: 12 }} c={BLUE}>END {state.hpi.components.endurance}</Mono>
                  <Mono s={{ fontSize: 12 }} c={VIOLET}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</Mono>
                </div>
              </div>
              {state.drivers[0] && <Mono s={{ fontSize: 12, lineHeight: 1.6, display: "block", marginTop: 6 }} c={CHALK}>{state.drivers[0].detail}</Mono>}
            </>
          ) : (
            <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>Your HPI, readiness and tissue load build from real training — log a session.</Mono>
          )}
        </Section>

        <Section kicker="Sport S&C" color={AMBER} onOpen={() => setScreen("sport")} openLabel="Sport →">
          {sport ? (
            <div style={{ ...disp, fontWeight: 700, fontSize: 16 }}>{sport.sport} · {LEVELS[sport.levelIdx]}</div>
          ) : (
            <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>Pick your sport — the engine ranks the strength &amp; conditioning that transfers.</Mono>
          )}
        </Section>

        <Section kicker="Velocity & technique" color={BLUE} onOpen={() => setScreen("velocity")} openLabel="Velocity →">
          <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>
            Bar speed → a velocity-estimated 1RM and autoregulated load. Force-plate &amp; video analysis feed the same Twin.
          </Mono>
        </Section>

        <Section kicker="Endurance" color={LIME} onOpen={() => setScreen("running")} openLabel="Running →">
          {totals.efforts > 0 ? (
            <div style={{ display: "flex", gap: 22 }}>
              <Stat label="efforts" value={`${totals.efforts}`} />
              <Stat label="km" value={totals.distanceKm.toLocaleString()} />
              <Stat label="min" value={totals.minutes.toLocaleString()} />
            </div>
          ) : (
            <Mono s={{ fontSize: 13, lineHeight: 1.6 }} c={CHALK}>Log a run (distance + minutes) and your mileage, pace zones and PRs appear.</Mono>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({
  kicker,
  color,
  children,
  onOpen,
  openLabel,
}: {
  kicker: string;
  color: string;
  children: React.ReactNode;
  onOpen: () => void;
  openLabel: string;
}) {
  return (
    <Card style={{ borderLeft: `3px solid ${color}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={color}>{kicker}</Mono>
        <button onClick={onOpen} style={{ ...mono, fontSize: 12, color: txt(color), background: "none", border: "none", cursor: "pointer" }}>{openLabel}</button>
      </div>
      {children}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ ...disp, fontWeight: 800, fontSize: 20 }}>{value}</div>
      <Mono s={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".1em" }} c={ASH}>{label}</Mono>
    </div>
  );
}

// What's inside the Cockpit — the bait list shown to a freemium user.
const TEASE: { kicker: string; color: string; blurb: string }[] = [
  { kicker: "Goal & season", color: VIOLET, blurb: "Your periodized macrocycle — phase, week and event countdown." },
  { kicker: "Today's route", color: LIME, blurb: "A velocity-aware daily prescription tuned to your readiness." },
  { kicker: "Performance · Athlete Twin", color: BLUE, blurb: "Your HPI, its pillars and limiter — the digital twin of your training." },
  { kicker: "Sport S&C", color: AMBER, blurb: "The strength & conditioning that transfers to your sport, ranked." },
  { kicker: "Velocity & technique", color: BLUE, blurb: "Bar-speed 1RM, autoregulated load, force-plate & video analysis." },
  { kicker: "Endurance", color: LIME, blurb: "Mileage, pace zones and running PRs from your whole history." },
];

/**
 * The freemium BAIT: a casual user can open the Cockpit, but instead of the live
 * screen they see a locked teaser of everything inside + an upgrade CTA. A paid
 * user in Simple mode flips straight to Full; a free user is sent to billing.
 */
function CockpitTeaser({ paid, onUnlock }: { paid: boolean; onUnlock: () => void }) {
  return (
    <div style={{ maxWidth: 760 }}>
      <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={AMBER}>Athlete cockpit · Full</Mono>
      <h2 style={{ ...disp, fontWeight: 900, fontSize: 26, margin: "4px 0 2px" }}>Unlock your command center 🔒</h2>
      <Mono s={{ fontSize: 13, display: "block", marginBottom: 16, lineHeight: 1.6 }} c={CHALK}>
        Goal, season, your performance Twin, sport S&amp;C, velocity and endurance — assembled into one screen.
        It&apos;s part of <b style={{ color: txt(LIME) }}>Full</b>. Keep logging on the free plan; upgrade whenever you want the depth.
      </Mono>

      <div style={{ display: "grid", gap: 10 }}>
        {TEASE.map((s) => (
          <Card key={s.kicker} style={{ borderLeft: `3px solid ${s.color}`, opacity: 0.7, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <Mono s={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".1em" }} c={s.color}>{s.kicker}</Mono>
              <Mono s={{ fontSize: 12, display: "block", marginTop: 4, lineHeight: 1.5 }} c={CHALK}>{s.blurb}</Mono>
            </div>
            <span style={{ fontSize: 16 }} aria-hidden>🔒</span>
          </Card>
        ))}
      </div>

      <button
        onClick={onUnlock}
        style={{ ...cond, fontWeight: 800, fontSize: 15, textTransform: "uppercase", letterSpacing: ".04em", color: ON_ACCENT, background: LIME, border: "none", borderRadius: 12, padding: "14px 28px", marginTop: 18, cursor: "pointer" }}
      >
        {paid ? "Switch to Full →" : "Upgrade to Full →"}
      </button>
      <Mono s={{ fontSize: 11, display: "block", marginTop: 10 }} c={ASH}>
        {paid ? "You're already paid — switch your mode to Full to unlock everything." : "Full unlocks the Cockpit, plans, analytics, sport, velocity and more."}
      </Mono>
    </div>
  );
}
