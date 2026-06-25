import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Card, Loading, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { getFeed, toggleKudos, getComments, postComment } from "../lib/social-api";
import { Avatar, Empty, ProfileModal, SButton } from "../components/social-kit";

function Comments({ item }: { item: any }) {
  const C = useTheme().palette;
  const [list, setList] = useState<any[]>([]);
  const [text, setText] = useState("");
  const load = () => getComments(item.subjectType, item.subjectId).then((r: any) => setList(r.comments ?? []));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);
  const send = async () => {
    if (!text.trim()) return;
    await postComment({ subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id, body: text });
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
        <TextInput value={text} onChangeText={setText} placeholder="Add a comment…" placeholderTextColor={C.ash} style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: 13 }} />
        <SButton label="Post" small onPress={send} />
      </View>
    </View>
  );
}

export default function FeedScreen() {
  const C = useTheme().palette;
  const router = useRouter();
  const [feed, setFeed] = useState<any[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => getFeed().then((r: any) => setFeed(r.feed ?? [])), []);
  useEffect(() => { load(); }, [load]);
  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const cheer = async (item: any) => {
    const r: any = await toggleKudos({ subjectType: item.subjectType, subjectId: item.subjectId, ownerId: item.author.id });
    setFeed((f) => f?.map((x) => (x.id === item.id ? { ...x, kudos: r.kudos, kudosedByMe: r.kudosedByMe } : x)) ?? f);
  };

  return (
    <Screen refreshing={refreshing} onRefresh={onRefresh}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.chalk, fontSize: 18 }}>‹</Text></Pressable>
        <View>
          <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 24 }}>Feed</Text>
          <Text style={{ color: C.ash, fontSize: 13 }}>What your friends are training.</Text>
        </View>
      </View>

      {!feed ? <Loading /> : feed.length === 0 ? (
        <Empty title="Your feed is quiet" sub="Follow friends from Find friends — their workouts and PRs show up here." />
      ) : feed.map((item) => (
        <Card key={item.id}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Pressable onPress={() => setDrawer(item.author.handle)}><Avatar url={item.author.avatarUrl} name={item.author.displayName} handle={item.author.handle} size={42} /></Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "700" }}>{item.kind === "pr" ? "🏆 " : ""}{item.title}</Text>
              <Text style={{ color: C.ash, fontSize: 12, fontFamily: F.mono }}>{item.when}</Text>
            </View>
          </View>
          <Text style={{ color: C.chalk, fontSize: 14, marginTop: 10, lineHeight: 21 }}>{item.detail}</Text>
          <View style={{ flexDirection: "row", gap: 18, marginTop: 12 }}>
            <Pressable onPress={() => cheer(item)}><Text style={{ color: item.kudosedByMe ? C.lime : C.ash, fontFamily: F.bold, fontWeight: "600", fontSize: 13 }}>👏 {item.kudos > 0 ? item.kudos : ""} Cheer</Text></Pressable>
            <Pressable onPress={() => setOpen(open === item.id ? null : item.id)}><Text style={{ color: C.ash, fontFamily: F.bold, fontWeight: "600", fontSize: 13 }}>💬 {item.comments > 0 ? item.comments : ""} Comment</Text></Pressable>
          </View>
          {open === item.id && <Comments item={item} />}
        </Card>
      ))}

      {drawer && <ProfileModal handle={drawer} onClose={() => { setDrawer(null); load(); }} />}
    </Screen>
  );
}
