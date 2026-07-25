"use client";

import { useEffect, useMemo, useState } from "react";
import { fs, space,
  prescribeSession, computePerformanceState, computeInjuryRisk, computeLoad, performanceTrajectory, weeklyRecap,
  runTotals, enduranceSessions, toTrainingLog, velocityProfiles, LEVELS,
  ROLE_COLOR, hpiRole, riskRole, readinessRole,
  type Biometrics, type LoggedSession, type Macrocycle, type AcwrBand,
} from "@hybrid/core";
import { readSportSelection } from "@/lib/sport-store";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import AuroraOnboarding from "./onboarding";
import { usePersona, setClientPersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";

// State colour via the SHARED semantic vocabulary (@hybrid/core semantic.ts).
const hpiVar = (b: string) => ROLE_COLOR[hpiRole(b)];
const riskVar = (b: string) => ROLE_COLOR[riskRole(b)];
const readyVar = (v: number) => ROLE_COLOR[readinessRole(v)];
const acwrVar = (b: AcwrBand): string =>
  b === "sweet-spot" ? "lime" : b === "caution" ? "amber" : b === "danger" ? "red" : b === "detraining" ? "blue" : "ash";
const C = (v: string) => `var(--color-${v})`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, " ");
const CARD = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;

/** AURORA Cockpit (web) — a command center: a sticky season-context rail, then
 *  Performance State → Injury risk → This week → Breakdown (tabbed) → Horizon →
 *  Goal, all on the same live engines as the classic. */
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

  const bw = useBodyweightLookup();
  const log = useMemo(() => toTrainingLog(sessions), [sessions]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles: velocityProfiles(sessions) }), [log, bio, sessions]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const hpiSeries = useMemo(() => [...performanceTrajectory(log, 14)].sort((a, b) => b.daysAgo - a.daysAgo).map((p) => p.hpi), [log]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const load = useMemo(() => computeLoad(sessions), [sessions]);
  const recap = useMemo(() => weeklyRecap(sessions, Date.now(), bw), [sessions, bw]);
  // "Endurance" = real endurance cardio (runs, swims, rides, rows) — drop
  // racket/team/combat sports so a tennis session doesn't inflate the summary.
  const totals = useMemo(() => runTotals(enduranceSessions(sessions)), [sessions]);
  const profiles = useMemo(() => velocityProfiles(sessions), [sessions]);

  if (persona === "casual") {
    return <Teaser paid={entitlement === "paid"} onUnlock={() => (entitlement === "paid" ? setClientPersona("athlete") : setScreen("upgrade"))} />;
  }

  const hasData = sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];
  // Injury risk is exception-driven: a slim all-clear row when nothing's flagged,
  // the full maroon alert only when a tissue needs attention.
  const calm = risk.flagged.length === 0;
  // Season completion %, guarded against a 0 / malformed totalWeeks.
  const seasonPct = macro && macro.totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / macro.totalWeeks) * 100)) : 0;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* 1 · CONTEXT RAIL — title + season + sliding pills (scrolls with the page, like Today) */}
      <div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 24, margin: 0, letterSpacing: "-.02em" }}>{t("w.home.cockpit.commandCenter")}</h1>
        <p style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4 }}>
          {macro ? `${macro.goalOrSport} – ${t("w.home.cockpit.week")} ${currentWeek} ${t("w.home.cockpit.of")} ${macro.totalWeeks}` : t("w.home.cockpit.commandSub")}
        </p>
        {macro && (
          // Full-bleed chip rail — clips at the screen edge, rests on the column.
          <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", margin: "10px calc(-1 * var(--page-pad-x, 16px)) 0", padding: "0 var(--page-pad-x, 16px)" }}>
            {phaseBlock && <Pill dot={C("lime")}><b>{phaseBlock.label}</b> {t("w.home.today.phase")}</Pill>}
            {macro.eventInWeeks != null && <Pill>🏁 <b>{macro.eventInWeeks} {t("w.home.cockpit.wk")}</b> {t("w.home.cockpit.eventIn")}</Pill>}
            <Pill>📈 {load.enoughHistory ? `ACWR ${load.acwr.toFixed(2)}` : t("w.home.cockpit.building")}</Pill>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {/* 2 · PERFORMANCE STATE — the headline read, STR/END/REC in three columns */}
        <Section title={t("w.home.cockpit.perfTwin")} openLabel={t("w.home.cockpit.performance")} onOpen={() => setScreen("performance")}>
          {hasData ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 46, lineHeight: 1, color: C(hpiVar(state.hpi.band)) }}>{state.hpi.score}</span>
                <div style={{ minWidth: 120, flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>HPI – {state.hpi.band} – {t("w.home.cockpit.limiter")} {state.hpi.limiter}</div>
                  <div style={{ marginTop: 6, maxWidth: 220 }}><Spark series={hpiSeries} color={C(hpiVar(state.hpi.band))} /></div>
                </div>
              </div>
              {/* three columns — strength · endurance · recovery (big numbers, full words) */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 18, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C("line")}` }}>
                <Comp label={t("w.home.cockpit.tab.strength")} value={`${state.hpi.components.strength}`} />
                <Comp label={t("w.home.cockpit.tab.endurance")} value={`${state.hpi.components.endurance}`} />
                <Comp label={t("w.home.cockpit.recovery")} value={`${state.hpi.components.recovery >= 0 ? "+" : ""}${state.hpi.components.recovery}`} />
              </div>
              {state.drivers[0] && <div style={{ fontSize: fs.body, lineHeight: 1.6, marginTop: 12 }}>{state.drivers[0].detail}</div>}
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C("line")}`, display: "flex", alignItems: "center", gap: space.md }}>
                <Ring value={rx.readiness} color={C(readyVar(rx.readiness))} />
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{t("w.home.cockpit.todayReadiness")}</div>
                  <div style={{ fontSize: fs.caption, color: C("ash"), marginTop: 3, lineHeight: 1.5, maxWidth: "36ch" }}>{rx.why}</div>
                </div>
              </div>
            </>
          ) : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.twinEmpty")}</div>}
        </Section>

        {/* 3 · INJURY RISK — exception-driven: slim all-clear row when nothing's
            flagged; the full maroon alert card only when a tissue needs attention. */}
        {hasData && (
          <div style={{ ...CARD,
            border: calm ? `1px solid ${C("line")}` : `1px solid color-mix(in srgb, ${C("red")} 45%, ${C("line")})`,
            background: calm ? C("ink2") : `linear-gradient(180deg, color-mix(in srgb, ${C("red")} 7%, ${C("ink2")}), ${C("ink2")})` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ display: "flex", alignItems: "center", gap: space.sm }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: calm ? C("lime") : C("red") }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: calm ? C("ash") : C("red") }}>{t("w.home.today.injuryRisk")}</span>
              </span>
              <span style={{ fontWeight: 800, fontSize: fs.subtitle, color: C(riskVar(risk.band)) }}>{cap(risk.band)} – {risk.overall}</span>
            </div>
            {calm ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("lime"), marginTop: 10 }}>{t("w.home.today.noTissues")}</div>
            ) : (
              <>
                <div style={{ height: 9, borderRadius: 5, background: C("ink"), overflow: "hidden", marginTop: 10 }}>
                  <div style={{ width: `${risk.overall}%`, height: "100%", background: C(riskVar(risk.band)) }} />
                </div>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: space.sm }}>
                  {risk.flagged.map((ti) => (
                    <div key={ti.tissue} style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, fontWeight: 700, color: C(riskVar(ti.band)), border: `1px solid color-mix(in srgb, ${C(riskVar(ti.band))} 55%, transparent)`, borderRadius: 999, padding: "2px 9px" }}>{ti.risk}</span>
                      <span style={{ fontSize: fs.caption, textTransform: "capitalize" }}>{ti.tissue}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginLeft: "auto" }}>{ti.drivers[0]?.label ?? `ACWR ${ti.acwr.toFixed(2)}`}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {/* THINGS TO WATCH — ACWR · s-RPE · monotony · strain (always available) */}
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), margin: "16px 0 8px" }}>{t("w.home.cockpit.toWatch")}</div>
            {load.enoughHistory ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: C("line"), border: `1px solid ${C("line")}`, borderRadius: 12, overflow: "hidden" }}>
                <Watch label={t("w.home.cockpit.acwr")} value={load.acwr.toFixed(2)} color={C(acwrVar(load.band))} />
                <Watch label={t("w.home.cockpit.srpe")} value={load.acute.toLocaleString()} />
                <Watch label={t("w.home.cockpit.monotony")} value={load.monotony.toFixed(1)} />
                <Watch label={t("w.home.cockpit.strain")} value={load.strain.toLocaleString()} />
              </div>
            ) : (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), lineHeight: 1.6 }}>{t("w.home.cockpit.watchBuilding")}</div>
            )}
          </div>
        )}

        {/* 4 · THIS WEEK — recap & PRs */}
        {hasData && (
          <button onClick={() => setScreen("statistics")} style={{ ...CARD, width: "100%", textAlign: "left", cursor: "pointer", color: C("chalk"), display: "block" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ display: "flex", alignItems: "center", gap: space.sm }}>
                <span style={{ width: 9, height: 9, borderRadius: 5, background: C("lime") }} />
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.home.today.yourWeek")}</span>
              </span>
              {recap.prs.length > 0 && <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, fontWeight: 700, color: "var(--on-accent)", background: C("lime"), borderRadius: 999, padding: "3px 11px" }}>🏆 {recap.prs.length} {t("w.home.cockpit.newPrs")}</span>}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 14 }}>
              <Stat label={t("w.home.today.sessions")} value={`${recap.sessions}`} />
              <Stat label={`${t("w.home.today.volume")} kg`} value={recap.volume.toLocaleString()} />
              <Stat label={t("w.home.today.sets")} value={`${recap.sets}`} />
            </div>
            {recap.prs.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 4 }}>
                {recap.prs.slice(0, 4).map((p) => (
                  <div key={p.lift} style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: "8px 0", borderTop: `1px solid ${C("line")}` }}>
                    <span>{p.lift} e1RM</span>
                    <span style={{ color: C("lime"), fontWeight: 700 }}>{p.e1rm}kg{p.previous == null ? "" : ` – +${p.e1rm - p.previous}`}</span>
                  </div>
                ))}
              </div>
            )}
          </button>
        )}

        {/* 5 · BREAKDOWN — disciplines, tabbed */}
        {hasData && <Breakdown state={state} recap={recap} totals={totals} sport={sport} profiles={profiles} setScreen={setScreen} />}

        {/* 6 · HORIZON — Sport S&C · Velocity · Endurance, quick rails out */}
        <div style={CARD}>
          <span style={{ display: "flex", alignItems: "center", gap: space.sm, marginBottom: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: C("lime") }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.home.cockpit.horizon")}</span>
          </span>
          <Mod dot={C("amber")} label={t("w.home.cockpit.sportSC")} value={sport ? `${sport.sport} – ${LEVELS[sport.levelIdx] ?? LEVELS[0]}` : t("w.home.cockpit.sport")} onClick={() => setScreen("sport")} />
          <Mod dot={C("blue")} label={t("w.home.cockpit.velocity")} value={t("w.home.cockpit.velocityValue")} mono onClick={() => setScreen("velocity")} />
          <Mod dot={C("lime")} label={t("w.home.cockpit.endurance")} value={totals.efforts > 0 ? `${totals.efforts} – ${totals.distanceKm.toLocaleString()} km – ${totals.minutes.toLocaleString()} min` : t("w.home.cockpit.tab.endurance")} mono onClick={() => setScreen("endurance")} last />
        </div>

        {/* 7 · GOAL + SEASON — two separate widgets (like Today's RECOVER duo);
            reflows to a single column on very narrow viewports. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {/* widget 1 — goal */}
          <div style={CARD}>
            <span style={{ display: "flex", alignItems: "center", gap: space.sm, marginBottom: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: C("violet") }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.home.cockpit.goal")}</span>
            </span>
            {macro ? (
              <>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle }}>{macro.goalOrSport}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("violet"), marginTop: 6 }}>{phaseBlock ? `${phaseBlock.label} – ` : ""}{t("w.home.cockpit.week")} {currentWeek}/{macro.totalWeeks}</div>
              </>
            ) : <div style={{ fontSize: fs.caption, lineHeight: 1.6 }}>{t("w.home.cockpit.noSeason")}</div>}
          </div>
          {/* widget 2 — season progress / plan controls */}
          <div style={CARD}>
            <span style={{ display: "flex", alignItems: "center", gap: space.sm, marginBottom: 12 }}>
              <span style={{ width: 9, height: 9, borderRadius: 5, background: C("lime") }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{macro ? t("w.home.cockpit.season") : t("w.home.cockpit.setUp")}</span>
            </span>
            {macro ? (
              <>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.heading, color: C("chalk") }}>{seasonPct}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash") }}>%</span>
                </div>
                <div style={{ height: 6, borderRadius: 99, background: C("ink"), border: `1px solid ${C("line")}`, overflow: "hidden", margin: "8px 0 10px" }}>
                  <div style={{ width: `${seasonPct}%`, height: "100%", background: C("violet") }} />
                </div>
              </>
            ) : <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2, marginBottom: 10, lineHeight: 1.5 }}>{t("w.home.cockpit.fourQuestions")}</div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
              {macro && <button onClick={() => setScreen("periodize")} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{t("w.home.cockpit.periodize")} →</button>}
              <button onClick={() => setSetupOpen((v) => !v)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{setupOpen ? t("w.home.cockpit.close") : t("w.home.cockpit.openSetup")}</button>
            </div>
          </div>
        </div>
        {setupOpen && <div style={CARD}><AuroraOnboarding onEnrolled={() => { setSetupOpen(false); onEnrolled(); }} /></div>}
      </div>
    </div>
  );
}

