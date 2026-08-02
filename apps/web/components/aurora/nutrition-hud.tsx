"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import {
  NUTRITION_HUD_ACCENT,
  NUTRITION_HUD_BAR_H,
  NUTRITION_HUD_LETTER,
  NUTRITION_HUD_ORDER,
  nutritionHudState,
  // The rail moves on Today's motion table — one voice for both rails.
  railCurve,
  railMotion,
  type NutritionHudPill,
  type NutritionHudSlot,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";

// ── AURORA nutrition HUD (web) ──────────────────────────────────────────────
// The sticky element the nutrition screens leave behind. The calorie ring
// answers "how much is left?" once, at the top of the hub; scroll past it into
// the diary, your meals, your products or the food picker and the answer is
// gone. This rail keeps it: each capsule is the RESIDUE OF A CARD YOU HAVE
// ALREADY READ — kcal from the ring, then protein/carbs/fat from the macro
// card — and it retracts in the order it arrived.
//
// Capture, release, hysteresis and the contraction rule all come from
// @hybrid/core (nutrition-hud.ts) so mobile pins at the identical points; this
// file owns only the pixels. Mirrored on mobile (aurora/nutrition-hud.tsx).
// Deliberately the same idiom — and the same motion constants — as Today's pill
// rail (today-rail.tsx): two rails that behaved differently would read as two
// different products.
//
// On the hub the wrapper is a ZERO-HEIGHT sticky: it takes no space in the
// flow, and the bar is absolutely positioned over the content so the page
// scrolls UNDER the blur rather than being pushed down by a bar that is empty
// most of the time.
//
// On a sub-screen (`always`) the bar is never empty, so it takes its space in
// the flow instead — overlaying there would permanently sit on top of the
// screen head and cover the back button.

const C = (v: string) => `var(--color-${v})`;
const AT = (v: string) => `var(--${v}-text)`;

/** Mirrors today-rail.tsx's own hook so the two rails suppress motion alike. */
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

export interface NutritionHudAnchorRefs {
  /** the calorie-ring card. */
  energy: RefObject<HTMLElement | null>;
  /** the macro card. */
  macros: RefObject<HTMLElement | null>;
}

