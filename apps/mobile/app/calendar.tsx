import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter } from "expo-router";
import { sessionsByDay, monthMatrix, loadIntensity, sessionVolume, type LoggedSession } from "@hybrid/core";
import { fetchSessions } from "../lib/api";
import { Screen, Card, Kicker, Mono, F } from "../lib/ui";
import { useTheme } from "../lib/theme";
import { useTemplate } from "../lib/template";
import AuroraCalendar from "../components/aurora/calendar";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const todayKey = () => new Date().toISOString().slice(0, 10);

export default function CalendarScreen() {
  if (useTemplate().template === "aurora") return <AuroraCalendar />;
  return <ClassicCalendar />;
}

function ClassicCalendar() {
  const C = useTheme().palette;
  // themed inside the component so the month-nav buttons follow light/dark
  const nav = { width: 34, height: 34, borderRadius: 8, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink2, alignItems: "center" as const, justifyContent: "center" as const };
  const navTxt = { fontFamily: F.black, fontSize: 18, color: C.chalk };
  const router = useRouter();
  const now = new Date();
  const [sessions, setSessions] = useState<LoggedSession[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [selected, setSelected] = useState(todayKey());

  const load = () => { setRefreshing(true); fetchSessions().then(setSessions).finally(() => setRefreshing(false)); };
  useEffect(load, []);

  const byDay = useMemo(() => sessionsByDay(sessions), [sessions]);
  const intensity = useMemo(() => loadIntensity(byDay), [byDay]);
  const matrix = useMemo(() => monthMatrix(year, month), [year, month]);
  const label = new Date(Date.UTC(year, month, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = todayKey();

  const go = (d: number) => {
    const m = month + d;
    if (m < 0) { setMonth(11); setYear((y) => y - 1); }
    else if (m > 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth(m);
  };

  const selSessions = sessions.filter((s) => s.startedAt.slice(0, 10) === selected);

  return (
    <Screen refreshing={refreshing} onRefresh={load}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Kicker>Calendar</Kicker>
        <Text onPress={() => router.back()} style={{ fontFamily: F.mono, fontSize: 12, color: C.ash }}>← back</Text>
      </View>

      <Card style={{ marginTop: 10 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontFamily: F.black, fontSize: 18, color: C.chalk }}>{label}</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable onPress={() => go(-1)} style={nav}><Text style={navTxt}>‹</Text></Pressable>
            <Pressable onPress={() => go(1)} style={nav}><Text style={navTxt}>›</Text></Pressable>
          </View>
        </View>

        <View style={{ flexDirection: "row" }}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={{ flex: 1, textAlign: "center", fontFamily: F.mono, fontSize: 10, color: C.ash }}>{d}</Text>
          ))}
        </View>

        {matrix.map((week, wi) => (
          <View key={wi} style={{ flexDirection: "row", marginTop: 4 }}>
            {week.map((cell) => {
              const day = byDay[cell.date];
              const inten = intensity(cell.date);
              const isToday = cell.date === today;
              const isSel = cell.date === selected;
              return (
                <Pressable
                  key={cell.date}
                  onPress={() => setSelected(cell.date)}
                  style={{ flex: 1, aspectRatio: 1, margin: 2, borderRadius: 8, alignItems: "center", justifyContent: "center",
                    opacity: cell.inMonth ? 1 : 0.35,
                    borderWidth: 1, borderColor: isSel ? C.lime : isToday ? `${C.lime}66` : C.line,
                    backgroundColor: day ? `rgba(196,240,53,${0.1 + inten * 0.5})` : C.ink2 }}
                >
                  <Text style={{ fontFamily: F.mono, fontSize: 11, color: isToday ? C.lime : C.chalk }}>{Number(cell.date.slice(8, 10))}</Text>
                  {day ? <Text style={{ fontFamily: F.bold, fontSize: 9, color: "#0c0d0c", backgroundColor: C.lime, borderRadius: 3, paddingHorizontal: 3, marginTop: 1, overflow: "hidden" }}>{day.count}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </Card>

      <Kicker color={C.lime}>
        {new Date(`${selected}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
      </Kicker>
      {selSessions.length === 0 ? (
        <Mono style={{ marginTop: 8 }}>Nothing logged this day.</Mono>
      ) : (
        selSessions.map((s) => (
          <Card key={s.id}>
            <Text style={{ fontFamily: F.bold, fontSize: 15, color: C.chalk }}>{s.title}</Text>
            <Mono style={{ marginTop: 4, fontSize: 12 }}>{sessionVolume(s.blocks).toLocaleString()} kg · {s.blocks.length} blocks</Mono>
          </Card>
        ))
      )}
    </Screen>
  );
}
