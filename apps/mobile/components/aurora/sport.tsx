import { useCallback, useMemo, useState } from "react";
import { View, Text, TextInput } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ago, searchSports, sportIndex, sportIndexMeta, type LoggedSession, type SportIndexEntry } from "@hybrid/core";
import { fetchSessions } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, fs, space, F, PressScale as Pressable , tracking} from "../../lib/ui";
import { AuroraScreen, RADIUS, AMarkTile } from "./kit";
import { useListMotion } from "../../lib/list-motion";

/**
 * AURORA Sport — the INDEX.
 *
 * This screen used to BE the sport experience: a chip picker over one shared
 * body, so a sport was a filter rather than a place. Now every sport has its own
 * page (sport-page.tsx) and this is the list that pushes into it — the sports
 * the athlete actually trains first, then the ones the app can prescribe
 * strength for, with the rest of the catalog behind the search field so all 65
 * have an address without 65 rows on one screen.
 */
export default function AuroraSport() {
  // Survivors of a filter MOVE to their new positions; only arrivals fade.
  const refilter = useListMotion();
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [query, setQuery] = useState("");

  useFocusEffect(
    useCallback(() => {
      let active = true;
      fetchSessions().then((d) => { if (active) setSessions(d); }).catch(() => {});
      return () => { active = false; };
    }, []),
  );

  const { yours, prescribable } = useMemo(() => sportIndex(sessions), [sessions]);
  const results = useMemo(() => (query.trim() ? searchSports(query) : []), [query]);

  const open = (name: string) => router.push({ pathname: "/sport-page", params: { name } });
  const mono = (size: number, color = C.ash) => ({ fontFamily: F.mono, fontSize: size, color });

  const Row = ({ e, last, showTransfer = true }: { e: SportIndexEntry; last: boolean; showTransfer?: boolean }) => (
    <Pressable
      onPress={() => open(e.name)}
      accessibilityRole="button"
      accessibilityLabel={t("w.train.sportPage.openSport").replace("{sport}", e.name)}
      style={{
        flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md,
        borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line,
      }}
    >
      {/* The sport's catalogue glyph in the kit's SQUARE tile — the same 40dp
          box the exercise lists wear, because a sport is a thing you did, not a
          person. It drew bare here, which left the one list of activities in the
          app looking unlike every list of lifts. */}
      <AMarkTile><Text style={{ fontSize: fs.subtitle }}>{e.icon}</Text></AMarkTile>
      <View style={{ flex: 1 }}>
        <Text style={{ fontFamily: F.bold, fontSize: fs.bodyLg, color: C.chalk }}>{e.name}</Text>
        <Text style={{ ...mono(fs.micro), marginTop: 3 }}>
          {e.efforts > 0
            ? `${t("w.train.sportPage.effortsMeta").replace("{n}", String(e.efforts))}${e.lastAt ? ` – ${ago(e.lastAt)}` : ""}`
            : sportIndexMeta(e)}
        </Text>
      </View>
      {e.hasTransfer && showTransfer && (
        <Text style={{ ...mono(fs.nano, txt(C, C.lime)), textTransform: "uppercase", letterSpacing: tracking.label }}>{t("w.train.sportPage.transfer")}</Text>
      )}
      <Text style={mono(fs.body)}>→</Text>
    </Pressable>
  );

  const Group = ({ title, meta, list, showTransfer = true }: { title: string; meta?: string; list: SportIndexEntry[]; showTransfer?: boolean }) =>
    list.length === 0 ? null : (
      <View style={{ marginTop: space.xxl }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md, marginBottom: space.xs }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{title}</Text>
          {!!meta && <Text style={{ ...mono(fs.micro), textTransform: "uppercase", letterSpacing: tracking.caps }}>{meta}</Text>}
        </View>
        {list.map((e, i) => <Row key={e.name} e={e} last={i === list.length - 1} showTransfer={showTransfer} />)}
      </View>
    );

  return (
    <AuroraScreen hero={{ rank: "title", title: t("w.train.sport.title") }}>
      <Text style={{ ...mono(fs.body), marginTop: 4, lineHeight: leading(fs.body) }}>{t("w.train.sportPage.indexIntro")}</Text>

      <TextInput
        value={query}
        onChangeText={(v) => refilter(() => setQuery(v))}
        placeholder={t("w.train.sportPage.searchSports")}
        placeholderTextColor={C.ash}
        accessibilityLabel={t("w.train.sportPage.searchSports")}
        style={{
          marginTop: space.lg, fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk,
          backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field,
          paddingHorizontal: 16, paddingVertical: 12,
        }}
      />

      {query.trim() ? (
        results.length === 0 ? (
          <Text style={{ ...mono(fs.body), marginTop: space.xxl }}>{t("w.train.sportPage.noMatch")}</Text>
        ) : (
          <Group title={t("w.train.sport.title")} meta={String(results.length)} list={results} />
        )
      ) : (
        <>
          <Group title={t("w.train.sportPage.yourSports")} meta={yours.length ? String(yours.length) : undefined} list={yours} />
          {/* every row in this group has a pool — the tag would be noise. */}
          <Group title={t("w.train.sportPage.wePrescribe")} list={prescribable} showTransfer={false} />
        </>
      )}
    </AuroraScreen>
  );
}
