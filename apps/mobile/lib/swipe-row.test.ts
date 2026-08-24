import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE SWIPE GUARDS.
 *
 * Deleting a set was the app's worst gesture, and every one of its defects was
 * invisible to the type-checker, to the bundler and to every test that looked
 * at one half of the mechanism at a time. So the guards read the SOURCE — the
 * same reason list-motion.test.ts does: none of this can be caught by running
 * the code, because the code runs perfectly and feels broken.
 *
 * The PHYSICS are guarded next door, in core's motion.test.ts, which steps a
 * finger across the commit line one pixel at a time on six real row widths.
 * What is left for here is the WIRING — the ways a swipe surface can hold the
 * right numbers and still get the gesture wrong.
 */

const ROOT = join(__dirname, "..");
const SWIPE_ROW = join(ROOT, "components", "swipe-row.tsx");
const HISTORY = join(ROOT, "components", "aurora", "history.tsx");

const read = (p: string) => readFileSync(p, "utf8");

/** A source file with its comments stripped. Every guard here greps for code,
 *  and this file's own explanations name the very patterns it forbids — the
 *  i18n-key guard learned this the hard way, firing on its own docblock. */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("swipe travel", () => {
  const src = code(SWIPE_ROW);

  it("decides against the position it DRAWS, by using core's travel", () => {
    // THE BUG. The row was drawn against a local `rubberBand(raw, action, …)`
    // that saturated at 120px and judged against 60% of its own width — ~197px
    // on a logger row. The zones never met, so the row stalled dead under the
    // finger and teleported ~77px the frame it crossed the line, in both
    // directions, ticking a haptic on each crossing. That is the shaking.
    //
    // One function now answers both questions, so they cannot disagree again.
    expect(src).toContain("swipeTravel(");
    expect(src).toContain("swipeCommitAt(");
    // And nothing local re-derives the travel beside it.
    expect(src).not.toContain("rubberBand(");
    expect(src).not.toMatch(/swipe\.max/);
  });

  it("arms the commit off the same number it draws with", () => {
    // Both the move and the release must measure against swipeCommitAt, not a
    // constant one of them remembers.
    const uses = src.match(/swipeCommitAt\(/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });
});

describe("holding the gesture", () => {
  // A swipe surface inside a scroller must refuse to hand the responder back
  // mid-drag. The default is to give it up, and the enclosing ScrollView asks
  // the moment its own recognizer starts — which a thumb arcing rather than
  // travelling straight makes it do constantly. The row then TERMINATES and
  // springs back to where the drag began: the delete button that will not hold
  // itself. Neither of the app's two swipe surfaces declared this at all.
  it("History's SwipeCard never yields a drag", () => {
    expect(code(HISTORY).replace(/\s+/g, " ")).toContain("onPanResponderTerminationRequest: () => false");
  });

  it("SwipeRow yields ONLY the touch it took for being open", () => {
    // The one refusal it must not make: an open row that swallows the list's
    // vertical scroll until the finger comes off it. That claim — taken on
    // touch-down purely because the row was open — is given up on request, and
    // dropped outright the moment the drag turns horizontal and becomes this
    // row's own gesture.
    const src = code(SWIPE_ROW);
    expect(src).toContain("onPanResponderTerminationRequest: () => startClaimRef.current");
    expect(src).toMatch(/startClaimRef\.current = sideRef\.current !== 0/);
    expect(src).toMatch(/if \(startClaimRef\.current && Math\.abs\(g\.dx\) > 14\) startClaimRef\.current = false/);
  });
});

describe("the once-built responder reads nothing stale", () => {
  const src = code(SWIPE_ROW);

  // PanResponder.create runs ONCE, inside a useRef, so every prop its handlers
  // touch is frozen at the first render. `leading` was read through a ref for
  // exactly that reason and `onDelete` was not — and in the logger onDelete
  // carried an INDEX on a row React keys by uid, so a row that outlived the
  // removal of a set above it deleted the wrong one on the next full swipe.
  //
  // Every behaviour the responder can reach therefore goes through a ref that
  // is reassigned on each render. If a new prop is added and used inside the
  // responder without one, this fails.
  const BEHAVIOURAL = ["onDelete", "confirm", "leading", "reduced"];

  for (const prop of BEHAVIOURAL) {
    it(`${prop} is read through a ref kept current each render`, () => {
      expect(src).toMatch(new RegExp(`${prop}Ref\\.current = ${prop}\\b`));
    });
  }

  it("nothing the frozen responder can REACH touches those props directly", () => {
    // Not just the handler object: everything it calls. `commitDelete` and
    // `runOff` sit outside PanResponder.create and are captured by it just the
    // same, which is precisely where the stale onDelete was hiding.
    const start = src.indexOf("const runOff");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf(").current;", src.indexOf("PanResponder.create("));
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    for (const prop of BEHAVIOURAL) {
      // `xRef.current` is fine; a bare `x` is the bug.
      const bare = new RegExp(`(?<![\\w.])${prop}(?!Ref)(?![\\w])`);
      expect(body).not.toMatch(bare);
    }
  });
});

describe("a revealed action is a mode", () => {
  const src = code(SWIPE_ROW);

  it("only one row is open at a time", () => {
    // Five sets could sit there with three delete buttons hanging out of them,
    // which is most of what "everything is moving from all directions" was.
    expect(src).toMatch(/let openRow/);
    expect(src).toContain("openRow.current()");
  });

  it("the first tap on an open row closes it instead of reaching the field", () => {
    // Claimed on touch-down, and only while open — a closed row must let a
    // press stay a press, since these rows wrap live number fields.
    const start = src.slice(src.indexOf("onStartShouldSetPanResponder"), src.indexOf("onMoveShouldSetPanResponder"));
    expect(start).toMatch(/sideRef\.current !== 0/);
    expect(src).toMatch(/if \(sideRef\.current !== 0\) haptic\.light\(\);\s*settle\(0\);/);
  });
});

describe("nothing flies away before it is agreed to", () => {
  const src = code(SWIPE_ROW);

  it("a confirm is asked BEFORE the row runs off the edge", () => {
    // Today's session rows ask "are you sure?". That question used to be inside
    // onDelete, which SwipeRow calls once the row has already left and the gap
    // has closed — so a "no" left the row parked off-screen at -width with its
    // data intact and no way back short of leaving the screen.
    const commit = src.slice(src.indexOf("const commitDelete"), src.indexOf("const commitLeading"));
    expect(commit).toContain("confirmRef.current");
    expect(commit).not.toContain("onDeleteRef.current()");
    // The run-off is what calls onDelete, and only the resolved branch reaches it.
    expect(src).toMatch(/ok \? runOff\(\) : settle\(0\)/);
  });
});

describe("every swipe carries a door the gesture is not", () => {
  /**
   * A swipe is a gesture VoiceOver cannot make, and one with nothing on screen
   * saying it is there is barely a door for anyone else either. It was, on the
   * logger and on the Builder's ledger, the ONLY way to remove a set — so those
   * screens had a feature reachable by pointer and by nothing else.
   *
   * The door is NAMED per call site rather than sniffed for, because a file-wide
   * grep for `accessibilityActions` passes on the logger for a reason that has
   * nothing to do with sets (the exercise-order rows carry Move up / Move down).
   * A guard that can be satisfied by an unrelated line somewhere else in the
   * file is a guard you stop trusting. Adding a caller means adding a row here
   * and saying what its door is.
   */
  const DOORS: { file: string; door: RegExp; why: string }[] = [
    {
      file: "app/workout.tsx",
      door: /DELETE_SET_KEY[\s\S]*useHoldMenu|useHoldMenu[\s\S]*DELETE_SET_KEY/,
      why: "the ⋯ set menu's Delete row (the Glass menu and the RN panel both) for the set being worked, the bare − beside ＋ Add set for the last one, and a HOLD on the collapsed rows for every set in between — the ⋯ and the − between them leave a banked set in the middle of an exercise reachable by the gesture and nothing else",
    },
    {
      file: "app/notifications.tsx",
      door: /\{ name: "delete", label: t\("common\.delete"\) \}/,
      why: "the row's own Pressable carries both gestures as rotor actions",
    },
    {
      file: "components/aurora/done-floor.tsx",
      door: /\{ name: "delete", label: t\("common\.delete"\) \}/,
      why: "the session button carries the delete as a rotor action — the row has two targets, so it cannot collapse into one element to carry it itself",
    },
    {
      file: "components/aurora/builder.tsx",
      door: /\{ name: "delete", label: t\("w\.analyze\.hist\.delete"\) \}/,
      why: "the set-type button carries the delete as a rotor action — the row is four live fields and a drag grip",
    },
    {
      file: "components/aurora/nutrition-kit.tsx",
      door: /useHoldMenu/,
      why: "the hold menu, the component built for exactly this — its items ride the rotor through a11yActions",
    },
  ];

  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir)) {
      if (["node_modules", ".expo", "ios", "android", "dist", "build"].includes(e)) continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p, out);
      else if (/\.tsx$/.test(p)) out.push(p);
    }
    return out;
  };

  const callers = ["app", "components"]
    .flatMap((d) => walk(join(ROOT, d)))
    .filter((p) => p !== SWIPE_ROW && /from ["'][^"']*swipe-row["']/.test(read(p)))
    .map((p) => p.slice(ROOT.length + 1).split(sep).join("/"));

  it("every caller is accounted for, and nothing named here has gone", () => {
    expect([...callers].sort()).toEqual(DOORS.map((d) => d.file).sort());
  });

  for (const { file, door, why } of DOORS) {
    it(`${file} — ${why}`, () => {
      expect(read(join(ROOT, file))).toMatch(door);
    });
  }
});
