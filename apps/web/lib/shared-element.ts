"use client";

/**
 * SHARED ELEMENTS (web) — the thing you tapped travels into the screen it opens.
 *
 * Built on the View Transitions API: give an element in the OUTGOING screen and
 * an element in the INCOMING screen the same `view-transition-name`, and the
 * browser measures both and interpolates between them itself. No FLIP maths, no
 * cloned node, no measuring on our side.
 *
 * The one hard rule is that a name must be unique AT ANY ONE MOMENT. A rail of
 * twelve exercise cards can't all declare it — two elements sharing a name in
 * the same snapshot makes the browser skip the whole transition. So the
 * DESTINATION declares its name statically (it's alone on its screen) while the
 * SOURCE is armed imperatively at click time.
 *
 * Imperative rather than via React state, deliberately: `startViewTransition()`
 * captures the outgoing snapshot synchronously the moment it's called, so a
 * state update wouldn't have committed in time. Setting the inline style
 * directly guarantees the name is on the node before the capture.
 */

const armed = new Set<HTMLElement>();

/**
 * Mark `el` as the source of a shared-element pair, for the navigation that is
 * about to run. Cleared automatically once the transition settles — see
 * `releaseSharedElements`, which the screen transition calls.
 */
export function armSharedElement(el: HTMLElement | null | undefined, name: string): void {
  if (!el) return;
  el.style.viewTransitionName = name;
  armed.add(el);
}

/**
 * Drop every armed name. Called when the transition finishes (or fails): the
 * source is usually unmounted by then, but a cancelled or skipped transition
 * would otherwise leave a stray name behind — and a stray name is exactly what
 * breaks the NEXT transition, which is a genuinely horrible bug to track down.
 */
export function releaseSharedElements(): void {
  for (const el of armed) el.style.viewTransitionName = "";
  armed.clear();
}

/** True while a shared-element pair is armed for the next navigation. */
export function hasArmedSharedElement(): boolean {
  return armed.size > 0;
}

/**
 * Props for the destination element. It is alone on its screen, so it can carry
 * the name statically. Returns nothing when inactive, so a screen rendered
 * without a matching source never claims the name.
 */
export function sharedElementStyle(name: string, active = true): { viewTransitionName?: string } {
  return active ? { viewTransitionName: name } : {};
}
