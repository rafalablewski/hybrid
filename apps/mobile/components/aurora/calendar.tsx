import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { sessionsByDay, monthMatrix, loadIntensity, sessionVolume, localDayKey, localTodayKey, SHARED_ELEMENTS , ALPHA} from "@hybrid/core";
import { useSharedSurfaceSource, useSharedSurfaceTarget } from "../../lib/shared-element";
import { useSessionsQuery } from "../../lib/queries";
import { useBodyweightLookup } from "../../lib/use-bodyweight";
import { useRefreshOnFocus } from "../../lib/query";
import { fetchAssignments, updateAssignment, type Assignment } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { useTheme, txt } from "../../lib/theme";
import { fs, space, tracking, F, FIXED_FONT_SCALE, PressScale as Pressable } from "../../lib/ui";
import { AuroraScreen, ACard, AHeading, withAlpha , RADIUS} from "./kit";
import { AuroraIcon } from "./icons";

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];
const todayKey = localTodayKey;

/** AURORA Calendar — month heat-grid + selected-day detail. Layers the athlete's
 *  sessions (lime heat) with coach
 *  assignments (blue dots + mark-done) — parity with the web calendar, reusing
 *  the shared engine (sessionsByDay / monthMatrix / loadIntensity) and the same
 *  /api/assignments endpoint. */
