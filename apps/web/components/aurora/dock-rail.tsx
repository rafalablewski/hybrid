"use client";

import { type ReactNode } from "react";
import { DOCK_RAIL, dockChipOn, type DockChipRole } from "@hybrid/core";
import { accentText } from "@/lib/ui";

/**
 * THE DOCK RAIL — web.
 *
 * The exact twin of apps/mobile/components/aurora/kit.tsx's DockRail/DockChip.
 * Both clients import every number from packages/core/src/dock-rail.ts, which
 * also carries the diagnosis this replaces: the rail was authored four separate
 * times (History web, History mobile, Plans web, Plans mobile) and twelve
 * properties were decided independently in each. Design sheet:
 * reference/dock-rail-design.html.
 *
 * A caller passes DATA and a ROLE. It cannot pass a colour, a size, a radius, a
 * font or a padding — that reachability is exactly what let four rails drift.
 *
 * THE ROLE is the one difference the two rails are allowed to have: a `mode`
 * chip SELECTS (one always on, the panel below changes) and wears the accent
 * tint; an `anchor` chip JUMPS to a section and can never light up, because a
 * jump chip claiming a selection it does not have is a lie about what pressing
 * it did. `dockChipOn` enforces that in core rather than here, so no call site
 * can reintroduce it by passing the wrong prop.
 *
 * FULL-BLEED is the rail's own job, per the house rule. The scaffolds' rail
 * slots (HeroScreen, CoverHero) pull to the true screen edge and add NO padding
 * of their own; this supplies the gutter back, so resting chips align with the
 * content column while a scrolled chip runs under the bezel. Before this, the
 * web hero slot padded its child and History then negative-margined straight
 * back out again — the same gutter applied twice, in opposite directions.
 */

const C = (v: string) => `var(--color-${v})`;

export function DockRail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav
      // Labelled, but deliberately NOT role="tablist" on either role: the mode
      // chips switch a rendered layout rather than tab panels, and the anchors
      // are buttons that scroll. Both are already buttons with the right state.
      aria-label={label}
      style={{
        display: "flex",
        gap: DOCK_RAIL.gap,
        overflowX: "auto",
        scrollbarWidth: "none",
        padding: `${DOCK_RAIL.padY}px var(--page-pad-x, 12px)`,
      }}
    >
      {children}
    </nav>
  );
}

export function DockChip({
  role,
  label,
  selected,
  onClick,
}: {
  role: DockChipRole;
  label: string;
  /** Ignored for `anchor` — see dockChipOn. */
  selected?: boolean;
  onClick: () => void;
}) {
  const on = dockChipOn(role, selected);
  // ONE accent value for fill, border and label, exactly as the mobile twin
  // resolves it — the -text variant, because the label is the contrast-critical
  // channel and a chip must not state its accent two different ways.
  const accent = accentText("lime");
  return (
    <button
      className="pressable"
      onClick={onClick}
      // Only a mode chip has a pressed state to report. An anchor is a plain
      // button, and announcing `aria-pressed=false` on it would tell a screen
      // reader there is a selection here to be had.
      aria-pressed={role === "mode" ? on : undefined}
      style={{
        flex: "0 0 auto",
        whiteSpace: "nowrap",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        minHeight: DOCK_RAIL.chip.hit,
        padding: `0 ${DOCK_RAIL.chip.padX}px`,
        borderRadius: DOCK_RAIL.chip.radius,
        fontFamily: "var(--font-mono)",
        fontSize: DOCK_RAIL.chip.size,
        letterSpacing: DOCK_RAIL.chip.tracking,
        // CONSTANT across states. Web used to go 400 -> 700 on select, which
        // widened the chip and reflowed every chip after it mid-tap.
        fontWeight: 400,
        border: `1px solid ${on ? accent : C("line")}`,
        background: on ? `color-mix(in srgb, ${accent} ${DOCK_RAIL.tint * 100}%, transparent)` : "transparent",
        color: on ? accent : C("ash"),
      }}
    >
      {label}
    </button>
  );
}
