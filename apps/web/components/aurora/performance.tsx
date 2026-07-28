"use client";

import { useEffect, useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { fs, space,
  prescribeSession, computePerformanceState, computeInjuryRisk, computeLoad, performanceTrajectory, weeklyRecap,
  runTotals, enduranceSessions, personalTrainingLog, velocityProfiles, LEVELS,
  fmtWeight, strengthPrDelta,
  ROLE_COLOR, hpiRole, riskRole, readinessRole, quickCheckinFeeling, READINESS_FACE, readinessWhy, localDayKey,
  RISK_DRIVER_LABEL_KEY, RISK_DRIVER_EXPLAIN_KEY,
  type Biometrics, type LoggedSession, type Macrocycle, type AcwrBand, type RiskDriverKind,
  type MuscleGroup, type TissueRisk, colors,
} from "@hybrid/core";
import { LINE_HEX, ASH, BLUE, LIME_HEX, tip, mono, roleHex } from "@/lib/ui";
import { readSportSelection } from "@/lib/sport-store";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useCheckins } from "@/lib/use-checkins";
import { useToday } from "@/lib/use-today";
import { useIsMobile } from "@/lib/use-media-query";
import AuroraOnboarding from "./onboarding";
import RtpPanel from "../rtp-panel";
import { usePersona, setClientPersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import ReadinessFace from "./readiness-face";

// State colour via the SHARED semantic vocabulary (@hybrid/core semantic.ts).
const hpiVar = (b: string) => ROLE_COLOR[hpiRole(b)];
const riskVar = (b: string) => ROLE_COLOR[riskRole(b)];
const readyVar = (v: number) => ROLE_COLOR[readinessRole(v)];
const bandHex = (b: string) => roleHex(riskRole(b)); // injury-risk scale → hex (SVG body map)
const acwrVar = (b: AcwrBand): string =>
  b === "sweet-spot" ? "lime" : b === "caution" ? "amber" : b === "danger" ? "red" : b === "detraining" ? "blue" : "ash";
const C = (v: string) => `var(--color-${v})`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[-_]/g, " ");
const CARD = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
const SVG_INK2 = colors.ink2;

/* ---------- unknown-state placeholders ---------- */
/** One skeleton bar — a placeholder that states nothing. Deliberately not a
 *  shimmer: a second animated element competing with the page's own refresh
 *  affordance is just noise. Mirrors mobile's <Bar>. */
function Bar({ w, h, mt }: { w: number | string; h: number; mt?: number }) {
  return <div style={{ width: w, height: h, borderRadius: h / 2, background: C("line"), opacity: 0.45, marginTop: mt }} />;
}

/** The Performance State card's unknown state — roughly the shape of the real
 *  thing (a big number, a caption, the three component columns) so the card
 *  doesn't resize under the reader when the data lands. */
function StateSkeleton() {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <Bar w={64} h={40} />
        <div style={{ flex: 1, display: "grid", gap: 8 }}>
          <Bar w="70%" h={11} />
          <Bar w="100%" h={20} />
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 14, paddingTop: 14, borderTop: `1px solid ${C("line")}` }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ flex: 1, display: "grid", gap: 7 }}><Bar w="55%" h={18} /><Bar w="80%" h={9} /></div>
        ))}
      </div>
    </div>
  );
}

/* ---------- tissue body map (from the retired analyze Performance screen) ---------- */
type Region = { tissue: MuscleGroup; x: number; y: number; w: number; h: number };
const FRONT: Region[] = [
  { tissue: "shoulders", x: 8, y: 30, w: 30, h: 14 }, { tissue: "shoulders", x: 82, y: 30, w: 30, h: 14 },
  { tissue: "chest", x: 40, y: 32, w: 40, h: 28 }, { tissue: "triceps", x: 6, y: 46, w: 20, h: 40 },
  { tissue: "triceps", x: 94, y: 46, w: 20, h: 40 }, { tissue: "quads", x: 40, y: 116, w: 18, h: 72 }, { tissue: "quads", x: 62, y: 116, w: 18, h: 72 },
];
const BACK: Region[] = [
  { tissue: "back", x: 40, y: 32, w: 40, h: 46 }, { tissue: "glutes", x: 40, y: 82, w: 40, h: 24 },
  { tissue: "posterior", x: 40, y: 110, w: 18, h: 78 }, { tissue: "posterior", x: 62, y: 110, w: 18, h: 78 },
];

