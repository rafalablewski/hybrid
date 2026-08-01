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

export function useScreenTransition(
  current: string,
  apply: Dispatch<SetStateAction<string>>,
): Dispatch<SetStateAction<string>> {
  // The setter is handed to children and used inside callbacks, so it must be
  // stable; read the live screen from a ref rather than closing over it.
  const currentRef = useRef(current);
  currentRef.current = current;

  return useCallback<Dispatch<SetStateAction<string>>>(
    (next) => {
      const from = currentRef.current;
      const to = typeof next === "function" ? (next as (p: string) => string)(from) : next;
      if (to === from) return;

      const doc = typeof document !== "undefined" ? document.documentElement : null;
      const start = (
        document as Document & { startViewTransition?: (cb: () => void) => unknown }
      ).startViewTransition;

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
        : screenTransition(from, to);
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
    },
    [apply],
  );
}
