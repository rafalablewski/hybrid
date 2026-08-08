import { useState } from "react";
import { View, Text } from "react-native";
import { colors, feedMenuActions, type FeedMenuAction } from "@hybrid/core";
import { F, fs, leading, tracking, PressScale as Pressable } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import Sheet from "./aurora/sheet";
import { RADIUS } from "./aurora/kit";

/**
 * THE POST OVERFLOW MENU (mobile) — twin of apps/web/components/feed-menu.tsx.
 *
 * The rows themselves are NOT decided here: `feedMenuActions` in @hybrid/core
 * (feed-actions.ts) returns the list, the order, the labels' i18n keys and
 * which rows are still placeholders, so a row added on one client cannot go
 * missing on the other. This file is only the rendering.
 *
 * PLACEHOLDERS SAY SO. Mute, block, follow, report and "not interested" are
 * drawn but nothing is wired behind them yet; tapping one tags that row SOON
 * and leaves the sheet open, rather than firing a silent no-op the athlete
 * reads as a broken button. Delete is real, so it closes and deletes.
 */

export interface FeedMenuProps {
  visible: boolean;
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

export default function FeedMenu({ visible, onClose, handle, mine, subjectType, onDelete }: FeedMenuProps) {
  const C = useTheme().palette;
  const { t } = useLang();
  // Which placeholder rows have been pressed this opening. Reset on close, so
  // the sheet doesn't reopen wearing the last visit's tags.
  const [tagged, setTagged] = useState<string[]>([]);
  const actions = feedMenuFor({ mine, subjectType, canDelete: !!onDelete });

  const close = () => { setTagged([]); onClose(); };
  const label = (key: string) => t(key).replace("{h}", handle ? `@${handle}` : t("w.social.you"));

  return (
    <Sheet visible={visible} onClose={close} title={t("feed.menu.title")}>
      <View style={{ marginTop: 4 }}>
        {actions.map((a, i) => {
          const tone = a.destructive ? txt(C, colors.red) : C.chalk;
          const isTagged = tagged.includes(a.key);
          return (
            <Pressable
              key={a.key}
              onPress={() => {
                if (a.placeholder) { setTagged((s) => (s.includes(a.key) ? s : [...s, a.key])); return; }
                if (a.key === "delete") { close(); onDelete?.(); }
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontFamily: F.semi, fontSize: fs.note, color: tone }}>{label(a.labelKey)}</Text>
                  <Text style={{ fontFamily: F.reg, fontSize: fs.caption, lineHeight: leading(fs.caption), color: C.ash, marginTop: 2 }}>
                    {t(a.subKey)}
                  </Text>
                </View>
                {/* The honest tag: pressed, and there is nothing behind it yet. */}
                {isTagged ? (
                  <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: tracking.caps, color: C.ash }}>
                      {t("feed.menu.soon").toUpperCase()}
                    </Text>
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}
