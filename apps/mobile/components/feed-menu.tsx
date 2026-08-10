import { useEffect, useRef, useState } from "react";
import { View, Text, Modal, Animated, useWindowDimensions } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors, durations, feedMenuActions, type FeedMenuAction, type Relation } from "@hybrid/core";
import { F, fs, PressScale } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { useReducedMotion } from "../lib/use-reduced-motion";
import { GUTTER, RADIUS } from "./aurora/kit";
import { GlassMenuButton, LIQUID_GLASS_RENDERED } from "./aurora/swiftui";
import { toast } from "./aurora/toast";
import { follow as apiFollow, unfollow as apiUnfollow, blockUser, reportTarget } from "../lib/social-api";

/**
 * THE POST OVERFLOW MENU (mobile) — twin of apps/web/components/feed-menu.tsx.
 *
 * `FeedMenuTrigger` is the whole thing now: the ⋯ AND the menu behind it, so a
 * card only ever mounts one component (and mounts nothing when core says the
 * menu would be empty — an empty menu behind a button is worse than no button).
 *
 * ON iOS 26 THE MENU IS THE SYSTEM'S — a SwiftUI `Menu` (aurora/swiftui.tsx
 * GlassMenuButton): real Liquid Glass, zoom-morphing out of the anchor,
 * positioned and dismissed by the OS. Everywhere else it stays the small RN
 * card anchored to the glyph — a card, not a bottom sheet, because a
 * full-width panel sliding up over the whole screen is the wrong weight for
 * five one-word choices about ONE row.
 *
 * The rows themselves are NOT decided here: `feedMenuActions` in @hybrid/core
 * (feed-actions.ts) returns the list, the order, the labels' i18n keys and
 * which rows are still placeholders, so a row added on one client cannot go
 * missing on the other. This file is only the rendering.
 *
 * SELECT DISMISSES, AND THE OUTCOME IS A TOAST. The RN card used to hold its
 * row open and tag it in place ("Followed ✓") — a system menu cannot do that,
 * and two dismissal behaviours for one menu would be worse than either, so
 * BOTH renderers (and the web twin) now close on select and report through
 * the shared toast chip (aurora/toast.tsx). A placeholder row (mute, not
 * interested — core says which) toasts SOON rather than firing a silent no-op
 * the athlete reads as a broken button.
 *
 * POSITIONING (RN card only) CANNOT BE CSS HERE: a card rendered inline inside
 * a feed row would be clipped by the FlatList (and by the row itself on
 * Android), so it renders in a transparent Modal, its own native window, and
 * is placed from the anchor's window rect. It hangs off the anchor's RIGHT
 * edge and FLIPS above the glyph when there isn't room below.
 */

/** The ⋯'s rect in WINDOW coordinates, from `measureInWindow`. */
interface FeedMenuAnchor { x: number; y: number; w: number; h: number }

export interface FeedMenuTriggerProps {
  /** For the {h} interpolation in follow/mute/block. */
  handle: string;
  /** The author, for the follow/block/report calls. */
  authorId: string;
  mine: boolean;
  subjectType: string;
  /** The row's own id — what "Report post" files against. */
  subjectId: string;
  /** The viewer's relation to the author, so the follow row names the right
   *  direction. Undefined means "not following" (the safe assumption). */
  relation?: Relation;
  /** Supplied only when the screen can actually delete this row. */
  onDelete?: () => void;
  /**
   * What the screen must do about a change to the AUTHOR, not this row: a
   * follow changes every card by that person, and a block removes them from
   * the stream entirely. One callback rather than three props, because the
   * screen's job is the same either way — patch or drop by author id.
   */
  onAuthorChanged?: (change: { authorId: string; relation?: Relation; blocked?: boolean }) => void;
}

/** The rows this post would show — exported so a screen can ask without
 *  rendering (the trigger itself already self-gates on an empty list). */
