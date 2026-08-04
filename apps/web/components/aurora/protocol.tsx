"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fs, space, riskRole, ROLE_COLOR,
  INJURY_FIGURES, INJURY_VIEWBOX, INJURY_AREA_KEY, INJURY_AREA_HINT_KEY,
  INJURY_WHEN, INJURY_WHEN_KEY, nearestInjuryArea, injuryTouchPoint, injuryDateFor,
  rtpView, type InjuryWhen, type InjuryFigure, type MuscleGroup, type RtpStage, type TissueRisk,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import Sheet from "./sheet";
import { AuroraIcon } from "./icons";

/**
 * THE PROTOCOL (web) — declaring an injury, and living with one.
 *
 * What this replaces: an inline form that asked "which area is hurt?" with a
 * ragged wrap of seven word-chips (one of them pre-selected, so the question
 * arrived already answered), a chartreuse GO button on the worst news an
 * athlete ever files, and — once open — a bordered box holding a stage pill, a
 * progress bar and a column of browser checkboxes. Three separate drawings of
 * one fact, none of which said where you were in the journey or how long you
 * had been in it, and every stage and criterion printed in English into a
 * Polish or German UI.
 *
 * What it is now:
 *
 *   THE QUESTION IS THE BODY. You are asked where it hurts by being shown a
 *   body, and you touch it. The mannequin is the same shared geometry the
 *   exercise body-map draws (@hybrid/core injury-body.ts), the hit test is
 *   shared too, and only the seven areas the engines actually track are drawn
 *   as live regions — so what you can choose is legible without a word of
 *   instruction. Nothing is pre-selected: the question is open until you answer
 *   it. Then one more real question — when it started — because a protocol that
 *   stamps every injury as happening the moment you opened it is lying about
 *   day one.
 *
 *   THE PROTOCOL IS A PATH. Six stages drawn as a ladder with one spine: the
 *   rail through the stage marks IS the progress bar, so there is one graphic
 *   instead of three. Behind you: a filled mark and the date you passed it,
 *   recovered from the audit trail. Under you: the open rung, the only place
 *   with anything to do. Ahead: quiet. Advancing appears only when it can
 *   actually happen.
 *
 *   COLOUR MEANS SOMETHING. The accent fill is reserved for the things that
 *   are genuinely good — advancing, and being cleared. Opening a protocol
 *   takes a neutral chalk fill; it is decisive, not a celebration.
 *
 * Mirrored by apps/mobile/components/aurora/protocol.tsx — same shapes, same
 * hit test, same copy keys.
 */

const C = (v: string) => `var(--color-${v})`;
const roleVarOf = (band: string) => `var(--color-${ROLE_COLOR[riskRole(band)]})`;

type AuditEntry = { action: string; by: string; role: string; ts: string; from?: string; to?: string; gate?: string; reason?: string };
export type Protocol = { id: string; tissue: string; injuryDate: string; stage: RtpStage; completed: string[]; status: string; audit?: AuditEntry[] };

