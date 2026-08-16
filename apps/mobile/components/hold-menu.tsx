import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { View, Text, Modal, Animated, useWindowDimensions, type StyleProp, type ViewStyle } from "react-native";
import { colors, durations } from "@hybrid/core";
import { F, fs, PressScale } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { useReducedMotion } from "../lib/use-reduced-motion";
import { haptic } from "../lib/haptics";
import { GUTTER, RADIUS } from "./aurora/kit";

/**
 * HOLD THE THING — the app's one long-press menu, and the card it opens in.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────────
 * The app could REMEMBER without being able to FORGET. A saved food deleted by
 * a swipe (a gesture with nothing on screen saying it is there), a saved meal by
 * a bare ×, a recent by nothing at all, and a remembered pack — the whole bottle
 * an athlete weighed once — by nothing at all either: the portion switch grew a
 * unit and there was no way to take one off it. Four surfaces, four answers,
 * one of them missing entirely.
 *
 * So there is ONE gesture for it, and it is the one everybody already knows
 * from the home screen of the phone this app ships on: hold the thing, feel it,
 * and pick Delete from the little card that comes up. It is DISCOVERABLE in the
 * way a swipe is not (holding something to see what it can do is the reflex the
 * platform trained), it costs two taps rather than one plus a hidden gesture,
 * and it reads the same on a full-width row and on a 44dp chip — which a
 * revealed swipe action never could.
 *
 * ── IT IS A MENU, NOT A DELETE BUTTON ──────────────────────────────────────
 * Every hold opens the same shape, so a surface with more to offer than removal
 * (a saved food can also be EDITED — a door that used to be three taps down
 * inside the portion sheet) puts it in the same card rather than growing a
 * control of its own. The destructive row is last and draws in the AA-guarded
 * red text channel, per the palette rule that red is kept strictly for risk.
 *
 * ── ONE CARD IN THE APP ────────────────────────────────────────────────────
 * `AnchoredMenu` is the feed's ⋯ card, lifted out of feed-menu.tsx unchanged in
 * every measurement — the modal window (a card rendered inline inside a row is
 * clipped by the list and by the row), the placement off the anchor's rect, the
 * flip when there is no room below, and the grows-out-of-the-anchor motion. It
 * lives here rather than there because a second copy is how five rails once drew
 * five different tails, and the ⋯ and the hold are the same control reached two
 * ways.
 *
 * ── WHY NOT THE SYSTEM'S ContextMenu ──────────────────────────────────────
 * iOS 26 has one, and aurora/swiftui.tsx already wraps it (`GlassContextMenu`).
 * It is deliberately not used here: that wrapper is a TRIAL — the
 * `context-menu-previews` capability is BLOCKED on a device build proving the
 * feed still scrolls cleanly with cards inside it — and this menu is the only
 * route to deleting a saved food. A control that is the sole door to a feature
 * cannot ship on a seam that has not been proven on hardware, and one that
 * existed on iOS 26 and nowhere else would be two different apps. When the trial
 * clears, `AnchoredMenu` is the fallback branch and this file is where the fork
 * goes — the way FeedMenuTrigger already forks.
 *
 * ACCESSIBILITY: a long press is a gesture VoiceOver cannot make. Every caller
 * therefore passes the same actions through `accessibilityActions` as well —
 * the hold is an accelerant on top of a reachable control, never the only door.
 */

/** One row of the card. `destructive` tints it red and nothing else — the card
 *  does not confirm, because the surfaces behind it hold their deletes for Undo,
 *  which is the honest way to make a destructive action reversible. */
export interface HoldMenuItem {
  key: string;
  label: string;
  destructive?: boolean;
}

/** The held thing's rect in WINDOW coordinates, from `measureInWindow`. */
export interface HoldMenuAnchor { x: number; y: number; w: number; h: number }

/** One row's height at this type size, used only to decide whether the card
 *  fits below the anchor. An estimate is enough: being a few px out flips the
 *  card one press early, never off the screen. */
const ROW_H = 40;
const CARD_PAD = 5;
const GAP = 6;

/** How long the finger sits on the thing before the card comes up. The logger
 *  card's own long-press number, so every hold in the app arms at one speed. */
export const HOLD_MS = 400;

/**
 * The anchored card, in its own native window.
 *
 * `side` is which of the anchor's edges the card hangs off. The feed's ⋯ sits at
 * a row's right end and hangs LEFT of it; a held row or chip is the whole
 * object, so its card hangs off the leading edge and reads as belonging to the
 * thing under the finger.
 */
