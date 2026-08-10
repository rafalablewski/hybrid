"use client";

import { useCallback, useRef } from "react";
import { flushSync } from "react-dom";
import { springs, springToCss, springDurationMs, durations, easings } from "@hybrid/core";

/**
 * LIST MOTION (web) — insertions, deletions, sorts and reorders that MOVE
 * instead of teleporting.
 *
 * The audit found zero layout-transition handling on either client: deleting a
 * set removed the row and every row below jumped up by its height, inserting
 * one popped it in fully formed, and a reorder commit swapped positions with no
 * travel at all. Those are the moments the USER caused — the ones where motion
 * is doing its actual job of explaining what just changed — and they had none.
 *
 * FLIP, not a library: measure every child, apply the state change
 * synchronously, measure again, then animate each child from its old position
 * to its new one. The rows are already where they belong by the time the
 * animation starts, so nothing can desync — and a row that didn't move costs
 * nothing.
 *
 * Runs on the Web Animations API rather than CSS transitions because the
 * distances aren't known until after the commit, and WAAPI takes them as data.
 * The easing is the shared slide spring, integrated to a linear() curve by the
 * same core function that generates globals.css — so a row closing a gap moves
 * on exactly the curve a screen does.
 */

// Generated once: sampling a spring is not free and the curve never changes.
const SLIDE = springToCss(springs.slide);
const SLIDE_MS = springDurationMs(springs.slide);

const reduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

/** Every element the FLIP measures, anywhere under the root. */
const ROW = "[data-list-row]";

/**
 * Apply a list mutation and animate the consequences.
 *
 * `root` is any ancestor of the rows; the rows themselves are marked
 * `data-list-row`. Deliberately a marked descendant rather than "the
 * container's direct children": a screen like the logger has a list of exercise
 * cards each holding a list of set rows, and adding a set moves rows in BOTH —
 * the set below it and every card below the card. Measuring one flat container
 * would animate one of those two and teleport the other, and threading a ref
 * per block to fix that puts a bookkeeping map in every caller. One root, one
 * marker, and every row that moved for any reason travels.
 *
 * `apply` must be the state update itself — it is flushed synchronously so the
 * "after" measurement sees the committed DOM.
 *
 * Under Reduce Motion the update still happens; only the travel is dropped, and
 * arriving rows still fade so an insertion remains perceptible.
 */
export function animateListChange(root: HTMLElement | null, apply: () => void): void {
  if (!root || reduced()) {
    apply();
    return;
  }

  const before = new Map<Element, DOMRect>();
  for (const el of Array.from(root.querySelectorAll(ROW))) before.set(el, el.getBoundingClientRect());

  // Synchronous, for the same reason the screen transition flushes: the second
  // measurement has to see the result, not the queued update.
  flushSync(apply);

  for (const el of Array.from(root.querySelectorAll(ROW))) {
    const prev = before.get(el);
    const now = el.getBoundingClientRect();

    if (!prev) {
      // ARRIVED. Fade and rise a little — an insertion should read as landing
      // in the list, not as having always been there.
      el.animate(
        [
          { opacity: 0, transform: "translateY(-6px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: durations.collapse, easing: easings.fade, fill: "backwards" },
      );
      continue;
    }

    const dy = prev.top - now.top;
    const dx = prev.left - now.left;
    if (!dy && !dx) continue;
    // A row that moved because its ANCESTOR moved is already travelling: the
    // parent carries it, and animating it a second time would double the
    // distance. Only the outermost mover animates.
    if (movedAncestor(el, before)) continue;

    // MOVED — travel from where it was. Neighbours closing a gap and a
    // reordered row swapping places are the same motion, which is right: both
    // are "this row is somewhere new now".
    el.animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
      { duration: SLIDE_MS, easing: SLIDE },
    );
  }
}

/**
 * Did an enclosing row move too? Walks up to the nearest measured ancestor and
 * asks whether IT is somewhere new. Nested lists (set rows inside exercise
 * cards) are why this exists — see the note on `animateListChange`.
 */
function movedAncestor(el: Element, before: Map<Element, DOMRect>): boolean {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const prev = before.get(p);
    if (!prev) continue;
    const now = p.getBoundingClientRect();
    return prev.top !== now.top || prev.left !== now.left;
  }
  return false;
}

/**
 * Send a row away, then run `remove`.
 *
 * Deletion needs its own step because a removed row is gone from the DOM before
 * anything can animate it — it has to leave FIRST and be unmounted after.
 *
 * No FLIP is needed here, and that is worth stating: `height` is a layout
 * property, so animating it to zero reflows the rows below on every frame and
 * they close the gap by themselves. The row leaving and the list healing are
 * one animation rather than two that have to be kept in step.
 *
 * `slide` sends it out sideways at the same time — used when the deletion came
 * from a swipe, so the row exits in the direction the finger was already going.
 */
export function collapseAndRemove(row: HTMLElement | null, remove: () => void, slide = false): void {
  if (!row || reduced()) {
    remove();
    return;
  }
  const h = row.offsetHeight;
  const mb = parseFloat(getComputedStyle(row).marginBottom) || 0;
  row.style.overflow = "hidden";
  const out = slide ? "translateX(-100%) scale(0.96)" : "scale(0.96)";
  const anim = row.animate(
    [
      { height: `${h}px`, marginBottom: `${mb}px`, opacity: 1, transform: "none" },
      { height: "0px", marginBottom: "0px", opacity: 0, transform: out },
    ],
    { duration: durations.collapse, easing: easings.exit, fill: "forwards" },
  );
  let done = false;
  const finish = () => { if (!done) { done = true; remove(); } };
  anim.onfinish = finish;
  // A cancelled animation (the row unmounted underneath us) must still commit
  // the removal, or the caller's state and the DOM diverge.
  anim.oncancel = finish;
}

/**
 * The common shape as a hook: a control that changes what a list CONTAINS.
 *
 *   const [listRef, refilter] = useListFilter();
 *   <input onChange={(e) => refilter(() => setQuery(e.target.value))} />
 *   <div ref={listRef}> … rows marked data-list-row … </div>
 *
 * The two halves have to travel together — a ref with no wrapped setter
 * animates nothing, and a wrapped setter with no root has nothing to measure —
 * so handing them out as a pair is the point.
 */
export function useListFilter(): [React.RefObject<HTMLDivElement | null>, (apply: () => void) => void] {
  const ref = useRef<HTMLDivElement>(null);
  const run = useCallback((apply: () => void) => animateListChange(ref.current, apply), []);
  return [ref, run];
}
