"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  feedHeadlineText,
  feedSubjectKey,
  fs,
  leading,
  parseFeedSubjectKey,
  tracking,
  type FeedItemView,
  type FeedPostResponse,
  type KudosResponse,
  type Relation,
} from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { C, Avatar, EmptyState, jget, jsend } from "./social-ui";
import { Comments } from "./feed-comments";
import { FeedActions } from "./feed-card";
import { FeedWorkout } from "./feed-workout";
import FeedMenu, { feedMenuFor } from "./feed-menu";

/**
 * THE POST (web) — twin of apps/mobile/app/post.tsx.
 *
 * A workout is ONE post, and this is the post: who trained, the whole workout
 * (every figure, every record it set, every exercise and every set), the same
 * actions the row carries, and the thread — on its own page, the way an X or
 * Facebook post is a page rather than a peek.
 *
 * It replaced a bottom sheet, and the difference is not decoration:
 *   • a sheet has no address — you couldn't link one, refresh into one, or
 *     land on one from a share. This screen is `?s=post&post=<type>:<id>` and
 *     `feedShareUrl` hands out exactly that.
 *   • a sheet borrowed the row's data, so it could only ever open a post the
 *     feed had already loaded. This screen fetches the post itself
 *     (/api/social/post/[type]/[id]), which is what makes the link work for
 *     someone who has never scrolled past it.
 *   • YOUR OWN workout opens here too. It used to detour into History's
 *     session detail — a different screen with a different shape for the same
 *     post — so the thing you shared was not the thing you could see. The
 *     manage actions still live in History and the post keeps a quiet door to
 *     them.
 *
 * The row hands over its already-loaded item as `initial`, so opening from the
 * feed paints immediately and the fetch only refreshes it.
 */