export function feedMenuFor(p: { mine: boolean; subjectType: string; canDelete: boolean; relation?: Relation }): FeedMenuAction[] {
  return feedMenuActions({ mine: p.mine, subjectType: p.subjectType, canDelete: p.canDelete, relation: p.relation });
}

/** The overflow ⋯ (RN fallback trigger). Filled dots, not stroked rings, which
 *  at this size read as three tiny doughnuts. */
function More({ color }: { color: string }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 16 16">
      <Circle cx={3.2} cy={8} r={1.35} fill={color} />
      <Circle cx={8} cy={8} r={1.35} fill={color} />
      <Circle cx={12.8} cy={8} r={1.35} fill={color} />
    </Svg>
  );
}

const FOLLOWING: Relation[] = ["following", "friend", "close"];

/** One row's height at this type size, used only to decide whether the card
 *  fits below the glyph. An estimate is enough: being a few px out flips the
 *  card one press early, never off the screen. */
const ROW_H = 40;
const CARD_PAD = 5;
const GAP = 6;

export function FeedMenuTrigger({
  handle, authorId, mine, subjectType, subjectId, relation, onDelete, onAuthorChanged,
}: FeedMenuTriggerProps) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  // The follow row is a toggle, so the trigger holds the live relation — the
  // screen gets told too, but the row must not wait on a re-render from above
  // to stop saying "Follow" after you pressed it.
  const [rel, setRel] = useState<Relation | undefined>(relation);
  const busy = useRef(false);
  const [anchor, setAnchor] = useState<FeedMenuAnchor | null>(null);
  const moreRef = useRef<View>(null);

  const actions = feedMenuFor({ mine, subjectType, canDelete: !!onDelete, relation: rel });
  const label = (key: string) => t(key).replace("{h}", handle ? `@${handle}` : t("w.social.you"));

  /** One handler for every renderer. The menu is CLOSED by the time this runs
   *  (the system dismisses itself; the RN card closes before calling), so the
   *  outcome lands as a toast — or as the visible effect itself (a delete or a
   *  block removes rows in the same beat). */
  const run = async (key: string) => {
    const action = actions.find((a) => a.key === key);
    if (action?.placeholder) { toast(t("feed.menu.soon")); return; }
    if (key === "delete") { onDelete?.(); return; }
    if (busy.current) return;
    busy.current = true;
    try {
      if (key === "follow") {
        const following = FOLLOWING.includes(rel ?? "none");
        await (following ? apiUnfollow({ followeeId: authorId }) : apiFollow({ followeeId: authorId }));
        const next: Relation = following ? "none" : "following";
        setRel(next);
        toast(t(following ? "feed.menu.unfollowed" : "feed.menu.followed"));
        onAuthorChanged?.({ authorId, relation: next });
      } else if (key === "report") {
        // A POST is a content row and is filed against directly; a session or
        // PR card is derived, so what gets reported there is the athlete. The
        // label already says which (core feed-actions.ts).
        const target = subjectType === "post"
          ? { targetType: "post", targetId: subjectId }
          : { targetType: "socialProfile", targetId: authorId };
        await reportTarget({ ...target, reason: "inappropriate" });
        toast(t("feed.menu.reported"));
      } else if (key === "block") {
        await blockUser({ userId: authorId });
        toast(t("feed.menu.blocked"));
        // Nothing left to act on: the author's rows leave the stream now.
        onAuthorChanged?.({ authorId, blocked: true });
      }
    } catch {
      /* the action simply doesn't toast — no alert for a menu action */
    } finally {
      busy.current = false;
    }
  };

  if (actions.length === 0) return null;

  // The system's menu, where the material renders. The negative margin keeps
  // the ⋯ optically at the row edge — the native hit box is square where the
  // old glyph was bare.
  if (LIQUID_GLASS_RENDERED) {
    return (
      <View style={{ marginRight: -8 }}>
        <GlassMenuButton
          items={actions.map((a) => ({ key: a.key, label: label(a.labelKey), destructive: a.destructive }))}
          onSelect={(key) => { void run(key); }}
          label={t("feed.menu.title")}
          glyphColor={C.ash}
        />
      </View>
    );
  }

  // The RN card: measured trigger + anchored card in its own native window.
  return (
    <>
      {/* collapsable={false} keeps this View in the native tree — RN prunes
          layout-only Views on Android, and a pruned view cannot be measured. */}
      <View ref={moreRef} collapsable={false}>
        <PressScale
          onPress={() => moreRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }))}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("feed.menu.title")}
        >
          <More color={C.ash} />
        </PressScale>
      </View>
      <FeedMenuCard
        anchor={anchor}
        actions={actions}
        label={label}
        onClose={() => setAnchor(null)}
        onSelect={(key) => { setAnchor(null); void run(key); }}
      />
    </>
  );
}

