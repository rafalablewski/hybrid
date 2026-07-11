import { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { Screen, Card, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import type { PersonCard } from "@hybrid/core";
import { searchPeople, getSuggestions, follow, unfollow } from "../lib/social-api";
import { Avatar, Empty, ProfileModal, SButton } from "../components/social-kit";

function Row({ p, onChanged, onOpen }: { p: PersonCard; onChanged: () => void; onOpen: (h: string) => void }) {
  const C = useTheme().palette;
  const rel: string = p.relation ?? "none";
  const following = rel === "following" || rel === "friend" || rel === "close";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Pressable onPress={() => onOpen(p.handle)} style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
        <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "600" }}>{p.displayName || `@${p.handle}`}{p.coachVerified ? <Text style={{ color: txt(C, C.lime) }}> ✓</Text> : null}</Text>
          <Text style={{ color: C.ash, fontSize: 12, fontFamily: F.mono }}>@{p.handle}{p.reason ? ` · ${p.reason}` : p.isCoach ? " · coach" : ""}</Text>
        </View>
      </Pressable>
      {rel !== "self" && (rel === "requested"
        ? <SButton label="Requested" ghost small disabled />
        : following
          ? <SButton label={rel === "friend" || rel === "close" ? "Friends ✓" : "Following"} ghost small onPress={async () => { await unfollow({ followeeId: p.userId }); onChanged(); }} />
          : <SButton label={rel === "follower" ? "Follow back" : "Follow"} small onPress={async () => { await follow({ followeeId: p.userId }); onChanged(); }} />)}
    </View>
  );
}

export default function DiscoverScreen() {
  const C = useTheme().palette;
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonCard[] | null>(null);
  const [sugg, setSugg] = useState<PersonCard[]>([]);
  const [drawer, setDrawer] = useState<string | null>(null);

  const loadSugg = () => getSuggestions().then((r) => setSugg(r.suggestions ?? []));
  useEffect(() => { loadSugg(); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const id = setTimeout(() => searchPeople(q).then((r) => setResults(r.results ?? [])), 250);
    return () => clearTimeout(id);
  }, [q]);
  const refresh = () => { if (q.trim().length >= 2) searchPeople(q).then((r) => setResults(r.results ?? [])); loadSugg(); };

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}><Text style={{ color: C.chalk, fontSize: 18 }}>‹</Text></Pressable>
        <View><Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 24 }}>Find friends</Text><Text style={{ color: C.ash, fontSize: 13 }}>Search by @handle or name.</Text></View>
      </View>
      <TextInput value={q} onChangeText={setQ} placeholder="Search people…" placeholderTextColor={C.ash} autoFocus style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, color: C.chalk, fontSize: 15, marginBottom: 16 }} />
      {results !== null ? (
        <Card>{results.length === 0 ? <Empty title="No one found" /> : results.map((p) => <Row key={p.userId} p={p} onChanged={refresh} onOpen={setDrawer} />)}</Card>
      ) : (
        <>
          <Text style={{ color: C.ash, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>People you may know</Text>
          <Card>{sugg.length === 0 ? <Empty title="No suggestions yet" sub="Train with a coach or follow a few people and we'll suggest others." /> : sugg.map((p) => <Row key={p.userId} p={p} onChanged={refresh} onOpen={setDrawer} />)}</Card>
        </>
      )}
      {drawer && <ProfileModal handle={drawer} onClose={() => { setDrawer(null); refresh(); }} />}
    </Screen>
  );
}
