import { describe, expect, it } from "vitest";
import {
  HUB_DOCK_DEAD_ZONE,
  HUB_DOCK_FLOOR,
  HUB_DOCK_RELEASE,
  HUB_DOCK_REST,
  HUB_DOCK_SPRINGS,
  HUB_PILL,
  hubActiveWidth,
  hubDockState,
  hubDockVisible,
  hubMotion,
  hubPillWidths,
  type HubDockState,
  type HubMotionKey,
} from "./today-hub-dock";
import { durations, easings, springDurationMs, springs } from "./motion";

/** Walk a scroll track the way a finger would, threading each frame's state
 *  into the next — the only way the direction run means anything. */
function scroll(track: number[], opts: Parameters<typeof hubDockState>[1] = {}): HubDockState {
  let s = opts.prev ?? HUB_DOCK_REST;
  for (const y of track) s = hubDockState(y, { ...opts, prev: s });
  return s;
}

const BOTTOM = { controlBottom: 200 };

describe("hubDockState — attach / detach", () => {
  it("stays attached while the in-flow control is still on screen", () => {
    expect(hubDockState(0, BOTTOM).phase).toBe("attached");
    expect(hubDockState(199, BOTTOM).phase).toBe("attached");
    expect(hubDockState(200, BOTTOM).phase).toBe("attached");
  });

  it("detaches once the control's bottom edge has passed", () => {
    expect(hubDockState(201, BOTTOM).phase).not.toBe("attached");
  });

  it("falls back to the floor when the client cannot measure the control", () => {
    expect(hubDockState(HUB_DOCK_FLOOR, {}).phase).toBe("attached");
    expect(hubDockState(HUB_DOCK_FLOOR + 1, {}).phase).not.toBe("attached");
  });

  it("never detaches earlier than the floor, however short the measurement", () => {
    // A mid-transition or pre-paint measurement of ~0 must not put a floating
    // row on screen beside the real one.
    expect(hubDockState(40, { controlBottom: 4 }).phase).toBe("attached");
  });

  it("re-attaches on the looser threshold, so the row cannot flicker", () => {
    const floating = scroll([0, 260], BOTTOM);
    expect(floating.phase).not.toBe("attached");
    // Still floating between the two thresholds…
    const between = hubDockState(200 - HUB_DOCK_RELEASE + 1, { ...BOTTOM, prev: floating });
    expect(between.phase).not.toBe("attached");
    // …and attached once past the release margin.
    const home = hubDockState(200 - HUB_DOCK_RELEASE, { ...BOTTOM, prev: floating });
    expect(home.phase).toBe("attached");
  });

  it("resets the direction run whenever it re-attaches", () => {
    const floating = scroll([0, 300, 400], BOTTOM);
    expect(hubDockState(0, { ...BOTTOM, prev: floating }).run).toBe(0);
  });
});

describe("hubDockState — RETURN", () => {
  it("lands hidden on the first detach, because you got there by reading down", () => {
    expect(scroll([0, 300], BOTTOM).phase).toBe("hidden");
  });

  it("brings the row back on an upward flick past the dead zone", () => {
    const s = scroll([0, 400, 400 - HUB_DOCK_DEAD_ZONE], BOTTOM);
    expect(s.phase).toBe("shown");
    expect(hubDockVisible(s.phase)).toBe(true);
  });

  it("ignores an upward twitch inside the dead zone", () => {
    const s = scroll([0, 400, 400 - (HUB_DOCK_DEAD_ZONE - 1)], BOTTOM);
    expect(s.phase).toBe("hidden");
  });

  it("accumulates a slow drag into a commit — the dead zone is a RUN, not a frame", () => {
    // Six 3px frames upward: no single delta clears 12, the run does.
    const s = scroll([0, 400, 397, 394, 391, 388, 385, 382], BOTTOM);
    expect(s.phase).toBe("shown");
  });

  it("hides again once reading resumes downward", () => {
    const shown = scroll([0, 400, 380], BOTTOM);
    expect(shown.phase).toBe("shown");
    expect(scroll([395, 410], { ...BOTTOM, prev: shown }).phase).toBe("hidden");
  });

  it("drops the run on a direction change rather than carrying it over", () => {
    // 8px up (under the zone), then 8px down: if the run had carried its sign
    // the reversal would instantly clear the zone in the new direction.
    const s = scroll([0, 400, 392], BOTTOM);
    expect(s.phase).toBe("hidden");
    expect(s.run).toBe(-8);
    expect(hubDockState(400, { ...BOTTOM, prev: s }).run).toBe(8);
  });

  it("holds its phase through a frame that did not move", () => {
    const shown = scroll([0, 400, 380], BOTTOM);
    expect(hubDockState(380, { ...BOTTOM, prev: shown }).phase).toBe("shown");
  });

  it("does not read an overscroll bounce as a flick", () => {
    // iOS rubber-band at the top reports negative offsets. Clamped, the settle
    // back to 0 is not travel, so nothing pops open on arrival.
    const s = scroll([0, 300, 40, -30, -12, 0], BOTTOM);
    expect(s.phase).toBe("attached");
  });
});

