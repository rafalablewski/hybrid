"use client";

import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { swipe, rubberBand, projectSwipe } from "@hybrid/core";
import { RED, fs, disp, txt } from "@/lib/ui";
import { haptic } from "@/lib/haptics";

// Swipe a set row left to reveal a Delete action — the web twin of the mobile
// SwipeRow (components/swipe-row.tsx on the app side). Built on Pointer Events so
// it works with a touch screen OR a mouse drag, no gesture-handler dep.
//
// A drag can START over the row's own buttons (the banked-set "re-open" summary,
// etc.) — we only claim it once it's clearly HORIZONTAL, then capture the pointer
// and SWALLOW the click so the tap doesn't also fire. Drags that begin on a text
// input or the ⠿ drag-reorder grip are left alone (typing + reorder keep working),
// and a purely vertical move releases so the page still scrolls. The moving layer
// carries an opaque card background so the red action stays hidden until you swipe.
//
// GEOMETRY AND PHYSICS ARE SHARED with mobile via @hybrid/core `swipe` — open
// position, commit threshold, clamp, rubber-band and the velocity-projected
// release. The two files previously agreed on none of those numbers (76/84,
// 40/44, 110/120) and settled on different curves entirely (a spring here, a
// flat `.2s ease` there) while each header called the other its twin.
export default function SwipeRow({
  children,
  onDelete,
  label,
  radius = 14,
  margin = "6px 0",
}: {
  children: ReactNode;
  onDelete: () => void;
  label: string;
  /** Corner radius — match the wrapped row so the revealed red can't peek. */
  radius?: number;
  /** Outer spacing (the wrapped row should drop its own margin). */
  margin?: string;
}) {
  const [tx, setTx] = useState(0);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number; active: boolean; t: number; last: number; v: number } | null>(null);
  const swallowClick = useRef(false);
  const hostRef = useRef<HTMLDivElement>(null);
  const armed = useRef(false);

  const width = () => hostRef.current?.offsetWidth ?? 0;

  const commitDelete = () => {
    haptic.warning();
    setOpen(false);
    setTx(0);
    onDelete();
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    // Leave typing + drag-reorder alone; a swipe can still start anywhere else,
    // including over the row's own tap targets.
    if (el.closest("input, textarea, [draggable='true']")) return;
    start.current = { x: e.clientX, y: e.clientY, base: open ? -swipe.action : 0, active: false, t: performance.now(), last: e.clientX, v: 0 };
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.active) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
        start.current = null; // vertical scroll — let go
        return;
      }
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.4) return;
      s.active = true;
      setDragging(true);
      swallowClick.current = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    // Track velocity in px/s for the projected release.
    const now = performance.now();
    const dt = Math.max(1, now - s.t);
    s.v = ((e.clientX - s.last) / dt) * 1000;
    s.t = now;
    s.last = e.clientX;

    const raw = Math.min(0, s.base + dx);
    const full = -(width() * swipe.fullAt);
    // Past the full-swipe point the row keeps tracking the finger — it is about
    // to be thrown away, and resistance there would fight the gesture.
    setTx(raw < full ? raw : rubberBand(raw, swipe.action, swipe.max - swipe.action));
    const crossed = raw < full;
    if (crossed !== armed.current) {
      armed.current = crossed;
      if (crossed) haptic.light();
    }
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    armed.current = false;
    if (!s || !s.active) return;
    const raw = Math.min(0, s.base + (e.clientX - s.x));
    if (raw < -(width() * swipe.fullAt)) { commitDelete(); return; }
    const willOpen = projectSwipe(raw, s.v) < -swipe.action * swipe.openAt;
    if (willOpen !== open) haptic.light();
    setOpen(willOpen);
    setTx(willOpen ? -swipe.action : 0);
  };

  return (
    <div ref={hostRef} style={{ position: "relative", overflow: "hidden", borderRadius: radius, margin }}>
      <button
        onClick={commitDelete}
        style={{ ...disp, position: "absolute", right: 0, top: 0, bottom: 0, width: swipe.action, display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs.caption, fontWeight: 700, color: txt(RED), background: `${RED}26`, border: "none", cursor: "pointer" }}
      >
        {label}
      </button>
      <div
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        // A completed drag suppresses the tap it rode in on (e.g. so swiping the
        // banked-set summary deletes instead of re-opening it).
        onClickCapture={(e) => {
          if (swallowClick.current) {
            e.preventDefault();
            e.stopPropagation();
            swallowClick.current = false;
          }
        }}
        style={{
          transform: `translateX(${tx}px)`,
          // Settling rides the shared slide spring; while the finger is down
          // there is no transition at all, because the row IS the finger.
          transition: dragging ? "none" : "transform var(--d-slide) var(--e-slide)",
          background: "var(--color-card)",
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
