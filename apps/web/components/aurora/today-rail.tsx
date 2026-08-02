"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  TODAY_RAIL_BAR_H,
  railCurve,
  railMotion,
  todayRailState,
  type LogbookDay,
  type TodayDoneState,
  type TodayPillKey,
  type TodayRailSource,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import ReadinessFace from "./readiness-face";
import type { ReadinessFeeling } from "@hybrid/core";

// Mirrors the mobile useReducedMotion so the rail's motion is suppressed for
// users who ask for less of it.
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

// ── AURORA Today pill rail (web) ────────────────────────────────────────────
// The sticky element Today leaves behind. Scrolling past the logbook used to
// drop every anchor at once; now each card hands ONE answer up to a 36px rail
// as it clears the top — the date, then whether today is done, then how ready
// you feel. Capture/release/contraction all come from @hybrid/core
// (today-rail.ts) so mobile pins at the identical points; this file owns only
// the pixels. Mirrored on mobile (aurora/today-rail.tsx).
//
// The wrapper is a ZERO-HEIGHT sticky: it takes no space in the flow, and the
// bar itself is absolutely positioned over the content so the page scrolls
// UNDER the blur rather than being pushed down by a bar that is empty most of
// the time.

const C = (v: string) => `var(--color-${v})`;
const AT = (v: string) => `var(--${v}-text)`;

export interface TodayRailAnchors {
  /** the week strip (inside whichever week rail is mounted). */
  date: RefObject<HTMLElement | null>;
  /** the logbook/plan card that carries today's result. */
  done: RefObject<HTMLElement | null>;
  /** the daily check-in card. */
  ready: RefObject<HTMLElement | null>;
}

