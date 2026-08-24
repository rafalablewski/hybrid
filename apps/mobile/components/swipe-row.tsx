import { useEffect, useRef, type ReactNode } from "react";
import { Animated, PanResponder, Pressable, Text, View } from "react-native";
import { springs, springToRN, swipe, swipeCommitAt, swipeTravel, projectSwipe, durations, FEEDBACK } from "@hybrid/core";
import { fs, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
// The geometry LEAF, not kit — the same import hold-menu.tsx takes, and for the
// same reason: kit reaches back here and reading the scale from it would close
// the loop (see aurora/geometry.ts).
import { RADIUS } from "./aurora/geometry";
import { haptic } from "../lib/haptics";
import { animateListChange } from "../lib/list-motion";
import { useReducedMotion } from "../lib/use-reduced-motion";

// Swipe a row left to reveal a Delete action — for sets added by accident.
// Built on Animated + PanResponder (no native gesture-handler dependency, so it
// works in the existing dev build). Only claims clearly-horizontal drags, so the
// numeric inputs still focus on tap and the list still scrolls vertically.
// Shared by the live logger (app/workout.tsx), the Builder's set ledger and the
// notifications list.
//
// THE RELEASE RULE is velocity projection, not displacement: the row commits
// from where the finger is HEADING (@hybrid/core projectSwipe), so a fast
// flick that only travelled 35px opens instead of snapping shut. A swipe that
// crosses the row's commit point (core `swipeCommitAt`) deletes outright with
// no second tap — the iOS full-swipe. Every constant is shared with the web
// twin because the two had drifted on all of them while each claiming to
// mirror the other.
//
// A row can also carry a LEADING action, revealed by swiping RIGHT (the
// notifications list uses it for "Unread"). Both sides obey the same grammar:
// a short swipe OPENS the action so it can be tapped, a full swipe COMMITS it
// outright. The leading action then settles home — it changes the row's state
// rather than removing it, so running it off the edge would be a lie.
//
// ── THE TELEPORT, and why the travel lives in core now ─────────────────────
// This row used to be DRAWN against a 120px clamp and JUDGED against 60% of
// its own width. On a logger set row those are 120 and ~197: the row stalled
// dead under a finger that kept moving, and then jumped ~77px sideways the
// frame it crossed the line — in BOTH directions, on every crossing, ticking a
// haptic each time. That is the shaking, and it is also why the full swipe
// felt impossible: it wanted 60% of the screen of travel from a row that had
// visibly stopped moving at a third of it. `swipeTravel` tracks the finger 1:1
// to the commit point and rubber-bands only past it, so the row can always
// reach the line it is judged against, and motion.test.ts steps a finger
// across that line pixel by pixel on six real row widths.
//
// ── THE ACTIONS ARE PINNED TO THE ROW'S EDGE, not to the container's ───────
// Each action layer starts at the row's own trailing (or leading) edge —
// `left: "100%"` plus the SAME translateX the row rides — and runs a full row
// width outward from there. So the revealed strip is filled whatever its
// width, which a fixed 80dp tile pinned to `right: 0` could not do once the
// travel was allowed past 80 (it left a band of bare background beside the
// button). It also means the layers sit entirely OUTSIDE the container's clip
// at rest, which is what makes `background="transparent"` safe by
// construction rather than by an opacity fade that had to be remembered.
//
// ── THE GESTURE IS NEVER THE ONLY DOOR ─────────────────────────────────────
// A swipe is one VoiceOver cannot make, and one with nothing on screen saying
// it is there is barely a door for anyone else either. It was, on the logger
// and the Builder's ledger, the SOLE way to remove a set. This component does
// not try to solve that for its callers — a row it wraps is usually several
// live targets (four number fields and a drag grip, on the Builder) and
// collapsing it into one accessibility element to hang a rotor action off
// would cost more than the action buys. So the door belongs to the CALL SITE,
// and `lib/swipe-row.test.ts` names each one's door and fails a caller that
// has none.
//
// ── ONE ROW OPEN AT A TIME ─────────────────────────────────────────────────
// A revealed action is a MODE, and the app may only be in one of them. Opening
// a row closes whichever row was open, and the first tap on an open row's own
// content closes it instead of reaching the field underneath (History's
// SwipeCard has always done this; these rows did not, so a five-set exercise
// could sit there with three delete buttons hanging out of it).

/** The row currently showing an action, as its own closer. Module-level on
 *  purpose: "one open row" is a property of the SCREEN, not of any list, and
 *  the logger's rows are spread across one card per exercise. */
let openRow: { current: () => void } | null = null;

export default function SwipeRow({ children, onDelete, confirm, label, leading, background, radius = RADIUS.inner, marginBottom = 6 }: {
  children: ReactNode;
  /** Remove the row. Called once the row has run off the edge, immediately
   *  after the list motion is armed — so it must do the removal SYNCHRONOUSLY.
   *  Anything that has to ask first belongs in `confirm`. */
  onDelete: () => void;
  /** Asked BEFORE the row goes anywhere, resolving false to call the whole
   *  thing off. A row that flies away and then asks "are you sure?" has
   *  already told the athlete it is gone — and when they said no, the old code
   *  left it parked off-screen at `translateX: -width` with its data intact
   *  and no way back short of leaving the screen. */
  confirm?: () => Promise<boolean>;
  label: string;
  /** The action revealed by swiping RIGHT, so it sits on the LEFT edge.
   *  Non-destructive by contract: the row settles back home after it runs. */
  leading?: { label: string; onAction: () => void; color?: string };
  /** Row surface colour — must match the host card so the covered actions
   *  can't bleed through.
   *
   *  Pass "transparent" when the row sits on a surface it must NOT repaint.
   *  That is safe because the action layers live outside the container's clip
   *  until the row moves off them (see the header). It matters most on Aurora,
   *  where the host card is GLASS — painting the row `card` there dropped an
   *  opaque panel inside the translucent card, which is the card-inside-a-card
   *  the live logger's active set was drawing while its own code said "no
   *  inner card". */
  background?: string;
  /** Corner radius of the reveal — match the wrapped row.
   *
   *  It clips the CONTAINER, which is what rounds the revealed strip to the
   *  row's own shape; it used to sit on a fixed action tile, which is why the
   *  Builder's ledger drew a rounded button behind a square row. `RADIUS.inner`
   *  by default rather than a literal 12: that is the mark radius the rows
   *  these wrap already use for their own controls, so the default agrees with
   *  its neighbours by name instead of by coincidence. */
  radius?: number;
  /** Outer spacing (the wrapped row should drop its own margin). */
  marginBottom?: number;
}) {
  const C = useTheme().palette;
  const reduced = useReducedMotion();
  const tx = useRef(new Animated.Value(0)).current;
  /** Which action is open: -1 delete (right edge), 0 closed, 1 leading. */
  const sideRef = useRef<-1 | 0 | 1>(0);
  const widthRef = useRef(0);
  // Latched so the commit haptic fires ONCE as you cross, not every frame.
  const armedRef = useRef(false);
  /** True while the only reason this row holds the gesture is that it was OPEN
   *  and the finger came down on it — see onPanResponderTerminationRequest. */
  const startClaimRef = useRef(false);
  // The same latch for the wall on a side with nothing behind it.
  const wallRef = useRef(false);
  // The PanResponder is built ONCE, so every prop it touches would be frozen at
  // the first render. `leading` was already read through a ref for that reason;
  // `onDelete` was NOT, and in the logger it reads `removeSet(x.uid, i)` — an
  // INDEX, on a row React keys by uid. Delete one set and the surviving row
  // kept the responder built when it sat one place lower, so the next full
  // swipe removed the wrong set. One ref per behaviour, so nothing is left
  // holding a first-render closure again.
  const leadingRef = useRef(leading);
  leadingRef.current = leading;
  const onDeleteRef = useRef(onDelete);
  onDeleteRef.current = onDelete;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;

  /** This row's closer, with an identity that survives re-renders so the
   *  registry above can compare against it. */
  const closeSelf = useRef(() => {});

  const settle = (to: -1 | 0 | 1) => {
    sideRef.current = to;
    if (to === 0) {
      if (openRow === closeSelf) openRow = null;
    } else {
      if (openRow && openRow !== closeSelf) openRow.current();
      openRow = closeSelf;
    }
    Animated.spring(tx, { toValue: to * swipe.action, useNativeDriver: true, ...springToRN(springs.slide) }).start();
  };
  closeSelf.current = () => settle(0);

  // A row unmounting while it holds the registry (the screen leaving under an
  // open row) must not leave a closer behind pointing at a dead component.
  useEffect(() => () => { if (openRow === closeSelf) openRow = null; }, []);

  /** Run the row off the edge, then remove it — so the delete has a direction
   *  instead of a disappearance, and THEN the gap closes.
   *
   *  Closing it is this component's job, not the host's. It used to be left to
   *  "the host's animated list", which meant the logger and the builder
   *  remembered and the notification list and the saved shelf did not, so the
   *  identical gesture healed smoothly on two screens and teleported on the
   *  others. A swipe row knows it is deleting a row; nothing else has to. */
  const runOff = () => {
    sideRef.current = 0;
    if (openRow === closeSelf) openRow = null;
    Animated.timing(tx, {
      toValue: -(widthRef.current || 400),
      duration: durations.fast,
      useNativeDriver: true,
    }).start(() => {
      animateListChange(reducedRef.current);
      onDeleteRef.current();
    });
  };

  const commitDelete = () => {
    haptic.warning();
    const ask = confirmRef.current;
    if (!ask) return runOff();
    // Park it OPEN under the question rather than mid-flight: the row has not
    // gone anywhere yet, and it is about to be asked whether it should.
    settle(-1);
    ask().then((ok) => (ok ? runOff() : settle(0)));
  };

  const commitLeading = () => {
    const l = leadingRef.current;
    if (!l) return;
    haptic.light();
    settle(0);
    l.onAction();
  };

  /** Where the finger has dragged to, with the right side closed off when
   *  there's no leading action to reveal. */
  const offset = (dx: number): number => {
    const raw = sideRef.current * swipe.action + dx;
    return leadingRef.current ? raw : Math.min(0, raw);
  };

  const pan = useRef(
    PanResponder.create({
      // While a row is OPEN, its own content stops taking taps: the first tap
      // out of a mode exits the mode. Closed, a press must stay a press —
      // these rows wrap live number fields.
      onStartShouldSetPanResponder: () => {
        startClaimRef.current = sideRef.current !== 0;
        return startClaimRef.current;
      },
      onMoveShouldSetPanResponder: (_, g) => {
        const claim = Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.8;
        // Claimed on the MOVE, so this is the row's own gesture from the first
        // frame and never the borrowed tap that may be handed back.
        if (claim) startClaimRef.current = false;
        return claim;
      },
      onPanResponderGrant: () => {
        armedRef.current = false;
        wallRef.current = false;
      },
      // ONCE THIS ROW IS BEING DRAGGED IT KEEPS THE GESTURE. The default is to
      // hand the responder back on request, and the enclosing ScrollView asks
      // the moment its own recognizer starts — which a real thumb, arcing
      // rather than travelling straight, makes it do constantly. The row would
      // then TERMINATE and spring back to where the drag began, which is the
      // delete button that "doesn't hold itself". Every other drag in the app
      // already guards this (hold-drag-row, the profile grid).
      //
      // THE ONE CASE THAT STILL YIELDS is the touch this row only took because
      // it was open (see onStartShouldSetPanResponder): refusing there would
      // mean an open row swallowed the list's vertical scroll until the finger
      // came off it. So that claim is given up the moment something else wants
      // it — and the row puts itself away on the way out, because a mode left
      // hanging on a screen the athlete has scrolled off is not a mode any
      // more. The claim is dropped as soon as the drag turns horizontal, which
      // is the point it stops being a tap and becomes this row's gesture.
      onPanResponderTerminationRequest: () => startClaimRef.current,
      onPanResponderMove: (_, g) => {
        if (startClaimRef.current && Math.abs(g.dx) > 14) startClaimRef.current = false;
        const raw = offset(g.dx);
        const commit = swipeCommitAt(widthRef.current || 320);
        tx.setValue(swipeTravel(raw, commit));
        // ARMED — the full swipe will run on release. Latched, or it would
        // tick every frame the finger spends past the line.
        const armed = Math.abs(raw) >= commit;
        if (armed !== armedRef.current) {
          armedRef.current = armed;
          if (armed) haptic.light();
        }
        // THE WALL, once. `offset` closes off the side with no action behind
        // it, so the row simply stops dead there — a hard stop the finger can
        // hit on every row, and until now it said nothing at all. `rigid` is
        // the map's "that is as far as it goes", and this is the one place in
        // the gesture that is genuinely a refusal: past the commit the row is
        // still moving and has already ARMED, so a stop reported out there
        // would contradict the tick that just fired.
        const wall = !leadingRef.current && g.dx > swipe.action && raw === 0;
        if (wall !== wallRef.current) {
          wallRef.current = wall;
          if (wall) haptic.rigid();
        }
      },
      onPanResponderRelease: (_, g) => {
        const raw = offset(g.dx);
        const commit = swipeCommitAt(widthRef.current || 320);
        armedRef.current = false;
        wallRef.current = false;
        startClaimRef.current = false;
        // A TAP, not a drag — it only reaches here while the row is open (see
        // onStartShouldSetPanResponder), and it means "put that away".
        if (Math.abs(g.dx) < 4 && Math.abs(g.dy) < 4) {
          if (sideRef.current !== 0) haptic.light();
          settle(0);
          return;
        }
        if (raw <= -commit) { commitDelete(); return; }
        if (leadingRef.current && raw >= commit) { commitLeading(); return; }
        // g.vx is px/ms; the shared rule is in px/s.
        const p = projectSwipe(raw, g.vx * 1000);
        const next: -1 | 0 | 1 = p < -swipe.action * swipe.openAt ? -1 : leadingRef.current && p > swipe.action * swipe.openAt ? 1 : 0;
        if (next !== sideRef.current) haptic.light();
        settle(next);
      },
      onPanResponderTerminate: () => {
        armedRef.current = false;
        wallRef.current = false;
        const scrolledAway = startClaimRef.current;
        startClaimRef.current = false;
        settle(scrolledAway ? 0 : sideRef.current);
      },
    }),
  ).current;

  /** An action layer: starts at the row's own edge and runs a full row width
   *  outward, riding the same translate as the row so it stays flush against
   *  it however far the drag goes. The label keeps an action-width slot at the
   *  row's edge, so it reads at the reveal's resting width AND stays in view
   *  when a full swipe drags the row past it. */
  const action = (col: string, text: string, onPress: () => void, edge: "left" | "right") => (
    <Animated.View
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: "100%",
        ...(edge === "right" ? { left: "100%" } : { right: "100%" }),
        flexDirection: "row",
        justifyContent: edge === "right" ? "flex-start" : "flex-end",
        backgroundColor: col,
        transform: [{ translateX: tx }],
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={text}
        onPress={onPress}
        style={{ width: swipe.action, height: "100%", alignItems: "center", justifyContent: "center" }}
      >
        {/* A solid accent fill, so the label is chalk rather than the accent-TEXT
            channel (which is tuned to sit on ink). */}
        <Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{text}</Text>
      </Pressable>
    </Animated.View>
  );

  return (
    <View
      style={{ position: "relative", marginBottom, borderRadius: radius, overflow: "hidden" }}
      onLayout={(e) => { widthRef.current = e.nativeEvent.layout.width; }}
    >
      {leading && action(leading.color ?? C.red, leading.label, commitLeading, "left")}
      {action(FEEDBACK.error.fill, label, commitDelete, "right")}
      <Animated.View style={{ transform: [{ translateX: tx }], backgroundColor: background ?? C.ink2 }} {...pan.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}
