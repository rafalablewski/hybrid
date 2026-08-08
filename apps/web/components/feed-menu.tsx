"use client";

import { useState } from "react";
import { feedMenuActions, fs, leading, tracking, type FeedMenuAction } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { accentText } from "@/lib/ui";
import Sheet from "./aurora/sheet";
import { C } from "./social-ui";

/**
 * THE POST OVERFLOW MENU (web) — twin of apps/mobile/components/feed-menu.tsx.
 *
 * The rows themselves are NOT decided here: `feedMenuActions` in @hybrid/core
 * (feed-actions.ts) returns the list, the order, the labels' i18n keys and
 * which rows are still placeholders, so a row added on one client cannot go
 * missing on the other. This file is only the rendering.
 *
 * IT IS THE SAME SHEET the rest of the app uses (aurora/sheet.tsx) rather than
 * a bespoke web popover — a popover would be a second modal idiom to build,
 * test and keep theme-aware, and the app is a 600px column on both clients
 * anyway. The mobile twin renders the identical sheet.
 *
 * PLACEHOLDERS SAY SO. Mute, block, follow, report and "not interested" are
 * drawn but nothing is wired behind them yet; tapping one tags that row SOON
 * and leaves the sheet open, rather than firing a silent no-op the athlete
 * reads as a broken button. Delete is real, so it closes and deletes.
 */

const mono = "var(--font-mono)";
const display = "var(--font-display)";

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
  // the sheet doesn't reopen wearing the last visit's tags.
  const [tagged, setTagged] = useState<string[]>([]);
  const actions = feedMenuFor({ mine, subjectType, canDelete: !!onDelete });

  const close = () => { setTagged([]); onClose(); };
  const label = (key: string) => t(key).replace("{h}", handle ? `@${handle}` : t("w.social.you"));

  return (
    <Sheet open={open} onClose={close} title={t("feed.menu.title")} maxWidth={520}>
      <div style={{ marginTop: 4 }}>
        {actions.map((a, i) => {
          const tone = a.destructive ? accentText("red") : C("chalk");
          const isTagged = tagged.includes(a.key);
          return (
            <button
              key={a.key}
              className="pressable"
              onClick={() => {
                if (a.placeholder) { setTagged((s) => (s.includes(a.key) ? s : [...s, a.key])); return; }
                if (a.key === "delete") { close(); onDelete?.(); }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                width: "100%",
                textAlign: "left",
                background: "none",
                border: "none",
                borderTop: i === 0 ? "none" : `1px solid ${C("line")}`,
                padding: "13px 2px",
                cursor: "pointer",
                fontFamily: display,
              }}
            >
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: "block", fontWeight: 600, fontSize: fs.note, color: tone }}>{label(a.labelKey)}</span>
                <span style={{ display: "block", fontSize: fs.caption, lineHeight: `${leading(fs.caption)}px`, color: C("ash"), marginTop: 2 }}>
                  {t(a.subKey)}
                </span>
              </span>
              {/* The honest tag: pressed, and there is nothing behind it yet. */}
              {isTagged && (
                <span style={{ fontFamily: mono, fontSize: fs.nano, fontWeight: 600, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "3px 8px", whiteSpace: "nowrap" }}>
                  {t("feed.menu.soon")}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}
