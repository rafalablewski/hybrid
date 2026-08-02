"use client";

import { useCallback, useRef, type Dispatch, type SetStateAction } from "react";
import { flushSync } from "react-dom";
import { screenTransition } from "@hybrid/core";
import { hasArmedSharedElement, releaseSharedElements } from "./shared-element";

/**
 * Wraps the app-shell's `setScreen` so every navigation runs as a real
 * transition instead of a hard cut.
 *
 * WHY THE VIEW TRANSITIONS API. The shell renders ONE keyed wrapper and
 * lazy-loads nearly every screen, so the outgoing tree unmounts on the same
 * frame the new one mounts — there is nothing left to animate out. Keeping both
 * trees alive for a frame would mean mounting two lazy screens at once (double
 * the chunks, double the data fetches). `startViewTransition()` instead lets the
 * browser snapshot the old tree itself, so we get a genuine paired exit with no
 * structural change to the shell. Where it isn't supported the state update just
 * applies directly — the old behaviour, no worse.
 *
 * DIRECTION comes from the shared hierarchy in @hybrid/core (`screenTransition`),
 * so web and mobile can't disagree about which way a given move travels. It is
 * published as data attributes on <html>; globals.css picks the keyframes.
 *
 * HISTORY. Every forward navigation pushes a real history entry (via the
 * shell's `onNavigate`), and `popTo` applies a Back/Forward with the direction
 * the browser actually travelled — so Back is the exact inverse of the move
 * that got you there, and Forward replays it rather than inverting it again.
 * Before this the shell pushed nothing at all, so the browser Back button (and
 * Android's system back) left the app from any screen.
 *
 * Reduce Motion is NOT special-cased here. The transition still runs — the CSS
 * substitutes a short cross-dissolve for the positional keyframes, because a
 * user with Reduce Motion on still needs to perceive that the screen changed.
 */
/**
 * The Today-hub switch (Dashboard / Performance / Feed) — a move INSIDE one
 * screen, so it must not replay a screen transition. The hub pills' flying
 * lens (liquid-seg) is the element in flight, and per the shared-element rule
 * it OWNS the motion: the content behind it cross-dissolves while the hub
 * chrome (profile row + pills) holds perfectly still. Published as
 * `data-nav-kind="hub"`; globals.css scopes the chrome's
 * `view-transition-name` to that attribute, so an ordinary navigation still
 * captures the Today surface whole. Mobile twin: `useHubDissolve` (lib/ui) +
 * the LiquidSeg flight memory.
 */
export function runHubTransition(apply: () => void): void {
  const doc = typeof document !== "undefined" ? document.documentElement : null;
  const start = doc
    ? (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition
    : undefined;
  if (!doc || typeof start !== "function") {
    apply();
    return;
  }
  doc.dataset.navKind = "hub";
  doc.dataset.navDir = "none";
  // Synchronous for the same reason as below: the browser snapshots around the
  // callback, so a batched React update would be captured as "nothing changed".
  start.call(document, () => {
    flushSync(apply);
  });
}

/**
 * Run one screen change as a transition. Shared by the forward setter and the
 * Back/Forward handler, so a history move animates exactly like the navigation
 * that created it — only inverted.
 */
function runScreenTransition(
  from: string,
  to: string,
  apply: Dispatch<SetStateAction<string>>,
  back: boolean,
): void {
  const doc = typeof document !== "undefined" ? document.documentElement : null;
  const start =
    typeof document !== "undefined"
      ? (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition
      : undefined;

  if (!doc || typeof start !== "function") {
    apply(to);
    releaseSharedElements();
    return;
  }

  // A shared element in flight OWNS the motion: the screen behind it
  // cross-dissolves rather than sliding or pushing, so the eye follows the
  // one thing that persists. Two competing movements at once is the "don't
  // stack effects" rule, and it reads as chaos.
  const t = hasArmedSharedElement()
    ? ({ kind: "replace", dir: 0 } as const)
    : screenTransition(from, to, back);
  doc.dataset.navKind = t.kind;
  doc.dataset.navDir = t.dir === 1 ? "fwd" : t.dir === -1 ? "back" : "none";

  // The callback must apply the DOM change SYNCHRONOUSLY — the browser
  // snapshots before it runs and captures the result after, so a batched
  // React update would be missed and the transition would animate nothing.
  const transition = start.call(document, () => {
    flushSync(() => apply(to));
  }) as { finished?: Promise<unknown> } | undefined;

  // Always drop armed shared-element names, including when the transition is
  // skipped or rejected. A name left behind on an unmounted-then-remounted
  // node collides on the NEXT navigation and silently kills that transition.
  void Promise.resolve(transition?.finished).catch(() => {}).finally(releaseSharedElements);
}

/**
 * Returns the transitioning setter plus `popTo`, the applier for a browser
 * Back/Forward.
 *
 * `onNavigate` fires for FORWARD navigation only and is where the shell pushes
 * its history entry — deliberately here rather than in an effect watching
 * `screen`, because such an effect cannot tell a user navigation from the state
 * change a popstate just produced, and would push a fresh entry while going
 * back (destroying the forward stack on every Back press).
 */
export function useScreenTransition(
  current: string,
  apply: Dispatch<SetStateAction<string>>,
  onNavigate?: (to: string) => void,
): { setScreen: Dispatch<SetStateAction<string>>; popTo: (to: string, back: boolean) => void } {
  // The setter is handed to children and used inside callbacks, so it must be
  // stable; read the live screen from a ref rather than closing over it.
  const currentRef = useRef(current);
  currentRef.current = current;
  const navRef = useRef(onNavigate);
  navRef.current = onNavigate;

  const setScreen = useCallback<Dispatch<SetStateAction<string>>>(
    (next) => {
      const from = currentRef.current;
      const to = typeof next === "function" ? (next as (p: string) => string)(from) : next;
      if (to === from) return;
      runScreenTransition(from, to, apply, false);
      navRef.current?.(to);
    },
    [apply],
  );

  const popTo = useCallback(
    (to: string, back: boolean) => {
      const from = currentRef.current;
      if (to === from) return;
      // No onNavigate: the browser already moved: pushing here would append a
      // duplicate entry and make Back require two presses.
      runScreenTransition(from, to, apply, back);
    },
    [apply],
  );

  return { setScreen, popTo };
}
