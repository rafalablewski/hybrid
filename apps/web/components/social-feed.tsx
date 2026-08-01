"use client";

import { useEffect, useState } from "react";
import type { FeedItemView, CommentView, CommentsResponse, FeedResponse, KudosResponse, MutationResult } from "@hybrid/core";
import { C, useSocialTheme, card, Avatar, Btn, EmptyState, ScreenHead, jget, jsend } from "./social-ui";
import { ProfileDrawer } from "./social-profile";
import { CosignInbox } from "./pr-attestation";
import { useLang } from "@/lib/i18n";
import { useLoggerPrefs } from "@/lib/logger-prefs";

type FeedItem = FeedItemView;

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
    <div style={{ marginTop: 12, borderTop: `1px solid ${C("line")}`, paddingTop: 10 }}>
      {(list ?? []).map((c) => (
        <div key={c.id} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <Avatar url={c.author?.avatarUrl} name={c.author?.displayName} handle={c.author?.handle} size={26} />
          <div style={{ fontSize: 13 }}>
            <span style={{ color: C("chalk"), fontWeight: 600 }}>{c.author?.displayName || `@${c.author?.handle}`} </span>
            <span style={{ color: C("ash") }}>{c.body}</span>
          </div>
        </div>
      ))}
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("w.social.commentPlaceholder")} style={{ flex: 1, padding: "8px 10px", borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontSize: 13 }} />
        <Btn small onClick={send}>{t("w.social.post")}</Btn>
      </div>
    </div>
  );
}

export default function SocialFeed() {
  const { t } = useLang();
  const { aurora } = useSocialTheme();
  const units = useLoggerPrefs().units;
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [attachPr, setAttachPr] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = () => jget<FeedResponse>("/api/social/feed").then((r) => setFeed(r.feed ?? []));
  useEffect(() => { load(); }, []);

  const cheer = async (item: FeedItem) => {
    const r = await jsend<KudosResponse>("/api/social/kudos", "POST", { subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: r.kudos, kudosedByMe: r.kudosedByMe } : x)) ?? f);
  };
  const share = async () => {
    if (!text.trim() && !attachPr) return;
    setPosting(true);
    const r = await jsend<MutationResult>("/api/social/posts", "POST", { text, attachPr });
    setPosting(false);
    if (r.error) { alert(r.error); return; }
    setText(""); setAttachPr(false); load();
  };
  const del = async (item: FeedItem) => {
    if (!window.confirm(t("w.social.deletePostConfirm"))) return;
    await fetch(`/api/social/posts/${item.subjectId}`, { method: "DELETE" });
    load();
  };

  if (!feed) return <EmptyState title={t("common.loading")} />;

  return (
    <div style={{ maxWidth: 600 }}>
      <ScreenHead title={t("w.social.feedTitle")} sub={t("w.social.feedSub")} />

      {/* Verified-record witness requests addressed to ME — answering one is a
          social act, so the inbox lives on the feed. See core/attestation.ts. */}
      <CosignInbox units={units} />

      {/* COMPOSER — share a status or your latest PR card with your followers. */}
      <div style={card(aurora, { marginBottom: 16 })}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t("w.social.sharePlaceholder")} style={{ width: "100%", minHeight: 56, resize: "vertical", border: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: 15, outline: "none" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: attachPr ? "var(--lime-text)" : C("ash"), fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={attachPr} onChange={(e) => setAttachPr(e.target.checked)} /> 🏆 {t("w.social.attachPr")}
          </label>
          <Btn small onClick={share} disabled={posting || (!text.trim() && !attachPr)}>{posting ? t("w.social.sharing") : t("w.social.share")}</Btn>
        </div>
      </div>

      {feed.length === 0 ? (
        <EmptyState title={t("w.social.feedQuietTitle")} sub={t("w.social.feedQuietSub")} />
      ) : (
        feed.map((item) => (
          <div key={item.id} style={card(aurora, { marginBottom: 14 })}>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button onClick={() => setDrawer(item.author.handle)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <Avatar url={item.author.avatarUrl} name={item.author.displayName} handle={item.author.handle} size={42} />
              </button>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: C("chalk"), fontFamily: "var(--font-display)", fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  {item.kind === "pr" && <span style={{ color: C("amber") }}>🏆</span>}
                  {item.title}
                </div>
                <div style={{ color: C("ash"), fontSize: 12, fontFamily: "var(--font-mono)" }}>{item.when}</div>
              </div>
              {item.subjectType === "post" && item.mine && (
                <button onClick={() => del(item)} aria-label={t("w.social.deletePostAria")} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontSize: 18, lineHeight: 1 }}>×</button>
              )}
            </div>
            {item.body && <p style={{ color: C("chalk"), fontSize: 14, margin: "10px 0 0", lineHeight: 1.5 }}>{item.body}</p>}
            {(item.lead || item.chips.length > 0) && (
              <div style={{ border: `1px solid ${C("line")}`, borderRadius: 14, padding: "11px 13px", marginTop: 10 }}>
                {item.lead && <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: C("chalk") }}>{item.lead}</div>}
                {item.chips.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: item.lead ? 8 : 0 }}>
                    {item.chips.map((c, i) => <span key={i} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: C("ash"), border: `1px solid ${C("line")}`, borderRadius: 999, padding: "3px 9px" }}>{c}</span>)}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center" }}>
              <button onClick={() => cheer(item)} style={{ background: "none", border: "none", cursor: "pointer", color: item.kudosedByMe ? C("lime") : C("ash"), fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
                {item.kudosedByMe ? "👏" : "👏"} {item.kudos > 0 ? item.kudos : ""} {t("w.social.cheer")}
              </button>
              <button onClick={() => setOpen(open === item.id ? null : item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13 }}>
                💬 {item.comments > 0 ? item.comments : ""} {t("w.social.comment")}
              </button>
            </div>
            {open === item.id && <Comments item={item} onCount={(n) => setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, comments: n } : x)) ?? f)} />}
          </div>
        ))
      )}
      {drawer && <ProfileDrawer handle={drawer} onClose={() => { setDrawer(null); load(); }} />}
    </div>
  );
}
