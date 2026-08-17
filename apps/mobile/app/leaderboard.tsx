import { useEffect, useState } from "react";
import { View, Text, ScrollView, FlatList } from "react-native";
import { useRouter } from "expo-router";
import { LEADERBOARD_METRICS, seedPerson, userPagePath, type LeaderboardMetric } from "@hybrid/core";
import { fs, LoadSwap, F, useScreenBottomPad, PressScale as Pressable } from "../lib/ui";
import { AuroraScreen, ACard, cardStack, AChip, Avatar, Empty } from "../components/aurora/kit";
import { useTheme } from "../lib/theme";
import { useLang } from "../lib/i18n";
import { getLeaderboard } from "../lib/social-api";
import { useNavScrollProps } from "../lib/nav-scroll";
import { usePersonSource } from "../lib/shared-element";
import { Glyph } from "../components/aurora/icons";

/** The podium's three inks. ONE drawn medal, three colours — which is how a
 *  medal actually works, and what the 🥇🥈🥉 triple was standing in for. */
const MEDAL_INK = ["#d4af37", "#b9bcc0", "#b3814f"] as const;

export default function LeaderboardScreen() {
  // The face travels into the page this opens — see lib/shared-element.
  const armPerson = usePersonSource();
  const C = useTheme().palette;
  const { t } = useLang();
  const router = useRouter();
  const [metric, setMetric] = useState<LeaderboardMetric>("volume");
  const [board, setBoard] = useState<any[] | null>(null);

  useEffect(() => { setBoard(null); getLeaderboard(metric).then((r: any) => setBoard(r.board ?? [])); }, [metric]);
  const padBottom = useScreenBottomPad();
  const navScroll = useNavScrollProps();

  const renderRow = ({ item: r }: { item: any }) => (
    <Pressable onPress={() => { if (!r.isMe && r.handle) { armPerson(r.handle); seedPerson({ handle: r.handle, displayName: r.displayName, avatarUrl: r.avatarUrl }); router.push(userPagePath(r.handle)); } }} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.line, backgroundColor: r.isMe ? C.ink2 : "transparent", borderRadius: 10, paddingHorizontal: 6 }}>
      <View style={{ width: 28, alignItems: "center", justifyContent: "center" }}>
        {r.rank <= 3
          ? <Glyph name="medal" size={22} color={MEDAL_INK[r.rank - 1]!} />
          : <Text style={{ fontFamily: F.bold, color: C.ash, fontSize: 14 }}>{r.rank}</Text>}
      </View>
      <Avatar url={r.avatarUrl} name={r.displayName} handle={r.handle} size={38} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.chalk, fontFamily: F.bold }}>{r.isMe ? t("w.social.you") : r.displayName || `@${r.handle}`}</Text>
        <Text style={{ color: C.ash, fontSize: fs.caption, fontFamily: F.mono }}>@{r.handle}</Text>
      </View>
      <Text style={{ fontFamily: F.monoBold, color: r.value > 0 ? C.lime : C.ash }}>{r.label}</Text>
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
      {/* The board's flex:1 has to survive the hand-over, or the list loses its
          height while the placeholder fades — so the swap carries it. */}
      <LoadSwap loading={!board} fill style={{ flex: 1 }}>
        {() => !board ? null : board.length <= 1 ? (
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
      </LoadSwap>
    </AuroraScreen>
  );
}
