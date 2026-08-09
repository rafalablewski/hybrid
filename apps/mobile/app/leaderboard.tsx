import { useEffect, useState } from "react";
import { View, Text, ScrollView, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { LEADERBOARD_METRICS, seedPerson, userPagePath, type LeaderboardMetric } from "@hybrid/core";
import { Loading, F, useScreenBottomPad, PressScale as Pressable } from "../lib/ui";
import { AuroraScreen, ACard, cardStack, AChip } from "../components/aurora/kit";
import { useTheme } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { getLeaderboard } from "../lib/social-api";
import { Avatar, Empty } from "../components/social-kit";
import { useNavScrollProps } from "../lib/nav-scroll";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function LeaderboardScreen() {
  const C = useTheme().palette;
  const { t } = useLang();
  const router = useRouter();
  const [metric, setMetric] = useState<LeaderboardMetric>("volume");
  const [board, setBoard] = useState<any[] | null>(null);

  useEffect(() => { setBoard(null); getLeaderboard(metric).then((r: any) => setBoard(r.board ?? [])); }, [metric]);
  const padBottom = useScreenBottomPad();
  const navScroll = useNavScrollProps();

  const renderRow = ({ item: r }: { item: any }) => (
    <Pressable onPress={() => { if (!r.isMe && r.handle) { seedPerson({ handle: r.handle, displayName: r.displayName, avatarUrl: r.avatarUrl }); router.push(userPagePath(r.handle)); } }} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: r.isMe ? C.ink2 : "transparent", borderRadius: 10, paddingHorizontal: 6 }}>
      <Text style={{ width: 28, textAlign: "center", fontFamily: F.bold, fontWeight: "800", color: r.rank <= 3 ? C.amber : C.ash, fontSize: r.rank <= 3 ? 18 : 14 }}>{MEDAL[r.rank - 1] ?? r.rank}</Text>
      <Avatar url={r.avatarUrl} name={r.displayName} handle={r.handle} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "600" }}>{r.isMe ? t("w.social.you") : r.displayName || `@${r.handle}`}</Text>
        <Text style={{ color: C.ash, fontSize: 12, fontFamily: F.mono }}>@{r.handle}</Text>
      </View>
      <Text style={{ fontFamily: F.mono, fontWeight: "700", color: r.value > 0 ? C.lime : C.ash }}>{r.label}</Text>
    </Pressable>
  );

  return (
    // scroll={false} → the ranked list is a virtualized FlatList (inside its Card,
    // which stays a plain View so nesting is fine); the title + metric pills are a
    // fixed header above it.
    <AuroraScreen scroll={false} hero={{ rank: "title", title: t("w.social.leaderboard"), meta: [t("w.social.leaderboardSub")] }}>
      <View style={{ paddingHorizontal: 18, paddingTop: 18 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
          {LEADERBOARD_METRICS.map((m) => <AChip key={m.key} label={m.label} selected={metric === m.key} onPress={() => setMetric(m.key as LeaderboardMetric)} />)}
        </ScrollView>
      </View>
      {!board ? <Loading /> : board.length <= 1 ? (
        <View style={{ paddingHorizontal: 18 }}>
          <Empty title={t("w.social.noFriends")} sub={t("w.social.noFriendsSub")} />
        </View>
      ) : (
        <ACard style={[cardStack, { flex: 1, marginHorizontal: 18, marginBottom: 12 }]}>
          <FlatList
            data={board}
            keyExtractor={(r) => String(r.id)}
            renderItem={renderRow}
            {...navScroll}
            showsVerticalScrollIndicator={false}
            initialNumToRender={12}
            windowSize={11}
            contentContainerStyle={{ paddingBottom: padBottom }}
          />
        </ACard>
      )}
    </AuroraScreen>
  );
}