/* ---------- Breakdown (tabbed disciplines) ---------- */
type BreakTab = "strength" | "endurance" | "sport" | "velocity";
function Breakdown({ state, recap, totals, sport, profiles, setScreen }: {
  state: ReturnType<typeof computePerformanceState>;
  recap: ReturnType<typeof weeklyRecap>;
  totals: ReturnType<typeof runTotals>;
  sport: { sport: string; levelIdx: number } | null;
  profiles: ReturnType<typeof velocityProfiles>;
  setScreen: (id: string) => void;
}) {
  const { t } = useLang();
  const TABS: { id: BreakTab; label: string }[] = [
    { id: "strength", label: t("w.home.cockpit.tab.strength") },
    { id: "endurance", label: t("w.home.cockpit.tab.endurance") },
    { id: "sport", label: t("w.home.cockpit.tab.sport") },
    { id: "velocity", label: t("w.home.cockpit.tab.velocity") },
  ];
  const [tab, setTab] = useState<BreakTab>("strength");
  const idx = TABS.findIndex((x) => x.id === tab);
  const bestProfile = useMemo(() => Object.entries(profiles).filter(([, p]) => p.estimated1rm > 0).sort((a, b) => b[1].estimated1rm - a[1].estimated1rm)[0], [profiles]);

  return (
    <div style={CARD}>
      <span style={{ display: "flex", alignItems: "center", gap: space.sm, marginBottom: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: 5, background: C("blue") }} />
        <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.home.cockpit.breakdown")}</span>
      </span>
      {/* top-notch segmented tabs with a sliding indicator */}
      <div style={{ position: "relative", display: "grid", gridTemplateColumns: `repeat(${TABS.length},1fr)`, gap: 0, background: C("ink"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: 4 }}>
        {/* indicator sized off the CONTENT box ((100% − 8px padding) / n) so it
            stays aligned with the tabs at any container width, not just phone-narrow. */}
        <div style={{ position: "absolute", top: 4, bottom: 4, left: `calc(4px + ${idx} * ((100% - 8px) / ${TABS.length}))`, width: `calc((100% - 8px) / ${TABS.length})`, background: C("chalk"), borderRadius: 999, transition: "left .25s cubic-bezier(.4,0,.2,1)", boxShadow: "0 2px 8px -2px rgba(0,0,0,.5)" }} />
        {TABS.map((x) => {
          const on = x.id === tab;
          return (
            <button key={x.id} onClick={() => setTab(x.id)} style={{ position: "relative", zIndex: 1, padding: "9px 4px", border: "none", background: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.caption, fontWeight: 700, letterSpacing: ".02em", color: on ? C("ink") : C("ash"), transition: "color .2s" }}>{x.label}</button>
          );
        })}
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === "strength" && (
          <>
            <div style={{ display: "flex", gap: 22 }}>
              <Stat label={t("w.home.cockpit.strIndex")} value={`${state.hpi.components.strength}`} />
              <Stat label={t("w.home.cockpit.lifts")} value={`${recap.lifts}`} />
              <Stat label={t("w.home.today.topMuscle")} value={recap.topMuscle ? cap(recap.topMuscle.muscle) : "—"} />
            </div>
            {state.drivers[0] && <div style={{ fontSize: fs.body, lineHeight: 1.6, marginTop: 14 }}>{state.drivers[0].detail}</div>}
          </>
        )}
        {tab === "endurance" && (
          totals.efforts > 0 ? (
            <>
              <div style={{ display: "flex", gap: 22 }}>
                <Stat label={t("w.home.cockpit.efforts")} value={`${totals.efforts}`} />
                <Stat label={t("w.home.cockpit.km")} value={totals.distanceKm.toLocaleString()} />
                <Stat label={t("w.home.cockpit.min")} value={totals.minutes.toLocaleString()} />
              </div>
              <button onClick={() => setScreen("endurance")} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 14 }}>{t("w.home.cockpit.tab.endurance")} →</button>
            </>
          ) : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.enduranceEmpty")}</div>
        )}
        {tab === "sport" && (
          sport ? (
            <>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle }}>{sport.sport} – {LEVELS[sport.levelIdx] ?? LEVELS[0]}</div>
              <button onClick={() => setScreen("sport")} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 12 }}>{t("w.home.cockpit.sport")} →</button>
            </>
          ) : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.sportEmpty")}</div>
        )}
        {tab === "velocity" && (
          bestProfile ? (
            <>
              <div style={{ display: "flex", gap: 22 }}>
                <Stat label={bestProfile[0]} value={`${Math.round(bestProfile[1].estimated1rm)}kg`} />
                <Stat label="R²" value={bestProfile[1].r2.toFixed(2)} />
                <Stat label={t("w.home.cockpit.points")} value={`${bestProfile[1].n}`} />
              </div>
              <button onClick={() => setScreen("velocity")} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", padding: 0, marginTop: 14 }}>{t("w.home.cockpit.velocity")} →</button>
            </>
          ) : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.velocityBlurb")}</div>
        )}
      </div>
    </div>
  );
}

