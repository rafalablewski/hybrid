import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import { useTheme, txt } from "../../lib/theme";
import { F } from "../../lib/ui";
import { getFeed } from "../../lib/social-api";
import { Avatar } from "../social-kit";

// STORIES RAIL — the Instagram-style row of circle avatars at the top of Home.
// Pulls the same /api/social/feed as FeedPreview and turns its distinct authors
// into "stories" (a lime ring = recent activity). Leads with "Your story" which
// opens the feed to post. No fabricated people — when the feed is empty it still
// shows your own story so the rail isn't a lonely placeholder, but never invents
// friends. Mirrors the web Stories (aurora/stories.tsx).

interface Author { displayName?: string | null; handle: string; avatarUrl?: string | null }

export default function Stories({ name, youLabel, onOpen }: { name?: string | null; youLabel: string; onOpen: () => void }) {
  const C = useTheme().palette;
  const [authors, setAuthors] = useState<Author[] | null>(null);
  useEffect(() => {
    let alive = true;
    getFeed()
      .then((r) => {
        if (!alive) return;
        const seen = new Set<string>();
        const list: Author[] = [];
        for (const it of (r.feed ?? [])) {
          const k = it.author?.handle;
          if (!k || seen.has(k)) continue;
          seen.add(k);
          list.push(it.author);
          if (list.length >= 12) break;
        }
        setAuthors(list);
      })
      .catch(() => { if (alive) setAuthors([]); });
    return () => { alive = false; };
  }, []);

  // Loading → a quiet skeleton row that reserves the rail's height.
  if (authors === null) {
    return (
      <View style={{ flexDirection: "row", gap: 14, marginTop: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={{ alignItems: "center", gap: 6 }}>
            <View style={{ width: 64, height: 64, borderRadius: 999, backgroundColor: C.line, opacity: 0.5 }} />
            <View style={{ width: 40, height: 8, borderRadius: 4, backgroundColor: C.line, opacity: 0.4 }} />
          </View>
        ))}
      </View>
    );
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14, paddingVertical: 2 }} style={{ marginTop: 16, marginHorizontal: -2 }}>
      {/* Your story — opens the feed to post */}
      <Pressable onPress={onOpen} style={{ width: 66, alignItems: "center", gap: 6 }}>
        <View style={{ width: 64, height: 64, borderRadius: 999, borderWidth: 2, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <Avatar name={name} size={54} />
          <View style={{ position: "absolute", bottom: -2, right: -2, width: 20, height: 20, borderRadius: 10, backgroundColor: C.lime, borderWidth: 2, borderColor: C.ink, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: F.black, fontSize: 13, color: txt(C, C.lime), lineHeight: 15 }}>+</Text>
          </View>
        </View>
        <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, maxWidth: 64 }}>{youLabel}</Text>
      </Pressable>
      {authors.map((a) => (
        <Pressable key={a.handle} onPress={onOpen} style={{ width: 66, alignItems: "center", gap: 6 }}>
          <View style={{ width: 64, height: 64, borderRadius: 999, borderWidth: 2, borderColor: C.lime, alignItems: "center", justifyContent: "center" }}>
            <Avatar url={a.avatarUrl} name={a.displayName} handle={a.handle} size={54} />
          </View>
          <Text numberOfLines={1} style={{ fontFamily: F.mono, fontSize: 10, color: C.ash, maxWidth: 64 }}>{a.displayName || `@${a.handle}`}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}