export default function AuroraTodayRail({
  anchors,
  days,
  doneState,
  feeling,
  onOpenMonth,
  onOpenDone,
  onOpenCheckin,
}: {
  anchors: TodayRailAnchors;
  /** the same seven days the week strip drew, so the dot track cannot drift. */
  days: Pick<LogbookDay, "dateKey" | "logged" | "isToday" | "weekdayShort" | "dayOfMonth" | "monthShort">[];
  doneState: TodayDoneState;
  feeling: ReadinessFeeling | null;
  onOpenMonth: () => void;
  onOpenDone: () => void;
  onOpenCheckin: () => void;
}) {
  const { t } = useLang();
  const reduced = useReducedMotion();
  const [captured, setCaptured] = useState<TodayPillKey[]>([]);
  const [tight, setTight] = useState(false);
  // The live list is read inside the scroll handler without re-subscribing, so
  // hysteresis can compare against the previous frame.
  const held = useRef<TodayPillKey[]>([]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const bottomOf = (r: RefObject<HTMLElement | null>) => {
        const el = r.current;
        if (!el) return null;
        return el.getBoundingClientRect().bottom + y;
      };
      const sources: TodayRailSource[] = [
        { key: "date", bottom: bottomOf(anchors.date) },
        { key: "done", bottom: bottomOf(anchors.done) },
        { key: "ready", bottom: bottomOf(anchors.ready) },
      ];
      const next = todayRailState(sources, y, { prev: held.current });
      const changed =
        next.captured.length !== held.current.length ||
        next.captured.some((k, i) => k !== held.current[i]);
      if (changed) {
        held.current = next.captured;
        setCaptured(next.captured);
      }
      setTight(next.tight);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [anchors]);

  const has = (k: TodayPillKey) => captured.includes(k);
  const pinned = captured.length > 0;

  const today = days.find((d) => d.isToday) ?? days[days.length - 1];
  const pin = railMotion("pin", reduced);
  const bloom = railMotion("bloom", reduced);
  const retract = railMotion("retract", reduced);
  const contract = railMotion("contract", reduced);

  /** One pill's transition set: in on the overshoot curve, out on the flat one. */
  const pillStyle = (open: boolean): React.CSSProperties => {
    const m = open ? bloom : retract;
    const curve = railCurve(m);
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      overflow: "hidden",
      whiteSpace: "nowrap",
      maxWidth: open ? 240 : 0,
      opacity: open ? 1 : 0,
      transform: open || reduced ? "none" : "scale(.68) translateY(-3px)",
      padding: open ? "5px 12px" : "5px 0",
      marginLeft: open ? 0 : -7,
      borderRadius: 999,
      border: `1px solid ${C("line")}`,
      borderColor: open ? C("line") : "transparent",
      background: C("ink2"),
      color: C("chalk"),
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: ".08em",
      cursor: "pointer",
      transformOrigin: "50% 50%",
      transition: [
        `max-width ${m.ms}ms ${curve}`,
        `transform ${m.ms}ms ${curve}`,
        `padding ${m.ms}ms ${curve}`,
        `margin ${m.ms}ms ${curve}`,
        `opacity ${Math.round(m.ms * 0.7)}ms ease`,
        `border-color ${m.ms}ms ${curve}`,
      ].join(", "),
    };
  };

  const doneTone =
    doneState === "done"
      ? { fg: AT("lime"), bg: `color-mix(in srgb, ${C("lime")} 10%, transparent)`, bd: `color-mix(in srgb, ${C("lime")} 34%, transparent)` }
      : { fg: C("ash"), bg: C("ink2"), bd: C("line") };
  const doneLabel = t(`w.home.pill.${doneState === "none" ? "log" : doneState}`);
  const doneAria = t(`w.home.pill.${doneState === "none" ? "log" : doneState}Aria`);

  return (
    <div
      aria-hidden={!pinned}
      style={{
        position: "sticky",
        top: 0,
        height: 0,
        zIndex: 30,
        margin: "0 calc(-1 * var(--page-pad-x, 16px))",
        pointerEvents: pinned ? "auto" : "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          minHeight: TODAY_RAIL_BAR_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "8px var(--page-pad-x, 16px) 8px",
          background: `color-mix(in srgb, ${C("ink")} 82%, transparent)`,
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderBottom: `1px solid ${pinned ? C("line") : "transparent"}`,
          opacity: pinned ? 1 : 0,
          transform: pinned || reduced ? "none" : "translateY(-7px)",
          transition: `opacity ${pin.ms}ms ${railCurve(pin)}, transform ${pin.ms}ms ${railCurve(pin)}, border-color ${pin.ms}ms ${railCurve(pin)}`,
        }}
      >
        {/* DATE — the week strip's residue. At the ceiling it sheds its month
            and dot track (see .tight in core) and contracts to "Sun 26". */}
        <button className="pressable" type="button" onClick={onOpenMonth} aria-label={t("w.home.pill.dateAria")} style={pillStyle(has("date"))}>
          {today ? `${today.weekdayShort} ${today.dayOfMonth}` : ""}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              overflow: "hidden",
              maxWidth: tight ? 0 : 140,
              opacity: tight ? 0 : 1,
              marginLeft: tight ? -7 : 0,
              transition: `max-width ${contract.ms}ms ${railCurve(contract)}, opacity ${Math.round(contract.ms * 0.7)}ms ease, margin-left ${contract.ms}ms ${railCurve(contract)}`,
            }}
          >
            {today?.monthShort}
            <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {days.map((d) => (
                <i
                  key={d.dateKey}
                  style={{
                    width: d.isToday ? 7 : 5,
                    height: d.isToday ? 7 : 5,
                    borderRadius: 999,
                    display: "block",
                    background: d.isToday ? C("lime") : d.logged ? `color-mix(in srgb, ${C("lime")} 55%, ${C("ash")})` : C("line"),
                  }}
                />
              ))}
            </span>
          </span>
        </button>

        {/* DONE — today's verdict. Only a finished day earns the accent, so the
            rail reports rather than nags. */}
        <button className="pressable"
          type="button"
          onClick={onOpenDone}
          aria-label={doneAria}
          style={{ ...pillStyle(has("done")), color: doneTone.fg, background: doneTone.bg, borderColor: has("done") ? doneTone.bd : "transparent" }}
        >
          {doneState === "done" && (
            <svg width={11} height={11} viewBox="0 0 12 12" fill="none" aria-hidden>
              <path d="M2.5 6.3 5 8.6 9.5 3.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {doneLabel}
        </button>

        {/* READY — the check-in's residue. Not checked in yet is the state that
            matters most in the evening: the pill becomes the prompt. */}
        <button className="pressable"
          type="button"
          onClick={onOpenCheckin}
          aria-label={t("w.home.pill.readyAria")}
          style={{ ...pillStyle(has("ready")), paddingLeft: has("ready") ? (feeling ? 8 : 12) : 0, color: feeling ? AT(FACE_ACCENT[feeling]) : C("ash") }}
        >
          {feeling ? <ReadinessFace feeling={feeling} size={18} /> : null}
          {feeling ? t(`w.recovery.readiness.${feeling}`) : t("w.home.pill.howReady")}
        </button>
      </div>
    </div>
  );
}

/** The feeling's semantic accent, mirroring READINESS_FACE without pulling the
 *  whole record in for one lookup. */
const FACE_ACCENT: Record<ReadinessFeeling, string> = {
  primed: "lime",
  good: "blue",
  flat: "amber",
  wrecked: "red",
};
