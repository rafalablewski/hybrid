import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  exerciseBrowse,
  exerciseBrowseSections,
  exerciseBrowseSummary,
  type ExerciseBrowseEntry,
} from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { leading, fs, space, F, PressScale, FIXED_FONT_SCALE } from "../../lib/ui";
import { AuroraScreen, ACard, RADIUS, ASearch } from "./kit";
import { AuroraIcon } from "./icons";

type SortMode = "smart" | "groups" | "az";

/** AURORA Exercises — the movement PICKER, in the Aurora-pass design: Smart
 *  (decay-scored) / Groups / A–Z pills, the "This block" gradient band, and
 *  hybrid-bucket sections with Explore-style heads. Every row opens the one
 *  canonical exercise page (/exercise?name=…, aurora/exercise-page.tsx). All
 *  ordering/bucketing lives in @hybrid/core (exercise-browse) — shared with web. */
export default function AuroraExercises() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const params = useLocalSearchParams<{ name?: string }>();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SortMode>("smart");

  // Legacy deep links (/exercises?name=…) land on the canonical page.
  useEffect(() => {
    if (params.name) router.replace({ pathname: "/exercise", params: { name: params.name } });
  }, [params.name, router]);
  useRefreshOnFocus(refetch);

  const entries = useMemo(() => exerciseBrowse(sessions), [sessions]);
  const summary = useMemo(() => exerciseBrowseSummary(entries, sessions), [entries, sessions]);
  const q = query.trim().toLowerCase();
  const filtered = q ? entries.filter((e) => e.name.toLowerCase().includes(q)) : entries;
  const sections = useMemo(
    () => (mode === "az" || q ? null : exerciseBrowseSections(filtered, mode)),
    [filtered, mode, q],
  );
  const flat = useMemo(
    () => (mode === "az" ? [...filtered].sort((a, b) => a.name.localeCompare(b.name)) : filtered),
    [filtered, mode],
  );

  const days = (e: ExerciseBrowseEntry) =>
    e.daysSince === 0 ? t("w.analyze.ex.today") : t("w.analyze.ex.daysShort").replace("{n}", String(e.daysSince));

  const open = (name: string) => router.push({ pathname: "/exercise", params: { name } });

  const Row = ({ e, last }: { e: ExerciseBrowseEntry; last: boolean }) => (
    <PressScale
      onPress={() => open(e.name)}
      accessibilityRole="button"
      accessibilityLabel={e.name}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: F.black, fontSize: 13, letterSpacing: -0.3, color: e.staple ? txt(C, C.lime) : C.ash }}>{e.initials}</Text>
      </View>
      <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} numberOfLines={1} style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{e.name}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: e.stale ? C.accentText.amber : C.ash }}>{days(e)}</Text>
      <Text style={{ fontFamily: F.mono, fontSize: fs.subtitle, color: `${C.ash}8c` }}>›</Text>
    </PressScale>
  );

  const Card = ({ list }: { list: ExerciseBrowseEntry[] }) => (
    <View style={{ backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 }}>
      {list.map((e, i) => <Row key={e.name} e={e} last={i === list.length - 1} />)}
    </View>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={() => refetch()} hero={{ rank: "title", title: t("w.analyze.ex.title") }}>
      <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, marginTop: 4 }}>{t("w.analyze.ex.sub")}</Text>

      {entries.length === 0 ? (
        <ACard style={{ marginTop: 16, alignItems: "center", paddingVertical: 30 }}>
          <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, textAlign: "center", lineHeight: leading(fs.bodyLg, "snug") }}>{t("w.analyze.ex.empty")}</Text>
        </ACard>
      ) : (
        <>
          <View style={{ marginTop: 16 }}>
            <ASearch value={query} onChange={setQuery} placeholder={t("w.analyze.ex.search")} />
          </View>

          {/* SORT PILLS — Smart (decay order) / Groups (fixed buckets) / A–Z */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
            {([
              { id: "smart" as const, label: t("w.analyze.ex.sortSmart") },
              { id: "groups" as const, label: t("w.analyze.ex.sortGroups") },
              { id: "az" as const, label: t("w.analyze.ex.sortAz") },
            ]).map((p) => {
              const on = mode === p.id;
              return (
                <PressScale
                  key={p.id}
                  onPress={() => setMode(p.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: on ? C.lime : C.line, backgroundColor: on ? C.lime : "transparent" }}
                >
                  <Text style={{ fontFamily: on ? F.monoBold : F.mono, fontSize: 11, letterSpacing: 0.9, textTransform: "uppercase", color: on ? C.onAccent : C.ash }}>{p.label}</Text>
                </PressScale>
              );
            })}
          </View>

          {/* THIS BLOCK — the gradient band (Profile's cover wash + stat row). */}
          {summary.inRotation > 0 && (
            <View style={{ marginTop: 16, borderRadius: RADIUS.card, borderWidth: 1, borderColor: C.line, overflow: "hidden" }}>
              <LinearGradient colors={[`${C.violet}52`, `${C.lime}29`, C.ink2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
              <View pointerEvents="none" style={{ position: "absolute", top: -40, right: -28, width: 150, height: 150, borderRadius: 75, backgroundColor: C.lime, opacity: 0.16 }} />
              <View style={{ paddingHorizontal: 16, paddingVertical: 16 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 1.2, textTransform: "uppercase", color: C.ash }}>{t("w.analyze.ex.block")}</Text>
                <View style={{ flexDirection: "row", gap: 24, marginTop: 8 }}>
                  {[
                    { v: `${summary.inRotation}`, k: t("w.analyze.ex.inRotation") },
                    { v: `${summary.weekSessions}`, k: t("w.analyze.ex.weekSessions") },
                  ].map((s) => (
                    <View key={s.k} style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                      <Text style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.5, color: C.chalk }}>{s.v}</Text>
                      <Text style={{ fontFamily: F.mono, fontSize: fs.nano, letterSpacing: 0.9, textTransform: "uppercase", color: C.ash }}>{s.k}</Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          )}

          {sections ? (
            sections.map((sec) => (
              <View key={sec.bucket}>
                {/* Explore's SectionHead — 18px black title, mono count at the baseline. */}
                <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 24, marginBottom: 12, marginHorizontal: 2 }}>
                  <Text accessibilityRole="header" style={{ fontFamily: F.black, fontSize: 18, letterSpacing: -0.3, color: C.chalk }}>{t(sec.labelKey)}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 11, letterSpacing: 0.9, color: C.ash }}>{sec.entries.length}</Text>
                </View>
                <Card list={sec.entries} />
              </View>
            ))
          ) : (
            <View style={{ marginTop: 16 }}>
              {flat.length > 0 && <Card list={flat} />}
            </View>
          )}
          {filtered.length === 0 && (
            <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, paddingVertical: 16 }}>{t("w.analyze.ex.noMatch")}</Text>
          )}
        </>
      )}
    </AuroraScreen>
  );
}
