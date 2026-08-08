"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, sheetGesture, resolveSheetRelease, rubberBand, sheetPadBottom, type SheetDetent } from "@hybrid/core";
import { haptic } from "@/lib/haptics";

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
 * THE HANDLE IS A GESTURE. Both clients drew iOS's 40×4 "drag me" glyph and
 * bound nothing to it, so the first thing a fluent user tries did nothing. The
 * panel now tracks the pointer 1:1 downward and rubber-bands upward; the scrim
 * and the parent's recede interpolate on the SAME drag input (via the
 * --sheet-p custom property, see globals.css) so the whole stack is attached to
 * the hand; and the release is decided by velocity projection in @hybrid/core
 * `resolveSheetRelease` — shared with mobile so the two snap identically.
 *
 * DETENTS. `detents` defaults to ["large"] (the old single-height behaviour).
 * Pass ["medium","large"] for a sheet that opens short and expands.
 *
 * THE BOTTOM PAD IS THE SHEET'S, not the caller's. It comes from @hybrid/core
 * `sheetPadBottom`, the one number both clients read, and it is MAX'd against
 * the device's home-indicator inset rather than added to it. Children must not
 * trail a pad of their own — stacked pads are what put a dead band under every
 * sheet in the app.
 *
 * PRESENTATION. While a sheet is up, the presenting screen RECEDES — scales to
 * motion.recedeScale with its corner radius growing to a device radius and its
 * brightness dropping — so the sheet reads as sitting on a real stack rather
 * than floating over a static picture. That is driven by `--sheet-p` on <html>
 * (globals.css `.motion-recede-host`), because the sheet has no reference to
 * the shell. Because the host is transformed, a position:fixed descendant of it
 * would be trapped by the transform — so the sheet PORTALS to <body>, outside
 * the receding subtree. Sheets are reference-counted: nested or stacked sheets
 * only un-recede once the last one closes.
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
  detents = ["large"],
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
  /** Resting heights, smallest first. Defaults to a single full-height sheet. */
  detents?: SheetDetent[];
}) {
  // `mounted` keeps the node alive through the exit animation; `y` is the
  // panel's offset from fully-open in px — ONE axis for the entrance, every
  // detent, the drag and the dismissal.
  const [mounted, setMounted] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelH, setPanelH] = useState(0);
  const yRef = useRef(0);
  const drag = useRef<{ from: number; y0: number; t: number; last: number; v: number } | null>(null);

  // A SINGLE-detent sheet stays CONTENT-SIZED (height auto, capped) — which is
  // what every short sheet in the app relies on; forcing them all to a fixed
  // 92vh would leave Quick Log and Readiness mostly empty. Only a multi-detent
  // sheet needs a fixed height, because expanding requires a known target.
  const expandable = detents.length > 1;
  const snaps = useMemo(() => {
    if (!panelH || !expandable) return [0];
    const largest = sheetGesture.detents[detents[detents.length - 1] ?? "large"];
    return detents
      .map((d) => Math.round(panelH * (1 - sheetGesture.detents[d] / largest)))
      .sort((a, b) => a - b);
  }, [detents, panelH, expandable]);
  const openY = snaps[0] ?? 0;
  const restY = snaps[snaps.length - 1] ?? 0;

  // Write the position straight to the DOM. A drag must not re-render React on
  // every pointermove — the panel IS the finger, and a render loop is exactly
  // how that stops being true.
  const place = useCallback((y: number, animate: boolean) => {
    yRef.current = y;
    const el = panelRef.current;
    if (!el) return;
    const h = panelH || el.offsetHeight || 1;
    const p = Math.max(0, Math.min(1, 1 - y / h));
    el.style.transition = animate ? "transform var(--d-sheet) var(--e-sheet)" : "none";
    el.style.transform = `translateY(${y}px)`;
    const scrim = el.parentElement;
    if (scrim) {
      scrim.style.transition = animate ? "background var(--d-sheet) var(--e-fade)" : "none";
      scrim.style.background = `rgba(0,0,0,${(motion.scrimWithRecede * p).toFixed(4)})`;
    }
    document.documentElement.style.setProperty("--sheet-p", p.toFixed(4));
  }, [panelH]);

  // Measure, then run the entrance from below.
  useEffect(() => {
    if (!mounted) return;
    const el = panelRef.current;
    if (!el) return;
    const h = el.offsetHeight;
    setPanelH(h);
    place(h, false);
    // Open to the SMALLEST detent (for a single-detent sheet that is simply 0).
    const largest = sheetGesture.detents[detents[detents.length - 1] ?? "large"];
    const to = expandable ? Math.round(h * (1 - sheetGesture.detents[detents[0] ?? "large"] / largest)) : 0;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => place(to, true)));
    return () => cancelAnimationFrame(r);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  useEffect(() => {
    if (open) { setMounted(true); return; }
    if (!mounted) return;
    // EXIT is fast and complete. It used to unmount on a bare setTimeout(160)
    // racing its own 160ms transition — a stalled main thread (a refetch fired
    // by the same close, say) removed the node mid-flight and the panel SNAPPED.
    // Now the transition itself says when it is done, with the timeout only as
    // a backstop for the case where no transition runs at all.
    const el = panelRef.current;
    const h = panelH || el?.offsetHeight || 0;
    if (el) {
      el.style.transition = "transform var(--d-fast) var(--e-exit)";
      el.style.transform = `translateY(${h}px)`;
      const scrim = el.parentElement;
      if (scrim) {
        scrim.style.transition = "background var(--d-fast) var(--e-fade)";
        scrim.style.background = "rgba(0,0,0,0)";
      }
    }
    document.documentElement.style.setProperty("--sheet-p", "0");
    let done = false;
    const finish = () => { if (!done) { done = true; setMounted(false); } };
    const onEnd = (e: TransitionEvent) => { if (e.propertyName === "transform") finish(); };
    el?.addEventListener("transitionend", onEnd);
    const t = setTimeout(finish, 400);
    return () => { el?.removeEventListener("transitionend", onEnd); clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (openSheets === 0) {
        delete document.documentElement.dataset.sheetOpen;
        document.documentElement.style.setProperty("--sheet-p", "0");
      }
    };
  }, [open]);

  // Esc dismisses, like any modal.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { from: yRef.current, y0: e.clientY, t: performance.now(), last: e.clientY, v: 0 };
    document.documentElement.dataset.sheetDragging = "";
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const now = performance.now();
    const dt = Math.max(1, now - d.t);
    d.v = ((e.clientY - d.last) / dt) * 1000;
    d.t = now;
    d.last = e.clientY;
    const raw = d.from + (e.clientY - d.y0);
    place(raw >= openY ? raw : openY - rubberBand(openY - raw, 0, sheetGesture.resist), false);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    delete document.documentElement.dataset.sheetDragging;
    if (!d) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
    const { target, dismiss } = resolveSheetRelease(yRef.current, d.v, panelH || 1, snaps);
    if (dismiss) { haptic.light(); onClose(); return; }
    if (Math.abs(target - yRef.current) > 2 && snaps.length > 1) haptic.light();
    place(target, true);
  };

  if (!mounted) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,0)" }}
    >
      <div
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        className="motion-sheet-panel"
        style={{
          width: "100%",
          maxWidth,
          ...(expandable
            ? { height: `${sheetGesture.detents[detents[detents.length - 1] ?? "large"] * 100}vh` }
            : { maxHeight: `${sheetGesture.detents.large * 100}vh` }),
          background: C("ink2"),
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          border: `1px solid ${C("line")}`,
          borderBottom: "none",
          boxShadow: "0 -10px 44px -14px rgba(0,0,0,.6)",
          // ONE pad under the last row — @hybrid/core `sheetPadBottom`, MAX'd
          // against the home-indicator inset rather than added to it. Content
          // rendered into the sheet must not trail a pad of its own.
          padding: `12px 20px max(${sheetPadBottom()}px, env(safe-area-inset-bottom, 0px))`,
          display: "flex",
          flexDirection: "column",
          transform: "translateY(100%)",
        }}
      >
        {/* The grab area owns the pointer. Keeping it off the scrollable body is
            what lets a list inside the sheet scroll normally. */}
        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{ touchAction: "none", cursor: "grab", flex: "none", paddingBottom: 4 }}
          aria-label="Drag to resize or dismiss"
        >
          <div style={{ width: 40, height: 4, borderRadius: 999, background: C("line"), margin: "0 auto 16px" }} />
          {title && <div style={{ fontFamily: "var(--font-heading)", fontWeight: 900, fontSize: 22, letterSpacing: "-.02em", color: C("chalk") }}>{title}</div>}
          {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), margin: "4px 0 0" }}>{sub}</div>}
        </div>
        <div style={{ marginTop: title || sub ? 16 : 0, overflowY: "auto", flex: 1, minHeight: 0 }}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}