function Figure({ regions, label, byTissue }: { regions: Region[]; label: string; byTissue: Record<string, TissueRisk> }) {
  return (
    <div style={{ textAlign: "center" }}>
      <svg viewBox="0 0 120 200" style={{ width: 130, height: 216 }}>
        <circle cx={60} cy={16} r={11} fill={SVG_INK2} stroke={LINE_HEX} />
        {regions.map((r, i) => {
          const t = byTissue[r.tissue];
          const fill = t && t.risk > 0 ? `${bandHex(t.band)}55` : SVG_INK2;
          const stroke = t && t.risk > 0 ? bandHex(t.band) : LINE_HEX;
          return <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={5} fill={fill} stroke={stroke} strokeWidth={1}><title>{r.tissue}: {t ? `${t.risk}/100 (${t.band})` : "—"}</title></rect>;
        })}
      </svg>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{label}</div>
    </div>
  );
}

/** AURORA Performance (web) — the merged athlete hub (ex-Cockpit + the analyze
 *  Performance screen, one page): living masthead → Performance State (the
 *  classic card: big HPI + sparkline, STR/END/REC columns, readiness + nudge) →
 *  the 14-day trajectory → injury risk (summary card with the tissue body-map +
 *  probability table as a disclosure) → this week → breakdown → horizon →
 *  goal + season → return-to-play. Same live engines as before. */
