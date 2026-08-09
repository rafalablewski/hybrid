"use client";

import { useEffect, useRef, useState } from "react";
import { fs, leading, type CommentsResponse, type CommentView, type FeedItemView, type MutationResult } from "@hybrid/core";
import { useLang } from "@/lib/i18n";
import { C, Avatar, Btn, jget, jsend } from "./social-ui";

/**
 * THE THREAD under a post — one component, every surface that shows one.
 *
 * The feed row expands it, the Saved shelf expands it, and the individual post
 * screen carries it under the workout. A second copy would drift the moment
 * either was touched, and worse: two mounted copies of the same thread fetch
 * the same comments twice and then disagree the moment one of them posts.
 *
 * `pr` and `session` are ONE subject at the reaction layer (apps/web/lib/
 * social.ts), so a comment written on the workout and one written on the record
 * card it used to have are in the same thread.
 */
export function Comments({
  item,
  onCount,
  focusSignal,
}: {
  item: FeedItemView;
  onCount?: (n: number) => void;
  /** Bump this to put the cursor in the box. The post screen's comment button
   *  has nothing to expand — the thread is already open under the workout — so
   *  it hands the reader the one thing they came for: the box. */
  focusSignal?: number;
}) {
  const { t } = useLang();
  const [list, setList] = useState<CommentView[] | null>(null);
  const [text, setText] = useState("");
  const box = useRef<HTMLInputElement>(null);
  useEffect(() => { if (focusSignal) box.current?.focus(); }, [focusSignal]);
  const load = () =>
    jget<CommentsResponse>(`/api/social/comments?subjectType=${item.subjectType}&subjectId=${item.subjectId}`).then((r) => setList(r.comments ?? []));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [item.subjectType, item.subjectId]);
  const send = async () => {
    if (!text.trim()) return;
    const posted = await jsend<MutationResult>("/api/social/comments", "POST", { subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id, body: text });
    if (posted.error) { alert(posted.error); return; } // don't clear the box on a failed post
    setText("");
    const r = await jget<CommentsResponse>(`/api/social/comments?subjectType=${item.subjectType}&subjectId=${item.subjectId}`);
    setList(r.comments ?? []);
    onCount?.((r.comments ?? []).length);
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
        <input ref={box} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={t("w.social.commentPlaceholder")} style={{ flex: 1, padding: "8px 10px", borderRadius: 999, border: `1px solid ${C("line")}`, background: C("ink2"), color: C("chalk"), fontFamily: "var(--font-display)", fontSize: fs.body }} />
        <Btn small onClick={send}>{t("w.social.post")}</Btn>
      </div>
    </div>
  );
}

export default Comments;