/* ---------- small primitives ---------- */
function Pill({ children, dot }: { children: React.ReactNode; dot?: string }) {
  return (
    <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 6, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("chalk"), whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: 5, background: dot }} />}
      {children}
    </span>
  );
}

function Section({ title, children, onOpen, openLabel }: { title: string; children: React.ReactNode; onOpen: () => void; openLabel: string }) {
  return (
    <div style={CARD}>
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

function Comp({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, color: C("chalk"), letterSpacing: "-.02em" }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginTop: 6 }}>{label}</div>
    </div>
  );
}

function Watch({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: C("ink2"), padding: "11px 6px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, color: color ?? C("chalk") }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash"), marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Mod({ dot, label, value, onClick, mono, last }: { dot: string; label: string; value: string; onClick: () => void; mono?: boolean; last?: boolean }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", width: "100%", background: "none", border: "none", borderBottom: last ? "none" : `1px solid color-mix(in srgb, ${C("line")} 60%, transparent)`, cursor: "pointer", color: C("chalk"), textAlign: "left" }}>
      <span style={{ width: 7, height: 7, borderRadius: 5, background: dot, flex: "none" }} />
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{label}</span>
      <span style={{ marginLeft: "auto", fontWeight: mono ? 500 : 700, fontSize: mono ? fs.caption : fs.body, fontFamily: mono ? "var(--font-mono)" : "var(--font-display)", color: mono ? C("ash") : C("chalk") }}>{value} →</span>
    </button>
  );
}

