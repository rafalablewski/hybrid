"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion } from "@hybrid/core";

const C = (v: string) => `var(--color-${v})`;

/**
 * AURORA Sheet (web) — a slide-up bottom-sheet modal. A scrim fades in while a
 * rounded panel slides up from the bottom; dismissing slides it back down
 * before it unmounts. This is the shared modal transition for the Today quick
 * actions (Quick Log · Readiness · Done · Nutrition · Follow a coach) and the
 * Full upgrade paywall, mirroring the mobile Sheet (aurora/sheet.tsx) so both
 * clients feel identical.
 *
 * `open` mounts it; the component keeps itself in the DOM through the exit
 * animation, so callers just flip a boolean. An optional `title`/`sub` renders
 * the standard sheet header under the grab handle.
 *
 * PRESENTATION. While a sheet is up, the presenting screen RECEDES — scales to
 * motion.recedeScale with its corner radius growing to a device radius and its
 * brightness dropping — so the sheet reads as sitting on a real stack rather
 * than floating over a static picture. That is driven by a `data-sheet-open`
 * flag on <html> (globals.css `.motion-recede-host`), because the sheet has no
 * reference to the shell. Because the host is transformed, a position:fixed
 * descendant of it would be trapped by the transform — so the sheet PORTALS to
 * <body>, outside the receding subtree. Sheets are reference-counted: nested or
 * stacked sheets only un-recede once the last one closes.
 */

// How many sheets are currently up. The recede flag belongs to the document,
// not to any one sheet, so closing an inner sheet must not un-recede the shell
// while an outer one is still open.
let openSheets = 0;
export default function Sheet({
  open,
  onClose,
  title,
  sub,
  children,
  maxWidth = 640,
  label,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  /** A node, not just a string, so callers can inline an AuroraIcon (e.g. the
   *  Done sheet's flame beside the streak count). */
  sub?: ReactNode;
  children: ReactNode;
  maxWidth?: number;
  label?: string;
}) {
  // Two-phase mount: `mounted` keeps the node alive through the exit animation;
  // `shown` drives the transform/opacity. Flipping `shown` a frame after mount
  // lets the browser animate up from the initial (down, transparent) state.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      if (timer.current) clearTimeout(timer.current);
      setMounted(true);
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
      return () => cancelAnimationFrame(r);
    }
    setShown(false);
    // EXIT is fast + complete: the panel leaves on --d-fast (160ms, matching
    // the mobile sheet's exit) and unmounts exactly when the transition ends —
    // the old 300ms timeout cut the 378ms sheet spring at 79%.
    timer.current = setTimeout(() => setMounted(false), 160);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [open]);

  // Lock the background from scrolling while the sheet is up.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mounted]);

  // Drive the shell's recede. Keyed on `open` (not `mounted`) so the shell
  // starts coming back as the sheet starts leaving, rather than snapping after
  // the exit finishes.
  useEffect(() => {
    if (!open) return;
    openSheets += 1;
    document.documentElement.dataset.sheetOpen = "";
    return () => {
      openSheets = Math.max(0, openSheets - 1);
      if (openSheets === 0) delete document.documentElement.dataset.sheetOpen;
    };
  }, [open]);

  // Esc dismisses, like any modal.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "flex-end", justifyContent: "center", background: `rgba(0,0,0,${shown ? motion.scrimWithRecede : 0})`, transition: `background ${open ? "var(--d-sheet)" : "var(--d-fast)"} var(--e-fade)` }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="motion-sheet-panel"
        style={{
          width: "100%",
          maxWidth,
          background: C("ink2"),
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          border: `1px solid ${C("line")}`,
          borderBottom: "none",
          boxShadow: "0 -10px 44px -14px rgba(0,0,0,.6)",
          padding: "12px 20px calc(26px + env(safe-area-inset-bottom))",
          maxHeight: "90vh",
          overflowY: "auto",
          transform: shown ? "translateY(0)" : "translateY(100%)",
          opacity: shown ? 1 : 0,
          // ENTRANCE keeps the sheet spring (from .motion-sheet-panel); the
          // EXIT overrides it inline to the fast 160ms leave so the panel is
          // fully off-screen when the unmount timeout fires. Reduced-motion's
          // !important class rule still outranks this inline override.
          ...(open ? {} : { transition: "transform var(--d-fast) var(--e-exit), opacity var(--d-fast) var(--e-fade)" }),
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 999, background: C("line"), margin: "0 auto 16px" }} />
        {title && <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 22, letterSpacing: "-.02em", color: C("chalk") }}>{title}</div>}
        {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), margin: "4px 0 0" }}>{sub}</div>}
        <div style={{ marginTop: title || sub ? 14 : 0 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
