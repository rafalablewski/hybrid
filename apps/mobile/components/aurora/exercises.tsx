import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { exerciseHistory } from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F } from "../../lib/ui";
import { ABack, AuroraScreen, ACard, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });

/** AURORA Exercises — the movement PICKER. Every individual exercise opens the
 *  one canonical exercise page (/exercise?name=…, aurora/exercise-page.tsx);
 *  the inline dashboard this screen used to render was folded into that page. */
export default function AuroraExercises() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const [query, setQuery] = useState("");

  // Legacy deep links (/exercises?name=…) land on the canonical page.
  useEffect(() => {
    if (params.name) router.replace({ pathname: "/exercise", params: { name: params.name } });
  }, [params.name, router]);
  useRefreshOnFocus(refetch);

  const history = useMemo(() => exerciseHistory(sessions), [sessions]);
  const filtered = history.filter((e) => e.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={() => refetch()}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("w.analyze.ex.title")}</AHeading>
      </View>

      {history.length === 0 ? (
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, textAlign: "center", lineHeight: 19 }}>{t("w.analyze.ex.empty")}</Text>
        </ACard>
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, paddingHorizontal: 16 }}>
            <AuroraIcon name="search" size={20} color={C.ash} />
            <TextInput value={query} onChangeText={setQuery} placeholder={t("w.analyze.ex.search")} placeholderTextColor={C.ash} style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, paddingVertical: 14 }} />
          </View>

          <View style={{ marginTop: 10 }}>
            {filtered.map((e, i) => (
              <Pressable
                key={e.name}
                onPress={() => router.push({ pathname: "/exercise", params: { name: e.name } })}
                accessibilityRole="button"
                accessibilityLabel={e.name}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: C.line }}
              >
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{e.name}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 3 }}>{e.kind} – {e.count}× – {fmtDate(e.lastUsed)}</Text>
                </View>
                <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: txt(C, C.lime) }}>›</Text>
              </Pressable>
            ))}
            {filtered.length === 0 && (
              <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 14 }}>{t("w.analyze.ex.noMatch")}</Text>
            )}
          </View>
        </>
      )}
    </AuroraScreen>
  );
}
