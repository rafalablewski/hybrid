import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * THE LIST-MOTION GUARD, for the live logger's set list.
 *
 * A missing layout animation is the quietest bug this codebase can ship. The
 * code is correct, the state is correct, the tests pass, the typechecker is
 * happy — and the app just feels cheap in a way nobody can point at. It is only
 * findable by watching a device, which means it survives every other gate here.
 *
 * It did survive them. `animateListChange` sat on the EXERCISE mutations and on
 * exactly ONE of the seven set mutations (plain "Add set"), under a comment
 * asserting that "EVERY MUTATION OF THE LIST TRAVELS". The presets rail, all
 * three special-set adders, the auto warm-up ramp — and BANKING A SET, the
 * most-repeated interaction in the app and the biggest layout change on the
 * screen — all teleported. The report was "I never saw them in my app".
 *
 * The fix was structural: one door, `commitSets`, that arms the animation before
 * it commits. This file stops the door being walked around. Every `setExercises`
 * call in the logger that rebuilds a set array must either go through
 * `commitSets` or be named in EXEMPT below with its reason.
 *
 * WHY AN ALLOWLIST RATHER THAN A COUNT: the exclusions are not debt being paid
 * down, they are permanent, and each is a real judgement — a per-keystroke write
 * must NOT animate or the card springs on every digit typed. Naming them forces
 * whoever adds the next set-writing path to decide which kind theirs is, which
 * is exactly the decision that got skipped six times.
 */

const LOGGER = join(__dirname, "..", "app", "workout.tsx");
const src = readFileSync(LOGGER, "utf8");

/**
 * The source of one top-level `const <name> = …` in the logger component, up to
 * the next top-level declaration or comment. Text-slicing rather than a regex
 * for the body: a balanced-brace pattern over 3000 lines of JSX is its own bug.
 */
function decl(name: string): string {
  const at = src.indexOf(`  const ${name} = `);
  if (at < 0) return "";
  const rest = src.slice(at + `  const ${name} = `.length);
  // A declaration or comment at exactly two spaces of indent is the next
  // sibling; anything more deeply indented is still inside this body.
  const next = rest.match(/\n {2}(?:const |let |function |\/\/ |\/\*\*)/);
  return next ? rest.slice(0, next.index) : rest;
}

/** The door itself — the one place allowed to write a set array unanimated. */
const DOOR = "sets: fn(x.sets)";

/** One top-level function's source, from its declaration to the next one.
 *  Bounded by the code rather than by a character count, so a comment can be
 *  as long as it needs to be without moving what a guard can see. */
function component(source: string, name: string): string {
  const from = source.indexOf(`function ${name}(`);
  const next = source.indexOf("\nfunction ", from + 1);
  return source.slice(from, next === -1 ? undefined : next);
}

/** Set-writing paths that deliberately do NOT animate, and why. */
const EXEMPT: { marker: string; why: string }[] = [
  {
    marker: "sets: x.sets.map((s, j) => (j === i ? setTypeToSet(s, type) : s))",
    why: "setTypeTo — swaps a row's badge. The row stays exactly where it is, so there is no layout change to travel.",
  },
  {
    marker: "sets: x.sets.filter((t) => (s.uid ? t.uid !== s.uid : t !== s))",
    why: "removeSet — the SWIPE's path, and closing the gap after a swipe belongs to the gesture that opened it (see components/swipe-row.tsx). Its other callers, the ⋯ menu's Delete row and the bare − beside ＋ Add set, go through removeSetTravelling, which arms the motion itself: those are taps, and nothing else on the screen is moving to explain the change.",
  },
  {
    marker: "sets: x.sets.map((s, j) => (j === i ? { ...s, [k]: v } : s))",
    why: "setSetField — runs per KEYSTROKE. Animating would spring the card on every digit.",
  },
  {
    marker: "sets: x.sets.map((s, j) => (j === i ? { ...s, load: nextKg } : s))",
    why: "bumpLoad — the quick +/− load stepper. A value changing inside a row that stays put is not a layout change.",
  },
];

