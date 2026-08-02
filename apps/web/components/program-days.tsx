"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  rpeColor,
  workoutColor,
  sessionColor,
  isProseLift,
  liftKind,
  dayContentSummary,
  percentMatrixView,
  outlierPrescription,
  dayMaxPct,
  loadTier,
  dayPulse,
  dayLeadWords,
  stepWords,
  rpeMeaning,
  type ProgramDayView,
  type ProgramLiftView,
  type ProgramSessionView,
  type InkTier,
  type LoadColor,
  type LiftKind,
} from "@hybrid/core";
import { LIME, BLUE, AMBER, RED, ASH, CHALK, LINE, CARD, LIME_T, BLUE_T, AMBER_T, RED_T } from "@/lib/ui";
import Sheet from "./aurora/sheet";

// ── The quiet matrix ──────────────────────────────────────────────────────────
// The HYBRID plan day view (web) — mirrors mobile `percent-program.tsx` 1:1 off
// the SAME shared planProgramView + percentMatrixView. The redesign (see
// design/plan-schedule-table-redesign-ideas.html): days are an ACCORDION (one
// open at a time, closed rows carry a plain-words summary + the day's load
// PULSE), session/group headers collapse to single quiet rule lines, the %
// matrix is a real <table> whose exercise column pins while the load lanes
// scroll under a soft edge fade, intensity is INK WEIGHT (one accent on the
// day's top load — no per-column rainbow), loads shared by nobody drop out of
// the grid as full-width outlier rows, and every row presses into an exercise
// SHEET carrying the full prescription story.

const HEX: Record<LoadColor, string> = { blue: BLUE, lime: LIME, amber: AMBER, red: RED, ash: ASH };
// accent-as-TEXT variants (darken on the light theme so they keep AA).
const HEX_T: Record<LoadColor, string> = { blue: BLUE_T, lime: LIME_T, amber: AMBER_T, red: RED_T, ash: ASH };
// Theme-aware hairline — the old rgba(255,255,255,.05) was a WHITE line that
// vanished/inverted wrong on the Kyoto light theme; mix the themed line token
// down to the same visual weight instead.
const HAIR = "color-mix(in srgb, var(--color-line) 60%, transparent)";
const mono = "var(--font-mono)";
const disp = "var(--font-display)";

// content classification (isProseLift / liftKind) is shared from @hybrid/core.
const isProse = isProseLift;
const liftColor = (l: ProgramLiftView): LoadColor =>
  l.rpe != null ? rpeColor(l.rpe) : l.steps && l.steps.length ? "lime" : l.intensity ?? workoutColor(l.name);

type Group = { kind: LiftKind; lifts: ProgramLiftView[] };
function groupByKind(lifts: ProgramLiftView[]): Group[] {
  const groups: Group[] = [];
  for (const l of lifts) {
    const kind = liftKind(l);
    const last = groups[groups.length - 1];
    if (last && last.kind === kind) last.lifts.push(l);
    else groups.push({ kind, lifts: [l] });
  }
  return groups;
}

// Group label for the merged header line — "Main — 3", "Accessories — 5".
function groupLabel(kind: LiftKind, n: number, hasPercent: boolean): string {
  if (kind === "run") return "Run";
  if (kind === "percent") return `Main — ${n}`;
  return `${hasPercent ? "Accessories" : "Strength"} — ${n}`;
}

// Ink tier → text style: the monochrome intensity ramp. `top` (the day's
// heaviest %) is the single accent; everything else is chalk at falling weight.
function tierStyle(tier: InkTier): React.CSSProperties {
  if (tier === "top") return { color: LIME_T, fontWeight: 700, opacity: 1 };
  if (tier === "high") return { color: CHALK, fontWeight: 700, opacity: 0.92 };
  if (tier === "mid") return { color: CHALK, fontWeight: 500, opacity: 0.72 };
  return { color: CHALK, fontWeight: 400, opacity: 0.55 };
}

