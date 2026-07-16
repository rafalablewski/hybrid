import { useEffect, useMemo, useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import { optimizeForEvent, localDayKey } from "@hybrid/core";
import { fetchEvents, createEvent, type EventRow } from "../../lib/api";
import { useLang } from "../../lib/i18n";
import { fs, space, F } from "../../lib/ui";
import { useTheme, txt } from "../../lib/theme";
import { ABack, AuroraScreen, ACard, APill, AHeading, RADIUS } from "./kit";

const SPORTS = ["Hyrox", "Triathlon", "Running", "Marathon", "CrossFit", "Powerlifting", "Cycling", "Swimming", "Hybrid"];
const plus8w = () => localDayKey(Date.now() + 56 * 86_400_000);
const fmt = (d: string) => new Date(d).toLocaleDateString();

/** AURORA Competition — peaking optimizer; back-solves the season so form
 *  peaks on the event day, reusing optimizeForEvent + the events API. */
export default function AuroraCompetition() {
  const { palette: C } = useTheme();
  const { t } = useLang();
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

  const fieldStyle = { fontFamily: F.mono, fontSize: fs.note, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: RADIUS.field, padding: 14 } as const;

  return (
    <AuroraScreen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginBottom: 8 }}>
        <ABack />
        <AHeading style={{ fontSize: fs.display }}>{t("w.account.upgrade.competition")}</AHeading>
      </View>
      <Text style={{ fontFamily: F.reg, fontSize: fs.bodyLg, color: C.ash, marginTop: 8, lineHeight: 20 }}>{t("w.train.comp.intro")}</Text>

      <ACard style={{ marginTop: 16 }}>
        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.lime) }}>{t("w.train.comp.addEvent")}</Text>
        <TextInput value={name} onChangeText={setName} placeholder={t("w.train.comp.eventName")} placeholderTextColor={C.ash} style={[fieldStyle, { marginTop: 10 }]} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
          <View style={{ flexDirection: "row", gap: space.xs }}>
            {SPORTS.map((s) => (
              <Pressable key={s} onPress={() => setSport(s)} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: RADIUS.pill, borderWidth: 1, borderColor: sport === s ? C.lime : C.line, backgroundColor: sport === s ? `${C.lime}1f` : C.ink }}>
                <Text style={{ fontFamily: F.semi, fontSize: fs.caption, color: sport === s ? txt(C, C.lime) : C.ash }}>{s}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <View style={{ flexDirection: "row", gap: space.ms, marginTop: 12, alignItems: "flex-end" }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginBottom: 4 }}>{t("w.train.comp.dateLabel")}</Text>
            <TextInput value={date} onChangeText={setDate} placeholder="2026-09-01" placeholderTextColor={C.ash} autoCapitalize="none" style={fieldStyle} />
          </View>
          <View style={{ width: 120 }}><APill label={busy ? "…" : t("common.add")} onPress={add} disabled={busy} style={{ paddingVertical: 14 }} /></View>
        </View>
      </ACard>

      {events.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
          <View style={{ flexDirection: "row", gap: space.sm }}>
            {events.map((e) => (
              <Pressable key={e.id} onPress={() => setSelected(e.id)} style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: RADIUS.field, borderWidth: 1, borderColor: selected === e.id ? C.lime : C.line, backgroundColor: selected === e.id ? `${C.lime}1f` : C.ink2 }}>
                <Text style={{ fontFamily: F.bold, fontSize: fs.body, color: selected === e.id ? txt(C, C.lime) : C.chalk }}>{e.name}</Text>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash }}>{fmt(e.date)}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}

      {plan && event && (
        <>
          <ACard style={{ marginTop: 14 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{event.name} – {event.sport}</Text>
              <View style={{ backgroundColor: `${plan.landsPeak ? C.lime : C.amber}1f`, borderRadius: RADIUS.pill, paddingHorizontal: 11, paddingVertical: 4 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: txt(C, plan.landsPeak ? C.lime : C.amber) }}>{plan.landsPeak ? t("w.train.comp.peakLands") : `${t("w.train.comp.peakAtWeek")} ${plan.peakWeek}`}</Text>
              </View>
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.chalk, marginTop: 8 }}>{plan.weeksToEvent} {t("w.train.comp.weeksOut")} – {t("w.train.comp.formAtEvent")} {Math.round(plan.formAtEvent)}</Text>
            <View style={{ flexDirection: "row", gap: 3, height: 12, borderRadius: 6, overflow: "hidden", marginTop: 12 }}>
              {plan.macro.blocks.map((b) => (
                <View key={b.key} style={{ flex: b.weeks, backgroundColor: b.color }} />
              ))}
            </View>
          </ACard>

          <ACard style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: C.ash }}>{t("w.train.comp.projection")}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash, marginTop: 2 }}>{t("w.train.comp.formNote")}</Text>
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 96, marginTop: 12 }}>
              {plan.series.map((p) => {
                const h = Math.max(2, ((p.form - minF) / (maxF - minF || 1)) * 90);
                const isPeak = p.week === plan.peakWeek;
                return <View key={p.week} style={{ flex: 1, height: h, backgroundColor: isPeak ? C.lime : `${C.blue}99`, borderRadius: 3 }} />;
              })}
            </View>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, marginTop: 6 }}>{t("w.train.comp.projectionCaption")}</Text>
          </ACard>
        </>
      )}
      <View style={{ height: 16 }} />
    </AuroraScreen>
  );
}
