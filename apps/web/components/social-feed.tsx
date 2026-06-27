"use client";

import { useEffect, useState } from "react";
import { C, useSocialTheme, card, Avatar, Btn, EmptyState, ScreenHead, jget, jsend } from "./social-ui";
import { ProfileDrawer } from "./social-profile";

interface FeedItem {
  id: string; kind: string; subjectType: string; subjectId: string;
  author: { id: string; handle: string; displayName: string | null; avatarUrl: string | null };
  title: string; detail: string; when: string; accent: string;
  kudos: number; comments: number; kudosedByMe: boolean; mine: boolean;
}

function Comments({ item, onCount }: { item: FeedItem; onCount: (n: number) => void }) {
  const [list, setList] = useState<any[] | null>(null);
  const [text, setText] = useState("");
  const load = () => jget(`/api/social/comments?subjectType=${item.subjectType}&subjectId=${item.subjectId}`).then((r: any) => setList(r.comments ?? []));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const send = async () => {
    if (!text.trim()) return;
    await jsend("/api/social/comments", "POST", { subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id, body: text });
    setText("");
    const r: any = await jget(`/api/social/comments?subjectType=${item.subjectType}&subjectId=${item.subjectId}`);
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
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Add a comment…" style={{ flex: 1, padding: "8px 10px", borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontSize: 13 }} />
        <Btn small onClick={send}>Post</Btn>
      </div>
    </div>
  );
}

export default function SocialFeed() {
  const { aurora } = useSocialTheme();
  const [feed, setFeed] = useState<FeedItem[] | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [attachPr, setAttachPr] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = () => jget("/api/social/feed").then((r: any) => setFeed(r.feed ?? []));
  useEffect(() => { load(); }, []);

  const cheer = async (item: FeedItem) => {
    const r: any = await jsend("/api/social/kudos", "POST", { subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: r.kudos, kudosedByMe: r.kudosedByMe } : x)) ?? f);
  };
  const share = async () => {
    if (!text.trim() && !attachPr) return;
    setPosting(true);
    const r: any = await jsend("/api/social/posts", "POST", { text, attachPr });
    setPosting(false);
    if (r.error) { alert(r.error); return; }
    setText(""); setAttachPr(false); load();
  };
  const del = async (item: FeedItem) => {
    if (!window.confirm("Delete this post?")) return;
    await fetch(`/api/social/posts/${item.subjectId}`, { method: "DELETE" });
    load();
  };

  if (!feed) return <EmptyState title="Loading…" />;

  return (
    <div style={{ maxWidth: 600 }}>
      <ScreenHead title="Feed" sub="What your friends are training." />

      {/* COMPOSER — share a status or your latest PR card with your followers. */}
      <div style={card(aurora, { marginBottom: 16 })}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Share an update with your followers…" style={{ width: "100%", minHeight: 56, resize: "vertical", border: "none", background: "transparent", color: C("chalk"), fontFamily: "var(--font-display)", fontSize: 15, outline: "none" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, color: attachPr ? "var(--lime-text)" : C("ash"), fontSize: 13, cursor: "pointer" }}>
            <input type="checkbox" checked={attachPr} onChange={(e) => setAttachPr(e.target.checked)} /> 🏆 Attach my latest PR
          </label>
          <Btn small onClick={share} disabled={posting || (!text.trim() && !attachPr)}>{posting ? "Sharing…" : "Share"}</Btn>
        </div>
      </div>

      {feed.length === 0 ? (
        <EmptyState title="Your feed is quiet" sub="Follow some friends on the Find friends tab — their workouts and PRs show up here." />
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
                <button onClick={() => del(item)} aria-label="Delete post" style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontSize: 18, lineHeight: 1 }}>×</button>
              )}
            </div>
            <p style={{ color: C("chalk"), fontSize: 14, margin: "10px 0 0", lineHeight: 1.5 }}>{item.detail}</p>
            <div style={{ display: "flex", gap: 16, marginTop: 12, alignItems: "center" }}>
              <button onClick={() => cheer(item)} style={{ background: "none", border: "none", cursor: "pointer", color: item.kudosedByMe ? C("lime") : C("ash"), fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13, display: "flex", alignItems: "center", gap: 5 }}>
                {item.kudosedByMe ? "👏" : "👏"} {item.kudos > 0 ? item.kudos : ""} Cheer
              </button>
              <button onClick={() => setOpen(open === item.id ? null : item.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C("ash"), fontFamily: "var(--font-display)", fontWeight: 600, fontSize: 13 }}>
                💬 {item.comments > 0 ? item.comments : ""} Comment
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