// A row-press reset — table/list rows open the exercise sheet, so they are real
// <button>s (keyboard + AT reachable), styled back to plain rows.
const rowBtn: React.CSSProperties = {
  display: "block",
  width: "100%",
  background: "none",
  border: "none",
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

/** What pressing a row opens: the lift plus where it lives. */
type SheetSel = { lift: ProgramLiftView; day: string; marker: string | null };

// Mirrors the mobile useReducedMotion + the app's @media (prefers-reduced-motion)
// coverage so the accordion motion is substituted for users who ask for less.
function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduced;
}

/**
 * The accordion's expand/collapse — house motion: the body ARRIVES on the sheet
 * spring (--e-sheet, the same physics mobile rides through springToRN) and
 * LEAVES fast on the accelerating exit curve, per the "things leave faster than
 * they arrive" rule. The 0fr→1fr grid track animates the unknown content
 * height; `visibility` rides the same transition (discrete, so it flips at the
 * closed end), keeping collapsed rows out of the tab order and the AT tree.
 * Reduce Motion SUBSTITUTES a cross-dissolve: the track snaps, opacity fades.
 */
function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduced = useReducedMotion();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        transition: reduced
          ? "none"
          : open
            ? "grid-template-rows var(--d-sheet) var(--e-sheet)"
            : "grid-template-rows var(--d-fast) var(--e-exit)",
      }}
    >
      <div
        style={{
          overflow: "hidden",
          minHeight: 0,
          borderTop: `1px solid ${HAIR}`,
          visibility: open ? "visible" : "hidden",
          opacity: open ? 1 : 0,
          transition: reduced
            ? "opacity 150ms linear, visibility 150ms"
            : open
              ? "opacity var(--d-sheet) var(--e-fade), visibility var(--d-sheet)"
              : "opacity var(--d-fast) var(--e-exit), visibility var(--d-fast)",
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default function ProgramDays({ days, week, peakNote }: { days: ProgramDayView[]; week: number; peakNote: string | null }) {
  const [open, setOpen] = useState(0);
  const [sel, setSel] = useState<SheetSel | null>(null);
  // A new week starts the accordion over at its first day.
  useEffect(() => setOpen(0), [week]);
  const allProse = days.length > 0 && days.every((d) => d.sessions.every((s) => s.lifts.every(isProse)));
  if (allProse) return <WeekCard days={days} week={week} peakNote={peakNote} />;
  return (
    <>
      {days.map((day, di) => (
        <DayCard key={di} day={day} open={di === open} onToggle={() => setOpen(di === open ? -1 : di)} onLift={(lift, marker) => setSel({ lift, day: day.title, marker })} />
      ))}
      <ExerciseSheet sel={sel} onClose={() => setSel(null)} />
    </>
  );
}

// ── shell ─────────────────────────────────────────────────────────────────────
// Radius 28 = the shared Aurora card radius.
function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 28, overflow: "hidden", marginBottom: 12 }}>{children}</div>;
}

// The all-prose week card's header (endurance weeks keep the one-card layout).
function WeekHeader({ title, right }: { title: string; right: string | null }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, padding: "12px 18px", borderBottom: `1px solid ${HAIR}` }}>
      <span style={{ fontFamily: disp, fontWeight: 800, fontSize: 16, letterSpacing: "-.01em", color: CHALK }}>{title}</span>
      {right && <span style={{ fontFamily: mono, fontSize: 10, color: ASH }}>{right}</span>}
    </div>
  );
}

// The day's load shape — one hairline bar per prescription, the day-level echo
// of the week waveform. Semantic: every bar is a real step (dayPulse, core).
function Pulse({ day }: { day: ProgramDayView }) {
  const bars = dayPulse(day);
  if (!bars.length) return null;
  return (
    <span aria-hidden style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 16 }}>
      {bars.map((b, i) => (
        <span key={i} style={{ width: 3, borderRadius: 1.5, height: Math.max(3, Math.round(b.h * 16)), background: b.hot ? LIME : "color-mix(in srgb, var(--color-chalk) 22%, transparent)" }} />
      ))}
    </span>
  );
}

