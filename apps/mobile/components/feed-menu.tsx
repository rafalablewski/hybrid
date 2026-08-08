import { useEffect, useRef, useState } from "react";
import { View, Text, Modal, Pressable, Animated, useWindowDimensions } from "react-native";
import { colors, durations, feedMenuActions, type FeedMenuAction } from "@hybrid/core";
import { F, fs, tracking, PressScale } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { useReducedMotion } from "../lib/use-reduced-motion";
import { GUTTER, RADIUS } from "./aurora/kit";

/**
 * THE POST OVERFLOW MENU (mobile) — twin of apps/web/components/feed-menu.tsx.
 *
 * A SMALL CARD ANCHORED TO THE ⋯, not a bottom sheet. The sheet was the app's
 * existing modal idiom so it was the cheap answer, but it is the wrong weight
 * for this: a full-width panel sliding up from the bottom, with the whole
 * screen receding behind it, to offer five one-word choices about ONE row —
 * the athlete loses their place in the stream to answer "mute?". A card
 * hanging off the glyph you pressed keeps the post, and the scroll position,
 * visible the entire time.
 *
 * The rows themselves are NOT decided here: `feedMenuActions` in @hybrid/core
 * (feed-actions.ts) returns the list, the order, the labels' i18n keys and
 * which rows are still placeholders, so a row added on one client cannot go
 * missing on the other. This file is only the rendering.
 *
 * POSITIONING CANNOT BE CSS HERE, which is the one real difference from the
 * web twin. A card rendered inline inside a feed row would be clipped by the
 * FlatList (and by the row itself on Android, where `overflow: hidden` is the
 * default) — so it renders in a transparent Modal, its own native window, and
 * is placed from the anchor's window rect, which the card measures and hands
 * over. It hangs off the anchor's RIGHT edge (the glyph sits against the row's
 * right edge; anchoring left would immediately leave the column) and FLIPS
 * above the glyph when there isn't room below — a menu that opens off the
 * bottom of the screen is a menu you cannot use.
 *
 * PLACEHOLDERS SAY SO. Mute, block, follow, report and "not interested" are
 * drawn but nothing is wired behind them yet; pressing one tags that row SOON
 * and leaves the card open, rather than firing a silent no-op the athlete
 * reads as a broken button. Delete is real, so it closes and deletes.
 */

/** The ⋯'s rect in WINDOW coordinates, from `measureInWindow`. */
export interface FeedMenuAnchor { x: number; y: number; w: number; h: number }

export interface FeedMenuProps {
  /** The measured ⋯, or null when the menu is closed. */
  anchor: FeedMenuAnchor | null;
  onClose: () => void;
  /** For the {h} interpolation in follow/mute/block. */
  handle: string;
  mine: boolean;
  subjectType: string;
  /** Supplied only when the screen can actually delete this row. */
  onDelete?: () => void;
}

/** The rows this post would show — exported so the card can decide whether to
 *  draw a ⋯ at all. An empty menu behind a button is worse than no button. */
export function feedMenuFor(p: { mine: boolean; subjectType: string; canDelete: boolean }): FeedMenuAction[] {
  return feedMenuActions({ mine: p.mine, subjectType: p.subjectType, canDelete: p.canDelete });
}

/** One row's height at this type size, used only to decide whether the card
 *  fits below the glyph. An estimate is enough: being a few px out flips the
 *  card one press early, never off the screen. */
const ROW_H = 40;
const CARD_PAD = 5;
const GAP = 6;

export default function FeedMenu({ anchor, onClose, handle, mine, subjectType, onDelete }: FeedMenuProps) {
  const { palette: C, scheme } = useTheme();
  const { t } = useLang();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const reduced = useReducedMotion();
  // Which placeholder rows have been pressed this opening. Reset on close, so
  // the card doesn't reopen wearing the last visit's tags.
  const [tagged, setTagged] = useState<string[]>([]);
  const actions = feedMenuFor({ mine, subjectType, canDelete: !!onDelete });
  const open = anchor != null;

  // Drops from the glyph rather than appearing: 6dp of travel and a fade, over
  // the dismissal duration. Under Reduce Motion the travel is dropped and the
  // fade carries it alone — feedback, not motion, never nothing.
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!open) { enter.setValue(0); return; }
    Animated.timing(enter, { toValue: 1, duration: reduced ? 90 : durations.fast, useNativeDriver: true }).start();
  }, [open, enter, reduced]);

  const close = () => { setTagged([]); onClose(); };
  const label = (key: string) => t(key).replace("{h}", handle ? `@${handle}` : t("w.social.you"));

  if (!open || actions.length === 0) return null;

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
    <Modal transparent visible animationType="none" onRequestClose={close} statusBarTranslucent>
      {/* A transparent full-screen catcher, so a press ANYWHERE — including on
          another post — closes the menu. Without it the only way out is the
          glyph itself, and a menu you have to aim at to dismiss is a trap.
          noScale: a scrim must not shrink under the finger. */}
      <PressScale noScale onPress={close} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={t("common.close")}>
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
        {actions.map((a) => {
          const isTagged = tagged.includes(a.key);
          return (
            <PressScale
              key={a.key}
              onPress={() => {
                if (a.placeholder) { setTagged((s) => (s.includes(a.key) ? s : [...s, a.key])); return; }
                if (a.key === "delete") { close(); onDelete?.(); }
              }}
              accessibilityRole="menuitem"
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderRadius: RADIUS.inner - 2 }}>
                {/* Destructive rows draw in the AA-guarded red text channel —
                    the same channel every other glyph in the row is held to. */}
                <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.body, color: a.destructive ? txt(C, colors.red) : C.chalk }}>
                  {label(a.labelKey)}
                </Text>
                {/* The honest tag: pressed, and there is nothing behind it yet. */}
                {isTagged ? (
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash }}>
                    {t("feed.menu.soon").toUpperCase()}
                  </Text>
                ) : null}
              </View>
            </PressScale>
          );
        })}
      </Animated.View>
    </Modal>
  );
}
