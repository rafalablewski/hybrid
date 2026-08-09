import { describe, expect, it, vi } from "vitest";
import { act } from "@testing-library/react";
import { useState } from "react";
import { View } from "react-native";
import { GOAL_CATEGORIES } from "@hybrid/core";
import { renderScreen as render } from "./render";

/**
 * THE PLANS SCREEN, AND THE RECYCLED EVENT THAT TOOK IT DOWN.
 *
 * Opening Plans on iOS crashed with "Cannot read property 'layout' of null",
 * thrown from inside basicStateReducer. The shelf rail measured itself like
 * this:
 *
 *   onLayout={(e) => setRail((r) => ({ ...r, view: e.nativeEvent.layout.width }))}
 *
 * React Native pools synthetic events: `SyntheticEvent.destructor` nulls
 * `nativeEvent` the instant the handler returns. A functional setState body
 * does not run when you call it, so by the time React replayed the updater the
 * event it had closed over was already blank.
 *
 * WHY IT WAS INTERMITTENT, and the part worth keeping: React evaluates an
 * updater EAGERLY while the fiber has no pending work — there it runs inside
 * the handler, with the event still alive, and nothing breaks. Only once an
 * update is already queued does the rest defer to the render phase. GoalShelf
 * queues two (onLayout and onContentSizeChange both fire as a shelf mounts),
 * so the second one took the deferred path — which is exactly the path named
 * in the crash stack: useState → updateReducerImpl → basicStateReducer.
 *
 * The gate is in two halves. The mechanism is pinned here, at runtime, because
 * a rule nobody can see fail is a rule that rots. The rule itself — no event
 * read from a callback that outlives its handler — is enforced across the tree
 * by lib/event-pooling.test.ts, since this screen's measured geometry is out
 * of the render gate's reach (see vitest.config.ts).
 */

vi.mock(import("../lib/api"), async (importOriginal) => ({
  ...(await importOriginal()),
  fetchMacrocycle: () => Promise.resolve(null),
  fetchTranslationOverrides: () => Promise.resolve({}),
}));

/** An event with React Native's lifetime: alive for the handler, blank after.
 *  `release()` is what the renderer's `destructor()` does on the real thing. */
function pooledLayoutEvent(width: number) {
  const e: { nativeEvent: unknown } = { nativeEvent: { layout: { width } } };
  return { e, release: () => { e.nativeEvent = null; } };
}

describe("the Plans screen", () => {
  // NOT THE GATE FOR THE CRASH, and it must not be mistaken for one: this was
  // checked against the broken line and still passed. onLayout rides a
  // ResizeObserver that test/setup.ts stubs to never fire, so the measuring
  // path the bug lived on is never entered here. It is a mount smoke test —
  // it catches the screen failing to build at all, which is a different thing
  // from the screen dying when it measures. The crash itself is held by the
  // two runtime cases below and by lib/event-pooling.test.ts.
  it("mounts, with a shelf per category", async () => {
    const AuroraPlans = (await import("../components/aurora/plans")).default;
    const { container } = render(<AuroraPlans />);
    for (const category of GOAL_CATEGORIES) {
      expect(container.textContent).toContain(category);
    }
  });
});

describe("pooled layout events", () => {
  it("CRASH — an updater that reads the event is replayed after it is recycled", () => {
    let fire!: (ev: { nativeEvent: unknown }) => void;
    function Shipped() {
      const [rail, setRail] = useState({ view: 0 });
      fire = (ev) => setRail((r) => ({ ...r, view: (ev.nativeEvent as { layout: { width: number } }).layout.width }));
      return <View>{rail.view}</View>;
    }
    render(<Shipped />);

    // Two updates in one batch, as a mounting shelf produces — so the second
    // is deferred to the render phase instead of being evaluated eagerly.
    const a = pooledLayoutEvent(300);
    const b = pooledLayoutEvent(300);
    expect(() => {
      act(() => {
        fire(a.e);
        fire(b.e);
        a.release();
        b.release();
      });
      // V8's wording; Hermes says "Cannot read property 'layout' of null" —
      // the same read, which is the line the crash report carried.
    }).toThrow(/reading 'layout'|property 'layout'/);
  });

  it("FIX — hoisting the measurement out of the event survives it, and still measures", () => {
    let fire!: (ev: { nativeEvent: unknown }) => void;
    let view = 0;
    function Fixed() {
      const [rail, setRail] = useState({ view: 0 });
      // The shipped shape, verbatim.
      fire = (ev) => {
        const w = (ev.nativeEvent as { layout: { width: number } }).layout.width;
        setRail((r) => (r.view === w ? r : { ...r, view: w }));
      };
      view = rail.view;
      return <View>{rail.view}</View>;
    }
    render(<Fixed />);

    const a = pooledLayoutEvent(300);
    const b = pooledLayoutEvent(300);
    act(() => {
      fire(a.e);
      fire(b.e);
      a.release();
      b.release();
    });
    // No throw — and the measurement still landed, so the fix didn't buy
    // safety by quietly dropping the value.
    expect(view).toBe(300);
  });
});