export default function AuroraCalendar() {
  const { palette: C } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  const now = new Date();
  const { data: sessions = [], isFetching: refreshing, refetch } = useSessionsQuery();
  const [year, setYear] = useState(now.getUTCFullYear());
  const [month, setMonth] = useState(now.getUTCMonth());
  const [selected, setSelected] = useState(todayKey());
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  // The calendarDay pair: the tapped CELL is the source frame and the detail
  // section below the grid is the destination — both on this one screen, so
  // the "navigation" is the `selected` swap. Each cell registers its node here;
  // the detail section remounts per selection (key={selected}) so the target
  // hook claims a fresh flight every time (a claim is once-per-mount).
  const cellRefs = useRef<Record<string, View | null>>({});
  const armDay = useSharedSurfaceSource();

  // Coach/self layers — fetched with the Supabase bearer token via lib/api (both
  // helpers swallow errors → []). Normalize the date to YYYY-MM-DD so it keys the
  // day-grid, mirroring the web calendar.
  const loadAssignments = () => fetchAssignments().then((rows) => setAssignments(rows.map((a) => ({ ...a, date: a.date.slice(0, 10) }))));
  const load = () => { refetch(); loadAssignments(); };
  useEffect(() => { loadAssignments(); }, []);
  useRefreshOnFocus(refetch);
  const markDone = async (id: string) => { await updateAssignment(id, "completed"); loadAssignments(); };

  const bw = useBodyweightLookup();
  const byDay = useMemo(() => sessionsByDay(sessions, bw), [sessions, bw]);
  const intensity = useMemo(() => loadIntensity(byDay), [byDay]);
  const matrix = useMemo(() => monthMatrix(year, month), [year, month]);
  const assignmentsByDay = useMemo(() => { const m: Record<string, Assignment[]> = {}; for (const a of assignments) (m[a.date] ??= []).push(a); return m; }, [assignments]);
  const label = new Date(Date.UTC(year, month, 1)).toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  const today = todayKey();
  const go = (d: number) => { const m = month + d; if (m < 0) { setMonth(11); setYear((y) => y - 1); } else if (m > 11) { setMonth(0); setYear((y) => y + 1); } else setMonth(m); };
  const jumpToday = () => { setYear(now.getUTCFullYear()); setMonth(now.getUTCMonth()); setSelected(today); };
  const selSessions = sessions.filter((s) => localDayKey(s.startedAt) === selected);
  const selAssignments = assignmentsByDay[selected] ?? [];
  const navBtn = { minWidth: 40, height: 40, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.ink, alignItems: "center" as const, justifyContent: "center" as const };

  const chip = (color: string, labelText: string) => (
    <View style={{ backgroundColor: withAlpha(color, ALPHA.solid), borderRadius: RADIUS.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: "flex-start" }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, color) }}>{labelText}</Text>
    </View>
  );

  return (
    <AuroraScreen refreshing={refreshing} onRefresh={load} hero={{ rank: "title", title: t("nav.calendar") }}>

      <ACard style={{ marginTop: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{label}</Text>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <Pressable accessibilityRole="button" accessibilityLabel={t("common.previousMonth")} onPress={() => go(-1)} style={navBtn}><AuroraIcon name="back" size={18} color={C.chalk} /></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={t("w.analyze.cal.today")} onPress={jumpToday} style={navBtn}><Text style={{ fontFamily: F.bold, fontSize: fs.caption, color: C.chalk }}>{t("w.analyze.cal.today")}</Text></Pressable>
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
              const asg = assignmentsByDay[cell.date];
              const inten = intensity(cell.date);
              const isToday = cell.date === today;
              const isSel = cell.date === selected;
              // withAlpha, not a hand-built byte: it clamps to [0,1] itself, so
              // the Math.min went with the concatenation.
              const cellBg = day ? withAlpha(C.lime, 0.1 + inten * 0.5) : C.ink;
              return (
                <Pressable key={cell.date} ref={(r: View | null) => { cellRefs.current[cell.date] = r; }} onPress={() => {
                  if (cell.date !== selected) {
                    // The clone the overlay flies is the cell's own face —
                    // frozen at press time, drawn selected (that is what the
                    // tap made it).
                    armDay(SHARED_ELEMENTS.calendarDay, cellRefs.current[cell.date], (
                      <View style={{ flex: 1, borderRadius: RADIUS.inner, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.lime, backgroundColor: cellBg }}>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: isToday ? txt(C, C.lime) : C.chalk }}>{Number(cell.date.slice(8, 10))}</Text>
                        {day ? <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.nano, color: C.onAccent, backgroundColor: C.lime, borderRadius: 4, paddingHorizontal: 3, marginTop: 1 }}>{day.count}</Text> : null}
                      </View>
                    ));
                  }
                  setSelected(cell.date);
                }} style={{ flex: 1, aspectRatio: 1, margin: 2, borderRadius: RADIUS.inner, alignItems: "center", justifyContent: "center", opacity: cell.inMonth ? 1 : 0.35, borderWidth: 1, borderColor: isSel ? C.lime : isToday ? withAlpha(C.lime, ALPHA.rim) : C.line, backgroundColor: cellBg }}>
                  {asg ? (
                    <View style={{ position: "absolute", top: 3, right: 3, flexDirection: "row", gap: 2 }}>
                      <View style={{ width: 5, height: 5, borderRadius: RADIUS.mark, backgroundColor: C.blue }} />
                    </View>
                  ) : null}
                  <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: isToday ? txt(C, C.lime) : C.chalk }}>{Number(cell.date.slice(8, 10))}</Text>
                  {day ? <Text maxFontSizeMultiplier={FIXED_FONT_SCALE} style={{ fontFamily: F.bold, fontSize: fs.nano, color: C.onAccent, backgroundColor: C.lime, borderRadius: 4, paddingHorizontal: 3, marginTop: 1 }}>{day.count}</Text> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 10 }}>
          {t("w.analyze.cal.legendPre")} <Text style={{ color: txt(C, C.blue) }}>●</Text> {t("w.analyze.cal.legendAssigned")}
        </Text>
      </ACard>

      {/* key={selected}: the destination hook claims once per mount, so the
          detail section must be a fresh mount for each day it describes. */}
      <DayDetail key={selected}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: tracking.caps, color: txt(C, C.lime), marginTop: 8, marginBottom: 8 }}>
        {new Date(`${selected}T00:00:00.000Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}
      </Text>

      {selAssignments.map((a) => (
        <ACard key={a.id} style={{ marginBottom: 12 }}>
          {chip(C.blue, t("w.analyze.cal.assigned"))}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm, marginTop: 6 }}>
            <Text style={{ flex: 1, fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{a.name}</Text>
            {a.status === "completed" ? chip(C.lime, t("w.analyze.cal.done")) : (
              <Pressable accessibilityRole="button" accessibilityLabel={t("w.analyze.cal.markDone")} onPress={() => markDone(a.id)} style={{ backgroundColor: withAlpha(C.lime, ALPHA.solid), borderWidth: 1, borderColor: withAlpha(C.lime, ALPHA.rim), borderRadius: RADIUS.pill, paddingHorizontal: 12, paddingVertical: 6 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, C.lime) }}>{t("w.analyze.cal.markDone")}</Text>
              </Pressable>
            )}
          </View>
        </ACard>
      ))}

      {selSessions.length === 0 && selAssignments.length === 0 ? (
        <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash }}>{t("w.analyze.cal.nothing")}</Text>
      ) : selSessions.map((s) => (
        <ACard key={s.id} style={{ marginBottom: 12 }}>
          <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{s.title}</Text>
          <Text style={{ fontFamily: F.mono, fontSize: fs.caption, color: C.ash, marginTop: 4 }}>{sessionVolume(s.blocks, false, bw(s.startedAt)).toLocaleString()} kg – {s.blocks.length} {t("w.analyze.cal.blocks")}</Text>
        </ACard>
      ))}
      </DayDetail>
    </AuroraScreen>
  );
}

/** The destination frame of the calendarDay pair — the whole detail section,
 *  so the tapped cell is seen growing into the region its contents land in.
 *  A plain wrapper because ACard doesn't forward a ref, and the frame is the
 *  section, not any one card. */
function DayDetail({ children }: { children: ReactNode }) {
  const { ref } = useSharedSurfaceTarget(SHARED_ELEMENTS.calendarDay);
  return <View ref={ref} collapsable={false}>{children}</View>;
}
