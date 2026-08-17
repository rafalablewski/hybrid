import { useRef, useState } from "react";
import { View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { feedMenuActions, type FeedMenuAction, type Relation } from "@hybrid/core";
import { PressScale } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { haptic } from "../lib/haptics";
import { AnchoredMenu, type HoldMenuAnchor } from "./hold-menu";
import { GlassContextMenu, GlassMenuButton, LIQUID_GLASS_RENDERED } from "./aurora/swiftui";
import { toast } from "./aurora/toast";
import { follow as apiFollow, unfollow as apiUnfollow, blockUser, reportTarget } from "../lib/social-api";

/**
 * THE POST OVERFLOW MENU (mobile).
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
 *
 * THAT CARD IS NOT THIS FILE'S ANY MORE. It is `AnchoredMenu` in
 * components/hold-menu.tsx — the same window, placement, flip and grows-out-of-
 * the-anchor motion, now shared with the long-press menu that deletes a saved
 * food, a saved meal, a recent and a remembered pack. The ⋯ and the hold are one
 * control reached two ways, and a second copy of the card is how they would
 * drift apart.
 */

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

/** The rows AND the one handler behind every renderer of this menu — the ⋯
 *  trigger (native or card) and the card's long-press context menu all read
 *  the same instance shape, so a row added in core cannot fire differently by
 *  door. The menu is CLOSED by the time `run` executes (the system dismisses
 *  itself; the RN card closes before calling), so the outcome lands as a
 *  toast — or as the visible effect itself (a delete or a block removes rows
 *  in the same beat). */
export function useFeedMenu({
  handle, authorId, mine, subjectType, subjectId, relation, onDelete, onAuthorChanged,
}: FeedMenuTriggerProps): {
  actions: FeedMenuAction[];
  /** The rows as a renderer-agnostic list: key, localized label, tint. */
  items: { key: string; label: string; destructive?: boolean }[];
  run: (key: string) => void;
} {
  const { t } = useLang();
  // The follow row is a toggle, so the menu holds the live relation — the
  // screen gets told too, but the row must not wait on a re-render from above
  // to stop saying "Follow" after you pressed it.
  const [rel, setRel] = useState<Relation | undefined>(relation);
  const busy = useRef(false);

  const actions = feedMenuFor({ mine, subjectType, canDelete: !!onDelete, relation: rel });
  const label = (key: string) => t(key).replace("{h}", handle ? `@${handle}` : t("w.social.you"));

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

  return {
    actions,
    items: actions.map((a) => ({ key: a.key, label: label(a.labelKey), destructive: a.destructive })),
    run: (key: string) => { void run(key); },
  };
}

/**
 * LONG-PRESS PREVIEW around a card's content — the system ContextMenu carrying
 * this menu's rows (the `context-menu-previews` trial; see GlassContextMenu in
 * aurora/swiftui.tsx for the containment contract). Off iOS 26 it renders the
 * children untouched — the ⋯ remains the only door, and it remains a door on
 * every platform, so the long-press is additive everywhere it exists.
 */
export function FeedContextMenu({ children, ...props }: FeedMenuTriggerProps & { children: React.ReactNode }) {
  const { items, run } = useFeedMenu(props);
  if (!LIQUID_GLASS_RENDERED || items.length === 0) return <>{children}</>;
  return (
    <GlassContextMenu items={items} onSelect={run}>
      {children}
    </GlassContextMenu>
  );
}

export function FeedMenuTrigger(props: FeedMenuTriggerProps) {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const { actions, items, run } = useFeedMenu(props);
  const [anchor, setAnchor] = useState<HoldMenuAnchor | null>(null);
  const moreRef = useRef<View>(null);

  if (actions.length === 0) return null;

  // The system's menu, where the material renders. The negative margin keeps
  // the ⋯ optically at the row edge — the native hit box is square where the
  // old glyph was bare.
  if (LIQUID_GLASS_RENDERED) {
    return (
      <View style={{ marginRight: -8 }}>
        <GlassMenuButton
          items={items}
          onSelect={run}
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
          onPress={() => {
            // Impact MEDIUM, per §13's table and lib/haptics' own rule: a menu
            // is a surface PRESENTING itself, the same event class as picking a
            // card up. The system menu on iOS 26 plays its own, so this fires
            // only on the path that draws the RN card.
            haptic.medium();
            moreRef.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }));
          }}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t("feed.menu.title")}
        >
          <More color={C.ash} />
        </PressScale>
      </View>
      {/* Hangs off the ⋯'s RIGHT edge — the glyph sits at the row's right end,
          so a card growing to the left is the one that stays on screen. */}
      <AnchoredMenu
        anchor={anchor}
        items={items}
        side="right"
        onClose={() => setAnchor(null)}
        onSelect={(key) => { setAnchor(null); run(key); }}
      />
    </>
  );
}
