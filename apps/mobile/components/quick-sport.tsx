import { useState, useMemo } from "react";
import { View, Text, TextInput, Pressable, ScrollView, Modal, KeyboardAvoidingView, Platform } from "react-native";
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
import { fs, space, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";
import { AuroraIcon } from "./aurora/icons";
import { RADIUS } from "./aurora/kit";

/**
 * Home quick-log — a horizontal CAROUSEL of one-tap sport cards (likely sports +
 * an "Other" card). Tapping a card opens a small sheet to enter time (+ distance
 * for distance sports) and Log, which saves a real cardio session straight away
 * so "back from a run → tap → log → done" never leaves Home. Mirrors the web
 * quick-sport.tsx carousel.
 */
// Carousel cards use punchy short labels (the sheet/log keeps the real sport
// name) — "Running" → "Run", "Cycling" → "Ride", etc.
const SHORT: Record<string, string> = { Running: "Run", Cycling: "Ride", Swimming: "Swim", Rowing: "Row", Walking: "Walk", Hiking: "Hike" };
const shortSport = (name: string) => SHORT[name] ?? name;

export default function QuickSportLog({ sessions = [], onSaved }: { sessions?: LoggedSession[]; onSaved?: () => void; solid?: boolean }) {
  const C = useTheme().palette;
  const { t } = useLang();

  const suggested = useMemo(() => {
    const seen = new Set<string>();
    return [...suggestedSports(sessions), "Running", "Cycling", "Swimming"].filter((n) => (seen.has(n) ? false : (seen.add(n), true))).slice(0, 4);
  }, [sessions]);

  const [sheetSport, setSheetSport] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return olympicSportsByCategory()
      .map((g) => ({ ...g, sports: q ? g.sports.filter((s) => s.name.toLowerCase().includes(q)) : g.sports }))
      .filter((g) => g.sports.length > 0);
  }, [query]);

  const card = { flexGrow: 1, flexBasis: "45%", backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 18, padding: 16 } as const;

  return (
    <>
      {/* 2×2 grid of one-tap sport cards */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {suggested.map((name) => (
          <Pressable key={name} onPress={() => setSheetSport(name)} style={card}>
            <Text style={{ fontSize: 26 }}>{olympicSport(name)?.icon ?? "🏃"}</Text>
            <Text style={{ fontFamily: F.black, fontSize: fs.subtitle, color: C.chalk, marginTop: 8 }}>{shortSport(name)}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1, marginTop: 4 }}>{t("w.home.today.w.tapLog")}</Text>
          </Pressable>
        ))}
      </View>
      {/* Other — a full-width tile that opens the searchable picker for any sport */}
      <Pressable onPress={() => setPickerOpen(true)} style={{ marginTop: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 18, paddingVertical: 15 }}>
        <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: txt(C, C.lime) }}>＋</Text>
        <Text style={{ fontFamily: F.bold, fontSize: fs.note, color: C.chalk }}>{t("w.home.quickSport.other")}</Text>
      </Pressable>

      {/* Searchable sport chooser → hands the pick to the log sheet */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable onPress={() => setPickerOpen(false)} style={{ flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }}>
          <Pressable onPress={() => {}} style={{ flex: 1, marginTop: 64, backgroundColor: C.ink, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line, paddingTop: 20, paddingHorizontal: 20 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{t("w.home.quickSport.choose")}</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={10}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.home.quickSport.close")}</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms, backgroundColor: C.ink2, borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14 }}>
              <AuroraIcon name="search" size={18} color={C.ash} />
              <TextInput value={query} onChangeText={setQuery} placeholder={t("w.home.quickSport.search")} placeholderTextColor={C.ash} autoFocus style={{ flex: 1, fontFamily: F.reg, fontSize: fs.bodyLg, color: C.chalk, paddingVertical: 12 }} />
            </View>
            <ScrollView style={{ flex: 1, marginTop: 6 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingVertical: 8, paddingBottom: 28 }}>
              {filtered.map((g) => (
                <View key={g.category} style={{ marginBottom: 6 }}>
                  <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 1.4, marginTop: 10, marginBottom: 4 }}>{g.category}</Text>
                  {g.sports.map((s) => {
                    const hint = sportTracksDistance(s.name) ? sportDistanceUnit(s.name) : g.category;
                    return (
                      <Pressable key={s.name} onPress={() => { setPickerOpen(false); setQuery(""); setSheetSport(s.name); }} style={{ flexDirection: "row", alignItems: "center", gap: space.ms, paddingVertical: 11, paddingHorizontal: 4 }}>
                        <Text style={{ fontSize: fs.subtitle, width: 22, textAlign: "center" }}>{s.icon}</Text>
                        <Text style={{ flex: 1, fontFamily: F.semi, fontSize: fs.bodyLg, color: C.chalk }}>{s.name}</Text>
                        <Text style={{ fontFamily: F.mono, fontSize: fs.micro, color: C.ash }}>{hint}</Text>
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
        </KeyboardAvoidingView>
      </Modal>

      {/* Log sheet — minutes (+ distance) and Log, for the chosen sport */}
      <LogSheet sport={sheetSport} onClose={() => setSheetSport(null)} onSaved={() => { setSheetSport(null); onSaved?.(); }} />
    </>
  );
}

function LogSheet({ sport, onClose, onSaved }: { sport: string | null; onClose: () => void; onSaved: () => void }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const { session } = useSession();
  const guest = !session;
  const [minutes, setMinutes] = useState("");
  const [distance, setDistance] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const name = sport ?? "";
  const meta = olympicSport(name);
  const tracksDist = name ? sportTracksDistance(name) : false;
  const km = parseSportDistance(distance, name);
  const pace = cardioPace({ name, distance: km, minutes: parseFloat(minutes) });

  const field = { fontFamily: F.mono, fontSize: fs.bodyLg, color: C.chalk, backgroundColor: C.ink, borderWidth: 1, borderColor: C.line, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11 } as const;

  const close = () => { setMinutes(""); setDistance(""); setMsg(""); onClose(); };

  const save = async () => {
    const mins = parseFloat(minutes);
    if (!Number.isFinite(mins) && km == null) { setMsg(t("quickSport.needValue")); return; }
    setSaving(true); setMsg("");
    const now = new Date().toISOString();
    const payload = { title: name, startedAt: now, completedAt: now, blocks: [{ kind: "cardio" as const, name, ...(km != null ? { distance: km } : {}), ...(Number.isFinite(mins) ? { minutes: mins } : {}) }] };
    const ok = guest ? (await saveGuestSession(payload), true) : await createSession(payload);
    if (!ok) await saveGuestSession(payload);
    setSaving(false);
    setMinutes(""); setDistance("");
    onSaved();
  };

  return (
    <Modal visible={!!sport} transparent animationType="slide" onRequestClose={close}>
      {/* Lift the panel above the numeric keyboard — its inputs autofocus and sit
          at the very bottom, so without this the keyboard covers them entirely. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Pressable onPress={close} style={{ flex: 1, backgroundColor: "#0009", justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} style={{ backgroundColor: C.ink2, borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderColor: C.line, padding: 20, paddingBottom: 34 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.ms }}>
            {!!meta && <Text style={{ fontSize: fs.heading }}>{meta.icon}</Text>}
            <Text style={{ flex: 1, fontFamily: F.black, fontSize: fs.title, color: C.chalk }}>{name}</Text>
            <Pressable onPress={close} hitSlop={10}><Text style={{ fontFamily: F.mono, fontSize: fs.body, color: C.ash }}>{t("w.home.quickSport.close")}</Text></Pressable>
          </View>
          <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end", marginTop: 16 }}>
            {tracksDist && (
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>{sportDistanceUnit(name) === "m" ? t("workout.distM") : t("workout.dist")}</Text>
                <TextInput value={distance} onChangeText={setDistance} keyboardType="numeric" placeholder={sportDistanceUnit(name) === "m" ? "400" : "8"} placeholderTextColor={C.ash} autoFocus style={field} />
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.mono, fontSize: fs.nano, color: C.ash, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 6 }}>Minutes</Text>
              <TextInput value={minutes} onChangeText={setMinutes} keyboardType="numeric" placeholder="45" placeholderTextColor={C.ash} autoFocus={!tracksDist} style={field} />
            </View>
            <Pressable onPress={save} disabled={saving} style={{ backgroundColor: C.lime, borderRadius: RADIUS.pill, paddingVertical: 13, paddingHorizontal: 22, opacity: saving ? 0.5 : 1 }}>
              <Text style={{ fontFamily: F.black, fontSize: fs.bodyLg, color: C.onAccent }}>{saving ? "…" : t("quickSport.log")}</Text>
            </Pressable>
          </View>
          {(pace || msg) && (
            <Text accessibilityLiveRegion={msg ? "polite" : "none"} style={{ fontFamily: F.mono, fontSize: fs.caption, marginTop: 10, color: msg ? C.ash : txt(C, C.lime) }}>
              {msg || `${t("workout.pace")} ${pace}`}
            </Text>
          )}
        </Pressable>
      </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