/** Readiness/score dial — a ring of TICK MARKS lit up to the value, matching the
 *  Today screen + the mobile kit Ring so the "number effect" reads the same. */
function Ring({ value, color, size = 48, ticks = 32 }: { value: number; color: string; size?: number; ticks?: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const lit = Math.round((pct / 100) * ticks);
  const tickLen = Math.max(4, Math.round(size * 0.16));
  const tickW = Math.max(2, Math.round(size * 0.045));
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center" }}>
      {Array.from({ length: ticks }).map((_, i) => (
        <span key={i} style={{ position: "absolute", top: 0, left: "50%", width: tickW, height: size / 2, transformOrigin: "bottom center", transform: `translateX(-50%) rotate(${(i / ticks) * 360}deg)` }}>
          <span style={{ display: "block", width: tickW, height: tickLen, borderRadius: tickW, background: i < lit ? color : C("line") }} />
        </span>
      ))}
      <span style={{ position: "relative", fontWeight: 800, fontSize: fs.body, color: C("chalk") }}>{Math.round(value)}</span>
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
          <div key={s.key} style={{ ...CARD, padding: 18, opacity: 0.75, display: "flex", alignItems: "center", gap: space.md }}>
            <span style={{ width: 9, height: 9, borderRadius: 5, background: C("lime") }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t(`w.home.cockpit.tease.${s.key}.kicker`)}</div>
              <div style={{ fontSize: fs.caption, marginTop: 4, lineHeight: 1.5 }}>{t(`w.home.cockpit.tease.${s.key}.blurb`)}</div>
            </div>
            <AuroraIcon name="lock" size={18} color={C("ash")} />
          </div>
        ))}
      </div>
      <button onClick={onUnlock} style={{ fontWeight: 700, fontSize: fs.subtitle, color: "var(--on-accent)", background: C("lime"), border: "none", borderRadius: 999, padding: "15px 28px", marginTop: 18, cursor: "pointer" }}>
        {paid ? t("w.home.cockpit.switchToFull") : t("w.home.cockpit.upgradeToFull")}
      </button>
    </div>
  );
}
