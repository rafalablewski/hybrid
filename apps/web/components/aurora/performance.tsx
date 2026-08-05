"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { fs, space,
  prescribeSession, computePerformanceState, computeInjuryRisk, computeLoad, performanceTrajectory,
  capabilityTrend, stateVerdict, trajectoryPlot, sessionDaysAgo,
  runTotals, enduranceSessions, personalTrainingLog, velocityProfiles, LEVELS,
  freshnessExplain, type FreshnessPillar,
  weeklyVolumeTrend, fmtTonnage, fmtWeight, paceClock,
  ROLE_COLOR, hpiRole, hpiBandKey, readinessRole, quickCheckinFeeling, READINESS_FACE, localDayKey,
  readinessVerdict, readinessReasonsKey, readinessDeficit, readinessRingTicks, readinessRingSegments,
  readinessFacts, KEPT_ARC_ALPHA,
  INJURY_AREA_KEY,
  type Biometrics, type LoggedSession, type Macrocycle, type CapabilityMovement,
  type ReadinessFact, type RingSegment, type SemanticRole,
} from "@hybrid/core";
import { LINE_HEX, LIME_HEX, BLUE, roleText, tint, accentText } from "@/lib/ui";
import { readSportSelection } from "@/lib/sport-store";
import { useBodyweightLookup } from "@/lib/use-bodyweight";
import { useCheckins } from "@/lib/use-checkins";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useToday } from "@/lib/use-today";
import { HeroScreen } from "./hero";
import TissueCard from "./tissue-card";
import AuroraVolume from "./volume";
import { usePersona, setClientPersona } from "@/lib/persona";
import { useSession } from "@/lib/session";
import { useLang } from "@/lib/i18n";
import { AuroraIcon } from "./icons";
import { CtaLabel } from "./cta-label";
import ReadinessFace from "./readiness-face";
import FreshnessSheet from "./freshness-sheet";

// State colour via the SHARED semantic vocabulary (@hybrid/core semantic.ts),
// resolved through lib/ui's `roleText` — every state colour on this page is
// DRAWN (a figure, a tick, a swatch), never a fill behind something.
const C = (v: string) => `var(--color-${v})`;
/**
 * One run of the readiness ring, painted. The role AND whether the run is held
 * back both come from the segment, so the ring, the proportional bar and the
 * ledger's swatches resolve the same colour from the same field — and neither
 * client can re-derive the kept arc's colour into a collision again. Mirrors
 * mobile's segPaint.
 */
const segPaint = (s: Pick<RingSegment, "role" | "dim">) =>
  s.dim ? tint(roleText(s.role), Math.round(KEPT_ARC_ALPHA * 100)) : roleText(s.role);
const CARD = { background: C("ink2"), border: `1px solid ${C("line")}`, borderRadius: 28, boxShadow: "var(--shadow-card)", padding: 20 } as const;
const PLOT = { width: 318, height: 104, pad: 10 };

/** A signed point contribution, with a REAL minus (U+2212) rather than the
 *  hyphen `${-3}` leaves behind — a hyphen beside a tabular figure reads as a
 *  dash in a sentence, not as a sign. Mirrors mobile's signedPoints. */
const signedPoints = (n: number) => (n < 0 ? `−${Math.abs(n)}` : `+${n}`);

/* ---------- unknown-state placeholders ---------- */
/** One skeleton bar — a placeholder that states nothing. Deliberately not a
 *  shimmer: a second animated element competing with the page's own refresh
 *  affordance is just noise. Mirrors mobile's <Bar>. */
function Bar({ w, h, mt }: { w: number | string; h: number; mt?: number }) {
  return <div style={{ width: w, height: h, borderRadius: h / 2, background: C("line"), opacity: 0.45, marginTop: mt }} />;
}

/** The state card's unknown state — roughly the shape of the real thing (a big
 *  number, a caption, the two component columns) so the card doesn't resize
 *  under the reader when the data lands. */
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
      <div style={{ display: "flex", gap: 12, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ flex: 1, display: "grid", gap: 8 }}><Bar w="55%" h={18} /><Bar w="80%" h={9} /></div>
        ))}
      </div>
    </div>
  );
}

