"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

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
 */
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
  sub?: string;
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
    timer.current = setTimeout(() => setMounted(false), 300);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [open]);

  // Lock the background from scrolling while the sheet is up.
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mounted]);

  // Esc dismisses, like any modal.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mounted, onClose]);

  if (!mounted) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label ?? title}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 80, display: "flex", alignItems: "flex-end", justifyContent: "center", background: shown ? "rgba(0,0,0,.55)" : "rgba(0,0,0,0)", transition: "background .3s ease" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
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
          transition: "transform .34s cubic-bezier(.22,1,.36,1)",
        }}
      >
        <div style={{ width: 40, height: 4, borderRadius: 999, background: C("line"), margin: "0 auto 16px" }} />
        {title && <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: 22, color: C("chalk") }}>{title}</div>}
        {sub && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), margin: "4px 0 0" }}>{sub}</div>}
        <div style={{ marginTop: title || sub ? 14 : 0 }}>{children}</div>
      </div>
    </div>
  );
}
