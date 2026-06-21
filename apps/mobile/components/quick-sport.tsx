import { useState } from "react";
import { View, Text, TextInput, Pressable, ScrollView } from "react-native";
import {
  OLYMPIC_SPORT_NAMES,
  OLYMPIC_SPORTS,
  sportTracksDistance,
  sportDistanceUnit,
  parseSportDistance,
  cardioPace,
} from "@hybrid/core";
import { createSession } from "../lib/api";
import { saveGuestSession } from "../lib/guest";
import { useSession } from "../lib/session";
import { useLang } from "../lib/i18n";
import { fs, space, Card, Mono, F } from "../lib/ui";
import { useTheme, txt } from "../lib/theme";

/**
 * Home-screen quick-log widget — pick a sport, enter time (+ distance for
 * distance sports), tap Log. Saves a real session straight away (one cardio
 * activity named after the sport) so "back from a run → log it → done" never
 * leaves Home. Distance is entered in the sport's natural unit (metres for
 * swimming/rowing); storage stays km. No wearable needed.
 */
export default function QuickSportLog({ onSaved }: { onSaved?: () => void }) {
  const C = useTheme().palette;
  const { t } = useLang();
  const { session } = useSession();
  const guest = !session;
  const [sport, setSport] = useState("Running");
  const [minutes, setMinutes] = useState("");
  const [distance, setDistance] = useState(""); // in the sport's unit
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const tracksDist = sportTracksDistance(sport);
  const km = parseSportDistance(distance, sport);
  const pace = cardioPace({ name: sport, distance: km, minutes: parseFloat(minutes) });

  const field = {
    fontFamily: F.mono,
    fontSize: fs.bodyLg,
    color: C.chalk,
    backgroundColor: C.ink2,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  } as const;

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
    <Card style={{ borderLeftWidth: 3, borderLeftColor: C.blue, marginTop: 16 }}>
      <Text style={{ fontFamily: F.mono, fontSize: fs.micro, textTransform: "uppercase", letterSpacing: 1.2, color: txt(C, C.blue) }}>
        {t("quickSport.title")}
      </Text>
      <Mono style={{ fontSize: fs.micro, marginTop: 2 }}>{t("quickSport.sub")}</Mono>

      {/* Sport chips — horizontally scrollable; defaults to Running. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -2 }} contentContainerStyle={{ gap: space.sm, paddingHorizontal: 2 }}>
        {OLYMPIC_SPORT_NAMES.map((name) => {
          const on = name === sport;
          return (
            <Pressable
              key={name}
              onPress={() => setSport(name)}
              style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: on ? C.blue : C.line, backgroundColor: on ? `${C.blue}22` : C.ink2 }}
            >
              <Text style={{ fontSize: fs.body }}>{OLYMPIC_SPORTS[name]!.icon}</Text>
              <Text style={{ fontFamily: F.semi, fontSize: fs.body, color: on ? txt(C, C.blue) : C.ash }}>{name}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: space.sm, alignItems: "flex-end", marginTop: 12 }}>
        {tracksDist && (
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginBottom: 4 }}>
              {sportDistanceUnit(sport) === "m" ? "DIST (M)" : "DIST (KM)"}
            </Text>
            <TextInput value={distance} onChangeText={setDistance} keyboardType="numeric" placeholder={sportDistanceUnit(sport) === "m" ? "400" : "8"} placeholderTextColor={C.ash} style={field} />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: F.mono, fontSize: 9, color: C.ash, letterSpacing: 1, marginBottom: 4 }}>MIN</Text>
          <TextInput value={minutes} onChangeText={setMinutes} keyboardType="numeric" placeholder="45" placeholderTextColor={C.ash} style={field} />
        </View>
        <Pressable
          onPress={save}
          disabled={saving}
          style={{ backgroundColor: C.lime, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22, opacity: saving ? 0.5 : 1 }}
        >
          <Text style={{ fontFamily: F.black, fontSize: fs.note, color: C.ink }}>{saving ? "…" : t("quickSport.log")}</Text>
        </Pressable>
      </View>

      {(pace || msg) && (
        <Text style={{ fontFamily: F.mono, fontSize: fs.caption, marginTop: 8, color: msg.startsWith("✓") ? txt(C, C.lime) : pace ? txt(C, C.blue) : C.ash }}>
          {msg || `${t("workout.pace")} ${pace}`}
        </Text>
      )}
    </Card>
  );
}
