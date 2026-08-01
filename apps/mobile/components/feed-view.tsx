import { useCallback, useEffect, useState, type ReactNode } from "react";
import { View, Text, Pressable, TextInput, Alert, FlatList, RefreshControl } from "react-native";
import { Screen, Card, Loading, F, useScreenBottomPad } from "../lib/ui";
import { ABack } from "./aurora/kit";
import { useTheme } from "../lib/theme";
import { useLang } from "../lib/i18n";
import type { FeedItemView, CommentView } from "@hybrid/core";
import { getFeed, toggleKudos, getComments, postComment, createPost, deletePost } from "../lib/social-api";
import { Avatar, Empty, ProfileModal, SButton } from "./social-kit";
import { CosignInbox } from "./pr-attestation";
import { useLoggerPrefs } from "../lib/logger-prefs";
import { useNavScrollProps } from "../lib/nav-scroll";

function Comments({ item }: { item: FeedItemView }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const [list, setList] = useState<CommentView[]>([]);
  const [text, setText] = useState("");
  const load = () => getComments(item.subjectType, item.subjectId).then((r) => setList(r.comments ?? []));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const send = async () => {
    if (!text.trim()) return;
    const r = await postComment({ subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id, body: text });
    if (r.error) { Alert.alert(t("common.error"), r.error); return; } // don't clear the box on a failed post
    setText(""); load();
  };
  return (
    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10 }}>
      {list.map((c) => (
        <View key={c.id} style={{ flexDirection: "row", gap: 8, marginBottom: 8, alignItems: "center" }}>
          <Avatar url={c.author?.avatarUrl} name={c.author?.displayName} handle={c.author?.handle} size={26} />
          <Text style={{ flex: 1, fontSize: 13 }}><Text style={{ color: C.chalk, fontWeight: "600" }}>{c.author?.displayName || `@${c.author?.handle}`} </Text><Text style={{ color: C.ash }}>{c.body}</Text></Text>
        </View>
      ))}
      <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
        <TextInput value={text} onChangeText={setText} placeholder={t("w.social.commentPlaceholder")} placeholderTextColor={C.ash} style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: 13 }} />
        <SButton label={t("w.social.post")} small onPress={send} />
      </View>
    </View>
  );
}

export default function FeedView({ top }: { top?: ReactNode }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const units = useLoggerPrefs().units;
  const [feed, setFeed] = useState<FeedItemView[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [text, setText] = useState("");
  const [attachPr, setAttachPr] = useState(false);
  const [posting, setPosting] = useState(false);

  const load = useCallback(() => getFeed().then((r) => setFeed(r.feed ?? [])), []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const cheer = async (item: FeedItemView) => {
    const r = await toggleKudos({ subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: r.kudos, kudosedByMe: r.kudosedByMe } : x)) ?? f);
  };
  const share = async () => {
    if (!text.trim() && !attachPr) return;
    setPosting(true);
    const r = await createPost({ text, attachPr });
    setPosting(false);
    if (r.error) { Alert.alert(t("common.error"), r.error); return; }
    setText(""); setAttachPr(false); load();
  };
  const del = async (item: FeedItemView) => { await deletePost(item.subjectId); load(); };
  const padBottom = useScreenBottomPad();
  const navScroll = useNavScrollProps();

  const header = (
    <>
      {top}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16, marginTop: top ? 16 : 0 }}>
        {!top && <ABack />}
        <View>
          <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 24 }}>{t("w.social.feedTitle")}</Text>
          <Text style={{ color: C.ash, fontSize: 13 }}>{t("w.social.feedSub")}</Text>
        </View>
      </View>

      {/* Verified-record witness requests addressed to ME — answering one is a
          social act, so the inbox lives on the feed. See core/attestation.ts. */}
      <CosignInbox units={units} />

      {/* COMPOSER — share a status or your latest PR card. */}
      <Card>
        <TextInput value={text} onChangeText={setText} multiline maxLength={500} placeholder={t("w.social.sharePlaceholder")} placeholderTextColor={C.ash} style={{ minHeight: 48, color: C.chalk, fontSize: 15, fontFamily: F.reg }} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
          <Pressable onPress={() => setAttachPr((v) => !v)}><Text style={{ color: attachPr ? C.lime : C.ash, fontSize: 13, fontFamily: F.bold }}>{attachPr ? "☑" : "☐"} 🏆 {t("w.social.attachPr")}</Text></Pressable>
          <SButton label={posting ? t("w.social.sharing") : t("w.social.share")} small onPress={share} disabled={posting || (!text.trim() && !attachPr)} />
        </View>
      </Card>
    </>
  );

  const renderItem = ({ item }: { item: FeedItemView }) => (
    <Card>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Pressable onPress={() => setDrawer(item.author.handle)}><Avatar url={item.author.avatarUrl} name={item.author.displayName} handle={item.author.handle} size={42} /></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700" }}>{item.kind === "pr" ? "🏆 " : ""}{item.title}</Text>
          <Text style={{ color: C.ash, fontSize: 12, fontFamily: F.mono }}>{item.when}</Text>
        </View>
        {item.subjectType === "post" && item.mine && (
          <Pressable onPress={() => del(item)} hitSlop={8}><Text style={{ color: C.ash, fontSize: 18 }}>×</Text></Pressable>
        )}
      </View>
      {item.body ? <Text style={{ color: C.chalk, fontSize: 14, marginTop: 10, lineHeight: 21 }}>{item.body}</Text> : null}
      {(item.lead || (item.chips?.length ?? 0) > 0) && (
        <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 14, padding: 12, marginTop: 10 }}>
          {item.lead ? <Text style={{ fontFamily: F.mono, fontSize: 12, fontWeight: "600", color: C.chalk }}>{item.lead}</Text> : null}
          {(item.chips?.length ?? 0) > 0 && (
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: item.lead ? 8 : 0 }}>
              {item.chips.map((c: string, i: number) => (
                <Text key={i} style={{ fontFamily: F.mono, fontSize: 11, color: C.ash, borderWidth: 1, borderColor: C.line, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>{c}</Text>
              ))}
            </View>
          )}
        </View>
      )}
      <View style={{ flexDirection: "row", gap: 18, marginTop: 12 }}>
        <Pressable onPress={() => cheer(item)}><Text style={{ color: item.kudosedByMe ? C.lime : C.ash, fontFamily: F.bold, fontWeight: "600", fontSize: 13 }}>👏 {item.kudos > 0 ? item.kudos : ""} {t("w.social.cheer")}</Text></Pressable>
        <Pressable onPress={() => setOpen(open === item.id ? null : item.id)}><Text style={{ color: C.ash, fontFamily: F.bold, fontWeight: "600", fontSize: 13 }}>💬 {item.comments > 0 ? item.comments : ""} {t("w.social.comment")}</Text></Pressable>
      </View>
      {open === item.id && <Comments item={item} />}
    </Card>
  );

  return (
    // scroll={false} → the FlatList is the sole scroller (virtualized); Screen
    // still provides the SafeArea + backdrop + keyboard avoidance chrome.
    <Screen scroll={false}>
      <FlatList
        data={feed ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        ListEmptyComponent={feed === null ? <Loading /> : <Empty title={t("w.social.feedQuietTitle")} sub={t("w.social.feedQuietSub")} />}
        {...navScroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={6}
        windowSize={11}
        contentContainerStyle={{ padding: top ? 16 : 18, paddingBottom: padBottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.lime} colors={[C.lime]} />}
      />
      {drawer && <ProfileModal handle={drawer} onClose={() => { setDrawer(null); load(); }} />}
    </Screen>
  );
}
