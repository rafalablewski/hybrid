"use client";

import { useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";
import { RED, fs, disp, txt } from "@/lib/ui";

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
  const start = useRef<{ x: number; y: number; base: number; active: boolean } | null>(null);
  const swallowClick = useRef(false);
  const OPEN_AT = -84;

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    // Leave typing + drag-reorder alone; a swipe can still start anywhere else,
    // including over the row's own tap targets.
    if (el.closest("input, textarea, [draggable='true']")) return;
    start.current = { x: e.clientX, y: e.clientY, base: open ? OPEN_AT : 0, active: false };
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
    setTx(Math.max(-120, Math.min(0, s.base + dx)));
  };
  const onUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s || !s.active) return;
    const dx = e.clientX - s.x;
    const willOpen = open ? dx < 40 : dx < -44;
    setOpen(willOpen);
    setTx(willOpen ? OPEN_AT : 0);
  };

  return (
    <div style={{ position: "relative", overflow: "hidden", borderRadius: radius, margin }}>
      <button
        onClick={() => { setOpen(false); setTx(0); onDelete(); }}
        style={{ ...disp, position: "absolute", right: 0, top: 0, bottom: 0, width: 84, display: "flex", alignItems: "center", justifyContent: "center", fontSize: fs.caption, fontWeight: 700, color: txt(RED), background: `${RED}26`, border: "none", cursor: "pointer" }}
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
        style={{ transform: `translateX(${tx}px)`, transition: dragging ? "none" : "transform .2s ease", background: "var(--color-card)", touchAction: "pan-y" }}
      >
        {children}
      </div>
    </div>
  );
}