// One accordion day: a pressable summary row (title + plain-words summary,
// pulse + volume + chevron) that opens into the day's full tables.
function DayCard({ day, open, onToggle, onLift }: { day: ProgramDayView; open: boolean; onToggle: () => void; onLift: (l: ProgramLiftView, marker: string | null) => void }) {
  const expandable = day.sessions.some((s) => s.lifts.length > 0);
  const words = dayLeadWords(day);
  const right = dayContentSummary(day);
  return (
    <Card>
      <button
        type="button"
        disabled={!expandable}
        onClick={onToggle}
        aria-expanded={open}
        style={{ ...rowBtn, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", cursor: expandable ? "pointer" : "default" }}
      >
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "block", fontFamily: disp, fontWeight: 800, fontSize: 16, letterSpacing: "-.01em", color: CHALK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {day.title}
            {day.kindLabel && <span style={{ color: ASH, fontWeight: 600 }}> — {day.kindLabel}</span>}
          </span>
          {words && <span style={{ display: "block", fontFamily: mono, fontSize: 10, color: ASH, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{words}</span>}
        </span>
        <Pulse day={day} />
        {right && <span style={{ fontFamily: mono, fontSize: 10, color: ASH, flex: "none" }}>{right}</span>}
        {expandable && (
          <span aria-hidden style={{ flex: "none", width: 26, height: 26, borderRadius: 999, border: `1px solid ${open ? LIME : "color-mix(in srgb, var(--color-chalk) 25%, transparent)"}`, background: open ? LIME : "transparent", color: open ? "var(--on-accent)" : ASH, display: "grid", placeItems: "center", fontFamily: mono, fontSize: 13, lineHeight: 1 }}>
            {open ? "−" : "+"}
          </span>
        )}
      </button>
      {expandable && (
        <Collapse open={open}>
          {day.sessions.map((s, si) => (
            <SessionBlock key={si} s={s} si={si} count={day.sessions.length} day={day} onLift={onLift} />
          ))}
        </Collapse>
      )}
    </Card>
  );
}

// The merged rule line (idea 01): ONE quiet row carries what used to be two
// tinted band strips — the session marker (its semantic colour kept) with the
// session volume on the right. No background wash.
function SessionRule({ marker, color, volume, top }: { marker: string; color: LoadColor; volume: string | null; top: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, padding: "8px 18px 6px", borderBottom: `1px solid ${HAIR}`, borderTop: top ? `1px solid ${HAIR}` : undefined }}>
      <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: HEX_T[color] }}>{marker}</span>
      {volume && <span style={{ fontFamily: mono, fontSize: 10, color: ASH }}>{volume}</span>}
    </div>
  );
}

// A lone group label line (runs inside a mixed day).
function GroupRule({ label }: { label: string }) {
  return (
    <div style={{ padding: "8px 18px 5px", borderBottom: `1px solid ${HAIR}` }}>
      <span style={{ fontFamily: mono, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: ASH }}>{label}</span>
    </div>
  );
}

function SessionBlock({ s, si, count, day, onLift }: { s: ProgramSessionView; si: number; count: number; day: ProgramDayView; onLift: (l: ProgramLiftView, marker: string | null) => void }) {
  const groups = groupByKind(s.lifts);
  const mixed = groups.length > 1;
  const hasPercent = groups.some((g) => g.kind === "percent");
  const dayMax = dayMaxPct(day);
  // A multi-session day gets one marker per session: the plan's time-of-day
  // (AM/MID/PM) when set, else a plain "Training N" from the ordinal — so an
  // untimed two/three-a-day is distinguished, not silently merged.
  const marker = s.label ?? (count > 1 ? `Training ${si + 1}` : null);
  const press = (l: ProgramLiftView) => onLift(l, marker);
  return (
    <>
      {marker && <SessionRule marker={marker} color={sessionColor(s.label, si)} volume={s.volume} top={si > 0} />}
      {groups.map((g, gi) => {
        const label = mixed ? groupLabel(g.kind, g.lifts.length, hasPercent) : null;
        const top = (gi > 0 || si > 0) && !marker;
        const rowTop = (i: number) => (i > 0 ? `1px solid ${HAIR}` : "none");
        return (
          <div key={gi} style={{ borderTop: top ? `1px solid ${HAIR}` : undefined }}>
            {g.kind === "percent" ? (
              <QuietMatrix lifts={g.lifts} dayMax={dayMax} label={label} onPress={press} />
            ) : g.kind === "run" ? (
              <>
                {label && <GroupRule label={label} />}
                {g.lifts.map((l, i) => (
                  <ProseRow key={i} lift={l} borderTop={rowTop(i)} onPress={() => press(l)} />
                ))}
              </>
            ) : (
              <AccessoryRows lifts={g.lifts} label={label} onPress={press} />
            )}
          </div>
        );
      })}
    </>
  );
}