export function AnchoredMenu({
  anchor, items, onClose, onSelect, side = "left",
}: {
  anchor: HoldMenuAnchor | null;
  items: HoldMenuItem[];
  onClose: () => void;
  onSelect: (key: string) => void;
  side?: "left" | "right";
}) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();
  const open = anchor != null;

  // GROWS OUT OF THE ANCHOR rather than appearing: it scales 0.92 → 1 FROM THE
  // ANCHOR'S CORNER while it fades, which is the motion the system menu makes on
  // iOS 26. The corner is the whole point — a menu scaling from its own centre
  // grows in two directions and detaches from the thing that opened it — so
  // transformOrigin follows the placement on both axes.
  //
  // Under Reduce Motion the scale is dropped and the fade carries it alone:
  // feedback, not motion, never nothing.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) { enter.setValue(0); return; }
    Animated.timing(enter, { toValue: 1, duration: reduced ? 90 : durations.fast, useNativeDriver: true }).start();
  }, [open, enter, reduced]);

  if (!open) return null;

  const cardH = items.length * ROW_H + CARD_PAD * 2;
  const below = anchor.y + anchor.h + GAP;
  // FLIP when the card would run off the bottom.
  const fitsBelow = below + cardH < screenH - 24;
  const place = fitsBelow
    ? { top: below }
    : { top: Math.max(24, anchor.y - GAP - cardH) };
  // Clamped inside the screen gutter, so the card can never sit under the bezel.
  const edge = side === "right"
    ? { right: Math.max(GUTTER, screenW - (anchor.x + anchor.w)) }
    : { left: Math.max(GUTTER, Math.min(anchor.x, screenW - GUTTER - 210)) };

  const lift = { shadowColor: "#000", shadowOpacity: 0.34, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 } as const;

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* A transparent full-screen catcher, so a press ANYWHERE closes the menu.
          Without it the only way out is the thing itself, and a menu you have to
          aim at to dismiss is a trap. noScale: a scrim must not shrink under the
          finger. */}
      <PressScale noScale onPress={onClose} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={t("common.close")}>
        <View style={{ flex: 1 }} />
      </PressScale>
      <Animated.View
        accessibilityViewIsModal
        style={{
          position: "absolute",
          ...edge,
          ...place,
          minWidth: 210,
          maxWidth: screenW - GUTTER * 2,
          backgroundColor: C.ink2,
          borderWidth: 1,
          borderColor: C.line,
          borderRadius: RADIUS.inner + 2,
          padding: CARD_PAD,
          opacity: enter,
          transformOrigin: `${side} ${fitsBelow ? "top" : "bottom"}`,
          transform: reduced
            ? []
            : [{ scale: enter.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1] }) }],
          ...lift,
        }}
      >
        {items.map((a) => (
          <PressScale key={a.key} onPress={() => onSelect(a.key)} accessibilityRole="menuitem">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: RADIUS.inner - 2 }}>
              {/* Destructive rows draw in the AA-guarded red text channel — the
                  same channel every other glyph in the row is held to. */}
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: a.destructive ? txt(C, colors.red) : C.chalk }}>
                {a.label}
              </Text>
            </View>
          </PressScale>
        ))}
      </Animated.View>
    </Modal>
  );
}

/**
 * The hold, as a hook — for the rows that cannot simply be WRAPPED.
 *
 * A food row is a row of its own Pressables (the ⊕, the body, the star), and an
 * inner Pressable keeps the touch: a long press on any of them never reaches a
 * wrapper. So the hook hands the pieces back separately — `anchorRef` on the
 * measurable box, `holdProps` spread onto whichever Pressables should arm the
 * hold, and `menu` rendered anywhere in the tree (it is a Modal; where it sits
 * changes nothing).
 */
export function useHoldMenu({ items, onSelect, side, disabled }: {
  items: HoldMenuItem[];
  onSelect: (key: string) => void;
  side?: "left" | "right";
  /** A surface with nothing to offer arms nothing — a hold that opens an empty
   *  card reads as a broken gesture. */
  disabled?: boolean;
}): {
  anchorRef: React.RefObject<View | null>;
  holdProps: { onLongPress: () => void; delayLongPress: number };
  /** The same rows as `accessibilityActions`, for the callers that pass them
   *  through — VoiceOver cannot hold anything. */
  a11yActions: { name: string; label: string }[];
  onA11yAction: (e: { nativeEvent: { actionName: string } }) => void;
  menu: ReactNode;
} {
  const anchorRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<HoldMenuAnchor | null>(null);
  const off = disabled || items.length === 0;

  const open = useCallback(() => {
    if (off) return;
    // Impact MEDIUM, per lib/haptics' own rule: a menu is a surface PRESENTING
    // itself, the same event class as picking a card up.
    haptic.medium();
    anchorRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
  }, [off]);

  return {
    anchorRef,
    holdProps: { onLongPress: open, delayLongPress: HOLD_MS },
    a11yActions: items.map((i) => ({ name: i.key, label: i.label })),
    onA11yAction: (e) => {
      if (items.some((i) => i.key === e.nativeEvent.actionName)) onSelect(e.nativeEvent.actionName);
    },
    menu: (
      <AnchoredMenu
        anchor={off ? null : anchor}
        items={items}
        side={side}
        onClose={() => setAnchor(null)}
        onSelect={(key) => { setAnchor(null); onSelect(key); }}
      />
    ),
  };
}

/**
 * The hold, as a wrapper — for a thing that is ONE pressable object: a unit
 * chip, a pack row in the create form. `onPress` stays the thing's own action,
 * so the chip still does what it did and the hold is purely additive.
 */
export function HoldMenu({
  items, onSelect, onPress, children, style, a11yLabel, a11yRole = "button", side, disabled,
}: {
  items: HoldMenuItem[];
  onSelect: (key: string) => void;
  onPress?: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  a11yLabel?: string;
  a11yRole?: "button" | "radio";
  side?: "left" | "right";
  disabled?: boolean;
}) {
  const hold = useHoldMenu({ items, onSelect, side, disabled });
  return (
    <>
      {/* collapsable={false} keeps this View in the native tree — RN prunes
          layout-only Views on Android, and a pruned view cannot be measured. */}
      <View ref={hold.anchorRef} collapsable={false}>
        <PressScale
          {...hold.holdProps}
          onPress={onPress}
          accessibilityRole={a11yRole}
          accessibilityLabel={a11yLabel}
          accessibilityActions={hold.a11yActions}
          onAccessibilityAction={hold.onA11yAction}
          style={style}
        >
          {children}
        </PressScale>
      </View>
      {hold.menu}
    </>
  );
}