/**
 * AURORA Performance (web) — the athlete hub, at SIX surfaces.
 *
 * It was twenty. Volume and Trends had been absorbed whole and took roughly
 * two thirds of the scroll; eleven cards restated something a neighbour had
 * already said, or said something that belongs on a screen of its own. What is
 * left, in order:
 *
 *   1. MASTHEAD — the season caption, the title, and ONE computed verdict
 *      sentence in place of a subtitle that described the page rather than the
 *      athlete. Two chips: the phase, and the event countdown (the only fact
 *      with no full statement anywhere below).
 *   2. YOUR STATE — the thesis, and the one block that got BIGGER. Freshness
 *      (named for what it computes: 100 − fatigue), the wearable's signed
 *      contribution attached to it rather than impersonating a third index,
 *      the limiter as a sentence, the two freshness columns, the CAPABILITY
 *      trend — the half a "performance" screen was missing — the fourteen-day
 *      plot with its sessions marked, and the readiness ring with its computed
 *      explanation and the check-in nudge.
 *   3. TISSUE — unchanged, minus the protocol (which now lives on Today, where
 *      an injured athlete meets it on the morning they have to do it).
 *   4. THIS WEEK'S VOLUME — the hero shape and a door. The block ramp, the
 *      prescriptions, the muscle rails and the provenance ladder are a
 *      programming tool and went back to being their own screen.
 *   5. SEASON — one card. Goal, phase, progress, and the two controls.
 *   6. GO DEEPER — the exits, every row carrying a live value.
 *
 * Cut on the way: the HPI and ACWR chips (previews of a card within reach),
 * "Your week" (a rolling-seven-day week beside Today's Monday-anchored one —
 * its PRs moved to Today's activity card, which owns the week), the Breakdown
 * tabs (three of four panels duplicated the exit rows verbatim; its one unique
 * line, the top driver, moved into the state card), the band glossary, and the
 * four group markers — six blocks in a deliberate order need no signposting.
 *
 * See audit/10-performance-tab-element-audit-2026-08.md and
 * design/performance-tab-before-after.html.
 */