export function useRtpProtocols() {
  const [protocols, setProtocols] = useState<Protocol[]>([]);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/rtp");
    if (res.ok) {
      const d = (await res.json()) as { protocols: Protocol[] };
      setProtocols(d.protocols.map((p) => ({ ...p, completed: (p.completed as string[]) ?? [], audit: (p.audit as AuditEntry[]) ?? [] })));
    }
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const create = useCallback(async (tissue: string, injuryDate?: string) => {
    const res = await fetch("/api/rtp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tissue, injuryDate }) });
    if (res.ok) refresh();
  }, [refresh]);

  const mutate = useCallback(async (id: string, body: object) => {
    const res = await fetch(`/api/rtp/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (res.ok) refresh();
  }, [refresh]);

  return { active: protocols.filter((p) => p.status !== "abandoned"), create, mutate };
}

/**
 * THE RUNNING PROTOCOL, WHERE IT IS ACTUALLY USED.
 *
 * A return-to-play protocol is a DAILY object — stages, gates, dates, an action
 * you take this morning. It used to render only inside the Performance tab's
 * Tissue card, several screens from where an injured athlete decides what to do
 * today. It now renders in Today's RECOVER cluster, beside the check-in; the
 * Tissue card keeps the status line and the door, so the flag and the protocol
 * remain one object seen from two places.
 *
 * Renders nothing at all when no protocol is open — a block that comes and goes
 * is right here, because an athlete with nothing to rehab should never be shown
 * a rehab surface.
 */
export function RtpPanel() {
  const { t } = useLang();
  const { active, mutate } = useRtpProtocols();
  if (active.length === 0) return null;
  return (
    <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--red-text)" }}>{t("w.rtp.protocol")}</div>
      {active.map((p) => <RtpProtocol key={p.id} p={p} mutate={mutate} />)}
    </div>
  );
}

/* ── the body ──────────────────────────────────────────────────────────────
   One drawing, two jobs: the picker (touch an area) and the risk read-out on
   the Tissue card (each area tinted by its own band). The card used to draw
   its own mannequin out of rounded rectangles while the app already owned a
   real one — a body should not be two different shapes inside one card. */

export type AreaTone = { fill: string; stroke: string; fillOpacity: number };

// A pickable area has to read as MORE than silhouette or the affordance is
// invisible — the first render of this figure had both at a whisper of ash and
// the seven live regions disappeared into the body. The tracked areas carry a
// real stroke and roughly three times the fill of the outline beneath them.
const PICK_TONE: AreaTone = { fill: "var(--color-ash)", stroke: "color-mix(in srgb, var(--color-ash) 62%, transparent)", fillOpacity: 0.3 };
const HOVER_TONE: AreaTone = { fill: "var(--color-chalk)", stroke: "var(--color-chalk)", fillOpacity: 0.42 };
const PICKED_TONE: AreaTone = { fill: "var(--color-chalk)", stroke: "var(--color-chalk)", fillOpacity: 0.9 };

export function InjuryBody({
  toneOf,
  selected,
  onSelect,
  labelOf,
  maxHeight = 300,
}: {
  /** how to paint each area — the picker's neutral wash, or a risk band. */
  toneOf?: (group: MuscleGroup) => AreaTone;
  selected?: MuscleGroup | null;
  /** present ⇒ the figure is a control; absent ⇒ it is a read-out. */
  onSelect?: (group: MuscleGroup) => void;
  /** the accessible name for an area (also the SVG tooltip). */
  labelOf: (group: MuscleGroup) => string;
  maxHeight?: number;
}) {
  const { t } = useLang();
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: space.md, justifyItems: "center" }}>
      {INJURY_FIGURES.map((fig) => (
        <div key={fig.side} style={{ width: "100%", textAlign: "center" }}>
          <Figure fig={fig} toneOf={toneOf} selected={selected} onSelect={onSelect} labelOf={labelOf} maxHeight={maxHeight} />
          <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginTop: 2 }}>
            {t(`w.analyze.exp.anatomy.map.${fig.side}`)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Figure({
  fig, toneOf, selected, onSelect, labelOf, maxHeight,
}: {
  fig: InjuryFigure;
  toneOf?: (g: MuscleGroup) => AreaTone;
  selected?: MuscleGroup | null;
  onSelect?: (g: MuscleGroup) => void;
  labelOf: (g: MuscleGroup) => string;
  maxHeight: number;
}) {
  const { x, y, w, h } = INJURY_VIEWBOX;
  const live = !!onSelect;
  const [hover, setHover] = useState<MuscleGroup | null>(null);

  // A touch anywhere on the figure resolves to the NEAREST tracked area, so a
  // thumb never has to find a 5-unit-wide triceps. A touch near nothing
  // tracked resolves to nothing, and the selection simply stands.
  const onCanvas = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onSelect) return;
    const r = e.currentTarget.getBoundingClientRect();
    const p = injuryTouchPoint(r.width, r.height, e.clientX - r.left, e.clientY - r.top);
    const hit = p && nearestInjuryArea(fig.side, p.x, p.y);
    if (hit) onSelect(hit);
  };

  return (
    <svg
      viewBox={`${x} ${y} ${w} ${h}`}
      style={{ display: "block", width: "100%", maxWidth: (maxHeight * w) / h, maxHeight, margin: "0 auto" }}
      role={live ? "radiogroup" : "img"}
      onClick={onCanvas}
    >
      {live && <rect x={x} y={y} width={w} height={h} fill="transparent" />}
      {/* the untracked body: faint, and therefore honestly unavailable */}
      {fig.outline.map((part, i) => (
        <polygon key={`o${i}`} points={part.map((q) => `${q.x},${q.y}`).join(" ")} fill={C("ash")} opacity={0.1} stroke={C("line")} strokeWidth={0.5} />
      ))}
      <circle cx={fig.head.cx} cy={fig.head.cy} r={fig.head.r} fill={C("ash")} opacity={0.12} stroke={C("line")} strokeWidth={0.5} />
      {fig.areas.map((area) => {
        const on = selected === area.group;
        const tone = on ? PICKED_TONE : live && hover === area.group ? HOVER_TONE : toneOf?.(area.group) ?? PICK_TONE;
        return (
          <g
            key={area.group}
            onMouseEnter={live ? () => setHover(area.group) : undefined}
            onMouseLeave={live ? () => setHover(null) : undefined}
            role={live ? "radio" : undefined}
            aria-checked={live ? on : undefined}
            aria-label={live ? labelOf(area.group) : undefined}
            tabIndex={live ? 0 : undefined}
            onClick={live ? (e) => { e.stopPropagation(); onSelect?.(area.group); } : undefined}
            onKeyDown={live ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect?.(area.group); } } : undefined}
            style={{ cursor: live ? "pointer" : "default", outlineOffset: 2 }}
          >
            <title>{labelOf(area.group)}</title>
            {area.shapes.map((shape, j) => (
              <polygon
                key={j}
                points={shape.map((q) => `${q.x},${q.y}`).join(" ")}
                fill={tone.fill}
                fillOpacity={tone.fillOpacity}
                stroke={tone.stroke}
                strokeWidth={on ? 1.1 : 0.8}
                style={{ transition: "fill .18s ease, fill-opacity .18s ease, stroke .18s ease" }}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

/** The Tissue card's read-out: the same body, each area carrying its own band. */
export function RiskBody({ byTissue, onPick }: { byTissue: Record<string, TissueRisk>; onPick?: (group: MuscleGroup) => void }) {
  const { t } = useLang();
  const toneOf = (g: MuscleGroup): AreaTone => {
    const ti = byTissue[g];
    if (!ti || ti.risk <= 0) return { fill: C("ash"), stroke: `color-mix(in srgb, ${C("ash")} 45%, transparent)`, fillOpacity: 0.2 };
    const hex = roleVarOf(ti.band);
    return { fill: hex, stroke: hex, fillOpacity: 0.22 + 0.5 * Math.min(1, ti.risk / 100) };
  };
  const labelOf = (g: MuscleGroup) => {
    const ti = byTissue[g];
    return `${t(INJURY_AREA_KEY[g])}: ${ti ? `${ti.risk}/100` : "—"}`;
  };
  return <InjuryBody toneOf={toneOf} labelOf={labelOf} onSelect={onPick} maxHeight={240} />;
}

/* ── the question ──────────────────────────────────────────────────────── */

export function InjurySheet({
  open,
  onClose,
  onOpen,
  initial = null,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: (tissue: MuscleGroup, injuryDate: string) => void;
  /** the area the athlete already pointed at to get here (touching it on the
   *  card's own figure), or null when they came in through the footer rail. */
  initial?: MuscleGroup | null;
}) {
  const { t } = useLang();
  // Nothing is pre-selected unless the athlete already answered by touching
  // the card's body. A pre-answered question is not a question.
  const [area, setArea] = useState<MuscleGroup | null>(initial);
  const [when, setWhen] = useState<InjuryWhen>("today");

  useEffect(() => {
    if (open) { setArea(initial); setWhen("today"); }
  }, [open, initial]);

  return (
    <Sheet open={open} onClose={onClose} title={t("w.injury.pickArea")} sub={t("w.injury.pickSub")} maxWidth={520}>
      <InjuryBody selected={area} onSelect={setArea} labelOf={(g) => t(INJURY_AREA_KEY[g])} />

      {/* THE READBACK — the choice said in words, so a highlight is never the
          only confirmation. It holds its height so nothing jumps. */}
      <div aria-live="polite" style={{ minHeight: 52, marginTop: 14, textAlign: "center" }}>
        <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20, letterSpacing: "-.02em", color: area ? C("chalk") : C("ash") }}>
          {area ? t(INJURY_AREA_KEY[area]) : t("w.injury.pickNone")}
        </div>
        {area && <div style={{ fontSize: fs.caption, color: C("ash"), marginTop: 2 }}>{t(INJURY_AREA_HINT_KEY[area])}</div>}
      </div>

      <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, textTransform: "uppercase", letterSpacing: ".12em", color: C("ash"), marginTop: 18, marginBottom: 8 }}>
        {t("w.injury.whenTitle")}
      </div>
      <div role="radiogroup" aria-label={t("w.injury.whenTitle")} style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
        {INJURY_WHEN.map((wk) => {
          const on = wk === when;
          return (
            <button
              key={wk}
              type="button"
              role="radio"
              aria-checked={on}
              className="pressable"
              onClick={() => setWhen(wk)}
              style={{
                fontFamily: "var(--font-mono)", fontSize: fs.micro, cursor: "pointer",
                borderRadius: 999, padding: "9px 8px",
                border: `1px solid ${on ? C("chalk") : C("line")}`,
                background: on ? `color-mix(in srgb, ${C("chalk")} 10%, transparent)` : "transparent",
                color: on ? C("chalk") : C("ash"),
              }}
            >
              {t(INJURY_WHEN_KEY[wk])}
            </button>
          );
        })}
      </div>

      {/* THE COMMITMENT — one primary, full width, and inert until the
          question above it has an answer. Never the accent fill: opening a
          protocol is bad news, not a "go". */}
      <button
        type="button"
        className="pressable"
        disabled={!area}
        onClick={() => { if (area) { onOpen(area, injuryDateFor(when)); onClose(); } }}
        style={{
          fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.subtitle,
          width: "100%", marginTop: 20, padding: 15, borderRadius: 999, border: "none",
          background: area ? C("chalk") : `color-mix(in srgb, ${C("ash")} 22%, transparent)`,
          color: area ? C("ink") : C("ash"),
          cursor: area ? "pointer" : "default",
        }}
      >
        {t("w.injury.openProtocol")}
      </button>
      <div style={{ fontSize: fs.caption, color: C("ash"), textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>{t("w.injury.protocolNote")}</div>
      <button type="button" className="pressable" onClick={onClose} style={{ ...quietBtn, display: "block", margin: "14px auto 0" }}>
        {t("w.injury.cancel")}
      </button>
    </Sheet>
  );
}

/* ── the path ──────────────────────────────────────────────────────────── */

export function RtpProtocol({ p, mutate }: { p: Protocol; mutate: (id: string, body: object) => void }) {
  const { t } = useLang();
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [logOpen, setLogOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const v = useMemo(() => rtpView({ stage: p.stage, completed: p.completed, injuryDate: p.injuryDate, audit: p.audit }), [p]);
  const accent = v.cleared ? C("lime") : C("blue");
  const accentText = v.cleared ? "var(--lime-text)" : "var(--blue-text)";

  const doOverride = () => {
    if (!reason.trim()) return;
    mutate(p.id, { action: "override", reason });
    setOverrideOpen(false);
    setReason("");
  };

  return (
    <div style={{ border: `1px solid ${C("line")}`, borderRadius: 20, padding: "16px 16px 12px" }}>
      {/* WHAT AND HOW LONG — the two facts a protocol is about. */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <span style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 20, letterSpacing: "-.02em", color: C("chalk") }}>
          {t(INJURY_AREA_KEY[p.tissue as MuscleGroup] ?? p.tissue)}
        </span>
        {v.days != null && (
          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: C("ash"), fontVariantNumeric: "tabular-nums" }}>
            {t("w.rtp.day")} {v.days}
          </span>
        )}
      </div>

      {v.cleared ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
          <AuroraIcon name="check-circle" size={20} color={C("lime")} />
          <span style={{ fontSize: fs.body, color: accentText, lineHeight: 1.5 }}>{t("w.rtp.clearedNote")}</span>
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          {v.steps.map((s, i) => {
            const first = i === 0;
            const last = i === v.steps.length - 1;
            const passed = s.state === "done";
            const now = s.state === "now";
            return (
              <div key={s.stage} style={{ display: "grid", gridTemplateColumns: "22px 1fr", columnGap: 10, position: "relative" }}>
                {/* THE SPINE — the rail through the marks IS the progress bar. */}
                <div style={{ position: "relative" }}>
                  {!first && <span style={{ position: "absolute", left: 10, top: 0, height: 11, width: 2, background: passed || now ? accent : C("line") }} />}
                  {!last && <span style={{ position: "absolute", left: 10, top: 11, bottom: 0, width: 2, background: passed ? accent : C("line") }} />}
                  <span
                    style={{
                      position: "absolute", left: now ? 4 : 6, top: now ? 5 : 7,
                      width: now ? 14 : 10, height: now ? 14 : 10, borderRadius: 999,
                      background: passed ? accent : now ? C("ink2") : C("line"),
                      border: now ? `3px solid ${accent}` : "none",
                    }}
                  />
                </div>
                <div style={{ paddingBottom: now ? 12 : 14 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{
                      fontFamily: now ? "var(--font-heading)" : undefined, fontWeight: now ? 800 : 400,
                      fontSize: now ? fs.bodyLg : fs.body,
                      color: now ? C("chalk") : passed ? C("ash") : `color-mix(in srgb, ${C("ash")} 55%, transparent)`,
                    }}>
                      {t(s.labelKey)}
                    </span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: s.forced ? "var(--red-text)" : C("ash"), whiteSpace: "nowrap" }}>
                      {now ? `${v.stageNumber}/${v.stageCount}` : s.onISO ? `${s.forced ? `${t("w.rtp.forced")} ` : ""}${fmtDay(s.onISO)}` : ""}
                    </span>
                  </div>

                  {now && (
                    <>
                      <div style={{ fontSize: fs.caption, color: C("ash"), lineHeight: 1.5, marginTop: 3 }}>{t(s.subKey)}</div>
                      <div style={{ marginTop: 10, display: "grid", gap: 2 }}>
                        {v.gates.map((g) => (
                          <button
                            key={g.key}
                            type="button"
                            className="pressable"
                            role="checkbox"
                            aria-checked={g.done}
                            onClick={() => mutate(p.id, { action: "toggleGate", gate: g.key })}
                            style={{
                              display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
                              background: "none", border: "none", padding: "7px 0", cursor: "pointer", color: "inherit",
                            }}
                          >
                            <span aria-hidden style={{
                              flex: "0 0 auto", width: 19, height: 19, borderRadius: 999,
                              display: "inline-flex", alignItems: "center", justifyContent: "center",
                              border: g.done ? "none" : `1.5px solid color-mix(in srgb, ${C("ash")} 70%, transparent)`,
                              background: g.done ? accent : "transparent",
                            }}>
                              {g.done && <AuroraIcon name="check" size={12} color={C("ink")} />}
                            </span>
                            <span style={{ fontSize: fs.body, lineHeight: 1.4, color: g.done ? C("chalk") : C("ash") }}>{t(g.labelKey)}</span>
                          </button>
                        ))}
                      </div>

                      {/* THE ONE ACTION — drawn only when it can actually be
                          taken. A disabled primary teaches nothing. */}
                      {v.canAdvance ? (
                        <button
                          type="button"
                          className="pressable"
                          onClick={() => mutate(p.id, { action: "advance" })}
                          style={{
                            fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.body,
                            width: "100%", marginTop: 10, padding: 12, borderRadius: 999, border: "none",
                            background: C("lime"), color: "var(--on-accent)", cursor: "pointer",
                          }}
                        >
                          {t("w.rtp.advanceTo")} {v.nextStageKey ? t(v.nextStageKey) : ""}
                        </button>
                      ) : (
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 8 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.micro, color: "var(--amber-text)" }}>
                            {v.blockedCount === 1 ? t("w.rtp.gateToGo") : `${v.blockedCount} ${t("w.rtp.gatesToGo")}`}
                          </span>
                          <button type="button" className="pressable" onClick={() => setOverrideOpen((o) => !o)} aria-expanded={overrideOpen} style={{ ...quietBtn, color: C("ash") }}>
                            {t("w.rtp.override")}
                          </button>
                        </div>
                      )}

                      {overrideOpen && !v.canAdvance && (
                        <div style={{ display: "flex", gap: space.sm, marginTop: 10, alignItems: "center" }}>
                          <input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder={t("w.rtp.reason")}
                            aria-label={t("w.rtp.reason")}
                            style={{
                              flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: fs.micro, padding: "9px 11px",
                              borderRadius: 10, background: C("ink"), color: C("chalk"), border: `1px solid ${C("line")}`,
                            }}
                          />
                          <button
                            type="button"
                            className="pressable"
                            onClick={doOverride}
                            disabled={!reason.trim()}
                            style={{
                              fontFamily: "var(--font-mono)", fontSize: fs.micro, fontWeight: 700, whiteSpace: "nowrap",
                              padding: "9px 13px", borderRadius: 999, background: "transparent",
                              border: `1px solid ${C("red")}`, color: "var(--red-text)",
                              opacity: reason.trim() ? 1 : 0.4, cursor: reason.trim() ? "pointer" : "default",
                            }}
                          >
                            {t("w.rtp.force")}
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* THE RECORD, and the way out — both quiet, both always reachable. */}
      <div style={{ borderTop: `1px solid ${C("line")}`, marginTop: 4, paddingTop: 10 }}>
        {closing ? (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
            <span style={{ fontSize: fs.caption, color: C("ash") }}>{t("w.rtp.discardAsk")}</span>
            <span style={{ display: "flex", gap: 12 }}>
              <button type="button" className="pressable" onClick={() => setClosing(false)} style={{ ...quietBtn, color: C("chalk") }}>{t("w.rtp.keep")}</button>
              <button type="button" className="pressable" onClick={() => { setClosing(false); mutate(p.id, { action: "abandon" }); }} style={{ ...quietBtn, color: "var(--red-text)" }}>{t("w.rtp.discardYes")}</button>
            </span>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            {v.log.length > 0 ? (
              <button type="button" className="pressable" onClick={() => setLogOpen((o) => !o)} aria-expanded={logOpen} style={{ ...quietBtn, color: C("ash") }}>
                {t("w.rtp.audit")} ({v.log.length})
                <AuroraIcon name="chevron-down" size={11} color={C("ash")} style={{ marginLeft: 5, transform: logOpen ? "rotate(180deg)" : undefined }} />
              </button>
            ) : <span />}
            <button type="button" className="pressable" onClick={() => setClosing(true)} style={{ ...quietBtn, color: C("ash") }}>{t("w.rtp.discard")}</button>
          </div>
        )}

        {logOpen && !closing && (
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {v.log.slice().reverse().map((a, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "58px 1fr", columnGap: 10, alignItems: "baseline" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), whiteSpace: "nowrap" }}>{fmtDay(a.ts)}</span>
                <span style={{ fontSize: fs.caption, lineHeight: 1.5, color: a.override ? "var(--red-text)" : C("ash") }}>
                  <b style={{ fontWeight: 700, color: a.override ? "var(--red-text)" : C("chalk") }}>{a.by}</b>{" "}
                  {t(a.verbKey)}
                  {a.gateKey ? ` ${t(a.gateKey)}` : ""}
                  {a.toKey ? ` ${t(a.toKey)}` : ""}
                  {a.reason ? ` — ${a.reason}` : ""}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const fmtDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
};

const quietBtn: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", background: "none", border: "none", padding: 0, cursor: "pointer",
  fontFamily: "var(--font-mono)", fontSize: fs.micro, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".08em",
};