export default function AuroraPerformance({
  sessions, bio, macro, currentWeek = 1, setScreen, onEnrolled,
  sessionsReady = true, macroReady = true, macroSettled = true,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  setScreen: (id: string) => void;
  onEnrolled: () => void;
  /** SAFE CACHE (lib/read.ts): whether the shell's sessions / macrocycle reads
   *  have a real server answer yet. Without these the page cannot tell "no
   *  training history" from "we haven't asked", and states the zero-case as
   *  fact — "log a session", "No season yet" — at an athlete with years of
   *  data, for as long as the fetch is in flight. Default true so any caller
   *  that already has settled data is unaffected. */
  sessionsReady?: boolean;
  macroReady?: boolean;
  /** Whether the macrocycle read has STOPPED WAITING (answered or failed).
   *  Skeletons gate on this rather than `macroReady` so a failed read can't
   *  leave a placeholder up forever — a failed read is never `ready`. */
  macroSettled?: boolean;
}) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const [sport, setSport] = useState<{ sport: string; levelIdx: number } | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  // Injury-risk depth is a DISCLOSURE: the body map + per-tissue probability
  // table (and the plain-language driver explanations) stay one tap away so the
  // card itself remains a glance.
  const [tissueOpen, setTissueOpen] = useState(false);
  const persona = usePersona();
  const { entitlement } = useSession();

  useEffect(() => {
    const s = readSportSelection();
    if (s?.sport) setSport({ sport: s.sport, levelIdx: typeof s.levelIdx === "number" ? s.levelIdx : 0 });
  }, []);

  // TODAY's readiness FEELING (the one-tap check-in) — fed into prescribeSession
  // so the readiness block reflects, and explains, the load nudge the pick
  // applies to the session (the Today screen no longer previews it).
  const checkinsRead = useCheckins();
  const checkins = checkinsRead.data ?? [];
  // `today` is a DEPENDENCY, not a call to the clock inside the memo. Without
  // it this recomputed only when `checkins` changed, so a tab left open across
  // midnight kept treating yesterday's check-in as today's — and scaled today's
  // prescription off it. See lib/use-today.ts.
  const today = useToday();
  // The readiness ANSWER, not `checkinFeeling`'s average of four different
  // questions — the readiness nudge below renders this feeling's own face next
  // to the words "you're feeling flat today", so it must be what the athlete
  // said rather than a number derived from their sleep and mood.
  const todayFeeling = useMemo(
    () => quickCheckinFeeling(checkins.find((x) => x && x.weekOf && localDayKey(x.weekOf) === today) ?? null),
    [checkins, today],
  );

  const bw = useBodyweightLookup();
  const log = useMemo(() => personalTrainingLog(sessions), [sessions]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles: velocityProfiles(sessions), subjectiveReadiness: todayFeeling ?? undefined }), [log, bio, sessions, todayFeeling]);
  // Truth-based readiness lines — every clause computed from the REAL log +
  // wearable baseline (readinessWhy, @hybrid/core). The old rx.why narrated the
  // session PICK ("Back Squat… I prescribed 4×5 @ 90kg") and invented a lift +
  // load for athletes with no history; that copy stays on the Today flow.
  const whyLines = useMemo(() => readinessWhy(log, bio), [log, bio]);
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const load = useMemo(() => computeLoad(sessions), [sessions]);
  const recap = useMemo(() => weeklyRecap(sessions, Date.now(), bw), [sessions, bw]);
  // "Endurance" = real endurance cardio (runs, swims, rides, rows) — drop
  // racket/team/combat sports so a tennis session doesn't inflate the summary.
  const totals = useMemo(() => runTotals(enduranceSessions(sessions)), [sessions]);
  const profiles = useMemo(() => velocityProfiles(sessions), [sessions]);
  const hpiSeries = useMemo(() => [...performanceTrajectory(log, 14)].sort((a, b) => b.daysAgo - a.daysAgo).map((p) => p.hpi), [log]);
  // The real 14-day trajectory (both series, from the old analyze Performance
  // screen) — its own card right under the state card.
  const traj = useMemo(() =>
    performanceTrajectory(log, 14).map((p) => ({ day: p.daysAgo === 0 ? t("w.analyze.perf.today") : `-${p.daysAgo}d`, HPI: p.hpi, Readiness: p.readiness })),
  [log, t]);
  const byTissue = useMemo(() => Object.fromEntries(risk.tissues.map((ti) => [ti.tissue, ti])) as Record<string, TissueRisk>, [risk]);

  if (persona === "casual") {
    return <Teaser paid={entitlement === "paid"} onUnlock={() => (entitlement === "paid" ? setClientPersona("athlete") : setScreen("upgrade"))} />;
  }

  // Only a legitimate reading once the sessions read is `ready`: before the
  // first response an empty list means "we haven't asked", not "nothing logged".
  const hasData = sessionsReady && sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];
  // Injury risk is exception-driven: a slim all-clear row when nothing's flagged,
  // the full maroon alert only when a tissue needs attention.
  const calm = risk.flagged.length === 0;
  // The distinct risk DRIVERS across flagged tissues, heaviest first — explained
  // in plain language inside the tissue-detail disclosure.
  const driverKinds = ((): RiskDriverKind[] => {
    const weight = new Map<RiskDriverKind, number>();
    for (const ti of risk.flagged) for (const d of ti.drivers) weight.set(d.kind, (weight.get(d.kind) ?? 0) + d.contribution);
    return [...weight.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  })();
  // Season completion %, guarded against a 0 / malformed totalWeeks.
  const seasonPct = macro && macro.totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / macro.totalWeeks) * 100)) : 0;

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* 1 · CONTEXT RAIL — a LIVING MASTHEAD in Today's idiom (mono season
          caption, one oversized editorial headline, a warm sub) + sliding pills
          that scroll with the page. Deliberately the same masthead anatomy as
          Today so the two screens read as siblings: Today answers "what do I
          do?", this page answers "how am I doing?". */}
      <div style={{ margin: "0 2px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: C("ash") }}>
          {macro ? `${macro.goalOrSport} – ${t("w.home.cockpit.week")} ${currentWeek} ${t("w.home.cockpit.of")} ${macro.totalWeeks}` : " "}
        </div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 34, letterSpacing: "-.03em", lineHeight: 1.1, color: C("chalk"), margin: "2px 0 0" }}>{t("w.home.cockpit.commandCenter")}</h1>
        <p style={{ fontSize: fs.body, color: C("ash"), margin: "2px 0 0" }}>{t("w.home.cockpit.commandSub")}</p>
        {(macro || hasData) && (
          // Full-bleed chip rail — clips at the screen edge, rests on the column.
          <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", margin: "10px calc(-1 * var(--page-pad-x, 16px)) 0", padding: "0 var(--page-pad-x, 16px)" }}>
            {phaseBlock && <Pill dot={C("lime")}><b>{phaseBlock.label}</b> {t("w.home.today.phase")}</Pill>}
            {macro?.eventInWeeks != null && <Pill>🏁 <b>{macro.eventInWeeks} {t("w.home.cockpit.wk")}</b> {t("w.home.cockpit.eventIn")}</Pill>}
            {/* ACWR rides on training data, not on having a season — a planless
                athlete still gets their workload ratio at a glance. */}
            {hasData && <Pill>📈 {load.enoughHistory ? `ACWR ${load.acwr.toFixed(2)}` : t("w.home.cockpit.building")}</Pill>}
            {/* The headline number is visible before any scroll. */}
            {hasData && <Pill dot={C(hpiVar(state.hpi.band))}>HPI <b>{state.hpi.score}</b> – {state.hpi.band}</Pill>}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 14 }}>
        {/* 2 · PERFORMANCE STATE — the headline read (the classic anatomy):
            big HPI + band/limiter caption + sparkline, STR/END/REC in three
            columns, the top driver, and today's readiness (with the check-in
            nudge) below. */}
        <div style={CARD}>
          <SHead title={t("w.home.cockpit.perfTwin")} />
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
              <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C("line")}`, display: "flex", alignItems: "flex-start", gap: space.md }}>
                <Ring value={rx.readiness} color={C(readyVar(rx.readiness))} />
                {/* The explanation takes the card's width (flex:1, readable ~62ch
                    measure — the old 36ch cap squeezed it into a skinny column on
                    wide cards) and is split into its sentences so the engine's
                    multi-clause "why" reads as scannable lines, not a wall. */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{t("w.home.cockpit.todayReadiness")}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, maxWidth: "62ch" }}>
                    {whyLines.map((line, i) => (
                      <div key={i} style={{ fontSize: fs.body, lineHeight: 1.6, color: i === 0 ? C("chalk") : C("ash") }}>{line}</div>
                    ))}
                  </div>
                  {/* READINESS NUDGE — the one-tap check-in moved today's load;
                      glanceable, tinted in the feeling's own accent. Absent on a
                      neutral ("good") day. Mirrors mobile. */}
                  {rx.readinessAdjust && (() => {
                    const adj = rx.readinessAdjust!;
                    const tint = C(READINESS_FACE[adj.feeling].accent);
                    const key = adj.loadPct === undefined ? "rxWreckedBw" : adj.feeling === "primed" ? "rxPrimed" : adj.feeling === "flat" ? "rxFlat" : "rxWrecked";
                    const label = t(`w.home.today.${key}`).replace("{pct}", String(adj.loadPct ?? ""));
                    return (
                      <div style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 8, padding: "5px 11px", borderRadius: 999, background: `color-mix(in srgb, ${tint} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${tint} 34%, transparent)` }}>
                        <ReadinessFace feeling={adj.feeling} size={15} />
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: ".01em", color: `var(--${READINESS_FACE[adj.feeling].accent}-text)` }}>{label}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>
            </>
          ) : sessionsReady ? (
            /* A real answer: the athlete genuinely has no logged training. */
            <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.twinEmpty")}</div>
          ) : (
            /* UNKNOWN — the fetch hasn't answered. Rendering twinEmpty here is
               what told athletes with years of history to "log a session". */
            <StateSkeleton />
          )}
        </div>

        {/* 3 · TRAJECTORY — the real 14-day chart (HPI + Readiness) from the old
            analyze screen, right under the state card that summarizes it. */}
        {hasData && (
          <div style={CARD}>
            <SHead
              title={t("w.analyze.perf.trajectory")}
              meta={
                <span style={{ display: "inline-flex", gap: 14, alignItems: "center" }}>
                  <Swatch color={LIME_HEX} label="HPI" />
                  <Swatch color={BLUE} label="Readiness" dashed />
                </span>
              }
            />
            <div style={{ height: 220, marginTop: 6 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={traj}>
                  <CartesianGrid stroke={LINE_HEX} strokeDasharray="3 3" />
                  <XAxis dataKey="day" stroke={ASH} style={mono} tick={{ fontSize: fs.nano }} />
                  <YAxis domain={[0, 100]} stroke={ASH} style={mono} tick={{ fontSize: fs.nano }} />
                  <Tooltip contentStyle={tip} />
                  <Line type="monotone" dataKey="HPI" stroke={LIME_HEX} strokeWidth={2.5} dot={false} />
                  {/* Readiness is DASH-encoded, not hue-encoded — Kyoto Hour's
                      muted ramp can't separate two solid hues, so line style
                      carries the identity on both themes. */}
                  <Line type="monotone" dataKey="Readiness" stroke={BLUE} strokeWidth={2} strokeDasharray="5 4" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* 4 · INJURY RISK — exception-driven summary; the tissue body-map +
            calibrated probability table (the old analyze depth) live in the
            "Tissue detail" disclosure so the glance stays a glance. */}
        {hasData && (
          <div style={{ ...CARD,
            border: calm ? `1px solid ${C("line")}` : `1px solid color-mix(in srgb, ${C("red")} 45%, ${C("line")})`,
            background: calm ? C("ink2") : `linear-gradient(180deg, color-mix(in srgb, ${C("red")} 7%, ${C("ink2")}), ${C("ink2")})` }}>
            <SHead
              title={t("w.home.today.injuryRisk")}
              titleColor={calm ? undefined : "var(--red-text)"}
              meta={<span style={{ fontWeight: 800, fontSize: fs.subtitle, color: C(riskVar(risk.band)) }}>{cap(risk.band)} – {risk.overall}</span>}
            />
            {calm ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("lime") }}>{t("w.home.today.noTissues")}</div>
            ) : (
              <>
                <div style={{ height: 9, borderRadius: 5, background: C("ink"), overflow: "hidden" }}>
                  <div style={{ width: `${risk.overall}%`, height: "100%", background: C(riskVar(risk.band)) }} />
                </div>
                <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: space.sm }}>
                  {risk.flagged.map((ti) => (
                    <div key={ti.tissue} style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, fontWeight: 700, color: C(riskVar(ti.band)), border: `1px solid color-mix(in srgb, ${C(riskVar(ti.band))} 55%, transparent)`, borderRadius: 999, padding: "2px 9px" }}>{ti.risk}</span>
                      <span style={{ fontSize: fs.caption, textTransform: "capitalize" }}>{ti.tissue}</span>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), marginLeft: "auto" }}>{ti.drivers[0] ? t(RISK_DRIVER_LABEL_KEY[ti.drivers[0].kind]) : `ACWR ${ti.acwr.toFixed(2)}`}</span>
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
            {/* A one-line plain-language gloss on ACWR — the ratio the "workload
                spike" driver is built on — so the bare number reads for everyone. */}
            {load.enoughHistory && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), lineHeight: 1.5, marginTop: 8 }}>{t("w.injury.acwrNote")}</div>
            )}

            {/* TISSUE DETAIL — the depth the analyze Performance screen used to
                own: the anterior/posterior body map, the per-tissue calibrated
                probability table, and the plain-language driver explanations. */}
            <div style={{ marginTop: 16, borderTop: `1px dashed color-mix(in srgb, ${C("line")} 80%, ${C("red")})`, paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <button onClick={() => setTissueOpen((v) => !v)} aria-expanded={tissueOpen} style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.micro, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em", color: calm ? "var(--lime-text)" : "var(--red-text)" }}>
                  {t("w.analyze.perf.tissueDetail")} <span aria-hidden style={{ fontSize: 8 }}>{tissueOpen ? "▲" : "▼"}</span>
                </button>
                {/* The model-version annotation the old analyze header carried —
                    always visible, qualifying the risk numbers above and the
                    probability table inside the disclosure. */}
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>{t("w.analyze.perf.model")} {risk.modelVersion} – {t("w.analyze.perf.calibrated")}</span>
              </div>
              {tissueOpen && (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "auto 1fr", gap: 28, marginTop: 14, alignItems: "start" }}>
                    <div style={{ display: "flex", gap: space.lg, justifyContent: isMobile ? "center" : "flex-start" }}>
                      <Figure regions={FRONT} label={t("w.analyze.perf.anterior")} byTissue={byTissue} />
                      <Figure regions={BACK} label={t("w.analyze.perf.posterior")} byTissue={byTissue} />
                    </div>
                    <div style={{ overflowX: "auto", maxWidth: "100%", minWidth: 0 }}>
                      <table style={{ width: "100%", minWidth: 420, borderCollapse: "collapse" }}>
                        <thead>
                          <tr>{["w.analyze.perf.colTissue", "w.analyze.perf.colRisk", "w.analyze.perf.colProb", "w.analyze.perf.colAcwr", "w.analyze.perf.colDriver"].map((h) => (
                            <th key={h} style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", color: C("ash"), textAlign: "left", padding: "6px 8px", borderBottom: `1px solid ${C("line")}` }}>{t(h)}</th>
                          ))}</tr>
                        </thead>
                        <tbody>
                          {risk.tissues.map((ti) => (
                            <tr key={ti.tissue}>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, padding: 8, textTransform: "capitalize", borderBottom: `1px solid ${C("line")}` }}>{cap(ti.tissue)}</td>
                              <td style={{ padding: 8, borderBottom: `1px solid ${C("line")}` }}><span style={{ background: `color-mix(in srgb, ${ti.risk > 0 ? C(riskVar(ti.band)) : C("ash")} 14%, transparent)`, color: ti.risk > 0 ? C(riskVar(ti.band)) : C("ash"), borderRadius: 999, padding: "3px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro }}>{ti.risk}</span></td>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: 8, color: ti.risk > 0 ? C("chalk") : C("ash"), borderBottom: `1px solid ${C("line")}` }}>{(ti.prob * 100).toFixed(1)}%</td>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: 8, color: ti.enoughHistory ? C("chalk") : C("ash"), borderBottom: `1px solid ${C("line")}` }}>{ti.enoughHistory ? ti.acwr.toFixed(2) : "—"}</td>
                              <td style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, padding: 8, color: C("ash"), borderBottom: `1px solid ${C("line")}` }}>{ti.drivers[0] ? t(RISK_DRIVER_LABEL_KEY[ti.drivers[0].kind]) : "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {/* WHY THE DASH — an athlete who IS training but has no chronic
                      baseline yet reads "—" in the ACWR column. Say why, rather
                      than leaving a blank that looks like a broken number. The
                      engine decides who sees this (awaitingBaseline), so web and
                      mobile can never disagree about it. */}
                  {risk.awaitingBaseline.length > 0 && (
                    <div style={{ marginTop: 14, padding: 12, borderRadius: 12, border: `1px solid ${C("line")}`, background: `color-mix(in srgb, ${C("ash")} 8%, transparent)` }}>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash"), marginBottom: 4 }}>{t("w.injury.acwrPending")}</div>
                      <div style={{ fontSize: fs.caption, lineHeight: 1.6, color: C("chalk") }}>{t("w.injury.acwrPendingBody")}</div>
                    </div>
                  )}
                  {/* WHAT'S RAISING THIS? — plain-language guidance for each driver
                      at play (workload spike, high load, return-from-lull, recovery). */}
                  {driverKinds.length > 0 && (
                    <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                      {driverKinds.map((k) => (
                        <div key={k}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C(riskVar(risk.band)), marginBottom: 3 }}>{t(RISK_DRIVER_LABEL_KEY[k])}</div>
                          <div style={{ fontSize: fs.caption, lineHeight: 1.6, color: C("chalk") }}>{t(RISK_DRIVER_EXPLAIN_KEY[k])}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* 5 · THIS WEEK — recap & PRs */}
        {hasData && (
          <button onClick={() => setScreen("statistics")} style={{ ...CARD, width: "100%", textAlign: "left", cursor: "pointer", color: C("chalk"), display: "block" }}>
            <SHead
              title={t("w.home.today.yourWeek")}
              meta={recap.prs.length > 0 ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, fontWeight: 700, color: "var(--on-accent)", background: C("lime"), borderRadius: 999, padding: "3px 11px" }}>🏆 {recap.prs.length} {t("w.home.cockpit.newPrs")}</span> : undefined}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
              <Stat label={t("w.home.today.sessions")} value={`${recap.sessions}`} />
              <Stat label={`${t("w.home.today.volume")} kg`} value={recap.volume.toLocaleString()} />
              <Stat label={t("w.home.today.sets")} value={`${recap.sets}`} />
            </div>
            {recap.prs.length > 0 && (
              <div style={{ marginTop: 14, paddingTop: 4 }}>
                {recap.prs.slice(0, 4).map((p) => (
                  <div key={p.lift} style={{ display: "flex", justifyContent: "space-between", fontFamily: "var(--font-mono)", fontSize: fs.caption, padding: "8px 0", borderTop: `1px solid ${C("line")}` }}>
                    <span>{p.lift}</span>
                    {/* The weight actually lifted (#231) — this row and the session
                        summary describe the same PR, so they must agree. Formatted
                        through the shared helper: topLoad is 0.1-rounded, so a raw
                        subtraction would print +4.799999999999997. */}
                    <span style={{ color: C("lime"), fontWeight: 700 }}>{fmtWeight(p.topLoad, "kg")}{p.previousTopLoad == null || p.topLoad <= p.previousTopLoad ? "" : ` – ${strengthPrDelta(p, { first: "", moreReps: "" })}`}</span>
                  </div>
                ))}
              </div>
            )}
          </button>
        )}

        {/* 6 · BREAKDOWN — disciplines, tabbed */}
        {hasData && <Breakdown state={state} recap={recap} totals={totals} sport={sport} profiles={profiles} setScreen={setScreen} />}

        {/* 7 · HORIZON — Sport S&C · Velocity · Endurance · AI Coach, quick rails out */}
        <div style={CARD}>
          <SHead title={t("w.home.cockpit.horizon")} />
          <Mod label={t("w.home.cockpit.sportSC")} value={sport ? `${sport.sport} – ${LEVELS[sport.levelIdx] ?? LEVELS[0]}` : t("w.home.cockpit.sport")} onClick={() => setScreen("sport")} />
          <Mod label={t("w.home.cockpit.velocity")} value={t("w.home.cockpit.velocityValue")} mono onClick={() => setScreen("velocity")} />
          <Mod label={t("w.home.cockpit.endurance")} value={totals.efforts > 0 ? `${totals.efforts} – ${totals.distanceKm.toLocaleString()} km – ${totals.minutes.toLocaleString()} min` : t("w.home.cockpit.tab.endurance")} mono onClick={() => setScreen("endurance")} />
          {/* The AI coach's one door on the web — the prescription lives here. */}
          <Mod label={t("w.home.cockpit.aiCoach")} value={t("w.home.cockpit.aiCoachValue")} mono onClick={() => setScreen("aicoach")} last />
        </div>

        {/* 8 · GOAL + SEASON — two separate widgets (like Today's RECOVER duo);
            reflows to a single column on very narrow viewports. */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
          {/* widget 1 — goal */}
          <div style={CARD}>
            <SHead title={t("w.home.cockpit.goal")} />
            {macro ? (
              <>
                <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle }}>{macro.goalOrSport}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("violet"), marginTop: 6 }}>{phaseBlock ? `${phaseBlock.label} – ` : ""}{t("w.home.cockpit.week")} {currentWeek}/{macro.totalWeeks}</div>
              </>
            ) : macroSettled ? (
              /* Settled: the server said "not enrolled", or the read failed —
                 either way, stop waiting rather than hanging a placeholder. */
              <div style={{ fontSize: fs.caption, lineHeight: 1.6 }}>{t("w.home.cockpit.noSeason")}</div>
            ) : <Bar w="80%" h={14} />}
          </div>
          {/* widget 2 — season progress / plan controls */}
          <div style={CARD}>
            {/* The HEADING is itself a claim ("Set up" vs "Season") — hold it
                until enrollment is known, or an enrolled athlete is briefly
                told to set up a season they already have. */}
            <SHead title={!macroSettled ? "\u00a0" : macro ? t("w.home.cockpit.season") : t("w.home.cockpit.setUp")} meta={macro ? `${seasonPct}%` : undefined} />
            {macro ? (
              <div style={{ height: 6, borderRadius: 99, background: C("ink"), border: `1px solid ${C("line")}`, overflow: "hidden", margin: "2px 0 12px" }}>
                <div style={{ width: `${seasonPct}%`, height: "100%", background: C("violet") }} />
              </div>
            ) : macroSettled ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2, marginBottom: 10, lineHeight: 1.5 }}>{t("w.home.cockpit.fourQuestions")}</div>
            ) : <div style={{ margin: "2px 0 10px" }}><Bar w="90%" h={12} /></div>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px" }}>
              {macro && <button onClick={() => setScreen("periodize")} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{t("w.home.cockpit.periodize")} →</button>}
              <button onClick={() => setSetupOpen((v) => !v)} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>{setupOpen ? t("w.home.cockpit.close") : t("w.home.cockpit.openSetup")}</button>
            </div>
          </div>
        </div>
        {setupOpen && <div style={CARD}><AuroraOnboarding onEnrolled={() => { setSetupOpen(false); onEnrolled(); }} /></div>}

        {/* 9 · RETURN-TO-PLAY — gated protocols (from the retired analyze screen).
            Bottom placement matches its cadence: empty most days; when a tissue is
            flagged above, the protocol you open lands on the same page. */}
        <RtpPanel />
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
      <SHead title={t("w.home.cockpit.breakdown")} />
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
/** SectionHead — the golden-standard card header (Explore's SectionHead idiom):
 *  a bold display-face title on the left, any meta/action as small mono
 *  uppercase (or a pill) on the RIGHT of the same row. No decorative dot. */
function SHead({ title, meta, titleColor }: { title: string; meta?: React.ReactNode; titleColor?: string }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", justifyContent: "space-between", gap: "4px 12px", marginBottom: 12 }}>
      <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 18, letterSpacing: "-.01em", color: titleColor ?? C("chalk") }}>{title}</span>
      {meta != null && (typeof meta === "string"
        ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{meta}</span>
        : meta)}
    </div>
  );
}

/** Chart-legend swatch — line style carries series identity (readiness is dashed). */
function Swatch({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash") }}>
      <svg width="16" height="4" aria-hidden><line x1="0" y1="2" x2="16" y2="2" stroke={color} strokeWidth={dashed ? 2 : 2.5} strokeDasharray={dashed ? "4 3" : undefined} /></svg>
      {label}
    </span>
  );
}

function Pill({ children, dot }: { children: React.ReactNode; dot?: string }) {
  return (
    <span style={{ flex: "none", display: "inline-flex", alignItems: "center", gap: 6, background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "6px 12px", fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("chalk"), whiteSpace: "nowrap" }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: 5, background: dot }} />}
      {children}
    </span>
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

/** Dependency-free sparkline — scaled bars, latest highlighted. The state card's
 *  at-a-glance pulse; the full two-series chart lives in the Trajectory card. */
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

function Watch({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ background: C("ink2"), padding: "11px 6px", textAlign: "center" }}>
      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.body, color: color ?? C("chalk") }}>{value}</div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, textTransform: "uppercase", letterSpacing: ".06em", color: C("ash"), marginTop: 4 }}>{label}</div>
    </div>
  );
}

function Mod({ label, value, onClick, mono: monoVal, last }: { label: string; value: string; onClick: () => void; mono?: boolean; last?: boolean }) {
  return (
    <button onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 0", width: "100%", background: "none", border: "none", borderBottom: last ? "none" : `1px solid color-mix(in srgb, ${C("line")} 60%, transparent)`, cursor: "pointer", color: C("chalk"), textAlign: "left" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>{label}</span>
      <span style={{ marginLeft: "auto", fontWeight: monoVal ? 500 : 700, fontSize: monoVal ? fs.caption : fs.body, fontFamily: monoVal ? "var(--font-mono)" : "var(--font-display)", color: monoVal ? C("ash") : C("chalk") }}>{value} →</span>
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