function NameCell({ lift }: { lift: ProgramLiftView }) {
  return (
    <span style={{ display: "block", minWidth: 0 }}>
      <span style={{ display: "block", fontFamily: disp, fontWeight: 600, fontSize: 15, color: CHALK }}>{lift.name}</span>
      {lift.note && <span style={{ display: "block", fontFamily: mono, fontSize: 10, color: ASH, marginTop: 2 }}>{lift.note}</span>}
    </span>
  );
}

// The reps cell content — quiet notation (idea 06): the reps token leads, the
// set multiplier steps back to ash ("4+1 ×4"; a single set is just "4").
function RepsText({ reps, sets, tier }: { reps: string; sets: number; tier: InkTier }) {
  return (
    <span style={{ fontFamily: mono, fontSize: 12, fontVariantNumeric: "tabular-nums", ...tierStyle(tier) }}>
      {reps}
      {sets > 1 && <span style={{ color: ASH, fontWeight: 400 }}> ×{sets}</span>}
    </span>
  );
}

/**
 * The % matrix, rebuilt as a real <table>: the exercise column (row headers)
 * PINS via position:sticky while the load lanes scroll beneath a soft edge fade
 * (idea 05); the merged header line (idea 01) puts the group label in the
 * pinned corner and the % labels over their lanes; cells carry the ink ramp
 * (idea 02); phantom-column outliers render as full-width rows before/after the
 * grid (idea 04). Every row presses into the exercise sheet.
 */
