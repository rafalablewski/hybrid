import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { optimizeForEvent } from "@hybrid/core";
import { fetchEvents, createEvent, type EventRow } from "../lib/api";
import { Screen, Card, Kicker, Mono, H1, Chip, Button, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

const SPORTS = ["Hyrox", "Triathlon", "Running", "Marathon", "CrossFit", "Powerlifting", "Cycling", "Swimming", "Hybrid"];
const plus8w = () => new Date(Date.now() + 56 * 86_400_000).toISOString().slice(0, 10);
const fmt = (d: string) => new Date(d).toLocaleDateString();

/** Competition — set an event date and the peaking optimizer back-solves the
 *  season so form peaks on the day. Mobile port. */
export default function Competition() {
  const C = useTheme().palette;
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sport, setSport] = useState(SPORTS[0]!);
  const [date, setDate] = useState(plus8w());
  const [busy, setBusy] = useState(false);

  const load = () => fetchEvents().then((e) => { setEvents(e); setSelected((s) => s ?? e[0]?.id ?? null); });
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim() || Number.isNaN(Date.parse(date))) return;
    setBusy(true);
    const ev = await createEvent(name.trim(), sport, date);
    setBusy(false);
    if (ev) { setName(""); await load(); setSelected(ev.id); }
  };

  const event = events.find((e) => e.id === selected) ?? null;
  const plan = useMemo(() => (event ? optimizeForEvent(event.sport, event.date) : null), [event]);

  const forms = plan?.series.map((p) => p.form) ?? [];
  const minF = Math.min(0, ...forms);
  const maxF = Math.max(1, ...forms);

  return (
    <Screen>
      <Kicker>Competition</Kicker>
      <H1>Peak on the day</H1>
      <Mono style={{ marginTop: 6, lineHeight: 18 }}>Set an event and the optimizer back-solves your season so form peaks on it — finals, not heats.</Mono>

      {/* create event */}
      <Card style={{ marginTop: 14 }}>
        <Kicker color={C.lime}>Add an event</Kicker>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Event name"
          placeholderTextColor={C.ash}
          style={{ fontFamily: F.mono, fontSize: 15, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12, marginTop: 10 }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {SPORTS.map((s) => (
              <Pressable key={s} onPress={() => setSport(s)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1, borderColor: sport === s ? C.lime : C.line, backgroundColor: sport === s ? `${C.lime}1a` : "transparent" }}>
                <Text style={{ fontFamily: F.semi, fontSize: 12, color: sport === s ? txt(C, C.lime) : C.ash }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 10, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Mono color={C.ash} style={{ fontSize: 10, marginBottom: 4 }}>Date (YYYY-MM-DD)</Mono>
            <TextInput value={date} onChangeText={setDate} placeholder="2026-09-01" placeholderTextColor={C.ash} autoCapitalize="none"
              style={{ fontFamily: F.mono, fontSize: 15, color: C.chalk, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 10, padding: 12 }} />
          </View>
          <View style={{ width: 110 }}><Button label={busy ? "…" : "Add"} onPress={add} disabled={busy} /></View>
        </View>
      </Card>

      {/* event tabs */}
      {events.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {events.map((e) => (
              <Pressable key={e.id} onPress={() => setSelected(e.id)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: selected === e.id ? C.violet : C.line, backgroundColor: selected === e.id ? `${C.violet}1a` : "transparent" }}>
                <Text style={{ fontFamily: F.bold, fontSize: 13, color: selected === e.id ? txt(C, C.violet) : C.chalk }}>{e.name}</Text>
                <Mono color={C.ash} style={{ fontSize: 10 }}>{fmt(e.date)}</Mono>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {plan && event && (
        <>
          <Card style={{ borderLeftWidth: 3, borderLeftColor: C.amber, marginTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Kicker color={C.amber}>{event.name} · {event.sport}</Kicker>
              <Chip color={plan.landsPeak ? C.lime : C.amber}>{plan.landsPeak ? "peak lands ✓" : `peak wk ${plan.peakWeek}`}</Chip>
            </View>
            <Mono color={C.chalk} style={{ marginTop: 6 }}>{plan.weeksToEvent} weeks out · form at event {Math.round(plan.formAtEvent)}</Mono>
            <View style={{ flexDirection: "row", gap: 3, height: 12, borderRadius: 6, overflow: "hidden", marginTop: 12 }}>
              {plan.macro.blocks.map((b) => (
                <View key={b.key} style={{ flex: b.weeks, backgroundColor: b.color }} />
              ))}
            </View>
          </Card>

          <Card style={{ marginTop: 14 }}>
            <Kicker>Form projection</Kicker>
            <Mono color={C.ash} style={{ fontSize: 11, marginTop: 2 }}>fitness − fatigue → form, peaking toward the event.</Mono>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 96, marginTop: 12 }}>
              {plan.series.map((p) => {
                const h = Math.max(2, ((p.form - minF) / (maxF - minF || 1)) * 90);
                const isPeak = p.week === plan.peakWeek;
                return <View key={p.week} style={{ flex: 1, height: h, backgroundColor: isPeak ? C.lime : `${C.blue}99`, borderRadius: 2 }} />;
              })}
            </View>
            <Mono color={C.ash} style={{ fontSize: 10, marginTop: 6 }}>wk 1 → event (peak week in lime)</Mono>
          </Card>
        </>
      )}
      <View style={{ height: 16 }} />
    </Screen>
  );
}
