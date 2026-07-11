import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { LEADERBOARD_METRICS, type LeaderboardMetric } from "@hybrid/core";
import { Screen, Card, Loading, F } from "../lib/ui";
import { ABack } from "../components/aurora/kit";
import { useTheme } from "../lib/theme";
import { getLeaderboard } from "../lib/social-api";
import { Avatar, Empty, ProfileModal, SPill } from "../components/social-kit";

const MEDAL = ["🥇", "🥈", "🥉"];

export default function LeaderboardScreen() {
  const C = useTheme().palette;
  const router = useRouter();
  const [metric, setMetric] = useState<LeaderboardMetric>("volume");
  const [board, setBoard] = useState<any[] | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);

  useEffect(() => { setBoard(null); getLeaderboard(metric).then((r: any) => setBoard(r.board ?? [])); }, [metric]);

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <ABack />
        <View><Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 24 }}>Leaderboard</Text><Text style={{ color: C.ash, fontSize: 13 }}>This week · your friends.</Text></View>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 16 }}>
        {LEADERBOARD_METRICS.map((m) => <SPill key={m.key} label={m.label} active={metric === m.key} onPress={() => setMetric(m.key as LeaderboardMetric)} />)}
      </ScrollView>
      {!board ? <Loading /> : board.length <= 1 ? (
        <Empty title="No friends yet" sub="Become friends (a mutual follow) to race the weekly leaderboard." />
      ) : (
        <Card>
          {board.map((r) => (
            <Pressable key={r.id} onPress={() => !r.isMe && setDrawer(r.handle)} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: r.isMe ? C.ink2 : "transparent", borderRadius: 10, paddingHorizontal: 6 }}>
              <Text style={{ width: 28, textAlign: "center", fontFamily: F.bold, fontWeight: "800", color: r.rank <= 3 ? C.amber : C.ash, fontSize: r.rank <= 3 ? 18 : 14 }}>{MEDAL[r.rank - 1] ?? r.rank}</Text>
              <Avatar url={r.avatarUrl} name={r.displayName} handle={r.handle} size={38} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "600" }}>{r.isMe ? "You" : r.displayName || `@${r.handle}`}</Text>
                <Text style={{ color: C.ash, fontSize: 12, fontFamily: F.mono }}>@{r.handle}</Text>
              </View>
              <Text style={{ fontFamily: F.mono, fontWeight: "700", color: r.value > 0 ? C.lime : C.ash }}>{r.label}</Text>
            </Pressable>
          ))}
        </Card>
      )}
      {drawer && <ProfileModal handle={drawer} onClose={() => setDrawer(null)} />}
    </Screen>
  );
}
