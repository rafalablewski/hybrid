import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal } from "react-native";
import {
  olympicSport,
  olympicSportsByCategory,
  suggestedSports,
  sportTracksDistance,
  sportDistanceUnit,
  parseSportDistance,
  cardioPace,
  type LoggedSession,
} from "@hybrid/core";
import { createSession } from "../lib/api";
import { saveGuestSession } from "../lib/guest";
import { useSession } from "../lib/session";
import { useLang } from "../lib/i18n";
import { fs, space, Card, Mono, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { AuroraIcon } from "./aurora/icons";

/**
 * Home-screen quick-log widget — pick a sport, enter time (+ distance for
 * distance sports), tap Log. Saves a real session straight away (one cardio
 * activity named after the sport) so "back from a run → log it → done" never
 * leaves Home. Distance is entered in the sport's natural unit (metres for
 * swimming/rowing); storage stays km. No wearable needed.
 */
export default function QuickSportLog({ sessions = [], onSaved }: { sessions?: LoggedSession[]; onSaved?: () => void }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const { session } = useSession();
  const guest = !session;
  const suggested = suggestedSports(sessions);
  // Until the athlete picks, track the top suggestion — which only resolves once
  // `sessions` has loaded (empty on first mount), so a computed state default
  // would freeze on "Running".
  const [picked, setPicked] = useState<string | null>(null);
  const sport = picked ?? suggested[0] ?? "Running";
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [minutes, setMinutes] = useState("");
  const [distance, setDistance] = useState(""); // in the sport's unit
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const sportMeta = olympicSport(sport);
  const pickSport = (name: string) => {
    setPicked(name);
    setPickerOpen(false);
    setQuery("");
    setMsg("");
  };

  const tracksDist = sportTracksDistance(sport);
  const km = parseSportDistance(distance, sport);
  const pace = cardioPace({ name: sport, distance: km, minutes: parseFloat(minutes) });

  const field = {
    fontFamily: F.mono,
    fontSize: fs.bodyLg,
    color: C.chalk,
    backgroundColor: C.ink,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  } as const;

  // The categorised catalog, live-filtered by the search query — categories with
  // no matching sports drop out so the list stays scannable.
  const q = query.trim().toLowerCase();
  const filtered = olympicSportsByCategory()
    .map((g) => ({ ...g, sports: q ? g.sports.filter((s) => s.name.toLowerCase().includes(q)) : g.sports }))
    .filter((g) => g.sports.length > 0);

  const save = async () => {
    const mins = parseFloat(minutes);
    if (!Number.isFinite(mins) && km == null) {
      setMsg(t("quickSport.needValue"));
      return;
    }
    setSaving(true);
    setMsg("");
    const now = new Date().toISOString();
    const payload = {
      title: sport,
      startedAt: now,
      completedAt: now,
      blocks: [
        {
          kind: "cardio" as const,
          name: sport,
          ...(km != null ? { distance: km } : {}),
          ...(Number.isFinite(mins) ? { minutes: mins } : {}),
        },
      ],
    };
    // Guests keep it on-device; signed-in saves to the API, falling back to a
    // local stash on a network hiccup (never lose the log).
    const ok = guest ? (await saveGuestSession(payload), true) : await createSession(payload);
    if (!ok) await saveGuestSession(payload);
    setSaving(false);
    setMinutes("");
    setDistance("");
    setMsg(`✓ ${t("quickSport.logged")} ${sport}`);
    onSaved?.();
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>
        {t("quickSport.title")}
      </Text>
      <Mono style={{ fontSize: fs.micro, marginTop: 2 }}>{t("quickSport.sub")}</Mono>

      {/* Sport selector — a field-styled trigger that opens the searchable sheet. */}
      <Pressable
        onPress={() => setPickerOpen(true)}
        style={{ flexDirection: "row", alignItems: "center", gap: space.ms, marginTop: 14, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 13, paddingVertical: 12 }}
      >
        {!!sportMeta && <Text style={{ fontSize: fs.subtitle }}>{sportMeta.icon}</Text>}
        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{sport}</Text>
        <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: C.ash }}>▾</Text>
      </Pressable>

      {/* Full-screen searchable sport chooser (RpeHelpModal pattern, full-screen). */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable onPress={() => setPickerOpen(false)} style={{ flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }}>
          <Pressable onPress={() => {}} style={{ flex: 1, marginTop: 64, backgroundColor: C.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line, paddingTop: 20, paddingHorizontal: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.home.quickSport.choose")}</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.home.quickSport.close")}</Text>
              </Pressable>
            </View>

            {/* Search row — the canonical exercises.tsx icon + TextInput pattern. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14 }}>
              <AuroraIcon name="search" size={18} color={C.ash} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={t("w.home.quickSport.search")}
                placeholderTextColor={C.ash}
                autoFocus
                style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, paddingVertical: 12 }}
              />
            </View>

            <ScrollView style={{ flex: 1, marginTop: 6 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8, paddingBottom: 28 }}>
              {filtered.map((g) => (
                <View key={g.category} style={{ marginBottom: 6 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1.4, marginTop: 10, marginBottom: 4 }}>{g.category}</Text>
                  {g.sports.map((s) => {
                    const on = s.name === sport;
                    const hint = sportTracksDistance(s.name) ? sportDistanceUnit(s.name) : g.category;
                    return (
                      <Pressable
                        key={s.name}
                        onPress={() => pickSport(s.name)}
                        style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 11, paddingHorizontal: 4 }}
                      >
                        <Text style={{ fontSize: fs.subtitle, width: 22, textAlign: "center" }}>{s.icon}</Text>
                        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: on ? txt(C, C.blue) : C.chalk }}>{s.name}</Text>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{hint}</Text>
                        {on && <AuroraIcon name="check" size={16} color={txt(C, C.blue)} />}
                      </Pressable>
                    );
                  })}
                </View>
              ))}
              {filtered.length === 0 && (
                <Text style={{ fontFamily: F.reg, fontSize: fs.body, color: C.ash, textAlign: "center", marginTop: 28 }}>No sports match “{query}”.</Text>
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* divider */}
      <View style={{ height: 1, backgroundColor: C.line, marginVertical: 16 }} />

      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end" }}>
        {tracksDist && (
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>
              {sportDistanceUnit(sport) === "m" ? t("workout.distM") : t("workout.dist")}
            </Text>
            <TextInput value={distance} onChangeText={setDistance} keyboardType="numeric" placeholder={sportDistanceUnit(sport) === "m" ? "400" : "8"} placeholderTextColor={C.ash} style={field} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Minutes</Text>
          <TextInput value={minutes} onChangeText={setMinutes} keyboardType="numeric" placeholder="45" placeholderTextColor={C.ash} style={field} />
        </View>
        <Pressable
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: C.lime, borderRadius: 10, paddingVertical: 13, paddingHorizontal: 22, opacity: saving ? 0.5 : 1 }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.ink }}>{saving ? "…" : t("quickSport.log")}</Text>
        </Pressable>
      </View>

      {(pace || msg) && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, marginTop: 10, color: msg.startsWith("✓") ? txt(C, C.lime) : pace ? txt(C, C.blue) : C.ash }}>
          {msg || `${t("workout.pace")} ${pace}`}
        </Text>
      )}
    </Card>
  );
}
