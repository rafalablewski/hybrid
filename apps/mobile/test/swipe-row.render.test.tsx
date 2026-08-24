import { describe, expect, it } from "vitest";
import { Text, View } from "react-native";
import SwipeRow from "../components/swipe-row";
import { renderScreen } from "./render";
import { swipe } from "@hybrid/core";

/**
 * THE REVEAL'S GEOMETRY, actually mounted.
 *
 * lib/swipe-row.test.ts reads the source, which is right for the RELATIONSHIPS
 * (what the responder may close over, which number judges the drag). It cannot
 * see whether the thing renders. This can, and it covers the one part of the
 * repair that is a layout claim rather than an arithmetic one: the action
 * layers are pinned to the ROW's edge and run a full row width outward, so the
 * revealed strip is filled at any travel.
 *
 * The old geometry — a fixed 80dp tile at `right: 0` — was correct only while
 * the travel was clamped to 80. Allowing the row to reach its commit point is
 * exactly what un-clamped it, so the tile would have left a band of bare
 * background beside itself for the ~120px between the button and the commit.
 * That is invisible to types and to every other gate here.
 */
describe("SwipeRow reveal", () => {
  const mount = () =>
    renderScreen(
      <SwipeRow label="Delete" onDelete={() => {}} background="transparent">
        <View><Text>a set</Text></View>
      </SwipeRow>,
    );

  it("mounts, and its child is the row", () => {
    expect(mount().getByText("a set")).toBeTruthy();
  });

  it("puts the action layer at the row's own edge, a full row wide", () => {
    const { getByText } = mount();
    // The label's layer: the Pressable's parent is the fill.
    const layer = getByText("Delete").parentElement?.parentElement;
    expect(layer).toBeTruthy();
    const css = layer!.style;
    // Starts where the row ends — so it can never show at rest (the container
    // clips), and its left edge tracks the row's trailing edge on every frame.
    expect(css.left).toBe("100%");
    expect(css.width).toBe("100%");
    expect(css.position).toBe("absolute");
    // Filled, not a tile: the strip is painted whatever width the drag opens.
    expect(css.backgroundColor).not.toBe("");
  });

  it("keeps the label in an action-width slot at that edge", () => {
    const button = mount().getByText("Delete").parentElement;
    expect(button!.style.width).toBe(`${swipe.action}px`);
  });

  it("clips its reveal, so nothing shows before the row moves", () => {
    // The container, two up from the child: the translated row, then the box
    // that clips it. Without the clip, the layers would paint a row's width of
    // red off the side of every list that uses one — which is the whole reason
    // `background="transparent"` is safe here without an opacity fade.
    //
    // Read per AXIS, not `style.overflow`: react-native-web emits overflow-x
    // and overflow-y and the shorthand reads back empty, which is what the
    // first cut of this test asserted against.
    const row = mount().getByText("a set").parentElement!.parentElement!;
    expect(row.style.transform).toContain("translateX");
    const container = row.parentElement!;
    expect(container.style.overflowX).toBe("hidden");
    expect(container.style.overflowY).toBe("hidden");
    expect(container.style.position).toBe("relative");
  });
});
