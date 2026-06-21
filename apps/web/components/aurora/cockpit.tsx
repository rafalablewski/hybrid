"use client";

import { useEffect, useMemo, useState } from "react";
import { fs, space,
  prescribeSession, computePerformanceState, runTotals, toTrainingLog, velocityProfiles, LEVELS,
  ROLE_COLOR, hpiRole,
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
  const totals = useMemo(() => runTotals(sessions), [sessions]);

  if (persona === "casual") {
    return <Teaser paid={entitlement === "paid"} onUnlock={() => (entitlement === "paid" ? setClientPersona("athlete") : setScreen("upgrade"))} />;
  }

  const hasData = sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      <h1 style={{ fontWeight: 900, fontSize: 28, margin: 0 }}>{t("w.home.cockpit.commandCenter")}</h1>
      <p style={{ fontSize: fs.bodyLg, color: C("ash"), marginTop: 8 }}>{t("w.home.cockpit.commandSub")}</p>

      <div style={{ display: "grid", gap: 14, marginTop: 16 }}>
        <Section title={t("w.home.cockpit.goalSeason")} color="violet" openLabel={macro ? t("w.home.cockpit.periodize") : t("w.home.cockpit.setUp")} onOpen={() => (macro ? setScreen("periodize") : setSetupOpen((v) => !v))}>
          {macro ? (
            <>
              <div style={{ fontWeight: 800, fontSize: fs.heading }}>{macro.goalOrSport}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4 }}>{phaseBlock ? `${phaseBlock.label} · ` : ""}{t("w.home.cockpit.week")} {currentWeek}/{macro.totalWeeks}{macro.eventInWeeks != null ? ` · ${t("w.home.cockpit.eventIn")} ${macro.eventInWeeks} ${t("w.home.cockpit.wk")}` : ""}</div>
            </>
          ) : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.noSeason")}</div>}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("amber") }}>{t("w.home.cockpit.setUpChange")}</span>
              <button onClick={() => setSetupOpen((v) => !v)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("amber"), background: "none", border: "none", cursor: "pointer" }}>{setupOpen ? t("w.home.cockpit.close") : t("w.home.cockpit.openSetup")}</button>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4 }}>{t("w.home.cockpit.fourQuestions")}</div>
            {setupOpen && <div style={{ marginTop: 16 }}><AuroraOnboarding onEnrolled={() => { setSetupOpen(false); onEnrolled(); }} /></div>}
          </div>
        </Section>

        <Section title={hasData ? `${t("w.home.cockpit.todayReadiness")} ${rx.readiness}/100` : t("w.home.cockpit.today")} color="lime" openLabel={t("w.home.cockpit.logSession")} onOpen={() => setScreen("log")}>
          <div style={{ fontWeight: 800, fontSize: fs.title }}>{hasData ? `${rx.blocks[0]?.name}${rx.blocks[1] ? ` + ${rx.blocks[1]?.name}` : ""}` : t("w.home.cockpit.calibrate")}</div>
          {hasData && <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 4, lineHeight: 1.6 }}>{rx.why}</div>}
        </Section>

        <Section title={t("w.home.cockpit.perfTwin")} color="blue" openLabel={t("w.home.cockpit.performance")} onOpen={() => setScreen("performance")}>
          {hasData ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: space.md, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 800, fontSize: 34, color: C(hpiVar(state.hpi.band)) }}>{state.hpi.score}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>HPI · {state.hpi.band} · {t("w.home.cockpit.limiter")} {state.hpi.limiter}</span>
                <span style={{ display: "flex", gap: 14, marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: fs.caption }}>
                  <span style={{ color: C("lime") }}>STR {state.hpi.components.strength}</span>
                  <span style={{ color: C("blue") }}>END {state.hpi.components.endurance}</span>
                  <span style={{ color: C("violet") }}>REC {state.hpi.components.recovery >= 0 ? "+" : ""}{state.hpi.components.recovery}</span>
                </span>
              </div>
              {state.drivers[0] && <div style={{ fontSize: fs.body, lineHeight: 1.6, marginTop: 6 }}>{state.drivers[0].detail}</div>}
            </>
          ) : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.twinEmpty")}</div>}
        </Section>

        <Section title={t("w.home.cockpit.sportSC")} color="amber" openLabel={t("w.home.cockpit.sport")} onOpen={() => setScreen("sport")}>
          {sport ? <div style={{ fontWeight: 700, fontSize: fs.subtitle }}>{sport.sport} · {LEVELS[sport.levelIdx]}</div> : <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.sportEmpty")}</div>}
        </Section>

        <Section title={t("w.home.cockpit.velocityTechnique")} color="blue" openLabel={t("w.home.cockpit.velocity")} onOpen={() => setScreen("velocity")}>
          <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.velocityBlurb")}</div>
        </Section>

        <Section title={t("w.home.cockpit.endurance")} color="lime" openLabel={t("w.home.cockpit.running")} onOpen={() => setScreen("running")}>
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

function Section({ title, color, children, onOpen, openLabel }: { title: string; color: string; children: React.ReactNode; onOpen: () => void; openLabel: string }) {
  return (
    <div style={{ background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "0 6px 22px -12px rgba(0,0,0,.55)", padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: space.sm }}>
          <span style={{ width: 9, height: 9, borderRadius: 5, background: C(color) }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C(color) }}>{title}</span>
        </span>
        <button onClick={onOpen} style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: fs.caption, color: C(color), background: "none", border: "none", cursor: "pointer" }}>{openLabel} →</button>
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: fs.heading }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{label}</div>
    </div>
  );
}

const TEASE: { key: string; color: string }[] = [
  { key: "goalSeason", color: "violet" },
  { key: "todayRoute", color: "lime" },
  { key: "perfTwin", color: "blue" },
  { key: "sportSC", color: "amber" },
  { key: "velocity", color: "blue" },
  { key: "endurance", color: "lime" },
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
            <span style={{ width: 9, height: 9, borderRadius: 5, background: C(s.color) }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C(s.color) }}>{t(`w.home.cockpit.tease.${s.key}.kicker`)}</div>
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
