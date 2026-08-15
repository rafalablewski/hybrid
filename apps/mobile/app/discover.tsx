import { useEffect, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useRouter } from "expo-router";
import { F, PressScale as Pressable , tracking} from "../lib/ui";
import { AuroraScreen, ACard, cardStack, ASearch } from "../components/aurora/kit";
import { useTheme, txt } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { seedPerson, userPagePath, type PersonCard } from "@hybrid/core";
import { searchPeople, getSuggestions, follow, unfollow } from "../lib/social-api";
import { Avatar, Empty, SButton } from "../components/social-kit";
import { usePersonSource } from "../lib/shared-element";
import { useListMotion } from "../lib/list-motion";

function Row({ p, onChanged, onOpen }: { p: PersonCard; onChanged: () => void; onOpen: (h: string, card?: PersonCard) => void }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const rel: string = p.relation ?? "none";
  const following = rel === "following" || rel === "friend" || rel === "close";
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Pressable onPress={() => onOpen(p.handle, p)} style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
        <Avatar url={p.avatarUrl} name={p.displayName} handle={p.handle} size={42} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.chalk, fontFamily: F.bold }}>{p.displayName || `@${p.handle}`}{p.coachVerified ? <Text style={{ color: txt(C, C.lime) }}> ✓</Text> : null}</Text>
          <Text style={{ color: C.ash, fontSize: 12, fontFamily: F.mono }}>@{p.handle}{p.reason ? ` – ${p.reason}` : p.isCoach ? ` – ${t("w.social.reasonCoach")}` : ""}</Text>
        </View>
      </Pressable>
      {rel !== "self" && (rel === "requested"
        ? <SButton label={t("w.social.requested")} ghost small disabled />
        : following
          ? <SButton label={rel === "friend" || rel === "close" ? `${t("w.social.friends")} ✓` : t("w.social.following")} ghost small onPress={async () => { await unfollow({ followeeId: p.userId }); onChanged(); }} />
          : <SButton label={rel === "follower" ? t("w.social.followBack") : t("w.social.follow")} small onPress={async () => { await follow({ followeeId: p.userId }); onChanged(); }} />)}
    </View>
  );
}

export default function DiscoverScreen() {
  // Survivors of a filter MOVE to their new positions; only arrivals fade.
  const refilter = useListMotion();
  // The face travels into the page this opens — see lib/shared-element.
  const armPerson = usePersonSource();
  const C = useTheme().palette;
  const { t } = useLang();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PersonCard[] | null>(null);
  const [sugg, setSugg] = useState<PersonCard[]>([]);

  const loadSugg = () => getSuggestions().then((r) => setSugg(r.suggestions ?? []));
  useEffect(() => { loadSugg(); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setResults(null); return; }
    const id = setTimeout(() => searchPeople(q).then((r) => setResults(r.results ?? [])), 250);
    return () => clearTimeout(id);
  }, [q]);
  const refresh = () => { if (q.trim().length >= 2) searchPeople(q).then((r) => setResults(r.results ?? [])); loadSugg(); };

  return (
    <AuroraScreen hero={{ rank: "title", title: t("w.social.findFriends"), meta: [t("w.social.findFriendsSub")] }}>
      <ASearch value={q} onChange={(v: string) => refilter(() => setQ(v))} placeholder={t("w.social.searchPeople")} autoFocus />
      {results !== null ? (
        <ACard style={cardStack}>{results.length === 0 ? <Empty title={t("w.social.noOneFound")} sub={t("w.social.noOneFoundSub")} /> : results.map((p) => <Row key={p.userId} p={p} onChanged={refresh} onOpen={(h, c) => { if (h) { armPerson(h); if (c) seedPerson(c); router.push(userPagePath(h)); } }} />)}</ACard>
      ) : (
        <>
          <Text style={{ color: C.ash, fontSize: 12, textTransform: "uppercase", letterSpacing: tracking.label, marginBottom: 8 }}>{t("w.social.peopleYouMayKnow")}</Text>
          <ACard style={cardStack}>{sugg.length === 0 ? <Empty title={t("w.social.noSuggestions")} sub={t("w.social.noSuggestionsSub")} /> : sugg.map((p) => <Row key={p.userId} p={p} onChanged={refresh} onOpen={(h, c) => { if (h) { armPerson(h); if (c) seedPerson(c); router.push(userPagePath(h)); } }} />)}</ACard>
        </>
      )}
    </AuroraScreen>
  );
}