export default function AuroraNutritionHud({
  slots,
  anchors,
  always = false,
  onReveal,
}: {
  /** the four readouts from nutritionHudSlots(fuel). */
  slots: NutritionHudSlot[];
  /** the source cards, on the hub. Omit on a screen that has none. */
  anchors?: NutritionHudAnchorRefs;
  /** the sub-screens: no ring to scroll past, so pin from the first pixel. */
  always?: boolean;
  /** tapping a capsule goes back to the card it came from. */
  onReveal?: (key: NutritionHudPill) => void;
}) {
  const { t } = useLang();
  const reduced = useReducedMotion();
  const [captured, setCaptured] = useState<NutritionHudPill[]>(always ? [...NUTRITION_HUD_ORDER] : []);
  const [tight, setTight] = useState(always);
  // The live list is read inside the scroll handler without re-subscribing, so
  // hysteresis can compare against the previous frame.
  const held = useRef<NutritionHudPill[]>(always ? [...NUTRITION_HUD_ORDER] : []);

  useEffect(() => {
    if (always) {
      held.current = [...NUTRITION_HUD_ORDER];
      setCaptured([...NUTRITION_HUD_ORDER]);
      setTight(true);
      return;
    }
    let frame = 0;
    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const bottomOf = (r?: RefObject<HTMLElement | null>) => {
        const el = r?.current;
        if (!el) return null;
        return el.getBoundingClientRect().bottom + y;
      };
      const next = nutritionHudState(
        { energy: bottomOf(anchors?.energy), macros: bottomOf(anchors?.macros) },
        y,
        { prev: held.current },
      );
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
  }, [anchors, always]);

  const has = (k: NutritionHudPill) => captured.includes(k);
  const pinned = captured.length > 0;

  const pin = railMotion("pin", reduced);
  const bloom = railMotion("bloom", reduced);
  const retract = railMotion("retract", reduced);
  const contract = railMotion("contract", reduced);

  /** One capsule's transition set: in on the overshoot curve, out on the flat
   *  one — the same pairing Today's rail uses. */
  const pillStyle = (open: boolean): React.CSSProperties => {
    const m = open ? bloom : retract;
    const curve = railCurve(m);
    return {
      display: "inline-flex",
      alignItems: "baseline",
      gap: 5,
      overflow: "hidden",
      whiteSpace: "nowrap",
      maxWidth: open ? 200 : 0,
      opacity: open ? 1 : 0,
      transform: open || reduced ? "none" : "scale(.68) translateY(-3px)",
      padding: open ? "5px 11px" : "5px 0",
      marginLeft: open ? 0 : -6,
      borderRadius: 999,
      border: `1px solid ${C("line")}`,
      borderColor: open ? C("line") : "transparent",
      background: C("ink2"),
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      letterSpacing: ".08em",
      fontVariantNumeric: "tabular-nums",
      cursor: onReveal ? "pointer" : "default",
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

  return (
    <div
      aria-hidden={!pinned}
      // A group, never a live region: the rail captures on every scroll frame
      // and a live region would announce each one.
      role={pinned ? "group" : undefined}
      aria-label={pinned ? t("w.recovery.nutrition.hud.barAria") : undefined}
      style={{
        position: "sticky",
        top: 0,
        // Transient on the hub, so it costs no layout; permanent on a
        // sub-screen, where an overlay would cover the back button.
        height: always ? undefined : 0,
        zIndex: 30,
        margin: always
          ? "0 calc(-1 * var(--page-pad-x, 16px)) 4px"
          : "0 calc(-1 * var(--page-pad-x, 16px))",
        pointerEvents: pinned ? "auto" : "none",
      }}
    >
      <div
        style={{
          position: always ? "relative" : "absolute",
          top: 0,
          left: 0,
          right: 0,
          minHeight: NUTRITION_HUD_BAR_H,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
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
        {NUTRITION_HUD_ORDER.map((key) => {
          const slot = slots.find((s) => s.key === key);
          if (!slot) return null;
          const accent = NUTRITION_HUD_ACCENT[key];
          const letter = NUTRITION_HUD_LETTER[key];
          // Only a breach earns the red — the rail reports rather than nags.
          const fg = slot.over ? AT("red") : key === "kcal" ? AT("lime") : AT(accent);
          const tone = slot.over
            ? { bg: `color-mix(in srgb, ${C("red")} 10%, transparent)`, bd: `color-mix(in srgb, ${C("red")} 34%, transparent)` }
            : key === "kcal"
              ? { bg: `color-mix(in srgb, ${C("lime")} 10%, transparent)`, bd: `color-mix(in srgb, ${C("lime")} 34%, transparent)` }
              : { bg: C("ink2"), bd: C("line") };
          const open = has(key);
          return (
            <button className="pressable"
              key={key}
              type="button"
              tabIndex={open ? 0 : -1}
              aria-label={t(key === "kcal" ? "w.recovery.nutrition.hud.energyAria" : "w.recovery.nutrition.hud.macrosAria")}
              onClick={() => onReveal?.(key)}
              style={{
                ...pillStyle(open),
                color: fg,
                background: tone.bg,
                borderColor: open ? tone.bd : "transparent",
              }}
            >
              {letter ? <span style={{ opacity: 0.72, fontWeight: 700 }}>{letter}</span> : null}
              <span style={{ fontWeight: 700 }}>{Math.round(slot.left)}</span>
              {/* kcal keeps the word "left" — it is the whole point of the rail.
                  The macro capsules shed their `g` at the ceiling instead. */}
              {key === "kcal" ? (
                <span style={{ fontSize: 9, letterSpacing: ".12em", textTransform: "uppercase", opacity: 0.72 }}>
                  {t("w.recovery.nutrition.hud.left")}
                </span>
              ) : (
                <span
                  style={{
                    display: "inline-block",
                    overflow: "hidden",
                    maxWidth: tight ? 0 : 14,
                    opacity: tight ? 0 : 0.72,
                    fontSize: 9,
                    transition: `max-width ${contract.ms}ms ${railCurve(contract)}, opacity ${Math.round(contract.ms * 0.7)}ms ease`,
                  }}
                >
                  g
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
