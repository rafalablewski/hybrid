import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { sessionsByDay, monthMatrix, loadIntensity, sessionVolume } from "@hybrid/core";
import { useSessionsQuery } from "../../lib/queries";
import { fetchEvents, fetchAssignments, updateAssignment, type EventRow, type Assignment } from "../../lib/api";
import { useRefreshOnFocus } from "../../lib/query";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, F, FIXED_FONT_SCALE } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, RADIUS } from "./kit";
import { AuroraIcon } from "./icons";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const todayKey = () => new Date().toISOString().slice(0, 10);

/** AURORA Calendar — month heat-grid + selected-day sessions, reusing the exact
 *  calendar engine (sessionsByDay / monthMatrix / loadIntensity). */
export default function AuroraCalendar() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const now = new Date();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [selected, setSelected] = useState(todayKey());
  const [events, setEvents] = useState<EventRow[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);

  const loadAssignments = () => fetchAssignments().then((a) => setAssignments(a.map((x) => ({ ...x, date: x.date.slice(0, 10) }))));
  const load = () => refetch();
  useRefreshOnFocus(refetch);
  useEffect(() => {
    fetchEvents().then((e) => setEvents(e.map((x) => ({ ...x, date: x.date.slice(0, 10) }))));
    loadAssignments();
  }, []);
  const markDone = async (id: string) => { await updateAssignment(id, "completed"); loadAssignments(); };

  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  const intensity = useMemo(() => loadIntensity(byDay), [byDay]);
  const matrix = useMemo(() => monthMatrix(year, month), [year, month]);
  const eventsByDay = useMemo(() => { const m: Record<string, EventRow[]> = {}; for (const e of events) (m[e.date] ??= []).push(e); return m; }, [events]);
  const assignmentsByDay = useMemo(() => { const m: Record<string, Assignment[]> = {}; for (const a of assignments) (m[a.date] ??= []).push(a); return m; }, [assignments]);
  const label = new Date(Date.UTC(year, month, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = todayKey();
  const go = (d: number) => { const m = month + d; if (m < 0) { setMonth(11); setYear((y) => y - 1); } else if (m > 11) { setMonth(0); setYear((y) => y + 1); } else setMonth(m); };
  const selSessions = sessions.filter((s) => s.startedAt.slice(0, 10) === selected);
  const selEvents = eventsByDay[selected] ?? [];
  const selAssignments = assignmentsByDay[selected] ?? [];
  const navBtn = { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink, alignItems: "center" as const, justifyContent: "center" as const };

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
        <Pressable accessibilityRole="button" accessibilityLabel={t("common.back")} onPress={() => router.back()} style={{ width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: C.line, alignItems: "center", justifyContent: "center" }}>
          <AuroraIcon name="back" size={20} color={C.chalk} />
        </Pressable>
        <AHeading style={{ fontSize: fs.display }}>{t("nav.calendar")}</AHeading>
        <View style={{ marginLeft: "auto" }}><AuroraIcon name="calendar" size={24} color={txt(C, C.lime)} /></View>
      </View>

      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{label}</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("common.previousMonth")} onPress={() => go(-1)} style={navBtn}><AuroraIcon name="back" size={18} color={C.chalk} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t("common.nextMonth")} onPress={() => go(1)} style={navBtn}><AuroraIcon name="back" size={18} color={C.chalk} style={{ transform: [{ rotate: "180deg" }] }} /></Pressable>
          </View>
        </View>
        <View style={{ flexDirection: "row" }}>
          {WEEKDAYS.map((d, i) => <Text key={i} style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{d}</Text>)}
        </View>
        {matrix.map((week, wi) => (
          <View key={wi} style={{ flexDirection: "row", marginTop: 4 }}>
            {week.map((cell) => {
              const day = byDay[cell.date];
              const inten = intensity(cell.date);
              const isToday = cell.date === today;
              const isSel = cell.date === selected;
              const asg = assignmentsByDay[cell.date];
              const ev = eventsByDay[cell.date];
              return (
                <Pressable key={cell.date} onPress={() => setSelected(cell.date)} style={{ flex: 1, aspectRatio: 1, margin: 2, borderRadius: 12, alignItems: "center", justifyContent: "center", opacity: cell.inMonth ? 1 : 0.35, borderWidth: 1, borderColor: isSel ? C.lime : isToday ? `${C.lime}66` : C.line, backgroundColor: day ? `${C.lime}${Math.round(Math.min(1, 0.1 + inten * 0.5) * 255).toString(16).padStart(2, "0")}` : C.ink }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: isToday ? txt(C, C.lime) : C.chalk }}>{Number(cell.date.slice(8, 10))}</Text>
                  {(asg || ev) ? (
                    <View style={{ flexDirection: "row", gap: 2, marginTop: 1 }}>
                      {asg ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.violet }} /> : null}
                      {ev ? <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: C.amber }} /> : null}
                    </View>
                  ) : null}
                  {day ? <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: 9, color: C.onAccent, backgroundColor: C.lime, borderRadius: 4, paddingHorizontal: 3, marginTop: 1 }}>{day.count}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10 }}>
          {t("w.analyze.cal.legendPre")} <Text style={{ color: C.violet }}>●</Text> {t("w.analyze.cal.legendAssigned")} <Text style={{ color: C.amber }}>●</Text> {t("w.analyze.cal.legendEvent")}
        </Text>
      </ACard>

      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime), marginTop: 8, marginBottom: 8 }}>
        {new Date(`${selected}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
      </Text>

      {selEvents.map((e) => (
        <ACard key={e.id} style={{ marginBottom: 12 }}>
          <View style={{ alignSelf: "flex-start", backgroundColor: `${C.amber}24`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.amber) }}>{t("w.analyze.cal.event")}</Text>
          </View>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk, marginTop: 6 }}>{e.name}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 2 }}>{e.sport}</Text>
        </ACard>
      ))}
      {selAssignments.map((a) => (
        <ACard key={a.id} style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <View style={{ alignSelf: "flex-start", backgroundColor: `${C.violet}24`, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.violet) }}>{t("w.analyze.cal.assigned")}</Text>
              </View>
              <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk, marginTop: 6 }}>{a.name}</Text>
            </View>
            {a.status === "completed" ? (
              <View style={{ backgroundColor: `${C.lime}24`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{t("w.analyze.cal.done")}</Text>
              </View>
            ) : (
              <Pressable onPress={() => markDone(a.id)} style={{ borderWidth: 1, borderColor: `${C.lime}66`, backgroundColor: `${C.lime}24`, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, fontWeight: "700", textTransform: "uppercase", color: txt(C, C.lime) }}>{t("w.analyze.cal.markDone")}</Text>
              </Pressable>
            )}
          </View>
        </ACard>
      ))}

      {selSessions.length === 0 && selEvents.length === 0 && selAssignments.length === 0 ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash }}>{t("w.analyze.cal.nothing")}</Text>
      ) : selSessions.map((s) => (
        <ACard key={s.id} style={{ marginBottom: 12 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{s.title}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>{sessionVolume(s.blocks).toLocaleString()} kg · {s.blocks.length} {t("w.analyze.cal.blocks")}</Text>
        </ACard>
      ))}
    </AuroraScreen>
  );
}
