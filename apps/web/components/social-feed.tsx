"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { feedSubjectKey, fs, leading, tracking } from "@hybrid/core";
import type { FeedItemView, FeedResponse, KudosResponse, LiveAthlete, MutationResult, OwnProfileResponse, Relation } from "@hybrid/core";
import { C, Avatar, Btn, EmptyState, jget, jsend, type OpenUser } from "./social-ui";
import { CosignInbox } from "./pr-attestation";
import FeedCard from "./feed-card";
import { Comments } from "./feed-comments";
import FeedLiveStrip from "./feed-live-strip";
import { HubMasthead } from "./aurora/hub-masthead";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { syncSaved } from "@/lib/feed-actions";
import { useIsMobile } from "@/lib/use-media-query";

/**
 * CONNECT — the feed (web). Twin of apps/mobile/components/feed-view.tsx; both
 * render the shared card model from core (feed-card.ts), so a card can never
 * look like one product on one client and another on the other.
 *
 * The screen's order is the spec's (reference/feed-spec.html, D2):
 *   co-sign inbox (someone is waiting on an answer) → feed tabs → the
 *   always-open composer → the stream → the caught-up marker, which hands the
 *   athlete back to the bar rather than to more scrolling.
 *
 * FOR YOU vs FOLLOWING: the ranked feed only earns trust while an unranked exit
 * exists. "Following" is strictly chronological and strictly other people —
 * no ranking, no interleaving, no own posts.
 */

type FeedItem = FeedItemView;
type Tab = "forYou" | "following";

/** The composer — the X compose box's grammar, not a card: my avatar beside a
 *  bare auto-growing field, then one accent glyph row with the Share pill on
 *  its right, the whole block running edge to edge between two hairlines. No
 *  fill, no border, no radius, no open/close state — the box is always one tap
 *  from typing, and the pill sits dimmed until there is something to post.
 *  Twin of the mobile composer in components/feed-view.tsx. The nav's Add post
 *  circle focuses THIS box (the "hybrid:compose" event) rather than opening a
 *  second editor, so there is exactly one place a post is written. */
