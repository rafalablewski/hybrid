"use client";

import { useEffect, useMemo, useState } from "react";
import { fs, leading, tracking } from "@hybrid/core";
import type { FeedItemView, CommentView, CommentsResponse, FeedResponse, KudosResponse, LiveAthlete, MutationResult } from "@hybrid/core";
import { C, useSocialTheme, card, Avatar, Btn, EmptyState, jget, jsend } from "./social-ui";
import { ProfileDrawer } from "./social-profile";
import { CosignInbox } from "./pr-attestation";
import FeedCard from "./feed-card";
import FeedWorkoutSheet from "./feed-workout";
import FeedLiveStrip from "./feed-live-strip";
import { HubMasthead } from "./aurora/hub-masthead";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs } from "@/lib/logger-prefs";
import { useIsMobile } from "@/lib/use-media-query";

/**
 * CONNECT — the feed (web). Twin of apps/mobile/components/feed-view.tsx; both
 * render the shared card model from core (feed-card.ts), so a card can never
 * look like one product on one client and another on the other.
 *
 * The screen's order is the spec's (reference/feed-spec.html, D2):
 *   co-sign inbox (someone is waiting on an answer) → feed tabs → the quiet
 *   composer → the stream → the caught-up marker, which hands the athlete back
 *   to the bar rather than to more scrolling.
 *
 * FOR YOU vs FOLLOWING: the ranked feed only earns trust while an unranked exit
 * exists. "Following" is strictly chronological and strictly other people —
 * no ranking, no interleaving, no own posts.
 */

type FeedItem = FeedItemView;
type Tab = "forYou" | "following";

function Comments({ item, onCount }: { item: FeedItem; onCount: (n: number) => void }) {
  const { t } = useLang();
  const [list, setList] = useState<CommentView[] | null>(null);
  const [text, setText] = useState("");
  const load = () => jget<CommentsResponse>(`/api/social/comments?subjectType=${item.subjectType}&subjectId=${item.subjectId}`).then((r) => setList(r.comments ?? []));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const send = async () => {
    if (!text.trim()) return;
    const posted = await jsend<MutationResult>("/api/social/comments", "POST", { subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id, body: text });
    if (posted.error) { alert(posted.error); return; } // don't clear the box on a failed post
    setText("");
    const r = await jget<CommentsResponse>(`/api/social/comments?subjectType=${item.subjectType}&subjectId=${item.subjectId}`);
    setList(r.comments ?? []);
    onCount((r.comments ?? []).length);
  };
  return (
    <div style={{ marginTop: 10, borderTop: `1px solid ${C("line")}`, paddingTop: 10 }}>
      {(list ?? []).map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Avatar url={c.author?.avatarUrl} name={c.author?.displayName} handle={c.author?.handle} size={26} />
          <div style={{ fontSize: fs.body, lineHeight: `${leading(fs.body)}px` }}>
            <span style={{ color: C("chalk"), fontWeight: 600 }}>{c.author?.displayName || `@${c.author?.handle}`} </span>
            <span style={{ color: C("ash") }}>{c.body}</span>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
        {/* Named explicitly, like the composer's textarea beside it. */}
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("w.social.commentPlaceholder")} style={{ flex: 1, padding: "8px 10px", borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.body }} />
        <Btn small onClick={send}>{t("w.social.post")}</Btn>
      </div>
    </div>
  );
}

/** The composer, deliberately underweighted: in this product the workout is the
 *  post, so the blank page is a one-line invitation until it's wanted. */
function Composer({ onPosted }: { onPosted: () => void }) {
  const { t } = useLang();
  const { aurora } = useSocialTheme();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [attachPr, setAttachPr] = useState(false);
  const [posting, setPosting] = useState(false);

  const share = async () => {
    if (!text.trim() && !attachPr) return;
    setPosting(true);
    const r = await jsend<MutationResult>("/api/social/posts", "POST", { text, attachPr });
    setPosting(false);
    if (r.error) { alert(r.error); return; }
    setText(""); setAttachPr(false); setOpen(false); onPosted();
  };

  if (!open) {
    return (
      <button
        className="pressable"
        onClick={() => setOpen(true)}
        style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 16px", marginBottom: 10, borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("ash"), fontFamily: "var(--font-display)", fontSize: fs.body, cursor: "pointer", textAlign: "left" }}
      >
        {t("w.social.sharePlaceholder")}
      </button>
    );
  }
  return (
    <div style={card(aurora, { marginBottom: 10 })}>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t("w.social.sharePlaceholder")} style={{ width: "100%", minHeight: 48, resize: "vertical", border: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.note, outline: "none" }} />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, gap: 12 }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, color: attachPr ? "var(--lime-text)" : C("ash"), fontSize: fs.body, cursor: "pointer" }}>
          <input type="checkbox" checked={attachPr} onChange={(e) => setAttachPr(e.target.checked)} /> {t("w.social.attachPr")}
        </label>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn small ghost onClick={() => { setOpen(false); setText(""); setAttachPr(false); }}>{t("common.cancel")}</Btn>
          <Btn small onClick={share} disabled={posting || (!text.trim() && !attachPr)}>{posting ? t("w.social.sharing") : t("w.social.share")}</Btn>
        </div>
      </div>
    </div>
  );
}

