import { useCallback, useEffect, useSyncExternalStore } from "react";

/**
 * WHAT SURFACE IS IN FRONT OF THE ATHLETE — published by the screen, read by
 * the tab bar.
 *
 * The nav contract has always said the detached circle is CONTEXTUAL: Train
 * everywhere, Add post on the feed, Find a food on the add-to-meal picker
 * (@hybrid/core nav-bar.ts `auroraNavAction`). Web could express that because
 * its bar is drawn in React and can see the route. Mobile could not, and the
 * reason was never the contract — it was that the bar is the SYSTEM tab bar,
 * declared once in `(tabs)/_layout.tsx`, while the surface that should decide
 * the verb is a VIEW STATE two components down (the nutrition hub renders the
 * picker inside the `nutrition` screen; Today renders the feed inside `index`).
 * A layout cannot read a descendant's state.
 *
 * So the descendant publishes it here and the layout subscribes. Deliberately a
 * module store rather than a context: a provider would have to sit ABOVE the
 * tabs layout in the root, which puts a piece of the bar's own wiring in a file
 * that has nothing else to do with the bar, and every screen would re-render on
 * a change that concerns one trigger.
 *
 * THE HANDLER travels with the surface for the same reason. A `screen`-kind
 * action acts on the surface in front of you, so the thing that knows what the
 * press means is that surface — the picker knows to put the cursor in its field
 * and bring the field back under the thumb. The layout only knows there was a
 * press.
 *
 * Both are cleared by the same `useNavSurface` effect on unmount, so a screen
 * cannot leave a stale verb (or worse, a stale handler holding a dead ref)
 * behind it in the bar.
 */

type Listener = () => void;

let surface: string | null = null;
let handler: (() => void) | null = null;
const listeners = new Set<Listener>();

const emit = () => { for (const l of listeners) l(); };

const subscribe = (l: Listener) => {
  listeners.add(l);
  return () => { listeners.delete(l); };
};

const getSurface = () => surface;

/** Set the visible surface id, or null to fall back to the app's default verb. */
export function setNavSurface(next: string | null): void {
  if (surface === next) return;
  surface = next;
  emit();
}

/** Register what the circle's press should DO on this surface. */
export function setNavAction(next: (() => void) | null): void {
  handler = next;
}

/** Run the surface's own action. Returns false when nothing claimed the press,
 *  so the caller can fall back rather than swallowing the tap. */
export function runNavAction(): boolean {
  if (!handler) return false;
  handler();
  return true;
}

/** The bar's read side. */
export function useNavSurface(): string | null {
  return useSyncExternalStore(subscribe, getSurface, getSurface);
}

/**
 * The screen's write side: publish a surface for as long as this component is
 * mounted, with the action the circle should run while it is.
 *
 * Pass `null` to publish nothing — a screen that is only sometimes the surface
 * (the nutrition hub is the picker only in its "add" view) calls this
 * unconditionally with a value that goes null, rather than calling a hook
 * conditionally.
 */
export function usePublishNavSurface(id: string | null, action?: () => void): void {
  // The action is read through a ref-like closure on every press rather than
  // captured once, so a handler that closes over fresh state (the picker's
  // input ref, its scroller) is never a frame behind.
  const run = useCallback(() => { action?.(); }, [action]);
  useEffect(() => {
    setNavSurface(id);
    setNavAction(id && action ? run : null);
    return () => {
      setNavSurface(null);
      setNavAction(null);
    };
  }, [id, action, run]);
}