function Composer({ onPosted }: { onPosted: () => void }) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const [text, setText] = useState("");
  const [attachPr, setAttachPr] = useState(false);
  const [posting, setPosting] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  // My own face beside the box — the one identity the feed response doesn't
  // carry, so the composer fetches it itself (and keeps it for the session).
  const me = useQuery({
    queryKey: ["own-profile"],
    queryFn: () => jget<OwnProfileResponse>("/api/social/profile"),
    staleTime: 5 * 60_000,
  }).data?.profile;

  // The nav's Add post — scroll the composer into view and hand it the caret.
  useEffect(() => {
    const focus = () => {
      const el = box.current;
      if (!el) return;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus();
    };
    window.addEventListener("hybrid:compose", focus);
    return () => window.removeEventListener("hybrid:compose", focus);
  }, []);

  const share = async () => {
    if (!text.trim() && !attachPr) return;
    setPosting(true);
    const r = await jsend<MutationResult>("/api/social/posts", "POST", { text, attachPr });
    setPosting(false);
    if (r.error) { alert(r.error); return; }
    setText(""); setAttachPr(false);
    // The field's auto-grow writes an inline height; a programmatic clear
    // must hand the height back too, or the empty box keeps the old depth.
    if (box.current) box.current.style.height = "";
    onPosted();
  };

  return (
    // At mobile widths the block bleeds under the shell's gutter exactly like
    // the timeline rows below it (feed-card.tsx), so its hairline and the
    // stream's run the same edge-to-edge width — no side gaps.
    <div
      style={{
        borderTop: `1px solid ${C("line")}`,
        padding: isMobile ? "10px var(--page-pad-x, 12px) 8px" : "10px 0 8px",
        margin: isMobile ? "0 calc(-1 * var(--page-pad-x, 12px))" : 0,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <Avatar url={me?.avatarUrl} name={me?.displayName} handle={me?.handle} size={40} />
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* The field is bare and one line tall until the text needs more —
              the X idiom: the placeholder IS the invitation, at heading size. */}
          <textarea
            ref={box}
            rows={1}
            value={text}
            maxLength={500}
            onChange={(e) => {
              setText(e.target.value);
              e.currentTarget.style.height = "0";
              e.currentTarget.style.height = `${e.currentTarget.scrollHeight}px`;
            }}
            placeholder={t("w.social.sharePlaceholder")}
            style={{ display: "block", width: "100%", border: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.heading, lineHeight: `${leading(fs.heading)}px`, outline: "none", resize: "none", overflow: "hidden", padding: "7px 0 2px" }}
          />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginTop: 8 }}>
            {/* The one attachment this product has — the latest PR — as an
                accent glyph in X's toolbar position. It fills when attached. */}
            <button
              className="pressable"
              onClick={() => setAttachPr((v) => !v)}
              aria-pressed={attachPr}
              aria-label={t("w.social.attachPr")}
              title={t("w.social.attachPr")}
              style={{ background: "none", border: "none", padding: 4, margin: -4, cursor: "pointer", color: "var(--lime-text)", display: "inline-flex" }}
            >
              <svg width="19" height="19" viewBox="0 0 18 18" fill={attachPr ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="9" cy="6.8" r="4.1" />
                <path d="M6.6 10.3 5.2 15.2l3.8-1.9 3.8 1.9-1.4-4.9" fill="none" />
              </svg>
            </button>
            <Btn small onClick={share} disabled={posting || (!text.trim() && !attachPr)}>{posting ? t("w.social.sharing") : t("w.social.share")}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SocialFeed({
  onNavigate,
  onOpenUser,
  onOpenPost,
}: {
  onNavigate?: (screen: string) => void;
  /** A person, on their own page (the shell's `user` screen). An avatar in the
   *  stream opens the whole human, not a peek at them. */
  onOpenUser?: OpenUser;
  /** Open a post on its OWN page (components/feed-post.tsx). Every post opens
   *  the same way — mine and everyone else's — because the post is what was
   *  shared and what carries the thread. The shell owns the screen switch, so
   *  it takes the key and the row we already loaded. */
  onOpenPost?: (key: string, item: FeedItemView) => void;
} = {}) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const units = useLoggerPrefs().units;
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("forYou");
  const [live, setLive] = useState<LiveAthlete[]>([]);

  const load = () =>
    jget<FeedResponse>("/api/social/feed").then((r) => {
      setFeed(r.feed ?? []);
      setLive(r.live ?? []);
    });
  useEffect(() => { load(); }, []);
  // Reconcile the shelf with the server on open, so the bookmarks in the rows
  // below are this ACCOUNT's, not just this browser's. Quiet no-op until
  // SavedPost is migrated (lib/feed-actions.ts).
  useEffect(() => { void syncSaved(); }, []);

  const cheer = async (item: FeedItem) => {
    // Optimistic: a kudos must never wait on the network to look given.
    setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: x.kudos + (x.kudosedByMe ? -1 : 1), kudosedByMe: !x.kudosedByMe } : x)) ?? f);
    const r = await jsend<KudosResponse>("/api/social/kudos", "POST", { subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: r.kudos ?? x.kudos, kudosedByMe: r.kudosedByMe ?? x.kudosedByMe } : x)) ?? f);
  };
  // What the ⋯ menu changed about an AUTHOR. A follow re-labels every card by
  // that person; a block takes them out of the stream entirely — the server
  // already made them invisible, so leaving their rows on screen until the next
  // load would be the one place the app disagreed with itself.
  const authorChanged = ({ authorId, relation, blocked }: { authorId: string; relation?: Relation; blocked?: boolean }) =>
    setFeed((f) => (blocked
      ? f?.filter((x) => x.author.id !== authorId) ?? f
      : f?.map((x) => (x.author.id === authorId ? { ...x, relation } : x)) ?? f));

  const del = async (item: FeedItem) => {
    if (!window.confirm(t("w.social.deletePostConfirm"))) return;
    await fetch(`/api/social/posts/${item.subjectId}`, { method: "DELETE" });
    load();
  };

  // "Following" is the honest exit: other people, newest first, nothing ranked.
  const items = useMemo(() => {
    if (!feed) return [];
    return tab === "following" ? feed.filter((i) => !i.mine).slice().sort((a, b) => b.at - a.at) : feed;
  }, [feed, tab]);

  if (!feed) return <EmptyState title={t("common.loading")} />;

  const tabBtn = (id: Tab, label: string) => (
    <button
      className="pressable"
      key={id}
      onClick={() => setTab(id)}
      aria-pressed={tab === id}
      style={{
        padding: "7px 13px",
        borderRadius: 999,
        border: `1px solid ${tab === id ? `color-mix(in srgb, ${C("chalk")} 25%, ${C("line")})` : C("line")}`,
        background: tab === id ? C("ink2") : "transparent",
        color: tab === id ? C("chalk") : C("ash"),
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        fontSize: fs.micro,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    // The screen names its own FACE, like every other screen root (aurora/*.tsx)
    // — belt and braces over the body-level default now set in globals.css,
    // which is what the feed had been falling through (into the platform UI
    // font) for its captions, comments and empty state.
    <div style={{ maxWidth: 600, fontFamily: "var(--font-display)", color: C("chalk") }}>
      {/* THE HEAD — the SHARED hub masthead (aurora/hub-masthead.tsx), the same
          component Dashboard and Performance render. Web had NO head here at
          all: `w.social.feedTitle` existed and only mobile rendered it, so one
          client titled this screen and the other simply did not. Mobile's
          subtitle ("What your friends are training", under a title that says
          Feed) is cut on both rather than copied over.
          THE META ROW IS EMPTY, ON PURPOSE — it still reserves its height, which
          is what keeps the title's y identical across the three tabs, but the
          feed has nothing true to put in it yet: the live count would restate
          the strip below, and FeedResponse carries no "new since you last
          looked". Tracked as `hub-feed-meta` in capabilities.ts. */}
      <HubMasthead title={t("w.social.feedTitle")} />

      {/* Verified-record witness requests addressed to ME. A person is waiting
          on this answer, so it outranks every piece of content below it — and
          every request is also an invite (core/attestation.ts). */}
      <CosignInbox units={units} />

      {/* Saved + people-search ride the tab row's right side as bare icons (the
          SectionHead idiom) — a full search bar would spend a row of the
          stream on a rare action. Saved sits FIRST because it is where the
          bookmark in every row below leads: the glyph that fills on a post is
          the same glyph that opens the shelf. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {tabBtn("forYou", t("feed.tab.forYou"))}
        {tabBtn("following", t("feed.tab.following"))}
        <button
          className="pressable"
          onClick={() => (onNavigate ? onNavigate("saved") : (window.location.href = "/app?s=saved"))}
          aria-label={t("w.social.savedTitle")}
          style={{ marginLeft: "auto", background: "none", border: "none", padding: 4, cursor: "pointer", color: C("ash"), display: "inline-flex" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <path d="M4.5 2.8h9v12.4l-4.5-3.4-4.5 3.4Z" />
          </svg>
        </button>
        <button
          className="pressable"
          onClick={() => (onNavigate ? onNavigate("discover") : (window.location.href = "/discover"))}
          aria-label={t("w.social.searchPeople")}
          style={{ background: "none", border: "none", padding: 4, cursor: "pointer", color: C("ash"), display: "inline-flex" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" />
            <path d="m12.4 12.4 3.4 3.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* NOW TRAINING — presence, not authored ephemera. Hides when empty. */}
      <FeedLiveStrip live={live} onOpen={(h) => onOpenUser?.(h)} />

      {/* The always-open composer — it draws its own top hairline and, at
          mobile widths, bleeds edge to edge with the stream rows below. */}
      <Composer onPosted={load} />

      {/* The stream boundary. The rows below are full-width timeline rows
          (feed-card.tsx), each closed by a hairline — the header hands over
          with the same line so the first post is bounded top. At mobile widths
          it bleeds with the rows so the line runs edge to edge. */}
      <div style={{ height: 1, background: C("line"), margin: isMobile ? "0 calc(-1 * var(--page-pad-x, 12px))" : 0 }} />

      {items.length === 0 ? (
        <EmptyState
          title={tab === "following" ? t("feed.followingEmpty") : t("w.social.feedQuietTitle")}
          sub={tab === "following" ? t("feed.followingEmptySub") : t("w.social.feedQuietSub")}
        />
      ) : (
        <>
          {items.map((item) => (
            <FeedCard
              key={item.id}
              item={item}
              units={units}
              onOpenProfile={(h) => onOpenUser?.(h, item.author)}
              onKudos={() => cheer(item)}
              onComments={() => setOpen(open === item.id ? null : item.id)}
              // EVERY post opens its own page — a workout, a record, a status
              // update alike. Opening COLLAPSES the row's inline thread: the
              // post carries the same thread, and two mounted copies would
              // fetch the same comments twice and then disagree the moment one
              // of them posted.
              onOpen={onOpenPost ? () => { setOpen(null); onOpenPost(feedSubjectKey(item), item); } : undefined}
              onDelete={item.subjectType === "post" && item.mine ? () => del(item) : undefined}
              onAuthorChanged={authorChanged}
            >
              {open === item.id && <Comments item={item} onCount={(n) => setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, comments: n } : x)) ?? f)} />}
            </FeedCard>
          ))}

          {/* The exit. The feed's job is to make you train, not to make you
              scroll — so the end of the stream is a door back to the bar. The
              last row's own hairline already closes the stream, so the marker
              is plain centered text — same as mobile. */}
          <div style={{ textAlign: "center", padding: "14px 0 8px" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: fs.nano, letterSpacing: tracking.caps, textTransform: "uppercase", color: C("ash") }}>{t("feed.caughtUp")}</div>
            <p style={{ fontSize: fs.caption, lineHeight: `${leading(fs.caption)}px`, color: C("ash"), margin: "6px 0 10px" }}>{t("feed.caughtUpSub")}</p>
            <Btn onClick={() => (onNavigate ? onNavigate("log") : (window.location.href = "/log"))}>{t("feed.goTrain")}</Btn>
          </div>
        </>
      )}
    </div>
  );
}