export default function FeedPost({
  postKey,
  initial,
  onBack,
  onOpenProfile,
  onOpenSession,
  onAuthorChanged,
}: {
  /** `<subjectType>:<subjectId>` — the same key kudos, comments and saves use. */
  postKey: string;
  /** the row the reader tapped, when they came from a feed. */
  initial?: FeedItemView | null;
  onBack: () => void;
  onOpenProfile?: (handle: string) => void;
  /** MY OWN workout, in History's full detail — the Wrapped, the manage row. */
  onOpenSession?: (id: string) => void;
  onAuthorChanged?: (change: { authorId: string; relation?: Relation; blocked?: boolean }) => void;
}) {
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const ref = parseFeedSubjectKey(postKey);
  const [menu, setMenu] = useState(false);
  // The comment button has nothing to expand here — the thread is already open
  // below — so it puts the cursor in the box instead.
  const [focusBox, setFocusBox] = useState(0);

  const q = useQuery({
    queryKey: ["feed-post", ref ? feedSubjectKey(ref) : null],
    queryFn: () => jget<FeedPostResponse>(`/api/social/post/${ref!.subjectType}/${ref!.subjectId}`),
    enabled: !!ref,
    staleTime: 60_000,
  });

  // The row's counts are LOCAL after the first interaction: a kudos must never
  // wait on the network to look given, and a posted comment updates the count
  // beside the thread it just landed in.
  const [live, setLive] = useState<FeedItemView | null>(initial ?? null);
  useEffect(() => { if (q.data?.item) setLive(q.data.item); }, [q.data]);
  const item = live;

  const cheer = async () => {
    if (!item) return;
    setLive({ ...item, kudos: item.kudos + (item.kudosedByMe ? -1 : 1), kudosedByMe: !item.kudosedByMe });
    const r = await jsend<KudosResponse>("/api/social/kudos", "POST", { subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setLive((x) => (x ? { ...x, kudos: r.kudos ?? x.kudos, kudosedByMe: r.kudosedByMe ?? x.kudosedByMe } : x));
  };

  const back = (
    // A door back, not a card: no fill, no border, no radius (CLAUDE.md).
    <button
      className="pressable"
      onClick={onBack}
      style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", padding: "4px 0", marginBottom: 8, cursor: "pointer", color: C("ash"), fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase" }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9.5 3.5 5 8l4.5 4.5" />
      </svg>
      {t("feed.post.back")}
    </button>
  );

  if (!ref) return <div style={{ maxWidth: 600 }}>{back}<EmptyState title={t("feed.post.missing")} /></div>;

  if (!item) {
    const err = q.data?.error === "private" ? t("feed.session.private") : q.isError || q.data?.error ? t("feed.post.missing") : null;
    return (
      <div style={{ maxWidth: 600, fontFamily: "var(--font-display)", color: C("chalk") }}>
        {back}
        <EmptyState title={err ?? t("common.loading")} />
      </div>
    );
  }

  const headline = feedHeadlineText(item, t);
  const session = q.data?.session;
  const menuRows = feedMenuFor({ mine: item.mine, subjectType: item.subjectType, canDelete: false });
  const handle = item.author.handle ? `@${item.author.handle}` : null;

  return (
    <div style={{ maxWidth: 600, fontFamily: "var(--font-display)", color: C("chalk") }}>
      {back}

      {/* WHO — the same identity block the row carries, one size up: on a page
          of its own the post is the only thing here, so the person leads it. */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          className="pressable"
          onClick={() => onOpenProfile?.(item.author.handle)}
          style={{ background: "none", border: "none", padding: 0, cursor: onOpenProfile ? "pointer" : "default" }}
          aria-label={item.author.displayName ?? item.author.handle}
        >
          <Avatar url={item.author.avatarUrl} name={item.author.displayName} handle={item.author.handle} size={44} />
        </button>
        {/* ONE line — avatar, name, handle, time — exactly as the row reads it
            (feed-card.tsx): the name and the handle shrink, the time never does. */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: 6 }}>
          <span style={{ fontWeight: 700, fontSize: fs.note, color: C("chalk"), minWidth: 0, flexShrink: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {item.author.displayName || handle || t("w.social.you")}
          </span>
          {handle && item.author.displayName ? (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), minWidth: 0, flexShrink: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{handle}</span>
          ) : null}
          {item.when && (
            // A spaced en dash divides the two ash figures — never a middot.
            <span style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, color: C("ash"), flexShrink: 0, whiteSpace: "nowrap" }}>
              {(handle && item.author.displayName) ? <span aria-hidden="true">– </span> : null}{item.when}
            </span>
          )}
        </div>
        {menuRows.length > 0 && (
          <div style={{ position: "relative", zIndex: menu ? 30 : "auto", display: "inline-flex" }}>
            <button className="pressable" onClick={() => setMenu((v) => !v)} aria-label={t("feed.menu.title")} aria-haspopup="menu" aria-expanded={menu} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), padding: 4, display: "inline-flex" }}>
              <svg width="17" height="17" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
                <circle cx="3.2" cy="8" r="1.35" /><circle cx="8" cy="8" r="1.35" /><circle cx="12.8" cy="8" r="1.35" />
              </svg>
            </button>
            <FeedMenu
              open={menu}
              onClose={() => setMenu(false)}
              handle={item.author.handle}
              authorId={item.author.id}
              mine={item.mine}
              subjectType={item.subjectType}
              subjectId={item.subjectId}
              relation={item.relation}
              onAuthorChanged={onAuthorChanged}
            />
          </div>
        )}
      </div>

      {/* The caption the athlete wrote FOR the feed. The private post-workout
          note is owner-only by schema and never arrives here. */}
      {item.body && <p style={{ color: C("ash"), fontSize: fs.body, lineHeight: `${leading(fs.body)}px`, margin: "12px 0 0" }}>{item.body}</p>}

      <div style={{ marginTop: 12 }}>
        {session ? (
          // The whole workout: the figures, the records, then the ledger.
          <FeedWorkout session={session} units={units} prs={item.detail?.prs ?? []} />
        ) : q.isLoading ? (
          <EmptyState title={t("common.loading")} />
        ) : headline ? (
          // A status post has no workout behind it — its headline IS the post.
          <div style={{ fontFamily: "var(--font-heading)", fontWeight: 800, fontSize: fs.title, lineHeight: `${leading(fs.title, "snug")}px` }}>{headline}</div>
        ) : null}
      </div>

      <FeedActions item={item} headline={headline || item.title} onKudos={cheer} onComments={() => setFocusBox((n) => n + 1)} />

      {/* MY OWN post keeps its manage surface — one quiet door to History's
          full detail (Wrapped, PRs, edit/archive), never a second copy of it. */}
      {item.mine && onOpenSession && item.subjectType !== "post" && (
        <button
          className="pressable"
          onClick={() => onOpenSession(item.subjectId)}
          style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: "8px 0", cursor: "pointer", color: C("ash"), fontFamily: "var(--font-mono)", fontSize: fs.micro }}
        >
          {t("feed.post.openMine")}
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M6.5 3.5 11 8l-4.5 4.5" />
          </svg>
        </button>
      )}

      <Comments item={item} focusSignal={focusBox} onCount={(n) => setLive((x) => (x ? { ...x, comments: n } : x))} />
    </div>
  );
}
