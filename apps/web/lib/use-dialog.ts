import { useEffect, useRef } from "react";

// Elements that can receive keyboard focus inside a dialog.
const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible-dialog plumbing for our modals/drawers. Attach the returned ref to
 * the dialog container (`role="dialog" aria-modal="true"` + `tabIndex={-1}`) and
 * the hook will, while `active`:
 *   • move keyboard focus into the dialog on open,
 *   • trap Tab/Shift+Tab inside it (so focus can't wander to the page behind),
 *   • close on Escape,
 *   • restore focus to whatever was focused before it opened.
 *
 * Most callers render the dialog only while open, so `active` defaults to true
 * (open === mounted); pass an explicit flag for components that stay mounted and
 * toggle internally. Mirrors the ad-hoc Escape idiom in quick-sport.tsx, but
 * adds the focus trap + restore the audit flagged as missing (WCAG 2.4.3/2.1.2).
 */
export function useDialog<T extends HTMLElement = HTMLDivElement>(
  onClose: () => void,
  active = true,
) {
  const ref = useRef<T>(null);
  // Keep the latest onClose without resubscribing the key listener every render.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    const prevFocus = document.activeElement as HTMLElement | null;

    const focusables = () =>
      node ? Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null) : [];

    // Focus the first control on open — unless the markup already placed focus
    // inside (e.g. an `autoFocus` search input), which we must not steal.
    const raf = requestAnimationFrame(() => {
      if (node && !node.contains(document.activeElement)) (focusables()[0] ?? node).focus();
    });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const f = focusables();
      const activeEl = document.activeElement;
      if (f.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const first = f[0]!;
      const last = f[f.length - 1]!;
      if (!node.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };

    // Capture phase so the trap wins even if an inner handler stops propagation.
    document.addEventListener("keydown", onKey, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey, true);
      // Return focus to the trigger so keyboard users aren't dumped at the top.
      prevFocus?.focus?.();
    };
  }, [active]);

  return ref;
}
