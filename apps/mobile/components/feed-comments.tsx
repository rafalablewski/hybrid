import { useEffect, useRef, useState } from "react";
import { View, Text, TextInput } from "react-native";
import type { CommentView, FeedItemView } from "@hybrid/core";
import { F, fs, leading } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { getComments, postComment } from "../lib/social-api";
import { useConfirm } from "./aurora/confirm";
import { RADIUS, Avatar, APill } from "./aurora/kit";

/**
 * THE THREAD under a post (mobile).
 *
 * One component, every surface that shows one: the feed row expands it, the
 * Saved shelf expands it, and the post screen carries it under the workout. A
 * second copy would drift the moment either was touched, and two mounted copies
 * of the same thread fetch the same comments twice and then disagree the moment
 * one of them posts.
 *
 * `pr` and `session` are ONE subject at the reaction layer (the server folds
 * them, apps/web/lib/social.ts), so a comment written on the workout and one
 * written on the record card it used to have are in the same thread.
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
  const { notify } = useConfirm();
  const C = useTheme().palette;
  const { t } = useLang();
  const [list, setList] = useState<CommentView[]>([]);
  const [text, setText] = useState("");
  const box = useRef<TextInput>(null);
  useEffect(() => { if (focusSignal) box.current?.focus(); }, [focusSignal]);
  const load = () =>
    getComments(item.subjectType, item.subjectId).then((r) => {
      setList(r.comments ?? []);
      onCount?.((r.comments ?? []).length);
    });
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [item.subjectType, item.subjectId]);
  const send = async () => {
    if (!text.trim()) return;
    const r = await postComment({ subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id, body: text });
    if (r.error) { notify(t("common.error"), r.error); return; } // don't clear the box on a failed post
    setText(""); load();
  };
  return (
    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
      {list.map((c) => (
        <View key={c.id} style={{ flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <Avatar url={c.author?.avatarUrl} name={c.author?.displayName} handle={c.author?.handle} size={26} />
          <Text style={{ flex: 1, fontFamily: F.reg, fontSize: fs.body, lineHeight: leading(fs.body) }}>
            <Text style={{ fontFamily: F.semi, color: C.chalk }}>{c.author?.displayName || `@${c.author?.handle}`} </Text>
            <Text style={{ color: C.ash }}>{c.body}</Text>
          </Text>
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        <TextInput ref={box} value={text} onChangeText={setText} placeholder={t("w.social.commentPlaceholder")} placeholderTextColor={C.ash} style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontFamily: F.reg, fontSize: fs.body }} />
        <APill label={t("w.social.post")} size="compact" onPress={send} />
      </View>
    </View>
  );
}

export default Comments;
