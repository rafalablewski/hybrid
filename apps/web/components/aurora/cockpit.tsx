"use client";

import { useEffect, useMemo, useState } from "react";
import { fs, space,
  prescribeSession, computePerformanceState, computeInjuryRisk, performanceTrajectory, weeklyRecap,
  runTotals, toTrainingLog, velocityProfiles, LEVELS,
  ROLE_COLOR, hpiRole, riskRole, readinessRole,
  type Biometrics, type LoggedSession, type Macrocycle,
} from "@hybrid/core";
import { readSportSelection } from "@/lib/sport-store";
import AuroraOnboarding from "./onboarding";
import { usePersona, setClientPersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

// State colour via the SHARED semantic vocabulary (@hybrid/core semantic.ts).
const hpiVar = (b: string) => ROLE_COLOR[hpiRole(b)];
const riskVar = (b: string) => ROLE_COLOR[riskRole(b)];
const readyVar = (v: number) => ROLE_COLOR[readinessRole(v)];
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
  const { t } = useLang();
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
  const hpiSeries = useMemo(() => [...performanceTrajectory(log, 14)].sort((a, b) => b.daysAgo - a.daysAgo).map((p) => p.hpi), [log]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const recap = useMemo(() => weeklyRecap(sessions), [sessions]);
  const totals = useMemo(() => runTotals(sessions), [sessions]);

  if (persona === "casual") {
    return <Teaser paid={entitlement === "paid"} onUnlock={() => (entitlement === "paid" ? setClientPersona("athlete") : setScreen("upgrade"))} />;
  }

  const hasData = sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 28, margin: 0 }}>{t("w.home.cockpit.commandCenter")}</h1>
      <p style={{ fontSize: fs.bodyLg, color: C("ash"), marginTop: 8 }}>{t("w.home.cockpit.commandSub")}</p>

      <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
        <Section title={t("w.home.cockpit.goalSeason")} openLabel={macro ? t("w.home.cockpit.periodize") : t("w.home.cockpit.setUp")} onOpen={() => (macro ? setScreen("periodize") : setSetupOpen((v) => !v))}>
          {macro ? (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.heading }}>{macro.goalOrSport}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4 }}>{phaseBlock ? `${phaseBlock.label} · ` : ""}{t("w.home.cockpit.week")} {currentWeek}/{macro.totalWeeks}{macro.eventInWeeks != null ? ` · ${t("w.home.cockpit.eventIn")} ${macro.eventInWeeks} ${t("w.home.cockpit.wk")}` : ""}</div>
            </>
          ) : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.noSeason")}</div>}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{t("w.home.cockpit.setUpChange")}</span>
              <button onClick={() => setSetupOpen((v) => !v)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer" }}>{setupOpen ? t("w.home.cockpit.close") : t("w.home.cockpit.openSetup")}</button>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4 }}>{t("w.home.cockpit.fourQuestions")}</div>
            {setupOpen && <div style={{ marginTop: 16 }}><AuroraOnboarding onEnrolled={() => { setSetupOpen(false); onEnrolled(); }} /></div>}
          </div>
        </Section>

        <Section title={hasData ? `${t("w.home.cockpit.todayReadiness")} ${rx.readiness}/100` : t("w.home.cockpit.today")} openLabel={t("w.home.cockpit.logSession")} onOpen={() => setScreen("log")}>
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title }}>{hasData ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : t("w.home.cockpit.calibrate")}</div>
          {hasData && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4, lineHeight: 1.6 }}>{rx.why}</div>}
        </Section>

        <Section title={t("w.home.cockpit.perfTwin")} openLabel={t("w.home.cockpit.performance")} onOpen={() => setScreen("performance")}>
          {hasData ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 44, lineHeight: 1, color: C(hpiVar(state.hpi.band)) }}>{state.hpi.score}</span>
                <div style={{ minWidth: 120, flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>HPI · {state.hpi.band} · {t("w.home.cockpit.limiter")} {state.hpi.limiter}</div>
                  <div style={{ marginTop: 6, maxWidth: 180 }}><Spark series={hpiSeries} color={C(hpiVar(state.hpi.band))} /></div>
                </div>
                <span style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
                  <span><span style={{ color: C("ash") }}>STR</span> <b style={{ color: C("chalk"), fontWeight: 700 }}>{state.hpi.components.strength}</b></span>
                  <span><span style={{ color: C("ash") }}>END</span> <b style={{ color: C("chalk"), fontWeight: 700 }}>{state.hpi.components.endurance}</b></span>
                  <span><span style={{ color: C("ash") }}>REC</span> <b style={{ color: C("chalk"), fontWeight: 700 }}>{state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</b></span>
                </span>
              </div>
              {state.drivers[0] && <div style={{ fontSize: fs.body, lineHeight: 1.6, marginTop: 10 }}>{state.drivers[0].detail}</div>}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C("line")}`, display: "flex", alignItems: "center", gap: space.md }}>
                <Ring value={rx.readiness} color={C(readyVar(rx.readiness))} />
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{t("w.home.cockpit.todayReadiness")}</div>
                  <div style={{ fontSize: fs.caption, color: C("ash"), marginTop: 3, lineHeight: 1.5, maxWidth: "32ch" }}>{rx.why}</div>
                </div>
              </div>
            </>
          ) : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.twinEmpty")}</div>}
        </Section>

        {/* READINESS & INJURY RISK — moved here from Today (the command-center home of the recovery state). */}
        {hasData && (
          <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("red") }}>{t("w.home.today.injuryRisk")}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: space.sm, marginTop: 8 }}>
              <span style={{ fontWeight: 800, fontSize: fs.heading, color: C(riskVar(risk.band)) }}>{risk.band}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>{risk.overall}/100</span>
            </div>
            <div style={{ height: 9, borderRadius: 5, background: C("ink"), overflow: "hidden", marginTop: 8 }}>
              <div style={{ width: `${risk.overall}%`, height: "100%", background: C(riskVar(risk.band)) }} />
            </div>
            {risk.flagged.length === 0 ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("lime"), marginTop: 10 }}>{t("w.home.today.noTissues")}</div>
            ) : (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: space.xs }}>
                {risk.flagged.map((ti) => (
                  <div key={ti.tissue} style={{ display: "flex", gap: space.sm, alignItems: "baseline" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ink"), background: C(riskVar(ti.band)), borderRadius: 999, padding: "2px 9px" }}>{ti.risk}</span>
                    <span style={{ fontSize: fs.caption, textTransform: "capitalize" }}>{ti.tissue}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginLeft: "auto" }}>{ti.drivers[0]?.label ?? ""}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* YOUR WEEK — weekly recap moved here from Today (tap → full Statistics). */}
        {hasData && (
          <button onClick={() => setScreen("statistics")} style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20, width: "100%", textAlign: "left", cursor: "pointer", color: C("chalk"), display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.home.today.yourWeek")}</span>
              {recap.prs.length > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ink"), background: C("lime"), borderRadius: 999, padding: "3px 10px" }}>{recap.prs.length} PR</span>}
            </div>
            <div style={{ display: "flex", gap: 22, marginTop: 12, flexWrap: "wrap" }}>
              <Stat label={t("w.home.today.sessions")} value={`${recap.sessions}`} />
              <Stat label={t("w.home.today.volume")} value={`${recap.volume.toLocaleString()} kg`} />
              <Stat label={t("w.home.today.sets")} value={`${recap.sets}`} />
              {recap.distanceKm > 0 && <Stat label={t("w.home.today.distance")} value={`${recap.distanceKm} km`} />}
              <Stat label={t("w.home.today.activeDays")} value={`${recap.activeDays}`} />
            </div>
            {recap.prs.length > 0 && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("chalk"), marginTop: 8 }}>
                {recap.prs.slice(0, 4).map((p) => `${p.lift} ${p.e1rm}kg${p.previous == null ? "" : ` (+${p.e1rm - p.previous})`}`).join(" · ")}
              </div>
            )}
          </button>
        )}

        <Section title={t("w.home.cockpit.sportSC")} openLabel={t("w.home.cockpit.sport")} onOpen={() => setScreen("sport")}>
          {sport ? <div style={{ fontWeight: 700, fontSize: fs.subtitle }}>{sport.sport} · {LEVELS[sport.levelIdx]}</div> : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.sportEmpty")}</div>}
        </Section>

        <Section title={t("w.home.cockpit.velocityTechnique")} openLabel={t("w.home.cockpit.velocity")} onOpen={() => setScreen("velocity")}>
          <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.velocityBlurb")}</div>
        </Section>

        <Section title={t("w.home.cockpit.endurance")} openLabel={t("w.home.cockpit.running")} onOpen={() => setScreen("running")}>
          {totals.efforts > 0 ? (
            <div style={{ display: "flex", gap: 22 }}>
              <Stat label={t("w.home.cockpit.efforts")} value={`${totals.efforts}`} /><Stat label={t("w.home.cockpit.km")} value={totals.distanceKm.toLocaleString()} /><Stat label={t("w.home.cockpit.min")} value={totals.minutes.toLocaleString()} />
            </div>
          ) : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.enduranceEmpty")}</div>}
        </Section>
      </div>
    </div>
  );
}

// Disciplined section header: a single lime accent (dot + Open link) over a
// neutral ash kicker — no per-section rainbow. Data colours live in the body.
function Section({ title, children, onOpen, openLabel }: { title: string; children: React.ReactNode; onOpen: () => void; openLabel: string }) {
  return (
    <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: space.sm }}>
          <span style={{ width: 9, height: 9, borderRadius: 5, background: C("lime") }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{title}</span>
        </span>
        <button onClick={onOpen} style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer" }}>{openLabel} →</button>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.heading }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{label}</div>
    </div>
  );
}

/** Readiness dial — conic-gradient ring with the number inside. */
function Ring({ value, color, size = 48 }: { value: number; color: string; size?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const inner = size - 12;
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `conic-gradient(${color} ${pct * 3.6}deg, ${C("line")} 0)`, display: "grid", placeItems: "center", flexShrink: 0 }}>
      <div style={{ width: inner, height: inner, borderRadius: "50%", background: C("ink2"), display: "grid", placeItems: "center", fontWeight: 800, fontSize: fs.body, color: C("chalk") }}>{Math.round(value)}</div>
    </div>
  );
}

/** Dependency-free sparkline — scaled bars, latest highlighted. */
function Spark({ series, color, height = 24 }: { series: number[]; color: string; height?: number }) {
  if (series.length < 2) return null;
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height }}>
      {series.map((v, i) => (
        <div key={i} style={{ flex: 1, height: 4 + ((v - min) / range) * (height - 4), borderRadius: 2, background: i === series.length - 1 ? color : `color-mix(in srgb, ${color} 40%, transparent)` }} />
      ))}
    </div>
  );
}

const TEASE: { key: string }[] = [
  { key: "goalSeason" }, { key: "todayRoute" }, { key: "perfTwin" },
  { key: "sportSC" }, { key: "velocity" }, { key: "endurance" },
];

function Teaser({ paid, onUnlock }: { paid: boolean; onUnlock: () => void }) {
  const { t } = useLang();
  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: fs.display, margin: "0 0 6px" }}>{t("w.home.cockpit.teaseTitle")}</h1>
      <p style={{ fontSize: fs.bodyLg, lineHeight: 1.6, color: C("ash") }}>{t("w.home.cockpit.teaseSub1")}<b style={{ color: C("lime") }}>{t("w.home.cockpit.teaseSub2")}</b>{t("w.home.cockpit.teaseSub3")}</p>
      <div style={{ display: "grid", gap: space.ms, marginTop: 14 }}>
        {TEASE.map((s) => (
          <div key={s.key} style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 18, opacity: 0.75, display: "flex", alignItems: "center", gap: space.md }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: C("lime") }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t(`w.home.cockpit.tease.${s.key}.kicker`)}</div>
              <div style={{ fontSize: fs.caption, marginTop: 4, lineHeight: 1.5 }}>{t(`w.home.cockpit.tease.${s.key}.blurb`)}</div>
            </div>
            <AuroraIcon name="lock" size={18} color={C("ash")} />
          </div>
        ))}
      </div>
      <button onClick={onUnlock} style={{ fontWeight: 700, fontSize: fs.subtitle, color: C("ink"), background: C("lime"), border: "none", borderRadius: 999, padding: "15px 28px", marginTop: 18, cursor: "pointer" }}>
        {paid ? t("w.home.cockpit.switchToFull") : t("w.home.cockpit.upgradeToFull")}
      </button>
    </div>
  );
}
