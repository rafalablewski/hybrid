import { useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useTheme } from "../../lib/theme";
import { F } from "../../lib/ui";
import { getFeed } from "../../lib/social-api";
import { Avatar } from "../social-kit";

// A compact activity-feed strip for the BOTTOM of the mobile Home — like the
// Instagram-Threads strip under the feed. Renders nothing when the feed is empty.
export default function FeedPreview({ onOpen }: { onOpen: () => void }) {
  const C = useTheme().palette;
  const [feed, setFeed] = useState<any[] | null>(null);
  useEffect(() => {
    let alive = true;
    getFeed().then((r: any) => { if (alive) setFeed((r.feed ?? []).slice(0, 4)); }).catch(() => { if (alive) setFeed([]); });
    return () => { alive = false; };
  }, []);

  if (!feed || feed.length === 0) return null;

  return (
    <View style={{ marginTop: 22 }}>
      <Pressable onPress={onOpen} style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 2, paddingBottom: 10 }}>
        <Text style={{ color: C.chalk, fontFamily: F.bold, fontWeight: "800", fontSize: 17 }}>Feed</Text>
        <Text style={{ color: C.lime, fontFamily: F.bold, fontWeight: "700", fontSize: 13 }}>View all →</Text>
      </Pressable>
      <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 24, overflow: "hidden" }}>
        {feed.map((it: any, i: number) => (
          <Pressable key={it.id} onPress={onOpen} style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}>
            <Avatar url={it.author?.avatarUrl} name={it.author?.displayName} handle={it.author?.handle} size={34} />
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ color: C.chalk, fontSize: 13.5, fontFamily: F.bold, fontWeight: "600" }}>{it.kind === "pr" ? "🏆 " : ""}{it.title}</Text>
              <Text numberOfLines={1} style={{ color: C.ash, fontSize: 12 }}>{it.detail}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: C.ash, fontFamily: F.mono, fontSize: 11 }}>{it.when}</Text>
              {it.kudos > 0 ? <Text style={{ color: C.ash, fontSize: 11, marginTop: 2 }}>👏 {it.kudos}</Text> : null}
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
