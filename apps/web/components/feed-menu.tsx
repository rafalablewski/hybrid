"use client";

import { useState } from "react";
import { feedMenuActions, fs, type FeedMenuAction, type Relation } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { useDialog } from "@/lib/use-dialog";
import { accentText } from "@/lib/ui";
import { toast } from "./aurora/toast";
import { C, jsend } from "./social-ui";

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
 * GLASS, AND IT ZOOM-MORPHS OUT OF THE ANCHOR — the same presentation the
 * mobile menu now gets from the system (a SwiftUI Menu is real Liquid Glass on
 * iOS 26). Aurora's cards are deliberately solid, but a menu is a TRANSIENT
 * overlay, not a content surface — it joins the pill nav as a glass film, it
 * doesn't join the cards.
 *
 * SELECT DISMISSES, AND THE OUTCOME IS A TOAST. The card used to hold its row
 * open and tag it in place ("Followed ✓") — a system menu cannot do that, and
 * two dismissal behaviours for one menu would be worse than either, so both
 * clients now close on select and report through the shared toast chip
 * (aurora/toast.tsx). A placeholder row (mute, not interested — core says
 * which) toasts SOON rather than firing a silent no-op the athlete reads as a
 * broken button.
 */

export interface FeedMenuProps {
  open: boolean;
  onClose: () => void;
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

/** The rows this post would show — exported so the card can decide whether to
 *  draw a ⋯ at all. An empty menu behind a button is worse than no button. */
export function feedMenuFor(p: { mine: boolean; subjectType: string; canDelete: boolean; relation?: Relation }): FeedMenuAction[] {
  return feedMenuActions({ mine: p.mine, subjectType: p.subjectType, canDelete: p.canDelete, relation: p.relation });
}

export default function FeedMenu({
  open, onClose, handle, authorId, mine, subjectType, subjectId, relation, onDelete, onAuthorChanged,
}: FeedMenuProps) {
  const { t } = useLang();
  // The follow row is a toggle, so the menu holds the live relation while it is
  // open — the screen gets told too, but the row must not wait on a re-render
  // from above to stop saying "Follow" after you pressed it.
  const [rel, setRel] = useState<Relation | undefined>(relation);
  const [busy, setBusy] = useState(false);
  const actions = feedMenuFor({ mine, subjectType, canDelete: !!onDelete, relation: rel });

  const close = () => onClose();

  /** The menu is CLOSED by the caller of this (select dismisses), so the
   *  outcome lands as a toast — or as the visible effect itself (a delete or
   *  a block removes rows in the same beat). */
  const act = async (key: string) => {
    if (busy) return;
    setBusy(true);
    try {
      if (key === "follow") {
        const following = rel === "following" || rel === "friend" || rel === "close";
        await jsend(`/api/social/follow`, following ? "DELETE" : "POST", { followeeId: authorId });
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
        await jsend("/api/reports", "POST", { ...target, reason: "inappropriate" });
        toast(t("feed.menu.reported"));
      } else if (key === "block") {
        await jsend("/api/social/block", "POST", { userId: authorId });
        toast(t("feed.menu.blocked"));
        // Nothing left to act on: the author's rows leave the stream now.
        onAuthorChanged?.({ authorId, blocked: true });
      }
    } catch {
      /* the action simply doesn't toast — no alert for a menu action */
    } finally {
      setBusy(false);
    }
  };
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
        className="feed-menu-zoom"
        style={{
          position: "absolute",
          top: "calc(100% + 6px)",
          right: 0,
          zIndex: 41,
          minWidth: 210,
          maxWidth: "min(280px, calc(100vw - 32px))",
          // The pill nav's glass grammar, not the cards': a light film under a
          // modest blur whose identity lives at the rim.
          background: "rgba(var(--glass-base), 0.55)",
          WebkitBackdropFilter: "blur(22px) saturate(160%)",
          backdropFilter: "blur(22px) saturate(160%)",
          borderRadius: 20,
          boxShadow: "inset 0 1.5px 0 var(--inner-hi), inset 0 0 0 1px rgba(255,255,255,0.08), var(--shadow-card)",
          padding: 5,
          overflow: "hidden",
        }}
      >
        {actions.map((a, i) => (
          <button
            key={a.key}
            className="pressable"
            role="menuitem"
            onClick={() => {
              // Select DISMISSES — the outcome arrives as a toast (or as the
              // rows leaving the stream), never as a row held open.
              close();
              if (a.placeholder) { toast(t("feed.menu.soon")); return; }
              if (a.key === "delete") { onDelete?.(); return; }
              void act(a.key);
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              width: "100%",
              textAlign: "left",
              background: "none",
              border: "none",
              borderTop: i > 0 ? "1px solid rgba(var(--text-rgb), 0.08)" : "none",
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
          </button>
        ))}
      </div>
    </>
  );
}