function QuietMatrix({ lifts, dayMax, label, onPress }: { lifts: ProgramLiftView[]; dayMax: number | null; label: string | null; onPress: (l: ProgramLiftView) => void }) {
  const { cols, rows, before, after } = percentMatrixView(lifts);
  const scroller = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const sync = () => setFade(el.scrollWidth > el.clientWidth + 1 && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    sync();
    el.addEventListener("scroll", sync, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(sync) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", sync);
      ro?.disconnect();
    };
  }, [cols.length, rows.length]);
  const sticky: React.CSSProperties = { position: "sticky", left: 0, background: CARD, boxShadow: "8px 0 12px -8px rgba(0,0,0,.35)" };
  return (
    <div>
      {before.map((l, i) => (
        <OutlierRow key={`b${i}`} lift={l} borderTop={i > 0 ? `1px solid ${HAIR}` : "none"} onPress={() => onPress(l)} />
      ))}
      <div style={{ position: "relative", borderTop: before.length ? `1px solid ${HAIR}` : undefined }}>
        <div ref={scroller} style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", minWidth: 132 + cols.length * 62, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${HAIR}` }}>
                <th scope="col" style={{ ...sticky, width: 132, textAlign: "left", padding: "8px 8px 5px 18px", fontFamily: mono, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: ASH, fontWeight: 400 }}>
                  {label ?? <span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Exercise</span>}
                </th>
                {cols.map((c) => (
                  <th key={c.load} scope="col" style={{ minWidth: 62, padding: "8px 4px 5px", fontFamily: mono, fontSize: 10, fontWeight: 400, textAlign: "center", color: ASH }}>
                    {c.load}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((l, i) => {
                const byLoad = new Map((l.steps ?? []).map((st) => [st.load, st]));
                return (
                  <tr key={i} onClick={() => onPress(l)} style={{ borderTop: i > 0 ? `1px solid ${HAIR}` : undefined, cursor: "pointer" }}>
                    <th scope="row" style={{ ...sticky, textAlign: "left", padding: "12px 8px 12px 18px", fontWeight: 400 }}>
                      <button type="button" onClick={(e) => { e.stopPropagation(); onPress(l); }} style={rowBtn} aria-label={`${l.name} — details`}>
                        <NameCell lift={l} />
                      </button>
                    </th>
                    {cols.map((c) => {
                      const st = byLoad.get(c.load);
                      // An empty cell is SILENT — absence is the information.
                      return (
                        <td key={c.load} style={{ padding: "12px 4px", textAlign: "center" }}>
                          {st ? <RepsText reps={st.reps} sets={st.sets} tier={loadTier(st.pct, dayMax)} /> : null}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* the soft edge — the material says "there is more", no chevron needed */}
        {fade && <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: 28, pointerEvents: "none", background: `linear-gradient(90deg, transparent, ${CARD})` }} />}
      </div>
      {after.map((l, i) => (
        <OutlierRow key={`a${i}`} lift={l} borderTop={`1px solid ${HAIR}`} onPress={() => onPress(l)} />
      ))}
    </div>
  );
}

// A grid outlier (idea 04) — loads nobody shares get a full-width line, not an
// empty lane: name left, the whole prescription in words right.
function OutlierRow({ lift, borderTop, onPress }: { lift: ProgramLiftView; borderTop: string; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} aria-label={`${lift.name} — details`} style={{ ...rowBtn, display: "flex", alignItems: "center", gap: 12, padding: "12px 18px", borderTop }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <NameCell lift={lift} />
      </span>
      <span style={{ fontFamily: mono, fontSize: 12, color: ASH, textAlign: "right" }}>{outlierPrescription(lift)}</span>
    </button>
  );
}

// Accessory / strength rows — the merged header line (idea 01) carries the
// group label AND the column labels in one row, aligned over their columns.
function AccessoryRows({ lifts, label, onPress }: { lifts: ProgramLiftView[]; label: string | null; onPress: (l: ProgramLiftView) => void }) {
  const hasRpe = lifts.some((l) => l.rpe != null);
  const rowTop = (i: number) => (i > 0 ? `1px solid ${HAIR}` : "none");
  return (
    <div>
      {(label || hasRpe) && (
        <div style={{ display: "flex", alignItems: "baseline", padding: "8px 18px 5px", borderBottom: `1px solid ${HAIR}` }}>
          <span style={{ flex: 1, fontFamily: mono, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: ASH }}>{label ?? ""}</span>
          {hasRpe && (
            <>
              <span style={{ width: 84, fontFamily: mono, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: ASH, textAlign: "right" }}>Sets × Reps</span>
              <span style={{ width: 60, fontFamily: mono, fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", color: ASH, textAlign: "right" }}>RPE</span>
            </>
          )}
        </div>
      )}
      {lifts.map((l, i) =>
        l.rpe != null ? <HeatRow key={i} lift={l} borderTop={rowTop(i)} onPress={() => onPress(l)} /> : <FallbackRow key={i} lift={l} borderTop={rowTop(i)} onPress={() => onPress(l)} />,
      )}
    </div>
  );
}

// bodybuilding row — Sets×Reps + RPE heat (RPE keeps its semantic heat colour).
function HeatRow({ lift, borderTop, onPress }: { lift: ProgramLiftView; borderTop: string; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} aria-label={`${lift.name} — details`} style={{ ...rowBtn, display: "flex", alignItems: "center", padding: "12px 18px", borderTop }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <NameCell lift={lift} />
      </span>
      <span style={{ width: 84, fontFamily: mono, fontSize: 13, color: CHALK, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{lift.setsReps ?? "—"}</span>
      <span style={{ width: 60, fontFamily: mono, fontSize: 13, fontWeight: 600, color: HEX_T[rpeColor(lift.rpe!)], textAlign: "right" }}>@{lift.rpe}</span>
    </button>
  );
}

// loaded accessory with no % and no RPE — just the prescription. For conditioning
// the prescription carries the effort-tier colour (the circuit's load-wave), the
// way the % matrix colours its loads; otherwise it stays chalk.
function FallbackRow({ lift, borderTop, onPress }: { lift: ProgramLiftView; borderTop: string; onPress: () => void }) {
  return (
    <button type="button" onClick={onPress} aria-label={`${lift.name} — details`} style={{ ...rowBtn, display: "flex", gap: 14, padding: "12px 18px", alignItems: "baseline", borderTop }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <NameCell lift={lift} />
      </span>
      <span style={{ fontFamily: mono, fontSize: 13, fontWeight: lift.intensity ? 600 : 400, color: lift.intensity ? HEX_T[lift.intensity] : CHALK, textAlign: "right" }}>{lift.prescription}</span>
    </button>
  );
}

// a prose workout line (a run / cross-train) inside a day card
function ProseRow({ lift, borderTop, onPress }: { lift: ProgramLiftView; borderTop: string; onPress: () => void }) {
  const rest = /rest/i.test(lift.name);
  const detail = lift.prescription && lift.note ? `${lift.prescription} (${lift.note})` : lift.prescription || lift.note || null;
  return (
    <button type="button" onClick={onPress} aria-label={`${lift.name} — details`} style={{ ...rowBtn, padding: "12px 18px", borderTop }}>
      <span style={{ display: "block", fontFamily: disp, fontWeight: rest ? 500 : 600, fontSize: 15, color: rest ? ASH : CHALK }}>
        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 8, verticalAlign: "middle", background: HEX[liftColor(lift)] }} />
        {lift.name}
      </span>
      {detail && <span style={{ display: "block", fontFamily: mono, fontSize: 11, color: ASH, marginTop: 3, lineHeight: 1.5, marginLeft: 14 }}>{detail}</span>}
    </button>
  );
}

/**
 * The exercise sheet (idea 09) — every row's full story at reading size: each
 * load as % and kilograms with its volume in words, the author's note given
 * room, the 1RM it's computed from, and RPE explained. Density moves off the
 * table's surface, not out of the product.
 */
function ExerciseSheet({ sel, onClose }: { sel: SheetSel | null; onClose: () => void }) {
  // Keep the last selection through the sheet's exit animation.
  const last = useRef<SheetSel | null>(null);
  if (sel) last.current = sel;
  const v = sel ?? last.current;
  if (!v) return null;
  const { lift, day, marker } = v;
  const where = marker ? `${day} — ${marker}` : day;
  const sub = lift.nl > 0 ? `${where} — ${lift.nl} lifts` : where;
  const steps = lift.steps ?? [];
  const row: React.CSSProperties = { display: "flex", alignItems: "baseline", gap: 10, padding: "12px 0", borderTop: `1px solid ${HAIR}` };
  return (
    <Sheet open={!!sel} onClose={onClose} title={lift.name} sub={sub} maxWidth={480}>
      {lift.note && <div style={{ fontFamily: mono, fontSize: 12, color: ASH, lineHeight: 1.55, marginBottom: 10 }}>{lift.note}</div>}
      {steps.map((st, i) => (
        <div key={i} style={{ ...row, borderTop: i > 0 ? `1px solid ${HAIR}` : "none" }}>
          <span style={{ width: 48, fontFamily: mono, fontSize: 13, fontWeight: 700, color: HEX_T[st.color] }}>{st.load}</span>
          <span style={{ width: 68, fontFamily: mono, fontSize: 13, color: CHALK, fontVariantNumeric: "tabular-nums" }}>{st.kg ?? ""}</span>
          <span style={{ flex: 1, fontFamily: mono, fontSize: 12, color: ASH, textAlign: "right" }}>{stepWords(st)}</span>
        </div>
      ))}
      {lift.oneRm && (
        <div style={{ ...row, borderTop: "1px solid color-mix(in srgb, var(--color-chalk) 12%, transparent)" }}>
          <span style={{ width: 48, fontFamily: mono, fontSize: 13, color: ASH }}>1RM</span>
          <span style={{ width: 68, fontFamily: mono, fontSize: 13, color: CHALK, fontVariantNumeric: "tabular-nums" }}>{lift.oneRm}</span>
          <span style={{ flex: 1, fontFamily: mono, fontSize: 12, color: ASH, textAlign: "right" }}>from your maxes</span>
        </div>
      )}
      {steps.length === 0 && lift.setsReps && (
        <div style={{ ...row, borderTop: "none" }}>
          <span style={{ flex: 1, fontFamily: mono, fontSize: 12, color: ASH }}>Sets × reps</span>
          <span style={{ fontFamily: mono, fontSize: 13, color: CHALK, fontVariantNumeric: "tabular-nums" }}>{lift.setsReps}</span>
        </div>
      )}
      {steps.length === 0 && lift.weight && (
        <div style={row}>
          <span style={{ flex: 1, fontFamily: mono, fontSize: 12, color: ASH }}>Working weight</span>
          <span style={{ fontFamily: mono, fontSize: 13, color: CHALK, fontVariantNumeric: "tabular-nums" }}>{lift.weight}</span>
        </div>
      )}
      {lift.rpe != null && (
        <div style={row}>
          <span style={{ flex: 1, fontFamily: mono, fontSize: 12, color: ASH }}>Effort</span>
          <span style={{ fontFamily: mono, fontSize: 13, color: HEX_T[rpeColor(lift.rpe)] }}>
            @{lift.rpe}
            <span style={{ color: ASH }}> — {rpeMeaning(lift.rpe)}</span>
          </span>
        </div>
      )}
      {steps.length === 0 && lift.setsReps == null && lift.prescription && (
        <div style={{ fontFamily: mono, fontSize: 13, color: CHALK, lineHeight: 1.6 }}>{lift.prescription}</div>
      )}
    </Sheet>
  );
}

// ── pure-prose week → one card of Day rows ────────────────────────────────────
function WeekCard({ days, week, peakNote }: { days: ProgramDayView[]; week: number; peakNote: string | null }) {
  return (
    <Card>
      <WeekHeader title={`Week ${week}`} right={peakNote ? peakNote.toLowerCase() : null} />
      {days.map((day, di) => {
        const lifts = day.sessions.flatMap((s) => s.lifts);
        return (
          <div key={di} style={{ display: "grid", gridTemplateColumns: "42px 1fr", gap: 12, padding: "12px 16px", alignItems: "baseline", borderTop: di > 0 ? `1px solid ${HAIR}` : "none" }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: "#5a5e56", textTransform: "uppercase", letterSpacing: ".08em" }}>{day.title}</span>
            <div>
              {lifts.length === 0 ? (
                <WeekRow restName={day.kindLabel ?? "—"} first />
              ) : (
                lifts.map((l, i) => <WeekRow key={i} lift={l} first={i === 0} />)
              )}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

function WeekRow({ lift, restName, first }: { lift?: ProgramLiftView; restName?: string; first: boolean }) {
  const name = lift?.name ?? restName ?? "—";
  const rest = lift ? /rest/i.test(lift.name) : true;
  const detail = lift ? (lift.prescription && lift.note ? `${lift.prescription} (${lift.note})` : lift.prescription || lift.note || null) : null;
  return (
    <div style={{ marginTop: first ? 0 : 9 }}>
      <div style={{ fontFamily: disp, fontWeight: rest ? 500 : 600, fontSize: 15, color: rest ? ASH : CHALK }}>
        <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", marginRight: 8, verticalAlign: "middle", background: HEX[lift ? liftColor(lift) : "ash"] }} />
        {name}
      </div>
      {detail && <div style={{ fontFamily: mono, fontSize: 11, color: ASH, marginTop: 3, lineHeight: 1.5, marginLeft: 14 }}>{detail}</div>}
    </div>
  );
}
