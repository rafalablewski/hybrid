"use client";

import { alsoTodayCopy, sessionIcon, sessionMeta, fs, type LoggedSession, type WeightUnit } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { ArrowGlyph } from "./cta-label";

const C = (v: string) => `var(--color-${v})`;

// ── AURORA Done floor (web) ─────────────────────────────────────────────────
// What was ACTUALLY logged on the viewed day — one row per session — as the
// LOWER FLOOR of the week rail's card, under a labelled seam.
//
// It used to be a card of its own sitting below the rail, which meant Today
// drew the same day twice: the rail named the work under the calendar, and this
// card named it again three hundred pixels down. Merging them (option 01 of the
// merge study, Aug 2026) puts one day in one card — but the two floors must
// never blur into each other, because they are different KINDS of thing:
// above the seam is what the plan ASKS of you (a prescription, with Start /
// Skip / Move), below it is what you DID. A tennis row sitting directly under
// Trap-Bar Deadlift with only a hairline between them reads as the last item of
// the prescription, which is a lie.
//
// So the seam carries the count — "2 done today" — which is the old card's
// display-weight numeral demoted to a label, and keeps the arrow into the
// Done-today sheet. At zero it drops the arrow and speaks the invitation
// instead ("a match, a run, a swim — it lands here"), because a "0" is not
// worth a surface.
//
// Mirrors the mobile twin (aurora/done-floor.tsx) exactly.
export default function DoneFloor({
  rows,
  planIds,
  isToday,
  dayLabel,
  units,
  bw,
  pad = 20,
  rule = true,
  onOpen,
  onLog,
  onDone,
}: {
  /** every session logged on the VIEWED day, plan-fulfilling ones included. */
  rows: LoggedSession[];
  /** ids the plan claims — those rows wear the Plan tag. */
  planIds: Set<string>;
  /** false when the week rail has another day selected: the seam label carries
   *  the date and the log row hides (a quick log always saves at "now"). */
  isToday: boolean;
  dayLabel: string | null;
  units: WeightUnit;
  bw: (isoDate?: string) => number | null;
  /** the host card's horizontal padding — the seam's hairline bleeds by it. */
  pad?: number;
  /** false when the floor IS the card (nothing above it to be separated from). */
  rule?: boolean;
  onOpen: (sessionId: string) => void;
  onLog: () => void;
  onDone: () => void;
}) {
  const { t } = useLang();
  const quiet = `color-mix(in srgb, ${C("ash")} 60%, transparent)`;
  // caption + log-label state machine lives in core so the mobile twin can't drift
  const copy = alsoTodayCopy({ doneCount: rows.length, isToday });
  const countLabel = isToday
    ? `${rows.length} ${t("w.home.today.glanceDone")}`
    : `${rows.length} ${t("w.home.today.glanceDoneOn").replace("{d}", dayLabel ?? "")}`;

  return (
    <div>
      {rule && <div style={{ height: 1, background: C("line"), margin: `16px -${pad}px 14px` }} />}

      {/* THE SEAM. A count is a label, so it sets in mono uppercase and taps
          through to the sheet; an empty day is a sentence, so it stays in
          sentence case and taps nowhere. */}
      {rows.length > 0 ? (
        <button
          className="pressable"
          type="button"
          onClick={onDone}
          aria-label={countLabel}
          style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, background: "none", border: "none", padding: "2px 0", cursor: "pointer", textAlign: "left" }}
        >
          <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: C("ash") }}>{countLabel}</span>
          <span style={{ color: quiet, flexShrink: 0, display: "grid", placeItems: "center" }}><ArrowGlyph size={14} /></span>
        </button>
      ) : (
        <p style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.5, color: quiet, margin: 0 }}>{t(copy.subKey ?? "w.home.today.alsoTodaySubEmpty")}</p>
      )}

      <div style={{ marginTop: rows.length > 0 ? 4 : 6, display: "flex", flexDirection: "column", gap: 4 }}>
        {rows.map((s) => {
          const onPlanRow = planIds.has(s.id);
          return (
            <button className="pressable" type="button" key={s.id} onClick={() => onOpen(s.id)} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: "8px 0", cursor: "pointer", color: C("chalk") }}>
              <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 18, background: `color-mix(in srgb, ${C(onPlanRow ? "lime" : "blue")} 16%, transparent)` }}>
                {sessionIcon(s)}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: fs.note, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.title}</span>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: fs.caption, color: C("ash"), marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {/* NO CLOCK TIME HERE. This line used to end with the session's
                      startedAt as "21:33" — which reads as WHEN YOU TRAINED but,
                      for a quick-logged sport, is stamped at save time: it is the
                      moment the record was typed, not the moment the swim
                      happened. The row says what was DONE; when it was entered is
                      bookkeeping and belongs nowhere on Today. */}
                  {sessionMeta(s, units, bw(s.startedAt))}
                </span>
              </span>
              {onPlanRow && (
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, letterSpacing: ".12em", textTransform: "uppercase", color: "var(--lime-text)", flexShrink: 0 }}>{t("w.home.today.kPlan")}</span>
              )}
            </button>
          );
        })}
        {isToday && (
          <button className="pressable" type="button" onClick={onLog} style={{ width: "100%", textAlign: "left", display: "flex", alignItems: "center", gap: 12, background: "none", border: "none", padding: "8px 0", cursor: "pointer" }}>
            <span style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, display: "grid", placeItems: "center", fontSize: 17, background: "transparent", border: `1px dashed color-mix(in srgb, ${C("ash")} 40%, transparent)`, color: C("ash") }}>＋</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--lime-text)" }}>{t(copy.logKey)}</span>
          </button>
        )}
      </div>
    </div>
  );
}
