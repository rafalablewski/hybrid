"use client";

import { useCallback, useEffect, useState } from "react";
import { fs, space, INK, INK2, LINE, LIME, CHALK, ASH, ON_ACCENT, disp, Mono, txt } from "@/lib/ui";

// ============================================================
//  Guided coach-marks tour — the first-run "how to use HYBRID"
//  walkthrough. A spotlight overlay steps through real on-screen
//  elements (tagged with data-tour="<id>") and, when an element
//  isn't on screen, falls back to a centred card. Shown ONCE per
//  account after onboarding (see app-shell) and never for a user
//  who is mid-flow saving a guest workout.
// ============================================================

export interface TourStep {
  /** data-tour id of the element to spotlight (centred card if absent/missing). */
  target?: string;
  title: string;
  body: string;
}

type Rect = { top: number; left: number; width: number; height: number };

function measure(target?: string): Rect | null {
  if (!target || typeof document === "undefined") return null;
  const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export default function Tour({ steps, onDone }: { steps: TourStep[]; onDone: () => void }) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = steps[i];

  // Re-measure the current target on step change, scroll and resize so the
  // spotlight tracks the live element.
  const sync = useCallback(() => {
    const el = step?.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null;
    el?.scrollIntoView({ block: "center", behavior: "smooth" });
    // measure after the smooth scroll settles
    requestAnimationFrame(() => setRect(measure(step?.target)));
    setTimeout(() => setRect(measure(step?.target)), 320);
  }, [step?.target]);

  useEffect(() => {
    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);
    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [sync]);

  if (!step) return null;

  const last = i === steps.length - 1;
  const pad = 8;
  const hole = rect
    ? { top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }
    : null;

  // Tooltip sits below the spotlight when there's room, else above; centred when
  // there's no target.
  const tipW = Math.min(360, typeof window !== "undefined" ? window.innerWidth - 32 : 360);
  let tipStyle: React.CSSProperties;
  if (hole) {
    const below = hole.top + hole.height + 12;
    const wantAbove = below + 180 > (typeof window !== "undefined" ? window.innerHeight : 800);
    const top = wantAbove ? Math.max(16, hole.top - 12) : below;
    let left = hole.left + hole.width / 2 - tipW / 2;
    const maxLeft = (typeof window !== "undefined" ? window.innerWidth : 360) - tipW - 16;
    left = Math.max(16, Math.min(left, maxLeft));
    tipStyle = { position: "fixed", top, left, width: tipW, transform: wantAbove ? "translateY(-100%)" : undefined };
  } else {
    tipStyle = { position: "fixed", top: "50%", left: "50%", width: tipW, transform: "translate(-50%, -50%)" };
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 9999 }} role="dialog" aria-modal="true" aria-label="App tour">
      {/* Dimmer — a single overlay with a transparent cut-out ring around the
          target (box-shadow trick) so the highlighted element shows through. */}
      {hole ? (
        <div
          style={{
            position: "fixed",
            top: hole.top,
            left: hole.left,
            width: hole.width,
            height: hole.height,
            borderRadius: 14,
            boxShadow: `0 0 0 9999px rgba(8,9,11,.82), 0 0 0 2px ${LIME}`,
            transition: "all .2s ease",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div style={{ position: "fixed", inset: 0, background: "rgba(8,9,11,.82)" }} />
      )}

      <div
        style={{
          ...disp,
          ...tipStyle,
          background: INK2,
          border: `1px solid ${LINE}`,
          borderRadius: 18,
          padding: 20,
          boxShadow: "0 18px 50px -20px rgba(0,0,0,.7)",
        }}
      >
        <Mono s={{ fontSize: fs.micro, textTransform: "uppercase", letterSpacing: ".12em" }} c={LIME}>
          {`Step ${i + 1} / ${steps.length}`}
        </Mono>
        <div style={{ ...disp, fontWeight: 800, fontSize: fs.title, margin: "8px 0 6px" }}>{step.title}</div>
        <Mono s={{ fontSize: fs.body, lineHeight: 1.6, display: "block" }} c={CHALK}>{step.body}</Mono>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 18, gap: space.md }}>
          <button
            onClick={onDone}
            style={{ ...disp, background: "transparent", border: "none", color: txt(ASH), fontSize: fs.note, cursor: "pointer" }}
          >
            Skip
          </button>
          <div style={{ display: "flex", gap: space.xs }}>
            {i > 0 && (
              <button
                onClick={() => setI((n) => n - 1)}
                style={{ ...disp, background: INK, border: `1px solid ${LINE}`, color: txt(CHALK), fontSize: fs.note, fontWeight: 700, borderRadius: 999, padding: "10px 18px", cursor: "pointer" }}
              >
                Back
              </button>
            )}
            <button
              onClick={() => (last ? onDone() : setI((n) => n + 1))}
              style={{ ...disp, background: LIME, border: "none", color: ON_ACCENT, fontSize: fs.note, fontWeight: 800, borderRadius: 999, padding: "10px 22px", cursor: "pointer" }}
            >
              {last ? "Got it" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The default first-run tour copy — what HYBRID is and how to drive it. */
export const FIRST_RUN_TOUR: TourStep[] = [
  {
    target: "today-plan",
    title: "Your day, here",
    body: "Today is your home. When you follow a plan, your exact session for the day shows up here — tap Start to log it.",
  },
  {
    target: "nav-plans",
    title: "Follow a plan",
    body: "Browse the plan library and enrol. Following a plan is free — HYBRID then walks you through it session by session.",
  },
  {
    target: "nav-profile",
    title: "Your profile",
    body: "Your HPI, records and training history live here as you log. It builds entirely from your real workouts — nothing is pre-filled.",
  },
  {
    target: "nav-settings",
    title: "Configure your account",
    body: "Set your name, language, notifications and privacy in Settings. You can switch to the full athlete toolkit anytime.",
  },
];
