"use client";

import { useState } from "react";
import { feedMenuActions, fs, tracking, type FeedMenuAction } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { useDialog } from "@/lib/use-dialog";
import { accentText } from "@/lib/ui";
import { C } from "./social-ui";

/**
 * THE POST OVERFLOW MENU (web) — twin of apps/mobile/components/feed-menu.tsx.
 *
 * A SMALL CARD ANCHORED TO THE ⋯, not a bottom sheet. The sheet was the app's
 * existing modal idiom so it was the cheap answer, but it is the wrong weight
 * for this: a full-width panel sliding up from the bottom of the screen, with
 * the whole app receding behind it, to offer five one-word choices about ONE
 * row — the athlete loses their place in the stream to answer "mute?". A menu
 * hanging off the glyph you pressed keeps the post, and the scroll position,
 * visible the entire time.
 *
 * The rows themselves are NOT decided here: `feedMenuActions` in @hybrid/core
 * (feed-actions.ts) returns the list, the order, the labels' i18n keys and
 * which rows are still placeholders, so a row added on one client cannot go
 * missing on the other. This file is only the rendering.
 *
 * POSITIONING is pure CSS on web: the caller wraps the ⋯ in a
 * `position: relative` box and this hangs off its bottom-right. It opens
 * LEFTWARD (`right: 0`) because the button sits against the row's right edge —
 * a menu anchored left would immediately leave the column.
 *
 * PLACEHOLDERS SAY SO. Mute, block, follow, report and "not interested" are
 * drawn but nothing is wired behind them yet; pressing one tags that row SOON
 * and leaves the card open, rather than firing a silent no-op the athlete
 * reads as a broken button. Delete is real, so it closes and deletes.
 */

const mono = "var(--font-mono)";

export interface FeedMenuProps {
  open: boolean;
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

export default function FeedMenu({ open, onClose, handle, mine, subjectType, onDelete }: FeedMenuProps) {
  const { t } = useLang();
  // Which placeholder rows have been pressed this opening. Reset on close, so
  // the card doesn't reopen wearing the last visit's tags.
  const [tagged, setTagged] = useState<string[]>([]);
  const actions = feedMenuFor({ mine, subjectType, canDelete: !!onDelete });

  const close = () => { setTagged([]); onClose(); };
  // Escape closes, focus moves in and is restored on the way out — the same
  // plumbing every other dismissable surface in the app uses.
  const ref = useDialog<HTMLDivElement>(close, open);

  if (!open) return null;
  const label = (key: string) => t(key).replace("{h}", handle ? `@${handle}` : t("w.social.you"));

  return (
    <>
      {/* A transparent full-page catcher, so a press ANYWHERE — including on
          another post — closes the menu. Without it the only way out is the
          glyph itself, and a menu you have to aim at to dismiss is a trap. */}
      <div onClick={close} style={{ position: "fixed", inset: 0, zIndex: 40, cursor: "default" }} aria-hidden="true" />
      <div
        ref={ref}
        role="menu"
        aria-label={t("feed.menu.title")}
        tabIndex={-1}
        style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          zIndex: 41,
          minWidth: 210,
          maxWidth: "min(280px, calc(100vw - 32px))",
          background: C("ink2"),
          border: `1px solid ${C("line")}`,
          borderRadius: 14,
          // The app's own card lift — theme-aware (a warm sumi-wash on Kyoto
          // Hour, the black bloom on Aurora), never a hardcoded black.
          boxShadow: "var(--shadow-card)",
          padding: 5,
          overflow: "hidden",
        }}
      >
        {actions.map((a) => {
          const isTagged = tagged.includes(a.key);
          return (
            <button
              key={a.key}
              className="pressable"
              role="menuitem"
              onClick={() => {
                if (a.placeholder) { setTagged((s) => (s.includes(a.key) ? s : [...s, a.key])); return; }
                if (a.key === "delete") { close(); onDelete?.(); }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                borderRadius: 10,
                padding: "9px 10px",
                cursor: "pointer",
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                fontSize: fs.body,
                // Destructive rows draw in the AA-guarded red text channel —
                // the same channel every other glyph in the row is held to.
                color: a.destructive ? accentText("red") : C("chalk"),
                whiteSpace: "nowrap",
              }}
            >
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>{label(a.labelKey)}</span>
              {/* The honest tag: pressed, and there is nothing behind it yet. */}
              {isTagged && (
                <span style={{ fontFamily: mono, fontSize: fs.nano, fontWeight: 600, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash") }}>
                  {t("feed.menu.soon")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