describe("hubDockState — reduced motion", () => {
  it("never hides the row, however far you read", () => {
    const s = scroll([0, 300, 600, 900], { ...BOTTOM, reduced: true });
    expect(s.phase).toBe("shown");
  });

  it("still attaches at the top", () => {
    expect(hubDockState(0, { ...BOTTOM, reduced: true }).phase).toBe("attached");
  });
});

describe("geometry", () => {
  it("keeps a glyph-only sibling at the platform's touch minimum", () => {
    expect(HUB_PILL.siblingWidth).toBeGreaterThanOrEqual(44);
  });

  it("sizes the active pill from its own measured label", () => {
    const w = hubActiveWidth(60);
    expect(w).toBe(HUB_PILL.labelPadX * 2 + HUB_PILL.glyph + HUB_PILL.labelGap + 60);
    // A longer word in another language simply makes a wider pill.
    expect(hubActiveWidth(96)).toBeGreaterThan(w);
  });

  it("never returns a width narrower than a sibling", () => {
    expect(hubActiveWidth(0)).toBeGreaterThan(HUB_PILL.siblingWidth);
    expect(hubActiveWidth(-40)).toBe(hubActiveWidth(0));
  });

  it("falls back to the screen gutter for the leading inset", () => {
    expect(HUB_PILL.inset).toBe(16);
  });
});

describe("hubPillWidths", () => {
  const TABS = [{ id: "dashboard" }, { id: "performance" }, { id: "feed" }];

  it("gives exactly one pill its word and contracts the rest", () => {
    const w = hubPillWidths("performance", { dashboard: 80, performance: 96, feed: 40 }, TABS);
    expect(w).toEqual([HUB_PILL.siblingWidth, hubActiveWidth(96), HUB_PILL.siblingWidth]);
  });

  it("holds an unmeasured label at its glyph width rather than guessing", () => {
    // The active tab's label has not laid out yet: the row must not lay itself
    // out against an estimate and then jump when the real width lands.
    expect(hubPillWidths("feed", {}, TABS)).toEqual(TABS.map(() => HUB_PILL.siblingWidth));
  });

  it("is the SAME array the glass and the glyphs are laid out from", () => {
    // On iOS these widths are consumed twice — RN draws the marks, SwiftUI
    // draws the glass beneath them — so the two layers must read one source.
    const labels = { dashboard: 88, performance: 96, feed: 40 };
    expect(hubPillWidths("dashboard", labels, TABS)).toEqual(hubPillWidths("dashboard", labels, TABS));
  });
});

describe("motion", () => {
  it("runs on the app's springs, not on curves of its own", () => {
    // The point of the whole exercise: SwiftUI consumes response/damping
    // directly, so the native glass and the RN marks integrate one physics.
    expect(HUB_DOCK_SPRINGS.exchange).toBe(springs.lens);
    expect(HUB_DOCK_SPRINGS.reveal).toBe(springs.sheet);
    for (const key of ["reveal", "exchange"] as const) {
      expect(hubMotion(key).spring).toBe(HUB_DOCK_SPRINGS[key]);
      expect(hubMotion(key).ms).toBe(springDurationMs(HUB_DOCK_SPRINGS[key]));
    }
  });

  it("leaves faster than it arrives, and leaves on a curve", () => {
    const conceal = hubMotion("conceal");
    expect(conceal.ms).toBeLessThan(hubMotion("reveal").ms);
    // Nothing positional to interrupt on the way out, so no spring.
    expect(conceal.spring).toBeNull();
  });

  it("stays inside the system's settle ceiling", () => {
    for (const key of ["reveal", "exchange", "conceal"] as HubMotionKey[]) {
      expect(hubMotion(key).ms).toBeLessThanOrEqual(450);
    }
  });

  it("collapses every transition to one flat fade under reduced motion", () => {
    for (const key of ["reveal", "exchange", "conceal"] as HubMotionKey[]) {
      const m = hubMotion(key, true);
      expect(m).toEqual({ ms: durations.reduced, spring: null, css: "linear", bezier: null });
    }
  });

  it("prints an easing web can hand straight to a transition", () => {
    // A sampled spring, not an approximation of one.
    expect(hubMotion("reveal").css.startsWith("linear(")).toBe(true);
    expect(hubMotion("conceal").css.startsWith("cubic-bezier(")).toBe(true);
  });

  it("hands the same flat curve to CSS and to React Native", () => {
    // Web takes the string, mobile takes the four numbers — one definition.
    const conceal = hubMotion("conceal");
    expect(conceal.bezier).toEqual(
      easings.exit.replace(/^cubic-bezier\(|\)$/g, "").split(",").map(Number),
    );
    // A spring has nothing to approximate: it is integrated on both clients.
    expect(hubMotion("exchange").bezier).toBeNull();
  });

  it("solves each transition once, however often it is asked for", () => {
    expect(hubMotion("exchange")).toBe(hubMotion("exchange"));
  });
});
