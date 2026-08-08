// THE DOCK RAIL — the strip of chips that docks beneath the collapsed hero.
//
// THE DIAGNOSIS (reference/dock-rail-design.html). Two screens dock a chip rail
// under the collapsed bar, and the rail was implemented FOUR times: History web
// (a hand-rolled <button> in history-views.tsx), History mobile (the kit's
// AChip), Plans web and Plans mobile (both hand-rolled CategoryRail). Twelve
// properties were decided independently in each, and they agreed on almost
// nothing measurable:
//
//   selected fill   solid lime + dark text  /  lime @16% + lime text  /  — / —
//   chip face       mono 12    /  Archivo bold 13  /  mono 12 +.08em  /  mono 12
//   hit target      ~29        /  44               /  ~33             /  ~33
//   rest fill       ink2       /  transparent      /  transparent     /  transparent
//   weight          400 -> 700 /  constant         /  —               /  —
//   chip padding    6x16       /  44h x16          /  8x12            /  8x12
//   rail padding    10/14      /  10/14            /  8/8             /  8/8
//   rail chrome     ink88/b18  /  ink88/b26        /  ink86/b14       /  ink88/b26
//
// The chrome row is the tell, and it is structural rather than cosmetic: the
// mobile cover scaffold takes a `rail` slot, the WEB one did not, so web Plans
// hand-rolled its own `position: sticky` bar beside the hero — and a hand-rolled
// bar is where ink 86% / blur 14 / z 29 came from. Everything else is downstream
// of four call sites each choosing their own chip.
//
// EXACTLY ONE DIFFERENCE IS REAL, and this file's job is to protect it. History's
// chips SELECT a view: one is always on, and the panel below changes. Plans'
// chips JUMP to a shelf: nothing is ever "on", because the shelves already ARE
// the categories and narrowing to one would empty the screen. So the rails
// SHOULD differ — and the fix is to make that the single deliberate difference
// instead of one of twelve accidental ones. Hence `DockChipRole`: a `mode` chip
// wears the tint, an `anchor` chip never can (see `dockChipOn`, which enforces
// that mechanically rather than by convention).
//
// WHY THE TINT AND NOT THE SOLID FILL. Web's selected chip was a solid lime pill
// with dark text — the loudest object on the History screen, sitting directly
// above cards whose whole design is one large quiet figure. Mobile's 16% tint
// says "on" with the same three signals (fill, border, text) at a fraction of
// the volume, and it is what AChip already ships to 37 other call sites.
//
// WHY MONO AND NOT ARCHIVO. The rail is CHROME, not content: it sits in the same
// band as the hero's eyebrow, meta line and accessory, all of which speak the
// app's mono voice (see hero.ts). Three of the four shipped rails were already
// mono; mobile History was the outlier because it borrowed AChip, which is an
// IN-CONTENT filter and correctly stays Archivo where it lives.

import { fs, space, tracking } from "./scale";

/** What a press does. The one thing the two rails do not share. */
export type DockChipRole =
  /** Selects — exclusive, one always on, the panel below changes (History). */
  | "mode"
  /** Jumps — scrolls to a section, never "on" (Plans' category shelves). */
  | "anchor";

/**
 * THE CONTRACT. Every number the rail and its chips are allowed to have.
 *
 * Both clients import these rather than typing them, which is the whole point:
 * the twelve-property spread above happened because every value was reachable
 * from every call site.
 */
export const DOCK_RAIL = {
  /** Between chips. */
  gap: space.sm,
  /** Above and below the chips, inside the docked bar. One number — the four
   *  rails shipped 10/14 and 8/8, and neither pair was reasoned about. */
  padY: space.ms,
  chip: {
    /** The floor the mobile kit already declares and three of the four rails
     *  missed. NOT cosmetic: it is the only value here a user can feel. */
    hit: 44,
    padX: space.lg,
    size: fs.caption,
    /** Zero. Plans web carried +.08em and nothing else did; a rail label is a
     *  word, not a kicker. */
    tracking: tracking.normal,
    radius: 999,
  },
  /** The selected `mode` chip's fill, as a fraction of the accent. Border and
   *  label take the accent at full strength. */
  tint: 0.16,
} as const;

/**
 * Does this chip wear the "on" treatment?
 *
 * An `anchor` NEVER does, whatever `selected` says — a jump chip that lights up
 * is claiming a selection it does not have, which is the failure mode of the
 * unify-everything option this design rejected. Enforcing it here means a call
 * site cannot reintroduce it by passing the wrong prop.
 */
export function dockChipOn(role: DockChipRole, selected?: boolean): boolean {
  return role === "mode" && !!selected;
}