/** The anchored RN card (every platform where the system menu doesn't render). */
function FeedMenuCard({
  anchor, actions, label, onClose, onSelect,
}: {
  anchor: FeedMenuAnchor | null;
  actions: FeedMenuAction[];
  label: (key: string) => string;
  onClose: () => void;
  onSelect: (key: string) => void;
}) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();
  const open = anchor != null;

  // Drops from the glyph rather than appearing: 6dp of travel and a fade, over
  // the dismissal duration. Under Reduce Motion the travel is dropped and the
  // fade carries it alone — feedback, not motion, never nothing.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) { enter.setValue(0); return; }
    Animated.timing(enter, { toValue: 1, duration: reduced ? 90 : durations.fast, useNativeDriver: true }).start();
  }, [open, enter, reduced]);

  if (!open) return null;

  // Right-aligned to the glyph, clamped inside the screen gutter so the card
  // can never sit under the bezel.
  const right = Math.max(GUTTER, screenW - (anchor.x + anchor.w));
  const cardH = actions.length * ROW_H + CARD_PAD * 2;
  const below = anchor.y + anchor.h + GAP;
  // FLIP when the card would run off the bottom.
  const fitsBelow = below + cardH < screenH - 24;
  const place = fitsBelow
    ? { top: below }
    : { top: Math.max(24, anchor.y - GAP - cardH) };

  const lift = scheme === "light"
    ? ({ shadowColor: "#584934", shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 } as const)
    : ({ shadowColor: "#000", shadowOpacity: 0.34, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 } as const);

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* A transparent full-screen catcher, so a press ANYWHERE — including on
          another post — closes the menu. Without it the only way out is the
          glyph itself, and a menu you have to aim at to dismiss is a trap.
          noScale: a scrim must not shrink under the finger. */}
      <PressScale noScale onPress={onClose} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={t("common.close")}>
        <View style={{ flex: 1 }} />
      </PressScale>
      <Animated.View
        accessibilityViewIsModal
        style={{
          position: "absolute",
          right,
          ...place,
          minWidth: 210,
          maxWidth: screenW - GUTTER * 2,
          backgroundColor: C.ink2,
          borderWidth: 1,
          borderColor: C.line,
          borderRadius: RADIUS.inner + 2,
          padding: CARD_PAD,
          opacity: enter,
          transform: reduced
            ? []
            : [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [fitsBelow ? -6 : 6, 0] }) }],
          ...lift,
        }}
      >
        {actions.map((a) => (
          <PressScale key={a.key} onPress={() => onSelect(a.key)} accessibilityRole="menuitem">
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: RADIUS.inner - 2 }}>
              {/* Destructive rows draw in the AA-guarded red text channel —
                  the same channel every other glyph in the row is held to. */}
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: a.destructive ? txt(C, colors.red) : C.chalk }}>
                {label(a.labelKey)}
              </Text>
            </View>
          </PressScale>
        ))}
      </Animated.View>
    </Modal>
  );
}