export default function SocialFeed({
  onNavigate,
  onOpenSession,
}: {
  onNavigate?: (screen: string) => void;
  /** Open one of MY OWN sessions in History's full detail (Wrapped, PRs, the
   *  edit/archive row). The visitor's sheet is the right read of someone
   *  else's workout, and the wrong one of your own — on your own session you
   *  own actions the sheet deliberately doesn't carry. Absent (a caller with
   *  no shell to switch) falls back to the sheet. */
  onOpenSession?: (id: string) => void;
} = {}) {
  const { t } = useLang();
  const isMobile = useIsMobile();
  const units = useLoggerPrefs().units;
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  // The POST, opened — the whole workout behind a card. Held by id (not by the
  // item) so the sheet keeps reading the live row: a kudos given from the feed
  // while the sheet is up still shows there.
  const [opened, setOpened] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("forYou");
  const [live, setLive] = useState<LiveAthlete[]>([]);

  const load = () =>
    jget<FeedResponse>("/api/social/feed").then((r) => {
      setFeed(r.feed ?? []);
      setLive(r.live ?? []);
    });
  useEffect(() => { load(); }, []);

  const cheer = async (item: FeedItem) => {
    // Optimistic: a kudos must never wait on the network to look given.
    setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: x.kudos + (x.kudosedByMe ? -1 : 1), kudosedByMe: !x.kudosedByMe } : x)) ?? f);
    const r = await jsend<KudosResponse>("/api/social/kudos", "POST", { subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: r.kudos ?? x.kudos, kudosedByMe: r.kudosedByMe ?? x.kudosedByMe } : x)) ?? f);
  };
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

      {/* People-search rides the tab row's right side as a bare icon (the
          SectionHead idiom) — a full search bar would spend a row of the
          stream on a rare action. */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
        {tabBtn("forYou", t("feed.tab.forYou"))}
        {tabBtn("following", t("feed.tab.following"))}
        <button
          className="pressable"
          onClick={() => (onNavigate ? onNavigate("discover") : (window.location.href = "/discover"))}
          aria-label={t("w.social.searchPeople")}
          style={{ marginLeft: "auto", background: "none", border: "none", padding: 4, cursor: "pointer", color: C("ash"), display: "inline-flex" }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" />
            <path d="m12.4 12.4 3.4 3.4" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* NOW TRAINING — presence, not authored ephemera. Hides when empty. */}
      <FeedLiveStrip live={live} onOpen={(h) => setDrawer(h)} />

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
              onOpenProfile={(h) => setDrawer(h)}
              onKudos={() => cheer(item)}
              onComments={() => setOpen(open === item.id ? null : item.id)}
              // Session and PR cards are both anchored on a Session id, so both
              // open to the workout. A status post has no workout behind it.
              // MY OWN session opens MY view of it — the full detail with the
              // Wrapped, the PRs and the manage row — not the visitor's read.
              // Otherwise the sheet, and opening COLLAPSES the row's inline
              // thread: the sheet carries the same thread, and two mounted
              // copies would fetch the same comments twice and then disagree
              // the moment one posted.
              onOpen={
                item.subjectType === "session" || item.subjectType === "pr"
                  ? item.mine && onOpenSession
                    ? () => onOpenSession(item.subjectId)
                    : () => { setOpen(null); setOpened(item.id); }
                  : undefined
              }
              onDelete={item.subjectType === "post" && item.mine ? () => del(item) : undefined}
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

      {/* THE POST, OPENED — the whole workout behind the row, with its thread
          underneath (the same Comments component the row expands, so a comment
          written here and one written in the stream are one thing). */}
      {(() => {
        const it = opened ? items.find((i) => i.id === opened) ?? null : null;
        return (
          <FeedWorkoutSheet item={it} units={units} open={!!it} onClose={() => setOpened(null)}>
            {it && <Comments item={it} onCount={(n) => setFeed((f) => f?.map((x) => (x.id === it.id ? { ...x, comments: n } : x)) ?? f)} />}
          </FeedWorkoutSheet>
        );
      })()}

      {drawer && <ProfileDrawer handle={drawer} onClose={() => { setDrawer(null); load(); }} />}
    </div>
  );
}
