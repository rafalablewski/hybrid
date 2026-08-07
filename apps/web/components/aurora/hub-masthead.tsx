"use client";

import { type CSSProperties, type ReactNode } from "react";
import { HUB_MASTHEAD, HUB_MASTHEAD_HEIGHT, hubTitleType, type HubMetaTone } from "@hybrid/core";

const C = (v: string) => `var(--color-${v})`;

/**
 * THE HUB MASTHEAD — web.
 *
 * The exact twin of apps/mobile/components/aurora/hub-masthead.tsx. Both
 * clients import their type, gaps and collapse from packages/core/src/
 * hub-masthead.ts, so a hub head can only be changed for both at once — which
 * is the whole reason this exists: Performance shipped 34 here and 32 on
 * mobile, and Feed had a head on mobile and NO head at all on web.
 *
 * A tab passes DATA and cannot pass style. The three heads diverged precisely
 * because every screen could reach for its own fontSize and its own marginTop.
 *
 * THE COLLAPSE is the CSS already in globals.css (.motion-masthead and its two
 * children), driven by --scroll-collapse — the same signal the floating nav
 * reads. It was on Dashboard alone; every tab inherits it now by rendering
 * this component.
 */
export function HubMasthead({
  /** Left of the meta row: where you are in time, or in the plan. Optional —
   *  the row keeps its height either way. */
  eyebrow,
  /** Right of the meta row: ONE state value, never a second sentence. */
  meta,
  metaTone = "plain",
  title,
  /** Rendered inline after the title (the Kyoto Hour hanko). Decorative only. */
  mark,
  /** Rendered UNDER the title. The one thing that may grow the block, and only
   *  for a transient state — Dashboard's "Back to today". Not a subtitle. */
  accessory,
}: {
  eyebrow?: string | null;
  meta?: ReactNode;
  metaTone?: HubMetaTone;
  title: string;
  mark?: ReactNode;
  accessory?: ReactNode;
}) {
  const type = hubTitleType(title);
  const metaColor = metaTone === "accent" ? "var(--amber-text)" : metaTone === "fresh" ? "var(--lime-text)" : C("ash");
  const metaType: CSSProperties = {
    fontFamily: "var(--font-mono)",
    fontSize: HUB_MASTHEAD.meta.size,
    letterSpacing: `${HUB_MASTHEAD.meta.tracking}px`,
    textTransform: "uppercase",
    lineHeight: `${HUB_MASTHEAD.meta.height}px`,
    whiteSpace: "nowrap",
  };

  return (
    <div
      className="motion-masthead"
      style={{
        margin: `${HUB_MASTHEAD.gap.control}px 0 ${HUB_MASTHEAD.gap.below}px`,
        minHeight: HUB_MASTHEAD_HEIGHT,
        // The collapse's floor, from the shared contract rather than the 0.24
        // that used to be typed into the stylesheet.
        ["--hub-title-scale" as string]: HUB_MASTHEAD.collapse.titleScale,
      }}
    >
      {/* THE META ROW — always rendered, always this tall, so an athlete with no
          season and no phase still gets the title at the same y. That is the job
          `season || " "` was doing with a space character. */}
      <div
        className="motion-masthead-sub"
        style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, height: HUB_MASTHEAD.meta.height }}
      >
        {/* The LEFT slot truncates and the right one never does: a clipped
            season is readable, a clipped phase is not. */}
        <span style={{ ...metaType, color: C("ash"), overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>{eyebrow ?? ""}</span>
        {meta ? <span style={{ ...metaType, color: metaColor }}>{meta}</span> : null}
      </div>

      <h1
        className="motion-masthead-title"
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 800,
          fontSize: type.size,
          lineHeight: `${type.lineHeight}px`,
          letterSpacing: `${type.tracking}px`,
          color: C("chalk"),
          margin: `${HUB_MASTHEAD.gap.meta}px 0 0`,
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "fit-content",
        }}
      >
        {title}
        {mark}
      </h1>

      {accessory}
    </div>
  );
}

export default HubMasthead;
