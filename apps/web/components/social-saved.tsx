"use client";

import { useCallback, useEffect, useState } from "react";
import { FEED_SAVED_PAGE, fs, leading, orderBySaved, tracking } from "@hybrid/core";
import type { FeedItemView, KudosResponse, SavedFeedResponse } from "@hybrid/core";
import { C, Btn, EmptyState, jsend } from "./social-ui";
import { ProfileDrawer } from "./social-profile";
import FeedCard from "./feed-card";
import { Comments } from "./social-feed";
import { HubMasthead } from "./aurora/hub-masthead";
import { useLang } from "@/lib/i18n";
import { forgetSavedPosts, syncSaved, useFeedSaved } from "@/lib/feed-actions";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useIsMobile } from "@/lib/use-media-query";

/**
 * SAVED — the shelf behind the feed's bookmark (web). Twin of
 * apps/mobile/app/saved.tsx.
 *
 * Saving shipped before this screen did, which made the bookmark a button that
 * swallowed things: you could mark a session's scheme and there was no surface
 * that listed what you had marked. This is that surface, and it is deliberately
 * the SAME ROW as the feed (feed-card.tsx) — a saved post that rendered as some
 * reduced "saved item" summary would be a second card model to keep in step,
 * and you would lose the figures you saved it for.
 *
 * WHERE THE DATA COMES FROM. The device holds the saved KEYS and nothing else,
 * so the screen posts them to /api/social/saved and the server rebuilds the
 * cards from the rows — privacy re-checked at read time. It pages, because
 * resolving a key costs the author's session history.
 *
 * THE TWO MISS LISTS ARE PART OF THE SCREEN, not an error path. A shelf that
 * silently returns fewer cards than you saved is the original failure wearing a
 * list view, so: rows the server reports GONE are pruned from the device (the
 * only way the list shrinks by itself), and rows that merely turned invisible
 * are kept and COUNTED on screen — the author went private or blocked you, and
 * that reverses.
 */

export default function SocialSaved({ onNavigate }: { onNavigate?: (screen: string) => void } = {}) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const units = useLoggerPrefs().units;
  const saved = useFeedSaved();
  const [items, setItems] = useState<FeedItemView[] | null>(null);
  const [hidden, setHidden] = useState(0);
  const [shown, setShown] = useState(FEED_SAVED_PAGE);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const keys = saved.ids.slice(0, shown);
  const keySig = keys.join(",");

  const load = useCallback(async () => {
    if (keys.length === 0) { setItems([]); setHidden(0); return; }
    const r = await jsend<SavedFeedResponse>("/api/social/saved", "POST", { keys });
    setUnavailable(!!r.unavailable);
    // Order is the DEVICE's, not the server's: what you remember is when you
    // saved a thing, not when it was posted.
    setItems(orderBySaved(saved, r.items ?? []));
    setHidden((r.hidden ?? []).length);
    if (r.gone?.length) forgetSavedPosts(r.gone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keySig]);
  // The shelf reconciles with the server BEFORE it resolves anything: the list
  // this screen pages through must be the account's, not just this browser's.
  // Quiet no-op until SavedPost is migrated (lib/feed-actions.ts).
  useEffect(() => { void syncSaved(); }, []);
  useEffect(() => { load(); }, [load]);

  const cheer = async (item: FeedItemView) => {
    // Optimistic, exactly as in the feed: a kudos must never wait on the network.
    setItems((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: x.kudos + (x.kudosedByMe ? -1 : 1), kudosedByMe: !x.kudosedByMe } : x)) ?? f);
    const r = await jsend<KudosResponse>("/api/social/kudos", "POST", { subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setItems((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: r.kudos ?? x.kudos, kudosedByMe: r.kudosedByMe ?? x.kudosedByMe } : x)) ?? f);
  };
  const del = async (item: FeedItemView) => {
    if (!window.confirm(t("w.social.deletePostConfirm"))) return;
    await fetch(`/api/social/posts/${item.subjectId}`, { method: "DELETE" });
    load();
  };

  const head = <HubMasthead title={t("w.social.savedTitle")} />;

  return (
    // The screen names its own FACE, like every other screen root.
    <div style={{ maxWidth: 600, fontFamily: "var(--font-display)", color: C("chalk") }}>
      {head}

      {items === null ? (
        <EmptyState title={t("common.loading")} />
      ) : saved.ids.length === 0 ? (
        // The empty state TEACHES the gesture — this screen is reached from a
        // glyph, and an empty shelf that doesn't say what fills it is a dead end.
        <EmptyState title={t("feed.savedEmpty")} sub={t("feed.savedEmptySub")} />
      ) : (
        <>
          {/* The stream boundary — the same hairline handover the feed uses, so
              the first row is bounded top. Bleeds at mobile widths with the rows. */}
          <div style={{ height: 1, background: C("line"), margin: isMobile ? "0 calc(-1 * var(--page-pad-x, 12px))" : 0 }} />

          {items.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              units={units}
              onOpenProfile={(h) => setDrawer(h)}
              onKudos={() => cheer(item)}
              onComments={() => setOpen(open === item.id ? null : item.id)}
              onDelete={item.subjectType === "post" && item.mine ? () => del(item) : undefined}
            >
              {open === item.id && <Comments item={item} onCount={(n) => setItems((f) => f?.map((x) => (x.id === item.id ? { ...x, comments: n } : x)) ?? f)} />}
            </FeedCard>
          ))}

          <div style={{ padding: "14px 0 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            {/* Saved, still yours, currently not showable. Counted rather than
                hidden — the alternative is a list that is quietly short. */}
            {hidden > 0 && (
              <p style={{ fontSize: fs.caption, lineHeight: `${leading(fs.caption)}px`, color: C("ash"), margin: 0, textAlign: "center", maxWidth: 44 * 8 }}>
                {t("feed.savedHidden").replace("{n}", String(hidden))}
              </p>
            )}
            {unavailable && (
              <p style={{ fontSize: fs.caption, color: C("ash"), margin: 0 }}>{t("common.loadError")}</p>
            )}
            {saved.ids.length > shown ? (
              <Btn onClick={() => setShown((n) => n + FEED_SAVED_PAGE)}>
                {t("feed.savedMore").replace("{n}", String(saved.ids.length - shown))}
              </Btn>
            ) : (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash") }}>
                {t("feed.savedCount").replace("{n}", String(saved.ids.length))}
              </div>
            )}
            {items.length === 0 && hidden === 0 && (
              <Btn ghost onClick={() => (onNavigate ? onNavigate("feed") : (window.location.href = "/app?s=feed"))}>{t("w.social.feedTitle")}</Btn>
            )}
          </div>
        </>
      )}

      {drawer && <ProfileDrawer handle={drawer} onClose={() => setDrawer(null)} />}
    </div>
  );
}