/** The mutations that CHANGE THE SHAPE of the set list, so must animate. */
const MUST_TRAVEL = [
  "addSet",
  "applyPreset",
  "repeatLast",
  "addDropSet",
  "addWarmupSet",
  "addCooldownSet",
  "addWarmupRamp",
  "toggleDone",
];

describe("live logger — every set-list mutation travels", () => {
  it("the door exists, and arms the animation BEFORE it commits", () => {
    const body = decl("commitSets");
    expect(body, "commitSets not found in app/workout.tsx").not.toBe("");
    // configureNext applies to the NEXT layout, so after the setState it lands a
    // frame late and animates whatever happens after this commit instead.
    const armed = body.indexOf("animateListChange");
    const committed = body.indexOf("setExercises");
    expect(armed, "commitSets must call animateListChange").toBeGreaterThan(-1);
    expect(committed, "commitSets must call setExercises").toBeGreaterThan(-1);
    expect(armed, "animateListChange must come BEFORE setExercises").toBeLessThan(committed);
    // Reduce Motion still has to be honoured, or this trades one accessibility
    // bug for another.
    expect(body).toContain("animateListChange(reducedMotion)");
  });

  it("banking a set goes through the door — the regression that started this", () => {
    const body = decl("toggleDone");
    expect(body, "toggleDone not found").not.toBe("");
    expect(body, "toggleDone must not write sets directly — route it through commitSets").not.toContain("setExercises(");
    expect(body).toContain("commitSets(");
  });

  it("each shape-changing mutation routes through the door", () => {
    for (const name of MUST_TRAVEL) {
      const body = decl(name);
      expect(body, `${name} not found in app/workout.tsx`).not.toBe("");
      expect(body, `${name} changes the set list's shape, so it must commit through commitSets`).toContain("commitSets(");
      expect(body, `${name} must not bypass the door with a raw setExercises`).not.toContain("setExercises(");
    }
  });

  it("no other setExercises call rebuilds a set array unless it is exempt", () => {
    const writes = src.match(/setExercises\(\(xs\) =>[\s\S]{0,600}?sets: [^\n]*/g) ?? [];
    expect(writes.length, "no set-writing setExercises calls found — did the logger change shape?")
      .toBeGreaterThan(0);
    const unexplained = writes.filter(
      (w) => !w.includes(DOOR) && !EXEMPT.some((e) => w.includes(e.marker)),
    );
    expect(
      unexplained,
      "A set-list mutation writes sets directly. Route it through commitSets so the change " +
        "travels, or add it to EXEMPT in this file with the reason it must not animate:\n\n" +
        unexplained.map((u) => `  ${u.replace(/\s+/g, " ").slice(0, 150)}…`).join("\n\n"),
    ).toEqual([]);
  });

  it("the exemptions are all still real call sites", () => {
    // An exemption for code that no longer exists is a licence left lying in the
    // file for whoever writes the next thing that happens to match it.
    for (const e of EXEMPT) {
      expect(src, `EXEMPT entry matches nothing any more — delete it: ${e.why}`).toContain(e.marker);
    }
  });

  /**
   * The rest of the class, which the door cannot cover because none of these are
   * set mutations — they mount or unmount a BLOCK. Asking "did you fix all?" is
   * what turned these up: four more surfaces in the same logger changing the same
   * screen's layout between two frames, after the seven set paths were done.
   * Each is checked by the setter that performs it, since that is the thing a
   * future edit would move.
   */
  const BLOCK_CHANGES: { setter: string; what: string; window?: number }[] = [
    { setter: "setRpeOpenSet((u) =>", what: "the RPE pill row — opens inside the card and pushes the sets below it down" },
    { setter: "setSpecialUid((u) =>", what: "the what-kind-of-set panel — the same disclosure one card over" },
    { setter: "setShowTip(false)", what: "dismissing the coach tip — a whole card leaves the top of the scroller" },
    { setter: "setRestSince(null)", what: "stopping the rest countdown — a two-row banner unmounts (via stopRest)" },
    { setter: "toggleSuperset(xs,", what: "joining a superset — a ⛓ badge enters the card header and reflows the name" },
  ];

  it("every block that mounts or unmounts in the logger travels too", () => {
    for (const { setter, what, window = 420 } of BLOCK_CHANGES) {
      const at = src.indexOf(setter);
      expect(at, `${setter} not found — has the logger changed shape? (${what})`).toBeGreaterThan(-1);
      // Only ONE occurrence should need checking; if a second appears, it is a
      // second path to the same layout change and must be routed through the
      // first (that is why stopRest exists).
      expect(
        src.indexOf(setter, at + 1),
        `${setter} appears more than once — give it one door, like stopRest, so the two paths ` +
          `cannot disagree about whether ${what} animates`,
      ).toBe(-1);
      const near = src.slice(Math.max(0, at - window), at + setter.length);
      expect(near, `${what} — must arm animateListChange(reducedMotion)`)
        .toContain("animateListChange(reducedMotion)");
    }
  });

  /**
   * THE BELT AND THE BRACES.
   *
   * Everything above asks native to animate. `animateListChange` is a REQUEST,
   * and on the New Architecture it is one that can be declined — two feature
   * flags, `Platform.isDisableAnimations`, and iOS Fabric support that RN's own
   * source calls "a temporary state". Worse, the screen that needs it most is
   * presented as a `fullScreenModal`: its own view controller, the configuration
   * Fabric handles least well. Every one of those declines SILENTLY and is
   * indistinguishable from a design with no animation in it.
   *
   * So the collapse does not depend on the request being granted. The banked row
   * is a COMPONENT with a native-driver entrance, and that is what these check —
   * including the part that is easy to undo by accident: if the row is ever
   * inlined back into the ternary as a bare <View>, React reconciles it with the
   * active block instead of remounting it, nothing mounts, and the entrance
   * silently stops firing while still being present in the code.
   */
  it("the banked row animates without asking native — a component, so it mounts", () => {
    expect(src, "the ledger row must be rendered as <BankedSetRow>, not an inline <View>: React reconciles two <View> branches as one view and updates in place, so nothing mounts and no entrance can fire")
      .toContain("<BankedSetRow");
    // The WHOLE component, not its first 900 characters. That window was a
    // magic number measuring nothing about the code, and it duly fired the
    // first time a prop arrived with a docblock explaining itself — a guard
    // that fails on comment length teaches the next reader to write less.
    const comp = component(src, "BankedSetRow");
    expect(comp, "BankedSetRow must run useRowEntrance").toContain("useRowEntrance()");
    expect(comp, "BankedSetRow's entrance must ride an Animated.View").toContain("<Animated.View");
    // AND IT MUST NOT SHARE A VIEW WITH THE HOLD'S LIFT. The lift is
    // native-driven and the entrance is deliberately not (see the next test),
    // so one transform array cannot carry both — and merging them is worse
    // than an error, because a style array's later transform silently REPLACES
    // the earlier one and the entrance's travel just stops happening.
    expect(comp, "the hold's lift needs a view of its own — its driver is not the entrance's")
      .not.toMatch(/style=\{\[[^\]]*hold\.liftStyle[^\]]*enter/);
  });

  it("the RPE disclosure animates without asking native either", () => {
    expect(src, "the pill row must be wrapped in <RpeScaleRow> so it carries an entrance").toContain("<RpeScaleRow>");
    const comp = component(src, "RpeScaleRow");
    expect(comp).toContain("useRowEntrance(");
    expect(comp).toContain("<Animated.View");
  });

  it("the entrance stays on the JS driver, and honours Reduce Motion", () => {
    // THE NATIVE DRIVER IS THE TRAP HERE, not the goal, and this is the one
    // assertion in the file most likely to be "fixed" by someone optimising.
    //
    // Under Fabric a native-driver OPACITY animation started from JS can lose
    // the JS-start-vs-native-mount race and strand the view at its initial
    // value — opacity 0 (facebook/react-native#12453). `useEntrance` in the
    // same file shipped exactly that and rendered a blank screen on an
    // iPhone 15 while faster devices won the race; its comment records the
    // fix. Here the stranded value would be an INVISIBLE BANKED SET: the very
    // bug this row was added to fix, reintroduced in a worse form and only on
    // some phones.
    //
    // The JS driver gives up immunity to a busy JS thread — a frame of jank —
    // and keeps the guarantee that matters: `Animated` commits through the
    // ordinary renderer, so unlike LayoutAnimation there is nothing for native
    // to decline, and the fade always reaches its resting value.
    const ui = readFileSync(join(__dirname, "ui.tsx"), "utf8");
    const at = ui.indexOf("export function useRowEntrance");
    expect(at, "useRowEntrance not found in lib/ui.tsx").toBeGreaterThan(-1);
    const body = ui.slice(at, at + 2600);
    expect(body.match(/useNativeDriver: false/g) ?? [], "both branches must stay on the JS driver").toHaveLength(2);
    expect(body, "the native driver can strand this at opacity 0 under Fabric — see useEntrance").not.toContain("useNativeDriver: true");
    expect(body, "Reduce Motion must keep the fade (durations.reduced), not snap").toContain("durations.reduced");
    expect(body, "the non-reduced curve is the shared slide spring, so both mechanisms agree").toContain("springs.slide");
  });
});

/**
 * THE DAY CARD'S STATE CHANGES, same guard, different surface.
 *
 * The set list was not the only place a user-caused layout change teleported.
 * Both week rails replace EVERYTHING under their hairline when a chip is
 * tapped — a receipt with its figures, an empty block with three actions, a
 * declared rest day — and those are different heights, so an unanimated swap
 * snaps the card and takes the rest of the screen with it. The rest
 * declaration is the largest of them: three actions become none.
 *
 * These are text scans for the same reason the file above is one: the bug is
 * only visible on a device, so it survives every gate that runs the code.
 */
describe("the day card travels between its states", () => {
  const read = (rel: string) => readFileSync(join(__dirname, "..", rel), "utf8");

  /** Both rails are ONE object in two modes. A transition on one and a
   *  teleport on the other is exactly the drift the shared shape prevents. */
  for (const rail of ["logbook-rail", "week-rail"]) {
    it(`${rail} arms the day swap`, () => {
      const src = read(`components/aurora/${rail}.tsx`);
      expect(src, "the rail must take the shared motion hook").toContain("useListMotion");
      // The chip's commit — setPicked plus the caller's lift — travels as ONE
      // armed unit. Asserted on the call shape rather than on mere presence of
      // the import, because an unused hook is the failure mode here.
      expect(
        src,
        `${rail}: the day-chip commit must be wrapped in the motion hook, not just imported`,
      ).toMatch(/onSelect=\{\(\) => dayMotion\(\(\) => \{ setPicked/);
    });
  }

  it("declaring a rest day travels, and moves on the TAP rather than on the write", () => {
    const home = read("components/aurora/home.tsx");
    expect(home, "the screen owns the commit, so it owns the motion").toContain("restMotion");
    expect(home, "the state change must be inside the armed callback").toMatch(/restMotion\(\(\) => setRestDays\(/);
    // The card used to redraw from the STORE's answer, which put an
    // AsyncStorage round-trip between the finger and the first pixel — and
    // would have armed the animation around whatever commit landed during the
    // await. The next set is computable from the day, so it is computed here.
    expect(
      home,
      "setRestDay's result must not be piped back into state — that reintroduces the round-trip",
    ).not.toMatch(/setRestDay\([^)]*\)\.then\(setRestDays\)/);
  });
});
