"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LEVELS,
  SPORT_PAGE_WEEKS,
  ago,
  cardioDiscipline,
  heroMetaLine,
  fs,
  markerHistory,
  recordMarker,
  space,
  sportDistance,
  sportPace,
  sportMarkPaths,
  sportPageModel,
  transferSessionBlocks,
  type SessionBlock,
  type SportBest,
  type SportPageModel,
} from "@hybrid/core";
import { useSessions } from "@/lib/use-sessions";
import { readSportSelection, writeSportSelection } from "@/lib/sport-store";
import { useLang } from "@/lib/i18n";
import { HeroScreen } from "./hero";
import { DeviceMark } from "./device-mark";
import { CtaLabel } from "./cta-label";

/**
 * THE SPORT PAGE (web) — the exact twin of
 * apps/mobile/components/aurora/sport-page.tsx.
 *
 * Both clients render `sportPageModel()` from @hybrid/core and nothing else, so
 * neither can decide on its own that a sport has a pace, a distance or a
 * strength block: the catalog record decides, once, for both.
 *
 * The charts are hand-drawn (CSS bars + one inline SVG path) rather than
 * charted through a library. The mobile twin draws the identical geometry with
 * react-native-svg off the same numbers — a library on one side and a hand
 * drawing on the other is exactly how two clients stop looking like one
 * product.
 */

const C = (v: string) => `var(--color-${v})`;
const mono = (size: number, color = C("ash")) => ({ fontFamily: "var(--font-mono)", fontSize: size, color }) as const;
const label = (color = C("ash")) => ({ ...mono(fs.micro, color), letterSpacing: ".12em", textTransform: "uppercase" as const });

/** The section head, per the Explore SectionHead standard: a display-face title
 *  on the left, mono uppercase meta on the RIGHT — never a marker on the left. */
function SectionHead({ title, meta }: { title: string; meta?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: space.md, marginBottom: space.md }}>
      <h2 style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, letterSpacing: "-.01em", color: C("chalk"), margin: 0 }}>{title}</h2>
      {!!meta && <span style={{ ...label(), whiteSpace: "nowrap" }}>{meta}</span>}
    </div>
  );
}

/** Where a figure came from: the device's lockup in white (the device said so)
 *  or the word "typed". Never on an aggregate — a week has no recording. */
function Provenance({ provider, t }: { provider: string | null; t: (k: string) => string }) {
  if (!provider) return <span style={label()}>{t("w.train.sportPage.markerTyped")}</span>;
  return <DeviceMark provider={provider} form="lockup" height={9} on="dark" style={{ verticalAlign: "-1px" }} />;
}

/* ── the two charts ──────────────────────────────────────────────────────── */

function VolumeBars({ weeks, avg }: { weeks: { value: number }[]; avg: number }) {
  const max = Math.max(...weeks.map((w) => w.value), 1);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 6, height: 110 }}>
      {weeks.map((w, i) => (
        <span
          key={i}
          style={{
            flex: 1,
            minHeight: 3,
            height: Math.max(3, (w.value / max) * 110),
            borderRadius: "3px 3px 2px 2px",
            background: i === weeks.length - 1 ? C("lime") : `color-mix(in srgb, ${C("lime")} 42%, ${C("ink")})`,
          }}
        />
      ))}
      {avg > 0 && (
        <span aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: (avg / max) * 110, borderTop: `1px dashed color-mix(in srgb, ${C("ash")} 55%, transparent)` }} />
      )}
    </div>
  );
}

/** The pace trend — reversed, so FASTER sits higher. The personal best carries
 *  a dot, drawn in HTML because the path is stretched to the column's width and
 *  a circle inside a stretched viewBox comes out an ellipse. */
