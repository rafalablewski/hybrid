import { describe, expect, it } from "vitest";
import AuroraSideMenu from "../components/aurora/side-menu";
import { renderScreen } from "./render";

/**
 * THE DRAWER OPENS. That is the whole test, and it is the one thing the app
 * could not do in the build a tester installed:
 *
 *   Error: Rendered more hooks than during the previous render.
 *     at updateMemo … at AuroraSideMenu … at AppHeader
 *
 * The drawer is MOUNTED on every tab root and bails with `if (!open) return
 * null` while shut, so its first render is always the CLOSED one. Global
 * search's two useMemos had been added below that bail-out, which made the
 * open render carry two hooks the closed render never reached — and React,
 * which matches hooks by call order and nothing else, threw on the transition.
 *
 * Every static check the repo had passed it. `tsc` is happy either way (hook
 * order is not a type), the iOS bundle exported fine (bundling is not
 * rendering), and no unit test mounts a component. The invariant needs a
 * SECOND RENDER WITH DIFFERENT PROPS to be visible at all, which is exactly
 * what this does: mount shut — the state the drawer really starts in — then
 * open it, the way tapping the avatar does.
 *
 * lib/hook-order.test.ts guards the same bug by reading the source across every
 * screen. This one proves the actual tree survives the actual transition.
 */

/** The drawer is a Modal, and react-native-web renders a Modal through a PORTAL
 *  appended to the body — so the panel is never inside the render container.
 *  Reading the document is what "is the drawer on screen" means here. */
const onScreen = () => document.body.textContent ?? "";

const shut = <AuroraSideMenu open={false} onClose={() => {}} />;
const open = <AuroraSideMenu open onClose={() => {}} />;

describe("the side menu", () => {
  it("opens without changing its hook count — the avatar-tap crash", () => {
    // Mounted shut, exactly as a tab root mounts it.
    const { rerender } = renderScreen(shut);
    expect(onScreen()).toBe("");

    // The tap. Before the fix this threw "Rendered more hooks than during the
    // previous render" — so reaching the assertion at all IS the regression
    // test; the assertion then proves it opened rather than merely not-crashed.
    expect(() => rerender(open)).not.toThrow();
    expect(onScreen()).toContain("Sign out");
  });

  it("survives being opened and shut repeatedly", () => {
    // The count has to hold in BOTH directions: the shut render drops back to
    // the short list, and a drawer is opened and dismissed many times a
    // session. A one-way check would pass on a component that only crashed on
    // the way back.
    const { rerender } = renderScreen(shut);
    for (let i = 0; i < 3; i++) {
      expect(() => rerender(open)).not.toThrow();
      expect(onScreen()).toContain("Sign out");
      expect(() => rerender(shut)).not.toThrow();
      expect(onScreen()).toBe("");
    }
  });

  it("mounts already-open, the order the crash could hide behind", () => {
    // If the FIRST render is the open one the counts never disagree, which is
    // why the bug survived every developer who opened the drawer on a screen
    // they were already editing. Pinned so the easy path stays covered too.
    renderScreen(open);
    expect(onScreen()).toContain("Sign out");
  });
});
