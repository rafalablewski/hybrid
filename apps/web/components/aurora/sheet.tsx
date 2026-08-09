"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { motion, sheetGesture, sheetSnaps, resolveSheetRelease, releaseVelocity, rubberBand, sheetPadBottom, type SheetDetent } from "@hybrid/core";
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
 * panel now tracks the pointer 1:1 in both directions between its stops, and
 * rubber-bands only past the top, where there is nothing left to uncover; the scrim
 * and the parent's recede interpolate on the SAME drag input (via the
 * --sheet-p custom property, see globals.css) so the whole stack is attached to
 * the hand; and the release is decided by velocity projection in @hybrid/core
 * `resolveSheetRelease` — shared with mobile so the two snap identically.
 *
 * EVERY SHEET ELONGATES. The panel is ALWAYS laid out at the `large` height and
 * translated down to its resting stop, so one drag from the bottom to the top
 * grows it to full and the way back down shortens it again before it dismisses.
 * By default the resting stop is the sheet's own CONTENT height (measured, so a
 * short sheet still looks exactly as short as what it holds) — the panel below
 * that line is off-screen until you pull it up. Before this, a content-sized
 * sheet had exactly ONE stop and the handle's upward direction did nothing: it
 * rubber-banded and fell back, which reads as broken rather than as "no".
 *
 * DETENTS. `detents` adds stops between the content height and full
 * (`["medium"]` puts one at half the screen). It is only ever ADDITIVE: the
 * shortest stop is where the sheet rests, so declaring `medium` never inflates
 * a two-button sheet to half the screen. The stops come from @hybrid/core
 * `sheetSnaps`, shared with mobile so the two land identically.
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
  detents,
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
  /** Extra stops between the content height and full. Additive — the shortest
   *  stop still decides where the sheet rests. */
  detents?: SheetDetent[];
}) {
  // `mounted` keeps the node alive through the exit animation; `y` is the
  // panel's offset from fully-open in px — ONE axis for the entrance, every
  // detent, the drag and the dismissal.
  const [mounted, setMounted] = useState(open);
  const panelRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  // The panel is ALWAYS the full `large` height (see the header): `panelH` is
  // both its layout height and its dismissed offset.
  const [panelH, setPanelH] = useState(0);
  // What the sheet is naturally worth — the chrome plus what it holds. Measured
  // rather than assumed, so a three-row sheet still rests three rows tall.
  const [naturalH, setNaturalH] = useState<number | null>(null);
  const yRef = useRef(0);
  const drag = useRef<{ from: number; y0: number; t: number; last: number; v: number } | null>(null);
  const dragging = useRef(false);
  const entered = useRef(false);

  const snaps = useMemo(
    () => (panelH ? sheetSnaps(panelH, detents, naturalH) : [0]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [panelH, detents?.join(","), naturalH],
  );
  const openY = snaps[0] ?? 0;
  const restY = snaps[snaps.length - 1] ?? 0;
  // Don't animate in before the resting stop is known, or the entrance lands at
  // full height and the measurement snaps it short afterwards. The panel is
  // off-screen while this resolves (one frame), so nothing is visible.
  const ready = !!panelH && naturalH != null;

  // Write the position straight to the DOM. A drag must not re-render React on
  // every pointermove — the panel IS the finger, and a render loop is exactly
  // how that stops being true.
  const place = useCallback((y: number, animate: boolean) => {
    yRef.current = y;
    const el = panelRef.current;
    if (!el) return;
    const h = panelH || el.offsetHeight || 1;
    // Presentation is complete the moment the sheet has ARRIVED at its resting
    // stop; elongating it further is not "more presented". Ranging this from
    // fully-open instead would open every content-sized sheet on a fraction of
    // its scrim, since a short sheet rests most of a panel-height down.
    const rest = Math.min(restY, h - 1);
    const p = Math.max(0, Math.min(1, 1 - (y - rest) / (h - rest)));
    el.style.transition = animate ? "transform var(--d-sheet) var(--e-sheet)" : "none";
    el.style.transform = `translateY(${y}px)`;
    const scrim = el.parentElement;
    if (scrim) {
      scrim.style.transition = animate ? "background var(--d-sheet) var(--e-fade)" : "none";
      scrim.style.background = `rgba(0,0,0,${(motion.scrimWithRecede * p).toFixed(4)})`;
    }
    document.documentElement.style.setProperty("--sheet-p", p.toFixed(4));
  }, [panelH, restY]);

  // MEASURE. The panel's own height (a fixed 92vh, so this only moves when the
  // viewport does) and the natural height of what it holds — chrome included,
  // since the resting stop has to leave room for the pad under the last row.
  useEffect(() => {
    if (!mounted) return;
    const el = panelRef.current;
    if (!el) return;
    const read = () => {
      setPanelH(el.offsetHeight);
      const head = headRef.current;
      const inner = innerRef.current;
      if (!head || !inner) return;
      const cs = getComputedStyle(el);
      const px = (v: string) => parseFloat(v) || 0;
      setNaturalH(Math.round(
        px(cs.paddingTop) + px(cs.paddingBottom) + px(cs.borderTopWidth) + px(cs.borderBottomWidth) +
        head.offsetHeight +
        (bodyRef.current ? px(getComputedStyle(bodyRef.current).marginTop) : 0) +
        inner.offsetHeight,
      ));
    };
    read();
    // The content can change height under a sheet that is already up (a list
    // loads, a section expands) — re-read it rather than hold a stale stop.
    const ro = new ResizeObserver(read);
    ro.observe(el);
    if (innerRef.current) ro.observe(innerRef.current);
    if (headRef.current) ro.observe(headRef.current);
    return () => ro.disconnect();
  }, [mounted]);

  // Park it off-screen before the first paint, so the entrance has somewhere to
  // come from and an unmeasured panel is never shown at full height.
  useEffect(() => {
    if (!mounted || !panelH || entered.current) return;
    place(panelH, false);
  }, [mounted, panelH, place]);

  // ENTRANCE — once, and only once the resting stop is known.
  useEffect(() => {
    if (!mounted || !open || !ready || entered.current) return;
    entered.current = true;
    const r = requestAnimationFrame(() => requestAnimationFrame(() => place(restY, true)));
    return () => cancelAnimationFrame(r);
  }, [mounted, open, ready, restY, place]);

  // RE-FIT. If the sheet is sitting at its content stop and hasn't been
  // dragged, follow the new one — an expanded sheet, or one the hand is
  // holding, is left exactly where it was put.
  const prevRest = useRef(restY);
  useEffect(() => {
    const from = prevRest.current;
    prevRest.current = restY;
    if (!entered.current || dragging.current || Math.abs(restY - from) <= 2) return;
    if (Math.abs(yRef.current - from) <= 2) place(restY, true);
  }, [restY, place]);

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
    entered.current = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setMounted(false);
      // Forget the measurement WITH the unmount, so the next open re-measures
      // from what it will actually hold rather than entering on a stale stop.
      setNaturalH(null);
    };
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
    dragging.current = true;
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
    // The panel tracks the pointer 1:1 in BOTH directions between the stops —
    // that is the elongation, and it has to be continuous to read as one. Only
    // past the top does it rubber-band, so the sheet never leaves the top edge.
    place(raw >= openY ? raw : openY - rubberBand(openY - raw, 0, sheetGesture.resist), false);
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    dragging.current = false;
    delete document.documentElement.dataset.sheetDragging;
    if (!d) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId); } catch { /* already released */ }
    // A gesture that was being HELD releases at rest, not at the speed of
    // whatever it did a moment ago (@hybrid/core `releaseVelocity`).
    const v = releaseVelocity(d.v, performance.now() - d.t);
    const { target, dismiss } = resolveSheetRelease(yRef.current, v, panelH || 1, snaps);
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
          // ALWAYS the full height, resting translated down: the part below the
          // resting line is the room the sheet grows into.
          height: `${sheetGesture.detents.large * 100}vh`,
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
          ref={headRef}
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
        {/* The body fills the panel; the wrapper inside it is what carries the
            content's NATURAL height, which is what the resting stop is made of.
            The body itself cannot: it is the flexing box, so it is always as
            tall as the panel. */}
        <div ref={bodyRef} style={{ marginTop: title || sub ? 16 : 0, overflowY: "auto", flex: 1, minHeight: 0 }}>
          <div ref={innerRef}>{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