function PaceTrend({ trend, prIndex }: { trend: number[]; prIndex: number }) {
  const W = 326, H = 118, PAD = 10;
  const min = Math.min(...trend), max = Math.max(...trend);
  const span = Math.max(1, max - min);
  const pts = trend.map((v, i) => [PAD + i * ((W - PAD * 2) / Math.max(1, trend.length - 1)), PAD + ((v - min) / span) * (H - PAD * 2.6)] as const);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L${pts[pts.length - 1]![0].toFixed(1)} ${H} L${pts[0]![0].toFixed(1)} ${H} Z`;
  const pr = pts[Math.min(Math.max(prIndex, 0), pts.length - 1)]!;
  return (
    <div style={{ position: "relative" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden style={{ display: "block", width: "100%", height: H }}>
        <defs>
          <linearGradient id="sportPaceFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C("lime")} stopOpacity={0.22} />
            <stop offset="100%" stopColor={C("lime")} stopOpacity={0} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sportPaceFill)" />
        <path d={d} fill="none" stroke={C("lime")} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span
        aria-hidden
        style={{
          position: "absolute", left: `${(pr[0] / W) * 100}%`, top: `${(pr[1] / H) * 100}%`,
          width: 9, height: 9, borderRadius: 999, background: C("lime"),
          border: `2px solid ${C("ink")}`, transform: "translate(-50%,-50%)",
        }}
      />
    </div>
  );
}

/* ── the page ────────────────────────────────────────────────────────────── */

export default function AuroraSportPage({
  name,
  onBack,
  onLogSession,
  onOpenSession,
}: {
  name: string;
  onBack?: () => void;
  onLogSession?: (blocks: SessionBlock[]) => void;
  onOpenSession?: (id: string) => void;
}) {
  const { t } = useLang();
  const { sessions } = useSessions();
  const [levelIdx, setLevelIdx] = useState(0);
  const [store, setStore] = useState(() => readSportSelection());
  const [draft, setDraft] = useState<string | null>(null);

  useEffect(() => {
    const s = readSportSelection();
    setStore(s);
    if (typeof s?.levelIdx === "number" && s.levelIdx >= 0 && s.levelIdx < LEVELS.length) setLevelIdx(s.levelIdx);
  }, []);

  const markers = useMemo(() => markerHistory(store, name), [store, name]);
  const m: SportPageModel = useMemo(
    () => sportPageModel(name, sessions, { levelIdx, markers }),
    [name, sessions, levelIdx, markers],
  );

  const persist = (next: ReturnType<typeof readSportSelection>) => {
    setStore(next);
    writeSportSelection(next ?? {});
  };
  const pickLevel = (i: number) => {
    setLevelIdx(i);
    persist({ ...(store ?? {}), sport: name, levelIdx: i });
  };
  const saveMarker = (value: string) => {
    persist(recordMarker(store, name, value, new Date().toISOString()));
    setDraft(null);
  };

  const unitLabel = m.distanceUnit === "m" ? t("w.train.sportPage.metres") : t("w.train.sportPage.kilometres");
  const totalLabel = (id: string, unit: string | null) =>
    id === "efforts" ? t("w.train.sportPage.efforts")
      : id === "distance" ? unitLabel
      : id === "hours" ? t("w.train.sportPage.hours")
      : unit ? t("w.train.sportPage.thisWeek") : t("w.train.sportPage.minThisWeek");
  const bestLabel = (b: SportBest) =>
    b.id === "fastest" ? t("w.train.sportPage.fastest")
      : b.id === "longest" ? t("w.train.sportPage.longest")
      : b.id === "longestSession" ? t("w.train.sportPage.longestSession")
      : t("w.train.sportPage.biggestWeek");
  const primaryLabel =
    m.primary.kind === "marker" ? (m.primary.label ?? "")
      : m.primary.kind === "pace" ? t("w.train.sportPage.bestPace")
      : m.primary.kind === "distance" ? t("w.train.sportPage.totalDistance")
      : t("w.train.sportPage.timeLogged");
  const fmtDate = (iso: string) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "");
  const weeksMeta = t("w.train.sportPage.weeksAvg")
    .replace("{weeks}", String(SPORT_PAGE_WEEKS))
    .replace("{avg}", m.hasDistance ? `${sportDistance(m.distanceUnit === "m" ? m.weekAvg / 1000 : m.weekAvg, m.distanceUnit)} ${m.distanceUnit}` : `${Math.round(m.weekAvg)} min`);

  const sectionStyle = { marginTop: space.xxl } as const;
  const rowStyle = { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: space.md, padding: `${space.md}px 0`, borderTop: `1px solid ${C("line")}` } as const;

  return (
    <HeroScreen
      hero={{
        rank: "cover",
        title: name,
        eyebrow: heroMetaLine([m.category, m.family]),
        // The drawn mark for this KIND of sport; the catalog emoji only when
        // the name is not in the catalog at all (a hand-typed activity).
        artPaths: sportMarkPaths(name),
        glyph: m.icon,
        meta: [
          m.meta.efforts > 0 ? t("w.train.sportPage.effortsMeta").replace("{n}", String(m.meta.efforts)) : null,
          m.meta.distance ? `${m.meta.distance} ${m.meta.distanceUnit}` : null,
          m.meta.firstAt ? t("w.train.sportPage.since").replace("{date}", new Date(m.meta.firstAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })) : null,
        ],
      }}
      back={onBack}
      accessory={m.transfer ? <span style={label(C("chalk"))}>{LEVELS[levelIdx]}</span> : undefined}
      dock={
        onLogSession ? (
          // The system's docked pill — the same bare, shadowed pill the plan
          // cover docks (mobile PlanDockPill). Content clears it at rest via the
          // body's bottom padding; mid-scroll it floats, as every dock does.
          <button
            className="pressable"
            onClick={() => onLogSession([{ kind: "cardio", name, discipline: cardioDiscipline(name) }])}
            style={{ width: "100%", background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "15px 16px", cursor: "pointer", boxShadow: "0 18px 40px -18px rgba(0,0,0,.6)" }}
          >
            <CtaLabel size={15}>{t("w.train.sport.logSession").replace("{sport}", name)}</CtaLabel>
          </button>
        ) : undefined
      }
    >
      <div style={{ maxWidth: 620, margin: "0 auto", color: C("chalk"), paddingBottom: 96 }}>
        {/* ── THE ONE FIGURE ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: space.lg, padding: `${space.xxl}px 0 ${space.xl}px`, borderBottom: `1px solid ${C("line")}` }}>
          <div>
            <div style={label()}>{primaryLabel}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: space.ms }}>
              <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.stat, lineHeight: 1, letterSpacing: "-.03em", fontVariantNumeric: "tabular-nums" }}>{m.primary.value}</span>
              {!!m.primary.unit && <span style={mono(fs.note)}>{m.primary.unit}</span>}
            </div>
            {!!m.primary.delta && (
              <div style={{ ...mono(fs.caption, m.primary.improving ? C("lime") : C("ash")), fontWeight: 700, marginTop: space.ms }}>{m.primary.delta}</div>
            )}
            {m.primary.kind === "marker" && (
              <div style={{ ...mono(fs.micro), marginTop: space.xs, display: "flex", alignItems: "center", gap: 6 }}>
                {m.primary.at ? fmtDate(m.primary.at) : ""} <Provenance provider={null} t={t} />
              </div>
            )}
            {m.primary.kind !== "marker" && !m.hasDistance && !m.hasPace && (
              <div style={{ ...mono(fs.micro), marginTop: space.xs, maxWidth: "34ch", lineHeight: 1.45 }}>{t("w.train.sportPage.timedOnly")}</div>
            )}
          </div>
          {m.primary.trend.length >= 2 && <MarkerSpark trend={m.primary.trend} />}
        </div>

        {/* The marker slot for a sport that has one and hasn't been given a figure. */}
        {m.markerPrompt && (
          <div style={{ padding: `${space.lg}px 0`, borderBottom: `1px solid ${C("line")}` }}>
            {draft === null ? (
              <button
                className="pressable"
                onClick={() => setDraft(m.primary.kind === "marker" ? m.primary.value : "")}
                style={{ ...mono(fs.body, C("lime")), fontWeight: 700, background: "none", border: "none", padding: 0, cursor: "pointer" }}
              >
                {t("w.train.sportPage.addMarker").replace("{label}", m.markerPrompt.label)} →
              </button>
            ) : (
              <div style={{ display: "flex", gap: space.sm, alignItems: "center" }}>
                <input
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") saveMarker(draft); if (e.key === "Escape") setDraft(null); }}
                  placeholder={m.markerPrompt.ph}
                  aria-label={m.markerPrompt.label}
                  style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: fs.bodyLg, padding: "12px 16px", borderRadius: 16, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`, outline: "none" }}
                />
                <button className="pressable" onClick={() => saveMarker(draft)} style={{ ...mono(fs.body, "var(--on-accent)"), fontWeight: 700, background: C("lime"), border: "none", borderRadius: 999, padding: "12px 18px", cursor: "pointer" }}>
                  {t("w.train.sportPage.save")}
                </button>
              </div>
            )}
            <div style={{ ...mono(fs.micro), marginTop: space.sm }}>{t("w.train.sportPage.markerHint")}</div>
          </div>
        )}

        {/* ── TOTALS — four facts on hairlines, no boxes ── */}
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${m.totals.length}, 1fr)`, borderBottom: `1px solid ${C("line")}` }}>
          {m.totals.map((cell, i) => (
            <div key={cell.id} style={{ padding: `${space.lg}px 0 ${space.lg + 2}px`, textAlign: "center", borderLeft: i ? `1px solid ${C("line")}` : "none" }}>
              <b style={{ display: "block", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.heading, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{cell.value}</b>
              <span style={{ ...label(), display: "block", fontSize: fs.nano, marginTop: 6 }}>{totalLabel(cell.id, cell.unit)}</span>
            </div>
          ))}
        </div>

        {m.empty ? (
          <div style={{ ...sectionStyle, textAlign: "center", padding: `${space.huge}px 0` }}>
            <div style={{ fontWeight: 800, fontSize: fs.title }}>{t("w.train.sportPage.emptyTitle")}</div>
            <div style={{ ...mono(fs.body), marginTop: space.sm }}>{t("w.train.sportPage.emptyBody")}</div>
          </div>
        ) : (
          <>
            {/* ── VOLUME ── */}
            <div style={sectionStyle}>
              <SectionHead title={t("w.train.sportPage.volume")} meta={weeksMeta} />
              <VolumeBars weeks={m.weeks} avg={m.weekAvg} />
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: space.sm }}>
                <span style={mono(fs.nano)}>{fmtDate(m.weeks[0]?.weekStart ?? "")}</span>
                <span style={mono(fs.nano)}>{t("w.train.sportPage.thisWeek")}</span>
              </div>
            </div>

            {/* ── PACE — only for a sport that records one ── */}
            {m.pace && (
              <div style={sectionStyle}>
                <SectionHead title={t("w.train.sportPage.pace")} meta={t("w.train.sportPage.paceMeta").replace("{weeks}", String(SPORT_PAGE_WEEKS)).replace("{unit}", m.paceUnit)} />
                <div style={{ display: "flex", gap: space.xxl, marginBottom: space.md }}>
                  {[
                    { v: sportPace(m.pace.avgSecPerKm, m.pacePer), k: t("w.train.sportPage.average") },
                    { v: sportPace(m.pace.bestSecPerKm, m.pacePer), k: t("w.train.sportPage.best") },
                  ].map((cell) => (
                    <div key={cell.k}>
                      <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.headline, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{cell.v}</div>
                      <div style={{ ...label(), fontSize: fs.nano, marginTop: 5 }}>{cell.k}</div>
                    </div>
                  ))}
                </div>
                <PaceTrend trend={m.pace.trend} prIndex={m.pace.prIndex} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: space.sm }}>
                  <span style={mono(fs.nano)}>{fmtDate(m.weeks[0]?.weekStart ?? "")}</span>
                  <span style={mono(fs.nano)}>{t("w.train.sportPage.fasterHigher")}</span>
                </div>
              </div>
            )}

            {/* ── EFFORT — one bar, three densities of the one accent ── */}
            {m.split && <EffortSplitBar split={m.split} t={t} />}

            {/* ── BESTS — a full-bleed rail (cards run under the screen edge) ── */}
            {m.bests.length > 0 && (
              <div style={sectionStyle}>
                <SectionHead title={t("w.train.sportPage.bests")} meta={t("w.train.sportPage.allTime")} />
                <div style={{ display: "flex", gap: space.md, overflowX: "auto", scrollbarWidth: "none", margin: "0 calc(-1 * var(--page-pad-x, 16px))", padding: "0 var(--page-pad-x, 16px) 4px" }}>
                  {m.bests.map((b) => (
                    <div key={b.id} style={{ flex: "none", width: 176, background: C("card"), border: `1px solid ${C("line")}`, borderRadius: 22, padding: space.lg }}>
                      <div style={{ ...label(), fontSize: fs.nano }}>{bestLabel(b)}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: space.ms }}>
                        <b style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.heading, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>{b.value}</b>
                        {!!b.unit && <span style={mono(fs.micro)}>{b.unit}</span>}
                      </div>
                      <div style={{ ...mono(fs.nano), marginTop: space.sm, display: "flex", alignItems: "center", gap: 6 }}>
                        {fmtDate(b.at)}
                        {b.sessionId && <Provenance provider={b.provider} t={t} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TRANSFER — only the sports that carry a pool ── */}
        {m.transfer && (
          <>
            <div style={sectionStyle}>
              <SectionHead title={t("w.train.sportPage.transfer")} meta={t("w.train.sportPage.transferMeta")} />
              <div style={{ display: "flex", gap: space.xs, marginBottom: space.lg }}>
                {LEVELS.map((l, i) => {
                  const on = i === levelIdx;
                  return (
                    <button
                      key={l}
                      className="pressable"
                      aria-pressed={on}
                      onClick={() => pickLevel(i)}
                      style={{ flex: 1, ...mono(fs.micro, on ? "var(--on-accent)" : C("ash")), fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", padding: "10px 4px", borderRadius: 999, cursor: "pointer", border: `1px solid ${on ? C("lime") : C("line")}`, background: on ? C("lime") : C("ink2") }}
                    >
                      {l}
                    </button>
                  );
                })}
              </div>

              {/* The demands, ranked as the data ranks them — the numbering is
                  the priority order, not decoration. */}
              <div style={{ marginBottom: space.lg }}>
                {m.transfer.sport.demands.map((d, i) => (
                  <div key={d} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", alignItems: "center", gap: space.ms, padding: "9px 0", borderTop: i ? `1px solid ${C("line")}` : "none", fontSize: fs.body }}>
                    <span style={mono(fs.micro)}>{i + 1}</span>
                    <span>{d}</span>
                    <span aria-hidden style={{ width: Math.max(12, 56 - i * 11), height: 3, borderRadius: 2, background: C("lime"), opacity: 1 - i * 0.2 }} />
                  </div>
                ))}
              </div>

              {m.transfer.blocks.map((b, i) => (
                <div key={b.name} style={{ ...rowStyle, borderTop: i ? `1px solid ${C("line")}` : `1px solid ${C("line")}` }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: fs.note, letterSpacing: "-.01em" }}>{b.name}</div>
                    <div style={{ ...mono(fs.micro), marginTop: 4 }}>{b.demand}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ ...mono(fs.caption, C("lime")), fontWeight: 700, background: `color-mix(in srgb, ${C("lime")} 16%, transparent)`, borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>{b.scheme}</span>
                    <div style={{ ...mono(fs.nano), marginTop: 6, maxWidth: 170, marginLeft: "auto", lineHeight: 1.4 }}>
                      {b.loadBasis ?? (b.bodyweight && b.measure === "reps" ? t("w.train.sport.bodyweightTempo") : "")}
                    </div>
                  </div>
                </div>
              ))}

              {onLogSession && (
                <button
                  className="pressable"
                  onClick={() => onLogSession(transferSessionBlocks(m.transfer!))}
                  style={{ width: "100%", marginTop: space.lg, background: C("lime"), color: "var(--on-accent)", border: "none", borderRadius: 999, padding: "14px 16px", cursor: "pointer" }}
                >
                  <CtaLabel size={15}>{t("w.train.sportPage.startSession")}</CtaLabel>
                </button>
              )}
            </div>

            {/* ── WHY THESE LIFTS ── */}
            <div style={sectionStyle}>
              <SectionHead title={t("w.train.sportPage.whyTheseLifts")} meta={t("w.train.sportPage.poolMeta").replace("{n}", String(m.pool.length))} />
              {m.pool.map((e, i) => (
                <div key={e.name} style={{ padding: `${space.md}px 0`, borderTop: i ? `1px solid ${C("line")}` : "none", opacity: e.locked ? 0.45 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: space.md }}>
                    <b style={{ fontSize: fs.bodyLg, fontWeight: 700, letterSpacing: "-.01em" }}>{e.name}</b>
                    {e.locked ? (
                      <span style={{ ...label(), fontSize: fs.nano, border: `1px solid ${C("line")}`, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}>{e.unlocksAt}</span>
                    ) : (
                      <span style={{ ...label(), fontSize: fs.nano, whiteSpace: "nowrap" }}>{e.demand}</span>
                    )}
                  </div>
                  <p style={{ ...mono(fs.body), lineHeight: 1.5, margin: "5px 0 0" }}>{e.why}</p>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── RECENT EFFORTS ── */}
        {m.recent.length > 0 && (
          <div style={sectionStyle}>
            <SectionHead title={t("w.train.sportPage.recent")} meta={t("w.train.sportPage.recentMeta").replace("{n}", String(m.recent.length))} />
            {m.recent.map((e, i) => (
              <button
                key={`${e.sessionId}-${i}`}
                className="pressable"
                onClick={() => onOpenSession?.(e.sessionId)}
                disabled={!onOpenSession}
                style={{ ...rowStyle, alignItems: "center", width: "100%", textAlign: "left", background: "none", border: "none", borderTop: `1px solid ${C("line")}`, color: C("chalk"), cursor: onOpenSession ? "pointer" : "default" }}
              >
                <span>
                  <span style={{ display: "block", fontSize: fs.bodyLg, fontWeight: 700, letterSpacing: "-.01em" }}>{e.name}</span>
                  <span style={{ ...mono(fs.micro), display: "flex", alignItems: "center", gap: 7, marginTop: 4 }}>
                    {ago(e.startedAt)}
                    <Provenance provider={e.provider} t={t} />
                  </span>
                </span>
                <span style={{ textAlign: "right" }}>
                  <span style={{ display: "block", fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: fs.bodyLg, fontVariantNumeric: "tabular-nums" }}>
                    {m.hasDistance ? `${sportDistance(e.distanceKm, m.distanceUnit)} ${m.distanceUnit}` : `${e.minutes} min`}
                  </span>
                  {e.secPerKm != null && (
                    <span style={{ ...mono(fs.micro), display: "block", marginTop: 4 }}>{sportPace(e.secPerKm, m.pacePer)} {m.paceUnit}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </HeroScreen>
  );
}

function MarkerSpark({ trend }: { trend: number[] }) {
  const W = 74, H = 44;
  const min = Math.min(...trend), max = Math.max(...trend);
  const span = Math.max(0.0001, max - min);
  const pts = trend.map((v, i) => [i * (W / Math.max(1, trend.length - 1)), 4 + ((v - min) / span) * (H - 10)] as const);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden style={{ width: W, height: H, flex: "none" }}>
      <path d={pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ")} fill="none" stroke={C("lime")} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[pts.length - 1]![0]} cy={pts[pts.length - 1]![1]} r={2.6} fill={C("lime")} />
    </svg>
  );
}

function EffortSplitBar({ split, t }: { split: { easy: number; moderate: number; hard: number }; t: (k: string) => string }) {
  const total = Math.max(1, split.easy + split.moderate + split.hard);
  const pct = (v: number) => Math.round((v / total) * 100);
  const bands = [
    { v: pct(split.easy), k: t("w.train.sportPage.easy"), bg: `color-mix(in srgb, ${C("lime")} 38%, ${C("ink")})` },
    { v: pct(split.moderate), k: t("w.train.sportPage.steady"), bg: `color-mix(in srgb, ${C("lime")} 68%, ${C("ink")})` },
    { v: pct(split.hard), k: t("w.train.sportPage.hard"), bg: C("lime") },
  ];
  const shown = bands.filter((b) => b.v > 0);
  return (
    <div style={{ marginTop: space.xxl }}>
      <SectionHead title={t("w.train.sportPage.effort")} meta={t("w.train.sportPage.effortMeta").replace("{weeks}", String(SPORT_PAGE_WEEKS))} />
      <div style={{ display: "flex", gap: 2, height: 12, borderRadius: 999, overflow: "hidden" }}>
        {bands.map((b) => <span key={b.k} style={{ width: `${b.v}%`, background: b.bg }} />)}
      </div>
      <div style={{ display: "flex", gap: 2, marginTop: space.md }}>
        {shown.map((b, i) => (
          <div key={b.k} style={{ flexBasis: `${b.v}%`, flexGrow: 0, flexShrink: 1, minWidth: 58, display: "flex", flexDirection: "column", gap: 4, alignItems: i === shown.length - 1 ? "flex-end" : "flex-start" }}>
            <b style={{ fontFamily: "var(--font-mono)", fontSize: fs.body, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{b.v}%</b>
            <span style={{ ...label(), fontSize: fs.nano }}>{b.k}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
