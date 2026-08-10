"use client";

import { useEffect, useRef, useState } from "react";
import { fs, tracking } from "@hybrid/core";
import { haptic } from "@/lib/haptics";

/**
 * THE TOAST — one small glass chip for a one-line outcome ("Following",
 * "Reported"), TWIN of apps/mobile/components/aurora/toast.tsx.
 *
 * It exists because the overflow menu now DISMISSES on select (the mobile menu
 * is the system's on iOS 26, and a system menu cannot hold a row open to tag
 * it "Followed ✓" in place) — so the outcome needs somewhere to land that
 * isn't a modal interruption, and both clients report through the same chip so
 * the behaviour cannot fork.
 *
 * NOT a notification system: one message at a time, a newer one replaces the
 * current one, nothing queues, nothing is pressable. Anything that needs a
 * decision is a dialog; anything that needs to persist is a screen's own
 * state. `toast()` is imperative for the same reason mobile `confirm()` is — a
 * result line at a call site should read as one, not as a piece of state.
 */

/** An outcome chip, or a FAILURE chip. The kind exists so a failure can't pass
 *  as an outcome: "error" reads in the failure voice (red), stays up longer,
 *  and knocks (haptic.error — the audit's §15: a silent failure on a phone is
 *  a failure the user doesn't notice). The haptic fires in the HOST, once, so
 *  no call site can forget it — the same one-gate reasoning as lib/haptics. */
export type ToastKind = "outcome" | "error";

const listeners = new Set<(msg: string, kind: ToastKind) => void>();

/** Show one line of outcome. Safe to call from anywhere; no-op until the host
 *  is mounted (which is the app shell). */
export function toast(msg: string, kind: ToastKind = "outcome") {
  for (const l of listeners) l(msg, kind);
}

const SHOW_MS = 1800;
/** A failure earns a longer read — it is the one chip the user must not miss. */
const SHOW_ERROR_MS = 3600;

/** Mounted ONCE in the app shell, so a toast overlays whatever screen fired
 *  it. Sits above the pill nav — an outcome chip must not cover the controls
 *  that are about to be used next. */
export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  const [kind, setKind] = useState<ToastKind>("outcome");
  const [shown, setShown] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (m: string, k: ToastKind) => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
      setMsg(m);
      setKind(k);
      if (k === "error") haptic.error();
      // Two frames so a replacing toast still re-triggers the rise.
      requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      hideTimer.current = setTimeout(() => {
        setShown(false);
        clearTimer.current = setTimeout(() => setMsg(null), 300);
      }, k === "error" ? SHOW_ERROR_MS : SHOW_MS);
    };
    listeners.add(onToast);
    return () => {
      listeners.delete(onToast);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (clearTimer.current) clearTimeout(clearTimer.current);
    };
  }, []);

  return (
    <div
      aria-live={kind === "error" ? "assertive" : "polite"}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: "calc(env(safe-area-inset-bottom, 0px) + 96px)",
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 60,
      }}
    >
      {msg !== null && (
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: fs.caption,
            fontWeight: 600,
            letterSpacing: tracking.caps,
            textTransform: "uppercase",
            color: kind === "error" ? "var(--color-red)" : "var(--color-chalk)",
            // The same glass grammar as the pill nav: a light film under a
            // modest blur, identity at the rim.
            background: "rgba(var(--glass-base), 0.6)",
            WebkitBackdropFilter: "blur(18px) saturate(160%)",
            backdropFilter: "blur(18px) saturate(160%)",
            boxShadow: "inset 0 1px 0 var(--inner-hi), inset 0 0 0 1px rgba(255,255,255,0.08), 0 10px 30px -12px rgba(0,0,0,0.5)",
            borderRadius: 999,
            padding: "9px 16px",
            opacity: shown ? 1 : 0,
            transform: shown ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.22s ease, transform 0.22s ease",
          }}
        >
          {msg}
        </span>
      )}
    </div>
  );
}