export default function AuroraPerformance({
  sessions, bio, macro, currentWeek = 1, setScreen, onEnrolled, onOpenSport,
  sessionsReady = true, macroSettled = true,
}: {
  sessions: LoggedSession[];
  bio?: Biometrics;
  macro?: Macrocycle | null;
  currentWeek?: number;
  setScreen: (id: string) => void;
  onEnrolled: () => void;
  /** Opens one sport's own page. A module that names a sport must land on it. */
  onOpenSport?: (sport: string) => void;
  /** SAFE CACHE (lib/read.ts): whether the shell's sessions / macrocycle reads
   *  have a real server answer yet. Without these the page cannot tell "no
   *  training history" from "we haven't asked", and states the zero-case as
   *  fact — "log a session", "No season yet" — at an athlete with years of
   *  data, for as long as the fetch is in flight. Default true so any caller
   *  that already has settled data is unaffected. */
  sessionsReady?: boolean;
  /** Whether the macrocycle read has STOPPED WAITING (answered or failed).
   *  Skeletons gate on this rather than on "ready" so a failed read can't leave
   *  a placeholder up forever — a failed read is never `ready`. */
  macroSettled?: boolean;
}) {
  const { t } = useLang();
  const [sport, setSport] = useState<{ sport: string; levelIdx: number } | null>(null);
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
  // midnight kept treating yesterday's check-in as today's.
  const today = useToday();
  const todayFeeling = useMemo(
    () => quickCheckinFeeling(checkins.find((x) => x && x.weekOf && localDayKey(x.weekOf) === today) ?? null),
    [checkins, today],
  );

  const bw = useBodyweightLookup();
  const log = useMemo(() => personalTrainingLog(sessions), [sessions]);
  // ONE velocityProfiles pass, shared by the prescription and the exits — it
  // used to be computed twice on every render of this page.
  const profiles = useMemo(() => velocityProfiles(sessions), [sessions]);
  const rx = useMemo(() => prescribeSession(log, bio, { profiles, subjectiveReadiness: todayFeeling ?? undefined }), [log, bio, profiles, todayFeeling]);
  // The block's face, and the measured inputs behind its door. `readinessFacts`
  // carries only what the ledger's rows CAN'T — the limiting tissue's own
  // fatigue, the energy-system load, and a wearable nudge that has no row at
  // all when it gave points back.
  const verdictReadiness = useMemo(() => readinessVerdict(log, bio), [log, bio]);
  const facts = useMemo(() => readinessFacts(log, bio), [log, bio]);
  // The ring accounts for the whole 100: what today kept, and what each cause
  // took. `kept` IS the score the figure prints, so the arcs and the number can
  // never be two readings of the same day.
  const deficit = useMemo(() => readinessDeficit(log, bio), [log, bio]);
  const ringTicks = useMemo(() => readinessRingTicks(deficit), [deficit]);
  // The same runs the ticks are built from — the bar below the door draws these
  // directly, so it can't disagree with the arcs above it.
  const ringSegs = useMemo(() => readinessRingSegments(deficit), [deficit]);
  const keptPaint = segPaint({ dim: true, role: readinessRole(deficit.kept) });
  const [whyOpen, setWhyOpen] = useState(false);
  // The provenance line, resolved. A positive wearable nudge has to keep its
  // sign — it's the one fact here that can read either way.
  const factLine = (f: ReadinessFact) =>
    t(f.key)
      .replace("{tissue}", f.muscle ? t(`w.home.today.muscle.${f.muscle}`) : "")
      .replace("{n}", f.value > 0 && f.key === "w.home.readiness.factWearable" ? `+${f.value}` : String(f.value));
  const state = useMemo(() => computePerformanceState(log, bio), [log, bio]);
  // WHICH FRESHNESS COLUMN IS OPEN, and the explanation behind it — computed
  // only while the sheet is up, from the SAME engine the columns print.
  const [freshOpen, setFreshOpen] = useState<FreshnessPillar | null>(null);
  const freshExplain = useMemo(
    () => (freshOpen ? freshnessExplain(freshOpen, log, bio) : null),
    [freshOpen, log, bio],
  );
  const risk = useMemo(() => computeInjuryRisk(log, bio), [log, bio]);
  const load = useMemo(() => computeLoad(sessions), [sessions]);
  const totals = useMemo(() => runTotals(enduranceSessions(sessions)), [sessions]);
  // Capability — the half a "performance" screen was missing. Freshness says
  // whether you can train today; this says whether any of it is working.
  const capability = useMemo(() => capabilityTrend(sessions, { bw }), [sessions, bw]);
  // ONE trajectory pass, feeding BOTH the plot and its own last point. It used
  // to be computed twice, and the copy that fed the sparkline was computed
  // WITHOUT the wearable while the figure beside it was computed with it — two
  // numbers for the same day inside one card. `bio` closes that (see
  // performanceTrajectory).
  const traj = useMemo(() => performanceTrajectory(log, 14, bio), [log, bio]);
  const trained = useMemo(() => sessionDaysAgo(sessions.map((s) => s.startedAt), Date.now()), [sessions]);
  const plot = useMemo(() => trajectoryPlot(traj, trained, PLOT), [traj, trained]);
  const verdict = useMemo(() => stateVerdict(state.hpi, risk), [state.hpi, risk]);
  // The Trends door's value — this week's two figures, from the SAME engine the
  // Trends screen leads with, so the door and what it opens agree.
  const prefs = useLoggerPrefs();
  const weeks = useMemo(() => weeklyVolumeTrend(sessions, 8, Date.now(), prefs.countWarmupsInVolume, bw), [sessions, prefs.countWarmupsInVolume, bw]);

  if (persona === "casual") {
    // The teaser leads with the athlete's OWN freshness — the figure is real,
    // computed from their real log, and only the depth is locked.
    return (
      <Teaser
        paid={entitlement === "paid"}
        onUnlock={() => (entitlement === "paid" ? setClientPersona("athlete", true) : setScreen("upgrade"))}
        state={sessionsReady && sessions.length > 0 ? state : null}
      />
    );
  }

  // Only a legitimate reading once the sessions read is `ready`: before the
  // first response an empty list means "we haven't asked", not "nothing logged".
  const hasData = sessionsReady && sessions.length > 0;
  const phaseBlock = macro?.blocks.find((b) => currentWeek >= b.startWeek && currentWeek <= b.endWeek) ?? macro?.blocks[0];
  const seasonPct = macro && macro.totalWeeks > 0 ? Math.min(100, Math.round((currentWeek / macro.totalWeeks) * 100)) : 0;

  // The verdict sentence: freshness, then the tissue worth watching. It says
  // nothing the two cards below don't also say in full — the only licence a
  // summary above the fold ever has.
  const verdictLine = !hasData
    ? t("w.home.cockpit.verdict.empty")
    : [t(verdict.headKey), verdict.tissueKey && verdict.tissue
        ? t(verdict.tissueKey).replace("{tissue}", t(INJURY_AREA_KEY[verdict.tissue]))
        : null].filter(Boolean).join(" ");

  return (
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* 1 · MASTHEAD — the season caption, the title, and the verdict. */}
      <div style={{ margin: "0 2px" }}>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>
          {macro ? `${macro.goalOrSport} – ${t("w.home.cockpit.week")} ${currentWeek} ${t("w.home.cockpit.of")} ${macro.totalWeeks}` : " "}
        </div>
        <h1 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 34, letterSpacing: "-.03em", lineHeight: 1.1, color: C("chalk"), margin: "2px 0 0" }}>{t("w.home.cockpit.commandCenter")}</h1>
        <p style={{ fontSize: fs.body, lineHeight: 1.5, color: hasData ? C("chalk") : C("ash"), margin: "6px 0 0", maxWidth: "46ch" }}>{verdictLine}</p>
        {(phaseBlock || macro?.eventInWeeks != null) && (
          // Full-bleed chip rail — clips at the screen edge, rests on the column.
          <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", WebkitOverflowScrolling: "touch", margin: "12px calc(-1 * var(--page-pad-x, 16px)) 0", padding: "0 var(--page-pad-x, 16px)" }}>
            {phaseBlock && <Pill dot={C("lime")}><b>{phaseBlock.label}</b> {t("w.home.today.phase")}</Pill>}
            {macro?.eventInWeeks != null && <Pill><AuroraIcon name="calendar-event" size={13} /> <b>{macro.eventInWeeks} {t("w.home.cockpit.wk")}</b> {t("w.home.cockpit.eventIn")}</Pill>}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
        {/* 2 · YOUR STATE — the thesis. Freshness + its wearable contribution,
            the limiter as a sentence, the two freshness columns, capability,
            the plot, and readiness. One card, one computation behind every
            figure in it. */}
        <div style={CARD}>
          <SHead title={t("w.home.cockpit.stateTitle")} />
          {hasData ? (
            <>
              {/* THE HEADLINE — three levels, not two grey lines.
                  It used to set the metric's NAME and the athlete's READING at
                  identical weight ("FRESHNESS — COMPROMISED", one mono ash rule
                  joined by a dash), so nothing said which of the two was the
                  fact; the band went uncoloured beside a numeral that was
                  coloured, splitting one state across two treatments 8px apart;
                  and the band word itself was the raw engine identifier, English
                  on every locale. Now: label, reading, provenance — each at its
                  own weight, with the band carrying the figure's own colour
                  because they are one fact stated twice. */}
              <div style={{ display: "flex", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 46, lineHeight: 1, color: roleText(hpiRole(state.hpi.band)) }}>{state.hpi.score}</span>
                <div style={{ minWidth: 120, flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>
                    {t("w.home.cockpit.freshness")}
                  </div>
                  <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle, letterSpacing: "-.015em", lineHeight: 1.2, color: roleText(hpiRole(state.hpi.band)), marginTop: 2 }}>
                    {t(hpiBandKey(state.hpi.band))}
                  </div>
                  {/* The wearable rides the headline as the signed adjustment it
                      is (±15), instead of standing as a peer of two 0..100
                      indices in a third column. A real minus sign, not the
                      hyphen `-3` a template literal leaves behind. */}
                  {state.hpi.components.recovery !== 0 && (
                    <div style={{ fontSize: fs.caption, color: C("ash"), marginTop: 4 }}>
                      {t("w.home.cockpit.wearableOf").replace("{n}", signedPoints(state.hpi.components.recovery))}
                    </div>
                  )}
                </div>
              </div>
              {/* The limiter is the one actionable word on the card, so it gets
                  the display face and a sentence — not the tail of a mono
                  caption. The driver detail behind it is the line the Breakdown
                  card used to carry. */}
              <div style={{ fontSize: fs.body, lineHeight: 1.55, marginTop: 12 }}>
                <b style={{ fontWeight: 700 }}>{t(`w.home.cockpit.limiter.${state.hpi.limiter}`)}</b>
                {state.drivers[0] && <span style={{ color: C("ash") }}> {state.drivers[0].detail}.</span>}
              </div>

              {/* THE TWO PILLARS — each column is now a DOOR. They printed a
                  bare numeral under a mono label with nothing behind it: no
                  derivation, no inputs, no statement of what the figure refuses
                  to claim. The ⓘ is the same affordance Today's readiness
                  reading uses for "explain THIS number". */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 16, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
                <Comp label={t("w.home.cockpit.strengthFresh")} value={`${state.hpi.components.strength}`} onExplain={() => setFreshOpen("strength")} explainLabel={t("w.home.fresh.explain")} />
                <Comp label={t("w.home.cockpit.enduranceFresh")} value={`${state.hpi.components.endurance}`} onExplain={() => setFreshOpen("endurance")} explainLabel={t("w.home.fresh.explain")} />
              </div>
              <FreshnessSheet explain={freshExplain} onClose={() => setFreshOpen(null)} />

              {/* CAPABILITY — the other half. Freshness rises on a layoff; this
                  does not. Without it a screen called Performance reports only
                  how rested you are. */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>
                    {t("w.home.cockpit.capability").replace("{n}", String(capability.weeks))}
                  </span>
                  {capability.pct !== null && (
                    <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: fs.subtitle, fontWeight: 700, color: capability.pct >= 0 ? "var(--lime-text)" : "var(--amber-text)" }}>
                      {capability.pct > 0 ? "+" : ""}{capability.pct}%
                    </span>
                  )}
                </div>
                <div style={{ fontSize: fs.caption, lineHeight: 1.6, color: C("ash"), marginTop: 5 }}>
                  {capability.pct === null ? t("w.home.cockpit.capabilityEmpty") : capabilityLine(capability.strength, capability.endurance)}
                </div>
              </div>

              {/* THE PLOT — one series feeding the figure above it, its domain
                  stated, and every logged session marked so a dip can be
                  attributed. Geometry from @hybrid/core so mobile draws the
                  identical shape. */}
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${C("line")}` }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.home.cockpit.last14")}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>
                    {t("w.home.cockpit.shownRange").replace("{lo}", String(plot.lo)).replace("{hi}", String(plot.hi))}
                  </span>
                </div>
                <svg viewBox={`0 0 ${PLOT.width} ${PLOT.height + 12}`} width="100%" height={PLOT.height + 12} style={{ display: "block", marginTop: 8 }} role="img" aria-label={`${t("w.home.cockpit.last14")} — ${t("w.home.cockpit.trajectoryKey")}`}>
                  <line x1={0} y1={plot.baselineY} x2={PLOT.width} y2={plot.baselineY} stroke={LINE_HEX} strokeWidth={1} />
                  {/* Readiness is DASH-encoded, not hue-encoded — Kyoto Hour's
                      muted ramp can't separate two solid hues, so line style
                      carries the identity on both themes. */}
                  <path d={plot.readyD} fill="none" stroke={BLUE} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" />
                  <path d={plot.hpiD} fill="none" stroke={LIME_HEX} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={plot.last.x} cy={plot.last.y} r={3.4} fill={LIME_HEX} />
                  {plot.sessionX.map((x, i) => (
                    <rect key={i} x={x - 1} y={plot.baselineY + 4} width={2} height={8} rx={1} fill={C("ash")} />
                  ))}
                </svg>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), lineHeight: 1.5 }}>{t("w.home.cockpit.trajectoryKey")}</div>
              </div>

              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
                {/* THE MASTHEAD — the ring and the line it draws, as ONE row.
                    The breakdown used to live in this row's right-hand column,
                    which started a third of the way across the card: the rows
                    could never reach the right edge and sat narrower than the
                    prose beneath them. Everything below the headline is now a
                    sibling of this row, at full card width. */}
                <div style={{ display: "flex", alignItems: "center", gap: space.md }}>
                  {/* THE DEFICIT RING — the kept run in the readiness band's own
                      colour HELD BACK to KEPT_ARC_ALPHA, then one run per cause
                      at full strength. Both the role and the holding-back come
                      from the segment (see readiness-deficit.ts): deriving the
                      kept colour here is what let a −3 wearable share its hue
                      with 17 ticks of kept score. */}
                  <Ring
                    value={deficit.kept}
                    color={roleText(readinessRole(deficit.kept))}
                    size={56}
                    tickColors={ringTicks.map(segPaint)}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t("w.home.cockpit.todayReadiness")}</div>
                    {/* THE FACE — one line, naming the limiter and nothing else. */}
                    <div style={{ fontSize: fs.subtitle, fontWeight: 700, letterSpacing: "-.015em", color: C("chalk"), marginTop: 4, maxWidth: "36ch" }}>
                      {t(verdictReadiness.key).replace(
                        "{tissue}",
                        verdictReadiness.muscle ? t(`w.home.today.muscle.${verdictReadiness.muscle}`) : "",
                      )}
                    </div>
                  </div>
                </div>

                {/* READINESS NUDGE — the one-tap check-in moved today's load;
                    glanceable, tinted in the feeling's own accent. Absent on a
                    neutral ("good") day. On its OWN line now: inside the old
                    column it had ~24 characters to work with and broke
                    mid-sentence. Mirrors mobile. */}
                {rx.readinessAdjust && (() => {
                  const adj = rx.readinessAdjust!;
                  const tint = C(READINESS_FACE[adj.feeling].accent);
                  const key = adj.loadPct === undefined ? "rxWreckedBw" : adj.feeling === "primed" ? "rxPrimed" : adj.feeling === "flat" ? "rxFlat" : "rxWrecked";
                  const label = t(`w.home.today.${key}`).replace("{pct}", String(adj.loadPct ?? ""));
                  return (
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 12, padding: "5px 12px", borderRadius: 999, background: `color-mix(in srgb, ${tint} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${tint} 34%, transparent)` }}>
                      <ReadinessFace feeling={adj.feeling} size={15} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, letterSpacing: ".08em", color: `var(--${READINESS_FACE[adj.feeling].accent}-text)` }}>{label}</span>
                    </div>
                  );
                })()}

                {/* THE DOOR — the derivation, one tap down, spanning the card so
                    the count lands on its right edge. It counts the ROWS behind
                    it, so it can't promise three reasons and open onto two. */}
                {deficit.costs.length > 0 && verdictReadiness.kind !== "empty" && (
                  <div>
                    <button
                      type="button"
                      className="pressable"
                      aria-expanded={whyOpen}
                      onClick={() => setWhyOpen((v) => !v)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, width: "100%", background: "none", border: 0, margin: "14px 0 0", padding: "11px 0 0", borderTop: `1px solid ${C("line")}`, cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}
                    >
                      <span>{t(verdictReadiness.doorKey).replace("{n}", String(verdictReadiness.deficit))}</span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: C("chalk"), fontWeight: 600 }}>
                        {t(readinessReasonsKey(verdictReadiness.reasons)).replace("{n}", String(verdictReadiness.reasons))}
                        <span aria-hidden style={{ fontSize: 8 }}>{whyOpen ? "▲" : "▼"}</span>
                      </span>
                    </button>
                    {whyOpen && (
                      <>
                        {/* THE BAR — the ring's own runs, straightened out. It
                            reads the SAME segments the arcs do, so the two
                            cannot disagree, and a share too small to see as an
                            arc is too small to see here as well. */}
                        <div style={{ display: "flex", gap: 2, height: 10, marginTop: 12 }} aria-hidden>
                          {ringSegs.map((s, i) => (
                            <span key={i} style={{ flex: s.points, minWidth: 6, borderRadius: 2, background: segPaint(s) }} />
                          ))}
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".1em", color: C("ash") }}>
                          <span>{t("w.home.readiness.barKept").replace("{n}", String(deficit.kept))}</span>
                          <span>{t("w.home.readiness.barSpent").replace("{n}", String(deficit.deficit))}</span>
                        </div>

                        {/* THE LEDGER — the arcs, as arithmetic you can audit.
                            Same points, same order, same paint as the ring; the
                            engine guarantees the rows sum to the figure inside
                            it. The total carries the kept swatch, so every
                            colour on the ring is named by a row. */}
                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: "7px 10px", alignItems: "center", marginTop: 14, fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash") }}>
                          <span />
                          <span>{t("w.home.readiness.baseline")}</span>
                          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>100</span>
                          {deficit.costs.map((c, i) => (
                            <Fragment key={i}>
                              <span style={{ width: 8, height: 8, borderRadius: 2, background: roleText(c.role) }} />
                              <span>{t(c.key).replace("{tissue}", c.muscle ? t(`w.home.today.muscle.${c.muscle}`) : "")}</span>
                              <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: roleText(c.role) }}>−{c.points}</span>
                            </Fragment>
                          ))}
                          <span style={{ gridColumn: "1 / -1", height: 1, background: C("line") }} />
                          <span style={{ width: 8, height: 8, borderRadius: 2, background: keptPaint }} />
                          <span style={{ color: C("chalk"), fontWeight: 700 }}>{t("w.home.readiness.total")}</span>
                          <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: C("chalk"), fontWeight: 700 }}>{deficit.kept}</span>
                        </div>

                        {/* PROVENANCE — the measured inputs the rows can't
                            carry. This replaces three sentences that restated
                            the rows in English-only prose. */}
                        {facts.length > 0 && (
                          <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".09em", lineHeight: 1.6, color: C("ash") }}>
                            {`${t("w.home.readiness.provFrom")} – ${facts.map(factLine).join(", ")}`}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : sessionsReady ? (
            <div style={{ fontSize: fs.body, lineHeight: 1.6 }}>{t("w.home.cockpit.twinEmpty")}</div>
          ) : (
            <StateSkeleton />
          )}
        </div>

        {/* 3 · TISSUE — injury risk, the seven tissues, and the way into a
            protocol. Its SHAPE is the signal: short while nothing is wrong,
            opening itself the moment a tissue is flagged. */}
        <TissueCard risk={risk} load={load} hasData={hasData} onOpenToday={() => setScreen("today")} />

        {/* 4 · THIS WEEK'S VOLUME — the hero shape, the verdict that names
            names, and the rest of it in a drawer. The block ramp, the
            prescriptions and the muscle rails now ease open UNDERNEATH the
            columns that raised the question rather than living on another
            screen; the provenance ladder and the working are dispatched from
            there as a sheet. */}
        {/* The model editor has to be reachable from HERE too: the drawer's
            provenance sheet offers "Next — Training age →", and without a
            destination that row renders its arrow and does nothing. */}
        <AuroraVolume sessions={sessions} compact onOpenModel={() => setScreen("volume-model")} />

        {/* 5 · SEASON — one card. The bar draws the fraction, so the line names
            the week once instead of restating it as a percentage. */}
        <div style={CARD}>
          {/* The HEADING is itself a claim ("Set up" vs the goal's name) — hold
              it until enrollment is known, or an enrolled athlete is briefly
              told to set up a season they already have. */}
          <SHead
            title={!macroSettled ? " " : macro ? macro.goalOrSport : t("w.home.cockpit.setUp")}
            meta={macro && phaseBlock ? phaseBlock.label : undefined}
          />
          {macro ? (
            <>
              <div style={{ height: 6, borderRadius: 999, background: C("ink"), border: `1px solid ${C("line")}`, overflow: "hidden", margin: "2px 0 10px" }}>
                <div style={{ width: `${seasonPct}%`, height: "100%", background: C("violet") }} />
              </div>
              <div style={{ fontSize: fs.caption, color: C("ash"), lineHeight: 1.5 }}>
                {t("w.home.cockpit.seasonWeekOf").replace("{n}", String(currentWeek)).replace("{total}", String(macro.totalWeeks))}
              </div>
            </>
          ) : macroSettled ? (
            <div style={{ fontSize: fs.caption, lineHeight: 1.6, color: C("ash") }}>{t("w.home.cockpit.fourQuestions")}</div>
          ) : <Bar w="90%" h={12} />}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
            {macro && <TextAction onClick={() => setScreen("periodize")} label={t("w.home.cockpit.periodize")} />}
            {/* Enrolment is a DESTINATION, not a disclosure that unfolds under
                the athlete mid-scroll with the old season still rendered
                beneath it. Web used to expand the whole flow inline while
                mobile routed; both route now. */}
            <TextAction onClick={() => { onEnrolled(); setScreen("onboarding"); }} label={macro ? t("w.home.cockpit.changeSeason") : t("w.home.cockpit.openSetup").replace(" →", "")} />
          </div>
        </div>

        {/* 6 · GO DEEPER — the exits. Every row carries a live value, because a
            door that tells you what is behind it is the only kind worth a row. */}
        <div style={CARD}>
          <SHead title={t("w.home.cockpit.deeper")} />
          <Mod
            label={t("w.home.cockpit.trends")}
            value={trendsValue(weeks, prefs.units, t) ?? t("w.home.cockpit.last7")}
            onClick={() => setScreen("trends")}
          />
          <Mod
            label={t("w.home.cockpit.endurance")}
            value={totals.efforts > 0 ? `${totals.efforts} ${t("w.home.cockpit.efforts")} – ${totals.distanceKm.toLocaleString()} km` : t("w.home.cockpit.tab.endurance")}
            onClick={() => setScreen("endurance")}
          />
          <Mod
            label={t("w.home.cockpit.velocity")}
            value={velocityValue(profiles) ?? t("w.home.cockpit.velocityValue")}
            onClick={() => setScreen("velocity")}
          />
          <Mod
            label={t("w.home.cockpit.sportSC")}
            value={sport ? `${sport.sport} – ${LEVELS[sport.levelIdx] ?? LEVELS[0]}` : t("w.home.cockpit.sport")}
            onClick={() => (sport && onOpenSport ? onOpenSport(sport.sport) : setScreen("sport"))}
          />
          <Mod label={t("w.home.cockpit.askCoach")} value={coachQuestion(t, hasData, verdict, capability, state.hpi.limiter)} onClick={() => setScreen("aicoach")} last />
        </div>
      </div>
    </div>
  );
}

/* ---------- capability copy ---------- */
/** The evidence under the capability percent: one lift and one paced move, in
 *  their OWN units. A lift is kilograms and a run is a pace — they share a line
 *  but never a number. */
function capabilityLine(strength: CapabilityMovement | null, endurance: CapabilityMovement | null): string {
  const parts: string[] = [];
  if (strength) parts.push(`${strength.name} ${fmtWeight(strength.from, "kg")} → ${fmtWeight(strength.to, "kg")}`);
  if (endurance) parts.push(`${endurance.name} ${paceClock(endurance.from)} → ${paceClock(endurance.to)} /km`);
  return parts.join(". ");
}

/** The Trends door's value — the week's sets and tonnage, which is exactly what
 *  the Trends sheet leads with. A door that tells you what is behind it. */
function trendsValue(weeks: ReturnType<typeof weeklyVolumeTrend>, units: "kg" | "lb", t: (k: string) => string): string | null {
  const last = weeks[weeks.length - 1];
  if (!last || (last.sets === 0 && last.tonnage === 0)) return null;
  return `${last.sets} ${t("w.home.cockpit.sets").toLowerCase()} – ${fmtTonnage(last.tonnage, units)}`;
}

/**
 * THE COACH DOOR'S VALUE — the question it would ask now.
 *
 * "Ask about today" was a static string on a row whose whole pattern promises a
 * value, so it was the one door that could not be glanced. The question is
 * generated from what this page is already holding, in priority order: a
 * flagged tissue outranks a stalled lift, which outranks the day's limiter.
 */
function coachQuestion(
  t: (k: string) => string,
  hasData: boolean,
  verdict: ReturnType<typeof stateVerdict>,
  capability: ReturnType<typeof capabilityTrend>,
  limiter: string,
): string {
  if (!hasData) return t("w.home.cockpit.aiCoachValue");
  if (verdict.tissue) return t("w.home.cockpit.ask.tissue").replace("{tissue}", t(INJURY_AREA_KEY[verdict.tissue]).toLowerCase());
  const stalled = capability.movements.find((m) => m.pct < 0);
  if (stalled) return t("w.home.cockpit.ask.stalled").replace("{lift}", stalled.name);
  return t(`w.home.cockpit.ask.limiter.${limiter}`);
}

/** The velocity door's value — the profile it would actually open with. */
function velocityValue(profiles: ReturnType<typeof velocityProfiles>): string | null {
  const best = Object.entries(profiles).filter(([, p]) => p.estimated1rm > 0).sort((a, b) => b[1].estimated1rm - a[1].estimated1rm)[0];
  return best ? `${best[0]} ${Math.round(best[1].estimated1rm)}kg – R² ${best[1].r2.toFixed(2)}` : null;
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
        ? <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{meta}</span>
        : meta)}
    </div>
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

/**
 * One pillar column, and the door under it.
 *
 * The WHOLE column is the hit target — a 9px mono label beside an 18px ⓘ is
 * not a tap target anyone finds on a phone — with the ⓘ riding the label row as
 * the visible affordance, exactly as Today's readiness reading does it.
 */
function Comp({ label, value, onExplain, explainLabel }: {
  label: string;
  value: string;
  onExplain: () => void;
  explainLabel: string;
}) {
  return (
    <button
      type="button"
      className="pressable"
      onClick={onExplain}
      aria-label={`${label} ${value} – ${explainLabel}`}
      style={{ display: "block", width: "100%", textAlign: "center", background: "none", border: 0, padding: 0, cursor: "pointer", color: C("chalk") }}
    >
      <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 24, color: C("chalk"), letterSpacing: "-.02em" }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 6 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{label}</span>
        {/* The glyph IS a ring — wrapping it in a second bordered circle, as the
            Today reading does at 18px, reads as noise beside a 9px label. */}
        <AuroraIcon name="info" size={13} color={C("ash")} style={{ flex: "none" }} />
      </div>
    </button>
  );
}

function TextAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button className="pressable" onClick={onClick} style={{ fontFamily: "var(--font-mono)", fontSize: fs.caption, color: "var(--lime-text)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
      <CtaLabel size={12}>{`${label} →`}</CtaLabel>
    </button>
  );
}

function Mod({ label, value, onClick, last }: { label: string; value: string; onClick: () => void; last?: boolean }) {
  return (
    <button className="pressable" onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 0", width: "100%", background: "none", border: "none", borderBottom: last ? "none" : `1px solid color-mix(in srgb, ${C("line")} 60%, transparent)`, cursor: "pointer", color: C("chalk"), textAlign: "left" }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), flex: "none" }}>{label}</span>
      <span style={{ marginLeft: "auto", fontWeight: 500, fontSize: fs.caption, fontFamily: "var(--font-mono)", color: C("ash"), textAlign: "right" }}><CtaLabel size={12}>{`${value} →`}</CtaLabel></span>
    </button>
  );
}

/** Readiness/score dial — a ring of TICK MARKS lit up to the value, matching the
 *  Today screen + the mobile kit Ring so the "number effect" reads the same. */
/**
 * The readiness ring. `tickColors` turns it from a gauge of what's KEPT into an
 * account of the whole 100 — one run of ticks per cause, so the number explains
 * itself instead of carrying a paragraph beside it. Without that prop it is the
 * plain gauge every other caller still wants.
 */
function Ring({ value, color, size = 48, ticks = 32, tickColors }: { value: number; color: string; size?: number; ticks?: number; tickColors?: string[] }) {
  const pct = Math.max(0, Math.min(100, value));
  const lit = Math.round((pct / 100) * ticks);
  const tickLen = Math.max(4, Math.round(size * 0.16));
  const tickW = Math.max(2, Math.round(size * 0.045));
  const count = tickColors?.length ?? ticks;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0, display: "grid", placeItems: "center" }}>
      {Array.from({ length: count }).map((_, i) => (
        <span key={i} style={{ position: "absolute", top: 0, left: "50%", width: tickW, height: size / 2, transformOrigin: "bottom center", transform: `translateX(-50%) rotate(${(i / count) * 360}deg)` }}>
          <span style={{ display: "block", width: tickW, height: tickLen, borderRadius: tickW, background: tickColors ? tickColors[i] : i < lit ? color : C("line") }} />
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

/**
 * THE TEASER — one real figure, then the locked depth.
 *
 * It used to be six identical padlocked rows: a wall that told a free user
 * nothing about what the feature would say about THEM. It now leads with the
 * athlete's own freshness, computed from their own log by the same engine the
 * full page uses, and locks what sits behind it. A teaser that demonstrates
 * beats a teaser that lists.
 *
 * With no logged training there is no figure to show and none is invented —
 * the list stands alone, exactly as it did.
 */
function Teaser({ paid, onUnlock, state }: {
  paid: boolean;
  onUnlock: () => void;
  /** The athlete's real state, or null when they have nothing logged yet. */
  state: ReturnType<typeof computePerformanceState> | null;
}) {
  const { t } = useLang();
  return (
    <HeroScreen hero={{ rank: "title", title: t("w.home.cockpit.teaseTitle") }}>
    <div style={{ maxWidth: "100%", margin: "0 auto", fontFamily: "var(--font-display)", color: C("chalk") }}>
      {state && (
        <div style={{ ...CARD, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: space.md, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 46, lineHeight: 1, color: roleText(hpiRole(state.hpi.band)) }}>{state.hpi.score}</span>
            <div style={{ minWidth: 120, flex: 1 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>
                {t("w.home.cockpit.freshness")}
              </div>
              <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle, letterSpacing: "-.015em", lineHeight: 1.2, color: roleText(hpiRole(state.hpi.band)), marginTop: 2 }}>
                {t(hpiBandKey(state.hpi.band))}
              </div>
              <div style={{ fontSize: fs.caption, color: C("ash"), marginTop: 4, lineHeight: 1.5 }}>{t("w.home.cockpit.teaseYours")}</div>
            </div>
          </div>
          <div style={{ fontSize: fs.body, lineHeight: 1.55, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C("line")}` }}>
            <b style={{ fontWeight: 700 }}>{t(`w.home.cockpit.limiter.${state.hpi.limiter}`)}</b>
          </div>
        </div>
      )}
      <p style={{ fontSize: fs.bodyLg, lineHeight: 1.6, color: C("ash") }}>{t("w.home.cockpit.teaseSub1")}<b style={{ color: accentText("lime") }}>{t("w.home.cockpit.teaseSub2")}</b>{t("w.home.cockpit.teaseSub3")}</p>
      <div style={{ display: "grid", gap: space.ms, marginTop: 16 }}>
        {TEASE.map((s) => (
          /* No leading marker: a dot in front of a label is decoration, and the
             house rule forbids it. The lock on the right is the semantic one. */
          <div key={s.key} style={{ ...CARD, padding: 16, opacity: 0.75, display: "flex", alignItems: "center", gap: space.md }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash") }}>{t(`w.home.cockpit.tease.${s.key}.kicker`)}</div>
              <div style={{ fontSize: fs.caption, marginTop: 4, lineHeight: 1.5 }}>{t(`w.home.cockpit.tease.${s.key}.blurb`)}</div>
            </div>
            <AuroraIcon name="lock" size={18} color={C("ash")} />
          </div>
        ))}
      </div>
      <button className="pressable" onClick={onUnlock} style={{ fontWeight: 700, fontSize: fs.subtitle, color: "var(--on-accent)", background: C("lime"), border: "none", borderRadius: 999, padding: "16px 28px", marginTop: 16, cursor: "pointer" }}>
        {paid ? t("w.home.cockpit.switchToFull") : t("w.home.cockpit.upgradeToFull")}
      </button>
    </div>
    </HeroScreen>
  );
}
